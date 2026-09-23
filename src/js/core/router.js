/**
 * KelasKu Router v1.3
 * ------------------------------------------------------------
 * Internal screen routing tidak lagi meninggalkan #auth/#setup
 * di URL. Hash lama/deep-link tetap diterima lalu dibersihkan.
 */
const routes = new Map();
let activeRoute = 'splash';

function normalizeRoute(name = '') {
  return String(name)
    .replace(/^.*#/, '')
    .replace(/^\/+/, '')
    .split('/')[0]
    .trim();
}

function cleanUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

function renderRoute(name) {
  const route = normalizeRoute(name) || 'dashboard';
  activeRoute = route;
  const handler = routes.get(route) || routes.get('dashboard');
  if (handler) handler();
}

export function registerRoute(name, handler) {
  routes.set(normalizeRoute(name), handler);
}

export function go(name, options = {}) {
  const route = normalizeRoute(name) || 'dashboard';
  activeRoute = route;

  // Route internal disimpan di History State, bukan URL hash.
  const method = options.push === true ? 'pushState' : 'replaceState';
  try {
    window.history[method]({ kelaskuRoute: route }, '', cleanUrl());
  } catch {}

  renderRoute(route);
}

export function currentRoute() {
  return activeRoute;
}

export function openDeepLink(link = '') {
  const raw = String(link || '').trim();
  if (!raw) return go('dashboard');

  // Deep-link internal tanpa membuat hash URL permanen.
  // Format: class:<class_id>, messages:<class_id>, route biasa.
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
  // Terima link lama seperti /#auth atau /#dashboard, tetapi bersihkan URL
  // sebelum boot supaya refresh/F5 tidak mengunci user ke layar lama.
  const initialHashRoute = normalizeRoute(window.location.hash);
  if (window.location.hash) {
    try {
      window.history.replaceState(
        { kelaskuRoute: initialHashRoute || 'splash' },
        '',
        cleanUrl()
      );
    } catch {}
  }

  window.addEventListener('hashchange', () => {
    const route = normalizeRoute(window.location.hash);
    if (!route) return;
    try {
      window.history.replaceState({ kelaskuRoute: route }, '', cleanUrl());
    } catch {}
    renderRoute(route);
  });

  window.addEventListener('popstate', event => {
    const route = normalizeRoute(event.state?.kelaskuRoute);
    if (route) renderRoute(route);
  });

  return initialHashRoute;
}
