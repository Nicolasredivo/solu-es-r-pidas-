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

// Sobe junto com o CACHE_NAME do service-worker.js a cada publicação. Fica
// visível no rodapé do menu para dar uma resposta rápida à pergunta
// "será que a atualização já chegou neste aparelho?".
const APP_VERSION = "2026.08.21c";

// Toda conversa com o n8n passa por aqui: assim o indicador de conexão reflete
// as chamadas que o app já faz, sem ficar cutucando o servidor de tempos em
// tempos só para saber se ele está vivo.
async function fetchN8n(caminho, dados) {
  try {
    // Enviado como formulário simples de propósito: assim o navegador não
    // precisa fazer a verificação extra de segurança (CORS preflight).
    const resposta = await fetch(urlWebhook(caminho), {
      method: "POST",
      body: new URLSearchParams(dados),
    });
    marcarConexao(true);
    return resposta;
  } catch (err) {
    marcarConexao(false);
    throw err;
  }
}

const menuButton = document.getElementById("menu-button");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");

function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("show");
  menuButton.setAttribute("aria-expanded", "true");
  empilharCamada();
}

// Fecha sem mexer no histórico — usado quando quem mandou fechar foi o próprio
// botão voltar do aparelho, que já desfez a camada.
function fecharSidebarSemVoltar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("show");
  menuButton.setAttribute("aria-expanded", "false");
}

function closeSidebar() {
  const estavaAberta = sidebar.classList.contains("open");
  fecharSidebarSemVoltar();
  if (estavaAberta) desempilharCamada();
}

menuButton.addEventListener("click", () => {
  sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
});

sidebarOverlay.addEventListener("click", closeSidebar);

