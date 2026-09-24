import { state } from './state.js';
import { C, toast, isStandalone, semverCmp } from './utils.js';
import { readBool, writeBool } from './storage.js';

const SETUP_DONE_KEY = 'kelasku_app_setup_completed';
const PWA_INSTALLED_KEY = 'kelasku_pwa_installed';
const UPDATE_NOTICE_KEY = 'kelasku_update_notice_version';
const UPDATE_PENDING_KEY = 'kelasku_pending_update';
let updateTimer = null;
let updateWatchBound = false;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    state.swReg = await navigator.serviceWorker.register('./service-worker.js');
    state.swReg.update().catch(() => {});
    return state.swReg;
  } catch (err) {
    console.warn('Service Worker:', err);
    return null;
  }
}

export function getAppSetupState() {
  const installed = isStandalone() || readBool(PWA_INSTALLED_KEY);
  const notificationPermission = 'Notification' in window ? Notification.permission : 'unsupported';
  const completed = readBool(SETUP_DONE_KEY);
  return { installed, notificationPermission, completed };
}

export function shouldShowAppSetup() {
  const setup = getAppSetupState();
  if (setup.completed) return false;
  if (setup.installed && setup.notificationPermission === 'granted') {
    writeBool(SETUP_DONE_KEY, true);
    return false;
  }
  return true;
}

export function completeAppSetup() { writeBool(SETUP_DONE_KEY, true); }

export function initInstallCapture() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.installPrompt = event;
    window.dispatchEvent(new Event('kelasku-install-ready'));
  });

  window.addEventListener('appinstalled', async () => {
    writeBool(PWA_INSTALLED_KEY, true);
    toast('KelasKu berhasil dipasang.');
    if ('Notification' in window && Notification.permission === 'granted') {
      writeBool(SETUP_DONE_KEY, true);
      await showSystemNotification('KelasKu siap digunakan','Aplikasi sudah terpasang. Informasi kelasmu kini lebih mudah diakses.','dashboard','install-success');
    }
  });
}

export async function installPWA() {
  if (isStandalone()) {
    writeBool(PWA_INSTALLED_KEY, true);
    toast('KelasKu sudah terpasang.');
    return true;
  }
  if (!state.installPrompt) {
    toast('Menu install belum tersedia. Gunakan menu browser → Install app / Add to Home Screen.');
    return false;
  }
  state.installPrompt.prompt();
  const choice = await state.installPrompt.userChoice;
  state.installPrompt = null;
  if (choice.outcome === 'accepted') {
    writeBool(PWA_INSTALLED_KEY, true);
    if ('Notification' in window && Notification.permission === 'granted') writeBool(SETUP_DONE_KEY, true);
    return true;
  }
  return false;
}

export async function enableNotifications() {
  if (!('Notification' in window)) {
    toast('Browser ini belum mendukung notifikasi.');
    return 'unsupported';
  }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    toast('Notifikasi KelasKu aktif.');
    const setup = getAppSetupState();
    if (setup.installed) writeBool(SETUP_DONE_KEY, true);
    await showSystemNotification('Notifikasi KelasKu aktif','Pengumuman, jadwal, dan informasi penting siap muncul di perangkat ini.','dashboard','notification-enabled');
  }
  return permission;
}

