/**
 * KelasKu Router v1.4 — Custom Domain / Clean Path
 * ------------------------------------------------------------
 * Primary routes memakai clean path pada https://klasku.my.id.
 * Hash/deep-link lama tetap diterima untuk backward compatibility.
 * GitHub Pages direct-refresh dipulihkan melalui /404.html -> ?_route=.
 */
const routes = new Map();
let activeRoute = 'splash';

const ROUTE_PATHS = Object.freeze({
  onboarding: '/',
  auth: '/login',
  profile: '/lengkapi-profil',
  setup: '/setup',
  dashboard: '/dashboard',
  account: '/profil',
  settings: '/pengaturan',
  'app-info': '/tentang',
  classes: '/kelas',
  class: '/ruang-kelas',
  schedule: '/jadwal',
  tasks: '/tugas',
  materials: '/materi',
  announcements: '/pengumuman',
  attendance: '/absensi',
  'attendance-link': '/absensi',
  messages: '/pesan',
  notifications: '/notifikasi',
  admin: '/admin',
  'admin-users': '/admin/pengguna',
  'admin-classes': '/admin/kelas',
  'admin-system': '/admin/sistem',
  'admin-audit': '/admin/audit'
});
const PATH_ROUTES = new Map();
Object.entries(ROUTE_PATHS).forEach(([route, path]) => {
  const key = path.toLowerCase();
  if (!PATH_ROUTES.has(key)) PATH_ROUTES.set(key, route);
});

function normalizeRoute(name = '') {
  return String(name)
    .replace(/^.*#/, '')
    .replace(/^\/+/, '')
    .split('/')[0]
    .trim();
}

function normalizedPath(pathname = window.location.pathname) {
  let path = String(pathname || '/').replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

export function routePath(name = '') {
  const route = normalizeRoute(name) || 'dashboard';
  return ROUTE_PATHS[route] || '/dashboard';
}

export function routeFromPath(pathname = window.location.pathname) {
  return PATH_ROUTES.get(normalizedPath(pathname).toLowerCase()) || '';
}

export function isKnownRoute(name = '') {
  return routes.has(normalizeRoute(name));
}

function urlForRoute(route) {
  const url = new URL(window.location.href);
  url.pathname = routePath(route);
  url.hash = '';
  url.searchParams.delete('_route');
  return `${url.pathname}${url.search}`;
}

function renderRoute(name) {
  const route = normalizeRoute(name) || 'dashboard';
  activeRoute = route;
  const handler = routes.get(route) || routes.get('dashboard');
  if (handler) handler();
  syncCanonical(route);
}

function syncCanonical(route) {
  const primary = String(window.KELASKU_CONFIG?.PRIMARY_ORIGIN || window.location.origin || '').replace(/\/$/, '');
  if (!primary) return;
  const canonical = `${primary}${routePath(route)}`;
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = canonical;
  const og = document.querySelector('meta[property="og:url"]');
  if (og) og.setAttribute('content', canonical);
}

export function registerRoute(name, handler) {
  routes.set(normalizeRoute(name), handler);
}

export function go(name, options = {}) {
  const route = normalizeRoute(name) || 'dashboard';
  const sameRoute = route === activeRoute;
  activeRoute = route;

  // Navigasi pengguna masuk browser history agar Back/Forward bekerja.
  // Replace dipakai untuk bootstrap/guard atau saat route memang sama.
  const replace = options.replace === true || sameRoute || options.push === false;
  const method = replace ? 'replaceState' : 'pushState';
  try {
    window.history[method]({ kelaskuRoute: route }, '', urlForRoute(route));
  } catch {}

  renderRoute(route);
}

export function currentRoute() {
  return activeRoute;
}

export function openDeepLink(link = '') {
  const raw = String(link || '').trim();
  if (!raw) return go('dashboard');

  if (raw.startsWith('class:')) {
    const classId = raw.split(':')[1] || '';
    if (classId) {
      sessionStorage.setItem('kelasku_selected_class', classId);
      return go('class');
    }
  }
  if (raw.startsWith('messages:')) {
    const classId = raw.split(':')[1] || '';
    if (classId) sessionStorage.setItem('kelasku_message_class', classId);
    return go('messages');
  }

  const route = normalizeRoute(raw) || 'dashboard';
  go(routes.has(route) ? route : 'dashboard');
}

export function startRouter() {
  const url = new URL(window.location.href);
  const recoveredRoute = normalizeRoute(url.searchParams.get('_route') || '');
  const hashRoute = normalizeRoute(window.location.hash);
  const pathRoute = routeFromPath(url.pathname);
  const initialRoute = recoveredRoute || hashRoute || pathRoute || '';

  // Hapus parameter recovery/hash lama tanpa menghilangkan query penting
  // seperti attendance/deep.
  if (recoveredRoute) url.searchParams.delete('_route');
  if (window.location.hash) url.hash = '';
  if (initialRoute) {
    activeRoute = initialRoute;
    try {
      url.pathname = routePath(initialRoute);
      window.history.replaceState({ kelaskuRoute: initialRoute }, '', url.pathname + url.search);
    } catch {}
  }

  window.addEventListener('hashchange', () => {
    const route = normalizeRoute(window.location.hash);
    if (!route) return;
    try {
      const clean = new URL(window.location.href);
      clean.hash = '';
      clean.pathname = routePath(route);
      window.history.replaceState({ kelaskuRoute: route }, '', clean.pathname + clean.search);
    } catch {}
    renderRoute(route);
  });

  window.addEventListener('popstate', event => {
    const route = normalizeRoute(event.state?.kelaskuRoute) || routeFromPath(window.location.pathname);
    if (route) renderRoute(route);
  });

  return initialRoute;
}
