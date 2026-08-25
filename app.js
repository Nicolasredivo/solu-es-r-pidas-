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
const APP_VERSION = "2026.08.25";

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

// ----- Abas internas de uma página -----

// A busca é feita dentro da página da aba clicada, e não no documento inteiro:
// sem isso, trocar de aba no Cadastro escondia também os blocos do Financeiro,
// que ficava em branco quando aberto depois.
function ligarAbasInternas(classeAba, atributo, prefixoId, classeBloco) {
  document.querySelectorAll(`.${classeAba}`).forEach((aba) => {
    aba.addEventListener("click", () => {
      const alvo = aba.dataset[atributo];
      if (!podeSair(`aba:${alvo}`)) {
        avisarPerda("Você tem alterações não salvas. Toque de novo para sair desta tela.");
        return;
      }

      const pagina = aba.closest(".page");
      pagina.querySelectorAll(`.${classeAba}`).forEach((t) => t.classList.remove("active"));
      aba.classList.add("active");

      const idAlvo = `${prefixoId}${alvo}`;
      pagina.querySelectorAll(`.${classeBloco}`).forEach((bloco) => {
        bloco.classList.toggle("hidden", bloco.id !== idAlvo);
      });
    });
  });
}

ligarAbasInternas("subtab", "subpage", "subpage-", "subpage");
ligarAbasInternas("subtab-fin", "subfin", "subfin-", "subpage-fin");

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
    bloco.querySelector(".local-status").value = dados.status || "Ativo";
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
      status: bloco.querySelector(".local-status").value,
    }))
    // O Status sozinho não conta como "preenchido": todo bloco em branco já
    // nasce com "Ativo" selecionado, então incluí-lo aqui faria um endereço
    // vazio virar registro no Airtable.
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
    bloco.querySelector(".contato-status").value = dados.status || "Ativo";
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
      status: bloco.querySelector(".contato-status").value,
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

// ----- Financeiro -----

const despesaForm = document.getElementById("form-despesa");
const novaDespesaBotao = document.getElementById("nova-despesa");
const cancelarDespesaBotao = document.getElementById("cancelar-despesa");
const salvarDespesaBotao = document.getElementById("salvar-despesa");
const despesaStatusMsg = document.getElementById("despesa-status-msg");
const buscaDespesa = document.getElementById("busca-despesa");
const filtroSituacao = document.getElementById("filtro-situacao");
const filtroMes = document.getElementById("filtro-mes");
const recarregarDespesasBotao = document.getElementById("recarregar-despesas");
const listaDespesasStatus = document.getElementById("lista-despesas-status");
const listaDespesasBox = document.getElementById("lista-despesas");
const modeloDespesa = document.getElementById("modelo-despesa");
const resumoDespesas = document.getElementById("resumo-despesas");
const linhaDataPagamento = document.getElementById("linha-data-pagamento");
const linhaCategoriaOutra = document.getElementById("linha-categoria-outra");
const linhaParcelas = document.getElementById("linha-parcelas");
const parcelasHint = document.getElementById("despesa-parcelas-hint");
const descricaoHint = document.getElementById("despesa-descricao-hint");

const recorrenteForm = document.getElementById("form-recorrente");
const novaRecorrenteBotao = document.getElementById("nova-recorrente");
const cancelarRecorrenteBotao = document.getElementById("cancelar-recorrente");
const salvarRecorrenteBotao = document.getElementById("salvar-recorrente");
const recorrenteStatusMsg = document.getElementById("recorrente-status-msg");
const listaRecorrentesStatus = document.getElementById("lista-recorrentes-status");
const listaRecorrentesBox = document.getElementById("lista-recorrentes");
const modeloRecorrente = document.getElementById("modelo-recorrente");
const linhaRestantes = document.getElementById("linha-restantes");
const linhaRecorrenteCategoriaOutra = document.getElementById("linha-recorrente-categoria-outra");

const modeloBarra = document.getElementById("modelo-barra");
const listaFornecedoresDatalist = document.getElementById("lista-fornecedores");
const listaDescricoesDatalist = document.getElementById("lista-descricoes");
const listaCategoriasDatalist = document.getElementById("lista-categorias");

const despesaCampos = {
  descricao: document.getElementById("despesa-descricao"),
  valor: document.getElementById("despesa-valor"),
  fornecedor: document.getElementById("despesa-fornecedor"),
  vencimento: document.getElementById("despesa-vencimento"),
  categoria: document.getElementById("despesa-categoria"),
  categoriaOutra: document.getElementById("despesa-categoria-outra"),
  forma: document.getElementById("despesa-forma"),
  parcelas: document.getElementById("despesa-parcelas"),
  status: document.getElementById("despesa-status"),
  dataPagamento: document.getElementById("despesa-data-pagamento"),
  observacoes: document.getElementById("despesa-observacoes"),
};

const recorrenteCampos = {
  descricao: document.getElementById("recorrente-descricao"),
  valor: document.getElementById("recorrente-valor"),
  fornecedor: document.getElementById("recorrente-fornecedor"),
  dia: document.getElementById("recorrente-dia"),
  semFim: document.getElementById("recorrente-sem-fim"),
  restantes: document.getElementById("recorrente-restantes"),
  categoria: document.getElementById("recorrente-categoria"),
  categoriaOutra: document.getElementById("recorrente-categoria-outra"),
  forma: document.getElementById("recorrente-forma"),
  observacoes: document.getElementById("recorrente-observacoes"),
};

// As três listas ficam em memória depois do primeiro carregamento: filtrar,
// buscar e montar o resumo não custa nenhuma ida ao n8n.
let despesas = [];
let fornecedores = [];
let recorrentes = [];
let financeiroCarregado = false;

// Guardam o código quando um formulário está editando algo que já existe;
// vazio significa item novo.
let despesaEditando = "";
let recorrenteEditando = "";

// Formas de pagamento que costumam ser parceladas — só nelas o campo de
// quantidade de vezes aparece, para não poluir um PIX à vista.
const FORMAS_PARCELAVEIS = ["Cartão de crédito", "Boleto"];

// ----- Números, datas e dinheiro -----

