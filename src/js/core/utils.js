export const C = window.KELASKU_CONFIG;

export function primaryOrigin() {
  return String(C.PRIMARY_ORIGIN || window.location.origin || '').replace(/\/$/, '');
}

export function primaryUrl(path = '/', params = null) {
  const origin = primaryOrigin();
  const cleanPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${String(path || '')}`;
  const url = new URL(cleanPath, `${origin}/`);
  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }
  return url;
}

export function isLegacyFrontendLocation() {
  const legacyOrigin = String(C.LEGACY_ORIGIN || '').replace(/\/$/, '');
  const legacyPath = String(C.LEGACY_BASE_PATH || '').replace(/\/$/, '');
  return Boolean(legacyOrigin && window.location.origin === legacyOrigin && (!legacyPath || window.location.pathname === legacyPath || window.location.pathname.startsWith(`${legacyPath}/`)));
}

export function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

export function svg(id, cls = 'icon') {
  return `<svg class="${cls}" aria-hidden="true"><use href="#${id}"></use></svg>`;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function sameData(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

export function dataSignature(value) {
  try { return JSON.stringify(value); } catch { return String(value ?? ''); }
}

export function randomId(prefix = 'ID', len = 18) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return prefix + '-' + Array.from(bytes, b => chars[b % chars.length]).join('');
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function fmtDate(iso) {
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso || '';
  }
}

export function semverCmp(a, b) {
  const aa = String(a || '0.0.0').split('.').map(Number);
  const bb = String(b || '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (aa[i] || 0) - (bb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

export function toast(message) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function logo(compact = false) {
  return `<div class="brand">
    <img src="assets/brand/logo-mark.svg?v=620" alt="KelasKu">
    <div>
      <div class="brand-word">Kelas<span class="ku">Ku</span></div>
      ${compact ? '' : '<div class="brand-sub">Sistem Komunikasi & Informasi Kelas</div>'}
    </div>
  </div>`;
}
