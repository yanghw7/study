const CACHE = 'gongbujang-v10-6-study';
const APP_SHELL = [
  '/study/',
  '/study/index.html',
  '/study/manifest.webmanifest',
  '/study/icons/icon-192.png',
  '/study/icons/icon-512.png',
  '/study/icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept Supabase/Auth requests.
  if (url.hostname.endsWith('supabase.co')) return;

  // Navigation: prefer fresh deploy, fall back to cached app.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put('/study/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/study/index.html'))
    );
    return;
  }

  // Cache same-origin static files; leave external libraries/fonts to the network.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached =>
        cached || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
          return res;
        })
      )
    );
  }
});
