import { state } from './state.js?v=6740forms2';
import { api } from './api.js?v=6740forms2';
import { C } from './utils.js?v=6740forms2';
import { showSystemNotification } from './pwa.js?v=6740forms2';
import { receiveAppConfig } from './configSync.js?v=6740forms2';

let bound = false, inFlight = null, lastOwner = '', lastStarted = -Infinity;
const EVENT_COOLDOWN_MS = 3000;
const visible = () => document.visibilityState !== 'hidden';

export function refreshShellUpdates({showSystem = false, force = false} = {}) {
  const owner = state.sessionToken;
  if (!owner || navigator.onLine === false || !visible()) return Promise.resolve(null);
  if (lastOwner !== owner) { lastOwner = owner; lastStarted = -Infinity; }
  if (inFlight?.owner === owner) return inFlight.promise;
  if (!force && Date.now()-lastStarted < EVENT_COOLDOWN_MS) return Promise.resolve(null);
  lastStarted = Date.now();
  const revision = String(state.remoteConfig?.bottom_navigation_revision || '');
  const userId = String(state.user?.user_id || 'device');
  const request = {owner, promise:null};
  request.promise = Promise.resolve().then(async () => {
    try {
      const data = await api('getNotifications', {limit:20, navigation_sync:1, navigation_revision:revision, navigation_config_version:Number(state.remoteConfig?.navigation_config_version || 0)});
      if (state.sessionToken !== owner) return null;
      if (data?.app_config) receiveAppConfig(data.app_config, {expectedRevision:revision});
      if (!Array.isArray(data?.items)) return null;
      if (JSON.stringify(state.notifications || []) !== JSON.stringify(data.items)) {
        state.notifications = data.items;
        try { localStorage.setItem('kelasku_notification_cache', JSON.stringify(data.items)); } catch {}
        window.dispatchEvent(new CustomEvent('kelasku-notifications-updated',{detail:{items:data.items}}));
      }
      if (showSystem && 'Notification' in window && Notification.permission === 'granted') {
        const key = 'kelasku_system_notified_ids_v2:' + userId;
        let notified;
        try { notified = new Set(JSON.parse(localStorage.getItem(key) || '[]').map(String)); } catch { notified = new Set(); }
        const fresh = data.items.filter(item => {
          const time = new Date(item.created_at || 0).getTime();
          return !item.read_at && Number.isFinite(time) && time > 0 && Date.now()-time <= 12*60*60*1000 && !notified.has(String(item.notification_id));
        }).slice(0,3);
        for (const item of fresh) {
          if (state.sessionToken !== owner) break;
          await showSystemNotification(item.title,item.body,item.deep_link || 'dashboard',item.notification_id);
          notified.add(String(item.notification_id));
        }
        if (state.sessionToken === owner && fresh.length) {
          try { localStorage.setItem(key,JSON.stringify([...notified].slice(-240))); } catch {}
        }
      }
      return data;
    } catch (error) {
      // Keep the last confirmed navigation/notifications; the existing next tick can retry.
      if (state.sessionToken === owner) console.warn('Shell update:', error?.message || error);
      return null;
    } finally { if (inFlight === request) inFlight = null; }
  });
  inFlight = request;
  return request.promise;
}

export function startShellUpdates() {
  if (!state.sessionToken) return;
  if (!bound) {
    bound = true;
    const refresh = () => refreshShellUpdates({showSystem:true});
    window.addEventListener('focus',refresh);
    window.addEventListener('online',refresh);
    document.addEventListener('visibilitychange',refresh);
  }
  refreshShellUpdates({showSystem:true});
  if (state.notificationTimer) return;
  const delay = Math.max(30000, Math.min(300000, Number(state.remoteConfig?.notification_poll_ms || C.NOTIFICATION_POLL_MS || 60000)));
  state.notificationTimer = setInterval(() => refreshShellUpdates({showSystem:true}), delay);
}
