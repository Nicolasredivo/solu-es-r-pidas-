// Sobe junto com o APP_VERSION do app.js a cada publicação.
const CACHE_NAME = "solucoes-rapidas-2026.09.16j";
// "./" e "./index.html" são a landing institucional; "./sistema.html" é o
// app de verdade (tela de senha + painel), que antes ocupava a raiz.
const APP_SHELL = [
  "./",
  "./index.html",
  "./landing.css",
  "./landing.js",
  "./imagens/logo.svg",
  "./sistema.html",
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
        // cache.put() aceita qualquer resposta, inclusive um 404 ou a página
        // de erro do CDN. Guardar isso sob a chave "./app.js" envenenava o
        // cache: como o fetch abaixo serve o cache primeiro, o app passava a
        // carregar a página de erro em vez do código -- e só saía disso na
        // próxima virada de versão. Melhor a instalação falhar aqui e o
        // service worker antigo continuar valendo.
        if (!resposta.ok) {
          throw new Error(`Não consegui baixar ${url} (HTTP ${resposta.status})`);
        }
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
  // O .svg entra na lista porque o logo da landing está no APP_SHELL: sem ele
  // aqui, o arquivo era baixado e guardado na instalação e mesmo assim toda
  // visita ia buscar na rede -- e sem internet a marca do topo não aparecia.
  if (event.request.method !== "GET" || !url.pathname.match(/\.(html|css|js|json|png|svg)$|\/$/)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
