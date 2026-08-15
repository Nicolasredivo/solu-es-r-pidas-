const form = document.getElementById("test-form");
const passwordInput = document.getElementById("password");
const testButton = document.getElementById("test-button");
const statusBox = document.getElementById("status");

const gateView = document.getElementById("gate-view");
const appView = document.getElementById("app-view");

const lembrarSenha = document.getElementById("lembrar-senha");
const toggleConfig = document.getElementById("toggle-config");
const configBox = document.getElementById("config-box");
const n8nUrlInput = document.getElementById("n8n-url");
const salvarUrlBotao = document.getElementById("salvar-url");
const restaurarUrlBotao = document.getElementById("restaurar-url");
const configHint = document.getElementById("config-hint");

const CHAVE_URL = "n8n_base_url";
const CHAVE_SENHA = "senha_salva";

// O endereço salvo no aparelho tem prioridade sobre o padrão do config.js,
// para você poder trocar o link do túnel sem depender de uma publicação.
function baseUrlN8n() {
  const salvo = localStorage.getItem(CHAVE_URL);
  return (salvo || N8N_BASE_URL || "").replace(/\/+$/, "");
}

function urlWebhook(caminho) {
  return `${baseUrlN8n()}/webhook/${caminho}`;
}

const menuButton = document.getElementById("menu-button");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");

function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("show");
  menuButton.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("show");
  menuButton.setAttribute("aria-expanded", "false");
}

menuButton.addEventListener("click", () => {
  sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
});

sidebarOverlay.addEventListener("click", closeSidebar);

document.querySelectorAll(".sidebar-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-item").forEach((i) => i.classList.remove("active"));
    item.classList.add("active");

    const targetId = `page-${item.dataset.page}`;
    document.querySelectorAll(".page").forEach((page) => {
      page.classList.toggle("hidden", page.id !== targetId);
    });

    closeSidebar();
  });
});

// ----- Abas internas do Cadastro (Adicionar / Consultar) -----

document.querySelectorAll(".subtab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".subtab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const targetId = `subpage-${tab.dataset.subpage}`;
    document.querySelectorAll(".subpage").forEach((subpage) => {
      subpage.classList.toggle("hidden", subpage.id !== targetId);
    });
  });
});

// ----- Campo de CPF/CNPJ -----

const documentoInput = document.getElementById("documento");
const documentoHint = document.getElementById("documento-hint");
const tentarReceitaBotao = document.getElementById("tentar-receita");
const tipoCnpjBox = document.getElementById("tipo-cnpj");

const avisoExiste = document.getElementById("aviso-existe");
const formEntidade = document.getElementById("form-entidade");
const razaoSocialInput = document.getElementById("razao-social");
const nomeFantasiaInput = document.getElementById("nome-fantasia");
const emailsInput = document.getElementById("emails");
const whatsappInput = document.getElementById("whatsapp");
const administradoraInput = document.getElementById("administradora");
const observacoesInput = document.getElementById("observacoes");
const locaisBox = document.getElementById("locais");
const adicionarLocalBotao = document.getElementById("adicionar-local");
const modeloLocal = document.getElementById("modelo-local");
const salvarBotao = document.getElementById("salvar-entidade");
const salvarStatus = document.getElementById("salvar-status");

function formatarCPF(digitos) {
  const p = [digitos.slice(0, 3), digitos.slice(3, 6), digitos.slice(6, 9), digitos.slice(9, 11)];
  let saida = p[0];
  if (p[1]) saida += `.${p[1]}`;
  if (p[2]) saida += `.${p[2]}`;
  if (p[3]) saida += `-${p[3]}`;
  return saida;
}

function formatarCNPJ(digitos) {
  const p = [
    digitos.slice(0, 2),
    digitos.slice(2, 5),
    digitos.slice(5, 8),
    digitos.slice(8, 12),
    digitos.slice(12, 14),
  ];
  let saida = p[0];
  if (p[1]) saida += `.${p[1]}`;
  if (p[2]) saida += `.${p[2]}`;
  if (p[3]) saida += `/${p[3]}`;
  if (p[4]) saida += `-${p[4]}`;
  return saida;
}

// CPF e CNPJ têm dígitos verificadores: uma conta embutida no próprio
// número que denuncia erro de digitação.
function cpfValido(cpf) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digitoVerificador = (ate) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digitoVerificador(9) === Number(cpf[9]) && digitoVerificador(10) === Number(cpf[10]);
}