function normalizeDeepLink(url='dashboard') {
  const value=String(url||'dashboard').trim();
  if (/^https?:\/\//i.test(value)) return value;
  const route=value.replace(/^\.\/?#/,'').replace(/^#/,'').replace(/^\//,'') || 'dashboard';
  const target=new URL('./', window.location.href);
  if (route.includes(':')) {
    target.searchParams.set('deep', route);
  } else {
    target.hash=route;
  }
  return target.href;
}

export async function showSystemNotification(title, body, url = 'dashboard', tag = '') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = state.swReg || await navigator.serviceWorker.ready;
  return reg.showNotification(title, {
    body,
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/favicon-64.png',
    tag: tag || undefined,
    renotify: Boolean(tag),
    silent: false,
    vibrate: [120, 60, 120],
    data: { url: normalizeDeepLink(url) }
  });
}

export async function checkForAppUpdate({ notify = true } = {}) {
  let fileConfig = null;
  try {
    const response = await fetch(`./app-version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) fileConfig = await response.json();
  } catch (err) {
    console.warn('Version check:', err);
  }

  const configVersion=String(state.remoteConfig?.current_version || C.APP_VERSION);
  const fileVersion=String(fileConfig?.version || C.APP_VERSION);
  const remoteVersion=semverCmp(configVersion,fileVersion)>=0?configVersion:fileVersion;
  const fromFile=remoteVersion===fileVersion && semverCmp(fileVersion,configVersion)>0;
  const build = String(fromFile ? (fileConfig?.build || '') : (state.remoteConfig?.build || fileConfig?.build || ''));
  const releaseNote = String(fromFile ? (fileConfig?.release_note || 'Pembaruan KelasKu tersedia.') : (state.remoteConfig?.release_note || fileConfig?.release_note || 'Pembaruan KelasKu tersedia.'));
  const available = semverCmp(C.APP_VERSION, remoteVersion) < 0;

  if (available) {
    state.remoteConfig = {
      ...(state.remoteConfig || {}),
      current_version: remoteVersion,
      build: build || state.remoteConfig?.build || '',
      release_note: releaseNote
    };
    localStorage.setItem('kelasku_app_config_cache', JSON.stringify(state.remoteConfig));

    const alreadyNotified = localStorage.getItem(UPDATE_NOTICE_KEY) === remoteVersion;
    if (notify && !alreadyNotified && 'Notification' in window && Notification.permission === 'granted') {
      await showSystemNotification(
        `Update KelasKu v${remoteVersion}`,
        releaseNote,
        'app-info',
        `kelasku-update-${remoteVersion}`
      );
      localStorage.setItem(UPDATE_NOTICE_KEY, remoteVersion);
    }
  }

  window.dispatchEvent(new CustomEvent('kelasku-update-check', { detail: { available, version: remoteVersion, build, releaseNote } }));
  return { available, version: remoteVersion, build, releaseNote };
}

export function startUpdateWatcher() {
  if (updateWatchBound) return;
  updateWatchBound = true;
  const run = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) checkForAppUpdate({ notify: true }).catch(() => {});
  };
  window.addEventListener('focus', run);
  document.addEventListener('visibilitychange', run);
  window.addEventListener('online', run);
  window.setTimeout(run, 1600);
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(run, 15 * 60 * 1000);
}

export async function updateApp() {
  // Jangan sekadar reload: pada PWA, reload bisa masih dikontrol Service Worker lama.
  // Arahkan ke recovery page yang melepas SW/cache lama sebelum memuat build baru.
  let meta = null;
  try { meta = await checkForAppUpdate({ notify: false }); } catch {}

  const targetVersion = String(meta?.version || state.remoteConfig?.current_version || C.APP_VERSION);
  const targetBuild = String(meta?.build || state.remoteConfig?.build || C.BUILD || '');
  try {
    localStorage.setItem(UPDATE_PENDING_KEY, JSON.stringify({
      version: targetVersion,
      build: targetBuild,
      started_at: Date.now()
    }));
  } catch {}

  showUpdateOverlay(targetVersion);

  const recovery = new URL('./update-recovery.html', window.location.href);
  recovery.searchParams.set('v', targetVersion);
  if (targetBuild) recovery.searchParams.set('b', targetBuild);
  recovery.searchParams.set('t', String(Date.now()));
  window.location.replace(recovery.href);
}

function showUpdateOverlay(version) {
  let overlay = document.getElementById('kelasku-update-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'kelasku-update-overlay';
    overlay.className = 'update-progress-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="update-progress-card">
      <span class="update-progress-spinner"></span>
      <strong>Memperbarui KelasKu${version ? ` ke v${version}` : ''}…</strong>
      <p>Membersihkan cache lama dan memuat versi terbaru. Jangan tutup aplikasi.</p>
    </div>`;
}

export function consumeUpdateResult() {
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(UPDATE_PENDING_KEY) || 'null'); } catch {}

  const url = new URL(window.location.href);
  const hadRecoveryParams = url.searchParams.has('_kkv') || url.searchParams.has('_kkb') || url.searchParams.has('_fresh');
  if (hadRecoveryParams) {
    url.searchParams.delete('_kkv');
    url.searchParams.delete('_kkb');
    url.searchParams.delete('_fresh');
    try { window.history.replaceState(window.history.state || {}, '', url.pathname + url.search); } catch {}
  }

  if (!pending) return false;
  const target = String(pending.version || '0.0.0');
  if (semverCmp(C.APP_VERSION, target) >= 0) {
    try { localStorage.removeItem(UPDATE_PENDING_KEY); } catch {}
    window.setTimeout(() => toast(`KelasKu berhasil diperbarui ke v${C.APP_VERSION} ✓`), 500);
    return true;
  }
  return false;
}
