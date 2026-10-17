import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, fmtDate, sameData } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js?v=6739r52c91';
import { compressImageFile, fileToDataUrl, formatBytes } from '../core/media.js';
import { go } from '../core/router.js';
import { attendanceOverviewHtml, attendanceTabsHtml, attendanceContentHtml, attendanceDetailsHtml, attendanceEntryHtml, attendanceEntryMessageHtml, attendanceWindow, attendanceIsReportView, bindAttendanceHub, resetAttendancePages, resetAttendanceFolders } from './attendanceHub.js?v=6739r52c75';
import { loadAttendanceAnalytics, invalidateAttendanceAnalytics } from './attendanceAnalytics.js?v=6739r52c75';
import { loadAttendanceClassData, attendanceClassDataFresh, loadAttendanceSessionState, markAttendanceUnverified, invalidateClassAcademicData, attendanceClasses, attendanceSourceData, applyAttendanceCheckIn } from './classAcademicData.js?v=6739r52c75';
import { prefetchMyClasses } from './classes.js?v=6739r52c9';

const HUB_TTL_MS = 45000;
let activeAcademicScreen = '';
let academicHubInFlight = null;
const ACADEMIC_PAGE_SIZE = 12;
const SCHEDULE_PAGE_SIZE = 8;
let scheduleListPage = 1;
let taskListPage = 1;
let materialListPage = 1;
let announcementListPage = 1;
let attendanceReportClassId = '';
let attendanceReportScope = 'own';
const attendanceReportRequests = new Map();
const attendanceReportErrors = new Map();
const attendanceSessionRuns = new Map();
const attendanceSessionRequests = new Map();
const attendanceSessionErrors = new Map();

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
  resetAttendanceFolders();
  attendanceReportClassId = '';
  attendanceReportScope = 'own';
  attendanceReportErrors.clear();
  attendanceSessionErrors.clear();
  activeAcademicScreen = 'attendance';
  renderAcademicShell('Absensi', 'Riwayat kehadiran dari seluruh kelas dalam satu tempat.', 'attendance', 'i-check');
}

function renderAcademicShell(title, copy, active, icon) {
  const attendance = active === 'attendance';
  const heading = attendance
    ? `<div class="att-page-context"><strong>ABSENSI</strong><span>Phase 6 · Academic Workflow</span></div><div id="attendance-overview"></div>`
    : `<div class="page-head academic-page-head"><div><div class="eyebrow">PHASE 6 • Academic Workflow</div><h1>${esc(title)}</h1><p>${esc(copy)}</p></div><span class="phase-badge">ACTIVE</span></div>`;
  const content = `${heading}
    <section class="academic-toolbar panel ${attendance ? 'attendance-toolbar att-toolbar' : ''}" aria-label="Pencarian dan filter ${esc(title)}">
      <div class="academic-search">${svg('i-search')}<input id="academic-search" aria-label="Cari ${esc(title.toLowerCase())}" placeholder="${attendance ? 'Cari sesi, tanggal, atau topik…' : `Cari ${esc(title.toLowerCase())}…`}" autocomplete="off"></div>
      <select id="academic-class-filter" aria-label="Filter kelas" class="control compact-control"><option value="ALL">Semua Kelas</option></select>
      ${attendance ? '<select id="academic-attendance-filter" aria-label="Filter mata pelajaran atau kegiatan" class="control compact-control"><option value="ALL">Semua Mata Pelajaran / Kegiatan</option></select><button type="button" id="attendance-filter-toggle" class="att-filter-toggle" aria-expanded="false" aria-controls="academic-class-filter academic-attendance-filter academic-refresh"><svg class="att-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z"/></svg>Filter</button>' : ''}
      <button type="button" id="academic-refresh" class="btn btn-secondary">${svg('i-refresh')} Refresh</button>
    </section>
    ${attendance ? attendanceTabsHtml() : ''}
    <div id="academic-slot" ${attendance ? 'role="tabpanel" aria-labelledby="att-tab-sessions"' : ''}>${state.academicHub ? '' : academicSkeleton()}</div>`;

  document.getElementById('app').innerHTML = appShell({ active, content:attendance ? `<section class="attendance-v2">${content}</section>` : content, hideSearch:true });
  bindAppShell({onRefresh:refreshCurrentAcademic});
  bindAcademicToolbar();
  if (attendance) bindAcademicRows();
  if (state.academicHub) drawAcademicScreen(state.academicHub);
  loadAcademicHub(false);
}

