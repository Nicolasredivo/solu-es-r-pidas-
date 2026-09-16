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

// Confirmação rápida e discreta, pra ações que já têm feedback óbvio na
// tela (a lista atualiza, o formulário fecha) mas ainda merecem um "deu
// certo" visível -- ex: criar um chamado. Some sozinha, não trava nada.
const toastEl = document.getElementById("toast");
let toastTimer = null;
function mostrarToast(mensagem) {
  toastEl.textContent = mensagem;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

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
const APP_VERSION = "2026.09.16c";

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

// Grupo "Chamados" no menu: some tem duas telas (Criar/Consultar) que não
// cabem num botão só, então o "+" abre/fecha os dois por baixo dele --
// mesmo padrão simples de outros toggles do app (ver toggleConfig).
const chamadosGrupoBotao = document.getElementById("chamados-grupo-botao");
const chamadosGrupoItens = document.getElementById("chamados-grupo-itens");
chamadosGrupoBotao.addEventListener("click", () => {
  const abrindo = chamadosGrupoItens.classList.contains("hidden");
  chamadosGrupoItens.classList.toggle("hidden", !abrindo);
  chamadosGrupoBotao.setAttribute("aria-expanded", String(abrindo));
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

      // A aba que acabou de aparecer pode ter campos montados enquanto
      // estava escondida, e altura medida escondido sai zerada.
      ajustarAlturasAuto(pagina);
    });
  });
}

ligarAbasInternas("subtab", "subpage", "subpage-", "subpage");
ligarAbasInternas("subtab-fin", "subfin", "subfin-", "subpage-fin");

// ----- Campo de CPF/CNPJ -----

const documentoInput = document.getElementById("documento");
const documentoHint = document.getElementById("documento-hint");
const tentarReceitaBotao = document.getElementById("tentar-receita");
const semDocumentoBotao = document.getElementById("sem-documento");
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
  semDocumentoBotao.classList.remove("hidden");
}

// Marcado pelo botão "cadastrar só com o nome" -- digitar de novo no campo
// de documento desiste dessa opção e volta ao fluxo normal (ver
// avaliarDocumento abaixo).
let semDocumento = false;

function avaliarDocumento(digitos) {
  semDocumento = false;
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

// Pra quando a pessoa não tem o CPF em mãos: abre o formulário direto, sem
// consultar a Receita (não há o que consultar) e sem exigir documento —
// "Razão social / Nome" já é obrigatório pelo próprio campo (required),
// e o resto do cadastro (endereços, contatos etc.) continua igual. O CPF
// pode ser completado depois, editando o cadastro na Consulta.
semDocumentoBotao.addEventListener("click", () => {
  documentoInput.value = "";
  documentoAtual = "";
  semDocumento = true;
  tipoCnpjBox.classList.add("hidden");
  grupoTipo.querySelectorAll(".opcao").forEach((b) => b.classList.remove("active"));
  limparFormulario();
  avisoExiste.classList.add("hidden");
  tentarReceitaBotao.classList.add("hidden");
  mostrarDica("neutral", "Sem CPF por enquanto — dá para completar depois, editando o cadastro.");
  formEntidade.classList.remove("hidden");
  semDocumentoBotao.classList.add("hidden");
  razaoSocialInput.focus();
});

// Textarea não cresce sozinho. Mede o conteúdo e ajusta a altura, para o
// endereço aparecer inteiro mesmo com o campo travado — travado ele nem deixa
// rolar por dentro, então quem tem que crescer é o campo.
function ajustarAlturaAuto(campo) {
  campo.style.height = "auto";
  // A altura aqui inclui a borda (box-sizing: border-box no projeto inteiro),
  // mas scrollHeight conta só conteúdo e espaçamento. Sem somar a borda de
  // volta, sobrariam 2px de texto cortado embaixo.
  const borda = campo.offsetHeight - campo.clientHeight;
  campo.style.height = campo.scrollHeight + borda + "px";
}

// Só mede certo com o campo à vista: escondido, tudo mede zero. Por isso esta
// varredura é chamada de novo a cada momento em que um bloco aparece na tela
// ou muda a largura que sobra para o texto.
function ajustarAlturasAuto(raiz) {
  raiz.querySelectorAll("textarea.auto-altura").forEach(ajustarAlturaAuto);
}

// Girar o celular ou mudar o tamanho da janela muda a largura, e com ela onde a
// linha quebra. Varrer a página inteira aqui é barato: são poucos campos.
window.addEventListener("resize", () => ajustarAlturasAuto(document));

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

  // Endereço é uma informação só: o campo quebra linha para caber na tela, mas
  // Enter não deve virar quebra de linha guardada no Airtable.
  const campoEndereco = bloco.querySelector(".local-endereco");
  campoEndereco.addEventListener("input", () => ajustarAlturaAuto(campoEndereco));
  campoEndereco.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") evento.preventDefault();
  });

  caixa.appendChild(bloco);
  renumerarLocais(caixa);
  ajustarAlturasAuto(bloco);

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

  ligarSugestaoCampo(
    bloco.querySelector(".contato-nome"),
    bloco.querySelector(".sugestao-lista"),
    () => valoresDistintosCadastro("contato")
  );

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
  // Campo travado perde o espaçamento lateral (o CSS o zera para parecer
  // texto), então a linha passa a quebrar em outro ponto e a altura muda.
  ajustarAlturasAuto(caixa);
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
    semDocumentoBotao.classList.add("hidden");
    // O endereço da Receita foi preenchido com o formulário ainda escondido.
    ajustarAlturasAuto(locaisBox);
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
  semDocumento = false;
  tipoCnpjBox.classList.add("hidden");
  mostrarDica("neutral", "");
});

