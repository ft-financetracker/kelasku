/**
 * KelasKu Service Worker
 * WAJIB naikkan CACHE_NAME setiap release frontend.
 */
const CACHE_NAME = 'kelasku-v6.5.6-b256-live';
const APP_SHELL = [
  '/',
  '/index.html',
  '/404.html',
  '/robots.txt',
  '/sitemap.xml',
  '/config.js',
  '/manifest.json',
  '/app-version.json',
  '/changelog.json',
  '/update-recovery.html',
  '/links.html',
  '/src/css/public-links.css',
  '/src/js/screens/publicLinks.js',
  '/src/css/app.css',
  '/src/js/app.js',
  '/src/js/core/state.js',
  '/src/js/core/storage.js',
  '/src/js/core/utils.js',
  '/src/js/core/api.js',
  '/src/js/core/pwa.js',
  '/src/js/core/router.js',
  '/src/js/core/appShell.js',
  '/src/js/core/preferences.js',
  '/src/js/core/dialog.js',
  '/src/js/core/media.js',
  '/src/js/core/xlsx.js',
  '/src/js/screens/splash.js',
  '/src/js/screens/onboarding.js',
  '/src/js/screens/auth.js',
  '/src/js/screens/profile.js',
  '/src/js/screens/setup.js',
  '/src/js/screens/dashboard.js',
  '/src/js/screens/academic.js',
  '/src/js/screens/account.js',
  '/src/js/screens/settings.js',
  '/src/js/screens/classes.js',
  '/src/js/screens/classRoom.js',
  '/src/js/screens/admin.js',
  '/src/js/screens/appInfo.js',
  '/src/js/screens/attendanceLanding.js',
  '/src/js/screens/messages.js',
  '/src/js/screens/notifications.js',
  '/assets/brand/logo-mark.svg',
  '/assets/icons/favicon.svg',
  '/assets/icons/favicon-32.png',
  '/assets/icons/favicon-64.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];


const APP_ROUTE_PATHS = new Set([
  '/', '/login', '/lengkapi-profil', '/setup', '/dashboard', '/profil', '/pengaturan', '/tentang',
  '/kelas', '/ruang-kelas', '/jadwal', '/tugas', '/materi', '/pengumuman', '/absensi', '/pesan',
  '/notifikasi', '/admin', '/admin/pengguna', '/admin/kelas', '/admin/sistem', '/admin/audit'
]);

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

  // Recovery update harus selalu dari network agar dapat memutus cache/SW lama.
  if (url.pathname.endsWith('/update-recovery.html')) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // Version/changelog harus network-first agar PWA lama cepat melihat release baru.
  if (url.pathname.endsWith('/app-version.json') || url.pathname.endsWith('/changelog.json')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res && res.ok) caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  if (req.mode === 'navigate') {
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    const isPublicLinks = path.endsWith('/links.html');
    const slug = path.replace(/^\//, '');
    const isPrettyPublicCode = !APP_ROUTE_PATHS.has(path) && slug && !slug.includes('/') && /^[A-Za-z0-9_-]{3,40}$/.test(slug);

    if (isPrettyPublicCode) {
      const target = new URL('/links.html', self.location.origin);
      target.searchParams.set('c', slug);
      event.respondWith(Promise.resolve(Response.redirect(target.href, 302)));
      return;
    }

    // Route aplikasi memakai app-shell cache-first. Ini menghindari round-trip
    // GitHub Pages 404 setiap refresh /dashboard, /jadwal, /tugas, dst.
    if (APP_ROUTE_PATHS.has(path)) {
      event.respondWith(
        caches.match('/index.html').then(async cached => {
          const refresh = fetch('/index.html', { cache: 'no-store' })
            .then(res => {
              if (res && res.ok) caches.open(CACHE_NAME).then(cache => cache.put('/index.html', res.clone()));
              return res;
            })
            .catch(() => null);
          return cached || (await refresh) || caches.match('/index.html');
        })
      );
      return;
    }

    const fallback = isPublicLinks ? '/links.html' : '/index.html';
    event.respondWith(
      fetch(req)
        .then(async res => {
          // GitHub Pages mengembalikan 404 untuk clean SPA path seperti /dashboard.
          // Saat itu gunakan app shell, bukan menampilkan halaman 404 ke pengguna.
          if (!res || !res.ok) return (await caches.match(fallback)) || fetch(fallback, { cache: 'no-store' });
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(fallback, clone));
          return res;
        })
        .catch(async () => (await caches.match(fallback)) || caches.match('/index.html'))
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
    : '/?deep=dashboard';

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