function resetAcademicPages(){scheduleListPage=1;taskListPage=1;materialListPage=1;announcementListPage=1;resetAttendancePages();}
async function refreshCurrentAcademic() {
  if (activeAcademicScreen !== 'attendance') return loadAcademicHub(true);
  if (!state.academicHub) await loadAcademicHub(true);
  return attendanceIsReportView() ? refreshAttendanceReport(true) : refreshAttendanceSessions(true);
}
function pageSlice(items,page,size=ACADEMIC_PAGE_SIZE){const total=Math.max(1,Math.ceil(items.length/size));const safe=Math.min(Math.max(1,page),total);return{page:safe,totalPages:total,total:items.length,items:items.slice((safe-1)*size,safe*size)};}
function academicPager(kind,page,totalPages,total){if(totalPages<=1)return '';return `<div class="table-pagination academic-pagination"><span>${total} item • Halaman ${page}/${totalPages}</span><div><button type="button" data-academic-page-kind="${kind}" data-academic-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>‹</button><button type="button" class="active">${page}</button><button type="button" data-academic-page-kind="${kind}" data-academic-page="${Math.min(totalPages,page+1)}" ${page>=totalPages?'disabled':''}>›</button></div></div>`;}
function bindAcademicToolbar() {
  document.getElementById('academic-search')?.addEventListener('input', () => { resetAcademicPages(); drawAcademicScreen(state.academicHub); });
  document.getElementById('academic-class-filter')?.addEventListener('change', () => {
    resetAcademicPages(); if (activeAcademicScreen === 'attendance') { attendanceReportClassId = ''; hydrateAttendanceFilter(state.academicHub, true); }
    drawAcademicScreen(state.academicHub);
  });
  document.getElementById('academic-attendance-filter')?.addEventListener('change', () => { resetAttendancePages(); drawAcademicScreen(state.academicHub); });
  document.getElementById('academic-refresh')?.addEventListener('click', () => activeAcademicScreen === 'attendance' ? (attendanceIsReportView() ? refreshAttendanceReport(true) : refreshAttendanceSessions(true)) : loadAcademicHub(true));
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
    invalidateAttendanceAnalytics(classId);
    invalidateClassAcademicData(classId);
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
  else if (activeAcademicScreen === 'attendance') {
    const items = filteredAttendanceItems(data);
    const overview = document.getElementById('attendance-overview');
    if (overview) overview.innerHTML = attendanceOverviewHtml(items);
    slot.innerHTML = attendanceSessionNoticeHtml() + attendanceContentHtml(items, attendanceIsReportView() ? attendanceReportOptions(data) : null);
  }
  else slot.innerHTML = schedulesHtml(filterItems(data.schedules || []), filterItems(data.tasks || []));

  bindAcademicRows();
  if (activeAcademicScreen === 'attendance') { refreshAttendanceReport(); refreshAttendanceSessions(); }
}

function redrawAttendanceContent() {
  renderAttendanceSlot();
  refreshAttendanceReport();
  refreshAttendanceSessions();
}

function renderAttendanceSlot({ updateOverview = false } = {}) {
  if (activeAcademicScreen !== 'attendance') return;
  const slot = document.getElementById('academic-slot');
  if (!slot || !state.academicHub) return;
  const items = filteredAttendanceItems(state.academicHub);
  if(updateOverview){
    const overview = document.getElementById('attendance-overview');
    if (overview) overview.innerHTML = attendanceOverviewHtml(items);
  }
  slot.innerHTML = attendanceSessionNoticeHtml() + attendanceContentHtml(items, attendanceIsReportView() ? attendanceReportOptions(state.academicHub) : null);
  bindAcademicRows();
}

