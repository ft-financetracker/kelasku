import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, fmtDate, sameData } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { compressImageFile, fileToDataUrl, formatBytes } from '../core/media.js';
import { go } from '../core/router.js';

const HUB_TTL_MS = 45000;
let activeAcademicScreen = '';
let attendanceListPage = 1;
let academicHubInFlight = null;
const ATTENDANCE_LIST_PAGE_SIZE = 12;
const ACADEMIC_PAGE_SIZE = 12;
const SCHEDULE_PAGE_SIZE = 8;
let scheduleListPage = 1;
let taskListPage = 1;
let materialListPage = 1;
let announcementListPage = 1;

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
      <div><div class="eyebrow">PHASE 6 • Academic Workflow</div><h1>${esc(title)}</h1><p>${esc(copy)}</p></div>
      <span class="phase-badge">ACTIVE</span>
    </div>
    <section class="academic-toolbar panel ${active === 'attendance' ? 'attendance-toolbar' : ''}">
      <div class="academic-search">${svg('i-search')}<input id="academic-search" placeholder="Cari ${esc(title.toLowerCase())}…" autocomplete="off"></div>
      <select id="academic-class-filter" class="control compact-control"><option value="ALL">Semua Kelas</option></select>
      ${active === 'attendance' ? '<select id="academic-attendance-filter" class="control compact-control"><option value="ALL">Semua Mata Pelajaran / Kegiatan</option></select>' : ''}
      <button type="button" id="academic-refresh" class="btn btn-secondary">${svg('i-refresh')} Refresh</button>
    </section>
    <div id="academic-slot">${state.academicHub ? '' : academicSkeleton()}</div>`;

  document.getElementById('app').innerHTML = appShell({ active, content, hideSearch:true });
  bindAppShell();
  bindAcademicToolbar();

  if (state.academicHub) drawAcademicScreen(state.academicHub);
  loadAcademicHub(false);
}

function resetAcademicPages(){scheduleListPage=1;taskListPage=1;materialListPage=1;announcementListPage=1;attendanceListPage=1;}
function pageSlice(items,page,size=ACADEMIC_PAGE_SIZE){const total=Math.max(1,Math.ceil(items.length/size));const safe=Math.min(Math.max(1,page),total);return{page:safe,totalPages:total,total:items.length,items:items.slice((safe-1)*size,safe*size)};}
function academicPager(kind,page,totalPages,total){if(totalPages<=1)return '';return `<div class="table-pagination academic-pagination"><span>${total} item • Halaman ${page}/${totalPages}</span><div><button type="button" data-academic-page-kind="${kind}" data-academic-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>‹</button><button type="button" class="active">${page}</button><button type="button" data-academic-page-kind="${kind}" data-academic-page="${Math.min(totalPages,page+1)}" ${page>=totalPages?'disabled':''}>›</button></div></div>`;}
function bindAcademicToolbar() {
  document.getElementById('academic-search')?.addEventListener('input', () => { resetAcademicPages(); drawAcademicScreen(state.academicHub); });
  document.getElementById('academic-class-filter')?.addEventListener('change', () => {
    resetAcademicPages(); if (activeAcademicScreen === 'attendance') { hydrateAttendanceFilter(state.academicHub, true); }
    drawAcademicScreen(state.academicHub);
  });
  document.getElementById('academic-attendance-filter')?.addEventListener('change', () => { attendanceListPage = 1; drawAcademicScreen(state.academicHub); });
  document.getElementById('academic-refresh')?.addEventListener('click', () => loadAcademicHub(true));
}

export async function loadAcademicHub(force = false) {
  const fresh = state.academicHub && (Date.now() - Number(state.academicHubAt || 0) < HUB_TTL_MS);
  if (!force && fresh) return state.academicHub;
  if (academicHubInFlight) return academicHubInFlight;

  const refreshBtn = document.getElementById('academic-refresh');
  if (refreshBtn && force) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<span class="btn-spinner"></span><span>Memperbarui…</span>';
  }

  academicHubInFlight = (async () => {
    try {
      const hadCache = Boolean(state.academicHub);
      const data = await api('getAcademicHub');
      const changed = !sameData(state.academicHub, data);
      state.academicHub = data;
      state.academicHubAt = Date.now();
      localStorage.setItem('kelasku_academic_cache', JSON.stringify(data));
      localStorage.setItem('kelasku_academic_cache_at', String(state.academicHubAt));
      if (changed || !hadCache) drawAcademicScreen(data);
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
      academicHubInFlight = null;
    }
  })();
  return academicHubInFlight;
}

export function invalidateAcademicClientCache(classId = '') {
  // Stale-while-revalidate: pertahankan data lama agar navigasi tidak kembali ke skeleton.
  // Timestamp dibuat stale sehingga screen berikutnya tetap refresh di background.
  state.academicHubAt = 0;
  localStorage.setItem('kelasku_academic_cache_at', '0');
  if (classId) {
    state.classAcademicAt ||= {};
    state.classAcademicAt[classId] = 0;
    try { localStorage.setItem('kelasku_class_academic_cache_at', JSON.stringify(state.classAcademicAt)); } catch {}
  }
  state.dashboardAt = 0;
  localStorage.setItem('kelasku_dashboard_cache_at', '0');
}

function drawAcademicScreen(data) {
  if (!data) return;
  const slot = document.getElementById('academic-slot');
  if (!slot) return;
  hydrateClassFilter(data);
  if (activeAcademicScreen === 'attendance') hydrateAttendanceFilter(data);

  if (activeAcademicScreen === 'tasks') slot.innerHTML = tasksHtml(filterItems(data.tasks || []));
  else if (activeAcademicScreen === 'materials') slot.innerHTML = materialsHtml(filterItems(data.materials || []));
  else if (activeAcademicScreen === 'announcements') slot.innerHTML = announcementsHtml(filterItems(data.announcements || []));
  else if (activeAcademicScreen === 'attendance') slot.innerHTML = attendanceHtml(filteredAttendanceItems(data));
  else slot.innerHTML = schedulesHtml(filterItems(data.schedules || []), filterItems(data.tasks || []));

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

function attendanceScheduleMap(data) {
  const map = new Map();
  (data?.schedules || []).forEach(item => map.set(String(item.schedule_id || ''), item));
  return map;
}

function attendanceCourseMeta(data, item, scheduleMap = attendanceScheduleMap(data)) {
  const schedule = scheduleMap.get(String(item?.source_schedule_id || ''));
  const rawTitle = String(schedule?.title || attendanceSubject(item) || 'Absensi Kelas').trim();
  const title = rawTitle
    .replace(/^absensi\s*[—–:-]?\s*/i, '')
    .replace(/\s*[•·-]\s*sesi\s*\d+.*$/i, '')
    .trim() || 'Absensi Kelas';
  const recurrence = String(schedule?.recurrence_group_id || '').trim();
  const key = `${String(item?.class_id || '')}::${recurrence || title.toLowerCase()}`;
  return { schedule, title, key };
}

function attendanceSessionNoMap(data) {
  const byCourse = new Map();
  const scheduleMap = attendanceScheduleMap(data);
  (data?.attendance || []).forEach(item => {
    const meta = attendanceCourseMeta(data, item, scheduleMap);
    if (!byCourse.has(meta.key)) byCourse.set(meta.key, []);
    byCourse.get(meta.key).push({ item, schedule: meta.schedule });
  });
  const result = new Map();
  byCourse.forEach(list => {
    list.sort((a,b) => dateMs(a.schedule?.start_at || a.item.start_at, 0) - dateMs(b.schedule?.start_at || b.item.start_at, 0));
    list.forEach((entry, index) => result.set(String(entry.item.attendance_id || ''), index + 1));
  });
  return result;
}

function hydrateAttendanceFilter(data, force = false) {
  const select = document.getElementById('academic-attendance-filter');
  if (!select || !data) return;
  const classId = String(document.getElementById('academic-class-filter')?.value || 'ALL');
  const scheduleMap = attendanceScheduleMap(data);
  const optionMap = new Map();
  (data.attendance || []).forEach(item => {
    if (classId !== 'ALL' && String(item.class_id) !== classId) return;
    const meta = attendanceCourseMeta(data, item, scheduleMap);
    if (!optionMap.has(meta.key)) {
      const label = classId === 'ALL' ? `${item.class_name || 'KelasKu'} • ${meta.title}` : meta.title;
      optionMap.set(meta.key, label);
    }
  });
  const fingerprint = `${classId}|${[...optionMap.entries()].map(([id,label])=>`${id}:${label}`).join('|')}`;
  if (!force && select.dataset.fingerprint === fingerprint) return;
  const previous = select.value || 'ALL';
  select.innerHTML = '<option value="ALL">Semua Mata Pelajaran / Kegiatan</option>'
    + [...optionMap.entries()].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join('');
  select.dataset.fingerprint = fingerprint;
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
  else select.value = 'ALL';
}

function filteredAttendanceItems(data) {
  const scheduleMap = attendanceScheduleMap(data);
  const sessionNoMap = attendanceSessionNoMap(data);
  const selectedCourse = String(document.getElementById('academic-attendance-filter')?.value || 'ALL');
  const query = String(document.getElementById('academic-search')?.value || '').trim().toLowerCase();
  const classId = String(document.getElementById('academic-class-filter')?.value || 'ALL');
  return (data?.attendance || []).map(item => {
    const meta = attendanceCourseMeta(data, item, scheduleMap);
    const schedule = meta.schedule;
    return {
      ...item,
      schedule_title: schedule?.title || attendanceSubject(item),
      schedule_start_at: schedule?.start_at || item.start_at,
      schedule_location: schedule?.location || '',
      attendance_course_key: meta.key,
      attendance_course_title: meta.title,
      attendance_session_no: sessionNoMap.get(String(item.attendance_id || '')) || 0
    };
  }).filter(item => {
    if (classId !== 'ALL' && String(item.class_id) !== classId) return false;
    if (selectedCourse !== 'ALL' && String(item.attendance_course_key) !== selectedCourse) return false;
    if (!query) return true;
    const hay = [item.title,item.attendance_course_title,item.description,item.body,item.location,item.schedule_location,item.class_name].join(' ').toLowerCase();
    return hay.includes(query);
  });
}

function attendanceSubject(item) {
  const title = String(item?.title || '').trim();
  return title.replace(/^absensi\s*[—–:-]?\s*/i,'').replace(/\s*[•·-]\s*sesi\s*\d+.*$/i,'').trim() || 'Absensi Kelas';
}

function schedulePhase(item, now = Date.now()) {
  const state = String(item?.schedule_state || 'NORMAL').toUpperCase();
  if (state === 'CANCELLED') return 'cancelled';
  const start = dateMs(item?.start_at, 0);
  const end = dateMs(item?.end_at, 0);
  if (start > now) return 'upcoming';
  if (end && end >= now) return 'ongoing';
  return 'past';
}

function schedulesHtml(items, tasks = []) {
  if (!items.length && !tasks.length) return emptyAcademic('Belum ada agenda', 'Jadwal dan deadline tugas akan tampil di sini.', 'i-calendar');
  const now = Date.now();
  const calendarStart = now - 7 * 86400000;
  const horizon = now + 23 * 86400000;
  const upcomingAll = items
    .filter(x => ['upcoming','ongoing'].includes(schedulePhase(x, now)))
    .sort((a,b)=>dateMs(a.start_at)-dateMs(b.start_at));
  const past = items
    .filter(x => ['past','cancelled'].includes(schedulePhase(x, now)))
    .sort((a,b)=>dateMs(b.start_at)-dateMs(a.start_at))
    .slice(0,6);
  const pg=pageSlice(upcomingAll,scheduleListPage,SCHEDULE_PAGE_SIZE);scheduleListPage=pg.page;
  const calendarItems = [
    ...items
      .filter(x => dateMs(x.start_at) >= calendarStart && dateMs(x.start_at) <= horizon)
      .map(x => ({kind:'JADWAL',date:x.start_at,end_date:x.end_at,title:x.title,class_name:x.class_name,icon:'i-calendar',schedule_state:x.schedule_state||'NORMAL'})),
    ...tasks
      .filter(x => x.deadline && dateMs(x.deadline) >= calendarStart && dateMs(x.deadline) <= horizon)
      .map(x => ({kind:'DEADLINE',date:x.deadline,title:x.title,class_name:x.class_name,icon:'i-task',schedule_state:'NORMAL'}))
  ].sort((a,b)=>dateMs(a.date)-dateMs(b.date));
  return `<section class="academic-list-layout schedule-hub-v6735">
    <div class="section-title-row"><div><h2>Kalender Akademik 30 Hari</h2><p>7 hari terakhir + 23 hari ke depan. Agenda yang lewat diberi tanda otomatis.</p></div></div>
    <div class="academic-calendar-strip">${calendarItems.length?calendarItems.slice(0,18).map(calendarMiniCard).join(''):'<div class="search-empty">Tidak ada agenda 30 hari ke depan.</div>'}</div>
    <div class="section-title-row"><div><h2>Agenda Mendatang</h2><p>${upcomingAll.length} agenda aktif / mendatang</p></div></div>
    <div class="academic-card-list schedule-agenda-grid">${pg.items.length ? pg.items.map(scheduleCard).join('') : '<div class="search-empty">Belum ada agenda mendatang.</div>'}</div>
    ${academicPager('schedule',pg.page,pg.totalPages,pg.total)}
    ${past.length ? `<div class="section-title-row"><div><h2>Riwayat Terbaru</h2><p>${past.length} agenda terakhir</p></div></div><div class="academic-card-list schedule-agenda-grid is-muted">${past.map(scheduleCard).join('')}</div>` : ''}
  </section>`;
}

function calendarMiniCard(item){
  const now=Date.now(),d=new Date(item.date),p=safeDateParts(d);
  const cancelled=String(item.schedule_state||'NORMAL').toUpperCase()==='CANCELLED';
  const passed=!cancelled && dateMs(item.end_date||item.date,0)<now;
  const stamp=cancelled?'BATAL':passed?(item.kind==='DEADLINE'?'LEWAT':'SELESAI'):'';
  return `<article class="calendar-mini-card ${cancelled?'is-cancelled':passed?'is-past':''}">
    <div class="academic-date-tile compact"><strong>${p.day}</strong><span>${p.month}</span></div>
    <div><span>${esc(item.kind)} · ${esc(item.class_name||'KelasKu')}</span><strong>${esc(item.title||'-')}</strong><small>${esc(shortDateTime(item.date))}</small></div>
    ${stamp?`<span class="calendar-state-stamp ${cancelled?'danger':'done'}">${esc(stamp)}</span>`:svg(item.icon)}
  </article>`;
}

function scheduleCard(item) {
  const d = new Date(item.start_at);
  const date = safeDateParts(d);
  const state = String(item.schedule_state || 'NORMAL').toUpperCase();
  const phase = schedulePhase(item);
  const stateBadge = state === 'CANCELLED'
    ? '<span class="schedule-state-badge cancelled">Dibatalkan</span>'
    : state === 'CHANGED'
      ? '<span class="schedule-state-badge changed">Diubah</span>'
      : '';
  const phaseBadge = phase === 'ongoing'
    ? '<span class="soft-chip schedule-phase ongoing">Berlangsung</span>'
    : phase === 'past'
      ? '<span class="soft-chip schedule-phase done">Selesai</span>'
      : '';
  const description = String(item.description || '').trim();
  return `<article class="academic-row-card schedule-agenda-card schedule-row-${state.toLowerCase()} phase-${phase}">
    <div class="schedule-agenda-top">
      <div class="academic-date-tile"><strong>${date.day}</strong><span>${date.month}</span></div>
      <div class="schedule-agenda-copy">
        <div class="schedule-agenda-titleline"><h3>${esc(item.title || 'Agenda')}</h3>${stateBadge}</div>
        <p>${esc([item.class_name || 'KelasKu', shortDateTime(item.start_at), item.location || description].filter(Boolean).join(' · '))}</p>
      </div>
    </div>
    <div class="schedule-agenda-pills">
      <span class="soft-chip"><span class="material-symbols-rounded">schedule</span>${esc(timeRange(item.start_at,item.end_at) || 'Waktu')}</span>
      ${item.location?`<span class="soft-chip"><span class="material-symbols-rounded">location_on</span>${esc(item.location)}</span>`:''}
      ${item.recurrence_group_id?'<span class="soft-chip"><span class="material-symbols-rounded">event_repeat</span>Berulang</span>':''}
      ${phaseBadge}
      ${item.change_note?`<span class="soft-chip schedule-note-pill">${esc(item.change_note)}</span>`:''}
    </div>
  </article>`;
}

function tasksHtml(items) {
  if (!items.length) return emptyAcademic('Belum ada tugas', 'Tugas dari seluruh kelas akan tampil di sini.', 'i-task');
  const openAll = items.filter(x => !['SUBMITTED','LATE'].includes(String(x.submission_status)) || String(x.submission?.review_status||'') === 'NEEDS_REVISION').sort((a,b)=>dateMs(a.deadline,Infinity)-dateMs(b.deadline,Infinity));
  const doneAll = items.filter(x => ['SUBMITTED','LATE'].includes(String(x.submission_status)) && String(x.submission?.review_status||'') !== 'NEEDS_REVISION').sort((a,b)=>dateMs(b.deadline,0)-dateMs(a.deadline,0));
  const ordered=[...openAll,...doneAll];const pg=pageSlice(ordered,taskListPage);taskListPage=pg.page;
  const pageOpen=pg.items.filter(x=>openAll.includes(x)),pageDone=pg.items.filter(x=>doneAll.includes(x));
  return `<section class="academic-list-layout">
    <div class="academic-summary-strip"><div><strong>${openAll.length}</strong><span>Belum dikumpulkan</span></div><div><strong>${doneAll.length}</strong><span>Sudah dikumpulkan</span></div><div><strong>${items.length}</strong><span>Total aktif</span></div></div>
    ${pageOpen.length?`<div class="section-title-row"><div><h2>Perlu Dikerjakan</h2><p>Urut deadline terdekat.</p></div></div><div class="academic-card-list">${pageOpen.map(taskCard).join('')}</div>`:''}
    ${pageDone.length?`<div class="section-title-row"><div><h2>Sudah Dikumpulkan</h2><p>Riwayat pengumpulan.</p></div></div><div class="academic-card-list is-muted">${pageDone.map(taskCard).join('')}</div>`:''}
    ${academicPager('tasks',pg.page,pg.totalPages,pg.total)}
  </section>`;
}
function taskCard(item) {
  const status = taskStatus(item);
  const sub = item.submission || {};
  const grade = sub.score !== '' && sub.score !== undefined ? ` · Nilai ${sub.score}/${item.max_score || 0}` : '';
  const review = sub.review_status ? ` · ${sub.review_status === 'NEEDS_REVISION' ? 'Perlu Revisi' : sub.review_status === 'REVIEWED' ? 'Sudah Dinilai' : 'Menunggu Review'}` : '';
  return `<button type="button" class="academic-row-card academic-row-button" data-open-task="${esc(item.task_id)}">
    <span class="academic-type-icon">${svg('i-task')}</span>
    <span class="academic-row-main"><span class="academic-meta-line"><span>${esc(item.class_name || 'KelasKu')}</span><span>${esc(deadlineText(item.deadline))}</span><span>Maks ${esc(String(item.max_score || 0))}</span></span><strong class="academic-row-title">${esc(item.title)}</strong><span class="academic-row-copy">${esc(item.description || 'Tidak ada deskripsi.')}${esc(review + grade)}</span></span>
    <span class="academic-status-pill status-${status.key.toLowerCase()}">${esc(status.label)}</span>
  </button>`;
}

function materialsHtml(items) {
  if (!items.length) return emptyAcademic('Belum ada materi', 'Materi yang dibagikan kelas akan tampil di sini.', 'i-file');
  const ordered=[...items].sort((a,b)=>dateMs(b.published_at,0)-dateMs(a.published_at,0));const pg=pageSlice(ordered,materialListPage);materialListPage=pg.page;
  return `<section class="academic-list-layout"><div class="academic-material-grid">${pg.items.map(materialCard).join('')}</div>${academicPager('materials',pg.page,pg.totalPages,pg.total)}</section>`;
}

function materialCard(item) {
  const attachments=item.attachments||[];const images=attachments.filter(a=>String(a.mime_type||'').startsWith('image/')).length;const files=attachments.length-images;const refs=item.url?1:0;
  return `<article class="academic-material-card panel academic-material-card-v6734">
    <div class="academic-material-head"><div class="academic-material-icon">${svg(['LINK','DRIVE_LINK'].includes(item.material_type) ? 'i-link' : 'i-file')}</div><div class="academic-meta-line"><span>${esc(item.class_name || 'KelasKu')}</span><span>${esc(shortDate(item.published_at))}</span></div></div>
    <h3>${esc(item.title)}</h3>${item.topic?`<span class="soft-chip material-topic-chip">${esc(item.topic)}</span>`:''}<p>${esc(item.description || 'Materi kelas.')}</p>
    <div class="material-kpi-line">${images?`<span><span class="material-symbols-rounded">image</span>${images} gambar</span>`:''}${files?`<span><span class="material-symbols-rounded">description</span>${files} file</span>`:''}${refs?`<span><span class="material-symbols-rounded">link</span>${refs} link</span>`:''}</div>
    <button type="button" class="btn btn-secondary academic-open-material" data-open-material="${esc(item.material_id)}">${svg('i-eye')} Buka Materi</button>
  </article>`;
}

function academicAttachmentButton(a,i){return `<button type="button" class="material-download-row" data-preview-academic-file data-preview-url="${esc(a.preview_url||a.url||'')}" data-download-url="${esc(a.download_url||a.url||'')}" data-mime="${esc(a.mime_type||'')}" data-filename="${esc(a.filename||`Lampiran ${i+1}`)}" data-file-type="${esc(a.type||'FILE')}"><span class="material-symbols-rounded">${a.type==='LINK'?'link':String(a.mime_type||'').startsWith('image/')?'image':String(a.mime_type||'').includes('spreadsheet')?'table_view':String(a.mime_type||'').includes('pdf')?'picture_as_pdf':'description'}</span><span><strong>${esc(a.filename||`Lampiran ${i+1}`)}</strong><small>${a.type==='LINK'?'Buka tautan':'Preview di KelasKu'}</small></span><span class="material-symbols-rounded">visibility</span></button>`;}
function academicAttachmentList(items=[]){if(!items.length)return'';return `<div class="material-download-section"><strong>Lampiran (${items.length})</strong><div class="material-download-list">${items.map(academicAttachmentButton).join('')}</div></div>`;}
function openMaterialModal(item){if(!item)return;showModal(`<div class="modal-head"><div><div class="eyebrow">MATERI • ${esc(item.class_name||'KelasKu')}</div><h2>${esc(item.title)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="task-modal-meta"><span>${svg('i-calendar')} ${esc(shortDate(item.published_at))}</span>${item.meeting_no?`<span class="soft-chip">Pertemuan ${esc(item.meeting_no)}</span>`:''}</div><p class="copy compact-copy">${esc(item.description||'Tidak ada deskripsi.')}</p>${item.url?`<button type="button" class="btn btn-secondary btn-block" data-open-url="${esc(item.url)}">${svg('i-link')} Buka Tautan Materi</button>`:''}${academicAttachmentList(item.attachments||[])}`);bindFilePreviewButtons(document.getElementById('phase-modal')||document);document.querySelectorAll('[data-open-url]').forEach(btn=>btn.onclick=()=>openExternal(btn.dataset.openUrl));}

function announcementsHtml(items) {
  if (!items.length) return emptyAcademic('Belum ada pengumuman', 'Pengumuman resmi kelas akan tampil di sini.', 'i-mega');
  const ordered=[...items].sort((a,b)=>dateMs(b.published_at,0)-dateMs(a.published_at,0));const pg=pageSlice(ordered,announcementListPage);announcementListPage=pg.page;
  return `<section class="academic-list-layout"><div class="announcement-feed">${pg.items.map(announcementCard).join('')}</div>${academicPager('announcements',pg.page,pg.totalPages,pg.total)}</section>`;
}
function announcementCard(item) {
  return `<article class="announcement-card priority-${String(item.priority||'normal').toLowerCase()}">
    <div class="announcement-marker">${svg('i-mega')}</div>
    <div><div class="academic-meta-line"><span>${esc(item.class_name || 'KelasKu')}</span><span>${esc(shortDateTime(item.published_at))}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.body || '')}</p></div>
    <span class="soft-chip">${esc(item.priority || 'NORMAL')}</span>
  </article>`;
}

function attendanceUiState(item) {
  const status = String(item?.my_status || 'UNMARKED').toUpperCase();
  const windowStatus = String(item?.window_status || '').toUpperCase();
  if (status === 'PRESENT') return { key:'done', label:'Hadir', group:'done', icon:'check_circle' };
  if (status === 'SICK') return { key:'open', label:'Sakit', group:'done', icon:'sick' };
  if (status === 'PERMIT') return { key:'open', label:'Izin', group:'done', icon:'assignment' };
  if (status === 'ABSENT') return { key:'overdue', label:'Alpa', group:'done', icon:'cancel' };
  if (windowStatus === 'OPEN') return { key:'waiting', label:'Belum presensi', group:'waiting', icon:'schedule' };
  if (windowStatus === 'UPCOMING') return { key:'locked', label:'Belum dibuka', group:'upcoming', icon:'lock_clock' };
  return { key:'closed', label:'Ditutup', group:'closed', icon:'lock' };
}

function attendanceSessionLabel(item) {
  const no = Number(item.attendance_session_no || 0);
  if (no) return `Sesi ${String(no).padStart(2,'0')}`;
  const m = String(item.title || '').match(/sesi\s*(\d+)/i);
  return m ? `Sesi ${String(Number(m[1])).padStart(2,'0')}` : 'Sesi';
}

function attendanceHtml(items) {
  if (!items.length) return emptyAcademic('Tidak ada data pada filter ini', 'Pilih kelas atau mata pelajaran/kegiatan lain untuk melihat riwayat absensi.', 'i-check');
  const states = items.map(attendanceUiState);
  const done = states.filter(x=>x.group==='done').length;
  const waiting = states.filter(x=>x.group==='waiting').length;
  const upcoming = states.filter(x=>x.group==='upcoming').length;
  const classMap = new Map();
  items.forEach(item => {
    const classKey = String(item.class_id || 'UNKNOWN');
    if (!classMap.has(classKey)) classMap.set(classKey, { id: classKey, name: item.class_name || 'KelasKu', items: [], courses: new Map() });
    const cls = classMap.get(classKey);
    cls.items.push(item);
    const courseKey = String(item.attendance_course_key || `${classKey}::${item.attendance_course_title || 'Absensi'}`);
    if (!cls.courses.has(courseKey)) cls.courses.set(courseKey, { key: courseKey, title: item.attendance_course_title || attendanceSubject(item), items: [] });
    cls.courses.get(courseKey).items.push(item);
  });
  const selectedClass = String(document.getElementById('academic-class-filter')?.value || 'ALL');
  const selectedCourse = String(document.getElementById('academic-attendance-filter')?.value || 'ALL');
  const query = String(document.getElementById('academic-search')?.value || '').trim();
  const classCards = [...classMap.values()].sort((a,b)=>a.name.localeCompare(b.name)).map((cls,ci)=>{
    const classWaiting = cls.items.filter(x=>attendanceUiState(x).group==='waiting').length;
    const classDone = cls.items.filter(x=>attendanceUiState(x).group==='done').length;
    const classUpcoming = cls.items.filter(x=>attendanceUiState(x).group==='upcoming').length;
    const autoOpen = selectedClass !== 'ALL' || selectedCourse !== 'ALL' || Boolean(query) || classWaiting > 0;
    const classPanelId = `attendance-class-${ci}`;
    const courses = [...cls.courses.values()].sort((a,b)=>{
      const aw=a.items.some(x=>attendanceUiState(x).group==='waiting')?0:1,bw=b.items.some(x=>attendanceUiState(x).group==='waiting')?0:1;
      return aw-bw || a.title.localeCompare(b.title);
    }).map((course,cx)=>{
      const courseDone=course.items.filter(x=>attendanceUiState(x).group==='done').length;
      const courseWaiting=course.items.filter(x=>attendanceUiState(x).group==='waiting').length;
      const courseUpcoming=course.items.filter(x=>attendanceUiState(x).group==='upcoming').length;
      const courseOpen = selectedCourse === course.key || Boolean(query) || courseWaiting > 0;
      const coursePanelId=`attendance-course-${ci}-${cx}`;
      const ordered=[...course.items].sort((a,b)=>{
        const rank={waiting:0,done:1,upcoming:2,closed:3};
        const ar=rank[attendanceUiState(a).group]??9,br=rank[attendanceUiState(b).group]??9;
        return ar-br || dateMs(b.schedule_start_at||b.start_at,0)-dateMs(a.schedule_start_at||a.start_at,0);
      });
      return `<section class="attendance-hub-course ${courseOpen?'open':''}">
        <button type="button" class="attendance-hub-course-head" data-global-attendance-course-toggle aria-expanded="${courseOpen?'true':'false'}" aria-controls="${coursePanelId}">
          <span class="attendance-hub-course-copy"><span class="eyebrow">MATA PELAJARAN / KEGIATAN</span><strong>${esc(course.title)}</strong><small>${course.items.length} sesi${courseDone?` · ${courseDone} sudah`:''}${courseWaiting?` · ${courseWaiting} perlu presensi`:''}${courseUpcoming?` · ${courseUpcoming} belum dibuka`:''}</small></span>
          <span class="attendance-hub-head-side"><span class="material-symbols-rounded">how_to_reg</span><span class="material-symbols-rounded attendance-hub-chevron">expand_more</span></span>
        </button>
        <div class="attendance-hub-session-list" id="${coursePanelId}" ${courseOpen?'':'hidden'}>${ordered.map(attendanceHubSessionRow).join('')}</div>
      </section>`;
    }).join('');
    return `<section class="attendance-hub-class ${autoOpen?'open':''}">
      <button type="button" class="attendance-hub-class-head" data-global-attendance-class-toggle aria-expanded="${autoOpen?'true':'false'}" aria-controls="${classPanelId}">
        <span class="academic-type-icon attendance-icon">${svg('i-class')}</span>
        <span class="attendance-hub-class-copy"><strong>${esc(cls.name)}</strong><small>${cls.courses.size} mata pelajaran/kegiatan · ${classDone} sudah${classWaiting?` · ${classWaiting} perlu presensi`:''}${classUpcoming?` · ${classUpcoming} belum dibuka`:''}</small></span>
        <span class="material-symbols-rounded attendance-hub-chevron">expand_more</span>
      </button>
      <div class="attendance-hub-course-list" id="${classPanelId}" ${autoOpen?'':'hidden'}>${courses}</div>
    </section>`;
  }).join('');
  return `<section class="academic-list-layout attendance-hub-v673">
    <div class="academic-summary-strip attendance-hub-summary">
      <div><strong>${done}</strong><span>Sudah Presensi</span></div>
      <div><strong>${waiting}</strong><span>Belum Presensi</span></div>
      <div><strong>${upcoming}</strong><span>Belum Dibuka</span></div>
      <div><strong>${items.length}</strong><span>Total Sesi</span></div>
    </div>
    <div class="attendance-hub-note"><span class="material-symbols-rounded">account_tree</span><span>Kelas → mata pelajaran/kegiatan → sesi. Buka hanya bagian yang dibutuhkan.</span></div>
    <div class="attendance-hub-class-list">${classCards}</div>
  </section>`;
}

function attendanceHubSessionRow(item) {
  const ui = attendanceUiState(item);
  const date = safeDateParts(new Date(item.schedule_start_at || item.start_at));
  const canOpen = ui.group === 'waiting' && Boolean(item.public_token);
  const statusDetail = ui.group === 'done'
    ? `${ui.label}${item.my_channel ? ` • ${String(item.my_channel).toUpperCase()==='YOUTUBE'?'YouTube':String(item.my_channel).charAt(0)+String(item.my_channel).slice(1).toLowerCase()}` : ''}`
    : ui.label;
  return `<article class="attendance-hub-session state-${ui.group}">
    <span class="academic-date-tile compact"><strong>${esc(date.day)}</strong><span>${esc(date.month)}</span></span>
    <span class="attendance-hub-session-copy"><span><b>${esc(attendanceSessionLabel(item))}</b><i>${esc(shortDateTime(item.schedule_start_at || item.start_at))}</i></span><small>${esc(item.schedule_location || item.my_note || 'Tidak ada catatan tambahan.')}</small></span>
    <span class="attendance-hub-status status-${ui.group}"><span class="material-symbols-rounded">${ui.icon}</span>${esc(statusDetail)}</span>
    ${canOpen?`<button type="button" class="session-action-btn attendance-hub-action" data-global-attendance-token="${esc(item.public_token)}"><span class="material-symbols-rounded">how_to_reg</span><span>Isi Presensi</span></button>`:''}
  </article>`;
}

function attendanceStatusMeta(value) {
  const key = String(value || 'UNMARKED').toUpperCase();
  if (key === 'PRESENT') return { key:'done', label:'Hadir' };
  if (key === 'SICK') return { key:'open', label:'Sakit' };
  if (key === 'PERMIT') return { key:'open', label:'Izin' };
  if (key === 'ABSENT') return { key:'overdue', label:'Alpa' };
  return { key:'open', label:'Belum' };
}

function bindAcademicRows() {
  document.querySelectorAll('[data-open-task]').forEach(btn => btn.onclick = () => openTaskModal(btn.dataset.openTask));
  document.querySelectorAll('[data-open-url]').forEach(btn => btn.onclick = () => openExternal(btn.dataset.openUrl));
  document.querySelectorAll('[data-open-material]').forEach(btn=>btn.onclick=()=>openMaterialModal((state.academicHub?.materials||[]).find(x=>String(x.material_id)===String(btn.dataset.openMaterial))));
  document.querySelectorAll('[data-academic-page-kind]').forEach(btn=>btn.onclick=()=>{const page=Number(btn.dataset.academicPage)||1;const kind=btn.dataset.academicPageKind;if(kind==='schedule')scheduleListPage=page;if(kind==='tasks')taskListPage=page;if(kind==='materials')materialListPage=page;if(kind==='announcements')announcementListPage=page;drawAcademicScreen(state.academicHub);window.scrollTo({top:0,behavior:'smooth'});});
  bindFilePreviewButtons(document);
  document.querySelectorAll('[data-academic-attendance-page]').forEach(btn => btn.onclick = () => { attendanceListPage = Number(btn.dataset.academicAttendancePage) || 1; drawAcademicScreen(state.academicHub); });
  document.querySelectorAll('[data-global-attendance-class-toggle]').forEach(btn => btn.onclick = () => { const panel=document.getElementById(btn.getAttribute('aria-controls')); const opening=panel?.hidden!==false; if(panel)panel.hidden=!opening; btn.closest('.attendance-hub-class')?.classList.toggle('open',opening); btn.setAttribute('aria-expanded',String(opening)); });
  document.querySelectorAll('[data-global-attendance-course-toggle]').forEach(btn => btn.onclick = () => { const panel=document.getElementById(btn.getAttribute('aria-controls')); const opening=panel?.hidden!==false; if(panel)panel.hidden=!opening; btn.closest('.attendance-hub-course')?.classList.toggle('open',opening); btn.setAttribute('aria-expanded',String(opening)); });
  document.querySelectorAll('[data-global-attendance-token]').forEach(btn => btn.onclick = () => openGlobalAttendance(btn.dataset.globalAttendanceToken));
  document.getElementById('academic-open-classes')?.addEventListener('click', () => go('classes'));
}

function attendanceChannelLabel(value){
  return ({ZOOM:'Zoom',YOUTUBE:'YouTube',OFFLINE:'Offline',OTHER:'Lainnya'})[String(value||'').toUpperCase()] || String(value||'');
}

function attendanceStatusLabel(value){
  return ({PRESENT:'Hadir',SICK:'Sakit',PERMIT:'Izin',ABSENT:'Alpa',UNMARKED:'Belum'})[String(value||'UNMARKED').toUpperCase()] || String(value||'-');
}

function openGlobalAttendance(token=''){
  const clean=String(token||'').trim();
  if(!clean)return;
  const item=(state.academicHub?.attendance||[]).find(x=>String(x.public_token||'')===clean);
  if(!item){toast('Sesi presensi tidak ditemukan pada data terbaru. Tekan Refresh lalu coba lagi.');return;}
  openGlobalAttendanceForm(item);
}

function openGlobalAttendanceForm(item){
  const status=String(item.window_status||'OPEN').toUpperCase();
  const marked=String(item.my_status||'UNMARKED').toUpperCase()!=='UNMARKED';
  const rawChannels=Array.isArray(item.channels)?item.channels.filter(Boolean):[];
  const channels=rawChannels.length?rawChannels:['ZOOM','YOUTUBE','OFFLINE'];
  const choices=[
    ['PRESENT','Hadir','check_circle'],
    ...(item.sick_enabled!==false?[['SICK','Sakit','sick']]:[]),
    ...(item.permit_enabled!==false?[['PERMIT','Izin','assignment']]:[])
  ];
  if(marked){
    showModal(`<div class="modal-head"><div><div class="eyebrow">PRESENSI • ${esc(item.class_name||'KelasKu')}</div><h2>${esc(attendanceSubject(item))}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>
      <div class="attendance-inline-success"><span class="material-symbols-rounded">check_circle</span><div><strong>Presensi sudah tercatat</strong><small>${esc(attendanceStatusLabel(item.my_status))}${item.my_channel?` • ${esc(attendanceChannelLabel(item.my_channel))}`:''}${item.my_punctuality?` • ${esc(String(item.my_punctuality)==='LATE'?'Terlambat':'Tepat waktu')}`:''}</small></div></div>`);
    return;
  }
  if(status!=='OPEN'){
    showModal(`<div class="modal-head"><div><div class="eyebrow">PRESENSI • ${esc(item.class_name||'KelasKu')}</div><h2>${esc(attendanceSubject(item))}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="alert">${status==='UPCOMING'?'Presensi belum dibuka.':'Waktu presensi sudah ditutup.'}</div>`);
    return;
  }
  showModal(`<div class="modal-head"><div><div class="eyebrow">PRESENSI • ${esc(item.class_name||'KelasKu')}</div><h2>${esc(attendanceSubject(item))}</h2><p class="compact-copy">${esc(attendanceSessionLabel(item))} • ${esc(shortDateTime(item.schedule_start_at||item.start_at))}</p></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>
    <div class="attendance-inline-form">
      <div class="attendance-form-label">Status kehadiran</div>
      <div class="attendance-status-choice">${choices.map(([v,l,i])=>`<button type="button" data-global-att-status="${v}" class="attendance-choice ${v==='PRESENT'?'active':''}"><span class="material-symbols-rounded">${i}</span><span>${l}</span></button>`).join('')}</div>
      <div id="global-attendance-channel-choice" class="attendance-channel-choice">
        <div class="attendance-form-label">Mengikuti melalui</div>
        <div class="attendance-channel-row">${channels.map((ch,i)=>`<button type="button" data-global-att-channel="${esc(ch)}" class="attendance-channel ${i===0?'active':''}">${esc(attendanceChannelLabel(ch))}</button>`).join('')}</div>
      </div>
      <label class="field attendance-note-field"><span>Catatan <small>(opsional)</small></span><input id="global-attendance-note" class="control" placeholder="Catatan singkat"></label>
      <div id="global-attendance-status" class="request-status"></div>
      <button type="button" id="global-attendance-submit" class="btn btn-primary btn-block">Kirim Presensi</button>
    </div>`);
  let selectedStatus='PRESENT',selectedChannel=String(channels[0]||'ZOOM');
  document.querySelectorAll('[data-global-att-status]').forEach(btn=>btn.onclick=()=>{
    selectedStatus=btn.dataset.globalAttStatus;
    document.querySelectorAll('[data-global-att-status]').forEach(x=>x.classList.toggle('active',x===btn));
    document.getElementById('global-attendance-channel-choice')?.classList.toggle('hidden',selectedStatus!=='PRESENT');
  });
  document.querySelectorAll('[data-global-att-channel]').forEach(btn=>btn.onclick=()=>{
    selectedChannel=btn.dataset.globalAttChannel;
    document.querySelectorAll('[data-global-att-channel]').forEach(x=>x.classList.toggle('active',x===btn));
  });
  document.getElementById('global-attendance-submit')?.addEventListener('click',async()=>{
    const btn=document.getElementById('global-attendance-submit'),statusEl=document.getElementById('global-attendance-status');
    if(!btn||btn.disabled)return;
    const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Mencatat…</span>';
    statusEl.className='request-status progress';statusEl.textContent='Mencatat presensi…';
    try{
      const result=await api('selfCheckInAttendance',{
        token:String(item.public_token||''),
        attendance_status:selectedStatus,
        attendance_channel:selectedStatus==='PRESENT'?selectedChannel:'',
        note:document.getElementById('global-attendance-note')?.value||''
      },{onSlow:()=>statusEl.textContent='Server masih memproses. Jangan klik dua kali.'});
      item.my_status=result.attendance_status||selectedStatus;
      item.my_channel=result.attendance_channel||'';
      item.my_punctuality=result.punctuality||'';
      closeModal();
      drawAcademicScreen(state.academicHub);
      toast(`Presensi tersimpan: ${attendanceStatusLabel(item.my_status)}.`);
      invalidateAcademicClientCache(item.class_id||'');
      loadAcademicHub(true).catch(()=>{});
    }catch(err){
      statusEl.className='request-status error';statusEl.textContent=err.message;btn.disabled=false;btn.innerHTML=old;
    }
  });
}

function academicAttachmentLinks(items=[]){if(!items.length)return '';return `<div class="task-supporting-list"><strong>Lampiran Pendukung</strong>${items.map(academicAttachmentButton).join('')}</div>`;}
function bindFilePreviewButtons(root=document){root.querySelectorAll?.('[data-preview-academic-file]').forEach(btn=>btn.onclick=()=>openAcademicFilePreview({preview_url:btn.dataset.previewUrl,download_url:btn.dataset.downloadUrl,mime_type:btn.dataset.mime,filename:btn.dataset.filename,type:btn.dataset.fileType}));}
function openAcademicFilePreview(file){if(String(file?.type||'').toUpperCase()==='LINK'){openExternal(file.preview_url||file.download_url);return;}document.getElementById('academic-file-preview-overlay')?.remove();const overlay=document.createElement('div');overlay.id='academic-file-preview-overlay';overlay.className='overlay academic-file-preview-overlay';const mime=String(file?.mime_type||''),url=file?.preview_url||file?.download_url||'',name=file?.filename||'Lampiran';const viewer=mime.startsWith('image/')?`<div class="academic-image-viewer"><img src="${esc(url)}" alt="${esc(name)}"></div>`:mime.startsWith('video/')?`<video class="academic-video-viewer" controls src="${esc(url)}"></video>`:`<iframe class="academic-doc-viewer" src="${esc(url)}" title="${esc(name)}" loading="lazy"></iframe>`;overlay.innerHTML=`<div class="modal glass academic-file-preview-card"><div class="modal-head"><div><div class="eyebrow">PREVIEW LAMPIRAN</div><h2>${esc(name)}</h2></div><button class="icon-btn mini" data-file-preview-close>${svg('i-close')}</button></div>${viewer}<div class="modal-actions"><a class="btn btn-secondary" href="${esc(file.download_url||url)}" target="_blank" rel="noopener noreferrer">${svg('i-download')} Download</a></div></div>`;document.body.appendChild(overlay);overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};overlay.querySelector('[data-file-preview-close]')?.addEventListener('click',()=>overlay.remove());}


export function openTaskModal(taskId, sourceItems = null, options = {}) {
  const pool = Array.isArray(sourceItems) ? sourceItems : (state.academicHub?.tasks || []);
  const item = pool.find(x => String(x.task_id) === String(taskId));
  if (!item) return;
  const mode = String(item.submission_mode || 'NONE').toUpperCase();
  const sub = item.submission || {};
  const existing=(sub.attachments||[]).map(a=>({...a,existing:true}));
  if(sub.submission_image_url&&!existing.some(a=>String(a.file_id)===String(sub.submission_image_file_id)))existing.push({file_id:sub.submission_image_file_id||'',filename:sub.submission_image_name||'Lampiran gambar',mime_type:'image/jpeg',type:'IMAGE',url:sub.submission_image_url,preview_url:sub.submission_image_url,download_url:sub.submission_image_url,existing:true});
  showModal(`
    <div class="modal-head"><div><div class="eyebrow">Tugas • ${esc(item.class_name || 'KelasKu')}</div><h2>${esc(item.title)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>
    <div class="task-modal-meta"><span>${svg('i-calendar')} ${esc(deadlineText(item.deadline))}</span><span class="academic-status-pill status-${taskStatus(item).key.toLowerCase()}">${esc(taskStatus(item).label)}</span></div>
    <p class="copy compact-copy task-description">${esc(item.description || 'Tidak ada deskripsi tugas.')}</p>${academicAttachmentLinks(item.attachments||[])}
    ${sub.review_status ? `<div class="task-review-feedback ${sub.review_status==='NEEDS_REVISION'?'needs-revision':'reviewed'}"><div><span>Review Pengajar</span><strong>${sub.review_status==='NEEDS_REVISION'?'Perlu Revisi':'Sudah Dinilai'}${sub.score!==''&&sub.score!==undefined?` · ${esc(String(sub.score))}/${esc(String(item.max_score||0))}`:''}</strong></div><p>${esc(sub.feedback||'Tidak ada feedback tambahan.')}</p></div>` : ''}
    ${mode === 'NONE' ? '<div class="alert success">Tugas ini tidak memerlukan pengumpulan melalui KelasKu.</div>' : `
      <form id="task-submit-form">
        ${mode !== 'LINK' ? `<div class="field"><label>Jawaban / Catatan</label><textarea name="submission_text" class="control" rows="5" placeholder="Tulis jawaban atau catatan pengumpulan…">${esc(sub.submission_text || '')}</textarea></div>` : ''}
        ${mode !== 'TEXT' ? `<div class="field"><label>Tautan Pengumpulan</label><input name="submission_url" class="control" type="url" placeholder="https://…" value="${esc(sub.submission_url || '')}"></div>` : ''}
        <div class="field"><label>Lampiran <span class="field-optional">maks. 12 file</span></label><input id="task-files-input" type="file" multiple class="control" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"><div class="form-help">Gambar dikompresi otomatis. File dokumen maksimal 4 MB per file. XLSX/PDF/DOC dapat dipreview oleh pengelola.</div><div id="task-files-list" class="attachment-queue"></div></div>
        <div id="task-submit-status" class="request-status"></div>
        <button id="task-submit-btn" class="btn btn-primary btn-block" type="submit">${sub.submission_id ? 'Perbarui Pengumpulan' : 'Kumpulkan Tugas'}</button>
      </form>`}
  `);
  bindFilePreviewButtons(document.getElementById('phase-modal')||document);
  const form = document.getElementById('task-submit-form');if(!form)return;
  const input=document.getElementById('task-files-input'),listEl=document.getElementById('task-files-list');
  const queue=[...existing];
  const renderQueue=()=>{if(!listEl)return;listEl.innerHTML=queue.length?queue.map((f,i)=>`<div class="attachment-queue-row"><span class="material-symbols-rounded">${String(f.mime_type||f.type||'').startsWith('image/')||f.type==='IMAGE'?'image':'attach_file'}</span><span><strong>${esc(f.filename||f.name||`Lampiran ${i+1}`)}</strong><small>${f.existing?'Tersimpan':formatBytes(f.size||0)}</small></span>${f.existing?`<button type="button" class="icon-btn mini" data-preview-academic-file data-preview-url="${esc(f.preview_url||f.url||'')}" data-download-url="${esc(f.download_url||f.url||'')}" data-mime="${esc(f.mime_type||'')}" data-filename="${esc(f.filename||'Lampiran')}" data-file-type="${esc(f.type||'FILE')}"><span class="material-symbols-rounded">visibility</span></button>`:''}<button type="button" class="icon-btn mini" data-remove-task-file="${i}" title="Hapus dari pengumpulan"><span class="material-symbols-rounded">close</span></button></div>`).join(''):'<div class="compact-upload-note">Belum ada lampiran.</div>';listEl.querySelectorAll('[data-remove-task-file]').forEach(btn=>btn.onclick=()=>{queue.splice(Number(btn.dataset.removeTaskFile),1);renderQueue();});bindFilePreviewButtons(listEl);};
  renderQueue();
  input?.addEventListener('change',()=>{for(const f of [...(input.files||[])]){if(queue.length>=12)break;queue.push({raw:f,name:f.name,filename:f.name,size:f.size,mime_type:f.type,existing:false});}input.value='';renderQueue();});
  form.onsubmit=e=>submitTask(e,item,{...options,files:()=>queue});
}

async function submitTask(event, item, options = {}) {
  event.preventDefault();const form=event.currentTarget,btn=document.getElementById('task-submit-btn'),status=document.getElementById('task-submit-status'),old=btn.innerHTML;if(btn.disabled)return;
  btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Mengirim…</span>';status.className='request-status progress';status.textContent='Menyiapkan lampiran…';
  try{
    const queue=options.files?.()||[];const ids=[];const newFiles=queue.filter(x=>!x.existing);const existingIds=queue.filter(x=>x.existing&&x.file_id).map(x=>x.file_id);ids.push(...existingIds);
    for(let i=0;i<newFiles.length;i++){
      const f=newFiles[i].raw;status.textContent=`Mengupload ${i+1}/${newFiles.length}: ${f.name}`;let dataUrl='',filename=f.name;
      if(String(f.type||'').startsWith('image/')){const processed=await compressImageFile(f,{maxEdge:1600,targetBytes:700000});dataUrl=processed.dataUrl;filename=processed.name;}
      else{if(f.size>4000000)throw new Error(`${f.name} terlalu besar. Maksimal 4 MB per file.`);dataUrl=await fileToDataUrl(f);}
      const up=await api('uploadTaskSubmissionAttachment',{task_id:item.task_id,filename,data_url:dataUrl},{timeout:45000,timeoutMessage:`Upload ${f.name} membutuhkan waktu lebih lama. Jangan kirim ulang pengumpulan sebelum mengecek koneksi.`});if(up?.file?.file_id)ids.push(up.file.file_id);
    }
    status.textContent='Menyimpan pengumpulan…';
    const result=await api('submitTask',{task_id:item.task_id,submission_text:form.submission_text?.value||'',submission_url:form.submission_url?.value||'',attachment_file_ids:ids},{timeout:45000,timeoutMessage:'Pengumpulan masih diproses. Jangan kirim ulang; buka kembali tugas beberapa saat lagi.'});
    invalidateAcademicClientCache(item.class_id);if(item.submission)Object.assign(item.submission,result?.submission||{});else item.submission=result?.submission||item.submission;item.submission_status=result?.submission?.status||'SUBMITTED';toast('Tugas berhasil dikumpulkan.');closeModal();if(typeof options.onSuccess==='function')options.onSuccess();else loadAcademicHub(true);
  }catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}
}

function taskStatus(item) {
  const review = String(item.submission?.review_status || '').toUpperCase();
  if (review === 'NEEDS_REVISION') return { key:'OPEN', label:'Perlu Revisi' };
  if (review === 'REVIEWED') return { key:'DONE', label:'Sudah Dinilai' };
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
  return `<div class="panel fast-load-panel" aria-live="polite"><span class="status-dot"></span><div><strong>Menyiapkan data akademik…</strong><small>Setelah terbuka sekali, data disimpan sementara agar pindah menu berikutnya lebih cepat.</small></div></div>`;
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
