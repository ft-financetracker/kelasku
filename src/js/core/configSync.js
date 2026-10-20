import { state } from './state.js?v=6742forms1';
import { validateNavigation } from './navigationConfig.js?v=6742forms1';

const navigationKeys = ['bottom_navigation','bottom_navigation_revision','bottom_navigation_sequence','navigation_config_version','navigation_sync_supported'];

// Reject an older navigation snapshot without discarding unrelated config fields.
export function receiveAppConfig(incoming, options = {}) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return false;
  const previous = state.remoteConfig || {}, next = {...previous, ...incoming};
  const oldSequence = Math.max(0, Number(previous.bottom_navigation_sequence) || 0);
  const sequence = Math.max(0, Number(incoming.bottom_navigation_sequence) || 0);
  const changedWhileReading = options.expectedRevision !== undefined &&
    String(previous.bottom_navigation_revision || '') !== String(options.expectedRevision || '');
  const invalid = validateNavigation(incoming.bottom_navigation);
  const older = sequence < oldSequence || (changedWhileReading && sequence <= oldSequence &&
    String(incoming.bottom_navigation_revision || '') !== String(previous.bottom_navigation_revision || ''));
  if (invalid || older) {
    for (const key of navigationKeys) {
      if (Object.prototype.hasOwnProperty.call(previous,key)) next[key] = previous[key];
      else delete next[key];
    }
  }
  if (JSON.stringify(previous) === JSON.stringify(next)) return false;
  state.remoteConfig = next;
  try { localStorage.setItem('kelasku_app_config_cache', JSON.stringify(next)); } catch {}
  const scale = Math.max(90, Math.min(125, Number(next.ui_text_scale || 100))) / 100;
  document.documentElement.style.setProperty('--kk-admin-text-scale', String(scale));
  document.documentElement.style.setProperty('--kk-admin-font-bump', `${Math.round((scale-1)*100)/10}px`);
  window.dispatchEvent(new CustomEvent('kelasku-config-updated'));
  return true;
}