function attendanceSessionNoticeHtml() {
  const scope = String(document.getElementById('academic-class-filter')?.value || 'ALL');
  const keys = attendanceClasses(state.academicHub).filter(c => scope === 'ALL' || c.id === scope).map(c => `${state.sessionToken || ''}::${c.id}`);
  const running = attendanceSessionRuns.has(`${state.sessionToken || ''}::${scope}`);
  const pending = attendanceClasses(state.academicHub).filter(c => scope === 'ALL' || c.id === scope).some(c => !attendanceSessionErrors.has(`${state.sessionToken || ''}::${c.id}`) && !attendanceClassDataFresh(c.id));
  const loading = keys.some(key => attendanceSessionRequests.has(key)) || (running && (pending || !keys.length));
  const errors = keys.filter(key => attendanceSessionErrors.has(key));
  if (loading) return '<div class="att-source-notice" role="status"><span class="btn-spinner"></span><span>Menyamakan sesi dan status kehadiran…</span></div>';
  if (!errors.length) return '';
  return `<div class="att-source-notice att-source-error" role="status"><span>Status terbaru belum dapat diperiksa. Data terakhir tetap tersedia; gunakan Periksa Status pada sesi.</span><button type="button" data-att-sessions-retry>Coba Lagi</button></div>`;
}

function refreshAttendanceSessions(force = false) {
  if (activeAcademicScreen !== 'attendance' || !state.academicHub) return Promise.resolve(null);
  const owner = state.sessionToken, userId = String(state.user?.user_id || '');
  if (!owner || !userId) return Promise.resolve(null);
  const scope = String(document.getElementById('academic-class-filter')?.value || 'ALL');
  const runKey = `${owner}::${scope}`;
  if (attendanceSessionRuns.has(runKey)) return attendanceSessionRuns.get(runKey);
  const current = () => state.sessionToken === owner && String(state.user?.user_id || '') === userId;
  const visible = () => current() && activeAcademicScreen === 'attendance' && String(document.getElementById('academic-class-filter')?.value || 'ALL') === scope;
  const beforeClasses = JSON.stringify(attendanceClasses(state.academicHub));
  const pending = attendanceClasses(state.academicHub).filter(c => scope === 'ALL' || c.id === scope).some(c => force || (!attendanceSessionErrors.has(`${owner}::${c.id}`) && !attendanceClassDataFresh(c.id)));
  let didWork = false, catalogChanged = false;
  const run = (async () => {
    // Reuse the core warmup's class list and its in-flight request; paint cached rows first.
    await prefetchMyClasses().catch(() => {});
    if (!visible()) return null;
    catalogChanged = beforeClasses !== JSON.stringify(attendanceClasses(state.academicHub));
    if(catalogChanged)hydrateClassFilter(state.academicHub);
    const classes = attendanceClasses(state.academicHub).filter(c => scope === 'ALL' || c.id === scope);
    let index = 0;
    const worker = async () => {
      while (index < classes.length && visible()) {
        const { id } = classes[index++], key = `${owner}::${id}`;
        if (attendanceSessionRequests.has(key)) { await attendanceSessionRequests.get(key); continue; }
        if (!force && (attendanceSessionErrors.has(key) || attendanceClassDataFresh(id))) continue;
        didWork = true;
        attendanceSessionErrors.delete(key);
        const request = loadAttendanceClassData(id,{ force }).catch(err => {
          if (current() && !['CLASS_DATA_CHANGED','ATTENDANCE_DATA_CHANGED'].includes(err.code)) attendanceSessionErrors.set(key,err.message);
          return null;
        }).finally(() => {
          if (attendanceSessionRequests.get(key) === request) attendanceSessionRequests.delete(key);
          if (current() && activeAcademicScreen === 'attendance') {
            hydrateClassFilter(state.academicHub);
            hydrateAttendanceFilter(state.academicHub);
            renderAttendanceSlot({updateOverview:true});
          }
        });
        attendanceSessionRequests.set(key,request);
        renderAttendanceSlot();
        await request;
      }
    };
    await Promise.all([worker(),worker()]);
    if (visible() && (didWork || catalogChanged)) { hydrateAttendanceFilter(state.academicHub); renderAttendanceSlot({updateOverview:true}); }
    return attendanceSourceData(state.academicHub);
  })();
  attendanceSessionRuns.set(runKey,run);
  if(pending)renderAttendanceSlot();
  run.finally(() => {
    if (attendanceSessionRuns.get(runKey) === run) attendanceSessionRuns.delete(runKey);
    if(visible() && pending && !didWork && !catalogChanged)renderAttendanceSlot();
  }).catch(() => {});
  return run;
}