document.querySelectorAll(".sidebar-item[data-page]").forEach((item) => {
  item.addEventListener("click", () => {
    if (!podeSair(`pagina:${item.dataset.page}`)) {
      closeSidebar();
      avisarPerda("Você tem alterações não salvas. Toque de novo para sair desta tela.");
      return;
    }

    document.querySelectorAll(".sidebar-item[data-page]").forEach((i) =>
      i.classList.remove("active")
    );
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
    if (!podeSair(`aba:${tab.dataset.subpage}`)) {
      avisarPerda("Você tem alterações não salvas. Toque de novo para sair desta tela.");
      return;
    }

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
const whatsappCnpjInput = document.getElementById("whatsapp-cnpj");
const administradoraInput = document.getElementById("administradora");
const empresaSindicosInput = document.getElementById("empresa-sindicos");
const observacoesInput = document.getElementById("observacoes");
const locaisBox = document.getElementById("locais");
const adicionarLocalBotao = document.getElementById("adicionar-local");
const modeloLocal = document.getElementById("modelo-local");
const contatosBox = document.getElementById("contatos");
const adicionarContatoBotao = document.getElementById("adicionar-contato");
const modeloContato = document.getElementById("modelo-contato");
const modeloCanal = document.getElementById("modelo-canal");
const salvarBotao = document.getElementById("salvar-entidade");
const cancelarCadastroBotao = document.getElementById("cancelar-cadastro");
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

// ----- Telefone -----
//
// Guardamos sempre com o código do país (55) na frente, porque é o formato que
// API de mensagem consome direto. Na tela mostramos "+55 (54) 99999-9999".

// Devolve só o DDD + número, sem o código do país.
function parteLocalTelefone(valor) {
  const texto = String(valor || "");
  const digitos = texto.replace(/\D/g, "");

  // O "+" só aparece no formato que o próprio app escreve, e ali os dois
  // primeiros dígitos são sempre o código do país.
  if (texto.trim().startsWith("+")) return digitos.slice(2, 13);

  // Sem o "+", quem decide é o tamanho, nunca o prefixo: 55 também é DDD
  // (Santa Maria/RS), então "55999999999" é DDD 55 com celular — e não um
  // número que já viesse com o código do país.
  if (digitos.length === 12 || digitos.length === 13) return digitos.slice(2);
  return digitos.slice(0, 11);
}

function normalizarTelefone(valor) {
  const local = parteLocalTelefone(valor);
  if (!local) return "";

  // Só acrescenta o país a um número com cara de brasileiro completo. O resto
  // vai como está: inventar um 55 em cima de algo incompleto seria pior, e o
  // aviso âmbar já apontou o problema para quem digitou.
  if (local.length === 10 || local.length === 11) return `55${local}`;
  return local;
}

function formatarTelefone(valor) {
  const local = parteLocalTelefone(valor);
  if (!local) return "";

  let saida = `+55 (${local.slice(0, 2)}`;
  if (local.length >= 2) saida += ")";

  const resto = local.slice(2);
  if (!resto) return saida;

  // Celular tem 9 dígitos depois do DDD; fixo tem 8.
  const corte = resto.length > 8 ? 5 : 4;
  saida += ` ${resto.slice(0, corte)}`;
  if (resto.length > corte) saida += `-${resto.slice(corte)}`;
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

// Todas estas funções recebem a caixa onde os blocos ficam, porque as mesmas
// servem ao formulário de cadastro e à edição na aba Consultar.

// O número só aparece quando há mais de um: com um endereço só, "Endereço 1"
// seria informação sobrando.
function renumerarLocais(caixa) {
  const blocos = caixa.querySelectorAll(".local");
  blocos.forEach((bloco, i) => {
    bloco.querySelector(".local-titulo").textContent =
      blocos.length > 1 ? `Endereço ${i + 1}` : "Endereço";
    // Com um bloco só, remover deixaria a seção vazia e sem pista do que fazer.
    bloco.querySelector(".remover-local").classList.toggle("hidden", blocos.length < 2);
  });
}

function adicionarLocal(caixa, comFoco, dados) {
  const bloco = modeloLocal.content.firstElementChild.cloneNode(true);

  if (dados) {
    // Guarda o código do registro no Airtable: é o que diz, na hora de salvar,
    // se este endereço deve ser alterado ou criado do zero.
    if (dados.id) bloco.dataset.id = dados.id;
    bloco.querySelector(".local-nome").value = dados.nome || "";
    bloco.querySelector(".local-endereco").value = dados.endereco || "";
    bloco.querySelector(".local-bairro").value = dados.bairroCidade || "";
    bloco.querySelector(".local-acesso").value = dados.acesso || "";
  }

  bloco.querySelector(".remover-local").addEventListener("click", () => {
    bloco.remove();
    renumerarLocais(caixa);
  });

  caixa.appendChild(bloco);
  renumerarLocais(caixa);

  // Só puxa o cursor quando foi o usuário que pediu o bloco. Ao limpar o
  // formulário isso roubaria o foco de quem ainda está digitando o CPF/CNPJ.
  if (comFoco) bloco.querySelector(".local-nome").focus();
}

function reiniciarLocais(caixa, lista) {
  caixa.innerHTML = "";
  const itens = lista && lista.length ? lista : [null];
  itens.forEach((dados) => adicionarLocal(caixa, false, dados));
}

// Bloco totalmente em branco não vira registro no Airtable — quem abriu um
// endereço a mais e desistiu não deve gerar lixo na tabela.
function locaisPreenchidos(caixa) {
  return [...caixa.querySelectorAll(".local")]
    .map((bloco) => ({
      id: bloco.dataset.id || "",
      nome: bloco.querySelector(".local-nome").value.trim(),
      endereco: bloco.querySelector(".local-endereco").value.trim(),
      bairroCidade: bloco.querySelector(".local-bairro").value.trim(),
      acesso: bloco.querySelector(".local-acesso").value.trim(),
    }))
    .filter((local) => local.nome || local.endereco || local.bairroCidade || local.acesso);
}

adicionarLocalBotao.addEventListener("click", () => adicionarLocal(locaisBox, true));

// ----- Contatos / solicitantes -----
//
// Cada contato tem duas listas que crescem sem limite: WhatsApps e e-mails.
// No Airtable elas viram um campo só, com um valor por linha — assim nenhuma
// coluna nova precisa ser criada por causa de um cliente que tem dez telefones.

// Com uma linha só, tirar deixaria a lista vazia e o botão sem contexto.
function renumerarCanais(lista) {
  const linhas = lista.querySelectorAll(".canal");
  linhas.forEach((linha) => {
    linha.querySelector(".remover-canal").classList.toggle("hidden", linhas.length < 2);
  });
}

function adicionarCanal(lista, tipo, comFoco, valor) {
  const linha = modeloCanal.content.firstElementChild.cloneNode(true);
  const campo = linha.querySelector(".canal-valor");

  // Teclado do celular já abre no formato certo.
  if (tipo === "whatsapp") {
    campo.placeholder = "+55 (54) 99999-9999";
    campo.inputMode = "tel";
  } else {
    campo.placeholder = "nome@empresa.com.br";
    campo.inputMode = "email";
  }

  // O que vem do Airtable já tem o 55; na tela mostro formatado.
  if (valor) campo.value = tipo === "whatsapp" ? formatarTelefone(valor) : valor;

  linha.querySelector(".remover-canal").addEventListener("click", () => {
    linha.remove();
    renumerarCanais(lista);
  });

  lista.appendChild(linha);
  renumerarCanais(lista);
  if (comFoco) campo.focus();
}

function preencherCanais(lista, tipo, valores) {
  lista.innerHTML = "";
  const itens = valores && valores.length ? valores : [""];
  itens.forEach((valor) => adicionarCanal(lista, tipo, false, valor));
}

function valoresDosCanais(lista) {
  // A mesma lista serve para WhatsApp e e-mail; quem diz qual é dos dois é o
  // container. Esta função é usada tanto no Adicionar quanto no detalhe da
  // Consulta, então padronizar aqui cobre as duas telas de uma vez.
  const ehWhatsapp = lista.classList.contains("contato-whatsapps");

  return [...lista.querySelectorAll(".canal-valor")]
    .map((campo) => {
      const valor = campo.value.trim();
      return ehWhatsapp ? normalizarTelefone(valor) : valor;
    })
    .filter(Boolean);
}

function renumerarContatos(caixa) {
  const blocos = caixa.querySelectorAll(".contato");
  blocos.forEach((bloco, i) => {
    bloco.querySelector(".contato-titulo").textContent =
      blocos.length > 1 ? `Contato ${i + 1}` : "Contato";
    bloco.querySelector(".remover-contato").classList.toggle("hidden", blocos.length < 2);
  });
}

function adicionarContato(caixa, comFoco, dados) {
  const bloco = modeloContato.content.firstElementChild.cloneNode(true);
  const whatsapps = bloco.querySelector(".contato-whatsapps");
  const emails = bloco.querySelector(".contato-emails");

  if (dados) {
    if (dados.id) bloco.dataset.id = dados.id;
    bloco.querySelector(".contato-nome").value = dados.nome || "";
    bloco.querySelector(".contato-cargo").value = dados.cargo || "";
    bloco.querySelector(".contato-obs").value = dados.observacoes || "";
  }

  // Cada contato já nasce com uma linha de cada, senão o campo fica invisível.
  preencherCanais(whatsapps, "whatsapp", dados && dados.whatsapps);
  preencherCanais(emails, "email", dados && dados.emails);

  bloco.querySelector(".adicionar-whatsapp")
    .addEventListener("click", () => adicionarCanal(whatsapps, "whatsapp", true));
  bloco.querySelector(".adicionar-email")
    .addEventListener("click", () => adicionarCanal(emails, "email", true));

  bloco.querySelector(".remover-contato").addEventListener("click", () => {
    bloco.remove();
    renumerarContatos(caixa);
  });

  caixa.appendChild(bloco);
  renumerarContatos(caixa);
  if (comFoco) bloco.querySelector(".contato-nome").focus();
}

function reiniciarContatos(caixa, lista) {
  caixa.innerHTML = "";
  const itens = lista && lista.length ? lista : [null];
  itens.forEach((dados) => adicionarContato(caixa, false, dados));
}

function contatosPreenchidos(caixa) {
  return [...caixa.querySelectorAll(".contato")]
    .map((bloco) => ({
      id: bloco.dataset.id || "",
      nome: bloco.querySelector(".contato-nome").value.trim(),
      cargo: bloco.querySelector(".contato-cargo").value,
      whatsapps: valoresDosCanais(bloco.querySelector(".contato-whatsapps")),
      emails: valoresDosCanais(bloco.querySelector(".contato-emails")),
      observacoes: bloco.querySelector(".contato-obs").value.trim(),
    }))
    .filter((c) => c.nome || c.whatsapps.length || c.emails.length || c.observacoes);
}

adicionarContatoBotao.addEventListener("click", () => adicionarContato(contatosBox, true));

// Trava ou destrava um pedaço da tela inteiro. Em modo leitura os botões somem
// pelo CSS, em vez de esconder um por um — assim a renumeração não briga com
// a visibilidade quando o bloco volta a ser editável.
function travarBlocos(caixa, travado) {
  caixa.classList.toggle("somente-leitura", travado);
  caixa.querySelectorAll("input, select, textarea").forEach((campo) => {
    campo.disabled = travado;
  });
}

// ----- Consulta ao n8n: já existe? e dados da Receita -----

let documentoAtual = "";

function limparFormulario() {
  [razaoSocialInput, nomeFantasiaInput, emailsInput, whatsappCnpjInput, administradoraInput,
   empresaSindicosInput, observacoesInput].forEach((campo) => (campo.value = ""));
  grupoExigencia.querySelectorAll(".opcao").forEach((b) => b.classList.remove("active"));
  reiniciarLocais(locaisBox);
  reiniciarContatos(contatosBox);
  desarmarCancelamento();
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
    const resposta = await fetchN8n("consultar-documento", {
      senha: passwordInput.value,
      documento: digitos,
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

    // O endereço da Receita vira o primeiro bloco, já preenchido. Continua
    // dando para apagá-lo ou acrescentar outros normalmente.
    if (dados.endereco) reiniciarLocais(locaisBox, [dados.endereco]);

    if (dados.receita) {
      razaoSocialInput.value = dados.receita.razaoSocial || "";
      nomeFantasiaInput.value = dados.receita.nomeFantasia || "";
      emailsInput.value = dados.receita.email || "";
      whatsappCnpjInput.value = formatarTelefone(dados.receita.telefone);
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

// Cancelar pede dois cliques, como o Excluir: o cadastro costuma ter bastante
// coisa digitada, e um toque sem querer apagaria tudo.
function desarmarCancelamento() {
  cancelarCadastroBotao.classList.remove("confirmando");
  cancelarCadastroBotao.textContent = "Cancelar";
}

cancelarCadastroBotao.addEventListener("click", () => {
  if (!cancelarCadastroBotao.classList.contains("confirmando")) {
    cancelarCadastroBotao.classList.add("confirmando");
    cancelarCadastroBotao.textContent = "Confirmar cancelamento";
    salvarStatus.textContent = "Isto apaga o que você digitou. Clique de novo para confirmar.";
    salvarStatus.className = "status show error";
    return;
  }

  limparFormulario();
  esconderFormulario();
  documentoInput.value = "";
  documentoAtual = "";
  tipoCnpjBox.classList.add("hidden");
  mostrarDica("neutral", "");
});

formEntidade.addEventListener("submit", async (event) => {
  event.preventDefault();
  desarmarCancelamento();

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
        whatsappCnpj: normalizarTelefone(whatsappCnpjInput.value),
        administradora: administradoraInput.value.trim(),
        empresaSindicos: empresaSindicosInput.value.trim(),
        status: escolhaDoGrupo(grupoStatus),
        observacoes: observacoesInput.value.trim(),
        // Vai como texto JSON dentro de um campo só, para o envio continuar
        // sendo um formulário simples (sem a verificação extra do navegador).
        locais: JSON.stringify(locaisPreenchidos(locaisBox)),
        contatos: JSON.stringify(contatosPreenchidos(contatosBox)),
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

// ----- Consultar cadastros -----

const buscaInput = document.getElementById("busca-cadastro");
const recarregarBotao = document.getElementById("recarregar-lista");
const listaStatus = document.getElementById("lista-status");
const listaBox = document.getElementById("lista-cadastros");
const modeloLinha = document.getElementById("modelo-linha");
const modeloDetalhe = document.getElementById("modelo-detalhe");

let cadastros = [];
let listaCarregada = false;

function mostrarListaStatus(tipo, mensagem) {
  listaStatus.textContent = mensagem;
  listaStatus.className = `doc-hint ${tipo}`;
}

// Toda ação manda a senha junto: o n8n é quem confere, nunca a tela.
async function pedirAoN8n(caminho, dados) {
  const resposta = await fetchN8n(caminho, { senha: passwordInput.value, ...dados });
  return resposta.json();
}

function formatarDocumento(digitos) {
  if (digitos.length === 11) return formatarCPF(digitos);
  if (digitos.length === 14) return formatarCNPJ(digitos);
  return digitos;
}

function documentoValido(digitos) {
  // Cadastro antigo pode estar sem documento; não trava por causa disso.
  if (!digitos) return true;
  if (digitos.length === 11) return cpfValido(digitos);
  if (digitos.length === 14) return cnpjValido(digitos);
  return false;
}

async function carregarLista() {
  mostrarListaStatus("neutral", "Carregando...");
  listaBox.innerHTML = "";

  try {
    const dados = await pedirAoN8n("listar-cadastros", {});

    if (!dados || !dados.ok) {
      mostrarListaStatus("error", (dados && dados.mensagem) || "Não consegui carregar a lista.");
      return;
    }

    cadastros = dados.cadastros || [];
    listaCarregada = true;
    desenharLista();
  } catch (err) {
    mostrarListaStatus("error", "Não foi possível falar com o n8n. Ele está ligado e o túnel ativo?");
  }
}

function desenharLista() {
  const termo = buscaInput.value.trim().toLowerCase();
  const digitos = termo.replace(/\D/g, "");

  const visiveis = cadastros.filter((c) => {
    if (!termo) return true;
    const texto = `${c.razaoSocial} ${c.nomeFantasia} ${c.contato}`.toLowerCase();
    // Procurar por número ignora a pontuação do CPF/CNPJ.
    return texto.includes(termo) || (digitos !== "" && c.documento.includes(digitos));
  });

  listaBox.innerHTML = "";

  if (!cadastros.length) {
    mostrarListaStatus("neutral", "Nenhum cadastro ainda.");
    return;
  }

  if (!visiveis.length) {
    mostrarListaStatus("neutral", `Nada encontrado para "${buscaInput.value.trim()}".`);
    return;
  }

  mostrarListaStatus(
    "neutral",
    visiveis.length === cadastros.length
      ? `${cadastros.length} cadastro${cadastros.length > 1 ? "s" : ""}.`
      : `${visiveis.length} de ${cadastros.length} cadastros.`
  );

  visiveis.forEach((cadastro) => listaBox.appendChild(montarLinha(cadastro)));
}

function atualizarResumo(linha, cadastro) {
  linha.querySelector(".cadastro-doc").textContent =
    formatarDocumento(cadastro.documento) || "(sem CPF/CNPJ)";
  linha.querySelector(".cadastro-razao").textContent = cadastro.razaoSocial || "(sem nome)";
  linha.querySelector(".cadastro-extra").textContent =
    [cadastro.nomeFantasia, cadastro.contato].filter(Boolean).join(" · ");
}

function montarLinha(cadastro) {
  const linha = modeloLinha.content.firstElementChild.cloneNode(true);
  atualizarResumo(linha, cadastro);

  const caixa = linha.querySelector(".cadastro-detalhe");
  linha.querySelector(".cadastro-resumo").addEventListener("click", () => {
    if (linha.classList.contains("aberto")) fecharLinha(linha);
    else abrirLinha(linha, caixa, cadastro);
  });

  return linha;
}

function fecharLinhaSemVoltar(linha) {
  linha.classList.remove("aberto");
  const caixa = linha.querySelector(".cadastro-detalhe");
  caixa.classList.add("hidden");
  caixa.innerHTML = "";
}

function fecharLinha(linha) {
  fecharLinhaSemVoltar(linha);
  desempilharCamada();
}

async function abrirLinha(linha, caixa, cadastro, avisoDepois) {
  // Um aberto por vez: dois cadastros abertos ao mesmo tempo confundem mais do
  // que ajudam, ainda mais no celular.
  const jaHaviaAberto = Boolean(listaBox.querySelector(".cadastro.aberto"));
  listaBox.querySelectorAll(".cadastro.aberto").forEach(fecharLinhaSemVoltar);
  if (!jaHaviaAberto) empilharCamada();

  linha.classList.add("aberto");
  caixa.classList.remove("hidden");
  caixa.textContent = "Abrindo...";

  let dados;
  try {
    dados = await pedirAoN8n("detalhe-cadastro", {
      id: cadastro.id,
      documento: cadastro.documento,
    });
  } catch (err) {
    caixa.textContent = "Não consegui abrir. O n8n está ligado?";
    return;
  }

  if (!dados || !dados.ok) {
    caixa.textContent = (dados && dados.mensagem) || "Não consegui abrir este cadastro.";
    return;
  }

  caixa.textContent = "";
  caixa.appendChild(montarDetalhe(linha, cadastro, dados, avisoDepois));
}

function montarDetalhe(linha, resumo, dados, avisoDepois) {
  const bloco = modeloDetalhe.content.firstElementChild.cloneNode(true);
  const cadastro = dados.cadastro;

  const campos = {
    documento: bloco.querySelector(".d-documento"),
    razaoSocial: bloco.querySelector(".d-razao"),
    nomeFantasia: bloco.querySelector(".d-fantasia"),
    tipo: bloco.querySelector(".d-tipo"),
    exigenciaFiscal: bloco.querySelector(".d-exigencia"),
    emails: bloco.querySelector(".d-emails"),
    whatsappCnpj: bloco.querySelector(".d-whatsapp-cnpj"),
    administradora: bloco.querySelector(".d-administradora"),
    empresaSindicos: bloco.querySelector(".d-empresa-sindicos"),
    status: bloco.querySelector(".d-status"),
    observacoes: bloco.querySelector(".d-observacoes"),
  };

  // Repõe o que está salvo — serve para abrir e para desistir da edição.
  function preencher() {
    campos.documento.value = formatarDocumento(cadastro.documento);
    campos.razaoSocial.value = cadastro.razaoSocial;
    campos.nomeFantasia.value = cadastro.nomeFantasia;
    campos.tipo.value = cadastro.tipo;
    campos.exigenciaFiscal.value = cadastro.exigenciaFiscal;
    campos.emails.value = cadastro.emails;
    campos.whatsappCnpj.value = formatarTelefone(cadastro.whatsappCnpj);
    campos.administradora.value = cadastro.administradora;
    campos.empresaSindicos.value = cadastro.empresaSindicos || "";
    campos.status.value = cadastro.status || "Ativo";
    campos.observacoes.value = cadastro.observacoes;
  }
  preencher();

  campos.documento.addEventListener("input", () => {
    const digitos = campos.documento.value.replace(/\D/g, "").slice(0, 14);
    campos.documento.value = digitos.length <= 11 ? formatarCPF(digitos) : formatarCNPJ(digitos);
  });

  const caixaLocais = bloco.querySelector(".d-locais");
  const caixaContatos = bloco.querySelector(".d-contatos");
  const botaoNovoLocal = bloco.querySelector(".d-adicionar-local");
  const botaoNovoContato = bloco.querySelector(".d-adicionar-contato");

  // Os códigos que já existem no Airtable. O que sumir desta lista na hora de
  // salvar é o que o usuário removeu — e precisa ser apagado lá também.
  const idsLocaisOriginais = dados.locais.map((local) => local.id);
  const idsContatosOriginais = dados.contatos.map((contato) => contato.id);

  function avisarSeVazio(caixa, seletor, texto) {
    caixa.querySelectorAll(".vazio-leitura").forEach((aviso) => aviso.remove());
    if (caixa.querySelector(seletor)) return;

    const vazio = document.createElement("p");
    vazio.className = "vazio-leitura";
    vazio.textContent = texto;
    caixa.appendChild(vazio);
  }

  function mostrarVazios() {
    avisarSeVazio(caixaLocais, ".local", "Nenhum endereço cadastrado.");
    avisarSeVazio(caixaContatos, ".contato", "Nenhum contato cadastrado.");
  }

  // Repõe endereços e contatos como estão salvos — abrir e desistir usam isto.
  function preencherLigados() {
    caixaLocais.innerHTML = "";
    dados.locais.forEach((local) => adicionarLocal(caixaLocais, false, local));

    caixaContatos.innerHTML = "";
    dados.contatos.forEach((contato) => adicionarContato(caixaContatos, false, contato));

    mostrarVazios();
  }
  preencherLigados();

  botaoNovoLocal.addEventListener("click", () => adicionarLocal(caixaLocais, true));
  botaoNovoContato.addEventListener("click", () => adicionarContato(caixaContatos, true));

  const botaoEditar = bloco.querySelector(".acao-editar");
  const botaoSalvar = bloco.querySelector(".acao-salvar");
  const botaoCancelar = bloco.querySelector(".acao-cancelar");
  const botaoExcluir = bloco.querySelector(".acao-excluir");
  const botaoFechar = bloco.querySelector(".acao-fechar");
  const statusBox = bloco.querySelector(".detalhe-status");

  const editaveis = Object.values(campos);

  // Mantém "detalhe-status" na frente: sem ela o elemento perderia o nome pelo
  // qual é encontrado, e passaria a existir só na memória deste bloco.
  function mostrarStatus(tipo, mensagem) {
    statusBox.textContent = mensagem;
    statusBox.className = `detalhe-status status show ${tipo}`;
  }

  function limparStatus() {
    statusBox.textContent = "";
    statusBox.className = "detalhe-status status";
  }

  // Excluir só apaga no segundo clique; qualquer outra ação desarma.
  function desarmarExclusao() {
    botaoExcluir.classList.remove("confirmando");
    botaoExcluir.textContent = "Excluir";
  }

  function modoEdicao(ligado) {
    editaveis.forEach((campo) => (campo.disabled = !ligado));
    botaoEditar.classList.toggle("hidden", ligado);
    botaoSalvar.classList.toggle("hidden", !ligado);
    botaoCancelar.classList.toggle("hidden", !ligado);
    botaoNovoLocal.classList.toggle("hidden", !ligado);
    botaoNovoContato.classList.toggle("hidden", !ligado);

    travarBlocos(caixaLocais, !ligado);
    travarBlocos(caixaContatos, !ligado);

    if (ligado) {
      // Sem nenhum endereço ainda, entrar em edição já abre um bloco em branco:
      // senão o botão "+ Adicionar" seria a única pista do que fazer.
      caixaLocais.querySelectorAll(".vazio-leitura").forEach((aviso) => aviso.remove());
      caixaContatos.querySelectorAll(".vazio-leitura").forEach((aviso) => aviso.remove());
      if (!caixaLocais.querySelector(".local")) adicionarLocal(caixaLocais, false);
      if (!caixaContatos.querySelector(".contato")) adicionarContato(caixaContatos, false);
    } else {
      mostrarVazios();
    }

    desarmarExclusao();
    if (ligado) campos.razaoSocial.focus();
  }

  botaoEditar.addEventListener("click", () => {
    limparStatus();
    modoEdicao(true);
  });

  botaoCancelar.addEventListener("click", () => {
    preencher();
    preencherLigados();
    modoEdicao(false);
    limparStatus();
  });

  botaoFechar.addEventListener("click", () => fecharLinha(linha));

  botaoSalvar.addEventListener("click", async () => {
    const digitos = campos.documento.value.replace(/\D/g, "");

    if (!campos.razaoSocial.value.trim()) {
      mostrarStatus("error", "A razão social não pode ficar em branco.");
      return;
    }

    if (!documentoValido(digitos)) {
      mostrarStatus("error", "CPF/CNPJ inválido — confira os números.");
      return;
    }

    botaoSalvar.disabled = true;
    mostrarStatus("loading", "Salvando...");

    try {
      const locais = locaisPreenchidos(caixaLocais);
      const contatos = contatosPreenchidos(caixaContatos);
      const locaisAgora = locais.map((local) => local.id).filter(Boolean);
      const contatosAgora = contatos.map((contato) => contato.id).filter(Boolean);

      const resposta = await pedirAoN8n("atualizar-cadastro", {
        id: cadastro.id,
        documento: digitos,
        razaoSocial: campos.razaoSocial.value.trim(),
        nomeFantasia: campos.nomeFantasia.value.trim(),
        tipo: campos.tipo.value,
        exigenciaFiscal: campos.exigenciaFiscal.value,
        emails: campos.emails.value.trim(),
        whatsappCnpj: normalizarTelefone(campos.whatsappCnpj.value),
        administradora: campos.administradora.value.trim(),
        empresaSindicos: campos.empresaSindicos.value.trim(),
        status: campos.status.value,
        observacoes: campos.observacoes.value.trim(),
        locais: JSON.stringify(locais),
        contatos: JSON.stringify(contatos),
        // O que existia antes e sumiu da tela foi removido pelo usuário.
        locaisApagar: idsLocaisOriginais.filter((id) => !locaisAgora.includes(id)).join(","),
        contatosApagar: idsContatosOriginais.filter((id) => !contatosAgora.includes(id)).join(","),
      });

      if (!resposta || !resposta.ok) {
        mostrarStatus("error", (resposta && resposta.mensagem) || "Não consegui salvar.");
        return;
      }

      Object.assign(resumo, {
        documento: digitos,
        razaoSocial: campos.razaoSocial.value.trim(),
        nomeFantasia: campos.nomeFantasia.value.trim(),
      });
      atualizarResumo(linha, resumo);

      // Relê do n8n: é o que traz os códigos dos endereços e contatos recém
      // criados. Sem isso, salvar duas vezes seguidas criaria tudo de novo.
      await abrirLinha(linha, linha.querySelector(".cadastro-detalhe"), resumo,
        resposta.mensagem || "Alterações salvas!");
    } catch (err) {
      mostrarStatus("error", "Não foi possível falar com o n8n.");
    } finally {
      botaoSalvar.disabled = false;
    }
  });

  botaoExcluir.addEventListener("click", async () => {
    if (!botaoExcluir.classList.contains("confirmando")) {
      botaoExcluir.classList.add("confirmando");
      botaoExcluir.textContent = "Confirmar exclusão";

      const juntos = [];
      if (dados.locais.length) {
        juntos.push(`${dados.locais.length} endereço${dados.locais.length > 1 ? "s" : ""}`);
      }
      if (dados.contatos.length) {
        juntos.push(`${dados.contatos.length} contato${dados.contatos.length > 1 ? "s" : ""}`);
      }

      mostrarStatus("error", juntos.length
        ? `Isto apaga o cadastro e mais ${juntos.join(" e ")}. Clique de novo para confirmar.`
        : "Isto apaga o cadastro de vez. Clique de novo para confirmar.");
      return;
    }

    botaoExcluir.disabled = true;
    mostrarStatus("loading", "Excluindo...");

    try {
      const resposta = await pedirAoN8n("excluir-cadastro", {
        id: cadastro.id,
        locaisIds: dados.locais.map((local) => local.id).join(","),
        contatosIds: dados.contatos.map((contato) => contato.id).join(","),
      });

      if (!resposta || !resposta.ok) {
        mostrarStatus("error", (resposta && resposta.mensagem) || "Não consegui excluir.");
        desarmarExclusao();
        return;
      }

      cadastros = cadastros.filter((item) => item.id !== cadastro.id);
      desenharLista();
      mostrarListaStatus("ok", resposta.mensagem || "Cadastro excluído.");
    } catch (err) {
      mostrarStatus("error", "Não foi possível falar com o n8n.");
      desarmarExclusao();
    } finally {
      botaoExcluir.disabled = false;
    }
  });

  // Nasce travado: o lápis é quem destrava.
  modoEdicao(false);
  if (avisoDepois) mostrarStatus("ok", avisoDepois);

  return bloco;
}

buscaInput.addEventListener("input", () => {
  if (listaCarregada) desenharLista();
});

recarregarBotao.addEventListener("click", carregarLista);

// Carrega sozinho na primeira vez que a aba é aberta.
document.querySelector('.subtab[data-subpage="consultar"]').addEventListener("click", () => {
  if (!listaCarregada) carregarLista();
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
    const response = await fetchN8n("testar-conexao", { senha });

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

// ----- Indicador de conexão -----

const conexaoBox = document.getElementById("conexao");
const conexaoTexto = conexaoBox.querySelector(".conexao-texto");

function marcarConexao(ok) {
  const online = ok && navigator.onLine;
  conexaoBox.classList.toggle("offline", !online);
  conexaoTexto.textContent = online ? "conectado" : "sem conexão";
  conexaoBox.title = online
    ? "O app está falando com o n8n"
    : "Sem resposta do n8n — confira se ele e o túnel estão ligados";
}

// Ficar sem internet é motivo suficiente para avisar, sem esperar uma chamada
// falhar. Voltar a ter internet não garante que o n8n subiu, então a volta ao
// verde só acontece quando uma chamada de verdade dá certo.
window.addEventListener("offline", () => marcarConexao(false));

// ----- Versão do app -----

document.getElementById("versao-app").textContent = `versão ${APP_VERSION}`;

// ----- Proteger cadastro em andamento -----

// Só vale a pena avisar se há mesmo o que perder — e só quando o formulário
// está à vista. Voltar para a aba dele não descarta nada, então entrar nunca
// deve ser barrado; sair, sim.
function cadastroEmAndamento() {
  if (formEntidade.closest(".hidden")) return false;
  if (documentoInput.value.trim()) return true;
  return Array.from(formEntidade.querySelectorAll("input, textarea, select"))
    .some((campo) => campo.value.trim());
}

// A mesma proteção vale para um cadastro existente que está sendo editado na
// Consulta: o lápis já foi tocado, o Salvar ainda não. Basta um bloco aberto
// em edição — comparar campo a campo não traz benefício aqui, porque quem
// tocou no lápis já assumiu o risco de mexer em algo.
function edicaoDaConsultaAbertaEmEdicao() {
  const salvar = listaBox.querySelector(".cadastro.aberto .acao-salvar");
  return Boolean(salvar) && !salvar.classList.contains("hidden");
}

function haAlgoParaPerder() {
  return cadastroEmAndamento() || edicaoDaConsultaAbertaEmEdicao();
}

// Usado quando o usuário confirma que quer sair mesmo assim: devolve o bloco
// da Consulta ao estado salvo, clicando no próprio Cancelar dele — reaproveita
// a reversão que já existe, em vez de duplicá-la aqui.
function descartarEdicaoDaConsulta() {
  const cancelar = listaBox.querySelector(".cadastro.aberto .acao-cancelar");
  if (cancelar && !cancelar.classList.contains("hidden")) cancelar.click();
}

// Mesma ideia do Cancelar e do Excluir: o primeiro toque avisa, o segundo
// confirma. Uso o padrão daqui em vez do confirm() do navegador, que destoa
// do resto e no celular aparece como alerta de site.
let saidaPendente = null;

// O aviso precisa aparecer onde o usuário está olhando: se o risco é um
// cadastro sendo editado na Consulta, escrever em salvarStatus (que vive na
// aba Adicionar, hoje fora da tela) passaria batido.
function avisarPerda(mensagem) {
  const statusDaConsulta = listaBox.querySelector(".cadastro.aberto .detalhe-status");
  if (statusDaConsulta && edicaoDaConsultaAbertaEmEdicao()) {
    statusDaConsulta.textContent = mensagem;
    statusDaConsulta.className = "detalhe-status status show error";
    return;
  }

  salvarStatus.textContent = mensagem;
  salvarStatus.className = "status show error";
}

function podeSair(acao) {
  if (!haAlgoParaPerder()) {
    saidaPendente = null;
    descartarEdicaoDaConsulta();
    return true;
  }

  if (saidaPendente === acao) {
    saidaPendente = null;
    descartarEdicaoDaConsulta();
    return true;
  }

  saidaPendente = acao;
  return false;
}

// Digitar de novo (no cadastro novo ou numa edição aberta na Consulta)
// significa que a pessoa desistiu de sair.
function esquecerSaidaPendente() {
  saidaPendente = null;
  desarmarSaida();
}

formEntidade.addEventListener("input", esquecerSaidaPendente);
listaBox.addEventListener("input", esquecerSaidaPendente);

window.addEventListener("beforeunload", (event) => {
  if (!haAlgoParaPerder()) return;
  // Aqui quem decide o texto é o navegador; só sinalizo que há o que perder.
  event.preventDefault();
  event.returnValue = "";
});

// ----- Sair -----

const sairBotao = document.getElementById("sair");

function desarmarSaida() {
  sairBotao.classList.remove("confirmando");
  sairBotao.textContent = "Sair";
}

// Um único ciclo de dois toques, não dois empilhados: o primeiro toque já
// mostra "Confirmar saída" e, se houver algo em risco, o aviso específico
// junto. O segundo toque sai — o próprio aviso do primeiro já foi a
// confirmação de que descartar está tudo bem.
sairBotao.addEventListener("click", () => {
  if (!sairBotao.classList.contains("confirmando")) {
    sairBotao.classList.add("confirmando");
    sairBotao.textContent = "Confirmar saída";

    if (haAlgoParaPerder()) {
      closeSidebar();
      avisarPerda("Você tem alterações não salvas. Toque em Sair de novo para descartar e sair.");
    }
    return;
  }

  descartarEdicaoDaConsulta();

  // A senha guardada tem que ir embora, senão o app entraria sozinho de novo
  // e o Sair não teria efeito nenhum. O endereço do n8n fica: é ajuste do
  // aparelho, não da sessão.
  localStorage.removeItem(CHAVE_SENHA);
  passwordInput.value = "";
  lembrarSenha.checked = false;

  limparFormulario();
  esconderFormulario();
  documentoInput.value = "";
  documentoAtual = "";
  tipoCnpjBox.classList.add("hidden");
  mostrarDica("neutral", "");

  // A lista da Consulta some junto: o próximo login começa com dados
  // frescos do n8n, em vez do que ficou em memória desta sessão.
  listaBox.innerHTML = "";
  listaCarregada = false;
  buscaInput.value = "";
  mostrarListaStatus("neutral", "");

  desarmarSaida();
  closeSidebar();
  appView.classList.add("hidden");
  gateView.classList.remove("hidden");
  statusBox.className = "status";
});

// ----- Botão voltar do celular -----

// Duas camadas só: menu lateral e cadastro aberto na Consulta. Roteamento por
// URL seria mais do que este app precisa e mais fácil de quebrar.
let voltandoSozinho = false;

function empilharCamada() {
  history.pushState({ camada: true }, "");
}

function desempilharCamada() {
  if (history.state && history.state.camada) {
    voltandoSozinho = true;
    history.back();
  }
}

window.addEventListener("popstate", () => {
  // Voltar disparado pelo próprio app ao fechar algo: já está tudo fechado.
  if (voltandoSozinho) {
    voltandoSozinho = false;
    return;
  }

  if (sidebar.classList.contains("open")) {
    fecharSidebarSemVoltar();
    return;
  }

  const aberto = listaBox.querySelector(".cadastro.aberto");
  if (aberto) fecharLinhaSemVoltar(aberto);
});

// ----- Aviso de e-mail e telefone com jeito de errado -----

function pareceEmail(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim());
}

function pareceTelefone(valor) {
  // Conta só o DDD + número: o "+55" que aparece na tela somaria dois dígitos
  // e deixaria passar um número curto demais.
  const local = parteLocalTelefone(valor);
  return local.length === 10 || local.length === 11;
}

// O que decide a regra é onde o campo está, não o que ele é.
function tipoDoCampo(campo) {
  if (campo.id === "emails" || campo.classList.contains("d-emails")) return "emails";
  if (campo.id === "whatsapp-cnpj" || campo.classList.contains("d-whatsapp-cnpj")) {
    return "telefone";
  }

  if (campo.classList.contains("canal-valor")) {
    if (campo.closest(".contato-emails")) return "email";
    if (campo.closest(".contato-whatsapps")) return "telefone";
  }

  return null;
}

function mostrarAvisoCampo(campo, mensagem) {
  let aviso = campo.nextElementSibling;
  if (!aviso || !aviso.classList.contains("campo-aviso")) {
    if (!mensagem) return;
    aviso = document.createElement("p");
    aviso.className = "campo-aviso";
    campo.insertAdjacentElement("afterend", aviso);
  }

  aviso.textContent = mensagem;
  aviso.classList.toggle("hidden", !mensagem);
}

// Avisa, não impede: pode existir um caso legítimo que a regra não prevê, e
// travar o cadastro por causa disso seria pior que o erro de digitação.
function conferirCampo(campo) {
  const tipo = tipoDoCampo(campo);
  if (!tipo) return;

  const valor = campo.value.trim();
  if (!valor) {
    mostrarAvisoCampo(campo, "");
    return;
  }

  if (tipo === "telefone") {
    mostrarAvisoCampo(campo, pareceTelefone(valor) ? "" : "Isso não parece um telefone.");
    return;
  }

  if (tipo === "email") {
    mostrarAvisoCampo(campo, pareceEmail(valor) ? "" : "Isso não parece um e-mail.");
    return;
  }

  // Campo de vários e-mails: aponto quais das partes não passaram.
  const partes = valor.split(/[,;]/).map((parte) => parte.trim()).filter(Boolean);
  const ruins = partes.filter((parte) => !pareceEmail(parte));
  mostrarAvisoCampo(
    campo,
    ruins.length === 0
      ? ""
      : `Não parece e-mail: ${ruins.join(", ")}`
  );
}

document.addEventListener("input", (event) => {
  const campo = event.target;
  if (!(campo instanceof HTMLInputElement)) return;
  if (tipoDoCampo(campo) !== "telefone") return;
  campo.value = formatarTelefone(campo.value);
});

// Um ouvinte só, no documento: os campos de contato nascem depois, clonados
// dos moldes, e assim não preciso ligar nada em cada um que aparece.
document.addEventListener(
  "focusout",
  (event) => {
    if (event.target instanceof HTMLInputElement) conferirCampo(event.target);
  },
  true
);

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

// ----- Estado inicial da tela de entrada -----

n8nUrlInput.value = baseUrlN8n();

const senhaGuardada = localStorage.getItem(CHAVE_SENHA);
if (senhaGuardada) {
  passwordInput.value = senhaGuardada;
  lembrarSenha.checked = true;
  entrar(senhaGuardada);
}
