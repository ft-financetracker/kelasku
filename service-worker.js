/**
 * KelasKu Service Worker
 * WAJIB naikkan CACHE_NAME setiap release frontend.
 */
const CACHE_NAME = 'kelasku-v6.7.42-forms-v1_2';
const APP_SHELL = [
  '/src/js/app.js?v=6742forms1',
  '/src/js/core/api.js?v=6742forms1',
  '/src/js/core/appShell.js?v=6742forms1',
  '/src/js/core/configSync.js?v=6742forms1',
  '/src/js/core/dialog.js?v=6742forms1',
  '/src/js/core/media.js?v=6742forms1',
  '/src/js/core/navigationConfig.js?v=6742forms1',
  '/src/js/core/notificationSignals.js?v=6742forms1',
  '/src/js/core/preferences.js?v=6742forms1',
  '/src/js/core/pwa.js?v=6742forms1',
  '/src/js/core/router.js?v=6742forms1',
  '/src/js/core/shellInteractions.js?v=6742forms1',
  '/src/js/core/shellUpdates.js?v=6742forms1',
  '/src/js/core/state.js?v=6742forms1',
  '/src/js/core/storage.js?v=6742forms1',
  '/src/js/core/utils.js?v=6742forms1',
  '/src/js/core/xlsx.js?v=6742forms1',
  '/src/js/forms/client.js?v=6742forms1',
  '/src/js/forms/dispatcher.js?v=6742forms1',
  '/src/js/forms/icons.js?v=6742forms1',
  '/src/js/forms/live.js?v=6742forms1',
  '/src/js/forms/model.js?v=6742forms1',
  '/src/js/forms/view.js?v=6742forms1',
  '/src/js/forms/ownerTools.js?v=6742forms1',
  '/src/js/forms/workspace.js?v=6742forms1',
  '/src/js/screens/academic.js?v=6742forms1',
  '/src/js/screens/account.js?v=6742forms1',
  '/src/js/screens/admin.js?v=6742forms1',
  '/src/js/screens/appInfo.js?v=6742forms1',
  '/src/js/screens/attendanceAnalytics.js?v=6742forms1',
  '/src/js/screens/attendanceEnrollment.js?v=6742forms1',
  '/src/js/screens/attendanceHub.js?v=6742forms1',
  '/src/js/screens/attendanceLanding.js?v=6742forms1',
  '/src/js/screens/auth.js?v=6742forms1',
  '/src/js/screens/classAcademicData.js?v=6742forms1',
  '/src/js/screens/classDirectory.js?v=6742forms1',
  '/src/js/screens/classRoom.js?v=6742forms1',
  '/src/js/screens/classes.js?v=6742forms1',
  '/src/js/screens/dashboard.js?v=6742forms1',
  '/src/js/screens/messages.js?v=6742forms1',
  '/src/js/screens/navigationEditor.js?v=6742forms1',
  '/src/js/screens/notifications.js?v=6742forms1',
  '/src/js/screens/onboarding.js?v=6742forms1',
  '/src/js/screens/profile.js?v=6742forms1',
  '/src/js/screens/publicLinks.js?v=6742forms1',
  '/src/js/screens/settings.js?v=6742forms1',
  '/src/js/screens/setup.js?v=6742forms1',
  '/src/js/screens/splash.js?v=6742forms1',
  '/forms-config.js?v=6742forms1',
  '/forms-release.js?v=6742forms1',
  '/src/css/forms-entry.css?v=6742forms1',
  '/src/css/forms.css?v=6742forms1',
  '/src/js/forms/client.js',
  '/src/js/forms/workspace.js',
  '/src/js/forms/model.js',
  '/src/js/forms/view.js',
  '/src/js/forms/icons.js',
  '/src/css/app.css?v=6742forms1',
  '/src/css/enrollment.css?v=6742forms1',
  '/src/css/soft-mocha.css?v=6742forms1',
  '/src/js/core/configSync.js',
  '/src/js/core/shellUpdates.js',

  '/src/css/shell.css?v=6742forms1',
  '/src/css/navigation-editor.css',
  '/src/css/navigation-editor.css?v=6742forms1',
  '/src/js/core/navigationConfig.js',
  '/src/js/screens/navigationEditor.js',

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
  '/src/css/shell.css',
  '/src/css/attendance.css',
  '/src/css/attendance.css?v=6742forms1',
  '/src/css/classes.css',
  '/src/css/classes.css?v=6742forms1',
  '/src/js/app.js',
  '/src/js/core/state.js',
  '/src/js/core/storage.js',
  '/src/js/core/utils.js',
  '/src/js/core/api.js',
  '/src/js/core/pwa.js',
  '/src/js/core/router.js',
  '/src/js/core/appShell.js',
  '/src/js/core/shellInteractions.js',
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
  '/src/js/screens/classAcademicData.js',
  '/src/js/screens/attendanceAnalytics.js',
  '/src/js/screens/attendanceHub.js',
  '/src/js/screens/account.js',
  '/src/js/screens/settings.js',
  '/src/js/screens/classes.js',
  '/src/js/screens/classDirectory.js',
  '/src/js/screens/classRoom.js',
  '/src/js/screens/admin.js',
  '/src/js/screens/appInfo.js',
  '/src/js/screens/attendanceLanding.js',
  '/src/js/screens/messages.js',
  '/src/js/screens/notifications.js',
  '/assets/brand/logo-mark.svg',
  '/assets/brand/logo-lockup-latest.svg',
  '/assets/public/hero-access.webp',
  '/assets/public/hero-links.webp',
  '/assets/public/hero-showcase.webp',
  '/assets/public/campus-landscape-desktop.png',
  '/assets/public/campus-landscape-mobile.png',
  '/assets/classroom/hero-room-default-desktop.jpg',
  '/assets/classroom/hero-room-default-mobile.jpg',
  '/assets/icons/favicon.svg',
  '/assets/icons/favicon-32.png',
  '/assets/icons/favicon-64.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];


const APP_ROUTE_PATHS = new Set([
  '/', '/login', '/lengkapi-profil', '/setup', '/dashboard', '/profil', '/pengaturan', '/tentang',
  '/kelas', '/join', '/ruang-kelas', '/jadwal', '/tugas', '/materi', '/pengumuman', '/absensi', '/pesan',
  '/admin/navigasi', '/formulir', '/notifikasi', '/admin', '/admin/pengguna', '/admin/kelas', '/admin/sistem', '/admin/audit'
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

  if (req.method !== 'GET') return;
  if (url.pathname === '/forms-config.js') { event.respondWith(fetch(req, {cache:'no-store'}).catch(()=>caches.match(req))); return; }

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

    // Refresh/direct navigation harus network-first agar build baru langsung terambil.
    // Cache tetap menjadi fallback offline, sehingga PWA tidak perlu dihapus untuk update.
    if (APP_ROUTE_PATHS.has(path)) {
      event.respondWith((async()=>{
        try {
          const fresh = await fetch('/index.html', { cache: 'no-store' });
          if (fresh && fresh.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put('/index.html', fresh.clone()));
            return fresh;
          }
        } catch {}
        return (await caches.match('/index.html')) || Response.error();
      })());
      return;
    }

    const fallback = isPublicLinks ? '/links.html' : null;
    if (!fallback) { event.respondWith(fetch(req).catch(()=>Response.error())); return; }
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
        .catch(async () => (await caches.match(fallback)) || Response.error())
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

