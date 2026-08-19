// GymLog — service worker: la app funciona 100% offline y se actualiza sola.
// Estrategia: stale-while-revalidate. Sirve del cache al instante (rápido y sin conexión)
// y en paralelo baja la versión nueva para el próximo arranque.
const CACHE = 'gymlog-v3';
const ASSETS = ['./','./index.html','./style.css','./app.js','./data.js','./manifest.webmanifest',
  './icon.svg','./icon-180.png','./icon-512.png','./icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll falla entero si un asset no está; se agregan de a uno para no romper la instalación.
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req, { ignoreSearch: true }).then(hit => {
        const red = fetch(req)
          .then(res => {
            // Solo se cachean respuestas válidas: un 404 no debe quedar guardado para siempre.
            if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);

        if (hit) { e.waitUntil(red); return hit; }

        return red.then(res =>
          res || cache.match('./index.html').then(idx =>
            idx || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
          )
        );
      })
    )
  );
});