function attendanceReportOptions(data) {
  const classes = attendanceClasses(data);
  const byClass = new Map(classes.map(c => [c.id,c.name]));
  const filter = String(document.getElementById('academic-class-filter')?.value || 'ALL');
  let classId = filter !== 'ALL' ? filter : attendanceReportClassId;
  if (!byClass.has(classId)) classId = classes.length === 1 ? classes[0].id : '';
  attendanceReportClassId = classId;
  const key = `${state.sessionToken || ''}::${classId}`;
  const courseKey = String(document.getElementById('academic-attendance-filter')?.value || 'ALL');
  let courseTitle = '';
  if (courseKey !== 'ALL') {
    const source = attendanceSourceData(data), schedules = attendanceScheduleMap(source);
    for (const item of source.attendance) {
      const meta = attendanceCourseMeta(source, item, schedules);
      if (meta.key === courseKey) { courseTitle = meta.title; break; }
    }
  }
  return { classes, classId, className:byClass.get(classId) || '', scope:attendanceReportScope,
    userId:String(state.user?.user_id || ''), data:state.classAnalytics?.[classId] || null,
    loading:attendanceReportRequests.has(key), error:attendanceReportErrors.get(key) || '', courseTitle,
    query:String(document.getElementById('academic-search')?.value || '').trim() };
}

function refreshAttendanceReport(force = false) {
  if (activeAcademicScreen !== 'attendance' || !attendanceIsReportView() || !state.academicHub) return Promise.resolve(null);
  const options = attendanceReportOptions(state.academicHub);
  const classId = options.classId, owner = state.sessionToken;
  if (!classId) return Promise.resolve(null);
  const key = `${owner || ''}::${classId}`;
  if (attendanceReportRequests.has(key)) return attendanceReportRequests.get(key);
  if (!force && (attendanceReportErrors.has(key) || (options.data && Date.now() - Number(state.classAnalyticsAt?.[classId] || 0) < 60000))) return Promise.resolve(options.data);
  attendanceReportErrors.delete(key);
  const request = loadAttendanceAnalytics(classId, { force }).then(data => {
    if (state.sessionToken === owner) attendanceReportErrors.delete(key);
    return data;
  }).catch(err => {
    if (state.sessionToken === owner && err.code !== 'ATTENDANCE_DATA_CHANGED') attendanceReportErrors.set(key, err.message);
    return null;
  }).finally(() => {
    if (attendanceReportRequests.get(key) === request) attendanceReportRequests.delete(key);
    if (state.sessionToken === owner && activeAcademicScreen === 'attendance' && attendanceReportClassId === classId) renderAttendanceSlot();
  });
  attendanceReportRequests.set(key, request);
  renderAttendanceSlot();
  return request;
}

