/**
 * KelasKu — Application Entry Point v3.0.0
 * ============================================================
 * Phase 3 membuka Academic Core: Pengumuman, Jadwal, Tugas, Materi, dan Absensi.
 * Bootstrap tetap compound: config + user + settings + dashboard.
 */

import { state, setSession, setIdentity, clearSession } from './core/state.js';
import { api } from './core/api.js';
import { C, sleep, semverCmp } from './core/utils.js';
import { readBool, writeJson } from './core/storage.js';
import { registerServiceWorker, initInstallCapture, updateApp, shouldShowAppSetup } from './core/pwa.js';
import { registerRoute, go, startRouter } from './core/router.js';
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

const authGuard = renderer => () => state.sessionToken ? renderer() : go('auth');

registerRoute('splash', () => renderSplash());
registerRoute('onboarding', renderOnboarding);
registerRoute('auth', renderAuth);
registerRoute('profile', authGuard(renderProfile));
registerRoute('setup', authGuard(renderSetup));
registerRoute('dashboard', authGuard(renderDashboard));
registerRoute('account', authGuard(renderAccount));
registerRoute('settings', authGuard(renderSettings));
registerRoute('classes', authGuard(renderClasses));
registerRoute('class', authGuard(renderClassRoom));
registerRoute('schedule', authGuard(renderSchedule));
registerRoute('tasks', authGuard(renderTasks));
registerRoute('materials', authGuard(renderMaterials));
registerRoute('announcements', authGuard(renderAnnouncements));
registerRoute('attendance', authGuard(renderAttendance));
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

async function boot() {
  renderSplash('Menyiapkan KelasKu…');

  const bootstrapPromise = api('bootstrap', {}, { timeout: C.BOOT_TIMEOUT_MS })
    .catch(err => {
      console.warn('Bootstrap:', err);
      return null;
    });

  await sleep(420);

  if (!state.sessionToken) {
    go(readBool('kelasku_onboarding_completed') ? 'auth' : 'onboarding');
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

  routeReadyUser();
}

function routeReadyUser() {
  if (!state.user) return;
  if (!state.user.profile_complete) return go('profile');
  if (shouldShowAppSetup()) return go('setup');

  const startup = String(state.settings?.startup_page || 'DASHBOARD').toUpperCase();
  if (startup === 'CLASSES') return go('classes');
  if (startup === 'TASKS') return go('tasks');
  if (startup === 'SCHEDULE') return go('schedule');
  if (startup === 'MATERIALS') return go('materials');
  if (startup === 'ATTENDANCE') return go('attendance');
  return go('dashboard');
}

function applyRemoteConfig(config) {
  if (!config) return;
  state.remoteConfig = config;
  writeJson('kelasku_app_config_cache', config);
}

function forceUpdateRequired() {
  const rc = state.remoteConfig;
  if (!rc) return false;

  const required = semverCmp(C.APP_VERSION, rc.min_version) < 0 || rc.update_required === true;
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

startRouter();
boot();