formEntidade.addEventListener("submit", async (event) => {
  event.preventDefault();
  desarmarCancelamento();

  const tipo =
    semDocumento || documentoAtual.length === 11 ? "CPF - Pessoa Física" : escolhaDoGrupo(grupoTipo);

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
      semDocumento = false;
      tipoCnpjBox.classList.add("hidden");
      semDocumentoBotao.classList.remove("hidden");
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
const filtroDocTipo = document.getElementById("filtro-doc-tipo");
const filtroStatus = document.getElementById("filtro-status");
const filtroContato = document.getElementById("filtro-contato");
const filtroAdministradora = document.getElementById("filtro-administradora");
const filtroEmpresaSindicos = document.getElementById("filtro-empresa-sindicos");
const limparFiltrosCadastroBotao = document.getElementById("limpar-filtros-cadastro");

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

// Carrega os cadastros sem mexer na tela da Consulta -- usado pelas
// sugestões do Adicionar (ver ligarSugestaoCampo), que precisam da mesma
// lista mas não devem disparar "Carregando..."/erros na lista de baixo.
// Se a Consulta já carregou antes, não busca de novo.
async function garantirCadastrosCarregados() {
  if (listaCarregada) return;
  try {
    const dados = await pedirAoN8n("listar-cadastros", {});
    if (dados && dados.ok) {
      cadastros = dados.cadastros || [];
      listaCarregada = true;
      atualizaFiltrosCadastro();
    }
  } catch (err) {
    // Sugestão é um extra -- não trava o formulário se o n8n estiver fora.
  }
}

async function carregarLista() {
  mostrarListaStatus("neutral", "Carregando...");
  listaBox.innerHTML = "";
  listaCarregada = false; // "Atualizar" força buscar de novo, mesmo já tendo carregado

  try {
    const dados = await pedirAoN8n("listar-cadastros", {});

    if (!dados || !dados.ok) {
      mostrarListaStatus("error", (dados && dados.mensagem) || "Não consegui carregar a lista.");
      return;
    }

    cadastros = dados.cadastros || [];
    listaCarregada = true;
    atualizaFiltrosCadastro();
    desenharLista();
  } catch (err) {
    mostrarListaStatus("error", "Não foi possível falar com o n8n. Ele está ligado e o túnel ativo?");
  }
}

// Um `<select>` de filtro por valor: monta as opções a partir do que existe
// de verdade nos cadastros carregados (nada de lista fixa, que ficaria
// desatualizada). Preserva a escolha atual se ela continuar valendo.
function valoresDistintosCadastro(campo) {
  const vistos = new Set();
  cadastros.forEach((c) => {
    if (campo === "contato") {
      // "contato" vem como "Fulano, Beltrano" -- um nome por vírgula.
      (c.contato || "").split(",").map((v) => v.trim()).filter(Boolean).forEach((v) => vistos.add(v));
    } else {
      const v = (c[campo] || "").trim();
      if (v) vistos.add(v);
    }
  });
  return [...vistos].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function preencherFiltroSelect(select, valores, rotuloTodos) {
  const atual = select.value;
  select.innerHTML = `<option value="">${rotuloTodos}</option>` +
    valores.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if (valores.includes(atual)) select.value = atual;
}

function atualizaFiltrosCadastro() {
  preencherFiltroSelect(filtroContato, valoresDistintosCadastro("contato"), "Todos");
  preencherFiltroSelect(filtroAdministradora, valoresDistintosCadastro("administradora"), "Todas");
  preencherFiltroSelect(filtroEmpresaSindicos, valoresDistintosCadastro("empresaSindicos"), "Todas");
}

// Sugestão de valor já usado noutro cadastro, pro campo não ficar em branco
// e a pessoa não digitar de novo o que já digitou pra outro cliente
// (administradora, empresa de síndicos, e-mail e nome de contato costumam
// se repetir bastante). `coletaValores()` decide QUAIS valores esse campo
// específico sugere -- nunca mistura contato com e-mail, por exemplo,
// porque cada chamada usa sua própria função de coleta.
function ligarSugestaoCampo(input, listaEl, coletaValores) {
  async function atualizar() {
    await garantirCadastrosCarregados();
    const termo = input.value.trim().toLowerCase();
    const filtrados = coletaValores()
      .filter((v) => v.toLowerCase() !== termo)
      .filter((v) => !termo || v.toLowerCase().includes(termo))
      .slice(0, 8);

    listaEl.innerHTML = "";
    if (!filtrados.length) {
      listaEl.classList.add("hidden");
      return;
    }
    filtrados.forEach((valor) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "sugestao-item";
      item.textContent = valor;
      // mousedown (não click) dispara antes do blur do campo, senão a lista
      // já teria sumido quando o clique chegasse.
      item.addEventListener("mousedown", (evento) => {
        evento.preventDefault();
        input.value = valor;
        listaEl.classList.add("hidden");
        input.focus();
      });
      listaEl.appendChild(item);
    });
    listaEl.classList.remove("hidden");
  }

  input.addEventListener("focus", atualizar);
  input.addEventListener("input", atualizar);
  input.addEventListener("blur", () => listaEl.classList.add("hidden"));
}

ligarSugestaoCampo(emailsInput, document.getElementById("emails-sugestao"), () => valoresDistintosCadastro("emails"));
ligarSugestaoCampo(administradoraInput, document.getElementById("administradora-sugestao"), () => valoresDistintosCadastro("administradora"));
ligarSugestaoCampo(empresaSindicosInput, document.getElementById("empresa-sindicos-sugestao"), () => valoresDistintosCadastro("empresaSindicos"));

function desenharLista() {
  const termo = buscaInput.value.trim().toLowerCase();
  const digitos = termo.replace(/\D/g, "");
  const docTipo = escolhaDoGrupo(filtroDocTipo);
  const status = filtroStatus.value;
  const contato = filtroContato.value;
  const administradora = filtroAdministradora.value;
  const empresaSindicos = filtroEmpresaSindicos.value;

  const visiveis = cadastros.filter((c) => {
    if (termo) {
      const texto = `${c.razaoSocial} ${c.nomeFantasia} ${c.contato}`.toLowerCase();
      // Procurar por número ignora a pontuação do CPF/CNPJ.
      if (!(texto.includes(termo) || (digitos !== "" && c.documento.includes(digitos)))) return false;
    }
    if (docTipo === "cpf" && c.documento.length !== 11) return false;
    if (docTipo === "cnpj" && c.documento.length !== 14) return false;
    if (status && c.status !== status) return false;
    if (contato && !(c.contato || "").split(",").map((v) => v.trim()).includes(contato)) return false;
    if (administradora && (c.administradora || "") !== administradora) return false;
    if (empresaSindicos && (c.empresaSindicos || "") !== empresaSindicos) return false;
    return true;
  });

  listaBox.innerHTML = "";

  if (!cadastros.length) {
    mostrarListaStatus("neutral", "Nenhum cadastro ainda.");
    return;
  }

  if (!visiveis.length) {
    mostrarListaStatus("neutral", termo
      ? `Nada encontrado para "${buscaInput.value.trim()}".`
      : "Nada encontrado com esse filtro.");
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

configurarGrupo(filtroDocTipo, () => desenharLista());
[filtroStatus, filtroContato, filtroAdministradora, filtroEmpresaSindicos].forEach((select) =>
  select.addEventListener("change", desenharLista)
);
limparFiltrosCadastroBotao.addEventListener("click", () => {
  filtroDocTipo.querySelectorAll(".opcao").forEach((b) => b.classList.toggle("active", b.dataset.valor === ""));
  filtroStatus.value = "";
  filtroContato.value = "";
  filtroAdministradora.value = "";
  filtroEmpresaSindicos.value = "";
  desenharLista();
});

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
    // As três saem ao mesmo tempo de propósito. O n8n executa um nó de cada vez,
    // então buscar cadastro, endereços e contatos em fila dentro de um workflow
    // só custava a soma das três (~2s). O navegador espera as três em paralelo,
    // e o tempo passa a ser o da mais lenta.
    const [detalhe, deLocais, deContatos] = await Promise.all([
      pedirAoN8n("detalhe-cadastro", { id: cadastro.id, documento: cadastro.documento }),
      pedirAoN8n("listar-locais", { entidadeId: cadastro.id }),
      pedirAoN8n("listar-contatos", { entidadeId: cadastro.id }),
    ]);

    // Se qualquer uma das três falhar, o cadastro não abre. Abrir sem os
    // endereços que existem seria pior do que não abrir: a tela mostraria o
    // cadastro como se ele não tivesse nenhum, e quem salvasse assim acharia
    // que estava tudo certo.
    if (detalhe && detalhe.ok && (!deLocais || !deLocais.ok || !deContatos || !deContatos.ok)) {
      dados = { ok: false, mensagem: "Não consegui carregar os endereços e contatos. Tente de novo." };
    } else {
      // Remonta o mesmo formato de antes, para o resto da tela não mudar nada.
      dados = detalhe && detalhe.ok
        ? { ...detalhe, locais: deLocais.locais || [], contatos: deContatos.contatos || [] }
        : detalhe;
    }
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
  // Só agora o bloco está na tela: montarDetalhe monta tudo solto da página, e
  // ali qualquer altura medida daria zero.
  ajustarAlturasAuto(caixa);
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
const modeloFatura = document.getElementById("modelo-fatura");
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
  servico: document.getElementById("despesa-servico"),
  cartao: document.getElementById("despesa-cartao"),
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
despesaCampos.forma.addEventListener("change", ajustarLinhaCartao);
// A data também muda em qual fatura a compra cai.
despesaCampos.vencimento.addEventListener("change", mostrarFaturaDaCompra);
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
  despesaCampos.servico.value = "";
  despesaCampos.cartao.value = "";
  despesaCampos.parcelas.value = "1";
  descricaoHint.textContent = "";
  ajustarLinhaDataPagamento();
  ajustarCategoriaOutra(despesaCampos.categoria, linhaCategoriaOutra, despesaCampos.categoriaOutra);
  ajustarLinhaParcelas();
  ajustarLinhaCartao();
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
    despesaCampos.servico.value = despesa.servicoId || "";
    despesaCampos.cartao.value = despesa.cartaoId || "";

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
    ajustarLinhaCartao();
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
      servicoId: despesaCampos.servico.value,
      cartaoId: despesaCampos.cartao.value,
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
    desenharPainel();
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

// ----- Financeiro: contas a receber -----

const receitaForm = document.getElementById("form-receita");
const novaReceitaBotao = document.getElementById("nova-receita");
const cancelarReceitaBotao = document.getElementById("cancelar-receita");
const salvarReceitaBotao = document.getElementById("salvar-receita");
const receitaStatusMsg = document.getElementById("receita-status-msg");
const buscaReceita = document.getElementById("busca-receita");
const filtroSituacaoReceita = document.getElementById("filtro-situacao-receita");
const filtroMesReceita = document.getElementById("filtro-mes-receita");
const recarregarReceitasBotao = document.getElementById("recarregar-receitas");
const listaReceitasStatus = document.getElementById("lista-receitas-status");
const listaReceitasBox = document.getElementById("lista-receitas");
const modeloReceita = document.getElementById("modelo-receita");
const resumoReceber = document.getElementById("resumo-receber");
const linhaDataRecebimento = document.getElementById("linha-data-recebimento");
const listaClientesDatalist = document.getElementById("lista-clientes");
const listaDescricoesReceitaDatalist = document.getElementById("lista-descricoes-receita");

const receitaCampos = {
  descricao: document.getElementById("receita-descricao"),
  valor: document.getElementById("receita-valor"),
  cliente: document.getElementById("receita-cliente"),
  material: document.getElementById("receita-material"),
  vencimento: document.getElementById("receita-vencimento"),
  forma: document.getElementById("receita-forma"),
  status: document.getElementById("receita-status"),
  dataRecebimento: document.getElementById("receita-data-recebimento"),
  observacoes: document.getElementById("receita-observacoes"),
};

let recebimentos = [];
let receitaEditando = "";
// Guarda o CPF/CNPJ do cliente escolhido: é ele que liga o recebimento ao
// cadastro, já que as duas tabelas vivem em bases diferentes do Airtable.
let documentoDoClienteEscolhido = "";

ligarMascaraDinheiro(receitaCampos.valor);

function mostrarReceitaStatus(tipo, mensagem) {
  receitaStatusMsg.textContent = mensagem;
  receitaStatusMsg.className = `status show ${tipo}`;
}

function mostrarListaReceitasStatus(tipo, mensagem) {
  listaReceitasStatus.textContent = mensagem;
  listaReceitasStatus.className = `doc-hint ${tipo}`;
}

// Atrasada é quem venceu e ainda não foi recebida.
function receitaAtrasada(receita) {
  if (receita.status !== "Pendente" || !receita.vencimento) return false;
  return String(receita.vencimento).slice(0, 10) < hojeISO();
}

// A lista de clientes vem dos cadastros que já foram carregados na aba
// Consultar. Sem eles, ainda dá para digitar o nome à mão.
function atualizarListaDeClientes() {
  const nomes = new Set();
  cadastros.forEach((c) => nomes.add(String(c.razaoSocial || "").trim()));
  recebimentos.forEach((r) => nomes.add(String(r.cliente || "").trim()));
  nomes.delete("");
  encherDatalist(listaClientesDatalist,
    Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR")));

  const descricoes = new Set();
  recebimentos.forEach((r) => descricoes.add(String(r.descricao || "").trim()));
  descricoes.delete("");
  encherDatalist(listaDescricoesReceitaDatalist,
    Array.from(descricoes).sort((a, b) => a.localeCompare(b, "pt-BR")));
}

// Mesma ideia do campo de fornecedor: aceita nome ou CPF/CNPJ e casa com quem
// já está cadastrado, para o mesmo cliente não entrar escrito de dois jeitos.
receitaCampos.cliente.addEventListener("blur", () => {
  const hint = document.getElementById("receita-cliente-hint");
  const digitado = receitaCampos.cliente.value.trim();
  documentoDoClienteEscolhido = "";

  if (!digitado) {
    hint.textContent = "";
    return;
  }

  const digitos = digitado.replace(/[^0-9]/g, "");
  const porDocumento = digitos.length >= 11
    ? cadastros.find((c) => String(c.documento || "") === digitos)
    : null;
  const porNome = cadastros.find(
    (c) => normalizarTexto(c.razaoSocial) === normalizarTexto(digitado)
  );
  const achado = porDocumento || porNome;

  hint.className = "doc-hint";
  if (achado) {
    receitaCampos.cliente.value = achado.razaoSocial;
    documentoDoClienteEscolhido = achado.documento || "";
    hint.textContent = "Cliente cadastrado.";
    return;
  }

  hint.textContent = cadastros.length
    ? "Não achei no Cadastro — vou salvar só o nome."
    : "Abra a aba Cadastro > Consultar uma vez para eu conhecer seus clientes.";
});

function ajustarLinhaDataRecebimento() {
  const recebido = receitaCampos.status.value === "Recebido";
  linhaDataRecebimento.classList.toggle("hidden", !recebido);
  if (recebido && !receitaCampos.dataRecebimento.value) {
    receitaCampos.dataRecebimento.value = hojeISO();
  }
}

receitaCampos.status.addEventListener("change", ajustarLinhaDataRecebimento);

function limparFormReceita() {
  receitaEditando = "";
  documentoDoClienteEscolhido = "";
  Object.values(receitaCampos).forEach((campo) => (campo.value = ""));
  receitaCampos.status.value = "Pendente";
  receitaCampos.forma.value = "";
  document.getElementById("receita-cliente-hint").textContent = "";
  ajustarLinhaDataRecebimento();
  receitaStatusMsg.className = "status";
  salvarReceitaBotao.textContent = "Salvar";
}

function abrirFormReceita(receita) {
  limparFormReceita();

  if (receita) {
    receitaEditando = receita.id;
    documentoDoClienteEscolhido = receita.clienteDocumento || "";
    receitaCampos.descricao.value = receita.descricao || "";
    porValorNoCampo(receitaCampos.valor, receita.valor);
    porValorNoCampo(receitaCampos.material, receita.materialValor);
    receitaCampos.cliente.value = receita.cliente || "";
    receitaCampos.vencimento.value = String(receita.vencimento || "").slice(0, 10);
    receitaCampos.forma.value = receita.forma || "";
    receitaCampos.status.value = receita.status || "Pendente";
    receitaCampos.dataRecebimento.value = String(receita.dataRecebimento || "").slice(0, 10);
    receitaCampos.observacoes.value = receita.observacoes || "";
    ajustarLinhaDataRecebimento();
    salvarReceitaBotao.textContent = "Salvar alterações";
  }

  receitaForm.classList.remove("hidden");
  novaReceitaBotao.classList.add("hidden");
  receitaCampos.descricao.focus();
}

function fecharFormReceita() {
  receitaForm.classList.add("hidden");
  novaReceitaBotao.classList.remove("hidden");
  limparFormReceita();
}

novaReceitaBotao.addEventListener("click", () => abrirFormReceita(null));
cancelarReceitaBotao.addEventListener("click", fecharFormReceita);

receitaForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!receitaCampos.descricao.value.trim()) {
    mostrarReceitaStatus("error", "Escreva uma descrição.");
    return;
  }

  const valor = valorDoCampo(receitaCampos.valor);
  if (valor <= 0) {
    mostrarReceitaStatus("error", "Informe um valor maior que zero.");
    return;
  }

  salvarReceitaBotao.disabled = true;
  mostrarReceitaStatus("loading", "Salvando...");

  try {
    const corpo = {
      descricao: receitaCampos.descricao.value.trim(),
      valor: String(valor),
      cliente: receitaCampos.cliente.value.trim(),
      clienteDocumento: documentoDoClienteEscolhido,
      vencimento: receitaCampos.vencimento.value,
      status: receitaCampos.status.value,
      dataRecebimento: receitaCampos.dataRecebimento.value,
      forma: receitaCampos.forma.value,
      materialValor: String(valorDoCampo(receitaCampos.material)),
      observacoes: receitaCampos.observacoes.value.trim(),
    };
    if (receitaEditando) corpo.id = receitaEditando;

    const resposta = await pedirAoN8n("salvar-recebimento", corpo);
    if (!resposta || !resposta.ok) {
      throw new Error((resposta && resposta.mensagem) || "Não consegui salvar.");
    }

    fecharFormReceita();
    await recarregarReceitas();
    mostrarListaReceitasStatus("ok", resposta.mensagem || "Salvo!");
  } catch (err) {
    mostrarReceitaStatus("error", err.message || "Não foi possível falar com o n8n.");
  } finally {
    salvarReceitaBotao.disabled = false;
  }
});

function atualizarResumoReceber() {
  const emAberto = recebimentos.filter((r) => r.status === "Pendente");
  const total = emAberto.reduce((s, r) => s + Number(r.valor || 0), 0);
  const atrasado = emAberto.filter(receitaAtrasada).reduce((s, r) => s + Number(r.valor || 0), 0);

  const mes = hojeISO().slice(0, 7);
  const recebidoNoMes = recebimentos
    .filter((r) => r.status === "Recebido" && String(r.dataRecebimento || "").slice(0, 7) === mes)
    .reduce((s, r) => s + Number(r.valor || 0), 0);

  document.getElementById("r-aberto").textContent = dinheiro(total);
  document.getElementById("r-atrasadas").textContent = dinheiro(atrasado);
  document.getElementById("r-recebido").textContent = dinheiro(recebidoNoMes);
  resumoReceber.classList.toggle("hidden", recebimentos.length === 0);
}

function atualizarFiltroDeMesesReceita() {
  const escolhido = filtroMesReceita.value;
  const meses = Array.from(
    new Set(recebimentos.map((r) => String(r.vencimento || "").slice(0, 7)).filter(Boolean))
  ).sort();

  filtroMesReceita.innerHTML = '<option value="">Qualquer mês</option>';
  meses.forEach((mes) => {
    const opcao = document.createElement("option");
    opcao.value = mes;
    opcao.textContent = mesBonito(mes);
    filtroMesReceita.appendChild(opcao);
  });
  filtroMesReceita.value = meses.includes(escolhido) ? escolhido : "";
}

function receitaPassaNosFiltros(receita, termo) {
  if (termo && !`${receita.descricao} ${receita.cliente}`.toLowerCase().includes(termo)) {
    return false;
  }
  if (filtroMesReceita.value && String(receita.vencimento || "").slice(0, 7) !== filtroMesReceita.value) {
    return false;
  }

  const situacao = filtroSituacaoReceita.value;
  if (situacao === "abertas") return receita.status === "Pendente";
  if (situacao === "atrasadas") return receitaAtrasada(receita);
  if (situacao === "recebidas") return receita.status === "Recebido";
  return true;
}

function desenharReceitas() {
  const termo = buscaReceita.value.trim().toLowerCase();
  const visiveis = recebimentos.filter((r) => receitaPassaNosFiltros(r, termo));

  listaReceitasBox.innerHTML = "";
  atualizarResumoReceber();

  if (!recebimentos.length) {
    mostrarListaReceitasStatus("neutral", "Nenhuma conta a receber ainda.");
    return;
  }
  if (!visiveis.length) {
    mostrarListaReceitasStatus("neutral", "Nenhuma conta com esses filtros.");
    return;
  }

  const soma = visiveis.reduce((t, r) => t + Number(r.valor || 0), 0);
  mostrarListaReceitasStatus("neutral",
    `${visiveis.length} de ${recebimentos.length} · ${dinheiro(soma)}`);

  visiveis.forEach((r) => listaReceitasBox.appendChild(montarLinhaReceita(r)));
}

function montarLinhaReceita(receita) {
  const linha = modeloReceita.content.firstElementChild.cloneNode(true);
  const atrasada = receitaAtrasada(receita);
  const recebida = receita.status === "Recebido";

  linha.classList.toggle("paga", recebida || receita.status === "Cancelado");
  linha.classList.toggle("vencida", atrasada);

  linha.querySelector(".despesa-descricao").textContent = receita.descricao || "(sem descrição)";
  linha.querySelector(".despesa-valor").textContent = dinheiro(receita.valor);

  const partes = [];
  if (receita.vencimento) {
    const passou = String(receita.vencimento).slice(0, 10) < hojeISO();
    partes.push((passou ? "Venceu em " : "Vence em ") + dataBonita(receita.vencimento));
  }
  if (recebida) {
    partes.push("Recebido" + (receita.dataRecebimento ? " em " + dataBonita(receita.dataRecebimento) : ""));
  }
  if (receita.status === "Cancelado") partes.push("Cancelado");
  if (receita.cliente) partes.push(receita.cliente);
  if (receita.forma) partes.push(receita.forma);
  linha.querySelector(".despesa-extra").textContent = partes.join(" · ");

  const acoes = linha.querySelector(".despesa-acoes");
  const botaoReceber = linha.querySelector(".receita-receber");
  const botaoEditar = linha.querySelector(".receita-editar");
  const botaoExcluir = linha.querySelector(".receita-excluir");

  botaoReceber.classList.toggle("hidden", recebida);

  linha.querySelector(".despesa-resumo").addEventListener("click", () => {
    const abrindo = acoes.classList.contains("hidden");
    listaReceitasBox.querySelectorAll(".despesa").forEach((outra) => {
      outra.classList.remove("aberta");
      outra.querySelector(".despesa-acoes").classList.add("hidden");
      desarmarConfirmacao(outra.querySelector(".receita-excluir"), "Excluir");
    });
    acoes.classList.toggle("hidden", !abrindo);
    linha.classList.toggle("aberta", abrindo);
  });

  botaoEditar.addEventListener("click", () => {
    abrirFormReceita(receita);
    receitaForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  botaoReceber.addEventListener("click", async () => {
    botaoReceber.disabled = true;
    mostrarListaReceitasStatus("neutral", "Salvando...");
    try {
      const resposta = await pedirAoN8n("salvar-recebimento", {
        id: receita.id,
        descricao: receita.descricao,
        valor: String(receita.valor),
        cliente: receita.cliente || "",
        clienteDocumento: receita.clienteDocumento || "",
        vencimento: receita.vencimento || "",
        status: "Recebido",
        dataRecebimento: hojeISO(),
        forma: receita.forma || "",
        materialValor: String(receita.materialValor || 0),
        observacoes: receita.observacoes || "",
      });
      if (!resposta || !resposta.ok) {
        mostrarListaReceitasStatus("error", (resposta && resposta.mensagem) || "Não consegui salvar.");
        return;
      }
      await recarregarReceitas();
      mostrarListaReceitasStatus("ok", "Marcada como recebida.");
    } catch (err) {
      mostrarListaReceitasStatus("error", "Não foi possível falar com o n8n.");
    } finally {
      botaoReceber.disabled = false;
    }
  });

  ligarExclusao(botaoExcluir, "Excluir", "Confirmar exclusão", async () => {
    try {
      const resposta = await pedirAoN8n("excluir-recebimento", { id: receita.id });
      if (!resposta || !resposta.ok) {
        mostrarListaReceitasStatus("error", (resposta && resposta.mensagem) || "Não consegui excluir.");
        return;
      }
      recebimentos = recebimentos.filter((r) => r.id !== receita.id);
      atualizarFiltroDeMesesReceita();
      atualizarListaDeClientes();
      desenharReceitas();
      desenharPainel();
      mostrarListaReceitasStatus("ok", resposta.mensagem || "Excluída.");
    } catch (err) {
      mostrarListaReceitasStatus("error", "Não foi possível falar com o n8n.");
    }
  });

  return linha;
}

buscaReceita.addEventListener("input", () => {
  if (financeiroCarregado) desenharReceitas();
});
filtroSituacaoReceita.addEventListener("change", () => {
  if (financeiroCarregado) desenharReceitas();
});
filtroMesReceita.addEventListener("change", () => {
  if (financeiroCarregado) desenharReceitas();
});
recarregarReceitasBotao.addEventListener("click", () => carregarFinanceiro());

// ----- Financeiro: ajustes do painel -----

const ajustesForm = document.getElementById("form-ajustes");
const ajustesStatusMsg = document.getElementById("ajustes-status-msg");
const linhaMei = document.getElementById("linha-mei");
const linhaSimples = document.getElementById("linha-simples");

const ajustesCampos = {
  saldoInicial: document.getElementById("aj-saldo-inicial"),
  dataSaldo: document.getElementById("aj-data-saldo"),
  reserva: document.getElementById("aj-reserva"),
  giro: document.getElementById("aj-giro"),
  regime: document.getElementById("aj-regime"),
  das: document.getElementById("aj-das"),
  teto: document.getElementById("aj-teto"),
  aliquota: document.getElementById("aj-aliquota"),
  folha: document.getElementById("aj-folha"),
  provisiona: document.getElementById("aj-provisiona"),
  socio1Nome: document.getElementById("aj-socio1-nome"),
  socio1Pct: document.getElementById("aj-socio1-pct"),
  socio2Nome: document.getElementById("aj-socio2-nome"),
  socio2Pct: document.getElementById("aj-socio2-pct"),
};

// O que sobra das duas fatias fica com a empresa. Mostrar a conta enquanto
// se digita evita passar de 100% sem perceber.
function mostrarFatiaDaEmpresa() {
  const porcento = (campo) => Number(String(campo.value).replace(",", ".")) || 0;
  const usado = porcento(ajustesCampos.socio1Pct) + porcento(ajustesCampos.socio2Pct);
  const alvo = document.getElementById("aj-empresa-fatia");
  const comVirgula = (n) => n.toFixed(2).replace(".", ",");

  if (usado > 100) {
    alvo.className = "doc-hint error";
    alvo.textContent = "As duas fatias somam " + comVirgula(usado)
      + "% — passa de 100%. Não sobraria nada para a empresa.";
    return;
  }

  alvo.className = "doc-hint";
  alvo.textContent = "Fica com a empresa: " + comVirgula(100 - usado)
    + "% do lucro de cada serviço.";
}

[ajustesCampos.socio1Pct, ajustesCampos.socio2Pct].forEach((campo) =>
  campo.addEventListener("input", mostrarFatiaDaEmpresa)
);

// Uma linha só na tabela; guardo o código para o salvar alterar em vez de criar.
let configFin = null;

["saldoInicial", "reserva", "giro", "das", "teto", "folha"].forEach((nome) =>
  ligarMascaraDinheiro(ajustesCampos[nome])
);

// Regime muda o que faz sentido perguntar: MEI paga valor fixo, Simples paga
// porcentagem do que fatura.
function ajustarCamposDoRegime() {
  const regime = ajustesCampos.regime.value;
  linhaMei.classList.toggle("hidden", regime !== "MEI");
  linhaSimples.classList.toggle("hidden", regime !== "Simples Nacional");
}

ajustesCampos.regime.addEventListener("change", ajustarCamposDoRegime);

// Custo fixo real = as contas fixas ativas. Seis meses disso é a régua mais
// usada para reserva de emergência.
document.getElementById("sugerir-reserva").addEventListener("click", () => {
  const porMes = recorrentes
    .filter((r) => r.ativo)
    .reduce((s, r) => s + Number(r.valor || 0), 0);

  if (porMes <= 0) {
    mostrarAjustesStatus("error", "Cadastre suas contas fixas primeiro, na aba Contas fixas.");
    return;
  }

  porValorNoCampo(ajustesCampos.reserva, porMes * 6);
  mostrarAjustesStatus("ok",
    `Sugeri 6 meses do seu custo fixo (${dinheiro(porMes)} por mês). Ajuste se quiser.`);
});

function mostrarAjustesStatus(tipo, mensagem) {
  ajustesStatusMsg.textContent = mensagem;
  ajustesStatusMsg.className = `status show ${tipo}`;
}

function preencherAjustes() {
  if (!configFin) return;
  porValorNoCampo(ajustesCampos.saldoInicial, configFin.saldoInicial);
  ajustesCampos.dataSaldo.value = String(configFin.dataSaldoInicial || "").slice(0, 10);
  porValorNoCampo(ajustesCampos.reserva, configFin.reservaMeta);
  porValorNoCampo(ajustesCampos.giro, configFin.giroMeta);
  ajustesCampos.regime.value = configFin.regime || "MEI";
  porValorNoCampo(ajustesCampos.das, configFin.impostoFixoMensal);
  porValorNoCampo(ajustesCampos.teto, configFin.tetoAnual);
  ajustesCampos.aliquota.value = configFin.aliquotaImposto
    ? String(configFin.aliquotaImposto).replace(".", ",")
    : "";
  porValorNoCampo(ajustesCampos.folha, configFin.folhaMensal);
  ajustesCampos.provisiona.checked = Boolean(configFin.provisionaDecimoFerias);
  ajustesCampos.socio1Nome.value = configFin.socio1Nome || "";
  ajustesCampos.socio2Nome.value = configFin.socio2Nome || "";
  // 33.3333 vira "33,3333": vírgula é como o brasileiro lê.
  const comVirgula = (n) => Number(n || 0).toFixed(4).replace(".", ",");
  ajustesCampos.socio1Pct.value = comVirgula(configFin.socio1Percentual);
  ajustesCampos.socio2Pct.value = comVirgula(configFin.socio2Percentual);
  ajustarCamposDoRegime();
  mostrarFatiaDaEmpresa();
}

ajustesForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const salvar = document.getElementById("salvar-ajustes");
  salvar.disabled = true;
  mostrarAjustesStatus("loading", "Salvando...");

  try {
    const resposta = await pedirAoN8n("salvar-config", {
      id: (configFin && configFin.id) || "",
      saldoInicial: String(valorDoCampo(ajustesCampos.saldoInicial)),
      dataSaldoInicial: ajustesCampos.dataSaldo.value,
      reservaMeta: String(valorDoCampo(ajustesCampos.reserva)),
      giroMeta: String(valorDoCampo(ajustesCampos.giro)),
      regime: ajustesCampos.regime.value,
      impostoFixoMensal: String(valorDoCampo(ajustesCampos.das)),
      tetoAnual: String(valorDoCampo(ajustesCampos.teto)),
      aliquotaImposto: ajustesCampos.aliquota.value.replace(",", ".") || "0",
      folhaMensal: String(valorDoCampo(ajustesCampos.folha)),
      provisionaDecimoFerias: ajustesCampos.provisiona.checked ? "sim" : "",
      socio1Nome: ajustesCampos.socio1Nome.value.trim(),
      socio2Nome: ajustesCampos.socio2Nome.value.trim(),
      socio1Percentual: ajustesCampos.socio1Pct.value.replace(",", ".") || "0",
      socio2Percentual: ajustesCampos.socio2Pct.value.replace(",", ".") || "0",
    });

    if (!resposta || !resposta.ok) {
      throw new Error((resposta && resposta.mensagem) || "Não consegui salvar.");
    }

    const lido = await pedirAoN8n("listar-config", {});
    if (lido && lido.ok) configFin = lido.config;
    preencherAjustes();
    desenharDivisao();
    desenharPainel();
    mostrarAjustesStatus("ok", "Ajustes salvos! O painel já está usando eles.");
  } catch (err) {
    mostrarAjustesStatus("error", err.message || "Não foi possível falar com o n8n.");
  } finally {
    salvar.disabled = false;
  }
});

// ----- Financeiro: o painel -----

let conferencias = [];

// Saldo em caixa: o ponto de partida informado nos Ajustes, mais tudo que foi
// recebido depois, menos tudo que foi pago depois. É o item 1 da lista.
function saldoEmCaixa() {
  if (!configFin) return 0;
  const desde = String(configFin.dataSaldoInicial || "").slice(0, 10);
  if (!desde) return 0;

  const entrou = recebimentos
    .filter((r) => r.status === "Recebido" && String(r.dataRecebimento || "").slice(0, 10) >= desde)
    .reduce((s, r) => s + Number(r.valor || 0), 0);

  const saiu = despesas
    .filter((d) => d.status === "Pago" && String(d.dataPagamento || "").slice(0, 10) >= desde)
    .reduce((s, d) => s + Number(d.valor || 0), 0);

  // A parte que os sócios tiraram também saiu da conta. Sem contar isto, o
  // saldo mostraria dinheiro que já não está lá.
  const tirado = retiradas
    .filter((r) => String(r.data || "").slice(0, 10) >= desde)
    .reduce((s, r) => s + Number(r.valor || 0), 0);

  return Number(configFin.saldoInicial || 0) + entrou - saiu - tirado;
}

// MEI paga um boleto fixo por mês. No Simples, a fatia sai de cada recebimento,
// então acompanha o faturamento do mês sozinha.
function impostosProvisionados() {
  if (!configFin) return 0;

  if (configFin.regime === "Simples Nacional") {
    const mes = hojeISO().slice(0, 7);
    const faturado = recebimentos
      .filter((r) => r.status === "Recebido" && String(r.dataRecebimento || "").slice(0, 7) === mes)
      .reduce((s, r) => s + Number(r.valor || 0), 0);
    return faturado * (Number(configFin.aliquotaImposto || 0) / 100);
  }

  return Number(configFin.impostoFixoMensal || 0);
}

// Com funcionário registrado, além do salário do mês há o 13º e as férias
// crescendo por baixo: 1/12 de um salário e 1/12 de um salário e um terço.
function folhaProvisionada() {
  if (!configFin) return 0;
  const base = Number(configFin.folhaMensal || 0);
  return configFin.provisionaDecimoFerias ? base * (1 + (1 + 4 / 3) / 12) : base;
}

function faturamentoDoAno() {
  const ano = hojeISO().slice(0, 4);
  return recebimentos
    .filter((r) => r.status === "Recebido" && String(r.dataRecebimento || "").slice(0, 4) === ano)
    .reduce((s, r) => s + Number(r.valor || 0), 0);
}

// O que ainda vai sair em cada mês: o que está lançado e em aberto, mais o que
// as contas fixas ainda vão gerar. Atrasado entra no mês corrente, que é quando
// precisa ser pago.
function saidasPorMes(meses) {
  const total = {};
  meses.forEach((m) => (total[m] = 0));
  const primeiro = meses[0];
  const ultimo = meses[meses.length - 1];

  despesas.forEach((d) => {
    if (d.status === "Pago") return;
    const mes = String(d.vencimento || "").slice(0, 7);
    const alvo = mes && mes in total ? mes : mes && mes > ultimo ? null : primeiro;
    if (alvo) total[alvo] += Number(d.valor || 0);
  });

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

  return total;
}

// Mesma ideia do lado das entradas, sem contas fixas: recebimento só entra
// quando existe de verdade.
function entradasPorMes(meses) {
  const total = {};
  meses.forEach((m) => (total[m] = 0));
  const primeiro = meses[0];
  const ultimo = meses[meses.length - 1];

  recebimentos.forEach((r) => {
    if (r.status !== "Pendente") return;
    const mes = String(r.vencimento || "").slice(0, 7);
    const alvo = mes && mes in total ? mes : mes && mes > ultimo ? null : primeiro;
    if (alvo) total[alvo] += Number(r.valor || 0);
  });

  return total;
}

// Fluxo de caixa: o que de fato aconteceu, e não o previsto.
function fluxoRealizado(quantosMeses) {
  const meses = [];
  let ano = Number(hojeISO().slice(0, 4));
  let mes = Number(hojeISO().slice(5, 7));
  for (let i = 0; i < quantosMeses; i += 1) {
    meses.unshift(`${ano}-${String(mes).padStart(2, "0")}`);
    mes -= 1;
    if (mes < 1) {
      mes = 12;
      ano -= 1;
    }
  }

  return meses.map((m) => {
    const entrou = recebimentos
      .filter((r) => r.status === "Recebido" && String(r.dataRecebimento || "").slice(0, 7) === m)
      .reduce((s, r) => s + Number(r.valor || 0), 0);
    const saiu = despesas
      .filter((d) => d.status === "Pago" && String(d.dataPagamento || "").slice(0, 7) === m)
      .reduce((s, d) => s + Number(d.valor || 0), 0);
    // As retiradas entram no "saiu" porque saem da conta como qualquer outra
    // despesa — o que esta tabela mostra é movimento de dinheiro, não lucro.
    const tirado = retiradas
      .filter((r) => String(r.data || "").slice(0, 7) === m)
      .reduce((s, r) => s + Number(r.valor || 0), 0);
    return { mes: m, entrou, saiu: saiu + tirado };
  });
}

function pintarValor(elemento, valor, quandoNegativoEBom) {
  elemento.textContent = dinheiro(valor);
  elemento.classList.toggle("valor-negativo", quandoNegativoEBom ? false : valor < 0);
  elemento.classList.toggle("valor-positivo", quandoNegativoEBom ? false : valor > 0);
}

function desenharPainel() {
  const configurado = Boolean(configFin && configFin.dataSaldoInicial);
  document.getElementById("painel-configurar").classList.toggle("hidden", configurado);
  document.getElementById("painel-conteudo").classList.toggle("hidden", !configurado);
  document.getElementById("painel-status").textContent = "";
  if (!configurado) return;

  desenharFaturas();

  // --- itens 1, 2, 3, 6 e 7: quanto tem e quanto já tem dono ---
  const saldo = saldoEmCaixa();
  const impostos = impostosProvisionados();
  const folha = folhaProvisionada();
  const reserva = Number(configFin.reservaMeta || 0);
  const giro = Number(configFin.giroMeta || 0);
  const livre = saldo - impostos - folha - reserva - giro;

  document.getElementById("p-saldo").textContent = dinheiro(saldo);
  document.getElementById("p-impostos").textContent = dinheiro(impostos);
  document.getElementById("p-folha").textContent = dinheiro(folha);
  document.getElementById("p-reserva").textContent = dinheiro(reserva);
  document.getElementById("p-giro").textContent = dinheiro(giro);

  const caixaLivre = document.getElementById("p-livre");
  caixaLivre.textContent = dinheiro(livre);
  caixaLivre.classList.toggle("valor-negativo", livre < 0);
  caixaLivre.classList.toggle("valor-positivo", livre >= 0);

  document.getElementById("p-impostos-nota").textContent =
    configFin.regime === "Simples Nacional"
      ? ` (${configFin.aliquotaImposto}% do que entrou este mês)`
      : " (DAS do mês)";

  // Guardar o suficiente para os imprevistos é meta, não obrigação — vale dizer
  // o quanto já foi alcançado em vez de só mostrar o número cheio.
  const custoFixo = recorrentes.filter((r) => r.ativo)
    .reduce((s, r) => s + Number(r.valor || 0), 0);
  document.getElementById("p-reserva-nota").textContent =
    custoFixo > 0 && reserva > 0
      ? ` (${(reserva / custoFixo).toFixed(1)} meses de custo fixo)`
      : "";

  const aviso = document.getElementById("p-livre-aviso");
  if (livre < 0) {
    aviso.className = "doc-hint error";
    aviso.textContent = "O caixa não cobre o que já tem destino. Reveja as metas de reserva e giro, ou segure gastos.";
  } else if (saldo > 0 && livre < saldo * 0.1) {
    aviso.className = "doc-hint aviso";
    aviso.textContent = "Sobra pouco livre. Quase tudo que está na conta já tem dono.";
  } else {
    aviso.className = "doc-hint ok";
    aviso.textContent = "Este é o dinheiro que dá para usar sem mexer no que já tem destino.";
  }

  // --- itens 4 e 5 ---
  const aReceber = recebimentos.filter((r) => r.status === "Pendente");
  const aPagar = despesas.filter((d) => d.status !== "Pago");
  const totalReceber = aReceber.reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalPagar = aPagar.reduce((s, d) => s + Number(d.valor || 0), 0);
  const atrasadasReceber = aReceber.filter(receitaAtrasada).length;
  const vencidasPagar = aPagar.filter(despesaVencida).length;

  document.getElementById("p-receber").textContent = dinheiro(totalReceber);
  document.getElementById("p-pagar").textContent = dinheiro(totalPagar);
  document.getElementById("p-receber-atraso").textContent =
    atrasadasReceber ? `${atrasadasReceber} atrasada${atrasadasReceber > 1 ? "s" : ""}` : "em dia";
  document.getElementById("p-pagar-atraso").textContent =
    vencidasPagar ? `${vencidasPagar} vencida${vencidasPagar > 1 ? "s" : ""}` : "em dia";

  const mesAtual = hojeISO().slice(0, 7);
  const doMes = fluxoRealizado(1)[0];
  const sobrouNoMes = doMes.entrou - doMes.saiu;
  const caixaMes = document.getElementById("p-mes");
  caixaMes.textContent = dinheiro(sobrouNoMes);
  caixaMes.classList.toggle("valor-negativo", sobrouNoMes < 0);
  caixaMes.classList.toggle("valor-positivo", sobrouNoMes > 0);
  document.getElementById("p-mes-nota").textContent =
    `entrou ${dinheiro(doMes.entrou)} · saiu ${dinheiro(doMes.saiu)}`;

  // --- item 11: onde o dinheiro acaba, se acabar ---
  const meses = proximosMeses(6);
  const entradas = entradasPorMes(meses);
  const saidas = saidasPorMes(meses);
  const corpoPrevisao = document.getElementById("p-previsao");
  corpoPrevisao.innerHTML = "";

  let acumulado = saldo;
  let primeiroMesNegativo = "";
  meses.forEach((m) => {
    acumulado += entradas[m] - saidas[m];
    if (acumulado < 0 && !primeiroMesNegativo) primeiroMesNegativo = mesBonito(m);

    const tr = document.createElement("tr");
    if (acumulado < 0) tr.className = "linha-negativa";
    [
      mesBonito(m) + (m === mesAtual ? " (agora)" : ""),
      dinheiro(entradas[m]),
      dinheiro(saidas[m]),
      dinheiro(acumulado),
    ].forEach((texto, i) => {
      const td = document.createElement("td");
      td.textContent = texto;
      if (i === 3) td.className = acumulado < 0 ? "valor-negativo" : "valor-positivo";
      tr.appendChild(td);
    });
    corpoPrevisao.appendChild(tr);
  });

  // --- item 8 ---
  const corpoFluxo = document.getElementById("p-fluxo");
  corpoFluxo.innerHTML = "";
  fluxoRealizado(6).forEach((f) => {
    const resultado = f.entrou - f.saiu;
    const tr = document.createElement("tr");
    [mesBonito(f.mes), dinheiro(f.entrou), dinheiro(f.saiu), dinheiro(resultado)]
      .forEach((texto, i) => {
        const td = document.createElement("td");
        td.textContent = texto;
        if (i === 3) td.className = resultado < 0 ? "valor-negativo" : "valor-positivo";
        tr.appendChild(td);
      });
    corpoFluxo.appendChild(tr);
  });

  // --- item 6, parte MEI: o limite do ano ---
  const teto = Number(configFin.tetoAnual || 0);
  const blocoTeto = document.getElementById("p-teto-bloco");
  const mostrarTeto = configFin.regime === "MEI" && teto > 0;
  blocoTeto.classList.toggle("hidden", !mostrarTeto);

  if (mostrarTeto) {
    const faturado = faturamentoDoAno();
    const usado = Math.min(100, Math.round((faturado / teto) * 100));
    document.getElementById("p-teto-ano").textContent = hojeISO().slice(0, 4);
    document.getElementById("p-teto-barra").style.width = `${usado}%`;
    document.getElementById("p-teto-valor").textContent = `${dinheiro(faturado)} de ${dinheiro(teto)}`;

    const notaTeto = document.getElementById("p-teto-nota");
    if (faturado > teto) {
      notaTeto.className = "doc-hint error";
      notaTeto.textContent = "Você passou do limite. Procure seu contador: isso obriga a migrar de regime e cobra imposto para trás.";
    } else if (usado >= 80) {
      notaTeto.className = "doc-hint aviso";
      notaTeto.textContent = `Já usou ${usado}% do limite. Vale conversar com o contador antes de fechar mais serviço este ano.`;
    } else {
      notaTeto.className = "doc-hint";
      notaTeto.textContent = `Usou ${usado}% do limite deste ano.`;
    }
  }

  // --- item 9 ---
  const ultima = conferencias[0];
  const textoConferencia = document.getElementById("p-conferencia");
  if (!ultima) {
    textoConferencia.className = "doc-hint";
    textoConferencia.textContent = "Você ainda não conferiu com o banco. Vale fazer de vez em quando para achar o que não foi lançado.";
  } else {
    const diferente = Math.abs(Number(ultima.diferenca || 0)) >= 0.01;
    textoConferencia.className = diferente ? "doc-hint aviso" : "doc-hint ok";
    // O sinal já está na palavra "a mais"/"a menos". Mostrar o número negativo
    // junto viraria "tinha menos R$ 150,00 a menos".
    textoConferencia.textContent = diferente
      ? `Última em ${dataBonita(ultima.data)}: o banco tinha ${dinheiro(Math.abs(Number(ultima.diferenca)))} ${
          Number(ultima.diferenca) > 0 ? "a mais" : "a menos"
        } que o sistema.`
      : `Última em ${dataBonita(ultima.data)}: bateu certinho.`;
  }

  // --- o que veio da antiga aba Resumo ---
  desenharBarras(document.getElementById("grafico-categorias"), somarPor("categoria"));
  const porFornecedor = somarPor("fornecedor").slice(0, 8);
  document.getElementById("sem-fornecedores").classList.toggle("hidden", porFornecedor.length > 0);
  desenharBarras(document.getElementById("grafico-fornecedores"), porFornecedor);
}

// ----- Conferência com o banco (item 9) -----

const conferenciaForm = document.getElementById("form-conferencia");
const conferenciaStatusMsg = document.getElementById("conferencia-status-msg");
const conferenciaInformado = document.getElementById("conf-informado");

ligarMascaraDinheiro(conferenciaInformado);

document.getElementById("abrir-conferencia").addEventListener("click", () => {
  document.getElementById("conf-calculado").textContent = dinheiro(saldoEmCaixa());
  conferenciaInformado.value = "";
  document.getElementById("conf-observacoes").value = "";
  conferenciaStatusMsg.className = "status";
  conferenciaForm.classList.remove("hidden");
  document.getElementById("abrir-conferencia").classList.add("hidden");
  conferenciaInformado.focus();
});

document.getElementById("cancelar-conferencia").addEventListener("click", () => {
  conferenciaForm.classList.add("hidden");
  document.getElementById("abrir-conferencia").classList.remove("hidden");
});

conferenciaForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const informado = valorDoCampo(conferenciaInformado);
  if (informado <= 0) {
    conferenciaStatusMsg.textContent = "Informe o saldo que o banco mostra.";
    conferenciaStatusMsg.className = "status show error";
    return;
  }

  const botao = document.getElementById("salvar-conferencia");
  botao.disabled = true;
  conferenciaStatusMsg.textContent = "Salvando...";
  conferenciaStatusMsg.className = "status show loading";

  try {
    const calculado = saldoEmCaixa();
    const resposta = await pedirAoN8n("salvar-conferencia", {
      data: hojeISO(),
      informado: String(informado),
      calculado: String(calculado),
      observacoes: document.getElementById("conf-observacoes").value.trim(),
    });

    if (!resposta || !resposta.ok) {
      throw new Error((resposta && resposta.mensagem) || "Não consegui registrar.");
    }

    const lidas = await pedirAoN8n("listar-conferencias", {});
    if (lidas && lidas.ok) conferencias = lidas.conferencias || [];

    conferenciaForm.classList.add("hidden");
    document.getElementById("abrir-conferencia").classList.remove("hidden");
    desenharPainel();
  } catch (err) {
    conferenciaStatusMsg.textContent = err.message || "Não foi possível falar com o n8n.";
    conferenciaStatusMsg.className = "status show error";
  } finally {
    botao.disabled = false;
  }
});

