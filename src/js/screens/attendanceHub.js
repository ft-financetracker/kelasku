/** Personal attendance presentation. Reuses getAcademicHub; no network requests. */
import { esc } from '../core/utils.js';
import { attendanceReportData } from './attendanceAnalytics.js?v=6739r52c73';

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
const expandedCourses = new Map();

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
function startOf(item) { return item.start_at || item.open_at || item.schedule_start_at; }
function endOf(item) { return item.close_at || item.end_at || item.schedule_end_at; }
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
export function resetAttendanceFolders() { pages.clear(); expanded.clear(); expandedCourses.clear(); }
export function attendanceIsReportView() { return activeView !== 'sessions'; }

export function attendanceTabsHtml() {
  return `<nav id="attendance-tabs" class="att-tabs" role="tablist" aria-label="Tampilan absensi">${VIEWS.map(([key, symbol, label, short]) => `<button type="button" id="att-tab-${key}" role="tab" aria-selected="${activeView === key}" aria-controls="academic-slot" tabindex="${activeView === key ? '0' : '-1'}" data-att-view="${key}" class="att-tab ${activeView === key ? 'active' : ''}">${icon(symbol)}<span class="att-tab-long">${label}</span><span class="att-tab-short">${short}</span></button>`).join('')}</nav>`;
}

export function attendanceOverviewHtml(items) {
  const summary = attendanceSummary(items);
  const totalClasses = new Set(items.map(x => String(x.class_id))).size;
  const cards = [
    ['green','users',summary.done,'Sudah Presensi',summary.done ? 'Kehadiran sudah dicatat' : 'Belum ada presensi tercatat'],
    ['amber','clock',summary.pending,'Belum Presensi',summary.closed ? `${summary.closed} sesi sudah ditutup` : 'Sesi yang perlu diisi'],
    ['gold','book',summary.upcoming,'Belum Dibuka','Sesi mendatang'],
    ['cyan','calendar',summary.total,'Sesi Termuat',`${totalClasses} kelas`]
  ];
  return `<header class="att-hero att-hero-default">
    <div class="att-hero-copy"><span class="att-eyebrow">ABSENSI KELAS</span><h1>Hadir hari ini.<br><em>Bertumbuh setiap hari.</em></h1><p class="att-hero-description">Setiap pertemuan adalah langkah kecil menuju ilmu yang lebih berarti.</p><div class="att-hero-values"><span>${icon('check')}Konsisten</span><span>${icon('book')}Terus belajar</span><span>${icon('chart')}Terus bertumbuh</span></div></div>
    <div class="att-hero-art" aria-hidden="true"><div class="att-hero-orbit"></div><div class="att-hero-note"><span class="att-hero-note-icon">${icon('calendar')}</span><div class="att-hero-note-dots"><i></i><i></i><i></i></div><div class="att-hero-note-line"><span></span>${icon('check')}</div><div class="att-hero-note-line"><span></span>${icon('check')}</div><div class="att-hero-note-line"><span></span>${icon('check')}</div></div><span class="att-hero-stamp">${icon('check')}Satu langkah lebih baik</span></div>
  </header>
  <div class="att-metrics" aria-label="Komposisi sesi pada filter aktif">${cards.map(([tone, symbol, count, label, help]) => {
    const percent = summary.total ? Math.round(count / summary.total * 100) : 0;
    return `<article class="att-metric att-tone-${tone}" title="${esc(help)}"><span class="att-metric-icon">${icon(symbol)}</span><div class="att-metric-copy"><strong>${count}</strong><span>${label}</span></div><div class="att-metric-progress"><span class="att-progress-track"><i style="width:${percent}%"></i></span><small>${percent}%</small></div></article>`;
  }).join('')}</div><p class="att-scope-note">Kartu merangkum daftar sesi yang termuat. Rekap memakai data Analitik Ruang Kelas.</p>`;
}

