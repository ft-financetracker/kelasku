import { state } from './state.js?v=6742forms1';

let systemThemeBound = false;

export function applyPreferences(settings = state.settings, options = {}) {
  if (!settings) return;
  const persist = options.persist !== false;

  if (persist) {
    state.settings = settings;
    localStorage.setItem('kelasku_settings_cache', JSON.stringify(settings));
  }

  const root = document.documentElement;
  const theme = String(settings.theme || 'DARK').toUpperCase();
  const systemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const effectiveTheme = theme === 'SYSTEM' ? (systemLight ? 'LIGHT' : 'DARK') : theme;

  root.dataset.themePref = theme.toLowerCase();
  root.dataset.theme = effectiveTheme.toLowerCase();
  root.dataset.font = String(settings.font || 'POPPINS').toLowerCase();
  root.dataset.textSize = String(settings.text_size || 'NORMAL').toLowerCase();
  root.dataset.density = String(settings.density || 'COMFORTABLE').toLowerCase();
  root.style.colorScheme = effectiveTheme === 'LIGHT' ? 'light' : 'dark';
  root.style.backgroundColor = effectiveTheme === 'LIGHT' ? '#E7DBCC' : '#06142F';

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effectiveTheme === 'LIGHT' ? '#E7DBCC' : '#0B132B');

  bindSystemTheme();
  return effectiveTheme;
}

export function previewPreferences(partial = {}) {
  const base = state.settings || {
    theme: 'DARK', font: 'POPPINS', text_size: 'NORMAL', density: 'COMFORTABLE'
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