// ----- Financeiro: divisão do lucro entre os sócios e a empresa -----

// O lucro de cada serviço é o que o cliente pagou menos o material. Cada sócio
// tem uma fatia; o que sobra fica com a empresa. O direito de cada um é sempre
// CALCULADO, nunca gravado — assim corrigir um serviço corrige a divisão junto.

const retiradaForm = document.getElementById("form-retirada");
const listaRetiradasBox = document.getElementById("lista-retiradas");
const listaRetiradasStatus = document.getElementById("lista-retiradas-status");
const modeloRetirada = document.getElementById("modelo-retirada");
const modeloSocio = document.getElementById("modelo-socio");
const retiradaStatusMsg = document.getElementById("retirada-status-msg");
const retiradaValor = document.getElementById("ret-valor");
const retiradaSocio = document.getElementById("ret-socio");

let retiradas = [];

ligarMascaraDinheiro(retiradaValor);

// Quantos dias à frente ainda contam como "conta que não pode esperar".
const DIAS_DE_COMPROMISSO = 30;

function somaDias(iso, dias) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

function socios() {
  if (!configFin) return [];
  return [
    { nome: configFin.socio1Nome || "Sócio 1", fatia: Number(configFin.socio1Percentual || 0) / 100 },
    { nome: configFin.socio2Nome || "Sócio 2", fatia: Number(configFin.socio2Percentual || 0) / 100 },
  ].filter((s) => s.fatia > 0);
}

function fatiaDaEmpresa() {
  return Math.max(0, 1 - socios().reduce((s, x) => s + x.fatia, 0));
}

// Material do serviço = o que foi digitado nele mais as compras amarradas a ele.
// São dois caminhos de propósito: o valor rápido para o que não virou despesa,
// e o vínculo para a compra que foi lançada em "A pagar".
function materialDoServico(servico) {
  const vinculado = despesas
    .filter((d) => d.servicoId === servico.id)
    .reduce((s, d) => s + Number(d.valor || 0), 0);
  return Number(servico.materialValor || 0) + vinculado;
}

function lucroDoServico(servico) {
  return Number(servico.valor || 0) - materialDoServico(servico);
}

// Só serviço recebido entra na divisão: não se reparte dinheiro que não entrou.
function servicosRecebidos() {
  return recebimentos.filter((r) => r.status === "Recebido");
}

function direitoAcumulado() {
  const lista = socios();
  const porSocio = lista.map(() => 0);
  let empresa = 0;

  servicosRecebidos().forEach((servico) => {
    const lucro = lucroDoServico(servico);
    lista.forEach((s, i) => (porSocio[i] += lucro * s.fatia));
    empresa += lucro * fatiaDaEmpresa();
  });

  return {
    socios: lista.map((s, i) => ({ ...s, direito: porSocio[i] })),
    empresa,
  };
}

function jaRetiradoPor(nome) {
  return retiradas
    .filter((r) => normalizarTexto(r.socio) === normalizarTexto(nome))
    .reduce((s, r) => s + Number(r.valor || 0), 0);
}

// Contas que não podem esperar: o que já venceu, o que vence nos próximos 30
// dias, e o imposto e a folha do mês. É o piso que o caixa precisa segurar.
function compromissosProximos() {
  const limite = somaDias(hojeISO(), DIAS_DE_COMPROMISSO);
  const contas = despesas
    .filter((d) => d.status !== "Pago")
    .filter((d) => !d.vencimento || String(d.vencimento).slice(0, 10) <= limite)
    .reduce((s, d) => s + Number(d.valor || 0), 0);
  return contas + impostosProvisionados() + folhaProvisionada();
}

// Quanto dá para tirar sem deixar conta descoberta. Nunca negativo: quando o
// caixa já não cobre os compromissos, a resposta é simplesmente zero.
function podeTirarAgora() {
  return Math.max(0, saldoEmCaixa() - compromissosProximos());
}

// ----- Registrar retirada -----

document.getElementById("abrir-retirada").addEventListener("click", () => {
  const lista = direitoAcumulado().socios;
  retiradaSocio.innerHTML = "";
  lista.forEach((s) => {
    const opcao = document.createElement("option");
    opcao.value = s.nome;
    opcao.textContent = s.nome;
    retiradaSocio.appendChild(opcao);
  });

  retiradaValor.value = "";
  document.getElementById("ret-data").value = hojeISO();
  document.getElementById("ret-observacoes").value = "";
  retiradaStatusMsg.className = "status";
  atualizarDicaDaRetirada();

  retiradaForm.classList.remove("hidden");
  document.getElementById("abrir-retirada").classList.add("hidden");
});

document.getElementById("cancelar-retirada").addEventListener("click", () => {
  retiradaForm.classList.add("hidden");
  document.getElementById("abrir-retirada").classList.remove("hidden");
});

// Avisa antes de gravar, sem impedir: o dono pode ter motivo para tirar mesmo
// assim, e quem decide isso é ele.
function atualizarDicaDaRetirada() {
  const hint = document.getElementById("ret-valor-hint");
  const escolhido = direitoAcumulado().socios.find((s) => s.nome === retiradaSocio.value);
  if (!escolhido) {
    hint.textContent = "";
    return;
  }

  const aRetirar = escolhido.direito - jaRetiradoPor(escolhido.nome);
  const valor = valorDoCampo(retiradaValor);
  const aguenta = podeTirarAgora();

  if (valor <= 0) {
    hint.className = "doc-hint";
    hint.textContent = `${escolhido.nome} tem ${dinheiro(aRetirar)} a retirar. O caixa aguenta ${dinheiro(aguenta)}.`;
    return;
  }

  if (valor > aguenta) {
    hint.className = "doc-hint error";
    hint.textContent = `Isso passa em ${dinheiro(valor - aguenta)} do que o caixa aguenta. Vai faltar para as contas dos próximos 30 dias.`;
    return;
  }

  if (valor > aRetirar) {
    hint.className = "doc-hint aviso";
    hint.textContent = `Passa em ${dinheiro(valor - aRetirar)} do que ${escolhido.nome} tem direito — vira adiantamento.`;
    return;
  }

  hint.className = "doc-hint ok";
  hint.textContent = `Depois disso sobram ${dinheiro(aRetirar - valor)} a retirar, e o caixa fica com ${dinheiro(aguenta - valor)} de folga.`;
}

retiradaValor.addEventListener("input", atualizarDicaDaRetirada);
retiradaSocio.addEventListener("change", atualizarDicaDaRetirada);

retiradaForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const valor = valorDoCampo(retiradaValor);
  if (valor <= 0) {
    retiradaStatusMsg.textContent = "Informe um valor maior que zero.";
    retiradaStatusMsg.className = "status show error";
    return;
  }

  const botao = document.getElementById("salvar-retirada");
  botao.disabled = true;
  retiradaStatusMsg.textContent = "Salvando...";
  retiradaStatusMsg.className = "status show loading";

  try {
    const resposta = await pedirAoN8n("salvar-retirada", {
      data: document.getElementById("ret-data").value || hojeISO(),
      socio: retiradaSocio.value,
      valor: String(valor),
      observacoes: document.getElementById("ret-observacoes").value.trim(),
    });

    if (!resposta || !resposta.ok) {
      throw new Error((resposta && resposta.mensagem) || "Não consegui registrar.");
    }

    retiradaForm.classList.add("hidden");
    document.getElementById("abrir-retirada").classList.remove("hidden");
    await recarregarRetiradas();
  } catch (err) {
    retiradaStatusMsg.textContent = err.message || "Não foi possível falar com o n8n.";
    retiradaStatusMsg.className = "status show error";
  } finally {
    botao.disabled = false;
  }
});

async function recarregarRetiradas() {
  const resposta = await pedirAoN8n("listar-retiradas", {});
  if (resposta && resposta.ok) retiradas = resposta.retiradas || [];
  desenharDivisao();
  // Retirada é dinheiro saindo do caixa: o saldo e a previsão mudam junto.
  desenharPainel();
}

// ----- Desenhar a tela -----

function desenharDivisao() {
  const temServico = servicosRecebidos().length > 0;
  document.getElementById("divisao-vazio").classList.toggle("hidden", temServico);
  document.getElementById("divisao-conteudo").classList.toggle("hidden", !temServico);
  if (!temServico) return;

  const { socios: lista, empresa } = direitoAcumulado();

  // --- um cartão por sócio ---
  const caixaSocios = document.getElementById("divisao-socios");
  caixaSocios.innerHTML = "";
  let totalAretirar = 0;

  lista.forEach((s) => {
    const retirado = jaRetiradoPor(s.nome);
    const aRetirar = s.direito - retirado;
    totalAretirar += Math.max(0, aRetirar);

    const cartao = modeloSocio.content.firstElementChild.cloneNode(true);
    cartao.querySelector(".socio-nome").textContent =
      `${s.nome} · ${(s.fatia * 100).toFixed(2).replace(".", ",")}% do lucro`;
    cartao.querySelector(".socio-direito").textContent = dinheiro(s.direito);
    cartao.querySelector(".socio-retirado").textContent = dinheiro(retirado);

    const alvo = cartao.querySelector(".socio-a-retirar");
    alvo.textContent = dinheiro(aRetirar);
    // Negativo aqui quer dizer que já tirou mais do que rendeu — adiantamento.
    alvo.classList.toggle("valor-negativo", aRetirar < 0);
    alvo.classList.toggle("valor-positivo", aRetirar > 0);

    caixaSocios.appendChild(cartao);
  });

  // --- quanto o caixa aguenta pagar disso agora ---
  const aguenta = podeTirarAgora();
  const caixaAguenta = document.getElementById("d-pode-tirar");
  caixaAguenta.textContent = dinheiro(aguenta);
  caixaAguenta.classList.toggle("valor-negativo", aguenta <= 0);
  caixaAguenta.classList.toggle("valor-positivo", aguenta > 0);

  const nota = document.getElementById("d-pode-tirar-nota");
  const compromissos = compromissosProximos();
  if (aguenta <= 0) {
    nota.className = "doc-hint error";
    nota.textContent = `O caixa tem ${dinheiro(saldoEmCaixa())} e ${dinheiro(compromissos)} de contas nos próximos ${DIAS_DE_COMPROMISSO} dias. Tirar agora deixa conta descoberta.`;
  } else if (aguenta < totalAretirar) {
    nota.className = "doc-hint aviso";
    nota.textContent = `Há ${dinheiro(totalAretirar)} a retirar no total, mas só ${dinheiro(aguenta)} sobra depois das contas dos próximos ${DIAS_DE_COMPROMISSO} dias. O resto fica para quando entrar mais dinheiro.`;
  } else {
    nota.className = "doc-hint ok";
    nota.textContent = `Já descontadas as contas dos próximos ${DIAS_DE_COMPROMISSO} dias, o imposto e a folha.`;
  }

  // --- a parte da empresa: onde o buraco aparece ---
  // Contas pagas que não são material de serviço são o que o terço da empresa
  // precisa cobrir. Se não cobre, a empresa encolhe mesmo com serviço dando lucro.
  const gastouEmpresa = despesas
    .filter((d) => d.status === "Pago" && !d.servicoId)
    .reduce((s, d) => s + Number(d.valor || 0), 0);
  const sobrouEmpresa = empresa - gastouEmpresa;

  document.getElementById("d-empresa-coube").textContent = dinheiro(empresa);
  document.getElementById("d-empresa-gastou").textContent = dinheiro(gastouEmpresa);
  const alvoEmpresa = document.getElementById("d-empresa-sobrou");
  alvoEmpresa.textContent = dinheiro(sobrouEmpresa);
  alvoEmpresa.classList.toggle("valor-negativo", sobrouEmpresa < 0);
  alvoEmpresa.classList.toggle("valor-positivo", sobrouEmpresa >= 0);

  const notaEmpresa = document.getElementById("d-empresa-nota");
  if (sobrouEmpresa < 0) {
    notaEmpresa.className = "doc-hint error";
    notaEmpresa.textContent = `A fatia da empresa não cobriu as contas dela em ${dinheiro(-sobrouEmpresa)}. A diferença saiu do caixa — é por isso que sobra menos do que parece.`;
  } else {
    notaEmpresa.className = "doc-hint ok";
    notaEmpresa.textContent = "A fatia da empresa está cobrindo as contas dela.";
  }

  // --- lucro serviço a serviço ---
  const corpo = document.getElementById("d-servicos");
  corpo.innerHTML = "";
  const porSocio = lista.length ? lista[0].fatia : 0;

  servicosRecebidos().forEach((servico) => {
    const material = materialDoServico(servico);
    const lucro = lucroDoServico(servico);
    const tr = document.createElement("tr");
    if (lucro < 0) tr.className = "linha-negativa";

    [
      servico.descricao || "(sem descrição)",
      dinheiro(servico.valor),
      dinheiro(material),
      dinheiro(lucro),
      dinheiro(lucro * porSocio),
    ].forEach((texto, i) => {
      const td = document.createElement("td");
      td.textContent = texto;
      if (i === 3) td.className = lucro < 0 ? "valor-negativo" : "valor-positivo";
      tr.appendChild(td);
    });
    corpo.appendChild(tr);
  });

  desenharRetiradas();
}

function desenharRetiradas() {
  listaRetiradasBox.innerHTML = "";

  if (!retiradas.length) {
    listaRetiradasStatus.className = "doc-hint neutral";
    listaRetiradasStatus.textContent = "Nenhuma retirada registrada ainda.";
    return;
  }

  const total = retiradas.reduce((s, r) => s + Number(r.valor || 0), 0);
  listaRetiradasStatus.className = "doc-hint neutral";
  listaRetiradasStatus.textContent = `${retiradas.length} retirada${retiradas.length > 1 ? "s" : ""} · ${dinheiro(total)}`;

  retiradas.forEach((r) => listaRetiradasBox.appendChild(montarLinhaRetirada(r)));
}

function montarLinhaRetirada(retirada) {
  const linha = modeloRetirada.content.firstElementChild.cloneNode(true);
  linha.querySelector(".despesa-descricao").textContent = retirada.socio || "(sem nome)";
  linha.querySelector(".despesa-valor").textContent = dinheiro(retirada.valor);

  const partes = [dataBonita(retirada.data)];
  if (retirada.observacoes) partes.push(retirada.observacoes);
  linha.querySelector(".despesa-extra").textContent = partes.join(" · ");

  const acoes = linha.querySelector(".despesa-acoes");
  const botaoExcluir = linha.querySelector(".retirada-excluir");

  linha.querySelector(".despesa-resumo").addEventListener("click", () => {
    const abrindo = acoes.classList.contains("hidden");
    listaRetiradasBox.querySelectorAll(".despesa").forEach((outra) => {
      outra.classList.remove("aberta");
      outra.querySelector(".despesa-acoes").classList.add("hidden");
      desarmarConfirmacao(outra.querySelector(".retirada-excluir"), "Excluir");
    });
    acoes.classList.toggle("hidden", !abrindo);
    linha.classList.toggle("aberta", abrindo);
  });

  ligarExclusao(botaoExcluir, "Excluir", "Confirmar exclusão", async () => {
    try {
      const resposta = await pedirAoN8n("excluir-retirada", { id: retirada.id });
      if (!resposta || !resposta.ok) {
        listaRetiradasStatus.className = "doc-hint error";
        listaRetiradasStatus.textContent = (resposta && resposta.mensagem) || "Não consegui excluir.";
        return;
      }
      retiradas = retiradas.filter((x) => x.id !== retirada.id);
      desenharDivisao();
      desenharPainel();
    } catch (err) {
      listaRetiradasStatus.className = "doc-hint error";
      listaRetiradasStatus.textContent = "Não foi possível falar com o n8n.";
    }
  });

  return linha;
}

// O campo "é material de qual serviço?" da despesa só pode oferecer serviços
// que existem, então é preenchido depois que a lista chega.
function atualizarListaDeServicos() {
  const campo = document.getElementById("despesa-servico");
  const escolhido = campo.value;
  campo.innerHTML = '<option value="">Não — é despesa da empresa</option>';

  recebimentos.forEach((r) => {
    const opcao = document.createElement("option");
    opcao.value = r.id;
    opcao.textContent = `${r.descricao}${r.cliente ? " · " + r.cliente : ""}`;
    campo.appendChild(opcao);
  });

  campo.value = recebimentos.some((r) => r.id === escolhido) ? escolhido : "";
}

// ----- Financeiro: cartões de crédito e pagamento da fatura -----

const listaCartoesBox = document.getElementById("lista-cartoes");
const listaCartoesStatus = document.getElementById("lista-cartoes-status");
const modeloCartao = document.getElementById("modelo-cartao");
const cartaoForm = document.getElementById("form-cartao");
const cartaoStatusMsg = document.getElementById("cartao-status-msg");

