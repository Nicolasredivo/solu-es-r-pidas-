const form = document.getElementById("test-form");
const passwordInput = document.getElementById("password");
const testButton = document.getElementById("test-button");
const statusBox = document.getElementById("status");

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
  item.addEventListener("click", closeSidebar);
});

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
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}
