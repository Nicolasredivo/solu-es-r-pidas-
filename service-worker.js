// Sobe junto com o APP_VERSION do app.js a cada publicação.
const CACHE_NAME = "solucoes-rapidas-2026.08.21b";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // config.js muda com frequência (endereço do túnel): sempre busca na rede,
  // nunca serve do cache.
  if (url.pathname.endsWith("/config.js")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  // Nunca cacheia chamadas para o n8n: sempre precisam ser em tempo real.
  if (event.request.method !== "GET" || !url.pathname.match(/\.(html|css|js|json|png)$|\/$/)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
