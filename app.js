const form = document.getElementById("test-form");
const passwordInput = document.getElementById("password");
const testButton = document.getElementById("test-button");
const statusBox = document.getElementById("status");

const gateView = document.getElementById("gate-view");
const appView = document.getElementById("app-view");

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
const tipoCnpjBox = document.getElementById("tipo-cnpj");

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

function avaliarDocumento(digitos) {
  tipoCnpjBox.classList.add("hidden");
  document.querySelectorAll(".tipo-opcao").forEach((b) => b.classList.remove("active"));

  if (digitos.length === 11) {
    if (cpfValido(digitos)) {
      mostrarDica("ok", "CPF válido · Pessoa Física");
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

document.querySelectorAll(".tipo-opcao").forEach((botao) => {
  botao.addEventListener("click", () => {
    document.querySelectorAll(".tipo-opcao").forEach((b) => b.classList.remove("active"));
    botao.classList.add("active");
    mostrarDica("ok", `CNPJ válido · ${botao.textContent}`);
  });
});

// ----- Tela de entrada (senha) -----

function showStatus(kind, message) {
  statusBox.textContent = message;
  statusBox.className = `status show ${kind}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!N8N_TEST_WEBHOOK_URL || N8N_TEST_WEBHOOK_URL === "COLE_AQUI_A_URL_DO_SEU_N8N") {
    showStatus("error", "Ainda falta configurar o endereço do n8n em config.js.");
    return;
  }

  testButton.disabled = true;
  showStatus("loading", "Conectando ao n8n...");

  try {
    // Enviado como formulário simples de propósito: assim o navegador não
    // precisa fazer a verificação extra de segurança (CORS preflight).
    const response = await fetch(N8N_TEST_WEBHOOK_URL, {
      method: "POST",
      body: new URLSearchParams({ senha: passwordInput.value }),
    });

    const data = await response.json().catch(() => null);

    if (data && data.ok) {
      showStatus("ok", data.mensagem || "Conectado com sucesso!");
      gateView.classList.add("hidden");
      appView.classList.remove("hidden");
    } else {
      showStatus("error", (data && data.mensagem) || "Acesso negado. Confira a senha.");
    }
  } catch (err) {
    showStatus("error", "Não foi possível falar com o n8n. Ele está ligado e o túnel ativo?");
  } finally {
    testButton.disabled = false;
  }
});

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
