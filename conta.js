(() => {
  "use strict";

  const CHAVE_URL = "n8n_base_url";
  const CHAVE_SESSAO = "sr_sessao";
  const CHAVE_SENHA_ANTIGA = "senha_salva";
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
  function esquecer(chave) {
    try { localStorage.removeItem(chave); } catch (e) { /* nada a fazer */ }
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

  function guardarSessao(r) {
    if (!r.tokenAcesso || !r.tokenSessao) return;
    guardar(CHAVE_SESSAO, JSON.stringify({
      tokenAcesso: r.tokenAcesso,
      acessoExpiraEm: Date.now() + (Number(r.expiraEmSegundos) || 1800) * 1000,
      tokenSessao: r.tokenSessao,
      usuario: r.usuario || null,
    }));
    // A senha única antiga guardada em texto puro neste aparelho sai daqui:
    // quem entra por e-mail não precisa mais dela.
    esquecer(CHAVE_SENHA_ANTIGA);
  }

  // ---------- os dois fluxos de código por e-mail ----------
  // Criar conta e recuperar senha têm as mesmas três etapas (e-mail, código,
  // senha); mudam os textos, os endereços e o que vem na resposta.

  const FLUXOS = {
    criar: {
      tituloPagina: "Criar conta — Soluções Rápidas",
      iniciar: "cadastro-iniciar",
      verificar: "cadastro-verificar",
      concluir: "cadastro-concluir",
      campoSenha: "senha",
      tituloEmail: "Crie sua conta",
      textoEmail: "Comece pelo seu e-mail. Vamos mandar um código pra confirmar que ele é seu.",
      textoCodigo: "Enviamos um código de 6 números para",
      tituloSenha: "Quase lá!",
      textoSenha: "Agora crie uma senha para entrar no sistema.",
      botaoSenha: "Criar conta",
      rodape: ["Já tem conta?", "Entrar", "#entrar"],
    },
    esqueci: {
      tituloPagina: "Recuperar senha — Soluções Rápidas",
      iniciar: "solicitar-recuperacao",
      verificar: "verificar-codigo",
      concluir: "redefinir-senha",
      campoSenha: "novaSenha",
      tituloEmail: "Esqueceu a senha?",
      textoEmail: "Digite o e-mail da sua conta. Vamos mandar um código pra você criar uma senha nova.",
      textoCodigo: "Se esse e-mail tiver conta, enviamos um código de 6 números para",
      tituloSenha: "Crie uma senha nova",
      textoSenha: "Escolha uma senha nova para entrar no sistema.",
      botaoSenha: "Salvar senha nova",
      rodape: ["Lembrou a senha?", "Entrar", "#entrar"],
    },
  };

  // ---------- etapas ----------

  const etapas = {
    entrar: $("#etapa-entrar"),
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
  const rodapeAntigo = $("#rodape-antigo");

  const estado = { fluxo: "criar", email: "", codigo: "", nome: "", precisaNome: false };
  const fluxo = () => FLUXOS[estado.fluxo];

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

    // Rodapé com o caminho alternativo de cada tela.
    const [texto, link, destino] = nome === "entrar"
      ? ["Ainda não tem conta?", "Criar conta", "#criar"]
      : fluxo().rodape;
    $("#rodape-texto").textContent = texto;
    $("#rodape-link").textContent = link;
    $("#rodape-link").setAttribute("href", destino);
    rodape.hidden = nome === "sucesso" || nome === "jaAtiva";
    rodapeAntigo.hidden = nome !== "entrar";

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

  document.querySelectorAll(".olho").forEach((botao) => {
    botao.addEventListener("click", () => {
      const campo = document.getElementById(botao.dataset.alvo);
      const mostrar = campo.type === "password";
      campo.type = mostrar ? "text" : "password";
      botao.setAttribute("aria-pressed", String(mostrar));
      botao.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
    });
  });

  // ---------- entrar ----------

  const entrarEmail = $("#entrar-email");
  const entrarSenha = $("#entrar-senha");

  [entrarEmail, entrarSenha].forEach((campo) => {
    campo.addEventListener("input", () => {
      campo.removeAttribute("aria-invalid");
      limparAviso(etapas.entrar);
    });
  });

  // "Esqueci minha senha" leva o e-mail já digitado junto.
  $("#link-esqueci").addEventListener("click", () => {
    const email = entrarEmail.value.trim();
    if (email) campoEmail.value = email;
  });

  etapas.entrar.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const email = entrarEmail.value.trim().toLowerCase();
    const senha = entrarSenha.value;
    if (!emailValido(email)) {
      entrarEmail.setAttribute("aria-invalid", "true");
      mostrarAviso(etapas.entrar, "Digite um e-mail válido.");
      entrarEmail.focus();
      return;
    }
    if (!senha) {
      entrarSenha.setAttribute("aria-invalid", "true");
      mostrarAviso(etapas.entrar, "Digite sua senha.");
      entrarSenha.focus();
      return;
    }

    const botao = etapas.entrar.querySelector("[type=submit]");
    carregando(botao, true);
    let saindo = false;
    try {
      const r = await chamar("login", { email, senha, dispositivo: descreverAparelho() });
      if (!r.ok) {
        mostrarAviso(etapas.entrar, r.mensagem || "E-mail ou senha incorretos.");
        entrarSenha.value = "";
        entrarSenha.focus();
        return;
      }
      // Só quem tem acesso total entra por enquanto: as regras dos outros
      // níveis de acesso ainda não foram definidas.
      if (!r.usuario || r.usuario.papel !== "Dono") {
        // O login já abriu uma sessão no servidor: fecha na hora, pra não
        // sobrar sessão válida que ninguém vai usar.
        if (r.tokenSessao) chamar("encerrar-sessao", { tokenSessao: r.tokenSessao }).catch(() => {});
        mostrarAviso(etapas.entrar, "Sua conta ainda não tem acesso liberado ao sistema. Fale com a administração.");
        return;
      }
      guardarSessao(r);
      saindo = true;
      window.location.replace("sistema.html");
    } catch (e) {
      mostrarAviso(etapas.entrar, MSG_REDE);
    } finally {
      // Indo pro sistema, o botão fica girando até a página trocar.
      if (!saindo) carregando(botao, false);
    }
  });

  // ---------- 1. e-mail ----------

  const campoEmail = $("#email");

  function prepararEmail() {
    $("#titulo-email").textContent = fluxo().tituloEmail;
    $("#texto-email").textContent = fluxo().textoEmail;
    document.title = fluxo().tituloPagina;
  }

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
      const r = await chamar(fluxo().iniciar, { email });
      if (!r.ok) {
        mostrarAviso(etapas.email, r.mensagem || "Não foi possível continuar agora.");
        return;
      }
      estado.email = email;
      if (r.estado === "sem_convite") mostrarEtapa("semConvite");
      else if (r.estado === "ja_ativada") {
        entrarEmail.value = email; // o "Entrar" dessa tela já abre com o e-mail preenchido
        mostrarEtapa("jaAtiva");
      } else irParaCodigo();
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
    prepararEmail();
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
    $("#texto-codigo").textContent = fluxo().textoCodigo;
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
      const r = await chamar(fluxo().verificar, { email: estado.email, codigo });
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
      const r = await chamar(fluxo().iniciar, { email: estado.email });
      // Criar conta devolve "codigo_enviado"; a recuperação responde sempre
      // igual (pra não contar se o e-mail existe).
      if (r.ok && (r.estado === "codigo_enviado" || !r.estado)) {
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
    $("#titulo-senha").textContent = estado.fluxo === "criar" && !estado.precisaNome && nome
      ? "Olá, " + nome + "!"
      : fluxo().tituloSenha;
    $("#texto-senha").textContent = estado.precisaNome
      ? "Diga seu nome e crie uma senha para entrar no sistema."
      : fluxo().textoSenha;
    $("#campo-nome").hidden = !estado.precisaNome;
    $("#botao-senha").textContent = fluxo().botaoSenha;
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
      const dados = { email: estado.email, codigo: estado.codigo, dispositivo: descreverAparelho() };
      dados[fluxo().campoSenha] = senha;
      if (estado.precisaNome) dados.nome = nome;
      const r = await chamar(fluxo().concluir, dados);
      if (!r.ok) {
        // O código venceu enquanto a pessoa criava a senha: volta pra pedir
        // um novo, em vez de deixá-la presa aqui.
        if (r.motivo) {
          irParaCodigoDeNovo(r.mensagem);
          return;
        }
        mostrarAviso(etapas.senha, r.mensagem || "Não foi possível concluir agora.");
        return;
      }
      if (estado.fluxo === "criar") guardarSessao(r);
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

  const botaoSucesso = $("#botao-sucesso");

  function irParaSucesso(usuario) {
    // Nada de senha nem código sobrando na memória da página.
    estado.codigo = "";
    campoSenha.value = "";
    campoSenha2.value = "";

    if (estado.fluxo === "esqueci") {
      $("#titulo-sucesso").textContent = "Senha alterada!";
      $("#texto-sucesso").textContent = "Pronto. Agora é só entrar com a senha nova.";
      botaoSucesso.textContent = "Entrar";
      botaoSucesso.setAttribute("href", "#entrar");
      entrarEmail.value = estado.email;
    } else {
      const nome = primeiroNome(usuario.nome || estado.nome);
      $("#titulo-sucesso").textContent = nome ? "Conta criada, " + nome + "!" : "Conta criada!";
      $("#texto-sucesso").textContent = usuario.papel === "Dono"
        ? "Sua conta tem acesso total ao sistema."
        : "Sua conta já está pronta para usar.";
      botaoSucesso.textContent = "Ir para o sistema";
      botaoSucesso.setAttribute("href", "sistema.html");
    }
    mostrarEtapa("sucesso");
  }

  // ---------- aparelho sem endereço do servidor ----------

  const campoEndereco = $("#endereco-servidor");

  etapas.semServidor.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const valor = campoEndereco.value.trim().replace(/\/+$/, "");
    if (!/^https:\/\/[^\s/]+/.test(valor)) {
      campoEndereco.setAttribute("aria-invalid", "true");
      mostrarAviso(etapas.semServidor, "O endereço precisa começar com https://");
      campoEndereco.focus();
      return;
    }
    guardar(CHAVE_URL, valor);
    abrirRota();
  });
  campoEndereco.addEventListener("input", () => {
    campoEndereco.removeAttribute("aria-invalid");
    limparAviso(etapas.semServidor);
  });

  // ---------- rotas ----------
  // conta.html#entrar, #esqueci ou #criar (sem nada também é criar: é o
  // endereço que o botão "Criar conta" da landing já usava).

  function abrirRota() {
    pararContagem();
    const rota = window.location.hash.replace("#", "");
    estado.fluxo = rota === "esqueci" ? "esqueci" : "criar";

    if (!baseUrl()) {
      mostrarEtapa("semServidor", campoEndereco);
      return;
    }
    if (rota === "entrar") {
      document.title = "Entrar — Soluções Rápidas";
      mostrarEtapa("entrar", entrarEmail.value ? entrarSenha : entrarEmail);
      return;
    }
    prepararEmail();
    mostrarEtapa("email", campoEmail);
  }

  window.addEventListener("hashchange", abrirRota);
  abrirRota();
})();
