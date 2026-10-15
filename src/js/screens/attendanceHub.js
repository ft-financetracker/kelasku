/** Personal attendance presentation. Reuses getAcademicHub; no network requests. */
import { esc } from '../core/utils.js';

const PAGE_SIZE = 12;
const VIEWS = [
  ['sessions', 'calendar', 'Daftar Sesi', 'Daftar Sesi'],
  ['recap', 'check', 'Rekap Kehadiran', 'Rekap'],
  ['courses', 'book', 'Rekap per Mata Pelajaran', 'Per Mapel'],
  ['analytics', 'chart', 'Analitik', 'Analitik']
];
const STATUS_LABELS = { PRESENT:'Hadir', SICK:'Sakit', PERMIT:'Izin', ABSENT:'Alpa', UNMARKED:'Belum' };
let activeView = 'sessions';
const pages = new Map();
const expanded = new Map();

function icon(name) {
  const paths = {
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 11h18M8 15h2m4 0h2m-8 3h2"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v2"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    book:'<path d="M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3V4Zm9 2v15"/>',
    chart:'<path d="M4 20h17M6 16v-5m6 5V5m6 11V8"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    chevron:'<path d="m7 10 5 5 5-5"/>',
    arrow:'<path d="m9 5 7 7-7 7"/>',
    school:'<path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v6c4 3 8 3 12 0v-6m4-2v7"/>',
    link:'<path d="m10 13 4-4m-5 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
    video:'<rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 10 6-4v12l-6-4"/>',
    location:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    filter:'<path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z"/>'
  };
  return `<svg class="att-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}

function ms(value) { const n = new Date(value || '').getTime(); return Number.isFinite(n) ? n : 0; }
function dateText(value, options) {
  if (!ms(value)) return '—';
  return new Intl.DateTimeFormat('id-ID', { timeZone:'Asia/Jakarta', ...options }).format(new Date(value));
}
function startOf(item) { return item.schedule_start_at || item.start_at; }
function statusOf(item) {
  const key = String(item.my_status || 'UNMARKED').toUpperCase();
  return Object.hasOwn(STATUS_LABELS, key) ? key : 'UNMARKED';
}

export function attendanceWindow(item, now = Date.now()) {
  const value = String(item.window_status || '').toUpperCase();
  const close = ms(item.close_at || item.end_at);
  if (['OPEN', 'LATE'].includes(value) && close && now >= close) return 'CLOSED';
  return value || (ms(item.open_at || startOf(item)) > now ? 'UPCOMING' : 'CLOSED');
}

export function attendanceState(item, now = Date.now()) {
  const status = statusOf(item);
  const window = attendanceWindow(item, now);
  if (status !== 'UNMARKED') return {
    group:'done', status, window,
    tone:status === 'PRESENT' ? 'green' : status === 'ABSENT' ? 'red' : 'amber',
    label:status === 'PRESENT' ? 'Sudah Presensi' : STATUS_LABELS[status],
    detail:status === 'PRESENT' ? `Hadir${item.my_channel ? ` · ${channelLabel(item.my_channel)}` : ''}` : 'Kehadiran sudah dicatat',
    icon:status === 'PRESENT' ? 'check' : 'info', canCheckIn:false
  };
  if (window === 'UPCOMING') return { group:'upcoming', status, window, tone:'muted', label:'Belum Dibuka', detail:'Sesi belum aktif', icon:'lock', canCheckIn:false };
  const manual = item.self_checkin_enabled === false || String(item.entry_mode || '').toUpperCase() === 'MANUAL';
  return { group:'pending', status, window, tone:'amber', label:'Belum Presensi',
    detail:manual ? 'Dicatat oleh pengajar' : ['OPEN','LATE'].includes(window) ? (window === 'LATE' ? 'Masih dapat mengisi · terlambat' : 'Presensi sedang dibuka') : 'Waktu presensi ditutup',
    icon:'clock', canCheckIn:!manual && ['OPEN','LATE'].includes(window) && Boolean(item.public_token) };
}

/** Same C6 rule: future unmarked sessions are excluded from the denominator. */
export function attendanceSummary(items = [], now = Date.now()) {
  const out = { total:items.length, done:0, pending:0, upcoming:0, closed:0, progressed:0, PRESENT:0, SICK:0, PERMIT:0, ABSENT:0, UNMARKED:0, rate:0 };
  items.forEach(item => {
    const ui = attendanceState(item, now);
    out[ui.group]++;
    if (ui.group === 'pending' && !['OPEN','LATE'].includes(ui.window)) out.closed++;
    const start = ms(startOf(item));
    if (ui.status !== 'UNMARKED' || (start ? start <= now : ui.window !== 'UPCOMING')) {
      out.progressed++;
      out[ui.status]++;
    }
  });
  out.rate = out.progressed ? Math.round(out.PRESENT / out.progressed * 1000) / 10 : 0;
  return out;
}

export function resetAttendancePages() { pages.clear(); }

export function attendanceTabsHtml() {
  return `<nav id="attendance-tabs" class="att-tabs" role="tablist" aria-label="Tampilan absensi">${VIEWS.map(([key, symbol, label, short]) => `<button type="button" id="att-tab-${key}" role="tab" aria-selected="${activeView === key}" aria-controls="academic-slot" tabindex="${activeView === key ? '0' : '-1'}" data-att-view="${key}" class="att-tab ${activeView === key ? 'active' : ''}">${icon(symbol)}<span class="att-tab-long">${label}</span><span class="att-tab-short">${short}</span></button>`).join('')}</nav>`;
}

function semesterLabel(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /^\d+$/.test(text) ? `Semester ${text.padStart(2, '0')}` : text;
}

export function attendanceOverviewHtml(items, context = {}) {
  const summary = attendanceSummary(items);
  const c = context.classInfo || {};
  const totalClasses = new Set(items.map(x => String(x.class_id))).size;
  const totalCourses = new Set(items.map(x => x.attendance_course_key)).size;
  const title = c.name || (totalClasses === 1 ? items[0]?.class_name : '') || 'Absensi Kelas';
  const semester = semesterLabel(c.semester);
  const desktop = context.heroDesktop || 'assets/classroom/hero-room-default-desktop.jpg?v=6739';
  const mobile = context.heroMobile || 'assets/classroom/hero-room-default-mobile.jpg?v=6739';
  const cards = [
    ['green','users',summary.done,'Sudah Presensi',summary.done ? 'Kehadiran sudah dicatat' : 'Belum ada presensi tercatat'],
    ['amber','clock',summary.pending,'Belum Presensi',summary.closed ? `${summary.closed} sesi sudah ditutup` : 'Sesi yang perlu diisi'],
    ['gold','book',summary.upcoming,'Belum Dibuka','Sesi mendatang'],
    ['cyan','calendar',summary.total,'Total Sesi',semester || `${totalClasses} kelas`]
  ];
  return `<header class="att-hero">
    <picture class="att-hero-picture" aria-hidden="true"><source media="(max-width:600px)" srcset="${esc(mobile)}"><img src="${esc(desktop)}" alt="" decoding="async" fetchpriority="low"></picture>
    <div class="att-hero-shade" aria-hidden="true"></div>
    ${c.cover_url ? `<div class="att-identity"><img src="${esc(c.cover_url)}" alt="Identitas ${esc(title)}" decoding="async"></div>` : `<span class="att-identity att-identity-default">${icon('school')}</span>`}
    <div class="att-hero-copy"><span class="att-eyebrow">ABSENSI KELAS</span><h1>${esc(title)}</h1><p class="att-hero-meta">${totalCourses} mata pelajaran/kegiatan${semester ? ` · ${esc(semester)}` : totalClasses > 1 ? ` · ${totalClasses} kelas` : ''}</p><p class="att-hero-description">Kelola dan lakukan presensi untuk setiap sesi pembelajaran.</p></div>
    ${semester ? `<span class="att-semester">${esc(semester)}</span>` : ''}
  </header>
  <div class="att-metrics" aria-label="Komposisi sesi pada filter aktif">${cards.map(([tone, symbol, count, label, help]) => {
    const percent = summary.total ? Math.round(count / summary.total * 100) : 0;
    return `<article class="att-metric att-tone-${tone}" title="${esc(help)}"><span class="att-metric-icon">${icon(symbol)}</span><div class="att-metric-copy"><strong>${count}</strong><span>${label}</span></div><div class="att-metric-progress"><span class="att-progress-track"><i style="width:${percent}%"></i></span><small>${percent}%</small></div></article>`;
  }).join('')}</div><p class="att-scope-note">Data kehadiran pribadi · Persentase kartu menunjukkan komposisi total sesi.</p>`;
}

function grouped(items, byCourse = false) {
  const map = new Map();
  items.forEach(item => {
    const key = String(byCourse ? item.attendance_course_key : item.class_id || 'UNKNOWN');
    if (!map.has(key)) map.set(key, { key, name:byCourse ? item.attendance_course_title : item.class_name || 'KelasKu', className:item.class_name || 'KelasKu', items:[] });
    map.get(key).items.push(item);
  });
  return [...map.values()].sort((a,b) => String(a.name).localeCompare(String(b.name), 'id'));
}

function emptyHtml() {
  return `<div class="att-empty">${icon('calendar')}<h2>Tidak ada sesi pada filter ini</h2><p>Coba kata pencarian lain atau pilih semua kelas dan mata pelajaran.</p></div>`;
}

export function attendanceContentHtml(items) {
  if (!items.length) return emptyHtml();
  if (activeView === 'recap') return recapHtml(items, false);
  if (activeView === 'courses') return recapHtml(items, true);
  if (activeView === 'analytics') return analyticsHtml(items);
  return `<div class="att-class-list">${grouped(items).map((group, index) => {
    const summary = attendanceSummary(group.items);
    const courses = new Set(group.items.map(x => x.attendance_course_key)).size;
    const isOpen = expanded.has(group.key) ? expanded.get(group.key) : true;
    const pageCount = Math.max(1, Math.ceil(group.items.length / PAGE_SIZE));
    const page = Math.min(pages.get(group.key) || 1, pageCount);
    const ordered = [...group.items].sort((a,b) => {
      const rank = item => { const ui = attendanceState(item); return ui.canCheckIn ? 0 : ui.group === 'done' ? 1 : ui.group === 'upcoming' ? 2 : 3; };
      const byRank = rank(a) - rank(b);
      return byRank || (attendanceState(a).group === 'upcoming' ? ms(startOf(a)) - ms(startOf(b)) : ms(startOf(b)) - ms(startOf(a)));
    });
    const visible = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return `<section class="att-class ${isOpen ? 'is-open' : ''}"><button type="button" class="att-class-head" data-att-class="${esc(group.key)}" aria-expanded="${isOpen}" aria-controls="att-class-panel-${index}"><span class="att-class-icon">${icon('school')}</span><span><strong>${esc(group.name)}</strong><small>${courses} mata pelajaran/kegiatan · ${summary.done} sudah presensi${summary.pending ? ` · ${summary.pending} belum presensi` : ''} · ${summary.upcoming} belum dibuka</small></span>${icon('chevron')}</button><div id="att-class-panel-${index}" class="att-class-body" ${isOpen ? '' : 'hidden'}>
      <div class="att-table-scroll"><table class="att-session-table"><caption class="att-sr-only">Daftar sesi ${esc(group.name)}. Zona waktu WIB.</caption><thead><tr><th scope="col">#</th><th scope="col">Tanggal</th><th scope="col">Sesi</th><th scope="col">Waktu</th><th scope="col">Topik / Kegiatan</th><th scope="col">Ruang / Link</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead><tbody>${visible.map(sessionRow).join('')}</tbody></table></div>
      ${pageCount > 1 ? `<div class="att-pagination"><span>${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, group.items.length)} dari ${group.items.length} sesi</span><div><button type="button" data-att-page="${page - 1}" data-att-page-class="${esc(group.key)}" aria-label="Halaman sesi sebelumnya" ${page === 1 ? 'disabled' : ''}>‹</button><span>${page} / ${pageCount}</span><button type="button" data-att-page="${page + 1}" data-att-page-class="${esc(group.key)}" aria-label="Halaman sesi berikutnya" ${page === pageCount ? 'disabled' : ''}>›</button></div></div>` : ''}
    </div></section>`;
  }).join('')}</div>`;
}

function channelLabel(value) { return ({ ZOOM:'Zoom', YOUTUBE:'YouTube', OFFLINE:'Offline', OTHER:'Lainnya' })[String(value).toUpperCase()] || String(value); }
function phaseOf(item) {
  const now = Date.now(), start = ms(startOf(item)), end = ms(item.schedule_end_at || item.end_at || item.close_at);
  if (start > now) return ['upcoming','Akan Datang'];
  if ((end && now < end) || (!end && ['OPEN','LATE'].includes(attendanceWindow(item)))) return ['ongoing','Berlangsung'];
  return ['finished','Selesai'];
}
function timeRange(item) {
  const start = dateText(startOf(item), { hour:'2-digit', minute:'2-digit' });
  const end = item.schedule_end_at || item.end_at;
  return `${start}${end ? ` – ${dateText(end, { hour:'2-digit', minute:'2-digit' })}` : ''}`;
}
function safeLink(value) {
  const text = String(value || '').trim();
  const match = text.match(/https?:\/\/[^\s<>"']+/i) || text.match(/(?:www\.|s\.id\/)[^\s<>"']+/i);
  if (!match) return '';
  try { const url = new URL(/^https?:/i.test(match[0]) ? match[0] : `https://${match[0]}`); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function locationHtml(item) {
  const text = String(item.schedule_location || item.location || '').trim();
  const url = safeLink(text);
  const name = /zoom/i.test(text) ? 'Zoom' : /youtu/i.test(text) ? 'YouTube' : 'Buka Tautan';
  return url ? `<a class="att-location-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon(/zoom|youtu/i.test(text) ? 'video' : 'link')}<span>${name}<small>${esc(new URL(url).hostname.replace(/^www\./,''))}</small></span></a>` : `<span class="att-location-text">${icon('location')}<span>${esc(text || 'Belum ada ruang / link')}</span></span>`;
}
function sessionRow(item) {
  const ui = attendanceState(item), [phase,phaseLabel] = phaseOf(item);
  const date = startOf(item), label = item.attendance_session_no ? `Sesi ${String(item.attendance_session_no).padStart(2,'0')}` : 'Sesi';
  const detailKey = String(item.attendance_id || item.public_token || '');
  const topic = item.attendance_course_title || item.schedule_title || item.title || 'Kegiatan';
  const description = item.schedule_description || item.description || '';
  const action = ui.canCheckIn ? `<button type="button" class="att-action att-action-primary" data-global-attendance-token="${esc(item.public_token)}">${icon('check')}<span>Isi Absensi</span></button>`
    : ui.group === 'done' ? `<button type="button" class="att-action" data-att-details="${esc(detailKey)}"><span>Lihat Detail</span>${icon('arrow')}</button>`
    : `<button type="button" class="att-action att-action-locked" disabled>${icon('lock')}<span>${ui.group === 'upcoming' ? 'Belum Aktif' : ['OPEN','LATE'].includes(ui.window) ? 'Dicatat Pengajar' : 'Ditutup'}</span></button>`;
  return `<tr class="att-session-row att-tone-${ui.tone}" data-attendance-row="${esc(detailKey)}"><td class="att-date-cell"><span class="att-date-tile"><strong>${dateText(date,{day:'2-digit'})}</strong><span>${dateText(date,{month:'short'}).toUpperCase()}</span></span></td><td class="att-full-date"><strong>${dateText(date,{weekday:'long'})}</strong><small>${dateText(date,{day:'2-digit',month:'short',year:'numeric'})}</small></td><td class="att-session-number">${label}</td><td class="att-time">${icon('clock')}<span>${timeRange(item)}</span></td><td class="att-topic"><span class="att-mobile-session">${label}<span class="att-phase phase-${phase}">${phaseLabel}</span></span><strong>${esc(topic)}</strong>${description ? `<small>${esc(description)}</small>` : ''}</td><td class="att-location">${locationHtml(item)}</td><td class="att-status"><span class="att-status-icon">${icon(ui.icon)}</span><span><strong>${ui.label}</strong><small>${esc(ui.detail)}</small></span></td><td class="att-actions">${action}</td></tr>`;
}

