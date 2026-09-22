import { state } from './state.js';
import { C, toast, isStandalone } from './utils.js';
import { readBool, writeBool } from './storage.js';

const SETUP_DONE_KEY = 'kelasku_app_setup_completed';
const PWA_INSTALLED_KEY = 'kelasku_pwa_installed';

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
  const notificationPermission = 'Notification' in window
    ? Notification.permission
    : 'unsupported';
  const completed = readBool(SETUP_DONE_KEY);

  return { installed, notificationPermission, completed };
}

/**
 * Setup adalah status PERANGKAT, bukan status login user.
 * Sekali user memilih selesai/lewati, login berikutnya langsung Dashboard.
 */
export function shouldShowAppSetup() {
  const setup = getAppSetupState();
  if (setup.completed) return false;

  // Recovery untuk user versi lama yang sudah install + izinkan notif,
  // tetapi flag setup belum sempat tersimpan.
  if (setup.installed && setup.notificationPermission === 'granted') {
    writeBool(SETUP_DONE_KEY, true);
    return false;
  }

  return true;
}

export function completeAppSetup() {
  writeBool(SETUP_DONE_KEY, true);
}

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
      await showSystemNotification(
        'KelasKu siap digunakan',
        'Aplikasi sudah terpasang. Informasi kelasmu kini lebih mudah diakses.',
        '#dashboard',
        'install-success'
      );
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
    // appinstalled biasanya ikut terpanggil, marker ini menjadi fallback cepat.
    writeBool(PWA_INSTALLED_KEY, true);
    if ('Notification' in window && Notification.permission === 'granted') {
      writeBool(SETUP_DONE_KEY, true);
    }
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
    await showSystemNotification(
      'Notifikasi KelasKu aktif',
      'Pengumuman, jadwal, dan informasi penting siap muncul di perangkat ini.',
      '#dashboard',
      'notification-enabled'
    );
  }
  return permission;
}

export async function showSystemNotification(title, body, url = '#dashboard', tag = '') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = state.swReg || await navigator.serviceWorker.ready;
  return reg.showNotification(title, {
    body,
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/icon-192.png',
    tag: tag || undefined,
    data: { url }
  });
}

export async function updateApp() {
  try {
    const reg = state.swReg || await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('kelasku-')).map(k => caches.delete(k)));
  } catch (err) {
    console.warn('Update app:', err);
  }
  window.location.reload();
}
