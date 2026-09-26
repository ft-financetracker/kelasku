/**
 * KelasKu — Application Entry Point v6.5.2
 * ============================================================
 * Phase 6 memperdalam Academic Workflow: review tugas, analitik absensi, kalender, dan report.
 * Bootstrap tetap compound: config + user + settings + dashboard.
 */

import { state, setSession, setIdentity, clearSession } from './core/state.js';
import { api } from './core/api.js';
import { C, sleep, semverCmp } from './core/utils.js';
import { readBool, writeJson } from './core/storage.js';
import { registerServiceWorker, initInstallCapture, updateApp, shouldShowAppSetup, startUpdateWatcher, checkForAppUpdate, consumeUpdateResult } from './core/pwa.js';
import { registerRoute, go, startRouter, openDeepLink, currentRoute } from './core/router.js';
import { applyPreferences } from './core/preferences.js';

import { renderSplash } from './screens/splash.js';
import { renderOnboarding } from './screens/onboarding.js';
import { renderAuth } from './screens/auth.js';
import { renderProfile } from './screens/profile.js';
import { renderSetup } from './screens/setup.js';
import { renderDashboard } from './screens/dashboard.js';
import { renderAccount } from './screens/account.js';
import { renderSettings } from './screens/settings.js';
import { renderClasses } from './screens/classes.js';
import { renderClassRoom } from './screens/classRoom.js';
import { renderAdmin, renderAdminUsers, renderAdminClasses, renderAdminSystem, renderAdminAudit } from './screens/admin.js';
import { renderSchedule, renderTasks, renderMaterials, renderAnnouncements, renderAttendance } from './screens/academic.js';
import { renderAppInfo } from './screens/appInfo.js';
import { renderAttendanceLanding } from './screens/attendanceLanding.js';
import { renderMessages } from './screens/messages.js';
import { renderNotifications } from './screens/notifications.js';

const authGuard = renderer => () => state.sessionToken ? renderer() : go('auth');

registerRoute('splash', () => renderSplash());
registerRoute('onboarding', renderOnboarding);
registerRoute('auth', renderAuth);
registerRoute('profile', authGuard(renderProfile));
registerRoute('setup', authGuard(renderSetup));
registerRoute('dashboard', authGuard(renderDashboard));
registerRoute('account', authGuard(renderAccount));
registerRoute('settings', authGuard(renderSettings));
registerRoute('app-info', authGuard(renderAppInfo));
registerRoute('classes', authGuard(renderClasses));
registerRoute('class', authGuard(renderClassRoom));
registerRoute('schedule', authGuard(renderSchedule));
registerRoute('tasks', authGuard(renderTasks));
registerRoute('materials', authGuard(renderMaterials));
registerRoute('announcements', authGuard(renderAnnouncements));
registerRoute('attendance', authGuard(renderAttendance));
registerRoute('attendance-link', authGuard(renderAttendanceLanding));
registerRoute('messages', authGuard(renderMessages));
registerRoute('notifications', authGuard(renderNotifications));
function adminGuard(renderer) {
  return () => {
    if (!state.sessionToken) return go('auth');
    if (String(state.user?.global_role || '') !== 'SUPER_ADMIN') return go('dashboard');
    renderer();
  };
}

registerRoute('admin', adminGuard(renderAdmin));
registerRoute('admin-users', adminGuard(renderAdminUsers));
registerRoute('admin-classes', adminGuard(renderAdminClasses));
registerRoute('admin-system', adminGuard(renderAdminSystem));
registerRoute('admin-audit', adminGuard(renderAdminAudit));

// Terapkan cache preference seawal mungkin agar tema/font tidak berkedip.
if (state.settings) applyPreferences(state.settings);

initInstallCapture();
registerServiceWorker();
startUpdateWatcher();

