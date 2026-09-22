/**
 * KelasKu Service Worker
 * WAJIB naikkan CACHE_NAME setiap release frontend.
 */
const CACHE_NAME = 'kelasku-v1.3.0-b001';
const APP_SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './src/css/app.css',
  './src/js/app.js',
  './src/js/core/state.js',
  './src/js/core/storage.js',
  './src/js/core/utils.js',
  './src/js/core/api.js',
  './src/js/core/pwa.js',
  './src/js/core/router.js',
  './src/js/screens/splash.js',
  './src/js/screens/onboarding.js',
  './src/js/screens/auth.js',
  './src/js/screens/profile.js',
  './src/js/screens/setup.js',
  './src/js/screens/dashboard.js',
  './assets/brand/logo-mark.svg',
  './assets/icons/favicon.svg',
  './assets/icons/favicon-32.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Jangan ikut campur request lintas domain / Apps Script.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.ok) caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : './#dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
