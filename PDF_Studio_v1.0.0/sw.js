/**
 * PDF Studio - Service Worker (v1.0.0)
 * Offline caching for GitHub Pages PWA support
 */

const CACHE_NAME = 'pdf-studio-v1.0.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './libs/pdf-lib.min.js',
  './libs/pdf.min.js',
  './libs/pdf.worker.min.js',
  './libs/jszip.min.js',
  './js/image-loader.js',
  './js/pdf-loader.js',
  './js/state.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    }).catch(() => {
      // 오프라인 fallback
      return caches.match('./index.html');
    })
  );
});