const cartaoCampos = {
  nome: document.getElementById("cartao-nome"),
  banco: document.getElementById("cartao-banco"),
  bandeira: document.getElementById("cartao-bandeira"),
  final: document.getElementById("cartao-final"),
  fechamento: document.getElementById("cartao-fechamento"),
  vencimento: document.getElementById("cartao-vencimento"),
  chave: document.getElementById("cartao-chave"),
  tipoChave: document.getElementById("cartao-tipo-chave"),
  limite: document.getElementById("cartao-limite"),
  observacoes: document.getElementById("cartao-observacoes"),
};

let cartoes = [];
let pagamentosFatura = [];
let cartaoEditando = "";

ligarMascaraDinheiro(cartaoCampos.limite);

function mostrarCartaoStatus(tipo, mensagem) {
  cartaoStatusMsg.textContent = mensagem;
  cartaoStatusMsg.className = `status show ${tipo}`;
}

// Em qual fatura uma compra cai. Comprou até o dia do fechamento, entra na
// fatura que fecha neste mês; depois disso, na do mês seguinte. E quando o
// vencimento é anterior ao fechamento, a fatura só vence no mês seguinte.
function faturaDaCompra(cartao, dataCompra) {
  const [ano, mes, dia] = String(dataCompra).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return "";

  let mesFatura = dia <= Number(cartao.diaFechamento) ? mes : mes + 1;
  let anoFatura = ano;

  if (Number(cartao.diaVencimento) <= Number(cartao.diaFechamento)) mesFatura += 1;

  while (mesFatura > 12) {
    mesFatura -= 12;
    anoFatura += 1;
  }

  return diaNoMes(anoFatura, mesFatura - 1, Number(cartao.diaVencimento));
}

function cartaoPorId(id) {
  return cartoes.find((c) => c.id === id) || null;
}

// ----- Cadastro dos cartões (dentro de Ajustes) -----

function mostrarCicloDoCartao() {
  const fecha = Number(cartaoCampos.fechamento.value) || 1;
  const vence = Number(cartaoCampos.vencimento.value) || 1;
  const hint = document.getElementById("cartao-ciclo-hint");

  const fingido = { diaFechamento: fecha, diaVencimento: vence };
  const exemplo = faturaDaCompra(fingido, hojeISO());
  hint.className = "doc-hint";
  hint.textContent = exemplo
    ? `Uma compra feita hoje cairia na fatura que vence em ${dataBonita(exemplo)}.`
    : "";
}

[cartaoCampos.fechamento, cartaoCampos.vencimento].forEach((campo) =>
  campo.addEventListener("input", mostrarCicloDoCartao)
);

function limparFormCartao() {
  cartaoEditando = "";
  Object.values(cartaoCampos).forEach((campo) => (campo.value = ""));
  cartaoCampos.fechamento.value = "1";
  cartaoCampos.vencimento.value = "10";
  cartaoStatusMsg.className = "status";
  document.getElementById("salvar-cartao").textContent = "Salvar cartão";
  mostrarCicloDoCartao();
}

function abrirFormCartao(cartao) {
  limparFormCartao();

  if (cartao) {
    cartaoEditando = cartao.id;
    cartaoCampos.nome.value = cartao.nome || "";
    cartaoCampos.banco.value = cartao.banco || "";
    cartaoCampos.bandeira.value = cartao.bandeira || "";
    cartaoCampos.final.value = cartao.final || "";
    cartaoCampos.fechamento.value = String(cartao.diaFechamento || 1);
    cartaoCampos.vencimento.value = String(cartao.diaVencimento || 10);
    cartaoCampos.chave.value = cartao.chavePix || "";
    cartaoCampos.tipoChave.value = cartao.tipoChavePix || "";
    porValorNoCampo(cartaoCampos.limite, cartao.limite);
    cartaoCampos.observacoes.value = cartao.observacoes || "";
    document.getElementById("salvar-cartao").textContent = "Salvar alterações";
    mostrarCicloDoCartao();
  }

  cartaoForm.classList.remove("hidden");
  document.getElementById("novo-cartao").classList.add("hidden");
  cartaoCampos.nome.focus();
}

function fecharFormCartao() {
  cartaoForm.classList.add("hidden");
  document.getElementById("novo-cartao").classList.remove("hidden");
  limparFormCartao();
}

document.getElementById("novo-cartao").addEventListener("click", () => abrirFormCartao(null));
document.getElementById("cancelar-cartao").addEventListener("click", fecharFormCartao);

document.getElementById("salvar-cartao").addEventListener("click", async () => {
  if (!cartaoCampos.nome.value.trim()) {
    mostrarCartaoStatus("error", "Dê um nome ao cartão.");
    return;
  }

  const botao = document.getElementById("salvar-cartao");
  botao.disabled = true;
  mostrarCartaoStatus("loading", "Salvando...");

  try {
    const corpo = {
      nome: cartaoCampos.nome.value.trim(),
      banco: cartaoCampos.banco.value.trim(),
      bandeira: cartaoCampos.bandeira.value,
      final: cartaoCampos.final.value.trim(),
      chavePix: cartaoCampos.chave.value.trim(),
      tipoChavePix: cartaoCampos.tipoChave.value,
      diaFechamento: cartaoCampos.fechamento.value,
      diaVencimento: cartaoCampos.vencimento.value,
      limite: String(valorDoCampo(cartaoCampos.limite)),
      observacoes: cartaoCampos.observacoes.value.trim(),
    };
    if (cartaoEditando) corpo.id = cartaoEditando;

    const resposta = await pedirAoN8n("salvar-cartao", corpo);
    if (!resposta || !resposta.ok) {
      throw new Error((resposta && resposta.mensagem) || "Não consegui salvar.");
    }

    fecharFormCartao();
    await recarregarCartoes();
  } catch (err) {
    mostrarCartaoStatus("error", err.message || "Não foi possível falar com o n8n.");
  } finally {
    botao.disabled = false;
  }
});

async function recarregarCartoes() {
  const resposta = await pedirAoN8n("listar-cartoes", {});
  if (resposta && resposta.ok) cartoes = resposta.cartoes || [];
  desenharCartoes();
  atualizarListaDeCartoesNaDespesa();
  desenharPainel();
}

function desenharCartoes() {
  listaCartoesBox.innerHTML = "";

  if (!cartoes.length) {
    listaCartoesStatus.className = "doc-hint neutral";
    listaCartoesStatus.textContent = "Nenhum cartão cadastrado ainda.";
    return;
  }

  listaCartoesStatus.className = "doc-hint neutral";
  listaCartoesStatus.textContent = `${cartoes.length} cartão${cartoes.length > 1 ? "ões" : ""}.`;
  cartoes.forEach((c) => listaCartoesBox.appendChild(montarLinhaCartao(c)));
}