function rateText(summary) { return summary.progressed ? `${summary.rate}%` : '—'; }
function recapHtml(items, byCourse) {
  const summary = attendanceSummary(items);
  return `<section class="att-recap"><div class="att-section-head"><div><h2>${byCourse ? 'Rekap per Mata Pelajaran' : 'Rekap Kehadiran Saya'}</h2><p>${byCourse ? 'Ringkasan kehadiran pribadi untuk setiap mata pelajaran atau kegiatan.' : 'Ringkasan kehadiran pribadi dari kelas pada filter aktif.'}</p></div><span class="att-rate-pill">${rateText(summary)} hadir</span></div><div class="att-table-scroll"><table class="att-recap-table"><thead><tr>${[byCourse ? 'Mata Pelajaran / Kegiatan' : 'Kelas','Total Sesi','Sudah Mulai','Hadir','Sakit','Izin','Alpa','Belum','Mendatang','% Hadir'].map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${grouped(items,byCourse).map(group => { const s=attendanceSummary(group.items); return `<tr><td><strong>${esc(group.name)}</strong>${byCourse ? `<small>${esc(group.className)}</small>` : ''}</td><td>${s.total}</td><td>${s.progressed}</td><td class="att-text-green">${s.PRESENT}</td><td>${s.SICK}</td><td>${s.PERMIT}</td><td class="att-text-red">${s.ABSENT}</td><td>${s.UNMARKED}</td><td>${s.upcoming}</td><td><strong>${rateText(s)}</strong></td></tr>`; }).join('')}</tbody></table></div><p class="att-explanation">${icon('info')}Persentase hadir = Hadir ÷ (Hadir + Sakit + Izin + Alpa + Belum pada sesi yang sudah dimulai). Sesi mendatang belum dihitung.</p></section>`;
}