function grouped(items, byCourse = false, activeFirst = false) {
  const map = new Map();
  const now = Date.now();
  items.forEach(item => {
    const key = String(byCourse ? item.attendance_course_key : item.class_id || 'UNKNOWN');
    if (!map.has(key)) map.set(key, { key, name:byCourse ? item.attendance_course_title : item.class_name || 'KelasKu', className:item.class_name || 'KelasKu', items:[], rank:2 });
    const group = map.get(key);
    group.items.push(item);
    if (activeFirst) group.rank = Math.min(group.rank, sessionRank(item, now));
  });
  return [...map.values()].sort((a,b) => a.rank - b.rank || String(a.name).localeCompare(String(b.name), 'id'));
}

function emptyHtml() {
  return `<div class="att-empty">${icon('calendar')}<h2>Tidak ada sesi pada filter ini</h2><p>Coba kata pencarian lain atau pilih semua kelas dan mata pelajaran.</p></div>`;
}

export function attendanceContentHtml(items, report = null) {
  if (activeView !== 'sessions' && report) return attendanceReportHtml(report);
  if (!items.length) return emptyHtml();
  if (activeView === 'recap') return recapHtml(items, false);
  if (activeView === 'courses') return recapHtml(items, true);
  if (activeView === 'analytics') return analyticsHtml(items);
  return `<div class="att-class-list">${grouped(items, false, true).map((group, index) => {
    const summary = attendanceSummary(group.items);
    const courses = grouped(group.items, true, true);
    const isOpen = expanded.get(group.key) === true;
    return `<section class="att-class ${isOpen ? 'is-open' : ''}"><button type="button" class="att-class-head" data-att-class="${esc(group.key)}" aria-expanded="${isOpen}" aria-controls="att-class-panel-${index}"><span class="att-class-icon">${icon('school')}</span><span><strong>${esc(group.name)}</strong><small>${courses.length} mata pelajaran/kegiatan · ${summary.done} sudah presensi${summary.pending ? ` · ${summary.pending} belum presensi` : ''} · ${summary.upcoming} belum dibuka</small></span>${icon('chevron')}</button><div id="att-class-panel-${index}" class="att-class-body" ${isOpen ? '' : 'hidden'}>${isOpen ? `<div class="att-course-list">${courses.map((course, courseIndex) => attendanceCourseHtml(course, index, courseIndex)).join('')}</div>` : ''}</div></section>`;
  }).join('')}</div>`;
}

function attendanceCourseHtml(course, classIndex, courseIndex) {
  const summary = attendanceSummary(course.items);
  const isOpen = expandedCourses.get(course.key) === true;
  const panelId = `att-course-panel-${classIndex}-${courseIndex}`;
  // Collapsed courses contain no session rows. Opening a category only uses memory.
  return `<section class="att-course ${isOpen ? 'is-open' : ''}"><button type="button" class="att-course-head" data-att-course="${esc(course.key)}" aria-expanded="${isOpen}" aria-controls="${panelId}"><span class="att-course-icon">${icon('book')}</span><span class="att-course-copy"><small class="att-course-label">MATA KULIAH / KEGIATAN</small><strong>${esc(course.name)}</strong><small>${summary.total} sesi · ${summary.done} sudah presensi${summary.pending ? ` · ${summary.pending} belum presensi` : ''} · ${summary.upcoming} belum dibuka</small></span>${icon('chevron')}</button><div id="${panelId}" class="att-course-body" ${isOpen ? '' : 'hidden'}>${isOpen ? attendanceCourseSessionsHtml(course) : ''}</div></section>`;
}

