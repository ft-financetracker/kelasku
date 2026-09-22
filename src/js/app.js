/**
 * KelasKu — Application Entry Point
 * ============================================================
 * Urutan baca yang disarankan untuk belajar:
 * 1. app.js
 * 2. core/state.js
 * 3. core/api.js
 * 4. masing-masing file di screens/
 */

import { state, setSession, clearSession } from './core/state.js';
import { api } from './core/api.js';
import { C, sleep, semverCmp } from './core/utils.js';
import { readBool, writeJson } from './core/storage.js';
import { registerServiceWorker, initInstallCapture, updateApp, shouldShowAppSetup } from './core/pwa.js';
import { registerRoute, go, startRouter } from './core/router.js';

import { renderSplash } from './screens/splash.js';
import { renderOnboarding } from './screens/onboarding.js';
import { renderAuth } from './screens/auth.js';
import { renderProfile } from './screens/profile.js';
import { renderSetup } from './screens/setup.js';
import { renderDashboard } from './screens/dashboard.js';

registerRoute('splash', () => renderSplash());
registerRoute('onboarding', renderOnboarding);
registerRoute('auth', renderAuth);
registerRoute('profile', () => state.sessionToken ? renderProfile() : go('auth'));
registerRoute('setup', () => state.sessionToken ? renderSetup() : go('auth'));
registerRoute('dashboard', () => state.sessionToken ? renderDashboard() : go('auth'));

initInstallCapture();
registerServiceWorker();

async function boot() {
  renderSplash('Menyiapkan KelasKu…');

  const bootstrapPromise = api('bootstrap', {}, { timeout: C.BOOT_TIMEOUT_MS })
    .catch(err => {
      console.warn('Bootstrap:', err);
      return null;
    });

  // Splash terasa halus tapi tidak dibuat menunggu lama.
  await sleep(420);

  if (!state.sessionToken) {
    go(readBool('kelasku_onboarding_completed') ? 'auth' : 'onboarding');
    // Cek versi berjalan di background tanpa membuat user menunggu layar login.
    bootstrapPromise.then(data => {
      if (!data) return;
      applyRemoteConfig(data.config);
      forceUpdateRequired();
    });
    return;
  }

  // Cache lokal dipakai dulu agar aplikasi terasa cepat.
  if (state.user) {
    if (!state.user.profile_complete) go('profile');
    else if (shouldShowAppSetup()) go('setup');
    else go('dashboard');
  }

  const data = await bootstrapPromise;
  if (!data) {
    if (!navigator.onLine && state.dashboard) {
      go('dashboard');
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
  if (data.dashboard) {
    state.dashboard = data.dashboard;
    writeJson('kelasku_dashboard_cache', data.dashboard);
  }

  if (!data.user.profile_complete) go('profile');
  else if (shouldShowAppSetup()) go('setup');
  else go('dashboard');
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
