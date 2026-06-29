/**
 * SmartVest Service Worker
 *
 * Enables PWA install prompt on Android and provides basic offline caching.
 * Caches the app shell (HTML, JS, CSS) so the app loads even without internet.
 * API calls still require internet (live stock data can't be cached long).
 */

const CACHE_NAME = 'smartvest-v1';
const SHELL_URLS = ['/', '/portfolio', '/search', '/watchlist', '/picks'];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_URLS).catch(() => {
        // Don't fail install if some pages can't be cached
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
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

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: always go to network (live data)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Static assets: try network, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline: serve from cache
        return caches.match(event.request).then((cached) => {
          return cached || new Response('Offline — please reconnect to the internet', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        });
      })
  );
});