function attendanceCourseSessionsHtml(course) {
  const pageCount = Math.max(1, Math.ceil(course.items.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, pages.get(course.key) || 1), pageCount);
  const ordered = sortAttendanceSessions(course.items);
  const visible = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return `<div class="att-table-scroll"><table class="att-session-table"><caption class="att-sr-only">Daftar sesi ${esc(course.name)} — ${esc(course.className)}. Zona waktu WIB.</caption><thead><tr><th scope="col">#</th><th scope="col">Tanggal</th><th scope="col">Sesi</th><th scope="col">Waktu</th><th scope="col">Topik / Kegiatan</th><th scope="col">Ruang / Link</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead><tbody>${visible.map(sessionRow).join('')}</tbody></table></div>${pageCount > 1 ? `<div class="att-pagination"><span>${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, course.items.length)} dari ${course.items.length} sesi</span><div><button type="button" data-att-page="${page - 1}" data-att-page-class="${esc(course.key)}" aria-label="Halaman sesi sebelumnya" ${page === 1 ? 'disabled' : ''}>‹</button><span>${page} / ${pageCount}</span><button type="button" data-att-page="${page + 1}" data-att-page-class="${esc(course.key)}" aria-label="Halaman sesi berikutnya" ${page === pageCount ? 'disabled' : ''}>›</button></div></div>` : ''}`;
}

export function sortAttendanceSessions(items, now = Date.now()) {
  // Decorate once so sorting does not repeatedly parse dates/statuses.
  return items.map((item, index) => {
    const rank = sessionRank(item, now);
    return { item, rank, start:ms(startOf(item)), index };
  }).sort((a,b) => a.rank - b.rank || (a.rank === 2 ? b.start - a.start : a.start - b.start) || a.index - b.index).map(entry => entry.item);
}

function channelLabel(value) { return ({ ZOOM:'Zoom', YOUTUBE:'YouTube', OFFLINE:'Offline', OTHER:'Lainnya' })[String(value).toUpperCase()] || String(value); }
function phaseOf(item, now = Date.now()) {
  const window = attendanceWindow(item, now);
  // Window status belongs to the session, independently of personal check-in.
  if (['OPEN','LATE'].includes(window)) return ['ongoing','Berlangsung'];
  if (window === 'UPCOMING') return ['upcoming','Akan Datang'];
  if (['CLOSED','OPEN','LATE'].includes(String(item.window_status || '').toUpperCase())) return ['finished','Selesai'];
  const start = ms(startOf(item)), end = ms(endOf(item));
  if (start > now) return ['upcoming','Akan Datang'];
  if (end && now < end) return ['ongoing','Berlangsung'];
  return ['finished','Selesai'];
}
function sessionRank(item, now) { return ({ ongoing:0, upcoming:1, finished:2 })[phaseOf(item, now)[0]]; }
function timeRange(item) {
  const start = dateText(startOf(item), { hour:'2-digit', minute:'2-digit' });
  const end = endOf(item);
  // WIB is UTC+7; comparing day boundaries avoids extra Intl formatters per row.
  const day = value => Math.floor((ms(value) + 7 * 3600000) / 86400000);
  const spansDays = end && day(startOf(item)) !== day(end);
  const endOptions = { ...(spansDays ? { day:'2-digit', month:'short', year:'numeric' } : {}), hour:'2-digit', minute:'2-digit' };
  return `${start}${end ? ` – ${dateText(end, endOptions)}` : ''}`;
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
    : ui.group === 'done' ? `<button type="button" class="att-action" data-att-details="${esc(detailKey)}" aria-label="Lihat detail ${esc(label)}"><span>Lihat Detail</span>${icon('arrow')}</button>`
    : `<button type="button" class="att-action att-action-locked" disabled>${icon('lock')}<span>${ui.group === 'upcoming' ? 'Belum Aktif' : ['OPEN','LATE'].includes(ui.window) ? 'Dicatat Pengajar' : 'Ditutup'}</span></button>`;
  return `<tr class="att-session-row att-tone-${ui.tone}" data-attendance-row="${esc(detailKey)}"><td class="att-date-cell"><span class="att-date-tile"><strong>${dateText(date,{day:'2-digit'})}</strong><span>${dateText(date,{month:'short'}).toUpperCase()}</span></span></td><td class="att-full-date"><strong>${dateText(date,{weekday:'long'})}</strong><small>${dateText(date,{day:'2-digit',month:'short',year:'numeric'})}</small></td><td class="att-session-number">${label}<span class="att-phase phase-${phase}">${phaseLabel}</span></td><td class="att-time">${icon('clock')}<span>${timeRange(item)}</span></td><td class="att-topic"><span class="att-mobile-session">${label}<span class="att-phase phase-${phase}">${phaseLabel}</span></span><strong>${esc(topic)}</strong>${description ? `<small>${esc(description)}</small>` : ''}</td><td class="att-location">${locationHtml(item)}</td><td class="att-status"><span class="att-status-icon">${icon(ui.icon)}</span><span><strong>${ui.label}</strong><small>${esc(ui.detail)}</small></span></td><td class="att-actions">${action}</td></tr>`;
}

