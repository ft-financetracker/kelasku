import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, fmtDate } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { go } from '../core/router.js';

const HUB_TTL_MS = 45000;
let activeAcademicScreen = '';

export function renderSchedule() {
  activeAcademicScreen = 'schedule';
  renderAcademicShell('Jadwal', 'Agenda lintas kelas tersusun kronologis.', 'schedule', 'i-calendar');
}

export function renderTasks() {
  activeAcademicScreen = 'tasks';
  renderAcademicShell('Tugas', 'Pantau deadline dan kumpulkan tugas dari satu tempat.', 'tasks', 'i-task');
}

export function renderMaterials() {
  activeAcademicScreen = 'materials';
  renderAcademicShell('Materi', 'Materi terbaru dari seluruh kelas yang kamu ikuti.', 'materials', 'i-file');
}

export function renderAnnouncements() {
  activeAcademicScreen = 'announcements';
  renderAcademicShell('Pengumuman', 'Informasi resmi kelas tanpa tenggelam di chat.', 'announcements', 'i-mega');
}

export function renderAttendance() {
  activeAcademicScreen = 'attendance';
  renderAcademicShell('Absensi', 'Riwayat kehadiran dari seluruh kelas dalam satu tempat.', 'attendance', 'i-check');
}

function renderAcademicShell(title, copy, active, icon) {
  const content = `
    <div class="page-head academic-page-head">
      <div><div class="eyebrow">PHASE 3 • Academic Core</div><h1>${esc(title)}</h1><p>${esc(copy)}</p></div>
      <span class="phase-badge">ACTIVE</span>
    </div>
    <section class="academic-toolbar panel">
      <div class="academic-search">${svg('i-search')}<input id="academic-search" placeholder="Cari ${esc(title.toLowerCase())}…" autocomplete="off"></div>
      <select id="academic-class-filter" class="control compact-control"><option value="ALL">Semua Kelas</option></select>
      <button type="button" id="academic-refresh" class="btn btn-secondary">${svg('i-refresh')} Refresh</button>
    </section>
    <div id="academic-slot">${state.academicHub ? '' : academicSkeleton()}</div>`;

  document.getElementById('app').innerHTML = appShell({ active, content, hideSearch:true });
  bindAppShell();
  bindAcademicToolbar();

  if (state.academicHub) drawAcademicScreen(state.academicHub);
  loadAcademicHub(false);
}

function bindAcademicToolbar() {
  document.getElementById('academic-search')?.addEventListener('input', () => drawAcademicScreen(state.academicHub));
  document.getElementById('academic-class-filter')?.addEventListener('change', () => drawAcademicScreen(state.academicHub));
  document.getElementById('academic-refresh')?.addEventListener('click', () => loadAcademicHub(true));
}

export async function loadAcademicHub(force = false) {
  const fresh = state.academicHub && (Date.now() - Number(state.academicHubAt || 0) < HUB_TTL_MS);
  if (!force && fresh) return state.academicHub;

  const refreshBtn = document.getElementById('academic-refresh');
  if (refreshBtn && force) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<span class="btn-spinner"></span><span>Memperbarui…</span>';
  }

  try {
    const data = await api('getAcademicHub');
    state.academicHub = data;
    state.academicHubAt = Date.now();
    localStorage.setItem('kelasku_academic_cache', JSON.stringify(data));
    localStorage.setItem('kelasku_academic_cache_at', String(state.academicHubAt));
    drawAcademicScreen(data);
    return data;
  } catch (err) {
    if (!state.academicHub) {
      const slot = document.getElementById('academic-slot');
      if (slot) slot.innerHTML = errorPanel(err.message);
    } else if (force) toast(err.message);
    return state.academicHub;
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = `${svg('i-refresh')} Refresh`;
    }
  }
}

