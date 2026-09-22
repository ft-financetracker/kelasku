import { state } from './state.js';
import { C, toast, isStandalone } from './utils.js';
import { writeBool } from './storage.js';

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

export function initInstallCapture() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.installPrompt = event;
    window.dispatchEvent(new Event('kelasku-install-ready'));
  });

  window.addEventListener('appinstalled', async () => {
    writeBool('kelasku_pwa_installed', true);
    toast('KelasKu berhasil dipasang.');
    if ('Notification' in window && Notification.permission === 'granted') {
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
    writeBool('kelasku_pwa_installed', true);
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
  return choice.outcome === 'accepted';
}

export async function enableNotifications() {
  if (!('Notification' in window)) {
    toast('Browser ini belum mendukung notifikasi.');
    return 'unsupported';
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await showSystemNotification(
      'Notifikasi KelasKu aktif',
      'Pengumuman dan informasi penting bisa tampil di perangkatmu selama aplikasi aktif.',
      '#dashboard',
      'notification-enabled'
    );
  }
  return permission;
}

export async function showSystemNotification(title, body, hash = '#dashboard', tag = 'kelasku-info') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = state.swReg || await navigator.serviceWorker.ready;
  await reg.showNotification(title, {
    body,
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/icon-192.png',
    tag,
    data: { url: `./${hash}` }
  });
}

export async function updateApp() {
  try {
    if (state.swReg) await state.swReg.update();
  } finally {
    window.location.reload();
  }
}