function dinheiro(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Data vem do Airtable como "2026-09-10"; na tela mostramos "10/09/2026".
function dataBonita(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = String(iso).slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

function hojeISO() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

const NOMES_DOS_MESES = ["jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez"];

function mesBonito(anoMes) {
  const [ano, mes] = String(anoMes).split("-");
  return `${NOMES_DOS_MESES[Number(mes) - 1] || mes}/${String(ano).slice(2)}`;
}

// Monta uma data escolhendo o dia sem estourar o mês: dia 31 em fevereiro vira
// 28 (ou 29), não 3 de março. Mesma regra que o n8n usa ao gerar as contas.
function diaNoMes(ano, mesIndex, dia) {
  const base = new Date(Date.UTC(ano, mesIndex, 1));
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const dd = String(Math.min(Math.max(1, dia), ultimo)).padStart(2, "0");
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  return `${base.getUTCFullYear()}-${mm}-${dd}`;
}

function somaUmMes(iso, diaDoMes) {
  const [ano, mes] = String(iso).slice(0, 10).split("-").map(Number);
  return diaNoMes(ano, mes, diaDoMes);
}

// Vencida é quem tem data no passado E ainda não foi paga.
function despesaVencida(despesa) {
  if (despesa.status === "Pago" || !despesa.vencimento) return false;
  return String(despesa.vencimento).slice(0, 10) < hojeISO();
}

// Acentuação e pontuação fora, para "Cimento CP-II" e "cimento cp ii" caírem
// no mesmo texto e a gente conseguir avisar que é a mesma coisa escrita de
// outro jeito.
function normalizarTexto(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// O campo de valor se comporta como calculadora: os dígitos entram pela
// direita e o R$, o ponto de milhar e a vírgula aparecem sozinhos.
function mascaraDinheiro(bruto) {
  const digitos = String(bruto).replace(/\D/g, "").slice(0, 11);
  if (!digitos) return "";
  return (Number(digitos) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function ligarMascaraDinheiro(campo) {
  campo.addEventListener("input", () => {
    campo.value = mascaraDinheiro(campo.value);
    // Cursor sempre no fim: como os dígitos entram pela direita, não existe
    // posição no meio para preservar.
    campo.setSelectionRange(campo.value.length, campo.value.length);
  });
}

function valorDoCampo(campo) {
  const digitos = String(campo.value).replace(/\D/g, "");
  return digitos ? Number(digitos) / 100 : 0;
}

function porValorNoCampo(campo, valor) {
  const centavos = Math.round(Number(valor || 0) * 100);
  campo.value = centavos > 0 ? mascaraDinheiro(String(centavos)) : "";
}

ligarMascaraDinheiro(despesaCampos.valor);
ligarMascaraDinheiro(recorrenteCampos.valor);

// ----- Avisos das duas telas -----

function mostrarDespesaStatus(tipo, mensagem) {
  despesaStatusMsg.textContent = mensagem;
  despesaStatusMsg.className = `status show ${tipo}`;
}

function mostrarListaDespesasStatus(tipo, mensagem) {
  listaDespesasStatus.textContent = mensagem;
  listaDespesasStatus.className = `doc-hint ${tipo}`;
}

function mostrarRecorrenteStatus(tipo, mensagem) {
  recorrenteStatusMsg.textContent = mensagem;
  recorrenteStatusMsg.className = `status show ${tipo}`;
}

function mostrarListaRecorrentesStatus(tipo, mensagem) {
  listaRecorrentesStatus.textContent = mensagem;
  listaRecorrentesStatus.className = `doc-hint ${tipo}`;
}

// ----- Campo de fornecedor (aceita nome ou CNPJ) -----

// Os dois formulários têm o mesmo campo, então a lógica mora aqui uma vez só:
// se o que foi digitado é um CNPJ, busca o nome na Receita; depois confere se
// esse fornecedor já existe para não cadastrar o mesmo duas vezes.
function ligarCampoFornecedor(campo, hint) {
  const estado = { id: "", cnpj: "" };

  function dizer(tipo, texto) {
    hint.textContent = texto;
    hint.className = `doc-hint ${tipo}`;
  }

  function casarComCadastrado() {
    const alvo = normalizarTexto(campo.value);
    if (!alvo) {
      estado.id = "";
      dizer("", "");
      return;
    }

    const achado = fornecedores.find((f) => normalizarTexto(f.nome) === alvo);
    estado.id = achado ? achado.id : "";

    if (achado) {
      // Adota a grafia já salva, para a lista não encher de variações.
      campo.value = achado.nome;
      dizer("", achado.cnpj ? `Já cadastrado · CNPJ ${achado.cnpj}` : "Já cadastrado.");
    } else {
      dizer("", "Fornecedor novo — vou cadastrar junto ao salvar.");
    }
  }

  async function resolver() {
    const texto = campo.value.trim();
    if (!texto) {
      estado.id = "";
      estado.cnpj = "";
      dizer("", "");
      return;
    }

    const digitos = texto.replace(/\D/g, "");
    // Só trata como CNPJ o que é número puro com 14 dígitos: um nome de
    // empresa com número no meio continua sendo nome.
    if (digitos.length === 14 && !/[a-zA-ZÀ-ÿ]/.test(texto)) {
      // Se esse CNPJ já está salvo, nem precisa incomodar a Receita.
      const jaSalvo = fornecedores.find((f) => f.cnpj === digitos);
      if (jaSalvo) {
        campo.value = jaSalvo.nome;
        estado.id = jaSalvo.id;
        estado.cnpj = digitos;
        dizer("", `Já cadastrado · CNPJ ${digitos}`);
        return;
      }

      dizer("", "Procurando na Receita...");
      try {
        const r = await pedirAoN8n("consultar-cnpj", { cnpj: digitos });
        if (r && r.ok && r.achou) {
          campo.value = r.razaoSocial;
          estado.cnpj = digitos;
          casarComCadastrado();
          return;
        }
        dizer("error", (r && (r.aviso || r.mensagem)) || "Não achei este CNPJ. Escreva o nome à mão.");
      } catch (err) {
        dizer("error", "Não consegui falar com o n8n para buscar o CNPJ.");
      }
      return;
    }

    estado.cnpj = "";
    casarComCadastrado();
  }

  campo.addEventListener("change", resolver);
  campo.addEventListener("blur", resolver);

  return {
    limpar() {
      campo.value = "";
      estado.id = "";
      estado.cnpj = "";
      dizer("", "");
    },
    preencher(id, nome) {
      campo.value = nome || "";
      estado.id = id || "";
      estado.cnpj = "";
      dizer("", nome && id ? "Já cadastrado." : "");
    },
    // Garante que o fornecedor digitado existe no Airtable e devolve o código.
    // Cadastra só quando é mesmo novo, então salvar duas despesas do mesmo
    // fornecedor não cria dois registros.
    async garantirId() {
      // Salvar logo depois de digitar pode chegar aqui antes de o campo ter
      // sido resolvido; resolver de novo é barato e evita cadastrar um CNPJ
      // como se fosse o nome da empresa.
      await resolver();

      const nome = campo.value.trim();
      if (!nome) return "";
      if (estado.id) return estado.id;

      const r = await pedirAoN8n("salvar-fornecedor", { nome, cnpj: estado.cnpj });
      if (!r || !r.ok) throw new Error((r && r.mensagem) || "Não consegui salvar o fornecedor.");

      estado.id = r.fornecedor.id;
      if (!fornecedores.some((f) => f.id === estado.id)) {
        fornecedores.push({ id: estado.id, nome: r.fornecedor.nome, cnpj: r.fornecedor.cnpj });
        atualizarListasDeApoio();
      }
      return estado.id;
    },
  };
}

const fornecedorDaDespesa = ligarCampoFornecedor(
  despesaCampos.fornecedor,
  document.getElementById("despesa-fornecedor-hint")
);
const fornecedorDaRecorrente = ligarCampoFornecedor(
  recorrenteCampos.fornecedor,
  document.getElementById("recorrente-fornecedor-hint")
);

// As despesas já chegam com o nome do fornecedor pronto do Airtable, mas as
// contas fixas trazem só o código — o cruzamento é feito aqui, com a lista que
// já está em memória, em vez de custar mais uma ida ao servidor.
function ligarNomesDosFornecedores() {
  const nomePorId = {};
  fornecedores.forEach((f) => (nomePorId[f.id] = f.nome));
  recorrentes.forEach((r) => (r.fornecedor = nomePorId[r.fornecedorId] || ""));
}

// ----- Listas de sugestão (evitam o mesmo dado escrito de vários jeitos) -----

function encherDatalist(datalist, valores) {
  datalist.innerHTML = "";
  valores.forEach((valor) => {
    const opcao = document.createElement("option");
    opcao.value = valor;
    datalist.appendChild(opcao);
  });
}

const CATEGORIAS_FIXAS = ["Material", "Veículo", "Salário", "Aluguel", "Outros"];

function atualizarListasDeApoio() {
  encherDatalist(
    listaFornecedoresDatalist,
    fornecedores.map((f) => f.nome).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"))
  );

  // Descrições sem o "(1/3)" das parcelas: sugerir "Compra de material (2/3)"
  // não ajudaria ninguém a repetir um lançamento.
  const descricoes = new Set();
  despesas.forEach((d) => descricoes.add(String(d.descricao || "").replace(/\s*\(\d+\/\d+\)\s*$/, "").trim()));
  recorrentes.forEach((r) => descricoes.add(String(r.descricao || "").trim()));
  descricoes.delete("");
  encherDatalist(listaDescricoesDatalist, Array.from(descricoes).sort((a, b) => a.localeCompare(b, "pt-BR")));

  // Categorias digitadas à mão em "Outros" viram sugestão nas próximas vezes.
  const categorias = new Set();
  despesas.forEach((d) => categorias.add(String(d.categoria || "").trim()));
  recorrentes.forEach((r) => categorias.add(String(r.categoria || "").trim()));
  CATEGORIAS_FIXAS.forEach((c) => categorias.delete(c));
  categorias.delete("");
  encherDatalist(listaCategoriasDatalist, Array.from(categorias).sort((a, b) => a.localeCompare(b, "pt-BR")));
}

// Avisa quando o que está sendo digitado é a mesma coisa que já existe escrita
// de outro jeito. Só avisa — quem decide se é o mesmo item é você, porque
// "Cimento" e "Cimento CP-II" podem ser produtos diferentes de verdade.
function conferirDescricaoParecida(campo, hint) {
  const digitado = campo.value.trim();
  const alvo = normalizarTexto(digitado);
  if (!alvo || alvo.length < 3) {
    hint.textContent = "";
    return;
  }

  const anteriores = new Set();
  despesas.forEach((d) => anteriores.add(String(d.descricao || "").replace(/\s*\(\d+\/\d+\)\s*$/, "").trim()));
  recorrentes.forEach((r) => anteriores.add(String(r.descricao || "").trim()));

  const parecida = Array.from(anteriores).find(
    (texto) => texto && texto !== digitado && normalizarTexto(texto) === alvo
  );

  hint.className = "doc-hint";
  hint.textContent = parecida ? `Você já lançou isto como "${parecida}".` : "";
}

despesaCampos.descricao.addEventListener("blur", () =>
  conferirDescricaoParecida(despesaCampos.descricao, descricaoHint)
);

// ----- Formulário de despesa -----

// Data do pagamento só faz sentido quando a despesa está paga.
function ajustarLinhaDataPagamento() {
  const pago = despesaCampos.status.value === "Pago";
  linhaDataPagamento.classList.toggle("hidden", !pago);
  if (pago && !despesaCampos.dataPagamento.value) {
    despesaCampos.dataPagamento.value = hojeISO();
  }
}

function ajustarCategoriaOutra(select, linha, campoTexto) {
  const outros = select.value === "Outros";
  linha.classList.toggle("hidden", !outros);
  if (!outros) campoTexto.value = "";
}

// Parcelamento só aparece nas formas em que ele existe, e some ao editar: cada
// parcela já é uma conta própria, então mudar o número de vezes depois teria
// que remexer em todas as outras.
function ajustarLinhaParcelas() {
  const podeParcelar =
    FORMAS_PARCELAVEIS.includes(despesaCampos.forma.value) && !despesaEditando;
  linhaParcelas.classList.toggle("hidden", !podeParcelar);
  if (!podeParcelar) {
    despesaCampos.parcelas.value = "1";
    parcelasHint.textContent = "";
    return;
  }
  mostrarContaDasParcelas();
}

function mostrarContaDasParcelas() {
  const vezes = Math.max(1, Math.min(60, Number(despesaCampos.parcelas.value) || 1));
  const total = valorDoCampo(despesaCampos.valor);

  if (vezes <= 1 || total <= 0) {
    parcelasHint.textContent = "";
    return;
  }

  // Mesma divisão em centavos que o n8n faz, para a tela mostrar exatamente o
  // que vai ser salvo.
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / vezes);
  const ultima = base + (centavos - base * vezes);
  const primeira = dataBonita(despesaCampos.vencimento.value);

  parcelasHint.className = "doc-hint";
  parcelasHint.textContent =
    base === ultima
      ? `${vezes}x de ${dinheiro(base / 100)}${primeira ? `, a partir de ${primeira}` : ""}.`
      : `${vezes - 1}x de ${dinheiro(base / 100)} + ${dinheiro(ultima / 100)}` +
        `${primeira ? `, a partir de ${primeira}` : ""}.`;
}

despesaCampos.status.addEventListener("change", ajustarLinhaDataPagamento);
despesaCampos.categoria.addEventListener("change", () =>
  ajustarCategoriaOutra(despesaCampos.categoria, linhaCategoriaOutra, despesaCampos.categoriaOutra)
);
despesaCampos.forma.addEventListener("change", ajustarLinhaParcelas);
despesaCampos.parcelas.addEventListener("input", mostrarContaDasParcelas);
despesaCampos.valor.addEventListener("input", mostrarContaDasParcelas);
despesaCampos.vencimento.addEventListener("change", mostrarContaDasParcelas);

function limparFormDespesa() {
  despesaEditando = "";
  Object.values(despesaCampos).forEach((campo) => {
    if (campo.type !== "checkbox") campo.value = "";
  });
  fornecedorDaDespesa.limpar();
  despesaCampos.categoria.value = "Outros";
  despesaCampos.status.value = "Pendente";
  despesaCampos.forma.value = "";
  despesaCampos.parcelas.value = "1";
  descricaoHint.textContent = "";
  ajustarLinhaDataPagamento();
  ajustarCategoriaOutra(despesaCampos.categoria, linhaCategoriaOutra, despesaCampos.categoriaOutra);
  ajustarLinhaParcelas();
  despesaStatusMsg.className = "status";
  salvarDespesaBotao.textContent = "Salvar despesa";
}

function abrirFormDespesa(despesa) {
  limparFormDespesa();

  if (despesa) {
    despesaEditando = despesa.id;
    despesaCampos.descricao.value = despesa.descricao || "";
    porValorNoCampo(despesaCampos.valor, despesa.valor);
    fornecedorDaDespesa.preencher(despesa.fornecedorId, despesa.fornecedor);
    despesaCampos.vencimento.value = String(despesa.vencimento || "").slice(0, 10);
    despesaCampos.forma.value = despesa.formaPagamento || "";
    despesaCampos.status.value = despesa.status || "Pendente";
    despesaCampos.dataPagamento.value = String(despesa.dataPagamento || "").slice(0, 10);
    despesaCampos.observacoes.value = despesa.observacoes || "";

    // Categoria fora da lista fixa entrou como texto livre; devolve o campo
    // "Outros" preenchido, para editar sem perder o que foi escrito.
    const categoria = despesa.categoria || "Outros";
    if (CATEGORIAS_FIXAS.includes(categoria)) {
      despesaCampos.categoria.value = categoria;
    } else {
      despesaCampos.categoria.value = "Outros";
      despesaCampos.categoriaOutra.value = categoria;
    }

    ajustarLinhaDataPagamento();
    ajustarCategoriaOutra(despesaCampos.categoria, linhaCategoriaOutra, despesaCampos.categoriaOutra);
    ajustarLinhaParcelas();
    salvarDespesaBotao.textContent = "Salvar alterações";
  }

  despesaForm.classList.remove("hidden");
  novaDespesaBotao.classList.add("hidden");
  despesaCampos.descricao.focus();
}

function fecharFormDespesa() {
  despesaForm.classList.add("hidden");
  novaDespesaBotao.classList.remove("hidden");
  limparFormDespesa();
}

novaDespesaBotao.addEventListener("click", () => abrirFormDespesa(null));
cancelarDespesaBotao.addEventListener("click", fecharFormDespesa);

function categoriaEscolhida(select, campoTexto) {
  return select.value === "Outros" && campoTexto.value.trim()
    ? campoTexto.value.trim()
    : select.value;
}

despesaForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!despesaCampos.descricao.value.trim()) {
    mostrarDespesaStatus("error", "Escreva uma descrição para a despesa.");
    return;
  }

  const valor = valorDoCampo(despesaCampos.valor);
  if (valor <= 0) {
    mostrarDespesaStatus("error", "Informe um valor maior que zero.");
    return;
  }

  const vezes = linhaParcelas.classList.contains("hidden")
    ? 1
    : Math.max(1, Math.min(60, Number(despesaCampos.parcelas.value) || 1));

  if (vezes > 1 && !despesaCampos.vencimento.value) {
    mostrarDespesaStatus("error", "Para parcelar, informe a data da primeira parcela.");
    return;
  }

  salvarDespesaBotao.disabled = true;
  mostrarDespesaStatus("loading", "Salvando...");

  try {
    const fornecedorId = await fornecedorDaDespesa.garantirId();

    const corpo = {
      descricao: despesaCampos.descricao.value.trim(),
      valor: String(valor),
      fornecedorId,
      vencimento: despesaCampos.vencimento.value,
      status: despesaCampos.status.value,
      categoria: categoriaEscolhida(despesaCampos.categoria, despesaCampos.categoriaOutra),
      formaPagamento: despesaCampos.forma.value,
      dataPagamento: despesaCampos.dataPagamento.value,
      observacoes: despesaCampos.observacoes.value.trim(),
    };
    if (despesaEditando) corpo.id = despesaEditando;
    else corpo.parcelas = String(vezes);

    const resposta = await pedirAoN8n(
      despesaEditando ? "atualizar-despesa" : "salvar-despesa",
      corpo
    );

    if (!resposta || !resposta.ok) {
      throw new Error((resposta && resposta.mensagem) || "Não consegui salvar.");
    }

    fecharFormDespesa();
    await recarregarDespesas();
    mostrarListaDespesasStatus("ok", resposta.mensagem || "Despesa salva!");
  } catch (err) {
    mostrarDespesaStatus("error", err.message || "Não foi possível falar com o n8n.");
  } finally {
    salvarDespesaBotao.disabled = false;
  }
});

// ----- Lista de despesas -----

function atualizarResumoDespesas() {
  const emAberto = despesas.filter((d) => d.status !== "Pago");
  const totalAberto = emAberto.reduce((soma, d) => soma + Number(d.valor || 0), 0);
  const totalVencidas = emAberto
    .filter(despesaVencida)
    .reduce((soma, d) => soma + Number(d.valor || 0), 0);

  // "Pago no mês" olha a data do pagamento, não a do vencimento: o que importa
  // aqui é quanto de dinheiro saiu neste mês.
  const mesAtual = hojeISO().slice(0, 7);
  const totalPago = despesas
    .filter((d) => d.status === "Pago" && String(d.dataPagamento || "").slice(0, 7) === mesAtual)
    .reduce((soma, d) => soma + Number(d.valor || 0), 0);

  document.getElementById("resumo-aberto").textContent = dinheiro(totalAberto);
  document.getElementById("resumo-vencidas").textContent = dinheiro(totalVencidas);
  document.getElementById("resumo-pago").textContent = dinheiro(totalPago);
  resumoDespesas.classList.toggle("hidden", despesas.length === 0);
}

// O filtro de mês só oferece meses que existem na lista, para não virar um
// menu quilométrico de datas vazias.
function atualizarFiltroDeMeses() {
  const escolhido = filtroMes.value;
  const meses = Array.from(
    new Set(despesas.map((d) => String(d.vencimento || "").slice(0, 7)).filter(Boolean))
  ).sort();

  filtroMes.innerHTML = '<option value="">Qualquer mês</option>';
  meses.forEach((mes) => {
    const opcao = document.createElement("option");
    opcao.value = mes;
    opcao.textContent = mesBonito(mes);
    filtroMes.appendChild(opcao);
  });

  filtroMes.value = meses.includes(escolhido) ? escolhido : "";
}

function despesaPassaNosFiltros(despesa, termo) {
  if (termo && !`${despesa.descricao} ${despesa.fornecedor} ${despesa.categoria}`
    .toLowerCase().includes(termo)) {
    return false;
  }

  if (filtroMes.value && String(despesa.vencimento || "").slice(0, 7) !== filtroMes.value) {
    return false;
  }

  const situacao = filtroSituacao.value;
  if (situacao === "abertas") return despesa.status !== "Pago";
  if (situacao === "vencidas") return despesaVencida(despesa);
  if (situacao === "pagas") return despesa.status === "Pago";
  return true;
}

function desenharDespesas() {
  const termo = buscaDespesa.value.trim().toLowerCase();
  const visiveis = despesas.filter((d) => despesaPassaNosFiltros(d, termo));

  listaDespesasBox.innerHTML = "";
  atualizarResumoDespesas();

  if (!despesas.length) {
    mostrarListaDespesasStatus("neutral", "Nenhuma despesa ainda.");
    return;
  }

  if (!visiveis.length) {
    mostrarListaDespesasStatus("neutral", "Nenhuma conta com esses filtros.");
    return;
  }

  const soma = visiveis.reduce((total, d) => total + Number(d.valor || 0), 0);
  mostrarListaDespesasStatus(
    "neutral",
    `${visiveis.length} de ${despesas.length} · ${dinheiro(soma)}`
  );

  visiveis.forEach((despesa) => listaDespesasBox.appendChild(montarLinhaDespesa(despesa)));
}

function montarLinhaDespesa(despesa) {
  const linha = modeloDespesa.content.firstElementChild.cloneNode(true);
  const vencida = despesaVencida(despesa);
  const paga = despesa.status === "Pago";

  linha.classList.toggle("paga", paga);
  linha.classList.toggle("vencida", vencida);

  linha.querySelector(".despesa-descricao").textContent = despesa.descricao || "(sem descrição)";
  linha.querySelector(".despesa-valor").textContent = dinheiro(despesa.valor);

  const partes = [];
  if (despesa.vencimento) {
    // "Vence" só faz sentido no futuro: data no passado é "venceu", mesmo que
    // a despesa já tenha sido paga.
    const passou = String(despesa.vencimento).slice(0, 10) < hojeISO();
    partes.push((passou ? "Venceu em " : "Vence em ") + dataBonita(despesa.vencimento));
  }
  if (paga) partes.push("Pago" + (despesa.dataPagamento ? " em " + dataBonita(despesa.dataPagamento) : ""));
  if (despesa.fornecedor) partes.push(despesa.fornecedor);
  if (despesa.categoria) partes.push(despesa.categoria);
  if (despesa.formaPagamento) partes.push(despesa.formaPagamento);
  if (despesa.recorrenteId) partes.push("conta fixa");
  linha.querySelector(".despesa-extra").textContent = partes.join(" · ");

  const acoes = linha.querySelector(".despesa-acoes");
  const botaoPagar = linha.querySelector(".despesa-pagar");
  const botaoEditar = linha.querySelector(".despesa-editar");
  const botaoExcluir = linha.querySelector(".despesa-excluir");
  const botaoExcluirGrupo = linha.querySelector(".despesa-excluir-grupo");

  // Despesa já paga não precisa do botão de pagar.
  botaoPagar.classList.toggle("hidden", paga);

  // Parcelas irmãs: dá para apagar a compra inteira sem caçar uma por uma.
  const irmas = despesa.grupo ? despesas.filter((d) => d.grupo === despesa.grupo) : [];
  botaoExcluirGrupo.classList.toggle("hidden", irmas.length < 2);
  if (irmas.length >= 2) {
    botaoExcluirGrupo.textContent = `Excluir as ${irmas.length} parcelas`;
  }

  linha.querySelector(".despesa-resumo").addEventListener("click", () => {
    const abrindo = acoes.classList.contains("hidden");
    // Uma aberta por vez: a lista fica curta e sem confusão no celular.
    listaDespesasBox.querySelectorAll(".despesa").forEach((outra) => {
      outra.classList.remove("aberta");
      outra.querySelector(".despesa-acoes").classList.add("hidden");
      desarmarConfirmacao(outra.querySelector(".despesa-excluir"), "Excluir");
    });
    acoes.classList.toggle("hidden", !abrindo);
    linha.classList.toggle("aberta", abrindo);
  });

  botaoEditar.addEventListener("click", () => {
    abrirFormDespesa(despesa);
    despesaForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  botaoPagar.addEventListener("click", async () => {
    botaoPagar.disabled = true;
    mostrarListaDespesasStatus("neutral", "Salvando...");
    try {
      const resposta = await pedirAoN8n("atualizar-despesa", {
        id: despesa.id,
        descricao: despesa.descricao,
        valor: String(despesa.valor),
        fornecedorId: despesa.fornecedorId || "",
        vencimento: despesa.vencimento || "",
        status: "Pago",
        categoria: despesa.categoria || "Outros",
        formaPagamento: despesa.formaPagamento || "",
        dataPagamento: hojeISO(),
        observacoes: despesa.observacoes || "",
      });

      if (!resposta || !resposta.ok) {
        mostrarListaDespesasStatus("error", (resposta && resposta.mensagem) || "Não consegui salvar.");
        return;
      }
      await recarregarDespesas();
      mostrarListaDespesasStatus("ok", "Marcada como paga.");
    } catch (err) {
      mostrarListaDespesasStatus("error", "Não foi possível falar com o n8n.");
    } finally {
      botaoPagar.disabled = false;
    }
  });

  ligarExclusao(botaoExcluir, "Excluir", "Confirmar exclusão", async () =>
    excluirDespesas([despesa.id], "Despesa excluída.")
  );

  ligarExclusao(
    botaoExcluirGrupo,
    botaoExcluirGrupo.textContent,
    "Confirmar: apagar todas",
    async () => excluirDespesas(irmas.map((d) => d.id), "Parcelas excluídas.")
  );

  return linha;
}

// O primeiro toque avisa, o segundo confirma — mesmo padrão do resto do app,
// em vez do alerta do navegador.
function ligarExclusao(botao, textoNormal, textoConfirmar, acao) {
  botao.addEventListener("click", async () => {
    if (!botao.classList.contains("confirmando")) {
      botao.classList.add("confirmando");
      botao.textContent = textoConfirmar;
      return;
    }

    botao.disabled = true;
    try {
      await acao();
    } finally {
      botao.disabled = false;
      desarmarConfirmacao(botao, textoNormal);
    }
  });
}

function desarmarConfirmacao(botao, textoNormal) {
  if (!botao) return;
  botao.classList.remove("confirmando");
  if (textoNormal) botao.textContent = textoNormal;
}

async function excluirDespesas(ids, mensagemOk) {
  try {
    const resposta = await pedirAoN8n("excluir-despesa", { ids: ids.join(",") });
    if (!resposta || !resposta.ok) {
      mostrarListaDespesasStatus("error", (resposta && resposta.mensagem) || "Não consegui excluir.");
      return;
    }
    despesas = despesas.filter((d) => !ids.includes(d.id));
    atualizarFiltroDeMeses();
    atualizarListasDeApoio();
    desenharDespesas();
    desenharResumo();
    mostrarListaDespesasStatus("ok", mensagemOk);
  } catch (err) {
    mostrarListaDespesasStatus("error", "Não foi possível falar com o n8n.");
  }
}

// ----- Contas fixas -----

function ajustarLinhaRestantes() {
  linhaRestantes.classList.toggle("hidden", recorrenteCampos.semFim.checked);
}

recorrenteCampos.semFim.addEventListener("change", ajustarLinhaRestantes);
recorrenteCampos.categoria.addEventListener("change", () =>
  ajustarCategoriaOutra(
    recorrenteCampos.categoria,
    linhaRecorrenteCategoriaOutra,
    recorrenteCampos.categoriaOutra
  )
);

function limparFormRecorrente() {
  recorrenteEditando = "";
  recorrenteCampos.descricao.value = "";
  recorrenteCampos.valor.value = "";
  recorrenteCampos.observacoes.value = "";
  recorrenteCampos.categoriaOutra.value = "";
  recorrenteCampos.dia.value = "10";
  recorrenteCampos.restantes.value = "12";
  recorrenteCampos.semFim.checked = false;
  recorrenteCampos.categoria.value = "Aluguel";
  recorrenteCampos.forma.value = "";
  fornecedorDaRecorrente.limpar();
  ajustarLinhaRestantes();
  ajustarCategoriaOutra(
    recorrenteCampos.categoria,
    linhaRecorrenteCategoriaOutra,
    recorrenteCampos.categoriaOutra
  );
  recorrenteStatusMsg.className = "status";
  salvarRecorrenteBotao.textContent = "Salvar conta fixa";
}

function abrirFormRecorrente(recorrente) {
  limparFormRecorrente();

  if (recorrente) {
    recorrenteEditando = recorrente.id;
    recorrenteCampos.descricao.value = recorrente.descricao || "";
    porValorNoCampo(recorrenteCampos.valor, recorrente.valor);
    fornecedorDaRecorrente.preencher(recorrente.fornecedorId, recorrente.fornecedor);
    recorrenteCampos.dia.value = String(recorrente.diaDoMes || 1);
    recorrenteCampos.semFim.checked = Boolean(recorrente.semFim);
    recorrenteCampos.restantes.value = String(recorrente.restantes || 1);
    recorrenteCampos.forma.value = recorrente.formaPagamento || "";
    recorrenteCampos.observacoes.value = recorrente.observacoes || "";

    const categoria = recorrente.categoria || "Outros";
    if (CATEGORIAS_FIXAS.includes(categoria)) {
      recorrenteCampos.categoria.value = categoria;
    } else {
      recorrenteCampos.categoria.value = "Outros";
      recorrenteCampos.categoriaOutra.value = categoria;
    }

    ajustarLinhaRestantes();
    ajustarCategoriaOutra(
      recorrenteCampos.categoria,
      linhaRecorrenteCategoriaOutra,
      recorrenteCampos.categoriaOutra
    );
    salvarRecorrenteBotao.textContent = "Salvar alterações";
  }

  recorrenteForm.classList.remove("hidden");
  novaRecorrenteBotao.classList.add("hidden");
  recorrenteCampos.descricao.focus();
}

function fecharFormRecorrente() {
  recorrenteForm.classList.add("hidden");
  novaRecorrenteBotao.classList.remove("hidden");
  limparFormRecorrente();
}

novaRecorrenteBotao.addEventListener("click", () => abrirFormRecorrente(null));
cancelarRecorrenteBotao.addEventListener("click", fecharFormRecorrente);

recorrenteForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!recorrenteCampos.descricao.value.trim()) {
    mostrarRecorrenteStatus("error", "Escreva uma descrição para a conta fixa.");
    return;
  }

  const valor = valorDoCampo(recorrenteCampos.valor);
  if (valor <= 0) {
    mostrarRecorrenteStatus("error", "Informe um valor maior que zero.");
    return;
  }

  salvarRecorrenteBotao.disabled = true;
  mostrarRecorrenteStatus("loading", "Salvando...");

  try {
    const fornecedorId = await fornecedorDaRecorrente.garantirId();

    const corpo = {
      descricao: recorrenteCampos.descricao.value.trim(),
      valor: String(valor),
      fornecedorId,
      diaDoMes: String(Math.max(1, Math.min(31, Number(recorrenteCampos.dia.value) || 1))),
      semFim: recorrenteCampos.semFim.checked ? "sim" : "",
      restantes: recorrenteCampos.semFim.checked ? "" : String(recorrenteCampos.restantes.value || ""),
      categoria: categoriaEscolhida(recorrenteCampos.categoria, recorrenteCampos.categoriaOutra),
      formaPagamento: recorrenteCampos.forma.value,
      observacoes: recorrenteCampos.observacoes.value.trim(),
    };
    if (recorrenteEditando) corpo.id = recorrenteEditando;

    const resposta = await pedirAoN8n("salvar-recorrente", corpo);
    if (!resposta || !resposta.ok) {
      throw new Error((resposta && resposta.mensagem) || "Não consegui salvar.");
    }

    fecharFormRecorrente();
    await recarregarFinanceiro();
    mostrarListaRecorrentesStatus("ok", resposta.mensagem || "Conta fixa salva!");
  } catch (err) {
    mostrarRecorrenteStatus("error", err.message || "Não foi possível falar com o n8n.");
  } finally {
    salvarRecorrenteBotao.disabled = false;
  }
});

