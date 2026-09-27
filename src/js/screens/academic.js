import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, fmtDate, sameData } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { compressImageFile } from '../core/media.js';
import { go } from '../core/router.js';

const HUB_TTL_MS = 45000;
let activeAcademicScreen = '';
let attendanceListPage = 1;
let academicHubInFlight = null;
const ATTENDANCE_LIST_PAGE_SIZE = 12;

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

function bindAcademicToolbar() {
  document.getElementById('academic-search')?.addEventListener('input', () => { attendanceListPage = 1; drawAcademicScreen(state.academicHub); });
  document.getElementById('academic-class-filter')?.addEventListener('change', () => {
    if (activeAcademicScreen === 'attendance') { attendanceListPage = 1; hydrateAttendanceFilter(state.academicHub, true); }
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

function schedulesHtml(items, tasks = []) {
  if (!items.length && !tasks.length) return emptyAcademic('Belum ada agenda', 'Jadwal dan deadline tugas akan tampil di sini.', 'i-calendar');
  const now = Date.now();
  const upcoming = items.filter(x => dateMs(x.start_at) >= now - 21600000).slice(0, 80);
  const past = items.filter(x => dateMs(x.start_at) < now - 21600000).slice(-20).reverse();
  const horizon = now + 30 * 86400000;
  const calendarItems = [
    ...items.filter(x => dateMs(x.start_at) >= now - 86400000 && dateMs(x.start_at) <= horizon).map(x => ({kind:'JADWAL',date:x.start_at,title:x.title,class_name:x.class_name,icon:'i-calendar'})),
    ...tasks.filter(x => x.deadline && dateMs(x.deadline) >= now - 86400000 && dateMs(x.deadline) <= horizon).map(x => ({kind:'DEADLINE',date:x.deadline,title:x.title,class_name:x.class_name,icon:'i-task'}))
  ].sort((a,b)=>dateMs(a.date)-dateMs(b.date));
  return `<section class="academic-list-layout">
    <div class="section-title-row"><div><h2>Kalender Akademik 30 Hari</h2><p>Jadwal dan deadline penting dalam satu alur.</p></div></div>
    <div class="academic-calendar-strip">${calendarItems.length?calendarItems.slice(0,18).map(calendarMiniCard).join(''):'<div class="search-empty">Tidak ada agenda 30 hari ke depan.</div>'}</div>
    <div class="section-title-row"><div><h2>Agenda Mendatang</h2><p>${upcoming.length} agenda</p></div></div>
    <div class="academic-card-list">${upcoming.length ? upcoming.map(scheduleCard).join('') : '<div class="search-empty">Belum ada agenda mendatang.</div>'}</div>
    ${past.length ? `<div class="section-title-row"><div><h2>Riwayat Terbaru</h2><p>${past.length} agenda terakhir</p></div></div><div class="academic-card-list is-muted">${past.map(scheduleCard).join('')}</div>` : ''}
  </section>`;
}
function calendarMiniCard(item){const d=new Date(item.date);const p=safeDateParts(d);return `<article class="calendar-mini-card"><div class="academic-date-tile compact"><strong>${p.day}</strong><span>${p.month}</span></div><div><span>${esc(item.kind)} · ${esc(item.class_name||'KelasKu')}</span><strong>${esc(item.title||'-')}</strong><small>${esc(shortDateTime(item.date))}</small></div>${svg(item.icon)}</article>`;}

function scheduleCard(item) {
  const d = new Date(item.start_at);
  const date = safeDateParts(d);
  const state = String(item.schedule_state || 'NORMAL').toUpperCase();
  const stateBadge = state === 'CANCELLED'
    ? '<span class="schedule-state-badge cancelled">Dibatalkan</span>'
    : state === 'CHANGED'
      ? '<span class="schedule-state-badge changed">Diubah</span>'
      : '';
  return `<article class="academic-row-card schedule-row-${state.toLowerCase()}">
    <div class="academic-date-tile"><strong>${date.day}</strong><span>${date.month}</span></div>
    <div class="academic-row-main"><div class="academic-meta-line"><span>${esc(item.class_name || 'KelasKu')}</span><span>${esc(timeRange(item.start_at,item.end_at))}</span>${stateBadge}${item.recurrence_group_id?'<span class="soft-chip">Berulang</span>':''}</div><h3>${esc(item.title)}</h3><p>${esc(item.description || item.location || 'Tanpa keterangan tambahan.')}</p>${item.location ? `<small>${svg('i-class')} ${esc(item.location)}</small>` : ''}${item.change_note?`<small>${esc(item.change_note)}</small>`:''}</div>
  </article>`;
}

function tasksHtml(items) {
  if (!items.length) return emptyAcademic('Belum ada tugas', 'Tugas dari seluruh kelas akan tampil di sini.', 'i-task');
  const open = items.filter(x => !['SUBMITTED','LATE'].includes(String(x.submission_status)) || String(x.submission?.review_status||'') === 'NEEDS_REVISION').sort((a,b)=>dateMs(a.deadline,Infinity)-dateMs(b.deadline,Infinity));
  const done = items.filter(x => ['SUBMITTED','LATE'].includes(String(x.submission_status)) && String(x.submission?.review_status||'') !== 'NEEDS_REVISION').sort((a,b)=>dateMs(b.deadline,0)-dateMs(a.deadline,0));
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
  return `<div class="academic-material-grid">${items.map(materialCard).join('')}</div>`;
}

function materialCard(item) {
  return `<article class="academic-material-card panel">
    <div class="academic-material-icon">${svg(['LINK','DRIVE_LINK'].includes(item.material_type) ? 'i-link' : 'i-file')}</div>
    <div class="academic-meta-line"><span>${esc(item.class_name || 'KelasKu')}</span><span>${esc(shortDate(item.published_at))}</span>${item.meeting_no?`<span>Pertemuan ${esc(item.meeting_no)}</span>`:''}</div>
    <h3>${esc(item.title)}</h3>${item.topic?`<span class="soft-chip material-topic-chip">${esc(item.topic)}</span>`:''}<p>${esc(item.description || 'Materi kelas.')}</p>
    ${item.url ? `<button type="button" class="btn btn-secondary academic-open-link" data-open-url="${esc(item.url)}">${svg('i-link')} ${item.material_type==='DRIVE_LINK'?'Buka File / Drive':'Buka Materi'}</button>` : (item.attachments?.length?`<button type="button" class="btn btn-secondary academic-open-link" data-open-url="${esc(item.attachments[0].download_url||item.attachments[0].url||'')}">${svg('i-file')} ${item.attachments.length} Lampiran</button>`:'<span class="soft-chip">Catatan</span>')}
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
  document.querySelectorAll('[data-academic-attendance-page]').forEach(btn => btn.onclick = () => { attendanceListPage = Number(btn.dataset.academicAttendancePage) || 1; drawAcademicScreen(state.academicHub); });
  document.querySelectorAll('[data-global-attendance-class-toggle]').forEach(btn => btn.onclick = () => { const panel=document.getElementById(btn.getAttribute('aria-controls')); const opening=panel?.hidden!==false; if(panel)panel.hidden=!opening; btn.closest('.attendance-hub-class')?.classList.toggle('open',opening); btn.setAttribute('aria-expanded',String(opening)); });
  document.querySelectorAll('[data-global-attendance-course-toggle]').forEach(btn => btn.onclick = () => { const panel=document.getElementById(btn.getAttribute('aria-controls')); const opening=panel?.hidden!==false; if(panel)panel.hidden=!opening; btn.closest('.attendance-hub-course')?.classList.toggle('open',opening); btn.setAttribute('aria-expanded',String(opening)); });
  document.querySelectorAll('[data-global-attendance-token]').forEach(btn => btn.onclick = () => openGlobalAttendance(btn.dataset.globalAttendanceToken));
  document.getElementById('academic-open-classes')?.addEventListener('click', () => go('classes'));
}

function openGlobalAttendance(token=''){
  const clean=String(token||'').trim(); if(!clean)return;
  const url=new URL(window.location.href); url.pathname='/absensi'; url.searchParams.set('a',clean); url.searchParams.delete('attendance');
  try{window.history.pushState({kelaskuRoute:'attendance-link'},'',url.pathname+url.search);}catch{}
  go('attendance-link',{replace:true});
}

function academicAttachmentLinks(items=[]){if(!items.length)return '';return `<div class="task-supporting-list"><strong>Lampiran Pendukung</strong>${items.map((a,i)=>`<a href="${esc(a.download_url||a.url||'#')}" target="_blank" rel="noopener noreferrer"><span class="material-symbols-rounded">${a.type==='LINK'?'link':String(a.mime_type||'').startsWith('image/')?'image':'description'}</span><span>${esc(a.filename||`Lampiran ${i+1}`)}</span><span class="material-symbols-rounded">open_in_new</span></a>`).join('')}</div>`;}

export function openTaskModal(taskId, sourceItems = null, options = {}) {
  const pool = Array.isArray(sourceItems) ? sourceItems : (state.academicHub?.tasks || []);
  const item = pool.find(x => String(x.task_id) === String(taskId));
  if (!item) return;
  const mode = String(item.submission_mode || 'NONE').toUpperCase();
  const sub = item.submission || {};
  showModal(`
    <div class="modal-head"><div><div class="eyebrow">Tugas • ${esc(item.class_name || 'KelasKu')}</div><h2>${esc(item.title)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>
    <div class="task-modal-meta"><span>${svg('i-calendar')} ${esc(deadlineText(item.deadline))}</span><span class="academic-status-pill status-${taskStatus(item).key.toLowerCase()}">${esc(taskStatus(item).label)}</span></div>
    <p class="copy compact-copy task-description">${esc(item.description || 'Tidak ada deskripsi tugas.')}</p>${academicAttachmentLinks(item.attachments||[])}
    ${sub.review_status ? `<div class="task-review-feedback ${sub.review_status==='NEEDS_REVISION'?'needs-revision':'reviewed'}"><div><span>Review Pengajar</span><strong>${sub.review_status==='NEEDS_REVISION'?'Perlu Revisi':'Sudah Dinilai'}${sub.score!==''&&sub.score!==undefined?` · ${esc(String(sub.score))}/${esc(String(item.max_score||0))}`:''}</strong></div><p>${esc(sub.feedback||'Tidak ada feedback tambahan.')}</p></div>` : ''}
    ${mode === 'NONE' ? '<div class="alert success">Tugas ini tidak memerlukan pengumpulan melalui KelasKu.</div>' : `
      <form id="task-submit-form">
        ${mode !== 'LINK' ? `<div class="field"><label>Jawaban / Catatan</label><textarea name="submission_text" class="control" rows="5" placeholder="Tulis jawaban atau catatan pengumpulan…">${esc(sub.submission_text || '')}</textarea></div>` : ''}
        ${mode !== 'TEXT' ? `<div class="field"><label>Tautan Pengumpulan</label><input name="submission_url" class="control" type="url" placeholder="https://…" value="${esc(sub.submission_url || '')}"></div>` : ''}
        <div class="field"><label>Lampiran Gambar <span class="field-optional">opsional</span></label><div class="task-image-picker"><input id="task-image-input" type="file" accept="image/*" hidden><button type="button" id="task-image-btn" class="btn btn-secondary">${svg('i-camera')} Pilih Gambar</button><span id="task-image-label">${sub.submission_image_url ? 'Gambar tersimpan' : 'JPG/PNG/WebP • otomatis dikompresi'}</span></div><div id="task-image-preview" class="task-image-preview">${sub.submission_image_url ? `<img src="${esc(sub.submission_image_url)}" alt="Lampiran tugas">` : ''}</div></div>
        <div id="task-submit-status" class="request-status"></div>
        <button id="task-submit-btn" class="btn btn-primary btn-block" type="submit">${sub.submission_id ? 'Perbarui Pengumpulan' : 'Kumpulkan Tugas'}</button>
      </form>`}
  `);
  const form = document.getElementById('task-submit-form');
  let pendingTaskImage = null;
  const imageInput = document.getElementById('task-image-input');
  document.getElementById('task-image-btn')?.addEventListener('click', () => imageInput?.click());
  imageInput?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const processed = await compressImageFile(file, { maxEdge: 1280, targetBytes: 420000 });
      pendingTaskImage = processed;
      const preview = document.getElementById('task-image-preview');
      const label = document.getElementById('task-image-label');
      if (preview) preview.innerHTML = `<img src="${esc(processed.dataUrl)}" alt="Preview lampiran">`;
      if (label) label.textContent = `${processed.name} • ${Math.round(processed.blob.size / 1024)} KB`;
    } catch (err) { toast(err.message || 'Gambar gagal diproses.'); }
  });
  if (form) form.onsubmit = e => submitTask(e, item, { ...options, image: () => pendingTaskImage });
}

async function submitTask(event, item, options = {}) {
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
      submission_url:form.submission_url?.value || '',
      submission_image_data_url: options.image?.()?.dataUrl || ''
    });
    invalidateAcademicClientCache(item.class_id);
    toast('Tugas berhasil dikumpulkan.');
    closeModal();
    if (typeof options.onSuccess === 'function') await options.onSuccess();
    else await loadAcademicHub(true);
  } catch (err) {
    status.className = 'request-status error'; status.textContent = err.message;
  } finally { btn.disabled = false; btn.innerHTML = old; }
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