function hydrateClassFilter(data) {
  const select = document.getElementById('academic-class-filter');
  if (!select || (activeAcademicScreen !== 'attendance' && select.dataset.ready === '1')) return;
  const map = new Map();
  if (activeAcademicScreen === 'attendance') attendanceClasses(data).forEach(c => map.set(c.id,c.name));
  else ['tasks','schedules','materials','announcements','attendance'].forEach(key => {
    (data[key] || []).forEach(item => map.set(String(item.class_id), item.class_name || 'KelasKu'));
  });
  const options = [...map.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const fingerprint = JSON.stringify(options);
  if (select.dataset.fingerprint === fingerprint) return;
  const previous = select.value || 'ALL';
  select.innerHTML = '<option value="ALL">Semua Kelas</option>' + options.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
  if (options.some(([id])=>id===previous)) select.value=previous;
  select.dataset.fingerprint = fingerprint;
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

function attendanceSessionNumber(item, schedule) {
  let rule = schedule?.recurrence_rule;
  if (!rule || typeof rule !== 'object') {
    try { rule = JSON.parse(rule || '{}'); } catch { rule = {}; }
  }
  // Personal attendance can be a subset of a series; never renumber that subset.
  for (const value of [rule?.session_no, schedule?._sessionNo, schedule?.session_no, item?.session_no, item?.attendance_session_no]) {
    const no = Number(value);
    if (Number.isSafeInteger(no) && no > 0) return no;
  }
  for (const title of [schedule?.title, item?.title]) {
    const match = String(title || '').match(/\bsesi\s*(\d+)\b/i);
    const no = Number(match?.[1]);
    if (Number.isSafeInteger(no) && no > 0) return no;
  }
  return 0;
}

function hydrateAttendanceFilter(data, force = false) {
  const select = document.getElementById('academic-attendance-filter');
  if (!select || !data) return;
  data = attendanceSourceData(data);
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
  data = attendanceSourceData(data);
  const scheduleMap = attendanceScheduleMap(data);
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
      schedule_end_at: schedule?.end_at || item.end_at || '',
      schedule_description: schedule?.description || '',
      attendance_course_key: meta.key,
      attendance_course_title: meta.title,
      attendance_session_no: attendanceSessionNumber(item, schedule)
    };
  }).filter(item => {
    if (classId !== 'ALL' && String(item.class_id) !== classId) return false;
    if (selectedCourse !== 'ALL' && String(item.attendance_course_key) !== selectedCourse) return false;
    if (!query) return true;
    const start = item.start_at || item.schedule_start_at;
    const label = item.attendance_session_no ? `Sesi ${String(item.attendance_session_no).padStart(2,'0')}` : 'Sesi';
    const hay = [item.title,item.attendance_course_title,item.description,item.schedule_description,item.body,item.location,item.schedule_location,item.class_name,item.my_note,start,shortDateTime(start),label].join(' ').toLowerCase();
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
  const start=dateMs(item.date,0);
  const explicitEnd=dateMs(item.end_date,0);
  const effectiveEnd=explicitEnd || (item.kind==='JADWAL' ? start + 3*60*60*1000 : start);
  const passed=!cancelled && effectiveEnd<now;
  const active=!cancelled && item.kind==='JADWAL' && start<=now && effectiveEnd>=now;
  const overdue=passed && item.kind==='DEADLINE';
  const completed=passed && item.kind==='JADWAL';
  const stamp=cancelled?'BATAL':overdue?'LEWAT':completed?'SELESAI':'';
  const stateClass=cancelled?'is-cancelled':overdue?'is-overdue':completed?'is-past':active?'is-active':'is-upcoming';
  return `<article class="calendar-mini-card ${stateClass}">
    <div class="academic-date-tile compact"><strong>${p.day}</strong><span>${p.month}</span></div>
    <div><span>${esc(item.kind)} · ${esc(item.class_name||'KelasKu')}</span><strong>${esc(item.title||'-')}</strong><small>${esc(shortDateTime(item.date))}</small></div>
    ${completed?'<span class="calendar-card-watermark" aria-hidden="true">SELESAI</span>':''}
    ${stamp?`<span class="calendar-state-stamp ${cancelled||overdue?'danger':'done'}">${esc(stamp)}</span>`:svg(item.icon)}
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

function attendanceSessionLabel(item) {
  const schedule = attendanceSourceData(state.academicHub).schedules.find(row => String(row.schedule_id || '') === String(item.source_schedule_id || ''));
  const no = attendanceSessionNumber(item, schedule);
  return no ? `Sesi ${String(no).padStart(2,'0')}` : 'Sesi';
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
  if (activeAcademicScreen === 'attendance') bindAttendanceHub({
    redraw: redrawAttendanceContent,
    reportClass: id => {
      attendanceReportClassId = String(id || '');
      const filter = document.getElementById('academic-class-filter');
      if (filter) filter.value = attendanceReportClassId || 'ALL';
      const course = document.getElementById('academic-attendance-filter');
      if (course) course.value = 'ALL';
      hydrateAttendanceFilter(state.academicHub, true);
      drawAcademicScreen(state.academicHub);
    },
    reportScope: scope => { attendanceReportScope = scope === 'class' ? 'class' : 'own'; redrawAttendanceContent(); },
    reportRefresh: () => refreshAttendanceReport(true),
    details: id => {
      const item = filteredAttendanceItems(state.academicHub).find(row => String(row.attendance_id || row.public_token || '') === String(id));
      if (item) return openGlobalAttendanceItem(item);
    }
  });
  document.querySelectorAll('[data-global-attendance-token]').forEach(btn => btn.onclick = () => openGlobalAttendance(btn.dataset.globalAttendanceToken));
  document.querySelectorAll('[data-att-sessions-retry]').forEach(btn => btn.onclick = () => refreshAttendanceSessions(true));
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
  if(!clean)return Promise.resolve(null);
  const item=attendanceSourceData(state.academicHub).attendance.find(x=>String(x.public_token||'')===clean);
  if(!item){toast('Sesi presensi tidak ditemukan pada data terbaru. Tekan Refresh lalu coba lagi.');return Promise.resolve(null);}
  return openGlobalAttendanceItem(item);
}

async function openGlobalAttendanceItem(item,{draft={},error=''}={}){
  const owner=state.sessionToken,userId=String(state.user?.user_id||'');
  const prepared=filteredAttendanceItems(state.academicHub).find(row=>String(row.attendance_id)===String(item.attendance_id))||item;
  showModal(attendanceEntryMessageHtml(prepared,{loading:true}),{attendanceEntry:true});
  const mount=document.getElementById('phase-modal');
  try{
    const fresh=await loadAttendanceSessionState(prepared);
    if(state.sessionToken!==owner||String(state.user?.user_id||'')!==userId)return;
    if(activeAcademicScreen!=='attendance'){if(document.getElementById('phase-modal')===mount)closeModal();return fresh;}
    renderAttendanceSlot({updateOverview:true});
    if(document.getElementById('phase-modal')!==mount)return fresh;
    openGlobalAttendanceForm(fresh,{draft,error});
    return fresh;
  }catch(err){
    if(state.sessionToken!==owner||String(state.user?.user_id||'')!==userId||document.getElementById('phase-modal')!==mount)return;
    const message=error&&/presensi sudah tercatat/i.test(error)?'Presensi sudah tercatat di server. Status lengkap belum dapat dimuat. Tekan Periksa Lagi.':err.message;
    showModal(attendanceEntryMessageHtml(prepared,{message}),{attendanceEntry:true});
    document.querySelectorAll('[data-global-att-retry]').forEach(btn=>btn.onclick=()=>openGlobalAttendanceItem(prepared,{draft,error}));
    return null;
  }
}

function openGlobalAttendanceForm(item,{draft={},error=''}={}){
  const window=attendanceWindow(item),marked=String(item.my_status||'UNMARKED').toUpperCase()!=='UNMARKED';
  if(marked&&item.my_status_confirmed===true){showModal(attendanceDetailsHtml(item),{attendanceDetail:true});return;}
  const manual=item.self_checkin_enabled===false||String(item.entry_mode||'').toUpperCase()==='MANUAL';
  if(item.my_status_confirmed!==true||item.can_self_checkin!==true||manual||!['OPEN','LATE'].includes(window)||!item.public_token){
    const message=window==='UPCOMING'?'Presensi belum dibuka.':!['OPEN','LATE'].includes(window)?'Waktu presensi sudah ditutup.':manual?'Presensi sesi ini dicatat oleh pengajar.':'Presensi mandiri belum tersedia untuk akunmu pada sesi ini.';
    showModal(attendanceEntryMessageHtml(item,{message}),{attendanceEntry:true});
    document.querySelectorAll('[data-global-att-retry]').forEach(btn=>btn.onclick=()=>openGlobalAttendanceItem(item,{draft}));
    return;
  }
  showModal(attendanceEntryHtml(item,{draft,error}),{attendanceEntry:true});
  const formMount=document.getElementById('phase-modal');
  let selectedStatus=[...document.querySelectorAll('[data-global-att-status]')].find(btn=>btn.getAttribute('aria-pressed')==='true')?.dataset.globalAttStatus||'PRESENT';
  let selectedChannel=[...document.querySelectorAll('[data-global-att-channel]')].find(btn=>btn.getAttribute('aria-pressed')==='true')?.dataset.globalAttChannel||'';
  document.querySelectorAll('[data-global-att-status]').forEach(btn=>btn.onclick=()=>{
    selectedStatus=btn.dataset.globalAttStatus;
    document.querySelectorAll('[data-global-att-status]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));
    const group=document.getElementById('global-attendance-channel-choice');if(group)group.hidden=selectedStatus!=='PRESENT';
  });
  document.querySelectorAll('[data-global-att-channel]').forEach(btn=>btn.onclick=()=>{
    selectedChannel=btn.dataset.globalAttChannel;
    document.querySelectorAll('[data-global-att-channel]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));
  });
  const submit=async event=>{
    event?.preventDefault();
    const btn=document.getElementById('global-attendance-submit'),statusEl=document.getElementById('global-attendance-status');
    if(!btn||btn.disabled)return;
    const owner=state.sessionToken,userId=String(state.user?.user_id||''),note=document.getElementById('global-attendance-note')?.value||'';
    if(!['OPEN','LATE'].includes(attendanceWindow(item))){
      btn.disabled=true;await openGlobalAttendanceItem(item,{draft:{status:selectedStatus,channel:selectedChannel,note}});return;
    }
    btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Mencatat…</span>';
    statusEl.hidden=false;statusEl.className='att-form-message';statusEl.textContent='Mencatat presensi…';
    try{
      const result=await api('selfCheckInAttendance',{
        token:String(item.public_token||''),attendance_status:selectedStatus,
        attendance_channel:selectedStatus==='PRESENT'?selectedChannel:'',note
      },{onSlow:()=>{statusEl.textContent='Server masih memproses. Jangan klik dua kali.';}});
      if(state.sessionToken!==owner||String(state.user?.user_id||'')!==userId)return;
      applyAttendanceCheckIn(item,result,{status:selectedStatus,channel:selectedStatus==='PRESENT'?selectedChannel:'',note});
      if(document.getElementById('phase-modal')===formMount)closeModal();
      invalidateAcademicClientCache(item.class_id||'');
      drawAcademicScreen(state.academicHub);
      toast(`Presensi tersimpan: ${attendanceStatusLabel(item.my_status)}.`);
      loadAttendanceClassData(item.class_id,{force:true}).then(()=>{
        attendanceSessionErrors.delete(`${owner}::${item.class_id}`);
        if(state.sessionToken===owner&&activeAcademicScreen==='attendance')drawAcademicScreen(state.academicHub);
      }).catch(()=>{});
    }catch(err){
      if(state.sessionToken!==owner||String(state.user?.user_id||'')!==userId)return;
      markAttendanceUnverified(item);
      renderAttendanceSlot({updateOverview:true});
      if(document.getElementById('phase-modal')!==formMount)return;
      // A rejection or timeout is reconciled with a read; never guess PRESENT or resend.
      await openGlobalAttendanceItem(item,{draft:{status:selectedStatus,channel:selectedChannel,note},error:err.message});
    }
  };
  document.getElementById('global-attendance-submit')?.addEventListener('click',submit);
  document.getElementById('global-attendance-form')?.addEventListener('submit',submit);
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

function showModal(html, { attendanceDetail = false, attendanceEntry = false } = {}) {
  closeModal();
  const solid=attendanceDetail||attendanceEntry;
  const el = document.createElement('div'); el.id = 'phase-modal'; el.className = `overlay${solid ? ' att-detail-overlay' : ''}`;
  if(solid){el.returnFocus=document.activeElement;el.returnAttendanceId=document.activeElement?.closest?.('[data-attendance-row]')?.dataset.attendanceRow;}
  el.innerHTML = `<div class="modal phase-modal-card ${solid ? `att-detail-modal${attendanceEntry?' att-entry-modal':''}` : 'glass'}"${solid ? ` role="dialog" aria-modal="true" aria-labelledby="${attendanceEntry?'att-entry-title':'att-detail-title'}" tabindex="-1"` : ''}>${html}</div>`; document.body.appendChild(el);
  el.querySelectorAll('[data-close-modal]').forEach(x => x.onclick = closeModal);
  el.onclick = e => { if (e.target === el) closeModal(); };
  if(solid){
    el.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();closeModal();}
      if(event.key==='Tab'){
        const controls=[...el.querySelectorAll('button:not(:disabled), a[href], input, textarea, [tabindex="0"]')].filter(node=>!node.closest('[hidden]'));
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    });
    el.querySelectorAll('[data-close-modal]')[0]?.focus();
  }
}
function closeModal(){ const el=document.getElementById('phase-modal'),previous=el?.returnFocus,id=el?.returnAttendanceId;el?.remove();if(previous?.isConnected)previous.focus({preventScroll:true});else if(id)[...document.querySelectorAll('[data-attendance-row]')].find(row=>row.dataset.attendanceRow===id)?.querySelector?.('button')?.focus({preventScroll:true}); }

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