function montarLinhaCartao(cartao) {
  const linha = modeloCartao.content.firstElementChild.cloneNode(true);
  linha.classList.toggle("paga", !cartao.ativo);

  linha.querySelector(".despesa-descricao").textContent =
    cartao.nome + (cartao.final ? ` ····${cartao.final}` : "");
  linha.querySelector(".despesa-valor").textContent =
    cartao.limite > 0 ? dinheiro(cartao.limite) : "";

  const partes = [`fecha dia ${cartao.diaFechamento} · vence dia ${cartao.diaVencimento}`];
  if (cartao.banco) partes.push(cartao.banco);
  if (cartao.bandeira) partes.push(cartao.bandeira);
  // Sem chave PIX o sistema só avisa; não consegue pagar sozinho.
  partes.push(cartao.chavePix ? "PIX cadastrado" : "sem chave PIX");
  linha.querySelector(".despesa-extra").textContent = partes.join(" · ");

  const acoes = linha.querySelector(".despesa-acoes");
  linha.querySelector(".despesa-resumo").addEventListener("click", () => {
    const abrindo = acoes.classList.contains("hidden");
    listaCartoesBox.querySelectorAll(".despesa").forEach((outra) => {
      outra.classList.remove("aberta");
      outra.querySelector(".despesa-acoes").classList.add("hidden");
      desarmarConfirmacao(outra.querySelector(".cartao-excluir"), "Excluir");
    });
    acoes.classList.toggle("hidden", !abrindo);
    linha.classList.toggle("aberta", abrindo);
  });

  linha.querySelector(".cartao-editar").addEventListener("click", () => {
    abrirFormCartao(cartao);
    cartaoForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  ligarExclusao(linha.querySelector(".cartao-excluir"), "Excluir", "Confirmar exclusão", async () => {
    try {
      const resposta = await pedirAoN8n("excluir-cartao", { id: cartao.id });
      if (!resposta || !resposta.ok) {
        listaCartoesStatus.className = "doc-hint error";
        listaCartoesStatus.textContent = (resposta && resposta.mensagem) || "Não consegui excluir.";
        return;
      }
      cartoes = cartoes.filter((c) => c.id !== cartao.id);
      desenharCartoes();
      atualizarListaDeCartoesNaDespesa();
      desenharPainel();
    } catch (err) {
      listaCartoesStatus.className = "doc-hint error";
      listaCartoesStatus.textContent = "Não foi possível falar com o n8n.";
    }
  });

  return linha;
}

// ----- O cartão no formulário de despesa -----

function atualizarListaDeCartoesNaDespesa() {
  const campo = document.getElementById("despesa-cartao");
  const escolhido = campo.value;
  campo.innerHTML = '<option value="">Não informado</option>';

  cartoes.filter((c) => c.ativo).forEach((c) => {
    const opcao = document.createElement("option");
    opcao.value = c.id;
    opcao.textContent = c.nome + (c.final ? ` ····${c.final}` : "");
    campo.appendChild(opcao);
  });

  campo.value = cartoes.some((c) => c.id === escolhido) ? escolhido : "";
}

// O campo de cartão só faz sentido quando a compra foi no cartão de crédito.
function ajustarLinhaCartao() {
  const noCartao = despesaCampos.forma.value === "Cartão de crédito";
  document.getElementById("linha-cartao").classList.toggle("hidden", !noCartao);
  if (!noCartao) document.getElementById("despesa-cartao").value = "";
  mostrarFaturaDaCompra();
}

// Ao escolher cartão e data, o vencimento vira a data da FATURA — é assim que
// a compra entra no grupo certo, sem o dono ter que calcular de cabeça.
function mostrarFaturaDaCompra() {
  const hint = document.getElementById("despesa-cartao-hint");
  const cartao = cartaoPorId(document.getElementById("despesa-cartao").value);
  const data = despesaCampos.vencimento.value;

  if (!cartao || !data) {
    hint.textContent = "";
    return;
  }

  const fatura = faturaDaCompra(cartao, data);
  hint.className = "doc-hint";
  hint.textContent = fatura
    ? `Essa compra entra na fatura que vence em ${dataBonita(fatura)}.`
    : "";
}

document.getElementById("despesa-cartao").addEventListener("change", mostrarFaturaDaCompra);

// ----- A fatura no Painel -----

// Uma fatura por cartão: as despesas ainda não pagas daquele cartão, agrupadas
// pela data de vencimento da fatura em que caem.
function faturasDosCartoes() {
  const hoje = hojeISO();
  const grupos = [];

  cartoes.filter((c) => c.ativo).forEach((cartao) => {
    const doCartao = despesas.filter((d) => d.status !== "Pago" && d.cartaoId === cartao.id);

    const porFatura = {};
    doCartao.forEach((d) => {
      // A despesa já foi salva com o vencimento da fatura; se veio sem data,
      // calcula na hora para não sumir da tela.
      const dia = String(d.vencimento || "").slice(0, 10) || faturaDaCompra(cartao, hoje);
      (porFatura[dia] = porFatura[dia] || []).push(d);
    });

    Object.entries(porFatura).forEach(([dia, itens]) => {
      // Só entra na tela um dia antes de vencer — antes disso é só previsão.
      if (somaDias(dia, -1) > hoje) return;
      grupos.push({
        cartao,
        dia,
        itens,
        total: itens.reduce((s, i) => s + Number(i.valor || 0), 0),
      });
    });
  });

  return grupos.sort((a, b) => a.dia.localeCompare(b.dia));
}

// Compras no cartão que não têm cartão escolhido continuam funcionando: viram
// um grupo pela data, sem PIX — só dá para marcar como pago à mão.
function faturasSemCartao() {
  const hoje = hojeISO();
  const soltas = despesas.filter(
    (d) => d.status !== "Pago" && d.formaPagamento === "Cartão de crédito"
      && !d.cartaoId && d.vencimento && String(d.vencimento).slice(0, 10) <= hoje
  );

  const porData = {};
  soltas.forEach((d) => {
    const dia = String(d.vencimento).slice(0, 10);
    (porData[dia] = porData[dia] || []).push(d);
  });

  return Object.entries(porData)
    .map(([dia, itens]) => ({
      cartao: null, dia, itens,
      total: itens.reduce((s, i) => s + Number(i.valor || 0), 0),
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

function faturaJaPaga(cartaoId, dia) {
  return pagamentosFatura.some(
    (p) => p.status === "Enviado" && p.cartaoId === cartaoId
      && String(p.vencimentoFatura || "").slice(0, 10) === dia
  );
}

function desenharFaturas() {
  const grupos = [...faturasDosCartoes(), ...faturasSemCartao()];
  const bloco = document.getElementById("faturas-bloco");
  const lista = document.getElementById("faturas-lista");

  bloco.classList.toggle("hidden", grupos.length === 0);
  // Limpa antes de sair: escondido com conteudo velho dentro reaparece errado
  // se o bloco voltar a ser mostrado por outro motivo.
  lista.innerHTML = "";
  if (!grupos.length) return;
  grupos.forEach((grupo) => lista.appendChild(montarLinhaFatura(grupo)));
}

function montarLinhaFatura(grupo) {
  const bloco = modeloFatura.content.firstElementChild.cloneNode(true);
  const hoje = hojeISO();
  const atrasada = grupo.dia < hoje;
  const venceHoje = grupo.dia === hoje;
  const cartao = grupo.cartao;

  bloco.querySelector(".fatura-titulo").textContent =
    `${cartao ? cartao.nome : "Cartão de crédito"} · ${atrasada ? "venceu" : "vence"} em ${dataBonita(grupo.dia)}`;

  const subtitulo = bloco.querySelector(".fatura-subtitulo");
  if (atrasada) {
    subtitulo.className = "fatura-subtitulo doc-hint error";
    subtitulo.textContent = "Já passou do vencimento.";
  } else if (venceHoje) {
    subtitulo.className = "fatura-subtitulo doc-hint aviso";
    subtitulo.textContent = "Vence hoje.";
  } else {
    subtitulo.className = "fatura-subtitulo doc-hint aviso";
    subtitulo.textContent = "Vence amanhã — o PIX precisa sair.";
  }

  const itensBox = bloco.querySelector(".fatura-itens");
  grupo.itens.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.descricao || "(sem descrição)"} — ${dinheiro(item.valor)}`;
    itensBox.appendChild(li);
  });

  const campoValor = bloco.querySelector(".fatura-valor-campo");
  ligarMascaraDinheiro(campoValor);
  porValorNoCampo(campoValor, grupo.total);

  const diferenca = bloco.querySelector(".fatura-diferenca");
  function mostrarDiferenca() {
    const informado = valorDoCampo(campoValor);
    const delta = Math.round((informado - grupo.total) * 100) / 100;

    if (Math.abs(delta) < 0.01) {
      diferenca.className = "fatura-diferenca doc-hint";
      diferenca.textContent = `Somei ${dinheiro(grupo.total)} das compras lançadas.`;
      return;
    }
    // Diferença é normal: pode haver compra que ainda não foi lançada aqui.
    diferenca.className = "fatura-diferenca doc-hint aviso";
    diferenca.textContent = delta > 0
      ? `${dinheiro(delta)} a mais do que somei — vou lançar a diferença como despesa.`
      : `${dinheiro(-delta)} a menos do que somei — vou lançar a diferença como despesa.`;
  }
  campoValor.addEventListener("input", mostrarDiferenca);
  mostrarDiferenca();

  const status = bloco.querySelector(".fatura-status");
  const botaoPagar = bloco.querySelector(".fatura-pagar");
  const botaoPagarBoleto = bloco.querySelector(".fatura-pagar-boleto");
  const campoBoleto = bloco.querySelector(".fatura-boleto-campo");
  const botaoConfirmar = bloco.querySelector(".fatura-confirmar");

  // Sem cartão escolhido ou sem chave PIX, o sistema não tem para onde mandar
  // por PIX — mas o boleto continua disponível, porque o código vem colado
  // na hora, não precisa de nada salvo.
  const podePagarPix = Boolean(cartao && cartao.chavePix && cartao.tipoChavePix);
  const podePagarBoleto = Boolean(cartao);
  botaoPagar.classList.toggle("hidden", !podePagarPix);
  bloco.querySelector(".fatura-boleto-bloco").classList.toggle("hidden", !podePagarBoleto);
  bloco.querySelector(".fatura-valor-linha").classList.toggle("hidden", !podePagarPix && !podePagarBoleto);
  diferenca.classList.toggle("hidden", !podePagarPix && !podePagarBoleto);

  if (cartao && !podePagarPix) {
    subtitulo.textContent += " Este cartão não tem chave PIX fixa — cole o código da fatura para pagar por boleto.";
  }

  function travar(travado, texto) {
    botaoPagar.disabled = travado;
    botaoPagarBoleto.disabled = travado;
    botaoConfirmar.disabled = travado;
    if (texto) {
      status.textContent = texto;
      status.className = "fatura-status status show loading";
    }
  }

  // --- pagar por PIX (move dinheiro de verdade) ---
  botaoPagar.addEventListener("click", async () => {
    const valor = valorDoCampo(campoValor);
    if (valor <= 0) {
      status.textContent = "Informe o valor da fatura.";
      status.className = "fatura-status status show error";
      return;
    }

    // Dois toques, e o segundo diz exatamente o que vai acontecer e para onde.
    if (!botaoPagar.classList.contains("confirmando")) {
      botaoPagar.classList.add("confirmando");
      botaoPagar.textContent = `Confirmar: enviar ${dinheiro(valor)} para ${cartao.chavePix}`;
      return;
    }

    travar(true, "Enviando o PIX...");
    try {
      const resposta = await pedirAoN8n("pagar-fatura", {
        cartaoId: cartao.id,
        vencimentoFatura: grupo.dia,
        valor: String(valor),
        valorCalculado: String(grupo.total),
        ids: grupo.itens.map((i) => i.id).join(","),
      });

      if (!resposta || !resposta.ok) {
        status.textContent = (resposta && resposta.mensagem) || "Não consegui pagar.";
        status.className = "fatura-status status show error";
        travar(false);
        botaoPagar.classList.remove("confirmando");
        botaoPagar.textContent = "Pagar por PIX agora";
        return;
      }

      await recarregarAposFatura();
    } catch (err) {
      status.textContent = "Não foi possível falar com o n8n. Confira no Asaas se o PIX saiu antes de tentar de novo.";
      status.className = "fatura-status status show error";
      travar(false);
      botaoPagar.classList.remove("confirmando");
      botaoPagar.textContent = "Pagar por PIX agora";
    }
  });

  // --- pagar por boleto (move dinheiro de verdade, para cartão sem chave fixa) ---
  botaoPagarBoleto.addEventListener("click", async () => {
    const valor = valorDoCampo(campoValor);
    if (valor <= 0) {
      status.textContent = "Informe o valor da fatura.";
      status.className = "fatura-status status show error";
      return;
    }

    const linha = campoBoleto.value.replace(/[^0-9]/g, "");
    if (linha.length < 40) {
      status.textContent = "Cole o código de barras ou a linha digitável completa da fatura.";
      status.className = "fatura-status status show error";
      return;
    }

    // Dois toques, e o segundo confirma o valor exato antes de pagar.
    if (!botaoPagarBoleto.classList.contains("confirmando")) {
      botaoPagarBoleto.classList.add("confirmando");
      botaoPagarBoleto.textContent = `Confirmar: pagar ${dinheiro(valor)} deste boleto`;
      return;
    }

    travar(true, "Pagando o boleto...");
    try {
      const resposta = await pedirAoN8n("pagar-fatura-boleto", {
        cartaoId: cartao.id,
        vencimentoFatura: grupo.dia,
        valor: String(valor),
        valorCalculado: String(grupo.total),
        linhaDigitavel: linha,
        ids: grupo.itens.map((i) => i.id).join(","),
      });

      if (!resposta || !resposta.ok) {
        status.textContent = (resposta && resposta.mensagem) || "Não consegui pagar o boleto.";
        status.className = "fatura-status status show error";
        travar(false);
        botaoPagarBoleto.classList.remove("confirmando");
        botaoPagarBoleto.textContent = "Pagar este boleto agora";
        return;
      }

      await recarregarAposFatura();
    } catch (err) {
      status.textContent = "Não foi possível falar com o n8n. Confira no Asaas se o boleto saiu antes de tentar de novo.";
      status.className = "fatura-status status show error";
      travar(false);
      botaoPagarBoleto.classList.remove("confirmando");
      botaoPagarBoleto.textContent = "Pagar este boleto agora";
    }
  });

  // --- só marcar como pago, sem mover dinheiro ---
  botaoConfirmar.addEventListener("click", async () => {
    if (!botaoConfirmar.classList.contains("confirmando")) {
      botaoConfirmar.classList.add("confirmando");
      botaoConfirmar.textContent = "Confirmar — marcar tudo como pago";
      return;
    }

    travar(true, "Confirmando...");
    try {
      const resposta = await pedirAoN8n("confirmar-fatura", {
        ids: grupo.itens.map((i) => i.id).join(","),
        dataPagamento: hojeISO(),
      });

      if (!resposta || !resposta.ok) {
        status.textContent = (resposta && resposta.mensagem) || "Não consegui confirmar.";
        status.className = "fatura-status status show error";
        travar(false);
        botaoConfirmar.classList.remove("confirmando");
        botaoConfirmar.textContent = "Já paguei por fora — só marcar como pago";
        return;
      }

      await recarregarDespesas();
    } catch (err) {
      status.textContent = "Não foi possível falar com o n8n.";
      status.className = "fatura-status status show error";
      travar(false);
      botaoConfirmar.classList.remove("confirmando");
      botaoConfirmar.textContent = "Já paguei por fora — só marcar como pago";
    }
  });

  return bloco;
}

// Depois de pagar uma fatura muda a despesa (virou paga) e o histórico de
// pagamentos (que é a trava contra pagar duas vezes).
async function recarregarAposFatura() {
  const [resDespesas, resPagamentos] = await Promise.all([
    pedirAoN8n("listar-despesas", {}),
    pedirAoN8n("listar-pagamentos-fatura", {}),
  ]);
  if (resDespesas && resDespesas.ok) despesas = resDespesas.despesas || [];
  if (resPagamentos && resPagamentos.ok) pagamentosFatura = resPagamentos.pagamentos || [];
  atualizarListasDeApoio();
  atualizarFiltroDeMeses();
  desenharDespesas();
  desenharDivisao();
  desenharPainel();
}

// ----- Carregar tudo -----

// As três listas saem ao mesmo tempo de propósito: cada ida ao Airtable custa
// quase um segundo, e o navegador dá conta de esperar as três em paralelo — o
// n8n, não (ele executa um nó de cada vez).
async function carregarFinanceiro() {
  mostrarListaDespesasStatus("neutral", "Carregando...");
  listaDespesasBox.innerHTML = "";

  try {
    // Duas ondas de propósito. O navegador só faz cerca de SEIS chamadas ao
    // mesmo tempo; a sétima espera a primeira terminar, e aí o tempo dobra.
    // Então a primeira onda traz só o que a tela precisa para aparecer.
    const [resDespesas, resRecebimentos, resRecorrentes, resConfig, resRetiradas] =
      await Promise.all([
        pedirAoN8n("listar-despesas", {}),
        pedirAoN8n("listar-recebimentos", {}),
        pedirAoN8n("listar-recorrentes", {}),
        pedirAoN8n("listar-config", {}),
        pedirAoN8n("listar-retiradas", {}),
      ]);

    if (!resDespesas || !resDespesas.ok) {
      mostrarListaDespesasStatus("error", (resDespesas && resDespesas.mensagem) || "Não consegui carregar.");
      return;
    }

    despesas = resDespesas.despesas || [];
    recebimentos = (resRecebimentos && resRecebimentos.recebimentos) || [];
    recorrentes = (resRecorrentes && resRecorrentes.recorrentes) || [];
    configFin = (resConfig && resConfig.config) || null;
    retiradas = (resRetiradas && resRetiradas.retiradas) || [];

    financeiroCarregado = true;
    atualizarListasDeApoio();
    atualizarListaDeClientes();
    atualizarFiltroDeMeses();
    atualizarFiltroDeMesesReceita();
    preencherAjustes();
    desenharDespesas();
    desenharReceitas();
    desenharRecorrentes();
    atualizarListaDeServicos();
    desenharDivisao();
    desenharPainel();

    // Segunda onda, sem segurar a tela: nada aqui muda os números do painel.
    // Os nomes de fornecedor e a última conferência aparecem um instante depois.
    segundaOndaDoFinanceiro();
  } catch (err) {
    mostrarListaDespesasStatus("error", "Não foi possível falar com o n8n. Ele está ligado e o túnel ativo?");
  }
}

// O que pode chegar atrasado sem atrapalhar: a lista de fornecedores (só serve
// para sugerir nomes), a última conferência com o banco, e o lançamento das
// contas fixas vencidas.
async function segundaOndaDoFinanceiro() {
  try {
    const [resFornecedores, resConferencias, resCadastros, resCartoes,
           resPagamentosFatura, resGeracao] = await Promise.all([
      pedirAoN8n("listar-fornecedores", {}),
      pedirAoN8n("listar-conferencias", {}),
      pedirAoN8n("listar-cadastros", {}),
      pedirAoN8n("listar-cartoes", {}),
      pedirAoN8n("listar-pagamentos-fatura", {}),
      pedirAoN8n("gerar-recorrentes", {}).catch(() => null),
    ]);

    fornecedores = (resFornecedores && resFornecedores.fornecedores) || [];
    conferencias = (resConferencias && resConferencias.conferencias) || [];
    cartoes = (resCartoes && resCartoes.cartoes) || [];
    pagamentosFatura = (resPagamentosFatura && resPagamentosFatura.pagamentos) || [];
    desenharCartoes();
    atualizarListaDeCartoesNaDespesa();
    ligarNomesDosFornecedores();
    atualizarListasDeApoio();

    // Sem os cadastros, escolher o cliente numa conta a receber só funcionaria
    // depois de passar pela aba Consultar. De quebra, a Consulta já abre pronta.
    if (resCadastros && resCadastros.ok) {
      cadastros = resCadastros.cadastros || [];
      listaCarregada = true;
      atualizarListaDeClientes();
      desenharLista();
    }

    // A geração rodou junto com a leitura, então o que ela criou não estava na
    // lista que já chegou. Só quando gerou algo vale a pena reler.
    if (resGeracao && resGeracao.gerou > 0) {
      const [novasDespesas, novosRecorrentes] = await Promise.all([
        pedirAoN8n("listar-despesas", {}),
        pedirAoN8n("listar-recorrentes", {}),
      ]);
      if (novasDespesas && novasDespesas.ok) despesas = novasDespesas.despesas || [];
      if (novosRecorrentes && novosRecorrentes.ok) recorrentes = novosRecorrentes.recorrentes || [];
      ligarNomesDosFornecedores();
      atualizarFiltroDeMeses();
      desenharDespesas();
    }

    desenharRecorrentes();
    desenharPainel();
  } catch (err) {
    // Falhar aqui não estraga a tela: ela já está montada com o essencial.
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
  // Uma despesa pode ser material de um serviço, e aí mexe no lucro dividido.
  desenharDivisao();
  desenharPainel();
}

// Depois de mexer numa conta a receber, só ela precisa ser relida.
async function recarregarReceitas() {
  const resposta = await pedirAoN8n("listar-recebimentos", {});
  if (!resposta || !resposta.ok) {
    mostrarListaReceitasStatus("error", (resposta && resposta.mensagem) || "Não consegui recarregar.");
    return;
  }
  recebimentos = resposta.recebimentos || [];
  atualizarListaDeClientes();
  atualizarListaDeServicos();
  atualizarFiltroDeMesesReceita();
  desenharReceitas();
  desenharDivisao();
  desenharPainel();
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
  desenharPainel();
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

// Backup: uma cópia de tudo, uma vez por dia.
//
// O n8n já roda isso sozinho às 22h, mas só se o computador estiver ligado
// naquela hora — e não está sempre. Aqui é o contrário: roda quando você abre
// o sistema, que é justamente quando os dados mudam. Um dos dois pega.
//
// Roda solto, sem travar a tela: se falhar, você entra do mesmo jeito. Um
// backup que atrasa é melhor que um app que não abre.
const CHAVE_ULTIMO_BACKUP = "solucoes-rapidas:ultimo-backup";

function backupDoDia(senha) {
  const hoje = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(CHAVE_ULTIMO_BACKUP) === hoje) return;
  } catch (e) {
    // Sem localStorage (aba anônima), faz o backup mesmo. Repetir não estraga.
  }

  fetchN8n("fazer-backup", { senha })
    .then((r) => r.json())
    .then((d) => {
      if (!d || !d.ok) return;
      try {
        localStorage.setItem(CHAVE_ULTIMO_BACKUP, hoje);
      } catch (e) {
        /* sem onde anotar; no máximo faz de novo amanhã */
      }
    })
    .catch(() => {
      // Silencioso de propósito: backup é tarefa de fundo. Se não deu hoje,
      // não marca a data e a próxima abertura tenta de novo.
    });
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
      backupDoDia(senha);
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
  return [despesaForm, recorrenteForm, receitaForm].some((form) => {
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
    const alvo = !receitaForm.classList.contains("hidden")
      ? mostrarReceitaStatus
      : recorrenteForm.classList.contains("hidden")
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

// ===================== Chamados =====================
//
// Criação e agendamento inicial: escolher o cliente, descrever o pedido,
// marcar (ou não) uma data, e o sistema avisar quando dois chamados batem
// horário. Atendimento/execução, materiais, conclusão e cobrança ficam para
// uma etapa futura — decisão do dono, para não inchar o escopo agora.

function escapeHtml(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// YYYY-MM-DD a partir dos componentes LOCAIS do Date, não de toISOString()
// (que é UTC e viraria o dia errado perto da meia-noite).
function dataLocalISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const chamadosStatusEl = document.getElementById("chamados-status");
const chamadosSemDataBloco = document.getElementById("chamados-sem-data-bloco");
const listaChamadosSemData = document.getElementById("lista-chamados-sem-data");
const listaChamadosComData = document.getElementById("lista-chamados-com-data");
const recarregarChamadosBotao = document.getElementById("recarregar-chamados");
const agendaAtualizarBotao = document.getElementById("agenda-atualizar");
const agendaListaEl = document.getElementById("agenda-lista");
const agendaPainelEl = agendaListaEl.closest(".agenda-painel");
const agendaViewport = document.getElementById("agenda-viewport");
const agendaConteudo = document.getElementById("agenda-conteudo");
const agendaAvisoEl = document.getElementById("agenda-aviso");
const agendaFantasmaEl = document.getElementById("agenda-fantasma");
const agendaMenuEl = document.getElementById("agenda-menu");
const agendaAgoraBotao = document.getElementById("agenda-agora");
const agendaDesfazerBotao = document.getElementById("agenda-desfazer");
const agendaRefazerBotao = document.getElementById("agenda-refazer");
const agendaZoomMenosBotao = document.getElementById("agenda-zoom-menos");
const agendaZoomMaisBotao = document.getElementById("agenda-zoom-mais");

const chamadoEditarBox = document.getElementById("chamado-editar-box");
const chamadoEditarTitulo = document.getElementById("chamado-editar-titulo");
const editChamadoContatoEscolhaBox = document.getElementById("edit-chamado-contato-escolha");
const editChamadoListaContatos = document.getElementById("edit-chamado-lista-contatos");
const editChamadoLocalEscolhaBox = document.getElementById("edit-chamado-local-escolha");
const editChamadoListaLocais = document.getElementById("edit-chamado-lista-locais");
const editChamadoLocalExato = document.getElementById("edit-chamado-local-exato");
const editChamadoDescricao = document.getElementById("edit-chamado-descricao");
const editChamadoObservacoes = document.getElementById("edit-chamado-observacoes");
const editChamadoAnexosAtuaisBloco = document.getElementById("edit-chamado-anexos-atuais-bloco");
const editChamadoAnexosAtuais = document.getElementById("edit-chamado-anexos-atuais");
const editChamadoAnexosFotoInput = document.getElementById("edit-chamado-anexos-foto");
const editChamadoAnexosDocInput = document.getElementById("edit-chamado-anexos-doc");
const editChamadoAnexosFotoBotao = document.getElementById("edit-chamado-anexos-foto-botao");
const editChamadoAnexosDocBotao = document.getElementById("edit-chamado-anexos-doc-botao");
const editChamadoAnexosLista = document.getElementById("edit-chamado-anexos-lista");
const editChamadoSalvarBotao = document.getElementById("edit-chamado-salvar");
const editChamadoCancelarFormBotao = document.getElementById("edit-chamado-cancelar-form");
const editChamadoStatus = document.getElementById("edit-chamado-status");

const chamadosBusca = document.getElementById("chamado-busca-cliente");
const chamadosListaClientes = document.getElementById("chamado-lista-clientes");
const chamadoClienteStatus = document.getElementById("chamado-cliente-status");
const chamadoPassoCliente = document.getElementById("chamado-passo-cliente");
const chamadoClienteEscolhidoBox = document.getElementById("chamado-cliente-escolhido");
const chamadoClienteNomeEl = document.getElementById("chamado-cliente-nome");
const chamadoClienteEnderecoEl = document.getElementById("chamado-cliente-endereco");
const chamadoTrocarClienteBotao = document.getElementById("chamado-trocar-cliente");
const chamadoContatoEscolhaBox = document.getElementById("chamado-contato-escolha");
const chamadoListaContatos = document.getElementById("chamado-lista-contatos");
const chamadoLocalEscolhaBox = document.getElementById("chamado-local-escolha");
const chamadoListaLocais = document.getElementById("chamado-lista-locais");
const chamadoLocalExatoInput = document.getElementById("chamado-local-exato");
const chamadoDescricaoInput = document.getElementById("chamado-descricao");
const chamadoObservacoesInput = document.getElementById("chamado-observacoes");
const chamadoAnexosFotoInput = document.getElementById("chamado-anexos-foto");
const chamadoAnexosDocInput = document.getElementById("chamado-anexos-doc");
const chamadoAnexosFotoBotao = document.getElementById("chamado-anexos-foto-botao");
const chamadoAnexosDocBotao = document.getElementById("chamado-anexos-doc-botao");
const chamadoAnexosLista = document.getElementById("chamado-anexos-lista");
const chamadoForm = document.getElementById("chamado-form");
const chamadoSalvarBotao = document.getElementById("chamado-salvar-botao");
const chamadoStatus = document.getElementById("chamado-status");

let chamadosCadastros = [];
let chamadosCadastrosCarregados = false;
let chamadosPaginaCarregada = false;
let chamadoClienteEscolhido = null;
let chamadoContatoEscolhidoId = "";
let chamadoLocalEscolhidoId = "";
let chamadosAnexosArquivos = [];
let chamadosSemData = [];
let chamadosComData = [];
let chamadoEditandoAtual = null;
let chamadoEditContatoEscolhidoId = "";
let chamadoEditLocalEscolhidoId = "";
let chamadoEditAnexosNovos = [];

function mostrarChamadoStatus(tipo, mensagem) {
  chamadoStatus.textContent = mensagem;
  chamadoStatus.className = `status show ${tipo}`;
}
function mostrarEditChamadoStatus(tipo, mensagem) {
  editChamadoStatus.textContent = mensagem;
  editChamadoStatus.className = `status show ${tipo}`;
}
function mostrarChamadosListaStatus(tipo, mensagem) {
  chamadosStatusEl.textContent = mensagem;
  chamadosStatusEl.className = `doc-hint ${tipo}`;
}

// ----- passo 1: busca de cliente, 100% no navegador -----

function pontuaTexto(termo, alvo) {
  const t = termo.toLowerCase();
  const a = String(alvo || "").toLowerCase();
  if (!t || !a) return 0;
  if (a === t) return 100;
  if (a.startsWith(t)) return 80;
  if (a.includes(t)) return 50;
  return 0;
}

function pontuaCadastroChamado(c, termo) {
  return Math.max(
    pontuaTexto(termo, c.razaoSocial), pontuaTexto(termo, c.nomeFantasia),
    pontuaTexto(termo, c.documento), pontuaTexto(termo, c.contato)
  );
}

async function carregarCadastrosParaChamados() {
  if (chamadosCadastrosCarregados) return;
  const dados = await pedirAoN8n("listar-cadastros", {});
  if (dados && dados.ok) {
    chamadosCadastros = dados.cadastros || [];
    chamadosCadastrosCarregados = true;
  }
}

// Sem termo nenhum, mostra TODOS os cadastros (já vêm ordenados por nome do
// n8n) -- dá pra rolar e escolher com o mouse sem precisar digitar nada.
// Digitando, vira busca normal, limitada aos 15 melhores resultados.
function desenharResultadosBuscaChamado(termo) {
  const encontrados = termo
    ? chamadosCadastros
        .map((c) => ({ c, pontos: pontuaCadastroChamado(c, termo) }))
        .filter((x) => x.pontos > 0)
        .sort((a, b) => b.pontos - a.pontos)
        .slice(0, 15)
    : chamadosCadastros.map((c) => ({ c }));

  chamadosListaClientes.innerHTML = "";

  if (!encontrados.length) {
    chamadosListaClientes.innerHTML = termo
      ? `<p class="doc-hint">Nenhum cliente encontrado.</p>`
      : `<p class="doc-hint">Nenhum cadastro ainda.</p>`;
    return;
  }

  encontrados.forEach(({ c }) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "chamado-resultado-item";
    item.innerHTML = `<strong>${escapeHtml(c.razaoSocial || c.nomeFantasia)}</strong>` +
      `<span>${escapeHtml(c.documento)}${c.contato ? " · " + escapeHtml(c.contato) : ""}</span>`;
    item.addEventListener("click", () => escolherClienteChamado(c.id));
    chamadosListaClientes.appendChild(item);
  });
}

chamadosBusca.addEventListener("focus", async () => {
  await carregarCadastrosParaChamados();
  desenharResultadosBuscaChamado(chamadosBusca.value.trim());
});
chamadosBusca.addEventListener("input", () => desenharResultadosBuscaChamado(chamadosBusca.value.trim()));

async function escolherClienteChamado(entidadeId) {
  chamadoClienteStatus.textContent = "Carregando dados do cliente...";
  chamadosBusca.value = "";
  chamadosListaClientes.innerHTML = "";

  const cad = chamadosCadastros.find((c) => c.id === entidadeId);

  const [locaisResp, contatosResp] = await Promise.all([
    pedirAoN8n("listar-locais", { entidadeId }),
    pedirAoN8n("listar-contatos", { entidadeId }),
  ]);

  const listaLocais = (locaisResp && locaisResp.locais) || [];
  const listaContatos = (contatosResp && contatosResp.contatos) || [];

  chamadoClienteEscolhido = {
    id: entidadeId,
    nome: cad ? (cad.razaoSocial || cad.nomeFantasia) : "",
    endereco: (listaLocais[0] && listaLocais[0].endereco) || "",
  };

  chamadoClienteNomeEl.textContent = chamadoClienteEscolhido.nome;
  chamadoClienteEnderecoEl.textContent = chamadoClienteEscolhido.endereco || "Sem endereço cadastrado.";

  chamadoListaLocais.innerHTML = "";
  if (listaLocais.length > 1) {
    chamadoLocalEscolhaBox.classList.remove("hidden");
    listaLocais.forEach((loc, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chamado-contato-item" + (i === 0 ? " active" : "");
      btn.textContent = loc.nome || loc.endereco || "Sem nome";
      btn.addEventListener("click", () => {
        chamadoLocalEscolhidoId = loc.id;
        chamadoClienteEscolhido.endereco = loc.endereco || "";
        chamadoClienteEnderecoEl.textContent = chamadoClienteEscolhido.endereco || "Sem endereço cadastrado.";
        chamadoListaLocais.querySelectorAll(".chamado-contato-item").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
      chamadoListaLocais.appendChild(btn);
    });
    chamadoLocalEscolhidoId = listaLocais[0].id;
  } else {
    chamadoLocalEscolhaBox.classList.add("hidden");
    chamadoLocalEscolhidoId = listaLocais[0] ? listaLocais[0].id : "";
  }

  chamadoListaContatos.innerHTML = "";
  if (listaContatos.length > 1) {
    chamadoContatoEscolhaBox.classList.remove("hidden");
    listaContatos.forEach((ct, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chamado-contato-item" + (i === 0 ? " active" : "");
      btn.textContent = ct.nome || ct.whatsapps[0] || ct.emails[0] || "Sem nome";
      btn.addEventListener("click", () => {
        chamadoContatoEscolhidoId = ct.id;
        chamadoListaContatos.querySelectorAll(".chamado-contato-item").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
      chamadoListaContatos.appendChild(btn);
    });
    chamadoContatoEscolhidoId = listaContatos[0].id;
  } else {
    chamadoContatoEscolhaBox.classList.add("hidden");
    chamadoContatoEscolhidoId = listaContatos[0] ? listaContatos[0].id : "";
  }

  chamadoClienteStatus.textContent = "";
  chamadoPassoCliente.classList.add("hidden");
  chamadoClienteEscolhidoBox.classList.remove("hidden");

  ajustarAlturasAuto(chamadoForm.closest(".page"));
}

chamadoTrocarClienteBotao.addEventListener("click", () => {
  limparFormularioChamado();
  chamadosBusca.focus();
});

// ----- anexos -----

function arquivoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] || "");
    leitor.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

function desenharAnexosChamado() {
  chamadoAnexosLista.innerHTML = "";
  chamadosAnexosArquivos.forEach((a, i) => {
    const item = document.createElement("div");
    item.className = "chamado-anexo-item";
    const ehImagem = a.contentType.startsWith("image/");
    item.innerHTML = (ehImagem ? `<img src="${a.url}" alt="" />` : `<span class="chamado-anexo-icone">📄</span>`) +
      `<span class="chamado-anexo-nome">${escapeHtml(a.filename)}</span>` +
      `<button type="button" class="chamado-anexo-remover" aria-label="Remover">×</button>`;
    item.querySelector(".chamado-anexo-remover").addEventListener("click", () => {
      chamadosAnexosArquivos.splice(i, 1);
      desenharAnexosChamado();
    });
    chamadoAnexosLista.appendChild(item);
  });
}

// Mesma ideia, pro formulário de edição — anexos que já estavam salvos só
// são mostrados (nome do arquivo), sem opção de excluir por enquanto; o que
// esta tela adiciona são anexos novos, que se juntam aos existentes.
function desenharAnexosNovosEdicao() {
  editChamadoAnexosLista.innerHTML = "";
  chamadoEditAnexosNovos.forEach((a, i) => {
    const item = document.createElement("div");
    item.className = "chamado-anexo-item";
    const ehImagem = a.contentType.startsWith("image/");
    item.innerHTML = (ehImagem ? `<img src="${a.url}" alt="" />` : `<span class="chamado-anexo-icone">📄</span>`) +
      `<span class="chamado-anexo-nome">${escapeHtml(a.filename)}</span>` +
      `<button type="button" class="chamado-anexo-remover" aria-label="Remover">×</button>`;
    item.querySelector(".chamado-anexo-remover").addEventListener("click", () => {
      chamadoEditAnexosNovos.splice(i, 1);
      desenharAnexosNovosEdicao();
    });
    editChamadoAnexosLista.appendChild(item);
  });
}

// Um input pra foto (accept="image/*") e outro pra PDF (accept="application/
// pdf"), em vez de um só misturando os dois tipos: no celular, um "accept"
// puro de imagem é o que faz o navegador abrir a galeria de fotos direto,
// em vez do gerenciador de arquivos genérico.
async function processaArquivosSelecionados(inputEl, listaArquivos, statusFn, redesenhaFn) {
  const arquivos = Array.from(inputEl.files || []);
  for (const arquivo of arquivos) {
    if (arquivo.size > 5 * 1024 * 1024) {
      statusFn("error", `"${arquivo.name}" passa de 5MB e não foi adicionado.`);
      continue;
    }
    try {
      const base64 = await arquivoParaBase64(arquivo);
      listaArquivos.push({
        filename: arquivo.name, contentType: arquivo.type || "application/octet-stream",
        base64, url: URL.createObjectURL(arquivo),
      });
    } catch (err) {
      statusFn("error", `Não consegui ler "${arquivo.name}".`);
    }
  }
  inputEl.value = "";
  redesenhaFn();
}

// O botão de anexo é um <label> disfarçado (o input de arquivo de verdade
// fica escondido) — <label> não entra na navegação por Tab nem responde a
// Enter/Espaço sozinho, então isso completa manualmente.
function ligarBotaoAnexoTeclado(labelEl) {
  labelEl.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      labelEl.click();
    }
  });
}
[chamadoAnexosFotoBotao, chamadoAnexosDocBotao, editChamadoAnexosFotoBotao, editChamadoAnexosDocBotao].forEach(ligarBotaoAnexoTeclado);

chamadoAnexosFotoInput.addEventListener("change", () =>
  processaArquivosSelecionados(chamadoAnexosFotoInput, chamadosAnexosArquivos, mostrarChamadoStatus, desenharAnexosChamado));
chamadoAnexosDocInput.addEventListener("change", () =>
  processaArquivosSelecionados(chamadoAnexosDocInput, chamadosAnexosArquivos, mostrarChamadoStatus, desenharAnexosChamado));

editChamadoAnexosFotoInput.addEventListener("change", () =>
  processaArquivosSelecionados(editChamadoAnexosFotoInput, chamadoEditAnexosNovos, mostrarEditChamadoStatus, desenharAnexosNovosEdicao));
editChamadoAnexosDocInput.addEventListener("change", () =>
  processaArquivosSelecionados(editChamadoAnexosDocInput, chamadoEditAnexosNovos, mostrarEditChamadoStatus, desenharAnexosNovosEdicao));

// ----- conflito de horário -----

function formatarHoraIso(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatarDataChamado(dataStr) {
  return new Date(`${dataStr}T00:00:00`).toLocaleDateString("pt-BR");
}
function nomeDiaSemana(dataStr) {
  const nome = new Date(`${dataStr}T00:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}
// ----- criar chamado -----

function limparFormularioChamado() {
  chamadoClienteEscolhido = null;
  chamadoContatoEscolhidoId = "";
  chamadoLocalEscolhidoId = "";
  chamadosAnexosArquivos = [];
  chamadoClienteEscolhidoBox.classList.add("hidden");
  chamadoPassoCliente.classList.remove("hidden");
  chamadosBusca.value = "";
  chamadoLocalExatoInput.value = "";
  chamadoDescricaoInput.value = "";
  chamadoObservacoesInput.value = "";
  chamadoAnexosLista.innerHTML = "";
  mostrarChamadoStatus("neutral", "");
}

async function criarChamadoDeVerdade() {
  chamadoSalvarBotao.disabled = true;
  mostrarChamadoStatus("neutral", "Salvando...");

  const corpo = {
    clienteId: chamadoClienteEscolhido.id,
    contatoId: chamadoContatoEscolhidoId,
    localId: chamadoLocalEscolhidoId,
    localExato: chamadoLocalExatoInput.value.trim(),
    descricaoSolicitacao: chamadoDescricaoInput.value.trim(),
    observacoesServico: chamadoObservacoesInput.value.trim(),
    // Chamado nasce sem agendamento -- ver CONTEXTO.md "Agendamento tirado
    // de Criar chamado" (14/09/2026). Data/horário continuam existindo no
    // registro (usados por Consultar chamados / editar), só não são mais
    // preenchidos na criação.
    data: "",
    reservadoInicio: "",
    reservadoFim: "",
    horarioCombinadoCliente: "",
    // Viaja como texto JSON num campo só, mesmo padrão de "locais"/"contatos"
    // no Cadastro: URLSearchParams não sabe serializar um array de verdade.
    anexos: JSON.stringify(chamadosAnexosArquivos.map((a) => ({ filename: a.filename, contentType: a.contentType, base64: a.base64 }))),
  };

  let resposta;
  try {
    resposta = await pedirAoN8n("criar-chamado", corpo);
  } catch (err) {
    chamadoSalvarBotao.disabled = false;
    mostrarChamadoStatus("error", "Não consegui falar com o servidor.");
    return;
  }

  chamadoSalvarBotao.disabled = false;
  if (!resposta || !resposta.ok) {
    mostrarChamadoStatus("error", (resposta && resposta.mensagem) || "Não consegui criar o chamado.");
    return;
  }

  mostrarToast(resposta.mensagem);
  limparFormularioChamado();
  await carregarChamados();
}

chamadoForm.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (!chamadoClienteEscolhido) {
    mostrarChamadoStatus("error", "Escolha um cliente primeiro.");
    return;
  }

  await criarChamadoDeVerdade();
});

// ----- lista da Agenda -----

function statusClasseChamado(status) {
  if (status === "Aguardando confirmação de data") return "chamado-status-aguardando";
  if (status === "Agendado") return "chamado-status-agendado";
  if (status === "Em andamento") return "chamado-status-andamento";
  if (status === "Cancelado") return "chamado-status-cancelado";
  return "";
}

function montarCardChamado(c, comData) {
  const card = document.createElement("div");
  card.className = "chamado-card";

  let horarioTexto = "";
  if (comData && c.reservadoInicio) {
    const dataFmt = new Date(c.reservadoInicio).toLocaleDateString("pt-BR");
    // Dia marcado na Agenda mas sem horário exato ainda: o registro fica com
    // Reservado_Inicio e SEM Reservado_Fim (ver CONTEXTO.md, Agenda
    // operacional). Sem esse caso, a linha saía como "Invalid Date".
    const horas = c.reservadoFim
      ? `${formatarHoraIso(c.reservadoInicio)} às ${formatarHoraIso(c.reservadoFim)}`
      : "horário ainda não definido";
    horarioTexto = `<p class="chamado-card-horario">${dataFmt} · ${horas}` +
      `${c.horarioCombinadoCliente ? ` (combinado ${escapeHtml(c.horarioCombinadoCliente)})` : ""}</p>`;
  }

  const criadoTexto = c.criadoEm
    ? `<p class="doc-hint chamado-card-criado">Criado em ${new Date(c.criadoEm).toLocaleDateString("pt-BR")} às ${formatarHoraIso(c.criadoEm)}</p>`
    : "";

  // Cancelado continua aparecendo na lista (não some mais) -- só não faz
  // sentido oferecer "Cancelar chamado" de novo pra quem já está cancelado.
  const jaCancelado = c.status === "Cancelado";

  card.innerHTML = `
    <div class="chamado-card-topo">
      <span class="chamado-numero">#${c.numero}</span>
      <span class="chamado-status-badge ${statusClasseChamado(c.status)}">${escapeHtml(c.status)}</span>
    </div>
    <strong>${escapeHtml(c.clienteNome)}</strong>
    <p class="doc-hint">${escapeHtml(c.enderecoCopia)}${c.localExato ? " · " + escapeHtml(c.localExato) : ""}</p>
    <p>${escapeHtml(c.descricaoSolicitacao)}</p>
    ${c.contatoNome ? `<p class="doc-hint">Contato: ${escapeHtml(c.contatoNome)}${c.contatoWhatsApp ? " · " + escapeHtml(c.contatoWhatsApp) : ""}</p>` : ""}
    ${horarioTexto}
    ${criadoTexto}
    <div class="chamado-card-acoes">
      <button type="button" class="botao-secundario botao-editar-chamado">Editar</button>
      ${jaCancelado ? "" : `<button type="button" class="botao-secundario botao-cancelar-chamado">Cancelar chamado</button>`}
    </div>
  `;

  card.querySelector(".botao-editar-chamado").addEventListener("click", () => abrirEdicaoChamado(c));

  const cancelarBotao = card.querySelector(".botao-cancelar-chamado");
  if (cancelarBotao) {
    cancelarBotao.addEventListener("click", () => {
      // Pergunta de verdade (confirm nativo) em vez do botão virar vermelho
      // esperando um segundo toque -- esse formato ficava parecendo travado
      // quando a pessoa não completava o segundo toque na hora (voltava
      // depois e via só um botão vermelho sem explicação nenhuma).
      if (!confirm(`Cancelar o Chamado #${c.numero} (${c.clienteNome})?`)) return;
      cancelarBotao.disabled = true;
      cancelarBotao.textContent = "Cancelando...";
      cancelarChamado(c.id, cancelarBotao);
    });
  }

  return card;
}

async function cancelarChamado(id, botao) {
  let resposta;
  try {
    resposta = await pedirAoN8n("reagendar-chamado", { chamadoId: id, cancelar: "true" });
  } catch (err) {
    resposta = null;
  }
  if (resposta && resposta.ok) {
    // Continua na tela, só muda de status (o dono pediu explicitamente: um
    // chamado cancelado não some, fica marcado "Cancelado" em vermelho --
    // ver CONTEXTO.md 16/09/2026). Atualiza na hora, sem esperar uma
    // segunda rodada de rede, e ainda assim recarrega de verdade em
    // seguida, pra pegar qualquer outra mudança.
    const alvo = chamadosSemData.find((c) => c.id === id) || chamadosComData.find((c) => c.id === id);
    if (alvo) alvo.status = "Cancelado";
    desenharListaChamados();
    if (chamadosPaginaCarregada) agendaRedesenhar();
    await carregarChamados();
  } else {
    // Se deu errado, o botão precisa voltar a funcionar -- senão fica
    // preso em "Cancelando..." pra sempre.
    if (botao) {
      botao.disabled = false;
      botao.textContent = "Cancelar chamado";
    }
    mostrarChamadosListaStatus("error", (resposta && resposta.mensagem) || "Não consegui cancelar.");
  }
}

function desenharListaChamados() {
  chamadosSemDataBloco.classList.toggle("hidden", chamadosSemData.length === 0);
  listaChamadosSemData.innerHTML = "";
  chamadosSemData.forEach((c) => listaChamadosSemData.appendChild(montarCardChamado(c, false)));

  listaChamadosComData.innerHTML = "";
  if (!chamadosComData.length) {
    listaChamadosComData.innerHTML = `<p class="doc-hint">Nenhum chamado agendado.</p>`;
  } else {
    chamadosComData.forEach((c) => listaChamadosComData.appendChild(montarCardChamado(c, true)));
  }
}

// Rótulo de grupo pra Agenda -- identifica o quão perto de hoje o chamado
// foi criado, do jeito mais grosso que ainda faz sentido (dia/semana/mês/
// ano). A lista está em ordem crescente (mais antigo primeiro), então o
// rótulo muda conforme desenharAgenda percorre -- não é um calendário de
// verdade, só o suficiente pra situar sem virar outra tela.
function rotuloAgendaGrupo(iso, agora) {
  const d = new Date(iso);
  const inicioDia = (data) => new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const diffDias = Math.round((inicioDia(agora) - inicioDia(d)) / 86400000);
  if (diffDias <= 0) return "Hoje";
  if (diffDias === 1) return "Ontem";
  if (diffDias < 7) return "Esta semana";
  if (d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth()) return "Este mês";
  if (d.getFullYear() === agora.getFullYear()) return "Este ano";
  return String(d.getFullYear());
}

// ===================== Agenda: linha do tempo =====================
//
// Uma linha do tempo vertical só, contínua, que MUDA DE ESCALA (ano até
// minuto) em vez de trocar de tela. Nada é desenhado "pro tempo todo": a
// tela desenha uma JANELA de tempo em volta de onde a pessoa está olhando,
// e essa janela anda junto com a rolagem (ver agendaConferirBordas). Por
// isso a quantidade de coisa na tela fica sempre parecida, em qualquer
// escala e em qualquer ano.
//
// Tudo é contado no relógio de Brasília (-03:00), o mesmo fuso que o n8n
// grava no Airtable -- não no fuso do aparelho. "Parede" abaixo quer dizer
// justamente isso: o instante deslocado pro fuso fixo, pra poder usar
// getUTCHours()/etc. sem depender de onde o aparelho acha que está.

const AGENDA_FUSO_MIN = -180;
const MS_MIN = 60000, MS_HORA = 3600000, MS_DIA = 86400000;

const AGENDA_SNAP_MIN = 15;            // o encaixe pedido: 15 em 15 minutos
const AGENDA_DURACAO_PADRAO_MIN = 60;  // chamado sem duração nasce com 1h
const AGENDA_DIA_INICIO_H = 8;         // só pra SUGERIR horário livre
const AGENDA_DIA_FIM_H = 18;
const AGENDA_MARGEM_AUTO_PX = 70;      // perto da borda = rola sozinho
const AGENDA_AUTO_ESPERA_MAX_MS = 70;  // longe da borda: devagar
const AGENDA_AUTO_ESPERA_MIN_MS = 16;  // colado na borda: rápido
const AGENDA_ESPERA_TROCA_MS = 900;    // segurar em cima de outro bloco
const AGENDA_ESPERA_ZOOM_MS = 450;     // segurar em cima de um nível de zoom
const AGENDA_ARRASTE_MINIMO_PX = 4;    // menos que isso ainda é um clique
const AGENDA_TELAS_JANELA = 3;         // telas de tempo desenhadas por lado
const AGENDA_HISTORICO_MAX = 60;

// px por minuto de cada escala. Pensado como "o que cabe numa tela de ~640px":
// um ano inteiro, um mês, uma semana, um dia -- e daí pra baixo o horário vai
// abrindo até dar pra pegar de 15 em 15 minutos com folga.
// `precisa` diz se naquela escala dá pra escolher HORÁRIO; nas escalas largas
// só dá pra escolher o DIA, e aí o chamado fica marcado sem horário (o pedido
// foi explícito: não inventar um horário que a pessoa não escolheu).
const AGENDA_NIVEIS = [
  { id: "ano", rotulo: "Ano", pxPorMin: 640 / (365 * 1440), precisa: false },
  { id: "mes", rotulo: "Mês", pxPorMin: 640 / (30 * 1440), precisa: false },
  { id: "semana", rotulo: "Semana", pxPorMin: 640 / (7 * 1440), precisa: false },
  { id: "dia", rotulo: "Dia", pxPorMin: 640 / 1440, precisa: true },
  { id: "hora", rotulo: "Hora", pxPorMin: 2, precisa: true },
  { id: "minuto", rotulo: "Minuto", pxPorMin: 4, precisa: true },
];

// ----- relógio de Brasília -----

function agParede(ms) { return ms + AGENDA_FUSO_MIN * MS_MIN; }
function agAgora() { return agParede(Date.now()); }
function agDeIso(iso) { return agParede(new Date(iso).getTime()); }
function agDia(parede) { return Math.floor(parede / MS_DIA) * MS_DIA; }
function agDataStr(parede) { return new Date(parede).toISOString().slice(0, 10); }
function agHoraStr(parede) {
  const d = new Date(parede);
  return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
}
// Formata sempre em UTC de propósito: "parede" já é o horário de Brasília
// deslocado, então deixar o navegador aplicar o fuso dele de novo erraria.
function agFmt(parede, opcoes) {
  return new Date(parede).toLocaleDateString("pt-BR", Object.assign({ timeZone: "UTC" }, opcoes));
}
function agendaDuracaoTexto(ms) {
  const min = Math.max(0, Math.round(ms / MS_MIN));
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// ----- estado da tela -----

let agendaNivelId = "hora";
let agendaJanelaInicio = 0;   // parede ms
let agendaJanelaFim = 0;      // parede ms
let agendaAjustandoJanela = false;
let agendaPosicionada = false;
let agArraste = null;
let agendaHistorico = [];
let agendaHistoricoPos = 0;

// Duas camadas dentro do container que rola: a grade (linhas de tempo, só
// muda quando a janela/escala mudam) e os itens (blocos, prévia do arrasto,
// linha do "agora" -- redesenhados a cada movimento do mouse). Separar as
// duas evita refazer centenas de linhas a cada pixel arrastado.
const agendaGradeEl = document.createElement("div");
const agendaItensEl = document.createElement("div");
agendaConteudo.appendChild(agendaGradeEl);
agendaConteudo.appendChild(agendaItensEl);

function agendaNivel() {
  return AGENDA_NIVEIS.find((n) => n.id === agendaNivelId) || AGENDA_NIVEIS[4];
}
function agendaPxPorMin() { return agendaNivel().pxPorMin; }
function agendaPxDoTempo(parede) { return ((parede - agendaJanelaInicio) / MS_MIN) * agendaPxPorMin(); }
function agendaTempoDoPx(px) { return agendaJanelaInicio + (px / agendaPxPorMin()) * MS_MIN; }
function agendaAlturaTela() { return Math.max(320, agendaViewport.clientHeight || 520); }

// Encaixe: nas escalas com horário, de 15 em 15 minutos; nas escalas largas,
// no dia (o epoch começa numa borda de 15min, então o arredondamento é exato).
function agendaEncaixar(parede) {
  if (!agendaNivel().precisa) return agDia(parede);
  const passo = AGENDA_SNAP_MIN * MS_MIN;
  return Math.round(parede / passo) * passo;
}

// ----- janela de tempo desenhada -----

function agendaMontarJanela(centroParede) {
  const minutosPorTela = agendaAlturaTela() / agendaPxPorMin();
  const folga = minutosPorTela * AGENDA_TELAS_JANELA * MS_MIN;
  agendaJanelaInicio = agDia(centroParede - folga);
  agendaJanelaFim = agDia(centroParede + folga) + MS_DIA;
}

// Leva a tela pra um instante, deixando ele numa altura escolhida da janela
// (por padrão no meio). É o que faz o zoom "não perder o lugar".
function agendaIrPara(parede, ancoraPx) {
  const ancora = ancoraPx === undefined ? agendaAlturaTela() / 2 : ancoraPx;
  agendaMontarJanela(parede);
  agendaDesenharGrade();
  agendaDesenharItens();
  agendaAjustandoJanela = true;
  agendaViewport.scrollTop = agendaPxDoTempo(parede) - ancora;
  agendaAjustandoJanela = false;
  agendaPosicionada = true;
}

// Chegou perto da borda do que está desenhado: refaz a janela em volta de
// onde a pessoa está e recoloca a rolagem no MESMO instante de antes, pra
// não dar solavanco na tela.
function agendaConferirBordas() {
  if (agendaAjustandoJanela) return;
  const v = agendaViewport;
  const margem = v.clientHeight;
  const sobraBaixo = v.scrollHeight - v.scrollTop - v.clientHeight;
  if (v.scrollTop > margem && sobraBaixo > margem) return;

  const paredeDoTopo = agendaTempoDoPx(v.scrollTop);
  agendaMontarJanela(agendaTempoDoPx(v.scrollTop + v.clientHeight / 2));
  agendaDesenharGrade();
  agendaDesenharItens();
  agendaAjustandoJanela = true;
  v.scrollTop = agendaPxDoTempo(paredeDoTopo);
  agendaAjustandoJanela = false;
}

// ----- linhas da grade -----

function agendaMarcas() {
  const ini = agendaJanelaInicio, fim = agendaJanelaFim;
  const marcas = [];
  const add = (t, forte, texto) => { if (t >= ini && t <= fim) marcas.push({ t, forte, texto }); };

  if (agendaNivelId === "ano") {
    const d0 = new Date(ini);
    let t = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1);
    while (t <= fim) {
      const d = new Date(t);
      const janeiro = d.getUTCMonth() === 0;
      add(t, janeiro, janeiro ? String(d.getUTCFullYear()) : agFmt(t, { month: "short" }));
      t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    }
    return marcas;
  }

  if (agendaNivelId === "mes") {
    for (let t = agDia(ini); t <= fim; t += MS_DIA) {
      const d = new Date(t);
      const primeiro = d.getUTCDate() === 1;
      add(t, primeiro || d.getUTCDay() === 1,
        primeiro ? agFmt(t, { day: "2-digit", month: "short" }) : agFmt(t, { day: "2-digit", month: "2-digit" }));
    }
    return marcas;
  }

  if (agendaNivelId === "semana") {
    for (let t = agDia(ini); t <= fim; t += MS_HORA * 6) {
      const meiaNoite = new Date(t).getUTCHours() === 0;
      add(t, meiaNoite, meiaNoite ? agFmt(t, { weekday: "short", day: "2-digit", month: "2-digit" }) : "");
    }
    return marcas;
  }

  if (agendaNivelId === "dia") {
    for (let t = agDia(ini); t <= fim; t += MS_HORA) {
      const h = new Date(t).getUTCHours();
      add(t, h === 0,
        h === 0 ? agFmt(t, { weekday: "long", day: "2-digit", month: "2-digit" })
          : (h % 2 === 0 ? `${String(h).padStart(2, "0")}h` : ""));
    }
    return marcas;
  }

  if (agendaNivelId === "hora") {
    for (let t = agDia(ini); t <= fim; t += MS_MIN * 15) {
      const d = new Date(t), h = d.getUTCHours(), m = d.getUTCMinutes();
      if (!h && !m) add(t, true, agFmt(t, { weekday: "short", day: "2-digit", month: "2-digit" }));
      else add(t, false, m === 0 ? agHoraStr(t) : "");
    }
    return marcas;
  }

  for (let t = agDia(ini); t <= fim; t += MS_MIN * 15) {
    add(t, new Date(t).getUTCMinutes() === 0, agHoraStr(t));
  }
  return marcas;
}

function agendaDesenharGrade() {
  const alturaTotal = ((agendaJanelaFim - agendaJanelaInicio) / MS_MIN) * agendaPxPorMin();
  agendaConteudo.style.height = `${Math.round(alturaTotal)}px`;

  let html = "";
  // Sábado/domingo ganham um fundo levemente diferente, só pra dar ritmo. Na
  // escala de ano seriam centenas de faixas de 2px -- não compensa.
  if (agendaNivelId !== "ano") {
    const alturaDia = (MS_DIA / MS_MIN) * agendaPxPorMin();
    for (let t = agDia(agendaJanelaInicio); t < agendaJanelaFim; t += MS_DIA) {
      const diaSemana = new Date(t).getUTCDay();
      if (diaSemana !== 0 && diaSemana !== 6) continue;
      html += `<div class="agenda-fimdesemana" style="top:${agendaPxDoTempo(t).toFixed(1)}px;height:${alturaDia.toFixed(1)}px"></div>`;
    }
  }

  agendaMarcas().forEach((m) => {
    html += `<div class="agenda-marca${m.forte ? " agenda-marca-forte" : ""}" style="top:${agendaPxDoTempo(m.t).toFixed(1)}px">` +
      (m.texto ? `<span class="agenda-marca-rotulo">${escapeHtml(m.texto)}</span>` : "") +
      `</div>`;
  });

  agendaGradeEl.innerHTML = html;
}

// ----- blocos -----

function agendaClasseStatus(status) {
  if (status === "Agendado") return "confirmado";
  if (status === "Em andamento") return "andamento";
  return "aguardando";
}

// Quanto mais espaço o bloco tem, mais ele conta. Em escala larga não adianta
// espremer horário e número dentro de um retângulo de 8px de altura.
function agendaConteudoBloco(c, ini, fim, alturaPx) {
  const nome = escapeHtml(c.clienteNome || "Sem nome");
  if (agendaNivelId === "ano") return `<div class="agenda-bloco-titulo">${nome}</div>`;
  if (agendaNivelId === "mes") {
    return `<div class="agenda-bloco-titulo">${agFmt(ini, { day: "2-digit", month: "2-digit" })} · ${nome}</div>`;
  }
  if (agendaNivelId === "semana") {
    return `<div class="agenda-bloco-titulo">${agHoraStr(ini)} · ${nome}</div>`;
  }

  // Os cortes abaixo são a altura que cada linha a mais precisa de verdade
  // (linha de ~15px + os 4px de recheio do bloco) -- antes a segunda linha
  // entrava e ficava cortada pela metade num bloco de 1h na escala "Dia".
  let html = `<div class="agenda-bloco-titulo">${nome}</div>`;
  if (alturaPx >= 34) {
    html += `<div class="agenda-bloco-linha">${agHoraStr(ini)} → ${agHoraStr(fim)} · ${agendaDuracaoTexto(fim - ini)}</div>`;
  }
  if (alturaPx >= 49) {
    html += `<div class="agenda-bloco-linha">Chamado #${escapeHtml(String(c.numero))}` +
      `${c.localExato ? ` · ${escapeHtml(c.localExato)}` : ""}</div>`;
  }
  if (alturaPx >= 64 && c.descricaoSolicitacao) {
    html += `<div class="agenda-bloco-linha">${escapeHtml(c.descricaoSolicitacao)}</div>`;
  }
  return html;
}

function agendaDesenharItens() {
  const arrastando = agArraste && agArraste.ativo ? agArraste : null;
  const idArrastado = arrastando && arrastando.tipo !== "novo" ? arrastando.chamado.id : "";
  let html = "";

  chamadosComData.forEach((c) => {
    // Cancelado não ocupa mais lugar na agenda -- continua visível em
    // "Consultar chamados" (ver CONTEXTO.md 16/09/2026), mas aqui é como se
    // nunca tivesse sido marcado.
    if (!c.reservadoInicio || c.status === "Cancelado") return;
    const ini = agDeIso(c.reservadoInicio);

    // Dia marcado, horário ainda não definido: fica preso na linha do dia,
    // com cara de pendência. Não ocupa faixa de horário nenhuma.
    if (!c.reservadoFim) {
      if (ini + MS_DIA < agendaJanelaInicio || ini > agendaJanelaFim) return;
      html += `<div class="agenda-bloco-semhora" data-id="${escapeHtml(c.id)}" data-semhora="1"` +
        `${c.id === idArrastado ? ' style="opacity:.3;' : ' style="'}top:${(agendaPxDoTempo(ini) + 2).toFixed(1)}px">` +
        `${escapeHtml(c.clienteNome || "Sem nome")} · horário a definir</div>`;
      return;
    }

    const fim = agDeIso(c.reservadoFim);
    if (fim < agendaJanelaInicio || ini > agendaJanelaFim) return;
    const topo = agendaPxDoTempo(ini);
    const altura = Math.max(14, agendaPxDoTempo(fim) - topo);
    const classes = ["agenda-bloco", agendaClasseStatus(c.status)];
    if (c.id === idArrastado) classes.push("arrastando");
    if (arrastando && arrastando.trocaPronta && arrastando.trocaAlvo === c.id) classes.push("alvo-troca");

    const podeAlca = agendaNivel().precisa && altura >= 26 && c.id !== idArrastado;
    html += `<div class="${classes.join(" ")}" data-id="${escapeHtml(c.id)}" ` +
      `style="top:${topo.toFixed(1)}px;height:${altura.toFixed(1)}px">` +
      agendaConteudoBloco(c, ini, fim, altura) +
      (podeAlca ? `<div class="agenda-bloco-alca topo" data-alca="topo"></div><div class="agenda-bloco-alca base" data-alca="base"></div>` : "") +
      `</div>`;
  });

  // Prévia: onde o chamado cai se soltar agora, já dizendo se bate em alguém.
  if (arrastando && arrastando.alvo) {
    const a = arrastando.alvo;
    const topo = agendaPxDoTempo(a.ini);
    const conflito = arrastando.conflitos.length > 0 && !arrastando.trocaPronta && !arrastando.sobreFila;
    const texto = a.semHorario
      ? `${agFmt(a.ini, { day: "2-digit", month: "2-digit", year: "numeric" })} · horário a definir`
      : `${agHoraStr(a.ini)} → ${agHoraStr(a.fim)} · ${agendaDuracaoTexto(a.fim - a.ini)}`;
    const altura = a.semHorario ? 22 : Math.max(18, agendaPxDoTempo(a.fim) - topo);
    html += `<div class="agenda-previa${conflito ? " conflito" : ""}" ` +
      `style="top:${topo.toFixed(1)}px;height:${altura.toFixed(1)}px">${escapeHtml(texto)}</div>`;
  }

  const agora = agAgora();
  if (agora >= agendaJanelaInicio && agora <= agendaJanelaFim) {
    html += `<div class="agenda-agora" style="top:${agendaPxDoTempo(agora).toFixed(1)}px">` +
      `<span>AGORA · ${agFmt(agora, { day: "2-digit", month: "2-digit" })} · ${agHoraStr(agora)}</span></div>`;
  }

  agendaItensEl.innerHTML = html;
}

// ----- conflito e sugestão -----

// Um dia sem horário exato não entra: ele ainda não reservou faixa nenhuma.
// Aguardando confirmação entra sim -- horário reservado é horário ocupado.
function agendaOcupados(excluir) {
  const fora = excluir || [];
  return chamadosComData
    .filter((c) => c.reservadoInicio && c.reservadoFim && c.status !== "Cancelado" && !fora.includes(c.id))
    .map((c) => ({ c, ini: agDeIso(c.reservadoInicio), fim: agDeIso(c.reservadoFim) }));
}

// Encostado não é conflito: um termina 10:00 e o outro começa 10:00 pode.
function agendaConflitos(ini, fim, excluir) {
  return agendaOcupados(excluir).filter((o) => ini < o.fim && o.ini < fim);
}

// Primeira folga com a duração pedida, olhando a partir de um instante e
// andando dia a dia. Só sugere dentro do horário de trabalho -- é sugestão,
// marcar fora continua permitido.
function agendaProximoLivre(desde, duracaoMs, excluir) {
  const ocupados = agendaOcupados(excluir).sort((a, b) => a.ini - b.ini);
  const passo = AGENDA_SNAP_MIN * MS_MIN;
  for (let d = 0; d < 60; d++) {
    const dia = agDia(desde) + d * MS_DIA;
    const abre = dia + AGENDA_DIA_INICIO_H * MS_HORA;
    const fecha = dia + AGENDA_DIA_FIM_H * MS_HORA;
    let cursor = d === 0 ? Math.max(abre, Math.ceil(desde / passo) * passo) : abre;
    const doDia = ocupados.filter((o) => o.fim > dia && o.ini < dia + MS_DIA);
    for (const o of doDia) {
      if (o.ini - cursor >= duracaoMs) return { ini: cursor, fim: cursor + duracaoMs };
      if (o.fim > cursor) cursor = Math.ceil(o.fim / passo) * passo;
    }
    if (fecha - cursor >= duracaoMs) return { ini: cursor, fim: cursor + duracaoMs };
  }
  return null;
}

// ----- faixa de recado -----

function agendaEsconderAviso() {
  agendaAvisoEl.className = "agenda-aviso hidden";
  agendaAvisoEl.innerHTML = "";
}

function agendaMostrarAviso(tipo, texto, acoes) {
  agendaAvisoEl.className = `agenda-aviso ${tipo || ""}`;
  const span = document.createElement("span");
  span.textContent = texto;
  agendaAvisoEl.innerHTML = "";
  agendaAvisoEl.appendChild(span);
  (acoes || []).forEach((acao) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "botao-secundario";
    botao.textContent = acao.rotulo;
    botao.addEventListener("click", () => { agendaEsconderAviso(); acao.aoClicar(); });
    agendaAvisoEl.appendChild(botao);
  });
}

// ----- salvar de verdade (com volta atrás se o servidor recusar) -----

function agendaEstado(c) {
  return {
    reservadoInicio: c.reservadoInicio || "",
    reservadoFim: c.reservadoFim || "",
    status: c.status || "",
  };
}

function agendaEstadoDeIntervalo(ini, fim, status) {
  if (!ini) return { reservadoInicio: "", reservadoFim: "", status: "Aguardando confirmação de data" };
  const iso = (parede) => new Date(parede - AGENDA_FUSO_MIN * MS_MIN).toISOString();
  return {
    reservadoInicio: iso(ini),
    reservadoFim: fim ? iso(fim) : "",
    status: fim ? (status || "Aguardando confirmação de data") : "Aguardando confirmação de data",
  };
}

// Espelha o estado na memória da tela. O card muda de lista (fila <-> agenda)
// conforme ganha ou perde horário.
function agendaAplicarLocal(c, estado) {
  c.reservadoInicio = estado.reservadoInicio;
  c.reservadoFim = estado.reservadoFim;
  c.status = estado.status;

  const naComData = chamadosComData.indexOf(c);
  const naSemData = chamadosSemData.indexOf(c);
  if (c.reservadoInicio) {
    if (naSemData >= 0) chamadosSemData.splice(naSemData, 1);
    if (naComData < 0) chamadosComData.push(c);
    chamadosComData.sort((a, b) => new Date(a.reservadoInicio) - new Date(b.reservadoInicio));
  } else {
    if (naComData >= 0) chamadosComData.splice(naComData, 1);
    if (naSemData < 0) chamadosSemData.push(c);
    chamadosSemData.sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm));
  }
}

