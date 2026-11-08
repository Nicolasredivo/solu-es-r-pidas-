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

  const barraProgresso = document.getElementById("progresso-barra");

  // Ler scrollHeight obriga o navegador a recalcular o layout na hora, e isso
  // estava sendo feito a cada frame de rolagem. A altura da página só muda
  // quando a janela muda de tamanho ou quando algo é revelado, então basta
  // medir nessas horas e guardar o valor.
  let alturaRolavel = 0;
  function medirAlturaRolavel() {
    alturaRolavel = document.documentElement.scrollHeight - window.innerHeight;
  }
  medirAlturaRolavel();
  window.addEventListener("resize", medirAlturaRolavel);
  // A altura ainda muda depois do primeiro desenho: as fontes chegam da web e
  // reflem o texto. O observador cobre isso; o "load" é a rede de segurança
  // pra navegador sem ResizeObserver.
  if ("ResizeObserver" in window) {
    new ResizeObserver(medirAlturaRolavel).observe(document.body);
  }
  window.addEventListener("load", medirAlturaRolavel);

  function aoRolar() {
    const y = window.scrollY || window.pageYOffset;

    if (cabecalho) cabecalho.classList.toggle("preso", y > 12);

    // Quanto da página já passou. O máximo pode dar 0 numa tela muito alta
    // com pouco conteúdo -- dividir por zero deixaria a barra em NaN.
    if (barraProgresso) {
      const parte = alturaRolavel > 0 ? Math.min(1, Math.max(0, y / alturaRolavel)) : 0;
      barraProgresso.style.transform = "scaleX(" + parte.toFixed(4) + ")";
    }

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

  /* ---------- Pontos do prédio ---------- */

  const balao = document.getElementById("ponto-balao");
  const arte = document.querySelector(".hero-arte");
  const dicaArte = document.querySelector(".arte-dica");
  const pontos = Array.from(document.querySelectorAll(".ponto"));
  const redes = Array.from(document.querySelectorAll(".rede"));
  const janelas = Array.from(document.querySelectorAll(".janela"));
  const svgPredio = arte ? arte.querySelector(".arte-svg") : null;
  let pontoAberto = null;
  // Quem abriu o balão: o passeio automático ou a pessoa. O passeio nunca
  // troca nem fecha um balão que a pessoa abriu.
  let abertoPeloPasseio = false;

  const temMouse = window.matchMedia("(pointer: fine)").matches;

  // O convite muda conforme o aparelho: quem tem mouse não "toca".
  if (dicaArte && temMouse) {
    dicaArte.textContent = "Passe o mouse pelos pontos do prédio";
  }

  function mostrarPonto(ponto, peloPasseio) {
    if (!balao || !arte) return;

    abertoPeloPasseio = !!peloPasseio;
    pontos.forEach((p) => p.classList.toggle("aberto", p === ponto));
    pontoAberto = ponto;

    // Acende a rede daquele serviço (cano, fiação, caixa...) no desenho.
    const servico = ponto.dataset.servico || "";
    arte.dataset.servico = servico;
    redes.forEach((r) => r.classList.toggle("ativa", r.dataset.servico === servico));

    balao.innerHTML =
      "<strong></strong><span></span>";
    balao.querySelector("strong").textContent = ponto.dataset.titulo || "";
    balao.querySelector("span").textContent = ponto.dataset.texto || "";
    balao.style.setProperty("--cor-servico", ponto.dataset.cor || "");
    balao.classList.remove("hidden");

    // O ponto vive dentro de um SVG que escala: a posição só dá pra saber
    // medindo na tela, não pelas coordenadas do desenho.
    const alvo = ponto.querySelector(".ponto-alvo").getBoundingClientRect();
    const caixa = arte.getBoundingClientRect();
    const meioX = alvo.left + alvo.width / 2 - caixa.left;

    // Não deixa o balão escapar pelos lados da arte.
    const metade = balao.offsetWidth / 2;
    const margem = 6;
    const x = Math.min(Math.max(meioX, metade + margem), caixa.width - metade - margem);
    balao.style.left = x + "px";

    // Em cima do ponto por padrão; se não couber (ponto lá no alto), vai
    // pra baixo dele e o bico vira pro outro lado.
    // data-balao="abaixo": o ponto tem animação logo acima dele (a caixa
    // d'água no telhado) e o balão não pode tapar.
    const acima = alvo.top - caixa.top - 14;
    const cabeAcima = ponto.dataset.balao !== "abaixo" && acima - balao.offsetHeight > 0;
    balao.classList.toggle("abaixo", !cabeAcima);
    balao.style.top = cabeAcima
      ? acima + "px"
      : (alvo.bottom - caixa.top + 14) + "px";

    // O bico acompanha o balão quando ele foi empurrado pra dentro.
    balao.style.setProperty("--bico", (meioX - x) + "px");

    // Um frame depois, pra transição de opacidade acontecer de verdade.
    window.requestAnimationFrame(() => balao.classList.add("aparece"));
    if (dicaArte) dicaArte.classList.add("some");
  }

  function esconderPonto() {
    if (!balao) return;
    pontos.forEach((p) => p.classList.remove("aberto"));
    pontoAberto = null;
    abertoPeloPasseio = false;
    if (arte) delete arte.dataset.servico;
    redes.forEach((r) => r.classList.remove("ativa"));
    balao.classList.remove("aparece");
    setTimeout(() => {
      if (!pontoAberto) balao.classList.add("hidden");
    }, 220);
  }

  /* ---------- Passeio automático pelos serviços ---------- */
  // Sem ninguém mexendo, o prédio mostra sozinho um serviço de cada vez
  // (no celular é o que dá vida, já que não existe "passar o mouse"). Para
  // na hora em que a pessoa encosta na arte e volta um tempo depois.

  let pausaAte = 0;
  let mouseNaArte = false;
  let arteNaTela = false;
  let indicePasseio = -1;

  function pausarPasseio(ms) {
    pausaAte = Math.max(pausaAte, Date.now() + ms);
  }

  if (arte && pontos.length && !menosMovimento) {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (entradas) => { arteNaTela = entradas[0].isIntersecting; },
        { threshold: 0.35 }
      ).observe(arte);
    } else {
      arteNaTela = true;
    }

    // Dá tempo de ler o convite antes do primeiro serviço aparecer.
    pausarPasseio(2600);

    setInterval(() => {
      if (!arteNaTela || document.hidden || mouseNaArte) return;
      if (Date.now() < pausaAte) return;
      if (pontoAberto && !abertoPeloPasseio) return;
      indicePasseio = (indicePasseio + 1) % pontos.length;
      mostrarPonto(pontos[indicePasseio], true);
    }, 3200);
  }

  pontos.forEach((ponto) => {
    if (temMouse) {
      // Com mouse é só passar por cima. Sem o "clique também alterna" aqui
      // de propósito: no toque o pointerenter dispara ANTES do clique, e os
      // dois juntos abriam e fechavam o balão na mesma batida -- o toque
      // parecia não fazer nada.
      ponto.addEventListener("pointerenter", () => mostrarPonto(ponto));
      ponto.addEventListener("pointerleave", () => {
        if (pontoAberto === ponto) esconderPonto();
      });
    } else {
      ponto.addEventListener("click", (e) => {
        e.stopPropagation();
        pausarPasseio(9000);
        // Tocar no ponto que o passeio abriu "segura" ele, não fecha.
        if (pontoAberto === ponto && !abertoPeloPasseio) esconderPonto();
        else mostrarPonto(ponto);
      });
    }

    ponto.addEventListener("focus", () => mostrarPonto(ponto));
    ponto.addEventListener("blur", () => esconderPonto());
    // Teclado: o <g> do SVG não dispara clique com Enter/Espaço sozinho.
    ponto.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (pontoAberto === ponto && !abertoPeloPasseio) esconderPonto();
      else mostrarPonto(ponto);
    });
  });

  // Tocar fora fecha o balão (no celular não existe "tirar o mouse").
  document.addEventListener("click", () => {
    if (!pontoAberto) return;
    pausarPasseio(9000);
    esconderPonto();
  });

  if (arte && temMouse) {
    // Mouse entrou na arte: a pessoa assume e o passeio sai da frente.
    arte.addEventListener("pointerenter", () => {
      mouseNaArte = true;
      if (pontoAberto && abertoPeloPasseio) esconderPonto();
    });
    arte.addEventListener("pointerleave", () => {
      mouseNaArte = false;
      pausarPasseio(2500);
    });
  }

  /* ---------- Arte do hero inclina e acende janelas seguindo o mouse ---------- */

  const pontoFino = temMouse;

  // Janelas perto do mouse acendem, como uma lanterna passando pelo prédio.
  // A conta é feita nas coordenadas do desenho (o SVG escala com a tela).
  function acenderJanelas(clienteX, clienteY) {
    if (!svgPredio || !janelas.length) return;
    const matriz = svgPredio.getScreenCTM();
    if (!matriz) return;
    const p = new DOMPoint(clienteX, clienteY).matrixTransform(matriz.inverse());
    janelas.forEach((j) => {
      const cx = Number(j.getAttribute("x")) + 14;
      const cy = Number(j.getAttribute("y")) + 9;
      const luz = Math.max(0, 1 - Math.hypot(p.x - cx, p.y - cy) / 90);
      j.style.setProperty("--luz", luz.toFixed(2));
    });
  }

  if (arte && pontoFino && !menosMovimento) {
    let inclinacaoAgendada = false;
    let ultimoEvento = null;

    function aplicarInclinacao() {
      inclinacaoAgendada = false;
      if (!ultimoEvento) return;
      const caixa = arte.getBoundingClientRect();
      // -0.5 a 0.5 a partir do centro, virando alguns graus só.
      const px = (ultimoEvento.clientX - caixa.left) / caixa.width - 0.5;
      const py = (ultimoEvento.clientY - caixa.top) / caixa.height - 0.5;
      arte.style.setProperty("--inclina-y", (px * 10).toFixed(2) + "deg");
      arte.style.setProperty("--inclina-x", (-py * 7).toFixed(2) + "deg");
      acenderJanelas(ultimoEvento.clientX, ultimoEvento.clientY);
    }

    arte.addEventListener("pointermove", (e) => {
      ultimoEvento = e;
      if (inclinacaoAgendada) return;
      inclinacaoAgendada = true;
      window.requestAnimationFrame(aplicarInclinacao);
    });

    arte.addEventListener("pointerleave", () => {
      arte.style.setProperty("--inclina-y", "0deg");
      arte.style.setProperty("--inclina-x", "0deg");
      janelas.forEach((j) => j.style.setProperty("--luz", "0"));
    });
  }

  /* ---------- Clarão dos cards seguindo o cursor ---------- */

  if (pontoFino) {
    const cards = Array.from(document.querySelectorAll(".dif, .serv"));
    cards.forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const caixa = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - caixa.left) + "px");
        card.style.setProperty("--my", (e.clientY - caixa.top) + "px");
      });
    });
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
    }, 1800);
  }
})();
