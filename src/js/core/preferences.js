import { state } from './state.js';

let systemThemeBound = false;

export function applyPreferences(settings = state.settings, options = {}) {
  if (!settings) return;
  const persist = options.persist !== false;

  if (persist) {
    state.settings = settings;
    localStorage.setItem('kelasku_settings_cache', JSON.stringify(settings));
  }

  const root = document.documentElement;
  const theme = String(settings.theme || 'SYSTEM').toUpperCase();
  const systemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const effectiveTheme = theme === 'SYSTEM' ? (systemLight ? 'LIGHT' : 'DARK') : theme;

  root.dataset.themePref = theme.toLowerCase();
  root.dataset.theme = effectiveTheme.toLowerCase();
  root.dataset.font = String(settings.font || 'POPPINS').toLowerCase();
  root.dataset.textSize = String(settings.text_size || 'NORMAL').toLowerCase();
  root.dataset.density = String(settings.density || 'COMFORTABLE').toLowerCase();
  root.style.colorScheme = effectiveTheme === 'LIGHT' ? 'light' : 'dark';

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effectiveTheme === 'LIGHT' ? '#F4FAFF' : '#0B132B');

  bindSystemTheme();
  return effectiveTheme;
}

export function previewPreferences(partial = {}) {
  const base = state.settings || {
    theme: 'SYSTEM', font: 'POPPINS', text_size: 'NORMAL', density: 'COMFORTABLE'
  };
  return applyPreferences({ ...base, ...partial }, { persist: false });
}

function bindSystemTheme() {
  if (systemThemeBound) return;
  systemThemeBound = true;
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const handler = () => {
    if (String(state.settings?.theme || 'SYSTEM').toUpperCase() === 'SYSTEM') applyPreferences(state.settings);
  };
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else if (mq.addListener) mq.addListener(handler);
}