export function invalidateAcademicClientCache(classId = '') {
  state.academicHub = null;
  state.academicHubAt = 0;
  localStorage.removeItem('kelasku_academic_cache');
  localStorage.removeItem('kelasku_academic_cache_at');
  if (classId) delete state.classAcademic[classId];
  state.dashboard = null;
  localStorage.removeItem('kelasku_dashboard_cache');
}

function drawAcademicScreen(data) {
  if (!data) return;
  const slot = document.getElementById('academic-slot');
  if (!slot) return;
  hydrateClassFilter(data);

  if (activeAcademicScreen === 'tasks') slot.innerHTML = tasksHtml(filterItems(data.tasks || []));
  else if (activeAcademicScreen === 'materials') slot.innerHTML = materialsHtml(filterItems(data.materials || []));
  else if (activeAcademicScreen === 'announcements') slot.innerHTML = announcementsHtml(filterItems(data.announcements || []));
  else if (activeAcademicScreen === 'attendance') slot.innerHTML = attendanceHtml(filterItems(data.attendance || []));
  else slot.innerHTML = schedulesHtml(filterItems(data.schedules || []));

  bindAcademicRows();
}

function hydrateClassFilter(data) {
  const select = document.getElementById('academic-class-filter');
  if (!select || select.dataset.ready === '1') return;
  const map = new Map();
  ['tasks','schedules','materials','announcements','attendance'].forEach(key => {
    (data[key] || []).forEach(item => map.set(String(item.class_id), item.class_name || 'KelasKu'));
  });
  [...map.entries()].sort((a,b)=>a[1].localeCompare(b[1])).forEach(([id,name]) => {
    const opt = document.createElement('option'); opt.value = id; opt.textContent = name; select.appendChild(opt);
  });
  select.dataset.ready = '1';
}

function filterItems(items) {
  const query = String(document.getElementById('academic-search')?.value || '').trim().toLowerCase();
  const classId = String(document.getElementById('academic-class-filter')?.value || 'ALL');
  return items.filter(item => {
    if (classId !== 'ALL' && String(item.class_id) !== classId) return false;
    if (!query) return true;
    const hay = [item.title,item.description,item.body,item.location,item.class_name].join(' ').toLowerCase();
    return hay.includes(query);
  });
}

function schedulesHtml(items) {
  if (!items.length) return emptyAcademic('Belum ada jadwal', 'Jadwal dari kelasmu akan tampil di sini.', 'i-calendar');
  const now = Date.now();
  const upcoming = items.filter(x => dateMs(x.start_at) >= now - 21600000).slice(0, 80);
  const past = items.filter(x => dateMs(x.start_at) < now - 21600000).slice(-20).reverse();
  return `<section class="academic-list-layout">
    <div class="section-title-row"><div><h2>Agenda Mendatang</h2><p>${upcoming.length} agenda</p></div></div>
    <div class="academic-card-list">${upcoming.length ? upcoming.map(scheduleCard).join('') : '<div class="search-empty">Belum ada agenda mendatang.</div>'}</div>
    ${past.length ? `<div class="section-title-row"><div><h2>Riwayat Terbaru</h2><p>${past.length} agenda terakhir</p></div></div><div class="academic-card-list is-muted">${past.map(scheduleCard).join('')}</div>` : ''}
  </section>`;
}

function scheduleCard(item) {
  const d = new Date(item.start_at);
  const date = safeDateParts(d);
  return `<article class="academic-row-card">
    <div class="academic-date-tile"><strong>${date.day}</strong><span>${date.month}</span></div>
    <div class="academic-row-main"><div class="academic-meta-line"><span>${esc(item.class_name || 'KelasKu')}</span><span>${esc(timeRange(item.start_at,item.end_at))}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.description || item.location || 'Tanpa keterangan tambahan.')}</p>${item.location ? `<small>${svg('i-class')} ${esc(item.location)}</small>` : ''}</div>
  </article>`;
}