function rateText(summary) { return summary.progressed ? `${summary.rate}%` : '—'; }

function attendanceReportHtml(options) {
  const classes = options.classes || [];
  const selected = classes.find(item => item.id === options.classId);
  const view = options.data ? attendanceReportData(options.data, options) : null;
  const scope = view?.scope || 'own';
  const controls = `<div class="att-report-controls"><label>Kelas<select class="control" data-att-report-class aria-label="Kelas untuk rekap"><option value="">Pilih kelas…</option>${classes.map(item => `<option value="${esc(item.id)}" ${item.id === options.classId ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label><div class="att-report-scopes" role="group" aria-label="Cakupan rekap"><button type="button" data-att-report-scope="own" aria-pressed="${scope === 'own'}">Saya</button><button type="button" data-att-report-scope="class" aria-pressed="${scope === 'class'}" ${view?.canViewAll ? '' : 'disabled'} title="Rekap seluruh peserta tersedia sesuai izin kelas">Kelas</button></div><button type="button" data-att-report-refresh ${!options.classId || options.loading ? 'disabled' : ''}>${options.loading ? 'Memuat…' : 'Refresh Rekap'}</button></div>`;
  let body = '';
  if (!selected) body = '<p class="att-report-message">Pilih satu kelas untuk melihat rekap lengkap dari sumber Analitik Ruang Kelas.</p>';
  else if (!view) body = `<p class="att-report-message" role="status">${options.error ? esc(options.error) : 'Memuat rekap kelas…'}</p>`;
  else {
    const summary = view.summary;
    const scopeLabel = scope === 'class' ? 'Seluruh peserta kelas' : 'Presensi saya';
    const note = `<p class="att-report-note"><strong>${scopeLabel} · ${esc(selected.name)}</strong><span>Sumber dan perhitungan sama dengan Analitik Ruang Kelas. Sesi mendatang yang belum diisi tidak masuk persentase.</span></p>`;
    if (activeView === 'analytics') {
      const bars = [['PRESENT','Hadir','green'],['SICK','Sakit','amber'],['PERMIT','Izin','cyan'],['ABSENT','Alpa','red'],['UNMARKED','Belum Mengisi','muted']];
      body = `${note}<div class="att-section-head"><div><h2>Analitik ${scope === 'class' ? 'Kelas' : 'Kehadiran Saya'}</h2><p>${summary.sessions} sesi · ${summary.total} record terhitung</p></div><span class="att-scope-chip">${scope === 'class' ? 'Kelas' : 'Saya'}</span></div><div class="att-analytics-grid"><article class="att-rate-card"><div class="att-rate-ring" style="--att-rate:${summary.attendance_rate}%" role="img" aria-label="Persentase hadir ${summary.attendance_rate}%"><div><strong>${summary.attendance_rate}%</strong><span>Kehadiran</span></div></div><p>${summary.PRESENT} hadir dari ${summary.total} record</p></article><article class="att-distribution"><h3>Rincian Kehadiran</h3>${bars.map(([key,label,tone]) => `<div class="att-distribution-row att-tone-${tone}"><span>${label}</span><div class="att-progress-track"><i style="width:${summary.total ? summary[key] / summary.total * 100 : 0}%"></i></div><strong>${summary[key]}</strong></div>`).join('')}</article></div>`;
    } else {
      const groups = activeView === 'courses' ? view.groups : [{ ...summary, name:selected.name }];
      body = `${note}<div class="att-section-head"><div><h2>${activeView === 'courses' ? 'Rekap per Mata Pelajaran' : 'Rekap Kehadiran'} · ${scope === 'class' ? 'Kelas' : 'Saya'}</h2></div><span class="att-rate-pill">${summary.attendance_rate}% hadir</span></div><div class="att-table-scroll"><table class="att-recap-table"><thead><tr>${[activeView === 'courses' ? 'Mata Pelajaran / Kegiatan' : 'Kelas','Total Sesi','Record','Hadir','Sakit','Izin','Alpa','Belum','% Presensi'].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${groups.map(group => `<tr><td><strong>${esc(group.name)}</strong></td><td>${group.sessions}</td><td>${group.total}</td><td class="att-text-green">${group.PRESENT}</td><td>${group.SICK}</td><td>${group.PERMIT}</td><td class="att-text-red">${group.ABSENT}</td><td>${group.UNMARKED}</td><td><strong>${group.attendance_rate}%</strong></td></tr>`).join('') || '<tr><td colspan="9">Tidak ada sesi pada filter ini.</td></tr>'}</tbody></table></div>`;
    }
    if (options.error) body = `<p class="att-report-message" role="status">Data tersimpan · ${esc(options.error)}</p>${body}`;
    else if (options.loading) body = `<p class="att-report-message" role="status">Memperbarui rekap…</p>${body}`;
  }
  return `<section class="att-recap att-report" aria-busy="${Boolean(options.loading)}">${controls}${body}</section>`;
}
function recapHtml(items, byCourse) {
  const summary = attendanceSummary(items);
  return `<section class="att-recap"><div class="att-section-head"><div><h2>${byCourse ? 'Rekap per Mata Pelajaran' : 'Rekap Kehadiran Saya'}</h2><p>${byCourse ? 'Ringkasan kehadiran pribadi untuk setiap mata pelajaran atau kegiatan.' : 'Ringkasan kehadiran pribadi dari kelas pada filter aktif.'}</p></div><span class="att-rate-pill">${rateText(summary)} hadir</span></div><div class="att-table-scroll"><table class="att-recap-table"><thead><tr>${[byCourse ? 'Mata Pelajaran / Kegiatan' : 'Kelas','Total Sesi','Sudah Mulai','Hadir','Sakit','Izin','Alpa','Belum','Mendatang','% Hadir'].map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${grouped(items,byCourse).map(group => { const s=attendanceSummary(group.items); return `<tr><td><strong>${esc(group.name)}</strong>${byCourse ? `<small>${esc(group.className)}</small>` : ''}</td><td>${s.total}</td><td>${s.progressed}</td><td class="att-text-green">${s.PRESENT}</td><td>${s.SICK}</td><td>${s.PERMIT}</td><td class="att-text-red">${s.ABSENT}</td><td>${s.UNMARKED}</td><td>${s.upcoming}</td><td><strong>${rateText(s)}</strong></td></tr>`; }).join('')}</tbody></table></div><p class="att-explanation">${icon('info')}Persentase hadir = Hadir ÷ (Hadir + Sakit + Izin + Alpa + Belum pada sesi yang sudah dimulai). Sesi mendatang belum dihitung.</p></section>`;
}

function analyticsHtml(items) {
  const s = attendanceSummary(items);
  const bars = [['PRESENT','Hadir','green'],['SICK','Sakit','amber'],['PERMIT','Izin','cyan'],['ABSENT','Alpa','red'],['UNMARKED','Belum Mengisi','muted']];
  return `<section class="att-analytics"><div class="att-section-head"><div><h2>Analitik Kehadiran Saya</h2><p>${s.progressed} dari ${s.total} sesi sudah dimulai · ${s.upcoming} sesi mendatang.</p></div><span class="att-scope-chip">Data pribadi</span></div><div class="att-analytics-grid"><article class="att-rate-card"><div class="att-rate-ring" style="--att-rate:${s.rate}%" role="img" aria-label="Persentase hadir ${rateText(s)}"><div><strong>${rateText(s)}</strong><span>Kehadiran</span></div></div><p><strong>${s.PRESENT}</strong> hadir dari <strong>${s.progressed}</strong> sesi</p><small>${s.upcoming} sesi mendatang belum dihitung</small></article><article class="att-distribution"><h3>Rincian Kehadiran</h3>${bars.map(([key,label,tone]) => `<div class="att-distribution-row att-tone-${tone}"><span>${label}</span><div class="att-progress-track"><i style="width:${s.progressed ? s[key] / s.progressed * 100 : 0}%"></i></div><strong>${s[key]}</strong></div>`).join('')}</article></div><p class="att-explanation">${icon('info')}Belum mengisi pada sesi yang sudah dimulai tetap masuk perhitungan. Sakit, izin, dan alpa ditampilkan sesuai catatan yang tersimpan.</p></section>`;
}

export function attendanceDetailsHtml(item) {
  const ui = attendanceState(item);
  const rows = [['Kelas',item.class_name || 'KelasKu'],['Mata pelajaran / kegiatan',item.attendance_course_title || item.title],['Jadwal',`${dateText(startOf(item),{dateStyle:'full'})} · ${timeRange(item)} WIB`],['Status',STATUS_LABELS[statusOf(item)]],['Mengikuti melalui',item.my_channel ? channelLabel(item.my_channel) : '—'],['Ketepatan waktu',item.my_punctuality ? (String(item.my_punctuality).toUpperCase() === 'LATE' ? 'Terlambat' : 'Tepat waktu') : '—'],['Catatan',item.my_note || '—']];
  return `<div class="modal-head"><div><div class="eyebrow">DETAIL PRESENSI</div><h2>${esc(item.attendance_course_title || 'Sesi Presensi')}</h2></div><button type="button" class="icon-btn mini" data-close-modal aria-label="Tutup detail">×</button></div><div class="attendance-v2 att-detail att-tone-${ui.tone}"><div class="att-detail-status">${icon(ui.icon)}<strong>${ui.label}</strong></div><dl>${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value || '—')}</dd></div>`).join('')}</dl></div>`;
}

export function bindAttendanceHub({ redraw, details, reportClass, reportScope, reportRefresh }) {
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
    expanded.set(button.dataset.attClass,button.getAttribute('aria-expanded') !== 'true');
    redraw();
    focusAttendanceControl('[data-att-class]', 'attClass', button.dataset.attClass);
  });
  document.querySelectorAll('[data-att-course]').forEach(button=>button.onclick=()=>{
    expandedCourses.set(button.dataset.attCourse,button.getAttribute('aria-expanded') !== 'true');
    redraw();
    focusAttendanceControl('[data-att-course]', 'attCourse', button.dataset.attCourse);
  });
  document.querySelectorAll('[data-att-page]').forEach(button=>button.onclick=()=>{
    pages.set(button.dataset.attPageClass,Number(button.dataset.attPage)); redraw();
    focusAttendanceControl('[data-att-course]', 'attCourse', button.dataset.attPageClass);
  });
  document.querySelectorAll('[data-att-details]').forEach(button=>button.onclick=()=>details(button.dataset.attDetails));
  document.querySelectorAll('[data-att-report-class]').forEach(select => select.onchange=()=>reportClass?.(select.value));
  document.querySelectorAll('[data-att-report-scope]').forEach(button => button.onclick=()=>reportScope?.(button.dataset.attReportScope));
  document.querySelectorAll('[data-att-report-refresh]').forEach(button => button.onclick=()=>reportRefresh?.());
  const filterButton=document.getElementById('attendance-filter-toggle');
  if (filterButton) filterButton.onclick=()=>{
    const toolbar=filterButton.closest('.att-toolbar');
    const open=toolbar.classList.toggle('filters-open');
    filterButton.setAttribute('aria-expanded',String(open));
  };
}

function focusAttendanceControl(selector, key, value) {
  [...document.querySelectorAll(selector)].find(button => button.dataset[key] === value)?.focus({ preventScroll:true });
}
