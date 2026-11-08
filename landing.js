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

  /* ---------- História: do susto ao resolvido (rolagem) ---------- */
  // O palco fica parado enquanto a seção passa e a posição da rolagem vira
  // um número de 0 a 1 (p). A partir de p sai tudo: o enquadramento da
  // câmera (viewBox do SVG) e as variáveis que ligam cada parte da cena.
  // O número "persegue" a rolagem com suavização, pra nada andar aos
  // trancos, e o desenho só roda enquanto a seção está na tela.

  const historia = document.getElementById("historia");
  const svgHistoria = document.getElementById("historia-svg");
  const telaHistoria = historia ? historia.querySelector(".historia-tela") : null;
  const painelHistoria = historia ? historia.querySelector(".historia-painel") : null;

  if (historia && svgHistoria && telaHistoria && painelHistoria) {
    const viva = !menosMovimento && window.innerHeight >= 560;
    if (viva) historia.classList.add("viva");

    const porId = (id) => document.getElementById(id);
    const van = porId("hx-van");
    const vanLuz = porId("hx-van-luz");
    const rodas = [porId("hx-roda-1"), porId("hx-roda-2")];
    const scanner = porId("hx-scanner");
    const recorteScan = porId("hx-scan-rect");
    const atos = Array.from(historia.querySelectorAll(".ato"));
    const avisos = Array.from(historia.querySelectorAll(".aviso"));
    const passos = Array.from(historia.querySelectorAll(".historia-passo"));

    const suave = (de, ate, x) => {
      const t = Math.min(1, Math.max(0, (x - de) / (ate - de)));
      return t * t * (3 - 2 * t);
    };
    const mistura = (a, b, t) => a + (b - a) * t;

    // Planos da câmera no desenho: [centro x, centro y, largura, altura,
    // âncora]. Âncora 1 = o pé do plano cola no pé da área livre (sobra de
    // espaço vira céu, não chão); 0 = plano centralizado.
    const PLANOS = {
      geral: [905, 690, 620, 800, 1],
      scan: [905, 675, 560, 770, 1],
      sala: [1005, 646, 196, 100, 0],
      rua: [800, 950, 520, 300, 1],
      final: [905, 690, 860, 800, 1],
    };
    // Roteiro: em que ponto da rolagem a câmera chega em cada plano.
    const ROTEIRO = [
      [0, "geral"], [0.06, "geral"], [0.24, "scan"], [0.3, "scan"],
      [0.42, "sala"], [0.47, "sala"], [0.55, "rua"], [0.61, "rua"],
      [0.69, "sala"], [0.8, "sala"], [0.93, "final"], [1, "final"],
    ];
    // Meio de cada ato, pra onde a linha do tempo leva.
    const MEIO_DOS_ATOS = [0.3, 0.66, 0.97];

    function plano(p) {
      for (let i = 0; i < ROTEIRO.length - 1; i++) {
        const [p0, nome0] = ROTEIRO[i];
        const [p1, nome1] = ROTEIRO[i + 1];
        if (p > p1) continue;
        const t = suave(p0, p1, p);
        const a = PLANOS[nome0];
        const b = PLANOS[nome1];
        // Tamanho em escala logarítmica: o zoom anda no mesmo ritmo do
        // começo ao fim, em vez de disparar no final.
        return [
          mistura(a[0], b[0], t),
          mistura(a[1], b[1], t),
          Math.exp(mistura(Math.log(a[2]), Math.log(b[2]), t)),
          Math.exp(mistura(Math.log(a[3]), Math.log(b[3]), t)),
          mistura(a[4], b[4], t),
        ];
      }
      return PLANOS.final;
    }

    // Área "livre" do palco: o que o painel de texto não cobre. A câmera
    // enquadra o plano dentro dela; o resto do desenho preenche o entorno.
    let largura = 0;
    let altura = 0;
    let livre = { x: 0, y: 0, w: 1, h: 1 };

    function medir() {
      largura = telaHistoria.clientWidth;
      altura = telaHistoria.clientHeight;
      const tela = telaHistoria.getBoundingClientRect();
      const painel = painelHistoria.getBoundingClientRect();
      const painelEmbaixo = painel.top - tela.top > altura * 0.3;
      if (painelEmbaixo) {
        livre = { x: 14, y: 64, w: largura - 28, h: painel.top - tela.top - 64 - 12 };
      } else {
        const x0 = painel.right - tela.left + 28;
        livre = { x: x0, y: 28, w: largura - x0 - 32, h: altura - 56 };
      }
      if (livre.w < 140 || livre.h < 140) livre = { x: 0, y: 0, w: largura, h: altura };
    }

    function enquadrar([cx, cy, w, h, ancora]) {
      const escala = Math.min(livre.w / w, livre.h / h);
      const x0 = cx - (livre.x + livre.w / 2) / escala;
      const yCentro = cy - (livre.y + livre.h / 2) / escala;
      const yPe = cy + h / 2 - (livre.y + livre.h) / escala;
      const y0 = mistura(yCentro, yPe, ancora);
      svgHistoria.setAttribute(
        "viewBox",
        x0.toFixed(2) + " " + y0.toFixed(2) + " " + (largura / escala).toFixed(2) + " " + (altura / escala).toFixed(2)
      );
    }

    let atoAtual = -1;
    let avisoAtual = -2;

    function desenhar(p) {
      enquadrar(plano(p));

      const e = svgHistoria.style;
      const dia = 0.45 * suave(0.5, 0.8, p) + 0.55 * suave(0.8, 0.95, p);
      const varredura = suave(0.07, 0.24, p);
      e.setProperty("--dia", dia.toFixed(3));
      e.setProperty("--scanner", (suave(0.06, 0.08, p) * (1 - suave(0.23, 0.26, p))).toFixed(3));
      e.setProperty("--raiox", (suave(0.065, 0.08, p) * (1 - suave(0.31, 0.37, p))).toFixed(3));
      e.setProperty("--marcador", (suave(0.16, 0.2, p) * (1 - suave(0.39, 0.43, p))).toFixed(3));
      e.setProperty("--corte", (suave(0.35, 0.41, p) * (1 - suave(0.82, 0.88, p))).toFixed(3));
      e.setProperty("--vaz", (1 - suave(0.7, 0.74, p)).toFixed(3));
      e.setProperty("--poca", (mistura(0.25, 1, suave(0.34, 0.44, p)) * (1 - suave(0.72, 0.8, p))).toFixed(3));
      e.setProperty("--mancha", (suave(0.37, 0.47, p) * (1 - suave(0.74, 0.82, p))).toFixed(3));
      e.setProperty("--tecnico", suave(0.63, 0.68, p).toFixed(3));
      e.setProperty("--chave", (suave(0.66, 0.68, p) * (1 - suave(0.75, 0.77, p))).toFixed(3));
      e.setProperty("--conserto", suave(0.72, 0.78, p).toFixed(3));
      e.setProperty("--ok", suave(0.75, 0.79, p).toFixed(3));
      e.setProperty("--okf", suave(0.88, 0.94, p).toFixed(3));
      historia.style.setProperty("--p", p.toFixed(4));

      // Scanner descendo: a faixa e o recorte que revela o raio-x.
      const yScan = 296 + 706 * varredura;
      if (scanner) scanner.setAttribute("transform", "translate(0 " + yScan.toFixed(1) + ")");
      if (recorteScan) recorteScan.setAttribute("height", (706 * varredura).toFixed(1));

      // Van chegando e freando; as rodas giram conforme a distância.
      const t = Math.min(1, Math.max(0, (p - 0.47) / 0.11));
      const xVan = -420 + 1060 * (1 - Math.pow(1 - t, 3));
      const posVan = "translate(" + xVan.toFixed(1) + " 1062)";
      if (van) van.setAttribute("transform", posVan);
      if (vanLuz) vanLuz.setAttribute("transform", posVan);
      const giro = ((xVan / 12.5) * 180 / Math.PI).toFixed(1);
      if (rodas[0]) rodas[0].setAttribute("transform", "translate(36 -12) rotate(" + giro + ")");
      if (rodas[1]) rodas[1].setAttribute("transform", "translate(136 -12) rotate(" + giro + ")");

      const ato = p < 0.47 ? 0 : p < 0.82 ? 1 : 2;
      if (ato !== atoAtual) {
        atoAtual = ato;
        atos.forEach((el, i) => {
          el.classList.toggle("atual", i === ato);
          el.classList.toggle("saiu", i < ato);
        });
        passos.forEach((el, i) => {
          el.classList.toggle("atual", i === ato);
          if (i === ato) el.setAttribute("aria-current", "step");
          else el.removeAttribute("aria-current");
        });
        historia.classList.toggle("final", ato === 2);
      }

      const aviso = p >= 0.33 && p < 0.47 ? 0 : p >= 0.5 && p < 0.72 ? 1 : p >= 0.85 ? 2 : -1;
      if (aviso !== avisoAtual) {
        avisoAtual = aviso;
        avisos.forEach((el, i) => el.classList.toggle("atual", i === aviso));
      }
    }

    medir();

    if (!viva) {
      // Parado no final feliz: só enquadra (e reenquadra se a tela mudar).
      desenhar(1);
      window.addEventListener("resize", () => {
        medir();
        desenhar(1);
      });
    } else {
      const progressoDaRolagem = () => {
        const caixa = historia.getBoundingClientRect();
        const total = caixa.height - window.innerHeight;
        return total > 0 ? Math.min(1, Math.max(0, -caixa.top / total)) : 0;
      };

      let mostrado = progressoDaRolagem();
      let rodando = false;
      let naTela = false;
      desenhar(mostrado);

      const quadro = () => {
        const alvo = progressoDaRolagem();
        let proximo = mostrado + (alvo - mostrado) * 0.1;
        if (Math.abs(alvo - proximo) < 0.0004) proximo = alvo;
        if (proximo !== mostrado) {
          mostrado = proximo;
          desenhar(mostrado);
        }
        if (naTela || mostrado !== alvo) {
          window.requestAnimationFrame(quadro);
        } else {
          rodando = false;
        }
      };
      const ligar = () => {
        if (rodando) return;
        rodando = true;
        window.requestAnimationFrame(quadro);
      };

      new IntersectionObserver((entradas) => {
        naTela = entradas[0].isIntersecting;
        historia.classList.toggle("parada", !naTela);
        if (naTela) ligar();
      }).observe(historia);

      window.addEventListener("resize", () => {
        medir();
        desenhar(mostrado);
      });

      // Linha do tempo: tocar num momento rola suave até ele.
      passos.forEach((botao) => {
        botao.addEventListener("click", () => {
          const caixa = historia.getBoundingClientRect();
          const total = caixa.height - window.innerHeight;
          const destino = MEIO_DOS_ATOS[Number(botao.dataset.ir)] || 0;
          window.scrollTo({ top: window.scrollY + caixa.top + total * destino, behavior: "smooth" });
        });
      });
    }
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
