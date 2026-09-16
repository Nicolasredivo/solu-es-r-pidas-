/* ===================================================================
   Movimento da landing page.

   Regras que valem pra tudo aqui:
   - só anima transform/opacity (o resto obriga o navegador a recalcular
     layout e engasga no celular);
   - o scroll nunca faz conta pesada: só marca que precisa redesenhar e
     deixa o requestAnimationFrame resolver no frame certo;
   - quem pediu menos movimento no aparelho não recebe animação nenhuma.
   =================================================================== */

(function () {
  "use strict";

  const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Ano no rodapé ---------- */
  const anoEl = document.getElementById("ano");
  if (anoEl) anoEl.textContent = String(new Date().getFullYear());


  /* ---------- Cabeçalho ganha fundo depois que sai do topo ---------- */
  const cabecalho = document.getElementById("cabecalho");
  const camadas = Array.from(document.querySelectorAll("[data-parallax]"));

  let precisaDesenhar = false;

  function aoRolar() {
    const y = window.scrollY || window.pageYOffset;

    if (cabecalho) cabecalho.classList.toggle("preso", y > 12);

    // Parallax: cada camada anda uma fração do scroll. Fração negativa
    // sobe enquanto a página desce -- é o que dá sensação de profundidade.
    if (!menosMovimento) {
      for (const camada of camadas) {
        const fator = parseFloat(camada.dataset.parallax) || 0;
        camada.style.setProperty("--desloca", (y * fator).toFixed(1) + "px");
      }
    }

    precisaDesenhar = false;
  }

  function agendarDesenho() {
    if (precisaDesenhar) return;
    precisaDesenhar = true;
    window.requestAnimationFrame(aoRolar);
  }

  window.addEventListener("scroll", agendarDesenho, { passive: true });
  aoRolar();

  /* ---------- Revelação no scroll, com leve escalonamento ---------- */

  const paraRevelar = Array.from(document.querySelectorAll(".revelar"));

  if (menosMovimento || !("IntersectionObserver" in window)) {
    // Sem observador (ou sem vontade de animação): tudo já nasce visível.
    paraRevelar.forEach((el) => el.classList.add("visivel"));
  } else {
    const observador = new IntersectionObserver(
      (entradas) => {
        // Os itens que entram juntos aparecem em cascata curta, na ordem
        // em que estão na tela -- não todos de uma vez, nem um por um
        // devagar a ponto de irritar.
        const visiveis = entradas.filter((e) => e.isIntersecting);
        visiveis.forEach((entrada, i) => {
          const el = entrada.target;
          setTimeout(() => el.classList.add("visivel"), Math.min(i, 6) * 85);
          observador.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    paraRevelar.forEach((el) => observador.observe(el));
  }

  /* ---------- Contadores dos números ---------- */

  const contadores = Array.from(document.querySelectorAll(".contador"));

  function contar(el) {
    const ate = Number(el.dataset.ate) || 0;
    if (menosMovimento) {
      el.textContent = String(ate);
      return;
    }

    const duracao = 1500;
    const inicio = performance.now();

    function passo(agora) {
      const t = Math.min(1, (agora - inicio) / duracao);
      // Desacelera no fim: o número "assenta" em vez de parar seco.
      const suave = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(ate * suave));
      if (t < 1) window.requestAnimationFrame(passo);
      else el.textContent = String(ate);
    }

    window.requestAnimationFrame(passo);
  }

  if (!("IntersectionObserver" in window)) {
    contadores.forEach((el) => (el.textContent = String(el.dataset.ate || 0)));
  } else {
    const obsNumeros = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return;
          contar(entrada.target);
          obsNumeros.unobserve(entrada.target);
        });
      },
      { threshold: 0.5 }
    );
    contadores.forEach((el) => obsNumeros.observe(el));
  }

  /* ---------- Palavra que troca na sobrancelha ---------- */

  const caixaCiclo = document.getElementById("ciclo");
  const palavras = ["condomínios", "empresas", "síndicos", "administradoras"];

  if (caixaCiclo && !menosMovimento) {
    let indice = 0;
    let atual = caixaCiclo.querySelector(".ciclo-item");

    setInterval(() => {
      indice = (indice + 1) % palavras.length;

      const nova = document.createElement("span");
      nova.className = "ciclo-item";
      nova.textContent = palavras[indice];
      caixaCiclo.appendChild(nova);

      // Um frame de intervalo: sem isso o navegador aplica a classe junto
      // com a inserção e não há transição nenhuma, só um corte seco.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          nova.classList.add("ativo");
          if (atual) {
            atual.classList.remove("ativo");
            atual.classList.add("saindo");
            const velha = atual;
            setTimeout(() => velha.remove(), 600);
          }
          atual = nova;
        });
      });
    }, 2600);
  }
})();
