const form = document.getElementById("test-form");
const passwordInput = document.getElementById("password");
const testButton = document.getElementById("test-button");
const statusBox = document.getElementById("status");

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
    const response = await fetch(N8N_TEST_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha: passwordInput.value }),
    });

    if (!response.ok) {
      showStatus("error", "Acesso negado. Confira a senha e tente de novo.");
      return;
    }

    showStatus("ok", "Conectado com sucesso!");
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
