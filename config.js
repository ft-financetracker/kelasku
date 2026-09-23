/**
 * KelasKu — Frontend Config
 * ============================================================
 * Setelah deploy Apps Script, cukup ganti API_URL di bawah ini.
 * Tidak memakai Google OAuth Client ID.
 */
window.KELASKU_CONFIG = Object.freeze({
  APP_NAME: 'KelasKu',
  APP_VERSION: '5.0.0',
  BUILD: '20260923.060',

  API_URL: 'https://script.google.com/macros/s/AKfycbyIsv19DU3M-zWu2HCvDvRQgYbstNy1wHF-8ehaMh0OnQ8ousYswuGmsz23S_QD2FRH/exec',

  API_TIMEOUT_MS: 20000,
  SLOW_REQUEST_MS: 850,
  BOOT_TIMEOUT_MS: 5000,
  NOTIFICATION_POLL_MS: 60000,
  DASHBOARD_CACHE_MS: 300000
});
