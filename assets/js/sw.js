const CACHE_NAME = "v2-savoy-cache"; // Mudei para v2 para forçar atualização
const ASSETS = [
  "../",
  "index.html",
  "../assets/css/estilos.css",
  "../assets/js/script.js",
  "../manifest.json",
  "../assets/images/icon-192.png",
  "../assets/images/icon-512.png",
  "../assets/icons/favicon.ico"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => key !== CACHE_NAME && caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Ignora requisições para Supabase ou Chrome Extensions no cache
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});