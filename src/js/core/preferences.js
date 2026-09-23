import { state } from './state.js';

export function applyPreferences(settings = state.settings) {
  if (!settings) return;
  state.settings = settings;
  localStorage.setItem('kelasku_settings_cache', JSON.stringify(settings));

  const root = document.documentElement;
  const theme = String(settings.theme || 'SYSTEM').toUpperCase();
  const effectiveTheme = theme === 'SYSTEM'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'LIGHT' : 'DARK')
    : theme;

  root.dataset.theme = effectiveTheme.toLowerCase();
  root.dataset.font = String(settings.font || 'POPPINS').toLowerCase();
  root.dataset.textSize = String(settings.text_size || 'NORMAL').toLowerCase();
  root.dataset.density = String(settings.density || 'COMFORTABLE').toLowerCase();
}