async function boot() {
  renderSplash('Menyiapkan KelasKu…');

  const bootstrapPromise = api('bootstrap', {}, { timeout: C.BOOT_TIMEOUT_MS })
    .catch(err => {
      console.warn('Bootstrap:', err);
      return null;
    });

  await sleep(420);

  if (!state.sessionToken) {
    if (initialUrlRoute && !['auth','onboarding','splash'].includes(initialUrlRoute)) {
      sessionStorage.setItem('kelasku_post_auth_route', initialUrlRoute);
    }
    go(readBool('kelasku_onboarding_completed') ? 'auth' : 'onboarding', { replace: true });
    bootstrapPromise.then(data => {
      if (!data) return;
      applyRemoteConfig(data.config);
      forceUpdateRequired();
    });
    return;
  }

  // Fast cached route: jangan menahan user di splash sambil server merespons.
  if (state.user) routeReadyUser();

  const data = await bootstrapPromise;
  if (!data) {
    if (!navigator.onLine && state.dashboard) {
      routeReadyUser();
      return;
    }
    if (!state.user) {
      clearSession();
      go('auth');
    }
    return;
  }

  applyRemoteConfig(data.config);
  if (forceUpdateRequired()) return;

  if (!data.authenticated) {
    clearSession();
    go('auth');
    return;
  }

  setSession(state.sessionToken, data.user);
  setIdentity(data.identity || null);

  if (data.settings) {
    state.settings = data.settings;
    state.settingsAt = Date.now();
    localStorage.setItem('kelasku_settings_cache_at', String(state.settingsAt));
    applyPreferences(data.settings);
  }

  if (data.dashboard) {
    state.dashboard = data.dashboard;
    writeJson('kelasku_dashboard_cache', data.dashboard);
  }

  // Jangan paksa route ulang setelah bootstrap selesai bila user sudah berpindah
  // ke halaman lain dari cache. Ini mencegah efek 'kedip lalu balik/refresh sendiri'.
  const active = currentRoute();
  if (['splash','auth','profile','setup'].includes(active)) routeReadyUser();
}

function routeReadyUser() {
  if (!state.user) return;
  if (!state.user.profile_complete) return go('profile');
  if (shouldShowAppSetup()) return go('setup');

  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.get('a') || currentUrl.searchParams.get('attendance')) return go('attendance-link');
  const deep = currentUrl.searchParams.get('deep');
  if (deep) {
    currentUrl.searchParams.delete('deep');
    try { window.history.replaceState({}, '', currentUrl.pathname + currentUrl.search); } catch {}
    return openDeepLink(deep);
  }

  const pendingRoute = sessionStorage.getItem('kelasku_post_auth_route') || '';
  if (pendingRoute) {
    sessionStorage.removeItem('kelasku_post_auth_route');
    return go(pendingRoute, { replace: true });
  }
  if (initialUrlRoute && !['splash','auth','onboarding','profile','setup'].includes(initialUrlRoute)) {
    return go(initialUrlRoute, { replace: true });
  }

  const startup = String(state.settings?.startup_page || 'DASHBOARD').toUpperCase();
  if (startup === 'CLASSES') return go('classes');
  if (startup === 'TASKS') return go('tasks');
  if (startup === 'SCHEDULE') return go('schedule');
  if (startup === 'MATERIALS') return go('materials');
  if (startup === 'ATTENDANCE') return go('attendance');
  if (startup === 'MESSAGES') return go('messages');
  return go('dashboard');
}

function applyRemoteConfig(config) {
  if (!config) return;
  state.remoteConfig = config;
  writeJson('kelasku_app_config_cache', config);
  const scale = Math.max(90, Math.min(125, Number(config.ui_text_scale || 100))) / 100;
  document.documentElement.style.setProperty('--kk-admin-text-scale', String(scale));
  document.documentElement.style.setProperty('--kk-admin-font-bump', `${Math.round((scale - 1) * 100) / 10}px`);
  checkForAppUpdate({ notify: true }).catch(() => {});
}

function forceUpdateRequired() {
  const rc = state.remoteConfig;
  if (!rc) return false;

  const belowMin = semverCmp(C.APP_VERSION, rc.min_version) < 0;
  const behindCurrent = semverCmp(C.APP_VERSION, rc.current_version) < 0;
  const required = belowMin || (rc.update_required === true && behindCurrent);
  if (!required) return false;

  document.getElementById('app').innerHTML = `
    <section class="screen">
      <div class="form-card glass">
        <div class="eyebrow">Update Diperlukan</div>
        <h1>KelasKu perlu diperbarui</h1>
        <p class="copy">Versi ${C.APP_VERSION} sudah tidak didukung. Versi terbaru: ${rc.current_version}.</p>
        <button id="force-update" class="btn btn-primary btn-block">Update Sekarang</button>
      </div>
    </section>`;
  document.getElementById('force-update').onclick = updateApp;
  return true;
}

const initialUrlRoute = startRouter();
boot();
window.setTimeout(() => consumeUpdateResult(), 900);