function desenharRecorrentes() {
  listaRecorrentesBox.innerHTML = "";

  if (!recorrentes.length) {
    mostrarListaRecorrentesStatus("neutral", "Nenhuma conta fixa cadastrada.");
    return;
  }

  const ativas = recorrentes.filter((r) => r.ativo);
  const porMes = ativas.reduce((soma, r) => soma + Number(r.valor || 0), 0);
  mostrarListaRecorrentesStatus(
    "neutral",
    `${ativas.length} ativa${ativas.length === 1 ? "" : "s"} · ${dinheiro(porMes)} por mês`
  );

  // Ativas primeiro: as encerradas ficam no fim só como histórico.
  const ordenadas = [...recorrentes].sort((a, b) => Number(b.ativo) - Number(a.ativo));
  ordenadas.forEach((r) => listaRecorrentesBox.appendChild(montarLinhaRecorrente(r)));
}

function montarLinhaRecorrente(recorrente) {
  const linha = modeloRecorrente.content.firstElementChild.cloneNode(true);
  linha.classList.toggle("paga", !recorrente.ativo);

  linha.querySelector(".despesa-descricao").textContent = recorrente.descricao || "(sem descrição)";
  linha.querySelector(".despesa-valor").textContent = dinheiro(recorrente.valor) + "/mês";

  const partes = [`todo dia ${recorrente.diaDoMes}`];
  if (!recorrente.ativo) partes.push("encerrada");
  else if (recorrente.semFim) partes.push("sem data para acabar");
  else partes.push(`faltam ${recorrente.restantes}`);
  if (recorrente.ativo && recorrente.proximaGeracao) {
    partes.push("próxima em " + dataBonita(recorrente.proximaGeracao));
  }
  if (recorrente.fornecedor) partes.push(recorrente.fornecedor);
  if (recorrente.formaPagamento) partes.push(recorrente.formaPagamento);
  linha.querySelector(".despesa-extra").textContent = partes.join(" · ");

  const acoes = linha.querySelector(".despesa-acoes");
  const botaoEditar = linha.querySelector(".recorrente-editar");
  const botaoEncerrar = linha.querySelector(".recorrente-encerrar");
  const botaoExcluir = linha.querySelector(".recorrente-excluir");

  // Encerrar uma que já está encerrada não faria nada.
  botaoEncerrar.classList.toggle("hidden", !recorrente.ativo);

  linha.querySelector(".despesa-resumo").addEventListener("click", () => {
    const abrindo = acoes.classList.contains("hidden");
    listaRecorrentesBox.querySelectorAll(".despesa").forEach((outra) => {
      outra.classList.remove("aberta");
      outra.querySelector(".despesa-acoes").classList.add("hidden");
      desarmarConfirmacao(outra.querySelector(".recorrente-excluir"), "Excluir");
      desarmarConfirmacao(outra.querySelector(".recorrente-encerrar"), "Encerrar");
    });
    acoes.classList.toggle("hidden", !abrindo);
    linha.classList.toggle("aberta", abrindo);
  });

  botaoEditar.addEventListener("click", () => {
    abrirFormRecorrente(recorrente);
    recorrenteForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  // Encerrar guarda o histórico das contas que já saíram; excluir apaga a
  // regra de vez, para quando foi cadastro errado.
  ligarExclusao(botaoEncerrar, "Encerrar", "Confirmar: parar de gerar", async () =>
    mexerNaRecorrente(recorrente.id, "")
  );
  ligarExclusao(botaoExcluir, "Excluir", "Confirmar exclusão", async () =>
    mexerNaRecorrente(recorrente.id, "sim")
  );

  return linha;
}

async function mexerNaRecorrente(id, apagarDeVez) {
  try {
    const resposta = await pedirAoN8n("excluir-recorrente", { id, apagarDeVez });
    if (!resposta || !resposta.ok) {
      mostrarListaRecorrentesStatus("error", (resposta && resposta.mensagem) || "Não consegui alterar.");
      return;
    }
    await recarregarFinanceiro();
    mostrarListaRecorrentesStatus("ok", resposta.mensagem);
  } catch (err) {
    mostrarListaRecorrentesStatus("error", "Não foi possível falar com o n8n.");
  }
}

// ----- Resumo -----

function proximosMeses(quantos) {
  const meses = [];
  let ano = Number(hojeISO().slice(0, 4));
  let mes = Number(hojeISO().slice(5, 7));
  for (let i = 0; i < quantos; i += 1) {
    meses.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

// Junta o que já está lançado e em aberto com o que as contas fixas ainda vão
// gerar. Não conta duas vezes porque "próxima geração" sempre aponta para a
// primeira conta que ainda não foi lançada.
function projecaoDosProximosMeses() {
  const meses = proximosMeses(6);
  const total = {};
  meses.forEach((mes) => (total[mes] = 0));
  const primeiro = meses[0];

  despesas.forEach((despesa) => {
    if (despesa.status === "Pago") return;
    const mes = String(despesa.vencimento || "").slice(0, 7);
    // Atrasada ou sem data entra no mês corrente: é dinheiro que ainda precisa
    // sair, e o lugar de cobrar isso é agora.
    const alvo = mes && mes in total ? mes : mes && mes > primeiro ? null : primeiro;
    if (alvo) total[alvo] += Number(despesa.valor || 0);
  });

  const ultimo = meses[meses.length - 1];
  recorrentes.forEach((r) => {
    if (!r.ativo || !r.proximaGeracao) return;
    let data = String(r.proximaGeracao).slice(0, 10);
    let restam = r.semFim ? Infinity : Number(r.restantes || 0);
    let voltas = 0;

    while (data.slice(0, 7) <= ultimo && restam > 0 && voltas < 120) {
      const mes = data.slice(0, 7);
      if (mes in total) total[mes] += Number(r.valor || 0);
      restam -= 1;
      voltas += 1;
      data = somaUmMes(data, r.diaDoMes);
    }
  });

  return meses.map((mes) => ({ rotulo: mesBonito(mes), valor: total[mes] }));
}

function somarPor(chave) {
  const soma = {};
  despesas
    .filter((d) => d.status !== "Pago")
    .forEach((d) => {
      const rotulo = String(d[chave] || "").trim();
      if (!rotulo) return;
      soma[rotulo] = (soma[rotulo] || 0) + Number(d.valor || 0);
    });

  return Object.entries(soma)
    .map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor);
}

function desenharBarras(container, itens) {
  container.innerHTML = "";
  const maior = itens.reduce((m, i) => Math.max(m, i.valor), 0);

  itens.forEach((item) => {
    const linha = modeloBarra.content.firstElementChild.cloneNode(true);
    linha.querySelector(".barra-rotulo").textContent = item.rotulo;
    linha.querySelector(".barra-valor").textContent = dinheiro(item.valor);
    // Barra proporcional ao maior valor da lista: o que importa aqui é
    // comparar entre si, não com um teto fixo.
    linha.querySelector(".barra-cheia").style.width =
      maior > 0 ? `${Math.round((item.valor / maior) * 100)}%` : "0%";
    container.appendChild(linha);
  });
}

function desenharResumo() {
  const temAlgo = despesas.length > 0 || recorrentes.length > 0;
  document.getElementById("resumo-vazio").classList.toggle("hidden", temAlgo);
  document.getElementById("resumo-conteudo").classList.toggle("hidden", !temAlgo);
  if (!temAlgo) return;

  desenharBarras(document.getElementById("grafico-meses"), projecaoDosProximosMeses());
  desenharBarras(document.getElementById("grafico-categorias"), somarPor("categoria"));

  const porFornecedor = somarPor("fornecedor").slice(0, 8);
  document.getElementById("sem-fornecedores").classList.toggle("hidden", porFornecedor.length > 0);
  desenharBarras(document.getElementById("grafico-fornecedores"), porFornecedor);
}

// ----- Carregar tudo -----

// As três listas saem ao mesmo tempo de propósito: cada ida ao Airtable custa
// quase um segundo, e o navegador dá conta de esperar as três em paralelo — o
// n8n, não (ele executa um nó de cada vez).
async function carregarFinanceiro() {
  mostrarListaDespesasStatus("neutral", "Carregando...");
  listaDespesasBox.innerHTML = "";

  try {
    const [resDespesas, resFornecedores, resRecorrentes, resGeracao] = await Promise.all([
      pedirAoN8n("listar-despesas", {}),
      pedirAoN8n("listar-fornecedores", {}),
      pedirAoN8n("listar-recorrentes", {}),
      // Lança as contas fixas que já venceram. Se falhar, o resto da tela
      // carrega do mesmo jeito — é só o lançamento automático que fica para
      // a próxima abertura.
      pedirAoN8n("gerar-recorrentes", {}).catch(() => null),
    ]);

    if (!resDespesas || !resDespesas.ok) {
      mostrarListaDespesasStatus("error", (resDespesas && resDespesas.mensagem) || "Não consegui carregar.");
      return;
    }

    despesas = resDespesas.despesas || [];
    fornecedores = (resFornecedores && resFornecedores.fornecedores) || [];
    recorrentes = (resRecorrentes && resRecorrentes.recorrentes) || [];

    // A geração roda junto com a leitura, então o que ela criou não estava na
    // lista que acabou de chegar. Só quando gerou algo vale a pena reler.
    if (resGeracao && resGeracao.gerou > 0) {
      const [novasDespesas, novosRecorrentes] = await Promise.all([
        pedirAoN8n("listar-despesas", {}),
        pedirAoN8n("listar-recorrentes", {}),
      ]);
      if (novasDespesas && novasDespesas.ok) despesas = novasDespesas.despesas || [];
      if (novosRecorrentes && novosRecorrentes.ok) recorrentes = novosRecorrentes.recorrentes || [];
    }

    financeiroCarregado = true;
    ligarNomesDosFornecedores();
    atualizarListasDeApoio();
    atualizarFiltroDeMeses();
    desenharDespesas();
    desenharRecorrentes();
    desenharResumo();
  } catch (err) {
    mostrarListaDespesasStatus("error", "Não foi possível falar com o n8n. Ele está ligado e o túnel ativo?");
  }
}

// Depois de salvar uma despesa não é preciso reler fornecedores nem contas
// fixas: só a lista que mudou.
async function recarregarDespesas() {
  const resposta = await pedirAoN8n("listar-despesas", {});
  if (!resposta || !resposta.ok) {
    mostrarListaDespesasStatus("error", (resposta && resposta.mensagem) || "Não consegui recarregar.");
    return;
  }
  despesas = resposta.despesas || [];
  atualizarListasDeApoio();
  atualizarFiltroDeMeses();
  desenharDespesas();
  desenharResumo();
}

// Mexer numa conta fixa muda também as despesas que ela gerou.
async function recarregarFinanceiro() {
  const [resDespesas, resRecorrentes] = await Promise.all([
    pedirAoN8n("listar-despesas", {}),
    pedirAoN8n("listar-recorrentes", {}),
  ]);
  if (resDespesas && resDespesas.ok) despesas = resDespesas.despesas || [];
  if (resRecorrentes && resRecorrentes.ok) recorrentes = resRecorrentes.recorrentes || [];
  ligarNomesDosFornecedores();
  atualizarListasDeApoio();
  atualizarFiltroDeMeses();
  desenharDespesas();
  desenharRecorrentes();
  desenharResumo();
}

buscaDespesa.addEventListener("input", () => {
  if (financeiroCarregado) desenharDespesas();
});
filtroSituacao.addEventListener("change", () => {
  if (financeiroCarregado) desenharDespesas();
});
filtroMes.addEventListener("change", () => {
  if (financeiroCarregado) desenharDespesas();
});

recarregarDespesasBotao.addEventListener("click", carregarFinanceiro);

// Carrega sozinho na primeira vez que a página é aberta.
document.querySelector('.sidebar-item[data-page="financeiro"]').addEventListener("click", () => {
  if (!financeiroCarregado) carregarFinanceiro();
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

// Mesma ideia do cadastro: formulário do Financeiro aberto e com algo digitado
// é trabalho que se perde ao sair da tela. Os campos numéricos já nascem com
// valor (dia do mês, quantas faltam), então eles não contam como "digitado" —
// senão abrir o formulário e não escrever nada já travaria a saída.
function formularioFinanceiroEmAndamento() {
  return [despesaForm, recorrenteForm].some((form) => {
    if (form.classList.contains("hidden")) return false;
    return Array.from(form.querySelectorAll('input[type="text"], input[type="date"], textarea'))
      .some((campo) => campo.value.trim());
  });
}

function haAlgoParaPerder() {
  return cadastroEmAndamento() || edicaoDaConsultaAbertaEmEdicao() || formularioFinanceiroEmAndamento();
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
  // Formulário do Financeiro em andamento tem prioridade: se ele está aberto,
  // é onde o usuário está olhando agora.
  if (formularioFinanceiroEmAndamento()) {
    const alvo = recorrenteForm.classList.contains("hidden")
      ? mostrarDespesaStatus
      : mostrarRecorrenteStatus;
    alvo("error", mensagem);
    return;
  }

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
despesaForm.addEventListener("input", esquecerSaidaPendente);

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

  // O Financeiro também: valores em aberto não devem ficar na tela depois de
  // sair, nem sobrar em memória para o próximo login.
  fecharFormDespesa();
  fecharFormRecorrente();
  despesas = [];
  fornecedores = [];
  recorrentes = [];
  financeiroCarregado = false;
  listaDespesasBox.innerHTML = "";
  listaRecorrentesBox.innerHTML = "";
  buscaDespesa.value = "";
  filtroSituacao.value = "abertas";
  resumoDespesas.classList.add("hidden");
  document.getElementById("resumo-conteudo").classList.add("hidden");
  atualizarListasDeApoio();
  atualizarFiltroDeMeses();
  mostrarListaDespesasStatus("neutral", "");
  mostrarListaRecorrentesStatus("neutral", "");

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