function analyticsHtml(items) {
  const s = attendanceSummary(items);
  const bars = [['PRESENT','Hadir','green'],['SICK','Sakit','amber'],['PERMIT','Izin','cyan'],['ABSENT','Alpa','red'],['UNMARKED','Belum Mengisi','muted']];
  return `<section class="att-analytics"><div class="att-section-head"><div><h2>Analitik Kehadiran Saya</h2><p>Persentase berdasarkan ${s.progressed} sesi yang sudah dimulai.</p></div><span class="att-scope-chip">Data pribadi</span></div><div class="att-analytics-grid"><article class="att-rate-card"><div class="att-rate-ring" style="--att-rate:${s.rate}%" role="img" aria-label="Persentase hadir ${rateText(s)}"><div><strong>${rateText(s)}</strong><span>Kehadiran</span></div></div><p><strong>${s.PRESENT}</strong> hadir dari <strong>${s.progressed}</strong> sesi</p><small>${s.upcoming} sesi mendatang belum dihitung</small></article><article class="att-distribution"><h3>Rincian Kehadiran</h3>${bars.map(([key,label,tone]) => `<div class="att-distribution-row att-tone-${tone}"><span>${label}</span><div class="att-progress-track"><i style="width:${s.progressed ? s[key] / s.progressed * 100 : 0}%"></i></div><strong>${s[key]}</strong></div>`).join('')}</article></div><p class="att-explanation">${icon('info')}Belum mengisi pada sesi yang sudah dimulai tetap masuk perhitungan. Sakit, izin, dan alpa ditampilkan sesuai catatan yang tersimpan.</p></section>`;
}

