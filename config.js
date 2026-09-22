/**
 * KelasKu — Frontend Config
 * ============================================================
 * Setelah deploy Apps Script, cukup ganti API_URL di bawah ini.
 * Tidak memakai Google OAuth Client ID.
 */
window.KELASKU_CONFIG = Object.freeze({
  APP_NAME: 'KelasKu',
  APP_VERSION: '1.2.1',
  BUILD: '20260922.004',

  API_URL: 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE',

  API_TIMEOUT_MS: 12000,
  SLOW_REQUEST_MS: 1400,
  BOOT_TIMEOUT_MS: 5000,
  NOTIFICATION_POLL_MS: 60000,
  DASHBOARD_CACHE_MS: 300000
});