// Vira o estado num pedido pro n8n. dataFim vai junto de propósito: sem ele,
// um serviço que atravessa a meia-noite viraria "fim antes do início".
function agendaPedidoDoEstado(c, estado) {
  if (!estado.reservadoInicio) return { chamadoId: c.id, desagendar: "true" };
  const ini = agDeIso(estado.reservadoInicio);
  if (!estado.reservadoFim) return { chamadoId: c.id, data: agDataStr(ini), semHorario: "true" };
  const fim = agDeIso(estado.reservadoFim);
  return {
    chamadoId: c.id,
    data: agDataStr(ini),
    dataFim: agDataStr(fim),
    reservadoInicio: agHoraStr(ini),
    reservadoFim: agHoraStr(fim),
    statusAgendamento: estado.status === "Agendado" ? "confirmado" : "aguardando",
  };
}

function agendaPedidoDaTroca(c, estado) {
  const p = agendaPedidoDoEstado(c, estado);
  if (p.desagendar) return { trocarComId: c.id, trocaDesagendar: "true" };
  const corpo = { trocarComId: c.id, trocaData: p.data };
  if (p.semHorario) { corpo.trocaSemHorario = "true"; return corpo; }
  corpo.trocaDataFim = p.dataFim;
  corpo.trocaInicio = p.reservadoInicio;
  corpo.trocaFim = p.reservadoFim;
  corpo.trocaStatus = p.statusAgendamento;
  return corpo;
}