function cnpjValido(cnpj) {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const digitoVerificador = (pesos) => {
    const soma = pesos.reduce((total, peso, i) => total + Number(cnpj[i]) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  return (
    digitoVerificador(pesos1) === Number(cnpj[12]) &&
    digitoVerificador(pesos2) === Number(cnpj[13])
  );
}

function mostrarDica(tipo, mensagem) {
  documentoHint.textContent = mensagem;
  documentoHint.className = `doc-hint ${tipo}`;
}

// Cada grupo escolhe uma opção entre as suas — a escolha fica marcada no
// próprio botão, então não preciso guardar em variável separada.
function configurarGrupo(container, aoEscolher) {
  container.querySelectorAll(".opcao").forEach((botao) => {
    botao.addEventListener("click", () => {
      container.querySelectorAll(".opcao").forEach((b) => b.classList.remove("active"));
      botao.classList.add("active");
      if (aoEscolher) aoEscolher(botao);
    });
  });
}

function escolhaDoGrupo(container) {
  const ativo = container.querySelector(".opcao.active");
  return ativo ? ativo.dataset.valor : "";
}

const grupoTipo = document.getElementById("grupo-tipo");
const grupoExigencia = document.getElementById("grupo-exigencia");
const grupoStatus = document.getElementById("grupo-status");

configurarGrupo(grupoTipo, (botao) => mostrarDica("ok", `CNPJ válido · ${botao.textContent}`));
configurarGrupo(grupoExigencia);
configurarGrupo(grupoStatus);

function esconderFormulario() {
  formEntidade.classList.add("hidden");
  avisoExiste.classList.add("hidden");
  tentarReceitaBotao.classList.add("hidden");
}

function avaliarDocumento(digitos) {
  tipoCnpjBox.classList.add("hidden");
  grupoTipo.querySelectorAll(".opcao").forEach((b) => b.classList.remove("active"));
  esconderFormulario();

  if (digitos.length === 11) {
    if (cpfValido(digitos)) {
      mostrarDica("ok", "CPF válido · Pessoa Física");
      consultarDocumento(digitos);
    } else {
      // Ainda pode ser um CNPJ em digitação, então não trato como erro.
      mostrarDica("neutral", "Se for CPF, confira os números. Se for CNPJ, continue digitando.");
    }
    return;
  }

  if (digitos.length === 14) {
    if (cnpjValido(digitos)) {
      mostrarDica("ok", "CNPJ válido");
      tipoCnpjBox.classList.remove("hidden");
      consultarDocumento(digitos);
    } else {
      mostrarDica("error", "CNPJ inválido — confira os números.");
    }
    return;
  }

  mostrarDica("neutral", digitos.length === 0 ? "" : "Continue digitando...");
}

documentoInput.addEventListener("input", () => {
  const digitos = documentoInput.value.replace(/\D/g, "").slice(0, 14);
  documentoInput.value = digitos.length <= 11 ? formatarCPF(digitos) : formatarCNPJ(digitos);
  avaliarDocumento(digitos);
});

// ----- Locais de atendimento (um bloco por endereço) -----

// O número só aparece quando há mais de um: com um endereço só, "Endereço 1"
// seria informação sobrando.
function renumerarLocais() {
  const blocos = locaisBox.querySelectorAll(".local");
  blocos.forEach((bloco, i) => {
    bloco.querySelector(".local-titulo").textContent =
      blocos.length > 1 ? `Endereço ${i + 1}` : "Endereço";
    // Com um bloco só, remover deixaria a seção vazia e sem pista do que fazer.
    bloco.querySelector(".remover-local").classList.toggle("hidden", blocos.length < 2);
  });
}

function adicionarLocal(comFoco) {
  const bloco = modeloLocal.content.firstElementChild.cloneNode(true);

  bloco.querySelector(".remover-local").addEventListener("click", () => {
    bloco.remove();
    renumerarLocais();
  });

  locaisBox.appendChild(bloco);
  renumerarLocais();

  // Só puxa o cursor quando foi o usuário que pediu o bloco. Ao limpar o
  // formulário isso roubaria o foco de quem ainda está digitando o CPF/CNPJ.
  if (comFoco) bloco.querySelector(".local-nome").focus();
}

function reiniciarLocais() {
  locaisBox.innerHTML = "";
  adicionarLocal(false);
}

// Bloco totalmente em branco não vira registro no Airtable — quem abriu um
// endereço a mais e desistiu não deve gerar lixo na tabela.
function locaisPreenchidos() {
  return [...locaisBox.querySelectorAll(".local")]
    .map((bloco) => ({
      nome: bloco.querySelector(".local-nome").value.trim(),
      endereco: bloco.querySelector(".local-endereco").value.trim(),
      bairroCidade: bloco.querySelector(".local-bairro").value.trim(),
      acesso: bloco.querySelector(".local-acesso").value.trim(),
    }))
    .filter((local) => local.nome || local.endereco || local.bairroCidade || local.acesso);
}

adicionarLocalBotao.addEventListener("click", () => adicionarLocal(true));

// ----- Consulta ao n8n: já existe? e dados da Receita -----

let documentoAtual = "";

function limparFormulario() {
  [razaoSocialInput, nomeFantasiaInput, emailsInput, whatsappInput, administradoraInput,
   observacoesInput].forEach((campo) => (campo.value = ""));
  grupoExigencia.querySelectorAll(".opcao").forEach((b) => b.classList.remove("active"));
  reiniciarLocais();
  salvarStatus.className = "status";
}

async function consultarDocumento(digitos) {
  documentoAtual = digitos;
  limparFormulario();
  // O clique em "Tentar de novo" cai aqui direto, sem passar por
  // avaliarDocumento — então o botão precisa sumir por conta própria.
  tentarReceitaBotao.classList.add("hidden");
  mostrarDica("neutral", "Consultando...");

  try {
    const resposta = await fetch(urlWebhook("consultar-documento"), {
      method: "POST",
      body: new URLSearchParams({
        senha: passwordInput.value,
        documento: digitos,
      }),
    });

    const dados = await resposta.json().catch(() => null);

    // O campo pode ter mudado enquanto a consulta acontecia.
    if (documentoAtual !== digitos) return;

    if (!dados || !dados.ok) {
      mostrarDica("error", (dados && dados.mensagem) || "Não consegui consultar. Tente de novo.");
      return;
    }

    if (dados.jaExiste) {
      const nome = dados.entidade && dados.entidade.nome;
      avisoExiste.textContent = nome
        ? `Já cadastrado como "${nome}".`
        : "Esse CPF/CNPJ já está cadastrado.";
      avisoExiste.classList.remove("hidden");
      mostrarDica("neutral", "");
      return;
    }

    if (dados.receita) {
      razaoSocialInput.value = dados.receita.razaoSocial || "";
      nomeFantasiaInput.value = dados.receita.nomeFantasia || "";
      emailsInput.value = dados.receita.email || "";
      whatsappInput.value = dados.receita.telefone || "";
      mostrarDica("ok", "Dados encontrados na Receita — confira antes de salvar.");
    } else if (dados.avisoReceita) {
      // A Receita não preencheu e o n8n explicou por quê. Só ofereço tentar de
      // novo quando insistir resolve (excesso de consultas) — num CNPJ que não
      // existe, o botão só criaria esperança à toa.
      mostrarDica("aviso", dados.avisoReceita);
      tentarReceitaBotao.classList.toggle("hidden", !dados.podeTentarDeNovo);
    } else {
      mostrarDica("ok", digitos.length === 11 ? "CPF válido · Pessoa Física" : "CNPJ válido");
    }

    formEntidade.classList.remove("hidden");
  } catch (err) {
    if (documentoAtual !== digitos) return;
    mostrarDica("error", "Não foi possível falar com o n8n. Ele está ligado e o túnel ativo?");
  }
}

tentarReceitaBotao.addEventListener("click", () => consultarDocumento(documentoAtual));

// ----- Salvar a entidade -----

formEntidade.addEventListener("submit", async (event) => {
  event.preventDefault();

  const tipo =
    documentoAtual.length === 11 ? "CPF - Pessoa Física" : escolhaDoGrupo(grupoTipo);

  if (!tipo) {
    salvarStatus.textContent = "Escolha se é condomínio ou empresa.";
    salvarStatus.className = "status show error";
    return;
  }

  salvarBotao.disabled = true;
  salvarStatus.textContent = "Salvando...";
  salvarStatus.className = "status show loading";

  try {
    const resposta = await fetch(urlWebhook("salvar-entidade"), {
      method: "POST",
      body: new URLSearchParams({
        senha: passwordInput.value,
        documento: documentoAtual,
        tipo,
        razaoSocial: razaoSocialInput.value.trim(),
        nomeFantasia: nomeFantasiaInput.value.trim(),
        exigenciaFiscal: escolhaDoGrupo(grupoExigencia),
        emails: emailsInput.value.trim(),
        whatsapp: whatsappInput.value.trim(),
        administradora: administradoraInput.value.trim(),
        status: escolhaDoGrupo(grupoStatus),
        observacoes: observacoesInput.value.trim(),
        // Vai como texto JSON dentro de um campo só, para o envio continuar
        // sendo um formulário simples (sem a verificação extra do navegador).
        locais: JSON.stringify(locaisPreenchidos()),
      }),
    });

    const dados = await resposta.json().catch(() => null);

    if (dados && dados.ok) {
      salvarStatus.textContent = dados.mensagem || "Cadastro salvo!";
      salvarStatus.className = "status show ok";
      formEntidade.classList.add("hidden");
      documentoInput.value = "";
      documentoAtual = "";
      tipoCnpjBox.classList.add("hidden");
      mostrarDica("neutral", "");
    } else {
      salvarStatus.textContent = (dados && dados.mensagem) || "Não consegui salvar. Tente de novo.";
      salvarStatus.className = "status show error";
    }
  } catch (err) {
    salvarStatus.textContent = "Não foi possível falar com o n8n. Ele está ligado?";
    salvarStatus.className = "status show error";
  } finally {
    salvarBotao.disabled = false;
  }
});

// ----- Tela de entrada (senha) -----

function showStatus(kind, message) {
  statusBox.textContent = message;
  statusBox.className = `status show ${kind}`;
}

async function entrar(senha) {
  if (!baseUrlN8n()) {
    showStatus("error", "Falta o endereço do n8n — toque em '⚙ Endereço do n8n' abaixo.");
    return;
  }

  testButton.disabled = true;
  showStatus("loading", "Conectando ao n8n...");

  try {
    // Enviado como formulário simples de propósito: assim o navegador não
    // precisa fazer a verificação extra de segurança (CORS preflight).
    const response = await fetch(urlWebhook("testar-conexao"), {
      method: "POST",
      body: new URLSearchParams({ senha }),
    });

    const data = await response.json().catch(() => null);

    if (data && data.ok) {
      if (lembrarSenha.checked) {
        localStorage.setItem(CHAVE_SENHA, senha);
      } else {
        localStorage.removeItem(CHAVE_SENHA);
      }

      showStatus("ok", data.mensagem || "Conectado com sucesso!");
      gateView.classList.add("hidden");
      appView.classList.remove("hidden");
    } else {
      // Senha recusada: não adianta manter a que estava guardada.
      localStorage.removeItem(CHAVE_SENHA);
      showStatus("error", (data && data.mensagem) || "Acesso negado. Confira a senha.");
    }
  } catch (err) {
    showStatus("error", "Não foi possível falar com o n8n. Ele está ligado e o túnel ativo?");
  } finally {
    testButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  entrar(passwordInput.value);
});

// ----- Ajuste do endereço do n8n -----

function mostrarConfigHint(tipo, mensagem) {
  configHint.textContent = mensagem;
  configHint.className = `config-hint ${tipo}`;
}

toggleConfig.addEventListener("click", () => {
  configBox.classList.toggle("hidden");
});

salvarUrlBotao.addEventListener("click", () => {
  const valor = n8nUrlInput.value.trim().replace(/\/+$/, "");

  if (!valor.startsWith("https://")) {
    mostrarConfigHint("error", "O endereço precisa começar com https://");
    return;
  }

  localStorage.setItem(CHAVE_URL, valor);
  n8nUrlInput.value = valor;
  mostrarConfigHint("ok", "Endereço salvo neste aparelho.");
});

restaurarUrlBotao.addEventListener("click", () => {
  localStorage.removeItem(CHAVE_URL);
  n8nUrlInput.value = N8N_BASE_URL;
  mostrarConfigHint("ok", "Voltou para o endereço padrão.");
});

// ----- Estado inicial da tela de entrada -----

n8nUrlInput.value = baseUrlN8n();

const senhaGuardada = localStorage.getItem(CHAVE_SENHA);
if (senhaGuardada) {
  passwordInput.value = senhaGuardada;
  lembrarSenha.checked = true;
  entrar(senhaGuardada);
}

if ("serviceWorker" in navigator) {
  // Só recarrega quando um service worker ATIVO é substituído por um novo
  // (atualização de verdade) — não na primeira vez que o app é aberto, que
  // também dispara este evento mas não deve interromper o que o usuário
  // está fazendo (ex: acabou de digitar a senha).
  let hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) {
      window.location.reload();
    }
    hadController = true;
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").then((registration) => {
      registration.update();
    });
  });
}
