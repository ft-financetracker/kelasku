const routes = new Map();

export function registerRoute(name, handler) {
  routes.set(name, handler);
}

export function go(name) {
  window.location.hash = name.startsWith('#') ? name : `#${name}`;
}

export function currentRoute() {
  return (window.location.hash || '#splash').replace(/^#/, '').split('/')[0];
}

export function renderCurrentRoute() {
  const name = currentRoute();
  const handler = routes.get(name) || routes.get('dashboard');
  if (handler) handler();
}

export function startRouter() {
  window.addEventListener('hashchange', renderCurrentRoute);
  renderCurrentRoute();
}
