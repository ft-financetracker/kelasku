/**
 * KelasKu API Bridge
 * ============================================================
 * GitHub Pages dan Apps Script beda origin. Untuk menghindari CORS,
 * request dikirim via hidden FORM POST ke hidden IFRAME.
 * Apps Script membalas lewat parent.postMessage().
 *
 * Keuntungan dibanding JSONP:
 * - password/session TIDAK masuk URL
 * - tidak butuh Google OAuth Client ID
 * - tetap bisa menerima response dari Apps Script
 */

import { state, clearSession } from './state.js';
import { C, randomId, isStandalone } from './utils.js';

export function apiConfigured() {
  return Boolean(C.API_URL && !C.API_URL.includes('PASTE_'));
}

function isAllowedAppsScriptOrigin(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === 'script.google.com' ||
      host === 'script.googleusercontent.com' ||
      host.endsWith('.googleusercontent.com');
  } catch {
    return false;
  }
}

export function api(action, payload = {}, options = {}) {
  if (!apiConfigured()) {
    return Promise.reject(new Error('API_URL belum diatur di config.js'));
  }

  const requestId = randomId('REQ', 20);
  const channel = randomId('CH', 24);
  const frameName = 'kk_frame_' + requestId.replace(/[^A-Za-z0-9_]/g, '');
  const timeoutMs = Number(options.timeout || C.API_TIMEOUT_MS || 12000);

  return new Promise((resolve, reject) => {
    let settled = false;
    const iframe = document.createElement('iframe');
    const form = document.createElement('form');
    const fields = {
      request_id: requestId,
      channel,
      action,
      payload: JSON.stringify(payload || {}),
      client: JSON.stringify({
        version: C.APP_VERSION,
        build: C.BUILD,
        device_id: state.deviceId,
        standalone: isStandalone()
      }),
      session_token: options.auth === false ? '' : (state.sessionToken || '')
    };

    iframe.name = frameName;
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');

    form.method = 'POST';
    form.action = C.API_URL;
    form.target = frameName;
    form.style.display = 'none';

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = String(value == null ? '' : value);
      form.appendChild(input);
    });

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      iframe.remove();
      form.remove();
    };

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const onMessage = event => {
      // Apps Script HtmlService dapat memakai wrapper/nested iframe.
      // Karena itu event.source tidak selalu sama dengan iframe.contentWindow.
      // Keamanan dijaga dengan origin Google + request_id + channel acak.
      if (!isAllowedAppsScriptOrigin(event.origin)) return;
      const data = event.data;
      if (!data || data.__kelasku_api_response !== true) return;
      if (data.request_id !== requestId || data.channel !== channel) return;

      const response = data.response || {};
      if (!response.ok) {
        if (['AUTH_EXPIRED', 'UNAUTHORIZED_SESSION'].includes(response.code)) clearSession();
        finish(reject, new Error(response.message || 'Terjadi kesalahan pada server.'));
        return;
      }

      finish(resolve, response.data);
    };

    const timer = setTimeout(() => {
      finish(reject, new Error('Respons server belum kembali. Jika ini pendaftaran, data mungkin sudah tersimpan — coba Masuk dengan username yang sama.'));
    }, timeoutMs);

    window.addEventListener('message', onMessage);
    document.body.appendChild(iframe);
    document.body.appendChild(form);

    if (typeof options.onSlow === 'function') {
      setTimeout(() => { if (!settled) options.onSlow(); }, Number(C.SLOW_REQUEST_MS || 1400));
    }

    form.submit();
  });
}
