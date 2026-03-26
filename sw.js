const CACHE_NAME = 'sendlog-v2';
const ASSETS = [
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
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cacheResponse) => {
      if (cacheResponse) return cacheResponse;
      
      return fetch(event.request).then((networkResponse) => {
        // If navigation fails (like a 404 on the old filename), fallback to index.html
        if (!networkResponse.ok && event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
        return networkResponse;
      }).catch(() => {
        // If network is down and it's a navigation, fallback to index.html
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});
