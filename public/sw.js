// Caches static assets for faster loads. Pages and API responses are never cached,
// so signed-out users cannot reopen payroll screens from the cache.
const CACHE_NAME = 'tax-cup-v4';
const ASSETS = [
  'assets/css/app.css',
  'assets/css/site.css',
  'assets/js/app.js',
  'assets/js/tax-engine.js',
  'assets/js/calculator.js',
  'assets/js/company.js',
  'assets/js/landing.js',
  'assets/js/login.js',
  'assets/js/payroll.js',
  'assets/js/team.js',
  'assets/img/tax-cup-logo.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || request.mode === 'navigate' || request.destination === 'document') return;

  // Network first so new deployments show immediately; cache is the offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
