(() => {
  "use strict";

  const CHAVE_URL = "n8n_base_url";
  const CHAVE_SESSAO = "sr_sessao";
  const ESPERA_REENVIO_S = 60;
  const LIMITE_RESPOSTA_MS = 20000;
  const MSG_REDE = "Não foi possível falar com o servidor. Confira sua internet e tente de novo.";

  const $ = (seletor) => document.querySelector(seletor);

  // localStorage pode estar bloqueado (aba anônima, dados do site apagados):
  // a tela tem que funcionar mesmo assim.
  function lerGuardado(chave) {
    try { return localStorage.getItem(chave); } catch (e) { return null; }
  }
  function guardar(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch (e) { /* segue sem guardar */ }
  }

  // Mesmo endereço que o sistema usa (sistema.html): o que foi salvo neste
  // aparelho tem prioridade sobre o padrão do config.js.
  function baseUrl() {
    const padrao = typeof N8N_BASE_URL === "string" ? N8N_BASE_URL : "";
    return (lerGuardado(CHAVE_URL) || padrao || "").replace(/\/+$/, "");
  }

  async function chamar(caminho, dados) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), LIMITE_RESPOSTA_MS);
    let resposta;
    try {
      // Formulário simples, como o resto do sistema: dispensa a checagem
      // extra de CORS (preflight).
      resposta = await fetch(baseUrl() + "/webhook/" + caminho, {
        method: "POST",
        body: new URLSearchParams(dados),
        signal: controle.signal,
      });
    } finally {
      clearTimeout(relogio);
    }
    const corpo = await resposta.json().catch(() => null);
    if (!corpo) throw new Error("resposta inválida");
    return corpo;
  }

  // "Chrome · Windows" -- só pra reconhecer o aparelho numa futura lista de
  // aparelhos conectados.
  function descreverAparelho() {
    const ua = navigator.userAgent || "";
    const navegador =
      /Edg\//.test(ua) ? "Edge" :
      /OPR\//.test(ua) ? "Opera" :
      /Firefox\//.test(ua) ? "Firefox" :
      /Chrome\//.test(ua) ? "Chrome" :
      /Safari\//.test(ua) ? "Safari" : "Navegador";
    const sistema =
      /iPhone/.test(ua) ? "iPhone" :
      /iPad/.test(ua) ? "iPad" :
      /Android/.test(ua) ? "Android" :
      /Windows/.test(ua) ? "Windows" :
      /Mac OS X/.test(ua) ? "Mac" :
      /Linux/.test(ua) ? "Linux" : "";
    return sistema ? navegador + " · " + sistema : navegador;
  }

  const primeiroNome = (nome) => String(nome || "").trim().split(/\s+/)[0];
  const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const emailValido = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // ---------- etapas ----------

  const etapas = {
    email: $("#etapa-email"),
    codigo: $("#etapa-codigo"),
    senha: $("#etapa-senha"),
    sucesso: $("#etapa-sucesso"),
    semConvite: $("#etapa-sem-convite"),
    jaAtiva: $("#etapa-ja-ativa"),
    semServidor: $("#etapa-sem-servidor"),
  };
  const NUMERO_DO_PASSO = { email: 1, codigo: 2, senha: 3, sucesso: 4 };
  const passos = $("#passos");
  const rodape = $("#rodape-cartao");

  const estado = { email: "", codigo: "", nome: "", precisaNome: false };

  function mostrarEtapa(nome, focar) {
    Object.entries(etapas).forEach(([chave, el]) => { el.hidden = chave !== nome; });

    const atual = NUMERO_DO_PASSO[nome];
    passos.hidden = !atual;
    passos.querySelectorAll(".passo").forEach((li) => {
      const n = Number(li.dataset.passo);
      li.classList.toggle("feito", n < atual);
      li.classList.toggle("atual", n === atual);
      if (n === atual) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
    rodape.hidden = nome === "sucesso" || nome === "jaAtiva";

    const el = etapas[nome];
    limparAviso(el);
    // Foco no primeiro campo (ou no título, que o leitor de tela anuncia).
    (focar || el.querySelector(".etapa-titulo")).focus();
  }

  function mostrarAviso(etapa, mensagem, tipo) {
    const aviso = etapa.querySelector(".aviso");
    aviso.textContent = mensagem;
    aviso.classList.toggle("aviso-ok", tipo === "ok");
    aviso.hidden = false;
  }
  function limparAviso(etapa) {
    const aviso = etapa.querySelector(".aviso");
    if (!aviso) return;
    aviso.hidden = true;
    aviso.textContent = "";
  }

  function carregando(botao, sim) {
    botao.classList.toggle("carregando", sim);
    botao.disabled = sim;
    botao.setAttribute("aria-busy", String(sim));
  }

  // ---------- 1. e-mail ----------

  const campoEmail = $("#email");

  etapas.email.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const email = campoEmail.value.trim().toLowerCase();
    if (!emailValido(email)) {
      campoEmail.setAttribute("aria-invalid", "true");
      mostrarAviso(etapas.email, "Digite um e-mail válido.");
      campoEmail.focus();
      return;
    }
    campoEmail.removeAttribute("aria-invalid");
    limparAviso(etapas.email);

    const botao = etapas.email.querySelector("[type=submit]");
    carregando(botao, true);
    try {
      const r = await chamar("cadastro-iniciar", { email });
      if (!r.ok) {
        mostrarAviso(etapas.email, r.mensagem || "Não foi possível continuar agora.");
        return;
      }
      estado.email = email;
      if (r.estado === "sem_convite") mostrarEtapa("semConvite");
      else if (r.estado === "ja_ativada") mostrarEtapa("jaAtiva");
      else irParaCodigo();
    } catch (e) {
      mostrarAviso(etapas.email, MSG_REDE);
    } finally {
      carregando(botao, false);
    }
  });

  campoEmail.addEventListener("input", () => {
    campoEmail.removeAttribute("aria-invalid");
    limparAviso(etapas.email);
  });

  document.querySelectorAll("[data-voltar]").forEach((botao) => {
    botao.addEventListener("click", () => voltarParaEmail());
  });
  $("#trocar-email").addEventListener("click", () => voltarParaEmail());

  function voltarParaEmail() {
    pararContagem();
    mostrarEtapa("email", campoEmail);
    campoEmail.select();
  }

  // ---------- 2. código ----------

  const otp = $("#otp");
  const campoCodigo = $("#codigo");
  const caixas = Array.from(otp.querySelectorAll(".otp-caixas span"));
  const botaoReenviar = $("#reenviar");
  const tempoReenvio = $("#reenviar-tempo");
  let conferindo = false;

  function desenharCodigo() {
    const valor = campoCodigo.value;
    caixas.forEach((caixa, i) => {
      caixa.textContent = valor[i] || "";
      caixa.classList.toggle("cheia", i < valor.length);
      caixa.classList.toggle("ativa", i === Math.min(valor.length, caixas.length - 1));
    });
  }

  function limparCodigo() {
    campoCodigo.value = "";
    otp.classList.remove("erro", "ok");
    desenharCodigo();
  }

  // O campo é invisível: o cursor fica sempre no fim, senão um número
  // digitado entraria no meio do código sem a pessoa ver onde.
  function cursorNoFim() {
    const fim = campoCodigo.value.length;
    campoCodigo.setSelectionRange(fim, fim);
  }

  campoCodigo.addEventListener("input", () => {
    const limpo = campoCodigo.value.replace(/\D/g, "").slice(0, 6);
    if (limpo !== campoCodigo.value) campoCodigo.value = limpo;
    otp.classList.remove("erro");
    limparAviso(etapas.codigo);
    desenharCodigo();
    // Colou ou digitou o sexto número: já confere, sem precisar clicar.
    if (limpo.length === 6) enviarFormulario(etapas.codigo);
  });
  campoCodigo.addEventListener("focus", () => { otp.classList.add("foco"); desenharCodigo(); });
  campoCodigo.addEventListener("blur", () => otp.classList.remove("foco"));
  campoCodigo.addEventListener("click", cursorNoFim);
  campoCodigo.addEventListener("keyup", cursorNoFim);

  function enviarFormulario(formulario) {
    if (typeof formulario.requestSubmit === "function") formulario.requestSubmit();
    else formulario.dispatchEvent(new Event("submit", { cancelable: true }));
  }

  function erroNoCodigo(mensagem, apagar) {
    otp.classList.remove("erro", "ok");
    void otp.offsetWidth; // reinicia a animação de tremer
    otp.classList.add("erro");
    mostrarAviso(etapas.codigo, mensagem);
    if (apagar) {
      campoCodigo.value = "";
      desenharCodigo();
    }
    campoCodigo.focus();
  }

  function irParaCodigo() {
    $("#email-mostrado").textContent = estado.email;
    limparCodigo();
    mostrarEtapa("codigo", campoCodigo);
    iniciarContagem();
  }

  etapas.codigo.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (conferindo) return;
    const codigo = campoCodigo.value;
    if (codigo.length !== 6) {
      erroNoCodigo("Digite os 6 números do código.", false);
      return;
    }

    const botao = etapas.codigo.querySelector("[type=submit]");
    conferindo = true;
    carregando(botao, true);
    try {
      const r = await chamar("cadastro-verificar", { email: estado.email, codigo });
      if (!r.ok) {
        erroNoCodigo(r.mensagem || "Código incorreto.", true);
        return;
      }
      estado.codigo = codigo;
      estado.nome = r.nome || "";
      estado.precisaNome = Boolean(r.precisaNome);
      otp.classList.add("ok");
      await pausa(380); // deixa ver as caixas ficarem verdes antes de trocar de tela
      irParaSenha();
    } catch (e) {
      erroNoCodigo(MSG_REDE, false);
    } finally {
      conferindo = false;
      carregando(botao, false);
    }
  });

  // Reenvio: liberado só depois de 1 minuto, com a contagem à vista. A
  // conta usa o relógio, não a soma de segundos: aba em segundo plano
  // atrasa os temporizadores do navegador.
  let contagem = null;

  function pararContagem() {
    clearInterval(contagem);
    contagem = null;
  }

  function iniciarContagem() {
    pararContagem();
    const fim = Date.now() + ESPERA_REENVIO_S * 1000;
    botaoReenviar.disabled = true;
    const atualizar = () => {
      const restam = Math.ceil((fim - Date.now()) / 1000);
      if (restam <= 0) {
        pararContagem();
        botaoReenviar.disabled = false;
        tempoReenvio.textContent = "";
        return;
      }
      tempoReenvio.textContent = "em " + Math.floor(restam / 60) + ":" + String(restam % 60).padStart(2, "0");
    };
    atualizar();
    contagem = setInterval(atualizar, 500);
  }

  botaoReenviar.addEventListener("click", async () => {
    botaoReenviar.disabled = true;
    limparAviso(etapas.codigo);
    try {
      const r = await chamar("cadastro-iniciar", { email: estado.email });
      if (r.ok && r.estado === "codigo_enviado") {
        limparCodigo();
        mostrarAviso(etapas.codigo, "Enviamos um código novo. O anterior não vale mais.", "ok");
        iniciarContagem();
        campoCodigo.focus();
        return;
      }
      mostrarAviso(etapas.codigo, r.mensagem || "Não foi possível reenviar agora.");
      botaoReenviar.disabled = false;
    } catch (e) {
      mostrarAviso(etapas.codigo, MSG_REDE);
      botaoReenviar.disabled = false;
    }
  });

  // ---------- 3. senha ----------

  const campoNome = $("#nome");
  const campoSenha = $("#senha");
  const campoSenha2 = $("#senha2");

  function irParaSenha() {
    pararContagem();
    const nome = primeiroNome(estado.nome);
    $("#titulo-senha").textContent = !estado.precisaNome && nome ? "Olá, " + nome + "!" : "Quase lá!";
    $("#texto-senha").textContent = estado.precisaNome
      ? "Diga seu nome e crie uma senha para entrar no sistema."
      : "Agora crie uma senha para entrar no sistema.";
    $("#campo-nome").hidden = !estado.precisaNome;
    campoSenha.value = "";
    campoSenha2.value = "";
    conferirRequisitos();
    mostrarEtapa("senha", estado.precisaNome ? campoNome : campoSenha);
  }

  function conferirRequisitos() {
    const tamanho = campoSenha.value.length >= 8;
    const iguais = campoSenha2.value.length > 0 && campoSenha.value === campoSenha2.value;
    $("#req-tamanho").classList.toggle("ok", tamanho);
    $("#req-iguais").classList.toggle("ok", iguais);
  }

  [campoNome, campoSenha, campoSenha2].forEach((campo) => {
    campo.addEventListener("input", () => {
      campo.removeAttribute("aria-invalid");
      limparAviso(etapas.senha);
      conferirRequisitos();
    });
  });

  document.querySelectorAll(".olho").forEach((botao) => {
    botao.addEventListener("click", () => {
      const campo = document.getElementById(botao.dataset.alvo);
      const mostrar = campo.type === "password";
      campo.type = mostrar ? "text" : "password";
      botao.setAttribute("aria-pressed", String(mostrar));
      botao.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
    });
  });

  function erroNoCampo(campo, mensagem) {
    campo.setAttribute("aria-invalid", "true");
    mostrarAviso(etapas.senha, mensagem);
    campo.focus();
  }

  etapas.senha.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const nome = campoNome.value.trim().replace(/\s+/g, " ");
    const senha = campoSenha.value;
    if (estado.precisaNome && nome.length < 2) return erroNoCampo(campoNome, "Digite seu nome.");
    if (senha.length < 8) return erroNoCampo(campoSenha, "A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== campoSenha2.value) return erroNoCampo(campoSenha2, "As duas senhas precisam ser iguais.");
    limparAviso(etapas.senha);

    const botao = etapas.senha.querySelector("[type=submit]");
    carregando(botao, true);
    try {
      const dados = { email: estado.email, codigo: estado.codigo, senha, dispositivo: descreverAparelho() };
      if (estado.precisaNome) dados.nome = nome;
      const r = await chamar("cadastro-concluir", dados);
      if (!r.ok) {
        // O código venceu enquanto a pessoa criava a senha: volta pra pedir
        // um novo, em vez de deixá-la presa aqui.
        if (r.motivo) {
          irParaCodigoDeNovo(r.mensagem);
          return;
        }
        mostrarAviso(etapas.senha, r.mensagem || "Não foi possível criar a conta agora.");
        return;
      }
      guardarSessao(r);
      irParaSucesso(r.usuario || {});
    } catch (e) {
      mostrarAviso(etapas.senha, MSG_REDE);
    } finally {
      carregando(botao, false);
    }
  });

  function irParaCodigoDeNovo(mensagem) {
    limparCodigo();
    mostrarEtapa("codigo", campoCodigo);
    if (!contagem) botaoReenviar.disabled = false;
    mostrarAviso(etapas.codigo, mensagem || "Esse código expirou. Peça um novo código.");
  }

  function guardarSessao(r) {
    if (!r.tokenAcesso || !r.tokenSessao) return;
    guardar(CHAVE_SESSAO, JSON.stringify({
      tokenAcesso: r.tokenAcesso,
      acessoExpiraEm: Date.now() + (Number(r.expiraEmSegundos) || 1800) * 1000,
      tokenSessao: r.tokenSessao,
      usuario: r.usuario || null,
    }));
  }

  function irParaSucesso(usuario) {
    // Nada de senha nem código sobrando na memória da página.
    estado.codigo = "";
    campoSenha.value = "";
    campoSenha2.value = "";

    const nome = primeiroNome(usuario.nome || estado.nome);
    $("#titulo-sucesso").textContent = nome ? "Conta criada, " + nome + "!" : "Conta criada!";
    $("#texto-sucesso").textContent = usuario.papel === "Dono"
      ? "Sua conta tem acesso total ao sistema."
      : "Sua conta já está pronta para usar.";
    mostrarEtapa("sucesso");
  }

  // ---------- início ----------

  if (baseUrl()) mostrarEtapa("email", campoEmail);
  else mostrarEtapa("semServidor");
})();
