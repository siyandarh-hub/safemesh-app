/* SafeMesh service worker — offline shell only; API always network */
const CACHE = 'safemesh-shell-v2.4.1';
const SHELL = ['/', '/index.html', '/app.js', '/app.css', '/tailwind.css', '/vendor/leaflet.js', '/vendor/leaflet.css', '/vendor/leaflet-heat.js', '/manifest.json', '/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never touch cross-origin requests (e.g. OpenStreetMap tiles): let the page load them directly
  if (url.origin !== self.location.origin) return;
  // Never cache API or uploads
  if (url.pathname.startsWith('/api')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        if (res.ok && (url.origin === self.location.origin)) {
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || (event.request.mode === 'navigate' ? caches.match('/index.html').then(x => x || caches.match('/offline.html')) : undefined)))
  );
});