// Coração da persistência: muda na tela na hora (pra não ficar lento), manda
// pro n8n e, se o servidor recusar, VOLTA tudo pro que era. Nunca fica
// mostrando que deu certo quando não deu.
async function agendaAplicar(alteracoes, descricao, registrar) {
  alteracoes.forEach(({ chamado, depois }) => agendaAplicarLocal(chamado, depois));
  agendaRedesenhar();

  const corpo = agendaPedidoDoEstado(alteracoes[0].chamado, alteracoes[0].depois);
  if (alteracoes[1]) Object.assign(corpo, agendaPedidoDaTroca(alteracoes[1].chamado, alteracoes[1].depois));

  let resposta;
  try {
    resposta = await pedirAoN8n("reagendar-chamado", corpo);
  } catch (err) {
    resposta = null;
  }

  if (!resposta || !resposta.ok) {
    alteracoes.forEach(({ chamado, antes }) => agendaAplicarLocal(chamado, antes));
    agendaRedesenhar();
    const acoes = [];
    if (resposta && resposta.sugestao && resposta.sugestao.inicioIso) {
      const s = resposta.sugestao;
      acoes.push({
        rotulo: `Usar ${agHoraStr(agDeIso(s.inicioIso))}`,
        aoClicar: () => agendaMover(alteracoes[0].chamado, agDeIso(s.inicioIso), agDeIso(s.fimIso)),
      });
    }
    agendaMostrarAviso("erro", (resposta && resposta.mensagem) || "Não consegui salvar — nada foi mudado.", acoes);
    return false;
  }

  if (registrar !== false) {
    agendaHistorico = agendaHistorico.slice(0, agendaHistoricoPos);
    agendaHistorico.push({ descricao, alteracoes });
    if (agendaHistorico.length > AGENDA_HISTORICO_MAX) agendaHistorico.shift();
    agendaHistoricoPos = agendaHistorico.length;
  }
  agendaAtualizarBotoesHistorico();
  agendaEsconderAviso();
  mostrarToast(descricao);
  return true;
}

function agendaMover(c, ini, fim) {
  return agendaAplicar(
    [{ chamado: c, antes: agendaEstado(c), depois: agendaEstadoDeIntervalo(ini, fim, c.status) }],
    `Chamado #${c.numero} agendado`
  );
}

// ----- desfazer / refazer -----

function agendaAtualizarBotoesHistorico() {
  agendaDesfazerBotao.disabled = agendaHistoricoPos === 0;
  agendaRefazerBotao.disabled = agendaHistoricoPos >= agendaHistorico.length;
}

async function agendaDesfazer() {
  if (agendaHistoricoPos === 0) return;
  const entrada = agendaHistorico[agendaHistoricoPos - 1];
  const inverso = entrada.alteracoes.map((a) => ({ chamado: a.chamado, antes: a.depois, depois: a.antes }));
  if (await agendaAplicar(inverso, `Desfeito: ${entrada.descricao}`, false)) {
    agendaHistoricoPos--;
    agendaAtualizarBotoesHistorico();
  }
}

async function agendaRefazer() {
  if (agendaHistoricoPos >= agendaHistorico.length) return;
  const entrada = agendaHistorico[agendaHistoricoPos];
  if (await agendaAplicar(entrada.alteracoes, `Refeito: ${entrada.descricao}`, false)) {
    agendaHistoricoPos++;
    agendaAtualizarBotoesHistorico();
  }
}

// ----- arrastar: um motor só pra tudo -----

function agendaAcharChamado(id) {
  return chamadosComData.find((c) => c.id === id) || chamadosSemData.find((c) => c.id === id) || null;
}

function agendaParedeDoPonteiro(clientY, deslocPx) {
  const r = agendaViewport.getBoundingClientRect();
  return agendaTempoDoPx(agendaViewport.scrollTop + (clientY - r.top) - (deslocPx || 0));
}

function agendaCalcularAlvo() {
  const a = agArraste;
  if (!a) return;
  const passo = AGENDA_SNAP_MIN * MS_MIN;

  if (a.tipo === "base") {
    const fim = Math.max(a.iniOriginal + passo, agendaEncaixar(agendaParedeDoPonteiro(a.ponteiro.y, 0)));
    a.alvo = { ini: a.iniOriginal, fim, semHorario: false };
  } else if (a.tipo === "topo") {
    const ini = Math.min(a.fimOriginal - passo, agendaEncaixar(agendaParedeDoPonteiro(a.ponteiro.y, 0)));
    a.alvo = { ini, fim: a.fimOriginal, semHorario: false };
  } else if (agendaNivel().precisa) {
    const ini = agendaEncaixar(agendaParedeDoPonteiro(a.ponteiro.y, a.deslocPx));
    a.alvo = { ini, fim: ini + a.duracaoMin * MS_MIN, semHorario: false };
  } else {
    // Escala larga: só dá pra escolher o dia. Não inventa horário.
    const dia = agDia(agendaParedeDoPonteiro(a.ponteiro.y, a.deslocPx));
    a.alvo = { ini: dia, fim: dia, semHorario: true };
  }

  a.conflitos = a.alvo.semHorario ? [] : agendaConflitos(a.alvo.ini, a.alvo.fim, [a.chamado.id]);
}

function agendaComecarArraste(c, evento, tipo, deslocPx) {
  const ini = c.reservadoInicio ? agDeIso(c.reservadoInicio) : 0;
  const fim = c.reservadoFim ? agDeIso(c.reservadoFim) : 0;
  agArraste = {
    tipo, chamado: c,
    duracaoMin: ini && fim ? Math.round((fim - ini) / MS_MIN) : AGENDA_DURACAO_PADRAO_MIN,
    iniOriginal: ini, fimOriginal: fim,
    pegouEm: { x: evento.clientX, y: evento.clientY },
    ponteiro: { x: evento.clientX, y: evento.clientY },
    deslocPx: deslocPx || 0,
    ativo: false, alvo: null, conflitos: [],
    trocaAlvo: null, trocaDesde: 0, trocaPronta: false,
    zoomHover: null, zoomDesde: 0,
    sobreFila: false, autoTimer: null,
  };
  window.addEventListener("pointermove", agendaAoMover);
  window.addEventListener("pointerup", agendaAoSoltar);
  window.addEventListener("pointercancel", agendaCancelarArraste);
}

function agendaAtivarArraste() {
  const a = agArraste;
  a.ativo = true;
  agendaFecharMenu();
  agendaFantasmaEl.classList.remove("hidden");
  a.autoTimer = setTimeout(agendaPassoAuto, AGENDA_AUTO_ESPERA_MAX_MS);
  agendaMarcarCardsArrastando();
}

function agendaMarcarCardsArrastando() {
  agendaListaEl.querySelectorAll(".agenda-fila-card").forEach((el) => {
    el.classList.toggle("arrastando", Boolean(agArraste && agArraste.ativo && el.dataset.id === agArraste.chamado.id));
  });
}

function agendaAoMover(evento) {
  const a = agArraste;
  if (!a) return;
  a.ponteiro = { x: evento.clientX, y: evento.clientY };

  if (!a.ativo) {
    const dist = Math.abs(evento.clientX - a.pegouEm.x) + Math.abs(evento.clientY - a.pegouEm.y);
    if (dist < AGENDA_ARRASTE_MINIMO_PX) return;
    agendaAtivarArraste();
  }
  evento.preventDefault();
  agendaAvaliarAlvoSobPonteiro();
  agendaCalcularAlvo();
  agendaDesenharItens();
  agendaDesenharFantasma();
}

// O que está debaixo do cursor decide o que "soltar" vai significar: a fila
// (tirar da agenda), um nível de zoom (trocar de escala sem largar o
// chamado) ou outro bloco (trocar horários).
//
// Precisa ser chamado TAMBÉM pelo tique do arrasto, não só pelo pointermove:
// as duas esperas abaixo são de segurar parado, e mouse parado não dispara
// pointermove nenhum -- sem o tique, a espera nunca completava.
// Devolve true quando alguma coisa mudou (pra evitar redesenho à toa).
function agendaAvaliarAlvoSobPonteiro() {
  const a = agArraste;
  if (!a || !a.ativo) return false;
  const antes = `${a.sobreFila}|${a.trocaAlvo}|${a.trocaPronta}`;

  const sob = document.elementFromPoint(a.ponteiro.x, a.ponteiro.y);
  const achar = (seletor) => (sob && sob.closest ? sob.closest(seletor) : null);

  a.sobreFila = Boolean(achar(".agenda-painel")) && a.tipo === "mover";
  agendaPainelEl.classList.toggle("alvo-solta", a.sobreFila);

  const nivelEl = achar(".agenda-nivel");
  document.querySelectorAll(".agenda-nivel.alvo-arraste").forEach((el) => el.classList.remove("alvo-arraste"));
  if (nivelEl) {
    nivelEl.classList.add("alvo-arraste");
    if (a.zoomHover !== nivelEl.dataset.nivel) {
      a.zoomHover = nivelEl.dataset.nivel;
      a.zoomDesde = Date.now();
    } else if (Date.now() - a.zoomDesde > AGENDA_ESPERA_ZOOM_MS && agendaNivelId !== a.zoomHover) {
      agendaDefinirNivel(a.zoomHover);
      a.zoomHover = null;
      return true;
    }
  } else {
    a.zoomHover = null;
  }

  // Trocar horários só depois de segurar de propósito quase um segundo em
  // cima do outro bloco -- passar por cima correndo não pode fazer nada.
  const blocoEl = achar(".agenda-bloco");
  const outroId = blocoEl && blocoEl.dataset.id !== a.chamado.id ? blocoEl.dataset.id : null;
  if (a.tipo === "mover" && a.iniOriginal && a.fimOriginal && outroId) {
    if (a.trocaAlvo !== outroId) { a.trocaAlvo = outroId; a.trocaDesde = Date.now(); }
    a.trocaPronta = Date.now() - a.trocaDesde > AGENDA_ESPERA_TROCA_MS;
  } else {
    a.trocaAlvo = null;
    a.trocaPronta = false;
  }

  return antes !== `${a.sobreFila}|${a.trocaAlvo}|${a.trocaPronta}`;
}

function agendaDesenharFantasma() {
  const a = agArraste;
  if (!a || !a.ativo) return;
  const c = a.chamado;
  let texto;
  if (a.sobreFila) texto = "Soltar aqui: tirar da agenda";
  else if (a.trocaPronta) texto = "Soltar aqui: trocar horários";
  else if (a.alvo && a.alvo.semHorario) {
    texto = `${agFmt(a.alvo.ini, { day: "2-digit", month: "2-digit", year: "numeric" })} · horário a definir`;
  } else if (a.alvo) {
    texto = `${agFmt(a.alvo.ini, { day: "2-digit", month: "2-digit" })} · ${agHoraStr(a.alvo.ini)} → ${agHoraStr(a.alvo.fim)}`;
  } else texto = "";

  agendaFantasmaEl.innerHTML = `<strong>${escapeHtml(c.clienteNome || "Sem nome")}</strong><br>${escapeHtml(texto)}`;
  agendaFantasmaEl.classList.toggle("conflito", a.conflitos.length > 0 && !a.trocaPronta && !a.sobreFila);
  agendaFantasmaEl.style.left = `${a.ponteiro.x + 16}px`;
  agendaFantasmaEl.style.top = `${a.ponteiro.y + 16}px`;
}

// Segurar o chamado perto da borda faz a linha do tempo andar sozinha: perto
// de baixo avança no tempo, perto de cima volta. Quanto mais colado na borda,
// mais rápido. Cadeia de setTimeout (não requestAnimationFrame) porque é o
// mesmo mecanismo que já funcionava aqui e é testável sem depender de frames.
function agendaPassoAuto() {
  const a = agArraste;
  if (!a || !a.ativo) return;

  // Mouse parado em cima de um alvo também conta: ver agendaAvaliarAlvoSobPonteiro.
  const mudouAlvo = agendaAvaliarAlvoSobPonteiro();

  const r = agendaViewport.getBoundingClientRect();
  const y = a.ponteiro.y;
  let direcao = 0, proximidade = 0;
  if (y < r.top + AGENDA_MARGEM_AUTO_PX && y > r.top - 200) {
    direcao = -1;
    proximidade = (r.top + AGENDA_MARGEM_AUTO_PX - y) / AGENDA_MARGEM_AUTO_PX;
  } else if (y > r.bottom - AGENDA_MARGEM_AUTO_PX && y < r.bottom + 200) {
    direcao = 1;
    proximidade = (y - (r.bottom - AGENDA_MARGEM_AUTO_PX)) / AGENDA_MARGEM_AUTO_PX;
  }

  if (!direcao) {
    if (mudouAlvo) { agendaCalcularAlvo(); agendaDesenharItens(); agendaDesenharFantasma(); }
    a.autoTimer = setTimeout(agendaPassoAuto, AGENDA_AUTO_ESPERA_MAX_MS);
    return;
  }

  proximidade = Math.min(1, Math.max(0.05, proximidade));
  agendaViewport.scrollTop += direcao * (6 + proximidade * 36);
  agendaConferirBordas();
  agendaCalcularAlvo();
  agendaDesenharItens();
  agendaDesenharFantasma();

  const espera = AGENDA_AUTO_ESPERA_MAX_MS - proximidade * (AGENDA_AUTO_ESPERA_MAX_MS - AGENDA_AUTO_ESPERA_MIN_MS);
  a.autoTimer = setTimeout(agendaPassoAuto, espera);
}

// Todo jeito de sair do arrasto passa por aqui: senão sobra temporizador
// rodando sozinho depois que o chamado já foi solto.
function agendaLimparArraste() {
  const a = agArraste;
  agArraste = null;
  if (a && a.autoTimer) clearTimeout(a.autoTimer);
  window.removeEventListener("pointermove", agendaAoMover);
  window.removeEventListener("pointerup", agendaAoSoltar);
  window.removeEventListener("pointercancel", agendaCancelarArraste);
  agendaFantasmaEl.classList.add("hidden");
  agendaPainelEl.classList.remove("alvo-solta");
  document.querySelectorAll(".agenda-nivel.alvo-arraste").forEach((el) => el.classList.remove("alvo-arraste"));
  agendaMarcarCardsArrastando();
  return a;
}

function agendaCancelarArraste() {
  agendaLimparArraste();
  agendaDesenharItens();
}

async function agendaAoSoltar(evento) {
  const a = agendaLimparArraste();
  if (!a) return;

  // Não chegou a virar arrasto: foi um clique. Abre o menu do chamado.
  if (!a.ativo) {
    agendaAbrirMenu(a.chamado, evento.clientX, evento.clientY);
    return;
  }
  agendaDesenharItens();

  const c = a.chamado;

  if (a.sobreFila) {
    await agendaAplicar(
      [{ chamado: c, antes: agendaEstado(c), depois: agendaEstadoDeIntervalo(0) }],
      `Chamado #${c.numero} voltou pra fila`
    );
    return;
  }

  if (a.trocaPronta && a.trocaAlvo) {
    const outro = agendaAcharChamado(a.trocaAlvo);
    if (outro) agendaPerguntarTroca(c, outro);
    return;
  }

  if (!a.alvo) return;

  if (a.conflitos.length) {
    const nomes = a.conflitos.map((o) => `#${o.c.numero}`).join(", ");
    const livre = agendaProximoLivre(a.alvo.ini, a.alvo.fim - a.alvo.ini, [c.id]);
    const acoes = livre ? [{
      rotulo: `Usar ${agFmt(livre.ini, { day: "2-digit", month: "2-digit" })} ${agHoraStr(livre.ini)}`,
      aoClicar: () => agendaMover(c, livre.ini, livre.fim),
    }] : [];
    agendaMostrarAviso("", `Conflito com ${nomes}. ${livre ? "Próximo horário livre sugerido ao lado." : "Não achei horário livre por perto."}`, acoes);
    return;
  }

  const antes = agendaEstado(c);
  const depois = a.alvo.semHorario
    ? agendaEstadoDeIntervalo(a.alvo.ini, 0)
    : agendaEstadoDeIntervalo(a.alvo.ini, a.alvo.fim, c.status);
  const descricao = a.tipo === "novo" ? `Chamado #${c.numero} agendado`
    : (a.tipo === "mover" ? `Chamado #${c.numero} movido` : `Chamado #${c.numero} redimensionado`);
  await agendaAplicar([{ chamado: c, antes, depois }], descricao);
}

// A troca nunca acontece sozinha: sempre pergunta antes, e só depois de
// conferir se os dois horários novos cabem de verdade.
function agendaPerguntarTroca(a, b) {
  const aIni = agDeIso(a.reservadoInicio), aFim = agDeIso(a.reservadoFim);
  const bIni = agDeIso(b.reservadoInicio), bFim = b.reservadoFim ? agDeIso(b.reservadoFim) : 0;
  if (!bFim) {
    agendaMostrarAviso("erro", `Chamado #${b.numero} ainda não tem horário exato — não dá pra trocar.`);
    return;
  }

  // Durações diferentes podem fazer o novo intervalo invadir um terceiro.
  const novoA = { ini: bIni, fim: bIni + (aFim - aIni) };
  const novoB = { ini: aIni, fim: aIni + (bFim - bIni) };
  const bate = agendaConflitos(novoA.ini, novoA.fim, [a.id, b.id])
    .concat(agendaConflitos(novoB.ini, novoB.fim, [a.id, b.id]));
  if (bate.length) {
    agendaMostrarAviso("erro", `Não dá pra trocar: as durações são diferentes e o resultado bateria em #${bate[0].c.numero}.`);
    return;
  }
  if (novoA.ini < novoB.fim && novoB.ini < novoA.fim) {
    agendaMostrarAviso("erro", "Não dá pra trocar: com essas durações os dois acabariam se cruzando.");
    return;
  }

  agendaMostrarAviso("", `Trocar horários de #${a.numero} e #${b.numero}?`, [{
    rotulo: "Trocar",
    aoClicar: () => agendaAplicar([
      { chamado: a, antes: agendaEstado(a), depois: agendaEstadoDeIntervalo(novoA.ini, novoA.fim, a.status) },
      { chamado: b, antes: agendaEstado(b), depois: agendaEstadoDeIntervalo(novoB.ini, novoB.fim, b.status) },
    ], `Horários de #${a.numero} e #${b.numero} trocados`),
  }, {
    rotulo: "Cancelar",
    aoClicar: () => {},
  }]);
}