function tasksHtml(items) {
  if (!items.length) return emptyAcademic('Belum ada tugas', 'Tugas dari seluruh kelas akan tampil di sini.', 'i-task');
  const open = items.filter(x => !['SUBMITTED','LATE'].includes(String(x.submission_status))).sort((a,b)=>dateMs(a.deadline,Infinity)-dateMs(b.deadline,Infinity));
  const done = items.filter(x => ['SUBMITTED','LATE'].includes(String(x.submission_status))).sort((a,b)=>dateMs(b.deadline,0)-dateMs(a.deadline,0));
  return `<section class="academic-list-layout">
    <div class="academic-summary-strip">
      <div><strong>${open.length}</strong><span>Belum dikumpulkan</span></div><div><strong>${done.length}</strong><span>Sudah dikumpulkan</span></div><div><strong>${items.length}</strong><span>Total aktif</span></div>
    </div>
    <div class="section-title-row"><div><h2>Perlu Dikerjakan</h2><p>Urut deadline terdekat.</p></div></div>
    <div class="academic-card-list">${open.length ? open.map(taskCard).join('') : '<div class="search-empty">Semua tugas sudah tertangani.</div>'}</div>
    ${done.length ? `<div class="section-title-row"><div><h2>Sudah Dikumpulkan</h2><p>Riwayat pengumpulan.</p></div></div><div class="academic-card-list is-muted">${done.slice(0,30).map(taskCard).join('')}</div>` : ''}
  </section>`;
}

function taskCard(item) {
  const status = taskStatus(item);
  return `<button type="button" class="academic-row-card academic-row-button" data-open-task="${esc(item.task_id)}">
    <span class="academic-type-icon">${svg('i-task')}</span>
    <span class="academic-row-main"><span class="academic-meta-line"><span>${esc(item.class_name || 'KelasKu')}</span><span>${esc(deadlineText(item.deadline))}</span></span><strong class="academic-row-title">${esc(item.title)}</strong><span class="academic-row-copy">${esc(item.description || 'Tidak ada deskripsi.')}</span></span>
    <span class="academic-status-pill status-${status.key.toLowerCase()}">${esc(status.label)}</span>
  </button>`;
}

function materialsHtml(items) {
  if (!items.length) return emptyAcademic('Belum ada materi', 'Materi yang dibagikan kelas akan tampil di sini.', 'i-file');
  return `<div class="academic-material-grid">${items.map(materialCard).join('')}</div>`;
}

function materialCard(item) {
  return `<article class="academic-material-card panel">
    <div class="academic-material-icon">${svg(item.material_type === 'LINK' ? 'i-link' : 'i-file')}</div>
    <div class="academic-meta-line"><span>${esc(item.class_name || 'KelasKu')}</span><span>${esc(shortDate(item.published_at))}</span></div>
    <h3>${esc(item.title)}</h3><p>${esc(item.description || 'Materi kelas.')}</p>
    ${item.url ? `<button type="button" class="btn btn-secondary academic-open-link" data-open-url="${esc(item.url)}">${svg('i-link')} Buka Materi</button>` : '<span class="soft-chip">Catatan</span>'}
  </article>`;
}

function announcementsHtml(items) {
  if (!items.length) return emptyAcademic('Belum ada pengumuman', 'Pengumuman resmi kelas akan tampil di sini.', 'i-mega');
  return `<div class="announcement-feed">${items.map(announcementCard).join('')}</div>`;
}

function announcementCard(item) {
  return `<article class="announcement-card priority-${String(item.priority||'normal').toLowerCase()}">
    <div class="announcement-marker">${svg('i-mega')}</div>
    <div><div class="academic-meta-line"><span>${esc(item.class_name || 'KelasKu')}</span><span>${esc(shortDateTime(item.published_at))}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.body || '')}</p></div>
    <span class="soft-chip">${esc(item.priority || 'NORMAL')}</span>
  </article>`;
}