export function attendanceDetailsHtml(item) {
  const ui = attendanceState(item);
  const rows = [['Kelas',item.class_name || 'KelasKu'],['Mata pelajaran / kegiatan',item.attendance_course_title || item.title],['Jadwal',`${dateText(startOf(item),{dateStyle:'full'})} · ${timeRange(item)} WIB`],['Status',STATUS_LABELS[statusOf(item)]],['Mengikuti melalui',item.my_channel ? channelLabel(item.my_channel) : '—'],['Ketepatan waktu',item.my_punctuality ? (String(item.my_punctuality).toUpperCase() === 'LATE' ? 'Terlambat' : 'Tepat waktu') : '—'],['Catatan',item.my_note || '—']];
  return `<div class="modal-head"><div><div class="eyebrow">DETAIL PRESENSI</div><h2>${esc(item.attendance_course_title || 'Sesi Presensi')}</h2></div><button type="button" class="icon-btn mini" data-close-modal aria-label="Tutup detail">×</button></div><div class="attendance-v2 att-detail att-tone-${ui.tone}"><div class="att-detail-status">${icon(ui.icon)}<strong>${ui.label}</strong></div><dl>${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value || '—')}</dd></div>`).join('')}</dl></div>`;
}

export function bindAttendanceHub({ redraw, details }) {
  const tabs = [...document.querySelectorAll('[data-att-view]')];
  tabs.forEach((button,index) => {
    const selected = button.dataset.attView === activeView;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.onclick = () => { activeView=button.dataset.attView; redraw(); };
    button.onkeydown = event => {
      let next;
      if (event.key === 'ArrowRight') next=(index+1)%tabs.length;
      if (event.key === 'ArrowLeft') next=(index+tabs.length-1)%tabs.length;
      if (event.key === 'Home') next=0;
      if (event.key === 'End') next=tabs.length-1;
      if (next === undefined) return;
      event.preventDefault(); tabs[next].click(); tabs[next].focus();
    };
  });
  const slot = document.getElementById('academic-slot');
  slot?.setAttribute('aria-labelledby',`att-tab-${activeView}`);
  document.querySelectorAll('[data-att-class]').forEach(button => button.onclick=()=>{
    const panel=document.getElementById(button.getAttribute('aria-controls'));
    if (!panel) return;
    const open=panel.hidden; panel.hidden=!open;
    button.setAttribute('aria-expanded',String(open));
    button.closest('.att-class')?.classList.toggle('is-open',open);
    expanded.set(button.dataset.attClass,open);
  });
  document.querySelectorAll('[data-att-page]').forEach(button=>button.onclick=()=>{ pages.set(button.dataset.attPageClass,Number(button.dataset.attPage)); redraw(); });
  document.querySelectorAll('[data-att-details]').forEach(button=>button.onclick=()=>details(button.dataset.attDetails));
  const filterButton=document.getElementById('attendance-filter-toggle');
  if (filterButton) filterButton.onclick=()=>{
    const toolbar=filterButton.closest('.att-toolbar');
    const open=toolbar.classList.toggle('filters-open');
    filterButton.setAttribute('aria-expanded',String(open));
  };
}
