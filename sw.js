// Cache version — increment this whenever you deploy new CSS/HTML/JS changes
const CACHE_NAME = 'tax-cup-milk-v1';
const APP_SHELL = [
  './',
  './index.html',
  './employees.html',
  './company.html',
  './payroll.html',
  './login.html',
  './landing.html',
  './landing.css',
  './landing.js',
  './hero-team.jpg',
  './payroll-executive.jpg',
  './compliance-audit.jpg',
  './styles.css',
  './composition.css',
  './brand.css',
  './tax-bands.css',
  './header-brand.css',
  './report.css',
  './navigation.css',
  './archive.css',
  './employees.css',
  './company.css',
  './company-payroll.css',
  './payroll.css',
  './archive.js',
  './app.js',
  './employees.js',
  './company.js',
  './payroll.js',
  './login.js',
  './tax-cup-logo.svg',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  // Pre-cache app shell and immediately activate the new SW
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete ALL old caches that don't match the current version
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Never intercept API calls — always hit the network
  if (url.pathname.startsWith('/api/')) return;

  // --- NETWORK-FIRST strategy for HTML, CSS and JS files ---
  // This ensures design/code changes are seen immediately without force-refresh.
  const isDocument =
    event.request.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js');

  if (isDocument) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request)) // offline fallback
    );
    return;
  }

  // --- CACHE-FIRST strategy for images and other static assets ---
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
    )
  );
});