function attendanceHtml(items) {
  if (!items.length) return emptyAcademic('Belum ada riwayat absensi', 'Sesi absensi dari kelasmu akan tampil di sini.', 'i-check');
  const counts = items.reduce((acc, item) => {
    const key = String(item.my_status || 'UNMARKED').toUpperCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return `<section class="academic-list-layout">
    <div class="academic-summary-strip">
      <div><strong>${counts.PRESENT || 0}</strong><span>Hadir</span></div>
      <div><strong>${(counts.SICK || 0) + (counts.PERMIT || 0)}</strong><span>Sakit / Izin</span></div>
      <div><strong>${counts.ABSENT || 0}</strong><span>Alpa</span></div>
    </div>
    <div class="academic-card-list">${items.map(attendanceCard).join('')}</div>
  </section>`;
}

function attendanceCard(item) {
  const status = attendanceStatusMeta(item.my_status);
  return `<article class="academic-row-card">
    <span class="academic-type-icon">${svg('i-check')}</span>
    <span class="academic-row-main"><span class="academic-meta-line"><span>${esc(item.class_name || 'KelasKu')}</span><span>${esc(shortDateTime(item.start_at))}</span></span><strong class="academic-row-title">${esc(item.title || 'Absensi')}</strong><span class="academic-row-copy">${esc(item.my_note || 'Tidak ada catatan.')}</span></span>
    <span class="academic-status-pill status-${status.key}">${esc(status.label)}</span>
  </article>`;
}

function attendanceStatusMeta(value) {
  const key = String(value || 'UNMARKED').toUpperCase();
  if (key === 'PRESENT') return { key:'done', label:'Hadir' };
  if (key === 'SICK') return { key:'open', label:'Sakit' };
  if (key === 'PERMIT') return { key:'open', label:'Izin' };
  if (key === 'ABSENT') return { key:'overdue', label:'Alpa' };
  return { key:'open', label:'Belum Dinilai' };
}

function bindAcademicRows() {
  document.querySelectorAll('[data-open-task]').forEach(btn => btn.onclick = () => openTask(btn.dataset.openTask));
  document.querySelectorAll('[data-open-url]').forEach(btn => btn.onclick = () => openExternal(btn.dataset.openUrl));
  document.getElementById('academic-open-classes')?.addEventListener('click', () => go('classes'));
}

function openTask(taskId) {
  const item = (state.academicHub?.tasks || []).find(x => String(x.task_id) === String(taskId));
  if (!item) return;
  const mode = String(item.submission_mode || 'NONE').toUpperCase();
  const sub = item.submission || {};
  showModal(`
    <div class="modal-head"><div><div class="eyebrow">Tugas • ${esc(item.class_name || 'KelasKu')}</div><h2>${esc(item.title)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>
    <div class="task-modal-meta"><span>${svg('i-calendar')} ${esc(deadlineText(item.deadline))}</span><span class="academic-status-pill status-${taskStatus(item).key.toLowerCase()}">${esc(taskStatus(item).label)}</span></div>
    <p class="copy compact-copy task-description">${esc(item.description || 'Tidak ada deskripsi tugas.')}</p>
    ${mode === 'NONE' ? '<div class="alert success">Tugas ini tidak memerlukan pengumpulan melalui KelasKu.</div>' : `
      <form id="task-submit-form">
        ${mode !== 'LINK' ? `<div class="field"><label>Jawaban / Catatan</label><textarea name="submission_text" class="control" rows="5" placeholder="Tulis jawaban atau catatan pengumpulan…">${esc(sub.submission_text || '')}</textarea></div>` : ''}
        ${mode !== 'TEXT' ? `<div class="field"><label>Tautan Pengumpulan</label><input name="submission_url" class="control" type="url" placeholder="https://…" value="${esc(sub.submission_url || '')}"></div>` : ''}
        <div id="task-submit-status" class="request-status"></div>
        <button id="task-submit-btn" class="btn btn-primary btn-block" type="submit">${sub.submission_id ? 'Perbarui Pengumpulan' : 'Kumpulkan Tugas'}</button>
      </form>`}
  `);
  const form = document.getElementById('task-submit-form');
  if (form) form.onsubmit = e => submitTask(e, item);
}

async function submitTask(event, item) {
  event.preventDefault();
  const form = event.currentTarget;
  const btn = document.getElementById('task-submit-btn');
  const status = document.getElementById('task-submit-status');
  const old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span><span>Mengirim…</span>';
  status.className = 'request-status progress'; status.textContent = 'Menyimpan pengumpulan…';
  try {
    await api('submitTask', {
      task_id:item.task_id,
      submission_text:form.submission_text?.value || '',
      submission_url:form.submission_url?.value || ''
    });
    invalidateAcademicClientCache(item.class_id);
    toast('Tugas berhasil dikumpulkan.');
    closeModal();
    await loadAcademicHub(true);
  } catch (err) {
    status.className = 'request-status error'; status.textContent = err.message;
  } finally { btn.disabled = false; btn.innerHTML = old; }
}

function taskStatus(item) {
  const sub = String(item.submission_status || 'NOT_SUBMITTED').toUpperCase();
  if (sub === 'SUBMITTED') return { key:'DONE', label:'Dikumpulkan' };
  if (sub === 'LATE') return { key:'LATE', label:'Terlambat' };
  if (item.deadline && Date.now() > dateMs(item.deadline,0)) return { key:'OVERDUE', label:'Lewat Deadline' };
  return { key:'OPEN', label:'Belum Dikirim' };
}

function emptyAcademic(title, copy, icon) {
  return `<div class="empty academic-empty"><div><div class="empty-icon">${svg(icon)}</div><strong>${esc(title)}</strong><span>${esc(copy)}</span><div class="empty-actions"><button type="button" class="btn btn-secondary" id="academic-open-classes">Buka Kelas</button></div></div></div>`;
}

function academicSkeleton() {
  return `<div class="academic-summary-strip">${[1,2,3].map(()=>'<div class="skeleton" style="height:70px;border-radius:16px"></div>').join('')}</div><div class="academic-card-list">${[1,2,3,4].map(()=>'<div class="panel skeleton" style="height:104px"></div>').join('')}</div>`;
}

function errorPanel(message) { return `<div class="panel error-panel"><strong>Data akademik gagal dimuat.</strong><p>${esc(message)}</p></div>`; }

function showModal(html) {
  closeModal();
  const el = document.createElement('div'); el.id = 'phase-modal'; el.className = 'overlay';
  el.innerHTML = `<div class="modal glass phase-modal-card">${html}</div>`; document.body.appendChild(el);
  el.querySelectorAll('[data-close-modal]').forEach(x => x.onclick = closeModal);
  el.onclick = e => { if (e.target === el) closeModal(); };
}
function closeModal(){ document.getElementById('phase-modal')?.remove(); }

function openExternal(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) return toast('Tautan materi tidak valid.');
  window.open(url, '_blank', 'noopener,noreferrer');
}
function dateMs(value, fallback = 0) { const n = new Date(value || '').getTime(); return Number.isFinite(n) ? n : fallback; }
function shortDate(value) { try { return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium'}).format(new Date(value)); } catch { return value || '-'; } }
function shortDateTime(value) { try { return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); } catch { return value || '-'; } }
function deadlineText(value) { return value ? `Deadline ${shortDateTime(value)}` : 'Tanpa deadline'; }
function timeRange(start,end) { try { const f = v => new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit'}).format(new Date(v)); return f(start) + (end ? ` – ${f(end)}` : ''); } catch { return ''; } }
function safeDateParts(d) { if (!Number.isFinite(d.getTime())) return {day:'--',month:'---'}; return { day:new Intl.DateTimeFormat('id-ID',{day:'2-digit'}).format(d), month:new Intl.DateTimeFormat('id-ID',{month:'short'}).format(d).toUpperCase() }; }
