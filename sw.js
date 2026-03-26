const CACHE_NAME = 'sendlog-v3';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'app_icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Skip caching for external API calls (Dreamlo/Codetabs)
  if (event.request.url.includes('api.codetabs.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cacheResponse) => {
      if (cacheResponse) return cacheResponse;
      
      return fetch(event.request).then((networkResponse) => {
        // Fallback to index.html for 404 navigations
        if (!networkResponse.ok && event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
        return networkResponse;
      }).catch(() => {
        // Fallback to index.html for offline navigations
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
        // Let other requests fail naturally
      });
    })
  );
});
