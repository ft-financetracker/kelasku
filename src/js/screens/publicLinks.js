import { api } from '../core/api.js';

const content = document.getElementById('public-links-content');
const params = new URLSearchParams(location.search);
const rawCode = (params.get('c') || '').trim();

const PLATFORM = {
  WHATSAPP: ['WhatsApp', 'chat'],
  ZOOM: ['Zoom', 'videocam'],
  GOOGLE_DRIVE: ['Google Drive', 'folder'],
  GOOGLE_MEET: ['Google Meet', 'video_call'],
  YOUTUBE: ['YouTube', 'smart_display'],
  TELEGRAM: ['Telegram', 'send'],
  WEBSITE: ['Website', 'language'],
  OTHER: ['Lainnya', 'link']
};

const esc = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const classCode = rawCode ? (rawCode.toUpperCase().startsWith('KLS-') ? rawCode.toUpperCase() : 'KLS-' + rawCode.toUpperCase()) : '';

function groupSection(key, items) {
  const [label, icon] = PLATFORM[key] || PLATFORM.OTHER;
  return `<section class="public-link-group"><div class="public-group-head"><span class="material-symbols-rounded">${icon}</span><div><strong>${esc(label)}</strong><small>${items.length} link</small></div></div><div class="public-link-list">${items.map(item => `<a class="public-link-card" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span class="public-link-icon material-symbols-rounded">${icon}</span><span class="public-link-copy"><strong>${esc(item.label)}</strong>${item.description?`<small>${esc(item.description)}</small>`:''}</span><span class="material-symbols-rounded public-link-arrow">arrow_outward</span></a>`).join('')}</div></section>`;
}

function render(data) {
  const cls = data.class || {};
  document.title = `${cls.name || 'Link Kelas'} — KelasKu`;
  const ordered = ['WHATSAPP','ZOOM','GOOGLE_MEET','GOOGLE_DRIVE','YOUTUBE','TELEGRAM','WEBSITE','OTHER'];
  const groups = data.groups || {};
  const sections = ordered.filter(key => Array.isArray(groups[key]) && groups[key].length).map(key => groupSection(key, groups[key])).join('');
  content.innerHTML = `
    <section class="public-hero">
      <span class="public-hero-icon material-symbols-rounded">school</span>
      <div class="public-hero-copy"><span class="public-kicker">LINK RESMI KELAS</span><h1>${esc(cls.name || 'Kelas')}</h1>${cls.description?`<p>${esc(cls.description)}</p>`:''}<div class="public-meta">${cls.institution?`<span>${esc(cls.institution)}</span>`:''}${cls.cohort?`<span>Angkatan ${esc(cls.cohort)}</span>`:''}<span>${esc(cls.class_code || '')}</span></div></div>
    </section>
    ${sections || `<section class="public-empty"><span class="material-symbols-rounded">link_off</span><strong>Belum ada link yang dibagikan</strong><p>Pengelola kelas belum menambahkan link publik.</p></section>`}
    <aside class="public-promo"><div><span class="public-kicker">DIBAGIKAN MELALUI KELASKU</span><strong>Jadwal, tugas, materi, absensi, dan komunikasi kelas dalam satu tempat.</strong></div><a href="./" class="public-promo-btn">Kenal KelasKu <span class="material-symbols-rounded">arrow_forward</span></a></aside>`;
}

function renderError(message) {
  content.innerHTML = `<section class="public-empty error"><span class="material-symbols-rounded">link_off</span><strong>Link kelas tidak tersedia</strong><p>${esc(message || 'Periksa kembali tautan yang dibagikan.')}</p><a href="./" class="public-promo-btn">Buka KelasKu</a></section>`;
}

async function init() {
  if (!classCode) return renderError('Kode kelas tidak ditemukan pada URL.');
  try {
    const data = await api('getPublicClassLinks', { class_code: classCode }, { auth: false, timeout: 20000 });
    render(data);
  } catch (err) {
    renderError(err.message);
  }
}

init();
