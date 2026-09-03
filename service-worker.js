// Sobe junto com o APP_VERSION do app.js a cada publicação.
const CACHE_NAME = "solucoes-rapidas-2026.09.03x";
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
  // cache.addAll() busca cada arquivo com o modo padrão de cache, que
  // respeita o Cache-Control do CDN do GitHub Pages -- descoberto que
  // isso podia trazer uma cópia velha de app.js pro cache novo mesmo
  // logo depois de um deploy de verdade (o service worker reinstala,
  // mas busca o arquivo errado). Corrigido buscando cada arquivo com um
  // parâmetro de versão na URL (força o CDN a tratar como pedido novo,
  // nunca visto antes) e guardando no cache sob a chave normal (sem o
  // parâmetro), pra bater certinho com os pedidos reais no fetch abaixo.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(APP_SHELL.map(async (url) => {
        const urlComVersao = url.includes("?") ? `${url}&v=${CACHE_NAME}` : `${url}?v=${CACHE_NAME}`;
        const resposta = await fetch(urlComVersao, { cache: "no-store" });
        await cache.put(url, resposta);
      }))
    )
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
