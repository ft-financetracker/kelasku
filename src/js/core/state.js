import { readJson } from './storage.js';
import { randomId } from './utils.js';

function getDeviceId() {
  let id = localStorage.getItem('kelasku_device_id');
  if (!id) {
    id = randomId('DEV', 16);
    localStorage.setItem('kelasku_device_id', id);
  }
  return id;
}

export const state = {
  sessionToken: localStorage.getItem('kelasku_session_token') || '',
  deviceId: getDeviceId(),
  user: readJson('kelasku_user_cache'),
  remoteConfig: readJson('kelasku_app_config_cache'),
  dashboard: readJson('kelasku_dashboard_cache'),
  notifications: readJson('kelasku_notification_cache', []),
  installPrompt: null,
  swReg: null,
  notificationTimer: null,
  authMode: 'login'
};

export function setSession(token, user) {
  state.sessionToken = token || '';
  state.user = user || null;

  if (token) localStorage.setItem('kelasku_session_token', token);
  else localStorage.removeItem('kelasku_session_token');

  if (user) localStorage.setItem('kelasku_user_cache', JSON.stringify(user));
  else localStorage.removeItem('kelasku_user_cache');
}

export function clearSession() {
  setSession('', null);
  state.dashboard = null;
  localStorage.removeItem('kelasku_dashboard_cache');
  if (state.notificationTimer) clearInterval(state.notificationTimer);
  state.notificationTimer = null;
}