// ----- menu de um chamado (clique sem arrastar) -----

function agendaFecharMenu() {
  agendaMenuEl.classList.add("hidden");
  agendaMenuEl.innerHTML = "";
}

function agendaAbrirMenu(c, x, y) {
  const agendado = Boolean(c.reservadoInicio);
  const confirmado = c.status === "Agendado";

  agendaMenuEl.innerHTML = `<strong>#${escapeHtml(String(c.numero))} — ${escapeHtml(c.clienteNome || "")}</strong>` +
    `<p>${escapeHtml(c.status || "")}</p>`;

  const opcao = (rotulo, aoClicar) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = rotulo;
    b.addEventListener("click", () => { agendaFecharMenu(); aoClicar(); });
    agendaMenuEl.appendChild(b);
  };

  if (agendado && c.reservadoFim) {
    opcao(confirmado ? "Voltar pra aguardando confirmação" : "Confirmar data", () => {
      const antes = agendaEstado(c);
      agendaAplicar([{
        chamado: c, antes,
        depois: Object.assign({}, antes, { status: confirmado ? "Aguardando confirmação de data" : "Agendado" }),
      }], confirmado ? `#${c.numero} voltou pra aguardando` : `Data do #${c.numero} confirmada`);
    });
  }
  if (agendado) {
    opcao("Tirar da agenda (volta pra fila)", () => {
      agendaAplicar([{ chamado: c, antes: agendaEstado(c), depois: agendaEstadoDeIntervalo(0) }],
        `Chamado #${c.numero} voltou pra fila`);
    });
  }
  opcao("Editar chamado", () => {
    const item = document.querySelector('.sidebar-item[data-page="consultar-chamados"]');
    if (item) item.click();
    abrirEdicaoChamado(c);
  });
  opcao("Cancelar chamado", () => {
    if (!confirm(`Cancelar o Chamado #${c.numero} (${c.clienteNome})?`)) return;
    cancelarChamado(c.id, null);
  });

  agendaMenuEl.classList.remove("hidden");
  const larg = agendaMenuEl.offsetWidth, alt = agendaMenuEl.offsetHeight;
  agendaMenuEl.style.left = `${Math.min(x, window.innerWidth - larg - 10)}px`;
  agendaMenuEl.style.top = `${Math.min(y, window.innerHeight - alt - 10)}px`;
}

document.addEventListener("pointerdown", (evento) => {
  if (agendaMenuEl.classList.contains("hidden")) return;
  if (!agendaMenuEl.contains(evento.target)) agendaFecharMenu();
}, true);

// ----- pegar com o mouse -----

agendaConteudo.addEventListener("pointerdown", (evento) => {
  if (evento.button !== 0) return;
  const alcaEl = evento.target.closest(".agenda-bloco-alca");
  const blocoEl = evento.target.closest(".agenda-bloco, .agenda-bloco-semhora");
  if (!blocoEl) return;
  const c = agendaAcharChamado(blocoEl.dataset.id);
  if (!c) return;

  evento.preventDefault();
  if (alcaEl) {
    agendaComecarArraste(c, evento, alcaEl.dataset.alca, 0);
  } else {
    const r = blocoEl.getBoundingClientRect();
    agendaComecarArraste(c, evento, "mover", evento.clientY - r.top);
  }
});

agendaListaEl.addEventListener("pointerdown", (evento) => {
  if (evento.button !== 0) return;
  const cardEl = evento.target.closest(".agenda-fila-card");
  // Já agendado: não arrasta daqui (arrastar é no próprio bloco da linha do
  // tempo) -- o clique dele é tratado no listener de "click" logo abaixo.
  if (!cardEl || cardEl.dataset.agendado === "1") return;
  const c = agendaAcharChamado(cardEl.dataset.id);
  if (!c) return;
  evento.preventDefault();
  agendaComecarArraste(c, evento, "novo", 0);
});

agendaListaEl.addEventListener("click", (evento) => {
  const cardEl = evento.target.closest(".agenda-fila-card");
  if (!cardEl || cardEl.dataset.agendado !== "1") return;
  const c = agendaAcharChamado(cardEl.dataset.id);
  if (c) agendaPularPara(c);
});

// ----- zoom e navegação -----

function agendaMarcarNivel() {
  document.querySelectorAll(".agenda-nivel").forEach((b) => {
    b.classList.toggle("active", b.dataset.nivel === agendaNivelId);
  });
}

// Trocar de escala mantém o mesmo instante debaixo do mesmo ponto da tela --
// é o que faz "aproximar" parecer aproximar, e não pular pra outro lugar.
function agendaDefinirNivel(id, paredeAlvo, ancoraPx) {
  if (!AGENDA_NIVEIS.some((n) => n.id === id)) return;
  const ancora = ancoraPx === undefined ? agendaViewport.clientHeight / 2 : ancoraPx;
  const alvo = paredeAlvo === undefined ? agendaTempoDoPx(agendaViewport.scrollTop + ancora) : paredeAlvo;
  agendaNivelId = id;
  agendaMarcarNivel();
  agendaIrPara(alvo, ancora);
  if (agArraste && agArraste.ativo) {
    agendaCalcularAlvo();
    agendaDesenharItens();
    agendaDesenharFantasma();
  }
}

function agendaMudarZoom(passo, paredeAlvo, ancoraPx) {
  const i = AGENDA_NIVEIS.findIndex((n) => n.id === agendaNivelId);
  const novo = Math.min(AGENDA_NIVEIS.length - 1, Math.max(0, i + passo));
  if (novo !== i) agendaDefinirNivel(AGENDA_NIVEIS[novo].id, paredeAlvo, ancoraPx);
}

document.querySelectorAll(".agenda-nivel").forEach((botao) => {
  botao.addEventListener("click", () => agendaDefinirNivel(botao.dataset.nivel));
});
agendaZoomMaisBotao.addEventListener("click", () => agendaMudarZoom(1));
agendaZoomMenosBotao.addEventListener("click", () => agendaMudarZoom(-1));
agendaAgoraBotao.addEventListener("click", () => agendaIrPara(agAgora(), agendaAlturaTela() * 0.35));
agendaDesfazerBotao.addEventListener("click", agendaDesfazer);
agendaRefazerBotao.addEventListener("click", agendaRefazer);

agendaViewport.addEventListener("scroll", () => {
  agendaConferirBordas();
  agendaFecharMenu();
});

// Ctrl + roda aproxima/afasta em volta do ponto onde o mouse está; a roda
// sozinha continua rolando o tempo normalmente (inclusive durante o arrasto).
agendaViewport.addEventListener("wheel", (evento) => {
  if (!evento.ctrlKey) return;
  evento.preventDefault();
  const r = agendaViewport.getBoundingClientRect();
  const ancora = evento.clientY - r.top;
  agendaMudarZoom(evento.deltaY < 0 ? 1 : -1, agendaTempoDoPx(agendaViewport.scrollTop + ancora), ancora);
}, { passive: false });

document.addEventListener("keydown", (evento) => {
  if (document.getElementById("page-agenda").classList.contains("hidden")) return;

  if (evento.key === "Escape" && agArraste) {
    agendaCancelarArraste();
    return;
  }
  // Com o chamado na mão dá pra mudar de escala pelo teclado também.
  if (agArraste && agArraste.ativo && (evento.key === "+" || evento.key === "=" || evento.key === "-")) {
    evento.preventDefault();
    agendaMudarZoom(evento.key === "-" ? -1 : 1);
    return;
  }

  const alvo = evento.target;
  const digitando = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
  if (digitando || !(evento.ctrlKey || evento.metaKey)) return;
  if (evento.key.toLowerCase() !== "z") return;
  evento.preventDefault();
  if (evento.shiftKey) agendaRefazer(); else agendaDesfazer();
});

// ----- fila da direita -----

function montarCardFila(c) {
  const agendado = Boolean(c.reservadoInicio);
  const card = document.createElement("div");
  card.className = "agenda-fila-card" + (agendado ? " agendado" : "");
  card.dataset.id = c.id;
  if (agendado) card.dataset.agendado = "1";

  // Quem já tem lugar na agenda mostra onde -- é o que dá pra clicar em vez
  // de arrastar (arrastar continua sendo feito no próprio bloco da linha do
  // tempo, não daqui).
  let linhaHorario = "";
  if (agendado) {
    const ini = agDeIso(c.reservadoInicio);
    const dataTxt = agFmt(ini, { day: "2-digit", month: "2-digit" });
    const horaTxt = c.reservadoFim
      ? `${agHoraStr(ini)} → ${agHoraStr(agDeIso(c.reservadoFim))}`
      : "horário a definir";
    linhaHorario = `<p class="agenda-fila-horario">📅 ${escapeHtml(dataTxt)} · ${escapeHtml(horaTxt)}</p>`;
  }

  card.innerHTML = `
    <div class="agenda-fila-topo">
      <span class="chamado-numero">#${escapeHtml(String(c.numero))}</span>
      <span class="chamado-status-badge ${statusClasseChamado(c.status)}">${escapeHtml(c.status)}</span>
    </div>
    <strong>${escapeHtml(c.clienteNome || "Sem nome")}</strong>
    ${linhaHorario}
    <p>${escapeHtml(c.enderecoCopia || "")}</p>
    ${c.descricaoSolicitacao ? `<p>${escapeHtml(c.descricaoSolicitacao)}</p>` : ""}
  `;
  return card;
}

// TODOS os chamados ativos (fila + já agendados), não só quem ainda não tem
// lugar -- o dono apontou isso direto na tela: precisa continuar vendo o que
// já foi marcado por aqui, só que agora como "agendado", não pra arrastar de
// novo (isso se faz no próprio bloco da linha do tempo). Clicar num já
// marcado pula pra ele (ver agendaPularPara); clicar/arrastar um da fila
// continua igual. Cancelado não entra aqui -- continua só em "Consultar
// chamados" (ver CONTEXTO.md 16/09/2026).
function agendaDesenharFila() {
  const todos = chamadosSemData.concat(chamadosComData)
    .filter((c) => c.status !== "Cancelado")
    .sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm));

  agendaListaEl.innerHTML = "";
  if (!todos.length) {
    agendaListaEl.innerHTML = `<p class="doc-hint">Nenhum chamado ainda.</p>`;
    return;
  }

  const agora = new Date();
  let grupoAtual = null;
  todos.forEach((c) => {
    const rotulo = c.criadoEm ? rotuloAgendaGrupo(c.criadoEm, agora) : "Sem data de criação";
    if (rotulo !== grupoAtual) {
      grupoAtual = rotulo;
      const titulo = document.createElement("h2");
      titulo.className = "agenda-grupo-titulo";
      titulo.textContent = rotulo;
      agendaListaEl.appendChild(titulo);
    }
    agendaListaEl.appendChild(montarCardFila(c));
  });
  agendaMarcarCardsArrastando();
}

// Clique num card já agendado, na lista: pula pra ele na linha do tempo (em
// vez de precisar rolar/procurar) e pisca o bloco um instante pra achar mais
// fácil onde ele caiu.
function agendaPularPara(c) {
  if (!c.reservadoInicio) return;
  const ini = agDeIso(c.reservadoInicio);
  const ancora = agendaAlturaTela() * 0.4;

  if (c.reservadoFim) {
    const fim = agDeIso(c.reservadoFim);
    const alvo = ini + (fim - ini) / 2;
    if (!agendaNivel().precisa) agendaDefinirNivel("hora", alvo, ancora);
    else agendaIrPara(alvo, ancora);
  } else {
    // Dia sem horário exato: não existe zoom "certo" pra ele, só centraliza
    // no meio do dia marcado, na escala em que já estava.
    agendaIrPara(ini + 12 * MS_HORA, ancora);
  }

  agendaFecharMenu();
  const alvoEl = agendaItensEl.querySelector(`[data-id="${escapeCssAttr(c.id)}"]`);
  if (alvoEl) {
    alvoEl.classList.add("agenda-bloco-piscar");
    setTimeout(() => alvoEl.classList.remove("agenda-bloco-piscar"), 1500);
  }
}

// Escapa um valor pra uso dentro de um seletor [attr="valor"] -- os ids do
// Airtable só têm letras/dígitos, mas mais vale não confiar nisso pra sempre.
function escapeCssAttr(valor) {
  return window.CSS && CSS.escape ? CSS.escape(valor) : String(valor).replace(/["\\]/g, "\\$&");
}

// "Consultar chamados" lê as MESMAS listas (chamadosSemData/chamadosComData),
// então redesenha junto: sem isso, agendar aqui deixava a outra tela mostrando
// o chamado no bloco errado até alguém apertar "Atualizar".
function agendaRedesenhar() {
  agendaDesenharFila();
  agendaDesenharItens();
  desenharListaChamados();
}

// Chamada por carregarChamados(): é o ponto de entrada da Agenda inteira.
function desenharAgenda() {
  if (!agendaJanelaFim) agendaMontarJanela(agAgora());
  agendaMarcarNivel();
  agendaDesenharGrade();
  agendaRedesenhar();
  agendaAtualizarBotoesHistorico();
}

// Ao abrir a aba: só aí a tela tem altura de verdade (escondida ela mede 0),
// então é o momento certo de posicionar a linha do tempo no "agora".
function agendaAoAbrir() {
  agendaMarcarNivel();
  if (!agendaPosicionada) agendaIrPara(agAgora(), agendaAlturaTela() * 0.35);
  else { agendaDesenharGrade(); agendaRedesenhar(); }
}

// A linha do "agora" precisa andar sozinha — sem isso ela envelhece na tela.
setInterval(() => {
  if (document.getElementById("page-agenda").classList.contains("hidden")) return;
  if (agArraste) return;
  agendaDesenharItens();
}, 30000);

window.addEventListener("resize", () => {
  if (document.getElementById("page-agenda").classList.contains("hidden")) return;
  agendaConferirBordas();
});

async function carregarChamados() {
  mostrarChamadosListaStatus("neutral", "Carregando...");
  const dados = await pedirAoN8n("listar-chamados", {});
  if (!dados || !dados.ok) {
    mostrarChamadosListaStatus("error", (dados && dados.mensagem) || "Não consegui carregar os chamados.");
    return;
  }
  chamadosSemData = dados.semData || [];
  chamadosComData = dados.comData || [];
  desenharListaChamados();
  desenharAgenda();
  mostrarChamadosListaStatus("neutral", "");
}

recarregarChamadosBotao.addEventListener("click", carregarChamados);
agendaAtualizarBotao.addEventListener("click", carregarChamados);

// ----- editar chamado -----
//
// Uma tela só cobre tudo: endereço/local/descrição/observações/anexos/
// contato (via "App - Editar chamado"). Agendamento não é feito por aqui
// (ver CONTEXTO.md 14/09/2026) — o cliente em si também não muda, só o que
// foi pedido, onde, e pra quem.

async function abrirEdicaoChamado(chamado) {
  chamadoEditandoAtual = chamado;
  chamadoEditarTitulo.textContent = `Chamado #${chamado.numero} — ${chamado.clienteNome}`;

  editChamadoLocalExato.value = chamado.localExato || "";
  editChamadoDescricao.value = chamado.descricaoSolicitacao || "";
  editChamadoObservacoes.value = chamado.observacoesServico || "";

  chamadoEditAnexosNovos = [];
  editChamadoAnexosLista.innerHTML = "";
  if (chamado.anexos && chamado.anexos.length) {
    editChamadoAnexosAtuaisBloco.classList.remove("hidden");
    editChamadoAnexosAtuais.innerHTML = chamado.anexos
      .map((a) => `<p class="doc-hint">📎 ${escapeHtml(a.filename)}</p>`).join("");
  } else {
    editChamadoAnexosAtuaisBloco.classList.add("hidden");
    editChamadoAnexosAtuais.innerHTML = "";
  }

  mostrarEditChamadoStatus("neutral", "");

  chamadoEditarBox.classList.remove("hidden");
  chamadoEditarBox.scrollIntoView({ behavior: "smooth", block: "start" });

  // Endereço e contato: só mostra escolha se o cliente tiver mais de um.
  // Carrega depois de abrir a caixa, pra não atrasar a abertura da tela.
  editChamadoLocalEscolhaBox.classList.add("hidden");
  editChamadoListaLocais.innerHTML = "";
  chamadoEditLocalEscolhidoId = "";
  editChamadoContatoEscolhaBox.classList.add("hidden");
  editChamadoListaContatos.innerHTML = "";
  chamadoEditContatoEscolhidoId = "";
  if (chamado.clienteId) {
    const [locaisResp, contatosResp] = await Promise.all([
      pedirAoN8n("listar-locais", { entidadeId: chamado.clienteId }),
      pedirAoN8n("listar-contatos", { entidadeId: chamado.clienteId }),
    ]);
    const listaLocais = (locaisResp && locaisResp.locais) || [];
    const listaContatos = (contatosResp && contatosResp.contatos) || [];

    if (listaLocais.length > 1) {
      editChamadoLocalEscolhaBox.classList.remove("hidden");
      listaLocais.forEach((loc) => {
        const nomeLoc = loc.nome || loc.endereco || "Sem nome";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chamado-contato-item" + (loc.endereco === chamado.enderecoCopia ? " active" : "");
        btn.textContent = nomeLoc;
        if (loc.endereco === chamado.enderecoCopia) chamadoEditLocalEscolhidoId = loc.id;
        btn.addEventListener("click", () => {
          chamadoEditLocalEscolhidoId = loc.id;
          editChamadoListaLocais.querySelectorAll(".chamado-contato-item").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        });
        editChamadoListaLocais.appendChild(btn);
      });
    }

    if (listaContatos.length > 1) {
      editChamadoContatoEscolhaBox.classList.remove("hidden");
      listaContatos.forEach((ct) => {
        const nomeCt = ct.nome || ct.whatsapps[0] || ct.emails[0] || "Sem nome";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chamado-contato-item" + (nomeCt === chamado.contatoNome ? " active" : "");
        btn.textContent = nomeCt;
        if (nomeCt === chamado.contatoNome) chamadoEditContatoEscolhidoId = ct.id;
        btn.addEventListener("click", () => {
          chamadoEditContatoEscolhidoId = ct.id;
          editChamadoListaContatos.querySelectorAll(".chamado-contato-item").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        });
        editChamadoListaContatos.appendChild(btn);
      });
    }
  }
}

editChamadoCancelarFormBotao.addEventListener("click", () => {
  chamadoEditarBox.classList.add("hidden");
  chamadoEditandoAtual = null;
});

async function salvarEdicaoChamado() {
  editChamadoSalvarBotao.disabled = true;
  mostrarEditChamadoStatus("neutral", "Salvando...");

  const corpoEdicao = {
    chamadoId: chamadoEditandoAtual.id,
    contatoId: chamadoEditContatoEscolhidoId,
    localId: chamadoEditLocalEscolhidoId,
    localExato: editChamadoLocalExato.value.trim(),
    descricaoSolicitacao: editChamadoDescricao.value.trim(),
    observacoesServico: editChamadoObservacoes.value.trim(),
    anexosNovos: JSON.stringify(chamadoEditAnexosNovos.map((a) => ({ filename: a.filename, contentType: a.contentType, base64: a.base64 }))),
  };

  let respostaEdicao;
  try {
    respostaEdicao = await pedirAoN8n("editar-chamado", corpoEdicao);
  } catch (err) {
    editChamadoSalvarBotao.disabled = false;
    mostrarEditChamadoStatus("error", "Não consegui falar com o servidor.");
    return;
  }
  editChamadoSalvarBotao.disabled = false;
  if (!respostaEdicao || !respostaEdicao.ok) {
    mostrarEditChamadoStatus("error", (respostaEdicao && respostaEdicao.mensagem) || "Não consegui salvar.");
    return;
  }

  chamadoEditarBox.classList.add("hidden");
  chamadoEditandoAtual = null;
  await carregarChamados();
}

editChamadoSalvarBotao.addEventListener("click", async () => {
  await salvarEdicaoChamado();
});

// "Consultar chamados" e "Agenda" mostram o mesmo dado carregado uma vez só
// (chamadosSemData/chamadosComData), cada um do seu jeito -- qualquer um dos
// dois dispara o carregamento na primeira vez.
function carregarChamadosSeNecessario() {
  if (!chamadosPaginaCarregada) {
    chamadosPaginaCarregada = true;
    carregarChamados();
  }
}

document.querySelector('.sidebar-item[data-page="consultar-chamados"]').addEventListener("click", carregarChamadosSeNecessario);
document.querySelector('.sidebar-item[data-page="agenda"]').addEventListener("click", () => {
  // A ordem importa: quem troca de página é o ouvinte lá de cima, que roda
  // antes deste. Então aqui a #page-agenda já está visível e tem altura de
  // verdade -- é o que a linha do tempo precisa pra se posicionar direito.
  agendaAoAbrir();
  carregarChamadosSeNecessario();
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
  semDocumento = false;
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
  fecharFormReceita();
  despesas = [];
  fornecedores = [];
  recorrentes = [];
  recebimentos = [];
  conferencias = [];
  retiradas = [];
  cartoes = [];
  pagamentosFatura = [];
  configFin = null;
  financeiroCarregado = false;
  listaDespesasBox.innerHTML = "";
  listaRecorrentesBox.innerHTML = "";
  listaReceitasBox.innerHTML = "";
  buscaDespesa.value = "";
  buscaReceita.value = "";
  filtroSituacao.value = "abertas";
  filtroSituacaoReceita.value = "abertas";
  resumoDespesas.classList.add("hidden");
  resumoReceber.classList.add("hidden");
  document.getElementById("painel-conteudo").classList.add("hidden");
  document.getElementById("divisao-conteudo").classList.add("hidden");
  listaRetiradasBox.innerHTML = "";
  listaCartoesBox.innerHTML = "";
  atualizarListasDeApoio();
  atualizarFiltroDeMeses();
  mostrarListaDespesasStatus("neutral", "");
  mostrarListaRecorrentesStatus("neutral", "");

  // Chamados também: dados de um dono não devem sobrar em memória pro
  // próximo login neste aparelho.
  chamadosCadastros = [];
  chamadosCadastrosCarregados = false;
  chamadosPaginaCarregada = false;
  chamadosSemData = [];
  chamadosComData = [];
  chamadoEditandoAtual = null;
  chamadoEditContatoEscolhidoId = "";
  chamadoEditAnexosNovos = [];
  listaChamadosSemData.innerHTML = "";
  listaChamadosComData.innerHTML = "";
  chamadosListaClientes.innerHTML = "";

  // Agenda: fila, linha do tempo e o histórico de desfazer somem junto — o
  // próximo login não pode desfazer coisa do dono anterior.
  agendaHistorico = [];
  agendaHistoricoPos = 0;
  agendaPosicionada = false;
  agendaLimparArraste();
  agendaFecharMenu();
  agendaEsconderAviso();
  agendaListaEl.innerHTML = "";
  agendaItensEl.innerHTML = "";
  agendaAtualizarBotoesHistorico();
  editChamadoAnexosLista.innerHTML = "";
  chamadoEditarBox.classList.add("hidden");
  mostrarChamadosListaStatus("neutral", "");
  limparFormularioChamado();

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
