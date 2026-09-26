import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, sameData, primaryUrl } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { confirmDialog } from '../core/dialog.js';
import { go } from '../core/router.js';
import { invalidateAcademicClientCache, openTaskModal } from './academic.js';
import { compressImageFile } from '../core/media.js';
import { downloadXlsx, xlsxCell } from '../core/xlsx.js';

let activeTab = 'overview';
let timelineCategory = 'ALL';
let currentClassData = null;
let analyticsPage = 1;
let analyticsMemberPage = 1;
let analyticsFilter = 'ALL';
let analyticsView = 'overview';
let classAttendancePage = 1;
let attendanceModalPage = 1;
let attendanceModalState = null;
const ANALYTICS_PAGE_SIZE = 15;
const ANALYTICS_MEMBER_PAGE_SIZE = 15;
const CLASS_ATTENDANCE_PAGE_SIZE = 10;
const ATTENDANCE_MEMBER_PAGE_SIZE = 20;
const CLASS_DETAIL_TTL_MS = 2 * 60 * 1000;
const CLASS_ACADEMIC_TTL_MS = 90 * 1000;
const classDetailInFlight = new Map();
const classAcademicInFlight = new Map();
const classTimelineInFlight = new Map();
const classAnalyticsInFlight = new Map();
let classWarmTimer = null;
const classWarmAt = new Map();

function cacheFresh(atMap, classId, ttl) {
  return Date.now() - Number(atMap?.[classId] || 0) < ttl;
}
function persistClassCache(cacheKey, atKey, storageKey, storageAtKey, classId, data, maxClasses = 4) {
  state[cacheKey] ||= {};
  state[atKey] ||= {};
  state[cacheKey][classId] = data;
  state[atKey][classId] = Date.now();
  const keep = Object.keys(state[atKey]).sort((a,b)=>Number(state[atKey][b]||0)-Number(state[atKey][a]||0)).slice(0,maxClasses);
  Object.keys(state[cacheKey]).forEach(id => { if (!keep.includes(id)) delete state[cacheKey][id]; });
  Object.keys(state[atKey]).forEach(id => { if (!keep.includes(id)) delete state[atKey][id]; });
  try {
    localStorage.setItem(storageKey, JSON.stringify(state[cacheKey]));
    localStorage.setItem(storageAtKey, JSON.stringify(state[atKey]));
  } catch {}
}
function markClassCacheStale(atKey, storageAtKey, classId) {
  state[atKey] ||= {};
  state[atKey][classId] = 0;
  try { localStorage.setItem(storageAtKey, JSON.stringify(state[atKey])); } catch {}
}
function fastRoomLoader(label='Menyiapkan data…') {
  return `<div class="panel fast-load-panel" aria-live="polite"><span class="status-dot"></span><div><strong>${esc(label)}</strong><small>Data akan disimpan sementara agar perpindahan menu berikutnya lebih cepat.</small></div></div>`;
}
function scheduleClassWarmup(classId) {
  if (!classId || Date.now() - Number(classWarmAt.get(String(classId)) || 0) < 30000) return;
  classWarmAt.set(String(classId), Date.now());
  clearTimeout(classWarmTimer);
  const warm = async () => {
    if (!classId || String(state.selectedClassId) !== String(classId)) return;
    await loadClassAcademic(true).catch(()=>{});
    if (String(state.selectedClassId) !== String(classId)) return;
    setTimeout(() => loadClassTimeline(true).catch(()=>{}), 220);
    setTimeout(() => loadClassAnalytics(true).catch(()=>{}), 520);
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => warm(), { timeout: 900 });
  } else {
    classWarmTimer = setTimeout(warm, 260);
  }
}

export function renderClassRoom() {
  const classId = state.selectedClassId || sessionStorage.getItem('kelasku_selected_class') || '';
  if (!classId) { go('classes'); return; }
  state.selectedClassId = classId;
  const cached = state.classDetails[classId] || null;
  currentClassData = cached;

  const content = `<div class="class-room-page">
    <div class="page-head"><div><div class="eyebrow">PHASE 6 • RUANG KELAS</div><h1>Ruang Kelas</h1><p id="class-room-subtitle">${cached ? esc(`${cached.class?.class_code || ''} · ${roleLabel(cached.class?.role || 'MEMBER')}`) : 'Memuat detail kelas…'}</p></div><button id="back-classes" class="btn btn-secondary">${svg('i-back')} Kembali</button></div>
    <div id="class-room-slot">${cached ? '' : roomSkeleton()}</div>
  </div>`;

  document.getElementById('app').innerHTML = appShell({ active: 'classes', content, hideSearch: true });
  bindAppShell();
  document.getElementById('back-classes').onclick = () => go('classes');
  timelineCategory = 'ALL';
  activeTab = sessionStorage.getItem('kelasku_class_tab') || 'overview';
  sessionStorage.removeItem('kelasku_class_tab');
  if (cached) drawClass(cached, false);
  loadClassDetail(Boolean(cached));
}

async function loadClassDetail(background = false, force = false) {
  const classId = String(state.selectedClassId || '');
  const slot = document.getElementById('class-room-slot');
  const cached = state.classDetails[classId];
  if (!force && cached && cacheFresh(state.classDetailsAt, classId, CLASS_DETAIL_TTL_MS)) return cached;
  if (classDetailInFlight.has(classId)) return classDetailInFlight.get(classId);

  const request = (async () => {
    try {
      const data = await api('getClassDetail', { class_id: classId });
      const previous = state.classDetails[classId];
      const changed = !sameData(previous, data);
      persistClassCache('classDetails','classDetailsAt','kelasku_class_details_cache','kelasku_class_details_cache_at',classId,data);
      if (String(state.selectedClassId) === classId) {
        currentClassData = data;
        if (changed || !background) drawClass(data, true);
      }
      return data;
    } catch (err) {
      if (!background && !cached && slot && String(state.selectedClassId) === classId) {
        slot.innerHTML = `<div class="panel error-panel"><strong>Kelas gagal dimuat.</strong><p>${esc(err.message)}</p><button class="btn btn-secondary" id="back-error">Kembali ke Kelas</button></div>`;
        document.getElementById('back-error').onclick = () => go('classes');
      }
      return cached || null;
    } finally {
      classDetailInFlight.delete(classId);
    }
  })();
  classDetailInFlight.set(classId, request);
  return request;
}

function drawClass(data, preserveTab = true) {
  currentClassData = data;
  const c = data.class || {};
  const p = data.permissions || {};
  const desiredTab = preserveTab ? activeTab : 'overview';
  const leader = (data.members || []).find(m => m.is_class_leader);
  document.getElementById('class-room-subtitle').textContent = `${c.class_code || ''} · ${roleLabel(c.role || 'MEMBER')}${leader && String(leader.user_id) === String(state.user?.user_id) ? ' • Ketua Kelas' : ''}`;

  document.getElementById('class-room-slot').innerHTML = `
    <section class="class-hero class-hero-v51 panel">
      <div class="class-hero-icon">${svg('i-class')}</div>
      <div class="class-hero-main">
        <h2>${esc(c.name)}</h2>
        <div class="class-primary-meta"><span>${esc(c.institution || 'KelasKu')}</span>${c.study_program?`<span>${esc(c.study_program)}</span>`:''}${c.cohort?`<span>Angkatan ${esc(c.cohort)}</span>`:''}${c.semester?`<span>${esc(c.semester)}</span>`:''}</div>
        <p class="class-hero-description">${esc(c.description || 'Belajar dan berdiskusi bersama dalam satu ruang.')}</p>
        <div class="class-identity-divider"></div>
        <div class="class-hero-bottomline">
          <div class="class-secondary-meta"><span>Class</span><i>•</i><span>${esc(c.visibility || 'DISCOVERABLE')}</span></div>
          <div class="class-badge-line class-badge-bottom"><span class="role-pill role-${String(c.role||'member').toLowerCase()}">${esc(roleLabel(c.role || 'MEMBER'))}</span>${leader && String(leader.user_id)===String(state.user?.user_id)?'<span class="role-pill leader-role-pill">Ketua Kelas</span>':''}</div>
        </div>
      </div>
      <aside class="class-hero-code-rail" aria-label="Kode kelas">
        <div class="class-code-rail-item"><span>Class Code</span><div><strong>${esc(c.class_code || '-')}</strong><button data-copy="${esc(c.class_code || '')}" class="icon-btn mini" title="Salin Class Code">${svg('i-copy')}</button></div></div>
        ${p.can_manage_class ? `<div class="class-code-rail-item"><span>Join Code</span><div><strong>${esc(c.join_code || '-')}</strong><button data-copy="${esc(c.join_code || '')}" class="icon-btn mini" title="Salin Join Code">${svg('i-copy')}</button></div></div>`:''}
      </aside>
    </section>

    <section class="room-navigation-shell" aria-label="Navigasi Ruang Kelas">
      <nav class="room-main-nav" id="room-main-nav">
        ${roomMainButton('overview','i-home','Ringkasan')}
        ${roomMainButton('timeline','i-timeline','Timeline')}
        ${roomMainButton('messages','i-chat','Pesan')}
        ${roomMainButton('academic','i-class','Akademik')}
        ${roomMainButton('members','i-users',`Anggota`,(data.members||[]).length)}
        ${roomMainButton('elections','i-vote','Pemilihan',(data.leader_elections||[]).filter(x=>x.status==='ACTIVE').length)}
        ${(p.can_manage_members||p.can_manage_class) ? roomMainButton('manage','i-gear','Kelola',(data.pending_requests||[]).length) : ''}
      </nav>
      <div class="room-subnav" id="room-subnav"></div>
    </section>
    <div id="room-content"></div>`;

  document.querySelectorAll('[data-copy]').forEach(btn => btn.onclick = () => copyText(btn.dataset.copy));
  bindRoomNavigation(data);
  switchTab(desiredTab, data);
  scheduleClassWarmup(state.selectedClassId);
}

function roomMainButton(key,icon,label,count=0){
  const badge=Number(count||0)>0?`<b>${Number(count)}</b>`:'';
  return `<button type="button" class="room-main-item" data-room-main="${key}"><span class="room-main-icon">${svg(icon)}</span><span>${label}</span>${badge}</button>`;
}
function roomMainKey(tab){
  if(['announcements','schedule','tasks','materials','attendance','analytics'].includes(tab))return 'academic';
  if(['requests','settings'].includes(tab))return 'manage';
  return tab;
}
function bindRoomNavigation(data){
  document.querySelectorAll('[data-room-main]').forEach(btn=>btn.onclick=()=>{
    const key=btn.dataset.roomMain;
    if(key==='academic')return switchTab('announcements',data);
    if(key==='manage')return switchTab((data.pending_requests||[]).length?'requests':'settings',data);
    switchTab(key,data);
  });
}
function refreshRoomNavigation(tab,data){
  const main=roomMainKey(tab);
  document.querySelectorAll('[data-room-main]').forEach(btn=>btn.classList.toggle('active',btn.dataset.roomMain===main));
  const sub=document.getElementById('room-subnav'); if(!sub)return;
  let items=[];
  if(main==='academic'){
    items=[['announcements','campaign','Pengumuman'],['schedule','calendar_month','Jadwal'],['tasks','checklist','Tugas'],['materials','description','Materi'],['attendance','how_to_reg','Absensi'],['analytics','monitoring','Analitik']];
  }else if(main==='manage'){
    if(data.permissions?.can_manage_members)items.push(['requests','group_add',`Permintaan ${(data.pending_requests||[]).length}`]);
    if(data.permissions?.can_manage_class)items.push(['settings','settings','Pengaturan Kelas']);
  }
  if(!items.length){sub.innerHTML='';sub.hidden=true;return;}
  sub.hidden=false;
  sub.innerHTML=`<div class="room-subnav-strip" role="tablist" aria-label="${main==='academic'?'Menu Akademik':'Kelola Kelas'}">
    ${items.map(([key,icon,itemLabel])=>`<button type="button" role="tab" aria-selected="${tab===key?'true':'false'}" class="room-subnav-chip ${tab===key?'active':''}" data-room-sub="${key}"><span class="material-symbols-rounded">${icon}</span><span>${esc(itemLabel)}</span></button>`).join('')}
  </div>`;
  sub.querySelectorAll('[data-room-sub]').forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.roomSub,data));
}
function switchTab(tab, data) {
  activeTab = tab;
  refreshRoomNavigation(tab,data);
  const slot = document.getElementById('room-content');
  if (!slot) return;

  if (tab === 'messages') {
    sessionStorage.setItem('kelasku_message_class', state.selectedClassId);
    go('messages');
    return;
  }

  if (tab === 'timeline') {
    const cached = state.classTimeline[state.selectedClassId];
    if (cached) drawTimeline(cached);
    else slot.innerHTML = fastRoomLoader('Menyiapkan Timeline…');
    loadClassTimeline(Boolean(cached));
    return;
  }

  if (tab === 'analytics') {
    const cached = state.classAnalytics[state.selectedClassId];
    if (cached) drawClassAnalytics(cached);
    else slot.innerHTML = fastRoomLoader('Menyiapkan Analitik…');
    loadClassAnalytics(Boolean(cached));
    return;
  }

  if (['announcements','schedule','tasks','materials','attendance'].includes(tab)) {
    const cached = state.classAcademic[state.selectedClassId];
    if (cached) drawAcademicTab(tab, cached);
    else slot.innerHTML = fastRoomLoader('Menyiapkan data Akademik…');
    loadClassAcademic(Boolean(cached));
    return;
  }

  if (tab === 'members') slot.innerHTML = membersHtml(data);
  else if (tab === 'elections') slot.innerHTML = electionsHtml(data);
  else if (tab === 'requests') slot.innerHTML = requestsHtml(data);
  else if (tab === 'settings') slot.innerHTML = settingsHtml(data);
  else slot.innerHTML = overviewHtml(data);
  bindTab(tab, data);
}

async function loadClassAcademic(background = false, force = false) {
  const classId = String(state.selectedClassId || '');
  const cached = state.classAcademic[classId];
  if (!force && cached && cacheFresh(state.classAcademicAt, classId, CLASS_ACADEMIC_TTL_MS)) return cached;
  if (classAcademicInFlight.has(classId)) return classAcademicInFlight.get(classId);

  const request = (async () => {
    try {
      const data = await api('getClassAcademic', { class_id: classId });
      const previous = state.classAcademic[classId];
      const changed = !sameData(previous, data);
      persistClassCache('classAcademic','classAcademicAt','kelasku_class_academic_cache','kelasku_class_academic_cache_at',classId,data);
      if (String(state.selectedClassId) === classId && ['announcements','schedule','tasks','materials','attendance'].includes(activeTab) && (changed || !background)) {
        drawAcademicTab(activeTab, data);
      }
      return data;
    } catch (err) {
      if (!background && !cached && ['announcements','schedule','tasks','materials','attendance'].includes(activeTab) && String(state.selectedClassId) === classId) {
        document.getElementById('room-content').innerHTML = `<div class="panel error-panel"><strong>Data akademik gagal dimuat.</strong><p>${esc(err.message)}</p></div>`;
      }
      return cached || null;
    } finally {
      classAcademicInFlight.delete(classId);
    }
  })();
  classAcademicInFlight.set(classId, request);
  return request;
}

function overviewHtml(data) {
  const c=data.class||{}, p=data.permissions||{};
  const leader=(data.members||[]).find(m=>m.is_class_leader);
  return `<section class="room-overview room-overview-v64">
    <div class="panel"><div class="panel-head"><div><div class="panel-title">Informasi Kelas</div><p class="panel-copy">Identitas utama dan struktur kelas.</p></div></div><div class="detail-list">
      ${detail('Institusi',c.institution||'KelasKu')}${detail('Program Studi',c.study_program||'-')}${detail('Angkatan',c.cohort?`Angkatan ${c.cohort}`:'-')}${detail('Semester',c.semester||'-')}${detail('Ketua Kelas',leader?(leader.full_name||leader.username):'Belum ditetapkan')}
    </div></div>
    <div class="panel"><div class="panel-head"><div><div class="panel-title">Status Kelas</div><p class="panel-copy">Status keanggotaan dan akses kelas saat ini.</p></div></div><div class="detail-list">
      ${detail('Role kamu',roleLabel(c.role||'MEMBER'))}${detail('Visibilitas',c.visibility||'-')}${detail('Anggota aktif',String((data.members||[]).length))}${detail('Class Code',c.class_code||'-')}
    </div></div>
    ${p.can_manage_class?`<div class="panel wide-panel overview-manager-panel"><div><div class="panel-title">Kelola Kelas</div><p class="panel-copy">Akses pengaturan dan pengelolaan anggota tanpa mengubah tampilan Ringkasan.</p></div><div class="page-actions"><button id="quick-settings" class="btn btn-primary">${svg('i-gear')} Pengaturan Kelas</button><button id="quick-members" class="btn btn-secondary">${svg('i-users')} Anggota & Ketua Kelas</button></div></div>`:''}
  </section>`;
}

function moduleButton(icon,title,copy,tab){ return `<button type="button" class="class-module-card" data-module-tab="${tab}"><span>${svg(icon)}</span><span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>${svg('i-arrow')}</button>`; }

function drawAcademicTab(tab, data) {
  const slot = document.getElementById('room-content');
  if (!slot) return;
  const p = data.permissions || {};
  if (tab === 'announcements') slot.innerHTML = announcementsRoom(data.announcements || [], p);
  if (tab === 'schedule') slot.innerHTML = scheduleRoom(data.schedules || [], p, data.attendance_sessions || []);
  if (tab === 'tasks') slot.innerHTML = tasksRoom(data.tasks || [], p);
  if (tab === 'materials') slot.innerHTML = materialsRoom(data.materials || [], p);
  if (tab === 'attendance') slot.innerHTML = attendanceRoom(data.attendance_sessions || [], p);
  bindAcademicTab(tab, data);
}

async function loadClassTimeline(background=false) {
  const classId=String(state.selectedClassId||'');
  const category=String(timelineCategory||'ALL');
  const key=`${classId}:${category}`;
  const cached=state.classTimeline[classId];
  const freshAll = category === 'ALL' && cached && (Date.now() - Number(state.classTimelineAt?.[classId] || 0) < 60000);
  if (freshAll) return cached;
  if(classTimelineInFlight.has(key))return classTimelineInFlight.get(key);
  const request=(async()=>{
    try {
      const data = await api('getClassTimeline',{class_id:classId,category,limit:60});
      const previous = state.classTimeline[classId];
      const changed = !sameData(previous, data);
      if(String(state.selectedClassId)===classId && String(timelineCategory)===category){
        state.classTimeline[classId] = data;
        state.classTimelineAt[classId]=Date.now();
        if ((changed || !background) && activeTab === 'timeline') drawTimeline(data);
      }
      return data;
    } catch (err) {
      if (!background && !cached && activeTab === 'timeline' && String(state.selectedClassId)===classId) {
        document.getElementById('room-content').innerHTML = `<div class="panel error-panel"><strong>Timeline gagal dimuat.</strong><p>${esc(err.message)}</p></div>`;
      }
      return cached||null;
    } finally { classTimelineInFlight.delete(key); }
  })();
  classTimelineInFlight.set(key,request);
  return request;
}

function drawTimeline(data) {
  const slot=document.getElementById('room-content'); if(!slot)return;
  slot.innerHTML=timelineRoom(data.items||[]);
  document.querySelectorAll('[data-timeline-filter]').forEach(btn=>btn.onclick=()=>{
    timelineCategory=btn.dataset.timelineFilter;
    document.querySelectorAll('[data-timeline-filter]').forEach(x=>x.classList.toggle('active',x.dataset.timelineFilter===timelineCategory));
    loadClassTimeline(true);
  });
}

function timelineRoom(events) {
  const filters=[['ALL','Semua'],['AKADEMIK','Akademik'],['ANGGOTA','Anggota'],['KEPEMIMPINAN','Kepemimpinan'],['SISTEM','Sistem']];
  return `<section class="panel class-timeline-panel"><div class="panel-head"><div><div class="panel-title">Timeline Kelas</div><p class="panel-copy">Aktivitas penting saja, dengan filter agar timeline tetap ringan saat kelas sudah berjalan lama.</p></div><span class="phase-badge">${events.length} AKTIVITAS</span></div>
    <div class="timeline-filter-row">${filters.map(f=>`<button type="button" class="filter-chip ${timelineCategory===f[0]?'active':''}" data-timeline-filter="${f[0]}">${f[1]}</button>`).join('')}</div>
    ${events.length?`<div class="class-zigzag-timeline">${events.map((e,i)=>`<article class="class-timeline-item ${i%2?'right':'left'}"><div class="class-timeline-node">${svg(timelineIcon(e.event_type))}</div><div class="class-timeline-card"><span>${esc(e.category||'SISTEM')} · ${esc(shortDateTime(e.created_at))}</span><strong>${esc(e.title||'-')}</strong><p>${esc(e.body||'')}</p></div></article>`).join('')}</div>`:'<div class="search-empty">Belum ada aktivitas pada filter ini.</div>'}
  </section>`;
}
function timelineIcon(type){const x=String(type||'').toUpperCase();if(x.includes('TASK'))return'i-task';if(x.includes('SCHEDULE'))return'i-calendar';if(x.includes('MATERIAL'))return'i-file';if(x.includes('ATTENDANCE'))return'i-check';if(x.includes('POLL')||x.includes('LEADER'))return'i-vote';if(x.includes('MEMBER'))return'i-users';if(x.includes('ANNOUNCEMENT'))return'i-mega';return'i-timeline';}

function announcementsRoom(items,p) {
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Pengumuman Kelas</div><p class="panel-copy">Klik pengumuman untuk membaca detail. Pengelola dapat mengedit atau menghapus.</p></div>${p.can_publish?`<button id="create-announcement" class="btn btn-primary">${svg('i-plus')} Buat</button>`:''}</div>
    <div class="academic-compact-list">${items.length?items.map(x=>`<article class="academic-compact-row priority-${String(x.priority||'normal').toLowerCase()}"><button type="button" class="academic-compact-main" data-announcement-detail="${esc(x.announcement_id)}"><span class="academic-type-icon"><span class="material-symbols-rounded">campaign</span></span><span class="academic-compact-copy"><span class="academic-meta-line"><span>${esc(shortDateTime(x.published_at))}</span><span class="status-badge status-${String(x.priority||'normal').toLowerCase()}">${esc(x.priority||'NORMAL')}</span></span><strong>${esc(x.title)}</strong><small>${esc(excerpt(x.body||'',150))}</small></span><span class="material-symbols-rounded row-chevron">chevron_right</span></button>${p.can_publish?`<div class="academic-row-actions compact-actions"><button type="button" class="icon-btn mini" data-edit-announcement="${esc(x.announcement_id)}" title="Edit"><span class="material-symbols-rounded">edit</span></button>${archiveButton('ANNOUNCEMENT',x.announcement_id,'Hapus')}</div>`:''}</article>`).join(''):'<div class="search-empty">Belum ada pengumuman.</div>'}</div></section>`;
}

function scheduleRoom(items,p,attendanceItems) {
  const sorted=decorateScheduleSessions([...items].sort((a,b)=>dateMs(a.start_at)-dateMs(b.start_at)));
  const attendanceBySchedule={}; (attendanceItems||[]).forEach(x=>{if(x.source_schedule_id)attendanceBySchedule[String(x.source_schedule_id)]=x;});
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Jadwal Kelas</div><p class="panel-copy">Satu seri dapat membuat banyak sesi. Setiap sesi tetap bisa diedit atau dibatalkan sendiri.</p></div>${(p.can_manage_schedule||p.can_manage_academic)?`<button id="create-schedule" class="btn btn-primary">${svg('i-plus')} Tambah Jadwal</button>`:''}</div>
    <div class="academic-compact-list">${sorted.length?sorted.map(x=>{const at=attendanceBySchedule[String(x.schedule_id)]||null;const stateBadge=scheduleStateBadge(x);const sessionBadge=x._sessionNo?`<span class="soft-chip">Sesi ${String(x._sessionNo).padStart(2,'0')}${x._sessionTotal>1?`/${x._sessionTotal}`:''}</span>`:'';const locationLabel=isWebUrl(x.location)?'Online • Zoom/Meet':(x.location||'Tanpa lokasi');return `<article class="academic-compact-row schedule-row-${String(x.schedule_state||'normal').toLowerCase()}"><button type="button" class="academic-compact-main" data-schedule-detail="${esc(x.schedule_id)}"><span class="academic-date-tile compact"><strong>${esc(dayPart(x.start_at))}</strong><span>${esc(monthPart(x.start_at))}</span></span><span class="academic-compact-copy"><span class="academic-meta-line"><span>${esc(timeRange(x.start_at,x.end_at))}</span><span>${esc(locationLabel)}</span>${sessionBadge}${stateBadge}${x.recurrence_group_id?'<span class="soft-chip">Berulang</span>':''}</span><strong>${esc(x.title)}</strong><small>${esc(excerpt(x.description||'Klik untuk melihat detail jadwal.',130))}</small></span><span class="material-symbols-rounded row-chevron">chevron_right</span></button><div class="academic-row-actions compact-actions">${at?`<button type="button" class="icon-btn mini" data-copy-attendance="${esc(at.public_token||'')}" title="Salin link absensi">${svg('i-link')}</button>`:''}${(p.can_manage_schedule||p.can_manage_academic)?`<button type="button" class="icon-btn mini" data-edit-schedule="${esc(x.schedule_id)}" title="Edit sesi"><span class="material-symbols-rounded">edit_calendar</span></button>`:''}</div></article>`;}).join(''):'<div class="search-empty">Belum ada jadwal.</div>'}</div></section>`;
}

function tasksRoom(items,p) {
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Tugas Kelas</div><p class="panel-copy">Deadline, pengumpulan, review, nilai, dan feedback.</p></div>${p.can_manage_academic?`<button id="create-task" class="btn btn-primary">${svg('i-plus')} Buat Tugas</button>`:''}</div><div class="academic-card-list">${items.length?items.map(x=>`<article class="academic-row-card"><span class="academic-type-icon">${svg('i-task')}</span><div class="academic-row-main"><div class="academic-meta-line"><span>${esc(deadlineText(x.deadline))}</span><span>${esc(x.submission_mode||'NONE')}</span><span>Maks ${esc(String(x.max_score||0))}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.description||'')}</p><small>Status kamu: ${esc(x.submission_status||'NOT_SUBMITTED')}${x.submission?.review_status?` · Review ${esc(x.submission.review_status)}`:''}${x.submission?.score!==''&&x.submission?.score!==undefined?` · Nilai ${esc(String(x.submission.score))}/${esc(String(x.max_score||0))}`:''}</small></div><div class="academic-row-actions"><button type="button" class="btn btn-secondary small-btn" data-open-global-task="${esc(x.task_id)}">Buka</button>${p.can_review_tasks?`<button type="button" class="btn btn-secondary small-btn" data-review-task="${esc(x.task_id)}">${svg('i-grade')} Review</button>`:''}${p.can_manage_academic?archiveButton('TASK',x.task_id):''}</div></article>`).join(''):'<div class="search-empty">Belum ada tugas.</div>'}</div></section>`;
}

function materialsRoom(items,p) {
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Materi Kelas</div><p class="panel-copy">Materi, link, dan beberapa lampiran gambar dalam satu item.</p></div>${p.can_publish?`<button id="create-material" class="btn btn-primary">${svg('i-plus')} Tambah Materi</button>`:''}</div><div class="academic-compact-list">${items.length?items.map(x=>`<article class="academic-compact-row"><button type="button" class="academic-compact-main" data-material-detail="${esc(x.material_id)}"><span class="academic-type-icon"><span class="material-symbols-rounded">${(x.attachments||[]).length?'collections_bookmark':(x.material_type==='LINK'||x.material_type==='DRIVE_LINK')?'link':'description'}</span></span><span class="academic-compact-copy"><span class="academic-meta-line"><span>${esc(shortDate(x.published_at))}</span>${x.topic?`<span>${esc(x.topic)}</span>`:''}${x.meeting_no?`<span>Pertemuan ${esc(x.meeting_no)}</span>`:''}${(x.attachments||[]).length?`<span class="soft-chip">${(x.attachments||[]).length} lampiran</span>`:''}</span><strong>${esc(x.title)}</strong><small>${esc(excerpt(x.description||'Klik untuk membuka materi.',145))}</small></span><span class="material-symbols-rounded row-chevron">chevron_right</span></button>${p.can_publish?`<div class="academic-row-actions compact-actions">${archiveButton('MATERIAL',x.material_id,'Hapus')}</div>`:''}</article>`).join(''):'<div class="search-empty">Belum ada materi.</div>'}</div></section>`;
}

function attendanceRoom(items,p) {
  const sorted=[...items].sort((a,b)=>dateMs(b.start_at)-dateMs(a.start_at));
  const totalPages=Math.max(1,Math.ceil(sorted.length/CLASS_ATTENDANCE_PAGE_SIZE));
  classAttendancePage=Math.min(Math.max(1,classAttendancePage),totalPages);
  const pageItems=sorted.slice((classAttendancePage-1)*CLASS_ATTENDANCE_PAGE_SIZE,classAttendancePage*CLASS_ATTENDANCE_PAGE_SIZE);
  const rows=pageItems.length?pageItems.map(x=>`<article class="academic-compact-row"><button type="button" class="academic-compact-main" data-attendance-id="${esc(x.attendance_id)}"><span class="academic-type-icon attendance-icon"><span class="material-symbols-rounded">how_to_reg</span></span><span class="academic-compact-copy"><span class="academic-meta-line"><span>${esc(shortDateTime(x.start_at))}</span><span class="attendance-window-chip window-${String(x.window_status||'').toLowerCase()}">${esc(windowLabel(x.window_status))}</span></span><strong>${esc(x.title)}</strong><small>Status kamu: ${esc(x.my_status||'UNMARKED')}</small></span><span class="material-symbols-rounded row-chevron">chevron_right</span></button>${x.public_token?`<div class="academic-row-actions compact-actions"><button type="button" class="icon-btn mini" data-copy-attendance="${esc(x.public_token)}" title="Salin link absensi">${svg('i-link')}</button></div>`:''}</article>`).join(''):'<div class="search-empty">Belum ada sesi absensi.</div>';
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Absensi</div><p class="panel-copy">Sesi manual atau otomatis dari jadwal. Maksimal ${CLASS_ATTENDANCE_PAGE_SIZE} sesi per halaman agar tetap ringan.</p></div>${p.can_manage_attendance?`<button id="create-attendance" class="btn btn-primary">${svg('i-plus')} Buat Sesi</button>`:''}</div><div class="academic-compact-list">${rows}</div>${classAttendancePaginationHtml(classAttendancePage,totalPages,sorted.length)}</section>`;
}
function classAttendancePaginationHtml(page,totalPages,total){
  if(!total)return '';
  if(totalPages<=1)return `<div class="table-pagination compact"><span>${total} sesi</span></div>`;
  const pages=[];for(let i=Math.max(1,page-2);i<=Math.min(totalPages,page+2);i++)pages.push(`<button type="button" data-class-attendance-page="${i}" class="${i===page?'active':''}">${i}</button>`);
  return `<div class="table-pagination"><span>${total} sesi • Halaman ${page}/${totalPages}</span><div><button type="button" data-class-attendance-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>‹</button>${pages.join('')}<button type="button" data-class-attendance-page="${Math.min(totalPages,page+1)}" ${page>=totalPages?'disabled':''}>›</button></div></div>`;
}

function bindAcademicTab(tab,data) {
  const p=data.permissions||{};
  if(tab==='announcements'&&p.can_publish) document.getElementById('create-announcement').onclick=openCreateAnnouncement;
  if(tab==='schedule'&&(p.can_manage_schedule||p.can_manage_academic)) document.getElementById('create-schedule').onclick=openCreateSchedule;
  if(tab==='tasks'&&p.can_manage_academic) document.getElementById('create-task').onclick=openCreateTask;
  if(tab==='materials'&&p.can_publish) document.getElementById('create-material').onclick=openCreateMaterial;
  if(tab==='attendance'&&p.can_manage_attendance) document.getElementById('create-attendance').onclick=openCreateAttendance;
  if(tab==='tasks') document.querySelectorAll('[data-review-task]').forEach(btn=>btn.onclick=()=>openTaskReview(btn.dataset.reviewTask));
  document.querySelectorAll('[data-archive-type]').forEach(btn=>btn.onclick=()=>archiveItem(btn.dataset.archiveType,btn.dataset.archiveId,btn));
  document.querySelectorAll('[data-open-global-task]').forEach(btn=>btn.onclick=()=>openTaskModal(btn.dataset.openGlobalTask,data.tasks||[],{onSuccess:async()=>{markClassCacheStale('classAcademicAt','kelasku_class_academic_cache_at',state.selectedClassId);await loadClassAcademic(false,true);}}));
  document.querySelectorAll('[data-attendance-id]').forEach(btn=>btn.onclick=()=>openAttendance(btn.dataset.attendanceId));
  document.querySelectorAll('[data-class-attendance-page]').forEach(btn=>btn.onclick=()=>{classAttendancePage=Number(btn.dataset.classAttendancePage)||1;drawAcademicTab('attendance',data);});
  document.querySelectorAll('[data-copy-attendance]').forEach(btn=>btn.onclick=()=>copyAttendanceLink(btn.dataset.copyAttendance));
  document.querySelectorAll('[data-announcement-detail]').forEach(btn=>btn.onclick=()=>openAnnouncementDetail(btn.dataset.announcementDetail,data));
  document.querySelectorAll('[data-edit-announcement]').forEach(btn=>btn.onclick=()=>openEditAnnouncement(btn.dataset.editAnnouncement,data));
  document.querySelectorAll('[data-schedule-detail]').forEach(btn=>btn.onclick=()=>openScheduleDetail(btn.dataset.scheduleDetail,data));
  document.querySelectorAll('[data-edit-schedule]').forEach(btn=>btn.onclick=()=>openEditSchedule(btn.dataset.editSchedule,data));
  document.querySelectorAll('[data-material-detail]').forEach(btn=>btn.onclick=()=>openMaterialDetail(btn.dataset.materialDetail,data));
}

function openCreateAnnouncement(){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Pengumuman</div><h2>Buat Pengumuman</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-create-form"><div class="field"><label>Judul</label><input name="title" class="control" required minlength="3"></div><div class="field"><label>Isi</label><textarea name="body" class="control" rows="6" required></textarea></div><div class="field"><label>Prioritas</label><select name="priority" class="control"><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option><option value="LOW">Low</option></select></div>${formFooter('Publikasikan')}</form>`);
  bindCreateForm('createAnnouncement');
}
function openAnnouncementDetail(id,data){
  const x=(data.announcements||[]).find(v=>String(v.announcement_id)===String(id));if(!x)return;
  const can=data.permissions?.can_publish;
  showModal(`<div class="modal-head"><div><div class="eyebrow">PENGUMUMAN • ${esc(shortDateTime(x.published_at))}</div><h2>${esc(x.title)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="detail-badge-row"><span class="status-badge status-${String(x.priority||'normal').toLowerCase()}">${esc(x.priority||'NORMAL')}</span>${x.updated_at&&x.updated_at!==x.published_at?'<span class="soft-chip">Diperbarui</span>':''}</div><div class="academic-detail-body">${nl2br(x.body||'')}</div>${can?`<div class="modal-actions"><button type="button" id="detail-edit-announcement" class="btn btn-secondary"><span class="material-symbols-rounded">edit</span> Edit</button><button type="button" id="detail-delete-announcement" class="btn btn-danger">${svg('i-close')} Hapus</button></div>`:''}`);
  document.getElementById('detail-edit-announcement')?.addEventListener('click',()=>openEditAnnouncement(id,data));
  document.getElementById('detail-delete-announcement')?.addEventListener('click',async()=>{closeModal();const btn=document.querySelector(`[data-archive-id="${CSS.escape(id)}"]`);await archiveItem('ANNOUNCEMENT',id,btn);});
}
function openEditAnnouncement(id,data){
  const x=(data.announcements||[]).find(v=>String(v.announcement_id)===String(id));if(!x)return;
  showModal(`<div class="modal-head"><div><div class="eyebrow">Pengumuman</div><h2>Edit Pengumuman</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-edit-announcement"><div class="field"><label>Judul</label><input name="title" class="control" value="${esc(x.title)}" required minlength="3"></div><div class="field"><label>Isi</label><textarea name="body" class="control" rows="6" required>${esc(x.body||'')}</textarea></div><div class="field"><label>Prioritas</label><select name="priority" class="control">${['NORMAL','HIGH','URGENT','LOW'].map(v=>`<option value="${v}" ${x.priority===v?'selected':''}>${v}</option>`).join('')}</select></div>${formFooter('Simpan Perubahan')}</form>`);
  const form=document.getElementById('academic-edit-announcement');form.onsubmit=async e=>{e.preventDefault();const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status');btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';try{await api('updateAnnouncement',{announcement_id:id,...Object.fromEntries(new FormData(form))});closeModal();toast('Pengumuman diperbarui.');await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;}};
}

function openCreateSchedule(){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Jadwal + Sesi</div><h2>Tambah Jadwal</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-create-form"><div class="field"><label>Judul / Mata Kuliah</label><input name="title" class="control" required minlength="3" placeholder="Contoh: Sejarah Peradaban Islam"></div><div class="field"><label>Deskripsi</label><textarea name="description" class="control" rows="3"></textarea></div><div class="form-grid"><div class="field"><label>Mulai sesi pertama</label><input name="start_at" type="datetime-local" class="control" required></div><div class="field"><label>Selesai</label><input name="end_at" type="datetime-local" class="control"></div></div><div class="field"><label>Lokasi / Link Zoom atau Meet</label><input name="location" class="control" placeholder="Ruang 3 atau https://zoom.us/..."><div class="form-help">Link meeting hanya ditampilkan di Ruang Kelas untuk anggota yang sudah login.</div></div><div class="schedule-repeat-box"><div class="form-grid"><div class="field"><label>Pengulangan</label><select name="recurrence_frequency" id="schedule-repeat" class="control"><option value="NONE">Tidak berulang</option><option value="WEEKLY">Setiap minggu</option><option value="DAILY">Setiap hari</option><option value="MONTHLY">Setiap bulan</option></select></div><div class="field"><label>Mulai dari sesi</label><input name="session_start" type="number" min="1" max="99" value="1" class="control"></div></div><div class="repeat-field hidden"><div class="field"><label>Total sesi / pertemuan</label><input name="recurrence_count" type="number" min="1" max="32" value="16" class="control"></div><div class="form-help">Contoh: mulai Sesi 01, total 16 → sistem membuat Sesi 01–16. Setiap sesi tetap dapat direvisi sendiri.</div></div></div><div class="field"><label>Mode Absensi</label><select name="attendance_mode" id="schedule-attendance-mode" class="control"><option value="MANUAL">Manual — buat sesi absensi nanti</option><option value="AUTO">Auto — buat absensi untuk tiap sesi</option></select></div><div id="schedule-auto-settings" class="schedule-auto-settings hidden"><div class="form-grid"><div class="field"><label>Buka sebelum jadwal</label><div class="input-suffix"><input name="attendance_open_before" type="number" min="0" max="240" value="10" class="control"><span>menit</span></div></div><div class="field"><label>Tutup setelah jadwal</label><div class="input-suffix"><input name="attendance_close_after" type="number" min="0" max="720" value="30" class="control"><span>menit</span></div></div></div><div class="form-help">AUTO membuat satu sesi absensi terpisah untuk setiap pertemuan agar rekap per sesi tetap jelas.</div></div>${formFooter('Simpan Jadwal')}</form>`);
  const mode=document.getElementById('schedule-attendance-mode'),auto=document.getElementById('schedule-auto-settings'),repeat=document.getElementById('schedule-repeat');
  mode.onchange=()=>{
    auto.classList.toggle('hidden',mode.value!=='AUTO');
    const count=document.querySelector('[name="recurrence_count"]');
    if(count){count.max=mode.value==='AUTO'?'20':'32';if(mode.value==='AUTO'&&Number(count.value)>20)count.value='20';}
  };
  repeat.onchange=()=>document.querySelectorAll('.repeat-field').forEach(el=>el.classList.toggle('hidden',repeat.value==='NONE'));
  bindCreateForm('createSchedule');
}

function openScheduleDetail(id,data){
  const decorated=decorateScheduleSessions(data.schedules||[]);
  const x=decorated.find(v=>String(v.schedule_id)===String(id));if(!x)return;const can=data.permissions?.can_manage_schedule||data.permissions?.can_manage_academic;
  const sessionBadge=x._sessionNo?`<span class="soft-chip">Sesi ${String(x._sessionNo).padStart(2,'0')}${x._sessionTotal>1?`/${x._sessionTotal}`:''}</span>`:'';
  const meeting=isWebUrl(x.location);const locationText=meeting?'Pertemuan online':(x.location||'-');
  showModal(`<div class="modal-head"><div><div class="eyebrow">JADWAL • ${esc(shortDateTime(x.start_at))}</div><h2>${esc(x.title)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="detail-badge-row">${sessionBadge}${scheduleStateBadge(x)}${x.recurrence_group_id?'<span class="soft-chip">Jadwal Berulang</span>':''}${String(x.attendance_mode)==='AUTO'?'<span class="soft-chip">Absensi Auto</span>':''}</div><div class="detail-list academic-detail-list">${detail('Mulai',shortDateTime(x.start_at))}${detail('Selesai',x.end_at?shortDateTime(x.end_at):'-')}${detail('Lokasi',locationText)}${x.change_note?detail('Catatan perubahan',x.change_note):''}</div>${meeting?`<button type="button" id="schedule-meeting-link" class="btn btn-primary btn-block"><span class="material-symbols-rounded">videocam</span> Buka Zoom / Meet</button>`:''}${x.description?`<div class="academic-detail-body">${nl2br(x.description)}</div>`:''}${can?`<div class="modal-actions"><button type="button" id="detail-edit-schedule" class="btn btn-secondary"><span class="material-symbols-rounded">edit_calendar</span> Edit Sesi</button>${String(x.schedule_state)!=='CANCELLED'?'<button type="button" id="detail-cancel-schedule" class="btn btn-danger"><span class="material-symbols-rounded">event_busy</span> Batalkan</button>':''}</div>`:''}`);
  document.getElementById('schedule-meeting-link')?.addEventListener('click',()=>openExternal(x.location));
  document.getElementById('detail-edit-schedule')?.addEventListener('click',()=>openEditSchedule(id,data));
  document.getElementById('detail-cancel-schedule')?.addEventListener('click',()=>openCancelSchedule(id,data));
}

function openEditSchedule(id,data){
  const decorated=decorateScheduleSessions(data.schedules||[]);
  const x=decorated.find(v=>String(v.schedule_id)===String(id));if(!x)return;
  const sessionLabel=x._sessionNo?`Sesi ${String(x._sessionNo).padStart(2,'0')}`:'jadwal ini';
  showModal(`<div class="modal-head"><div><div class="eyebrow">Jadwal • ${esc(sessionLabel)}</div><h2>Edit Jadwal</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-edit-schedule"><div class="field"><label>Judul</label><input name="title" class="control" value="${esc(x.title)}" required></div><div class="field"><label>Deskripsi</label><textarea name="description" rows="3" class="control">${esc(x.description||'')}</textarea></div><div class="form-grid"><div class="field"><label>Mulai</label><input name="start_at" type="datetime-local" class="control" value="${esc(toLocalInput(new Date(x.start_at)))}" required></div><div class="field"><label>Selesai</label><input name="end_at" type="datetime-local" class="control" value="${x.end_at?esc(toLocalInput(new Date(x.end_at))):''}"></div></div><div class="field"><label>Lokasi / Link Zoom atau Meet</label><input name="location" class="control" value="${esc(x.location||'')}"></div><div class="field"><label>Catatan perubahan</label><input name="change_note" class="control" placeholder="Contoh: ${esc(sessionLabel)} dimajukan 30 menit"></div>${x.recurrence_group_id?`<div class="field"><label>Terapkan perubahan</label><select name="scope" class="control"><option value="SINGLE">Hanya ${esc(sessionLabel)}</option><option value="FUTURE_SERIES">${esc(sessionLabel)} dan sesi berikutnya</option></select><div class="form-help">Nomor sesi tidak berubah. Tanggal, jam, lokasi/link meeting, judul, dan deskripsi dapat direvisi fleksibel.</div></div>`:'<input type="hidden" name="scope" value="SINGLE">'}${formFooter('Simpan Perubahan')}</form>`);
  const form=document.getElementById('academic-edit-schedule');form.onsubmit=async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(form));payload.schedule_id=id;['start_at','end_at'].forEach(k=>{if(payload[k])payload[k]=new Date(payload[k]).toISOString();});const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status');btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';try{await api('updateSchedule',payload);closeModal();toast('Jadwal sesi diperbarui dan diberi badge perubahan.');await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;}};
}

function openCancelSchedule(id,data){
  const x=(data.schedules||[]).find(v=>String(v.schedule_id)===String(id));if(!x)return;
  showModal(`<div class="modal-head"><div><div class="eyebrow">Pembatalan</div><h2>Batalkan Jadwal</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-cancel-schedule"><div class="alert warning">Jadwal tetap terlihat dengan badge <b>Dibatalkan</b> agar riwayat tidak hilang.</div><div class="field"><label>Alasan / catatan</label><textarea name="change_note" rows="3" class="control" required placeholder="Contoh: Dosen berhalangan hadir"></textarea></div>${x.recurrence_group_id?`<div class="field"><label>Batalkan</label><select name="scope" class="control"><option value="SINGLE">Hanya jadwal ini</option><option value="FUTURE_SERIES">Jadwal ini dan berikutnya</option></select></div>`:'<input type="hidden" name="scope" value="SINGLE">'}${formFooter('Batalkan Jadwal')}</form>`);
  const form=document.getElementById('academic-cancel-schedule');form.onsubmit=async e=>{e.preventDefault();const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status');btn.disabled=true;try{await api('cancelSchedule',{schedule_id:id,...Object.fromEntries(new FormData(form))});closeModal();toast('Jadwal dibatalkan.');await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;}};
}

function openCreateTask(){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Tugas</div><h2>Buat Tugas</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-create-form"><div class="field"><label>Judul</label><input name="title" class="control" required minlength="3"></div><div class="field"><label>Instruksi</label><textarea name="description" class="control" rows="5"></textarea></div><div class="form-grid"><div class="field"><label>Deadline</label><input name="deadline" type="datetime-local" class="control"></div><div class="field"><label>Mode Pengumpulan</label><select name="submission_mode" class="control"><option value="TEXT_LINK">Teks atau Link</option><option value="TEXT">Teks</option><option value="LINK">Link</option><option value="NONE">Tidak melalui KelasKu</option></select></div></div><div class="field"><label>Nilai Maksimum</label><input name="max_score" type="number" min="0" max="1000" value="100" class="control"><div class="form-help">Dipakai pada workflow review/nilai. Gunakan 100 untuk skala persentase.</div></div><label class="setting-card"><span class="setting-card-copy"><strong>Izinkan terlambat</strong><small>Status akan ditandai LATE.</small></span><span class="switch"><input name="allow_late" type="checkbox" checked><span></span></span></label>${formFooter('Terbitkan Tugas')}</form>`);
  bindCreateForm('createTask');
}

function openCreateMaterial(){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Materi</div><h2>Tambah Materi</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="material-create-form"><div class="field"><label>Judul</label><input name="title" class="control" required minlength="3"></div><div class="field"><label>Deskripsi / Catatan</label><textarea name="description" class="control" rows="4"></textarea></div><div class="form-grid"><div class="field"><label>Topik</label><input name="topic" class="control" placeholder="Contoh: Kelangkaan & Pilihan"></div><div class="field"><label>Pertemuan</label><input name="meeting_no" class="control" placeholder="01"></div></div><div class="field"><label>Tipe</label><select name="material_type" id="material-type" class="control"><option value="NOTE">Catatan + Lampiran</option><option value="FILES">Gambar / Lampiran</option><option value="LINK">Link</option><option value="DRIVE_LINK">Google Drive / File Link</option></select></div><div class="field hidden" id="material-url-field"><label>URL</label><input name="url" type="url" class="control" placeholder="https://..."></div><div class="field"><label>Gambar / Foto (bisa lebih dari 1)</label><input id="material-files" type="file" accept="image/png,image/jpeg,image/webp" multiple class="control"><div class="form-help">Tidak ada auto-preview. File tampil sebagai daftar status upload. Maks. 12 gambar per materi.</div><div id="material-upload-list" class="material-upload-list"><span class="form-help">Belum ada file dipilih.</span></div></div>${formFooter('Terbitkan Materi')}</form>`);
  const type=document.getElementById('material-type'),files=document.getElementById('material-files');
  type.onchange=()=>document.getElementById('material-url-field').classList.toggle('hidden',!['LINK','DRIVE_LINK'].includes(type.value));
  files.onchange=()=>renderMaterialUploadList([...files.files].slice(0,12));
  bindMaterialCreateForm();
}
function renderMaterialUploadList(files,statuses={}){
  const slot=document.getElementById('material-upload-list');if(!slot)return;
  slot.innerHTML=files.length?files.map((f,i)=>{const st=statuses[i]||'WAIT';return `<div class="material-upload-item status-${st.toLowerCase()}"><span class="material-symbols-rounded">${st==='DONE'?'check_circle':st==='UPLOADING'?'sync':'image'}</span><div><strong>${esc(f.name)}</strong><small>${st==='DONE'?'Terupload ✓':st==='UPLOADING'?'Mengupload…':'Menunggu upload'}</small></div></div>`;}).join(''):'<span class="form-help">Belum ada file dipilih.</span>';
}
async function bindMaterialCreateForm(){
  const form=document.getElementById('material-create-form');form.onsubmit=async e=>{e.preventDefault();const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status'),files=[...document.getElementById('material-files').files].slice(0,12),statuses={};if(btn.disabled)return;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Mengupload…</span>';status.className='request-status progress';status.textContent='Menyiapkan lampiran…';const fileIds=[];try{for(let i=0;i<files.length;i++){statuses[i]='UPLOADING';renderMaterialUploadList(files,statuses);const processed=await compressImageFile(files[i],{maxEdge:1600,targetBytes:470000});const up=await api('uploadMaterialAttachment',{class_id:state.selectedClassId,filename:processed.name,data_url:processed.dataUrl});if(up?.file?.file_id)fileIds.push(up.file.file_id);statuses[i]='DONE';renderMaterialUploadList(files,statuses);}status.textContent='Lampiran selesai. Menyimpan materi…';const payload=Object.fromEntries(new FormData(form));payload.class_id=state.selectedClassId;payload.attachment_file_ids=fileIds;const result=await api('createMaterial',payload);closeModal();toast(`Materi tersimpan${fileIds.length?` dengan ${fileIds.length} lampiran`:''}.`);await refreshAcademicAfterMutation();return result;}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML='Terbitkan Materi';}};
}
function openMaterialDetail(id,data){
  const x=(data.materials||[]).find(v=>String(v.material_id)===String(id));if(!x)return;const attachments=x.attachments||[];
  showModal(`<div class="modal-head"><div><div class="eyebrow">MATERI • ${esc(shortDate(x.published_at))}</div><h2>${esc(x.title)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="detail-badge-row">${x.topic?`<span class="soft-chip">${esc(x.topic)}</span>`:''}${x.meeting_no?`<span class="soft-chip">Pertemuan ${esc(x.meeting_no)}</span>`:''}</div>${x.description?`<div class="academic-detail-body">${nl2br(x.description)}</div>`:''}${x.url?`<button type="button" id="material-detail-url" class="btn btn-secondary btn-block">${svg('i-link')} Buka Tautan Materi</button>`:''}${attachments.length?`<div class="material-download-section"><strong>Lampiran (${attachments.length})</strong><div class="material-download-list">${attachments.map((a,i)=>`<a class="material-download-row" href="${esc(a.download_url||a.url||'#')}" target="_blank" rel="noopener noreferrer" download><span class="material-symbols-rounded">image</span><span><strong>${esc(a.filename||`Lampiran ${i+1}`)}</strong><small>Download gambar</small></span><span class="material-symbols-rounded">download</span></a>`).join('')}</div></div>`:''}`);
  document.getElementById('material-detail-url')?.addEventListener('click',()=>openExternal(x.url));
}

function openCreateAttendance(){
  const nowLocal=toLocalInput(new Date());
  showModal(`<div class="modal-head"><div><div class="eyebrow">Absensi</div><h2>Buat Sesi Absensi</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-create-form"><div class="field"><label>Judul Pertemuan</label><input name="title" class="control" placeholder="Pertemuan 01 — Pengantar Ekonomi" required minlength="3"></div><div class="form-grid"><div class="field"><label>Mulai</label><input name="start_at" type="datetime-local" class="control" value="${esc(nowLocal)}" required></div><div class="field"><label>Selesai</label><input name="end_at" type="datetime-local" class="control"></div></div><p class="form-help">Setelah dibuat, sistem menyediakan link check-in khusus kelas. Link tetap mewajibkan login KelasKu.</p>${formFooter('Buat Sesi')}</form>`);
  bindCreateForm('createAttendanceSession');
}

function formFooter(label){return `<div id="academic-form-status" class="request-status"></div><button id="academic-form-submit" class="btn btn-primary btn-block" type="submit">${esc(label)}</button>`;}
function bindCreateForm(action){
  document.getElementById('academic-create-form').onsubmit=async e=>{
    e.preventDefault(); const form=e.currentTarget,btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status'),old=btn.innerHTML;
    if(btn.disabled)return;
    btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';status.className='request-status progress';status.textContent='Menyimpan dalam satu proses… Jangan klik dua kali.';
    const payload=Object.fromEntries(new FormData(form)); payload.class_id=state.selectedClassId;
    if(form.allow_late) payload.allow_late=form.allow_late.checked;
    ['start_at','end_at','deadline'].forEach(key=>{ if(payload[key]){const parsed=new Date(payload[key]);if(Number.isFinite(parsed.getTime()))payload[key]=parsed.toISOString();} });
    try{const result=await api(action,payload,{onSlow:()=>status.textContent='Server masih memproses. Tombol tetap dikunci sampai selesai.'});closeModal();toast('Data berhasil disimpan.');await refreshAcademicAfterMutation();if(action==='createSchedule'&&result?.attendance?.public_token)toast('Jadwal + sesi absensi otomatis berhasil dibuat.');}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}
  };
}

async function refreshAcademicAfterMutation(){invalidateAcademicClientCache(state.selectedClassId);markClassCacheStale('classAcademicAt','kelasku_class_academic_cache_at',state.selectedClassId);state.classAnalyticsAt[state.selectedClassId]=0;await loadClassAcademic(false,true);}
async function archiveItem(type,id,button){
  const ok=await confirmDialog({title:'Arsipkan item?',message:'Item akan disembunyikan dari kelas aktif. Data tidak dihapus permanen.',confirmText:'Arsipkan',danger:true}); if(!ok)return;
  const old=button?.innerHTML; if(button){button.disabled=true;button.innerHTML='<span class="btn-spinner"></span>';}
  try{await api('archiveAcademicItem',{type,id});toast('Item diarsipkan.');await refreshAcademicAfterMutation();}catch(err){toast(err.message);}finally{if(button&&document.body.contains(button)){button.disabled=false;button.innerHTML=old;}}
}
function archiveButton(type,id,label='Arsipkan'){return `<button type="button" class="icon-btn mini danger-btn" data-archive-type="${esc(type)}" data-archive-id="${esc(id)}" title="${esc(label)}">${svg('i-close')}</button>`;}


function isWebUrl(value){return /^https?:\/\//i.test(String(value||'').trim());}
function scheduleRuleObject(item){const raw=item?.recurrence_rule;if(raw&&typeof raw==='object')return raw;try{return JSON.parse(raw||'{}')||{};}catch{return {};}}
function decorateScheduleSessions(items){
  const rows=(items||[]).map(x=>({...x}));const groups={};
  rows.forEach(x=>{const rule=scheduleRuleObject(x);if(Number(rule.session_no||0)>0){x._sessionNo=Number(rule.session_no);x._sessionTotal=Number(rule.session_total||rule.count||1);}const gid=String(x.recurrence_group_id||'');if(gid)(groups[gid]||=[]).push(x);});
  Object.values(groups).forEach(group=>{group.sort((a,b)=>dateMs(a.start_at)-dateMs(b.start_at));group.forEach((x,i)=>{if(!x._sessionNo)x._sessionNo=i+1;if(!x._sessionTotal)x._sessionTotal=group.length;});});
  return rows;
}

function excerpt(text,max=140){const t=String(text||'').replace(/\s+/g,' ').trim();return t.length>max?t.slice(0,max-1)+'…':t;}
function nl2br(text){return esc(String(text||'')).replace(/\n/g,'<br>');}
function scheduleStateBadge(x){const st=String(x?.schedule_state||'NORMAL').toUpperCase();if(st==='CANCELLED')return '<span class="schedule-state-badge cancelled">Dibatalkan</span>';if(st==='CHANGED')return '<span class="schedule-state-badge changed">Diubah</span>';return '';}

async function openAttendance(attendanceId){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Absensi</div><h2>Memuat sesi…</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="search-loading"><span class="status-dot"></span>Memuat data anggota…</div>`);
  try{const data=await api('getAttendanceSessionDetail',{attendance_id:attendanceId});attendanceModalState={data,draft:{}};attendanceModalPage=1;(data.records||[]).forEach(r=>attendanceModalState.draft[String(r.user_id)]={attendance_status:r.attendance_status||'UNMARKED',note:r.note||''});drawAttendanceModal(data);}catch(err){showModal(`<div class="modal-head"><h2>Absensi</h2><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="alert danger">${esc(err.message)}</div>`);}
}
function drawAttendanceModal(data){
  const s=data.session||{}; const link=s.public_token?attendanceLink(s.public_token):'';
  const linkBlock=link?`<div class="attendance-link-box"><div><small>Link check-in</small><strong>${esc(link)}</strong></div><button type="button" id="modal-copy-attendance" class="btn btn-secondary small-btn">${svg('i-copy')} Salin</button></div>`:'';
  const records=data.records||[];
  const totalPages=Math.max(1,Math.ceil(records.length/ATTENDANCE_MEMBER_PAGE_SIZE));attendanceModalPage=Math.min(Math.max(1,attendanceModalPage),totalPages);
  const pageRecords=records.slice((attendanceModalPage-1)*ATTENDANCE_MEMBER_PAGE_SIZE,attendanceModalPage*ATTENDANCE_MEMBER_PAGE_SIZE);
  const body=data.can_manage?`<form id="attendance-record-form"><div class="attendance-record-list">${pageRecords.map(attendanceRecordRow).join('')}</div>${attendanceMemberPaginationHtml(attendanceModalPage,totalPages,records.length)}<div id="attendance-save-status" class="request-status"></div><button id="attendance-save-btn" class="btn btn-primary btn-block" type="submit">Simpan Absensi</button></form>`:`<div class="attendance-own-card"><span class="academic-type-icon attendance-icon"><span class="material-symbols-rounded">how_to_reg</span></span><div><span>Status Kehadiran</span><strong>${esc(data.records?.[0]?.attendance_status||'UNMARKED')}</strong><small>${esc(data.records?.[0]?.note||'Belum ada catatan.')}</small></div></div>`;
  showModal(`<div class="modal-head"><div><div class="eyebrow">Absensi • ${esc(shortDateTime(s.start_at))}</div><h2>${esc(s.title||'Sesi Absensi')}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>${linkBlock}${body}`);
  bindAttendanceModalPage(data);
  document.getElementById('modal-copy-attendance')?.addEventListener('click',()=>copyText(link));
}
function attendanceMemberPaginationHtml(page,totalPages,total){
  if(totalPages<=1)return `<div class="table-pagination compact"><span>${total} anggota</span></div>`;
  const pages=[];for(let i=Math.max(1,page-2);i<=Math.min(totalPages,page+2);i++)pages.push(`<button type="button" data-attendance-member-page="${i}" class="${i===page?'active':''}">${i}</button>`);
  return `<div class="table-pagination attendance-member-pagination"><span>${total} anggota • Halaman ${page}/${totalPages}</span><div><button type="button" data-attendance-member-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>‹</button>${pages.join('')}<button type="button" data-attendance-member-page="${Math.min(totalPages,page+1)}" ${page>=totalPages?'disabled':''}>›</button></div></div>`;
}
function bindAttendanceModalPage(data){
  if(data.can_manage){
    document.querySelectorAll('[data-att-user]').forEach(row=>{
      const id=String(row.dataset.attUser||'');const draft=attendanceModalState?.draft?.[id];
      const status=row.querySelector('[data-att-status]'),note=row.querySelector('[data-att-note]');
      if(draft&&status)status.value=draft.attendance_status||'UNMARKED';if(draft&&note)note.value=draft.note||'';
      status?.addEventListener('change',()=>{if(attendanceModalState?.draft?.[id])attendanceModalState.draft[id].attendance_status=status.value;});
      note?.addEventListener('input',()=>{if(attendanceModalState?.draft?.[id])attendanceModalState.draft[id].note=note.value;});
    });
    document.querySelectorAll('[data-attendance-member-page]').forEach(btn=>btn.onclick=()=>{attendanceModalPage=Number(btn.dataset.attendanceMemberPage)||1;drawAttendanceModal(data);});
    document.getElementById('attendance-record-form').onsubmit=e=>saveAttendance(e,data.session?.attendance_id);
  }
}
function attendanceRecordRow(r){return `<div class="attendance-record-row" data-att-user="${esc(r.user_id)}"><div class="member-avatar">${avatarMarkup(r)}</div><div class="member-info"><strong>${esc(r.full_name||r.username)}</strong><span>@${esc(r.username||'-')} · ${esc(r.kelasku_id||'-')}</span></div><select class="control compact-control" data-att-status><option value="UNMARKED">Belum</option><option value="PRESENT">Hadir</option><option value="SICK">Sakit</option><option value="PERMIT">Izin</option><option value="ABSENT">Alpa</option></select><input class="control compact-control" data-att-note placeholder="Catatan"></div>`;}
async function saveAttendance(event,attendanceId){event.preventDefault();const btn=document.getElementById('attendance-save-btn'),status=document.getElementById('attendance-save-status'),old=btn.innerHTML;if(btn.disabled)return;const original=attendanceModalState?.data?.records||[];const draft=attendanceModalState?.draft||{};const records=original.map(row=>({user_id:row.user_id,attendance_status:draft[String(row.user_id)]?.attendance_status||row.attendance_status||'UNMARKED',note:draft[String(row.user_id)]?.note||''}));btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';status.className='request-status progress';status.textContent=`Menyimpan ${records.length} anggota dalam satu request… Jangan klik dua kali.`;try{await api('saveAttendanceRecords',{attendance_id:attendanceId,records},{onSlow:()=>status.textContent='Masih menyimpan. Tombol tetap dikunci.'});toast('Absensi tersimpan.');attendanceModalState=null;closeModal();await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}}


async function loadClassAnalytics(background=false,force=false){
  const classId=String(state.selectedClassId||'');
  const cached=state.classAnalytics[classId];
  if(!force&&cached&&Date.now()-Number(state.classAnalyticsAt?.[classId]||0)<60000)return cached;
  if(classAnalyticsInFlight.has(classId))return classAnalyticsInFlight.get(classId);
  const request=(async()=>{
    try{
      const data=await api('getAttendanceAnalytics',{class_id:classId});
      const previous=state.classAnalytics[classId];
      const changed=!sameData(previous,data);
      state.classAnalytics[classId]=data;
      state.classAnalyticsAt[classId]=Date.now();
      if(String(state.selectedClassId)===classId&&(changed||!background)&&activeTab==='analytics')drawClassAnalytics(data);
      return data;
    }catch(err){
      if(!background&&!cached&&activeTab==='analytics'&&String(state.selectedClassId)===classId)document.getElementById('room-content').innerHTML=`<div class="panel error-panel"><strong>Analitik gagal dimuat.</strong><p>${esc(err.message)}</p></div>`;
      return cached||null;
    }finally{classAnalyticsInFlight.delete(classId);}
  })();
  classAnalyticsInFlight.set(classId,request);
  return request;
}
function drawClassAnalytics(data){
  const slot=document.getElementById('room-content');if(!slot)return;
  const own=data.own||{},ag=data.aggregate||{},members=data.members||[],ranking=data.task_ranking||[],activities=data.activities||[];
  const allRecords=data.activity_records||[];
  const filtered=analyticsFilter==='ALL'?allRecords:allRecords.filter(r=>String(r.attendance_id)===String(analyticsFilter));
  const totalPages=Math.max(1,Math.ceil(filtered.length/ANALYTICS_PAGE_SIZE));analyticsPage=Math.min(Math.max(1,analyticsPage),totalPages);
  const pageRows=filtered.slice((analyticsPage-1)*ANALYTICS_PAGE_SIZE,analyticsPage*ANALYTICS_PAGE_SIZE);
  const memberTotalPages=Math.max(1,Math.ceil(members.length/ANALYTICS_MEMBER_PAGE_SIZE));analyticsMemberPage=Math.min(Math.max(1,analyticsMemberPage),memberTotalPages);
  const memberPageRows=members.slice((analyticsMemberPage-1)*ANALYTICS_MEMBER_PAGE_SIZE,analyticsMemberPage*ANALYTICS_MEMBER_PAGE_SIZE);
  const rankingHtml=ranking.length?`<div class="class-task-ranking-grid">${ranking.slice(0,10).map(r=>`<article class="class-rank-row ${String(r.user_id)===String(state.user?.user_id)?'is-me':''}"><span class="class-rank-number">#${Number(r.rank||0)}</span><span class="member-avatar">${avatarMarkup(r)}</span><div class="class-rank-person"><strong>${esc(r.full_name||r.username||'-')}</strong><small>@${esc(r.username||'-')} · ${Number(r.reviewed_tasks||0)} tugas dinilai</small></div><div class="class-rank-score"><strong>${Number(r.average_score||0).toFixed(1)}</strong><span>/ 100</span></div></article>`).join('')}</div>`:`<div class="ranking-empty"><span class="material-symbols-rounded">leaderboard</span><div><strong>Belum ada peringkat tugas</strong><small>Peringkat muncul setelah tugas dinilai.</small></div></div>`;
  const activityRows=pageRows.length?pageRows.map((r,i)=>`<tr><td>${(analyticsPage-1)*ANALYTICS_PAGE_SIZE+i+1}</td>${data.can_manage?`<td><strong>${esc(r.full_name||r.username||'-')}</strong><small>@${esc(r.username||'-')}</small></td>`:''}<td><strong>${esc(r.activity_name||r.session_title||'Absensi')}</strong><small>${r.session_no?`Sesi ${String(r.session_no).padStart(2,'0')} · `:''}${esc(shortDateTime(r.start_at))}</small></td><td><span class="attendance-status-pill att-${String(r.attendance_status||'unmarked').toLowerCase()}">${esc(attendanceStatusLabel(r.attendance_status))}</span></td><td>${esc(r.note||'-')}</td></tr>`).join(''):`<tr><td colspan="${data.can_manage?5:4}" class="table-empty">Belum ada record pada filter ini.</td></tr>`;
  const memberRows=memberPageRows.map((m,i)=>`<tr><td>${(analyticsMemberPage-1)*ANALYTICS_MEMBER_PAGE_SIZE+i+1}</td><td><strong>${esc(m.full_name||m.username||'-')}</strong><small>@${esc(m.username||'-')}</small></td><td>${Number(m.PRESENT||0)}</td><td>${Number(m.SICK||0)}</td><td>${Number(m.PERMIT||0)}</td><td>${Number(m.ABSENT||0)}</td><td>${Number(m.UNMARKED||0)}</td><td>${Number(m.total||0)}</td><td><strong>${Number(m.attendance_rate||0)}%</strong></td></tr>`).join('');
  const activitySummary=buildActivitySummary(allRecords);
  const views=[['overview','monitoring','Ringkasan'],['members','groups','Anggota'],['activities','event_note','Kegiatan'],['detail','table_rows','Detail']].filter(v=>data.can_manage||v[0]!=='members');
  if(!views.some(v=>v[0]===analyticsView))analyticsView='overview';
  let body='';
  if(analyticsView==='overview')body=`<div class="analytics-own-card"><div class="academic-type-icon attendance-icon"><span class="material-symbols-rounded">how_to_reg</span></div><div><span>Ringkasan Saya</span><strong>${Number(own.PRESENT||0)} hadir · ${Number(own.SICK||0)} sakit · ${Number(own.PERMIT||0)} izin · ${Number(own.ABSENT||0)} alpa</strong><small>Belum ditandai: ${Number(own.UNMARKED||0)} · Total ${Number(own.total||0)} record</small></div></div><div class="section-title-row ranking-title-row"><div><h2>Peringkat Tugas</h2><p>Top 10 berdasarkan rata-rata nilai tugas yang sudah direview.</p></div><span class="soft-chip">${ranking.length} peserta bernilai</span></div>${rankingHtml}`;
  else if(analyticsView==='members')body=`<div class="section-title-row"><div><h2>Ringkasan Anggota</h2><p>${members.length} anggota · Hadir ${Number(ag.PRESENT||0)} · Sakit ${Number(ag.SICK||0)} · Izin ${Number(ag.PERMIT||0)} · Alpa ${Number(ag.ABSENT||0)}</p></div></div><div class="analytics-table-wrap"><table class="analytics-table analytics-member-table"><thead><tr><th>No.</th><th>Anggota</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Belum</th><th>Total</th><th>% Presensi</th></tr></thead><tbody>${memberRows||'<tr><td colspan="9" class="table-empty">Belum ada anggota.</td></tr>'}</tbody></table></div>${memberPaginationHtml(analyticsMemberPage,memberTotalPages,members.length)}`;
  else if(analyticsView==='activities')body=`<div class="section-title-row"><div><h2>Rekap Kegiatan / Mata Kuliah</h2><p>${activitySummary.length} kegiatan. Setiap kegiatan tetap memisahkan sesi/pertemuan pada file XLSX.</p></div></div>${activitySummaryHtml(activitySummary)}`;
  else body=`<div class="analytics-activity-toolbar"><div><strong>Detail Record Presensi</strong><small>${data.can_manage?'Seluruh anggota sesuai filter kegiatan/sesi.':'Akun member hanya melihat data sendiri.'}</small></div><select id="analytics-activity-filter" class="control compact-control"><option value="ALL">Semua kegiatan / sesi</option>${activities.map(a=>`<option value="${esc(a.attendance_id)}" ${analyticsFilter===String(a.attendance_id)?'selected':''}>${esc(a.activity_name||a.session_title||'Absensi')}${a.session_no?` • Sesi ${String(a.session_no).padStart(2,'0')}`:''} • ${esc(shortDate(a.start_at))}</option>`).join('')}</select></div><div class="analytics-table-wrap"><table class="analytics-table analytics-activity-table"><thead><tr><th>No.</th>${data.can_manage?'<th>Anggota</th>':''}<th>Kegiatan / Sesi</th><th>Status</th><th>Catatan</th></tr></thead><tbody>${activityRows}</tbody></table></div>${paginationHtml(analyticsPage,totalPages,filtered.length)}`;
  slot.innerHTML=`<section class="panel class-analytics-panel"><div class="panel-head"><div><div class="panel-title">Analitik Akademik</div><p class="panel-copy">Tampilan dipisah per bagian agar tidak ramai. Export menghasilkan workbook XLSX multi-sheet.</p></div><button type="button" id="export-attendance-xlsx" class="btn btn-secondary">${svg('i-download')} Export XLSX</button></div><div class="analytics-kpi-grid"><div><span>Sesi</span><strong>${Number(data.session_count||0)}</strong></div><div><span>Kehadiran Saya</span><strong>${Number(own.attendance_rate||0)}%</strong></div><div><span>Hadir</span><strong>${Number(own.PRESENT||0)}</strong></div><div><span>Alpa</span><strong>${Number(own.ABSENT||0)}</strong></div></div><nav class="analytics-view-tabs">${views.map(([key,icon,label])=>`<button type="button" class="analytics-view-tab ${analyticsView===key?'active':''}" data-analytics-view="${key}"><span class="material-symbols-rounded">${icon}</span><span>${label}</span></button>`).join('')}</nav><div class="analytics-view-body">${body}</div></section>`;
  document.querySelectorAll('[data-analytics-view]').forEach(btn=>btn.onclick=()=>{analyticsView=btn.dataset.analyticsView||'overview';drawClassAnalytics(data);});
  document.getElementById('analytics-activity-filter')?.addEventListener('change',e=>{analyticsFilter=e.target.value;analyticsPage=1;drawClassAnalytics(data);});
  document.querySelectorAll('[data-analytics-page]').forEach(btn=>btn.onclick=()=>{analyticsPage=Number(btn.dataset.analyticsPage)||1;drawClassAnalytics(data);});
  document.querySelectorAll('[data-analytics-member-page]').forEach(btn=>btn.onclick=()=>{analyticsMemberPage=Number(btn.dataset.analyticsMemberPage)||1;drawClassAnalytics(data);});
  document.getElementById('export-attendance-xlsx')?.addEventListener('click',()=>exportAttendanceXlsx(data));
}
function paginationHtml(page,totalPages,total){if(totalPages<=1)return `<div class="table-pagination compact"><span>${total} record</span></div>`;const pages=[];for(let i=Math.max(1,page-2);i<=Math.min(totalPages,page+2);i++)pages.push(`<button type="button" data-analytics-page="${i}" class="${i===page?'active':''}">${i}</button>`);return `<div class="table-pagination"><span>${total} record • Halaman ${page}/${totalPages}</span><div><button type="button" data-analytics-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>‹</button>${pages.join('')}<button type="button" data-analytics-page="${Math.min(totalPages,page+1)}" ${page>=totalPages?'disabled':''}>›</button></div></div>`;}
function memberPaginationHtml(page,totalPages,total){if(totalPages<=1)return `<div class="table-pagination compact"><span>${total} anggota</span></div>`;const pages=[];for(let i=Math.max(1,page-2);i<=Math.min(totalPages,page+2);i++)pages.push(`<button type="button" data-analytics-member-page="${i}" class="${i===page?'active':''}">${i}</button>`);return `<div class="table-pagination"><span>${total} anggota • Halaman ${page}/${totalPages}</span><div><button type="button" data-analytics-member-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>‹</button>${pages.join('')}<button type="button" data-analytics-member-page="${Math.min(totalPages,page+1)}" ${page>=totalPages?'disabled':''}>›</button></div></div>`;}
function buildActivitySummary(records){
  const groups={};
  (records||[]).forEach(r=>{const name=String(r.activity_name||r.session_title||'Kegiatan').trim()||'Kegiatan';const key=name.toLowerCase();if(!groups[key])groups[key]={name,sessionIds:new Set(),PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,total:0};const g=groups[key];g.sessionIds.add(String(r.attendance_id||''));const st=String(r.attendance_status||'UNMARKED').toUpperCase();g[st]=(g[st]||0)+1;g.total+=1;});
  return Object.values(groups).map(g=>{const denominator=g.PRESENT+g.SICK+g.PERMIT+g.ABSENT;return {...g,sessions:g.sessionIds.size,attendance_rate:denominator?Math.round((g.PRESENT/denominator)*1000)/10:0};}).sort((a,b)=>a.name.localeCompare(b.name));
}
function activitySummaryHtml(items){
  if(!items.length)return '<div class="search-empty">Belum ada data kegiatan.</div>';
  return `<div class="analytics-table-wrap"><table class="analytics-table analytics-summary-table"><thead><tr><th>Kegiatan / Mata Kuliah</th><th>Sesi</th><th>Record</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Belum</th><th>% Presensi</th></tr></thead><tbody>${items.map(x=>`<tr><td><strong>${esc(x.name)}</strong></td><td>${x.sessions}</td><td>${x.total}</td><td>${x.PRESENT}</td><td>${x.SICK}</td><td>${x.PERMIT}</td><td>${x.ABSENT}</td><td>${x.UNMARKED}</td><td><strong>${x.attendance_rate}%</strong></td></tr>`).join('')}</tbody></table></div>`;
}
function buildSessionSummary(records){
  const groups={};
  (records||[]).forEach(r=>{const key=String(r.attendance_id||'');if(!groups[key])groups[key]={attendance_id:key,name:r.activity_name||r.session_title||'Kegiatan',session_no:Number(r.session_no||0),start_at:r.start_at||'',PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,total:0};const g=groups[key];const st=String(r.attendance_status||'UNMARKED').toUpperCase();g[st]=(g[st]||0)+1;g.total+=1;});
  return Object.values(groups).map(g=>{const d=g.PRESENT+g.SICK+g.PERMIT+g.ABSENT;return {...g,attendance_rate:d?Math.round((g.PRESENT/d)*1000)/10:0};}).sort((a,b)=>dateMs(a.start_at)-dateMs(b.start_at));
}
function memberSummaryForRecords(records,members){
  const map={};(members||[]).forEach(m=>map[String(m.user_id)]={...m,PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,total:0});
  (records||[]).forEach(r=>{const id=String(r.user_id||'');if(!map[id])map[id]={user_id:id,full_name:r.full_name||'',username:r.username||'',kelasku_id:r.kelasku_id||'',PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,total:0};const st=String(r.attendance_status||'UNMARKED').toUpperCase();map[id][st]=(map[id][st]||0)+1;map[id].total+=1;});
  return Object.values(map).map(m=>{const d=m.PRESENT+m.SICK+m.PERMIT+m.ABSENT;return {...m,attendance_rate:d?Math.round((m.PRESENT/d)*1000)/10:0};}).sort((a,b)=>String(a.full_name||a.username||'').localeCompare(String(b.full_name||b.username||'')));
}
function analyticsSheetRows(title,records,members){
  const memberSummary=memberSummaryForRecords(records,members),sessions=buildSessionSummary(records);
  const rows=[[xlsxCell(title,2)],[''],[xlsxCell('REKAP ANGGOTA',1)],[xlsxCell('Nama',1),xlsxCell('Username',1),xlsxCell('KelasKu ID',1),xlsxCell('Hadir',1),xlsxCell('Sakit',1),xlsxCell('Izin',1),xlsxCell('Alpa',1),xlsxCell('Belum',1),xlsxCell('Total',1),xlsxCell('% Presensi',1)]];
  memberSummary.forEach(m=>rows.push([m.full_name||'',m.username||'',m.kelasku_id||'',m.PRESENT||0,m.SICK||0,m.PERMIT||0,m.ABSENT||0,m.UNMARKED||0,m.total||0,(m.attendance_rate||0)+'%']));
  rows.push([], [xlsxCell('REKAP PER SESI',1)], [xlsxCell('Sesi',1),xlsxCell('Tanggal',1),xlsxCell('Hadir',1),xlsxCell('Sakit',1),xlsxCell('Izin',1),xlsxCell('Alpa',1),xlsxCell('Belum',1),xlsxCell('Total',1),xlsxCell('% Presensi',1)]);
  sessions.forEach(s=>rows.push([s.session_no?`Sesi ${String(s.session_no).padStart(2,'0')}`:'Sesi',shortDateTime(s.start_at),s.PRESENT,s.SICK,s.PERMIT,s.ABSENT,s.UNMARKED,s.total,s.attendance_rate+'%']));
  rows.push([], [xlsxCell('DETAIL RECORD',1)], [xlsxCell('Nama',1),xlsxCell('Username',1),xlsxCell('Sesi',1),xlsxCell('Tanggal',1),xlsxCell('Status',1),xlsxCell('Catatan',1)]);
  records.forEach(r=>rows.push([r.full_name||'',r.username||'',r.session_no?`Sesi ${String(r.session_no).padStart(2,'0')}`:'',shortDateTime(r.start_at),attendanceStatusLabel(r.attendance_status),r.note||'']));
  return rows;
}
function exportAttendanceXlsx(data){
  const records=data.activity_records||[],own=data.own||{},scopeMembers=data.can_manage?(data.members||[]):[own].filter(Boolean),scope=data.can_manage?'Seluruh anggota':'Data saya saja';
  const allRows=[[xlsxCell('KELASKU — DETAIL PRESENSI',2)],['Scope',scope],['Jumlah Sesi',data.session_count||0],[],[xlsxCell('Nama',1),xlsxCell('Username',1),xlsxCell('KelasKu ID',1),xlsxCell('Kegiatan / Mata Kuliah',1),xlsxCell('Sesi',1),xlsxCell('Tanggal',1),xlsxCell('Status',1),xlsxCell('Catatan',1)]];
  records.forEach(r=>allRows.push([r.full_name||state.user?.full_name||'',r.username||state.user?.username||'',r.kelasku_id||state.user?.kelasku_id||'',r.activity_name||r.session_title||'',r.session_no?`Sesi ${String(r.session_no).padStart(2,'0')}`:'',shortDateTime(r.start_at),attendanceStatusLabel(r.attendance_status),r.note||'']));
  const analysis=[[xlsxCell('KELASKU — ANALISIS PRESENSI',2)],['Scope',scope],['Jumlah Sesi',data.session_count||0],[],[xlsxCell('RINGKASAN PER ANGGOTA',1)],[xlsxCell('Nama',1),xlsxCell('Username',1),xlsxCell('KelasKu ID',1),xlsxCell('Hadir',1),xlsxCell('Sakit',1),xlsxCell('Izin',1),xlsxCell('Alpa',1),xlsxCell('Belum',1),xlsxCell('Total',1),xlsxCell('% Presensi',1)]];
  memberSummaryForRecords(records,scopeMembers).forEach(m=>analysis.push([m.full_name||'',m.username||'',m.kelasku_id||'',m.PRESENT||0,m.SICK||0,m.PERMIT||0,m.ABSENT||0,m.UNMARKED||0,m.total||0,(m.attendance_rate||0)+'%']));
  analysis.push([], [xlsxCell('RINGKASAN PER KEGIATAN / MATA KULIAH',1)], [xlsxCell('Kegiatan / Mata Kuliah',1),xlsxCell('Jumlah Sesi',1),xlsxCell('Record',1),xlsxCell('Hadir',1),xlsxCell('Sakit',1),xlsxCell('Izin',1),xlsxCell('Alpa',1),xlsxCell('Belum',1),xlsxCell('% Presensi',1)]);
  const summaries=buildActivitySummary(records);summaries.forEach(g=>analysis.push([g.name,g.sessions,g.total,g.PRESENT,g.SICK,g.PERMIT,g.ABSENT,g.UNMARKED,g.attendance_rate+'%']));
  const sheets=[{name:data.can_manage?'ALL':'SAYA',rows:allRows},{name:'ANALISIS',rows:analysis}];
  summaries.forEach((summary,index)=>{const activityRecords=records.filter(r=>String(r.activity_name||r.session_title||'').trim().toLowerCase()===String(summary.name).trim().toLowerCase());sheets.push({name:`${String(index+1).padStart(2,'0')}-${summary.name}`,rows:analyticsSheetRows(summary.name,activityRecords,scopeMembers)});});
  downloadXlsx(`KelasKu-Analitik-${state.selectedClassId}.xlsx`,sheets);
}
function attendanceStatusLabel(status){return ({PRESENT:'Hadir',SICK:'Sakit',PERMIT:'Izin',ABSENT:'Alpa',UNMARKED:'Belum'})[String(status||'UNMARKED').toUpperCase()]||String(status||'-');}

async function openTaskReview(taskId){
  const cached=state.taskReviewCache[taskId];
  showModal(`<div class="modal-head"><div><div class="eyebrow">PHASE 6 • REVIEW TUGAS</div><h2>${cached?esc(cached.task?.title||'Review Tugas'):'Memuat pengumpulan…'}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div id="task-review-slot">${cached?taskReviewHtml(cached):'<div class="search-loading"><span class="status-dot"></span>Memuat submission anggota…</div>'}</div>`);
  if(cached)bindTaskReview(cached);
  try{const data=await api('getTaskSubmissions',{task_id:taskId});state.taskReviewCache[taskId]=data;const slot=document.getElementById('task-review-slot');if(slot){slot.innerHTML=taskReviewHtml(data);bindTaskReview(data);}}catch(err){const slot=document.getElementById('task-review-slot');if(slot)slot.innerHTML=`<div class="alert danger">${esc(err.message)}</div>`;}
}
function taskReviewHtml(data){const s=data.summary||{},task=data.task||{},items=data.items||[];return `<div class="review-summary-grid"><div><strong>${Number(s.submitted||0)}</strong><span>Dikumpulkan</span></div><div><strong>${Number(s.reviewed||0)}</strong><span>Dinilai</span></div><div><strong>${Number(s.needs_revision||0)}</strong><span>Revisi</span></div><div><strong>${Number(s.pending||0)}</strong><span>Menunggu</span></div></div><div class="review-toolbar"><small>Nilai maksimum ${Number(task.max_score||0)}</small><button type="button" class="btn btn-secondary small-btn" id="export-task-review">${svg('i-download')} Export CSV</button></div><div class="task-review-list">${items.map(item=>{const sub=item.submission;return `<article class="task-review-row"><span class="member-avatar">${avatarMarkup(item)}</span><div class="task-review-main"><strong>${esc(item.full_name||item.username)}</strong><small>@${esc(item.username||'-')} · ${esc(item.submission_status)}</small>${sub?.review_status?`<span class="review-status-pill review-${String(sub.review_status).toLowerCase()}">${esc(sub.review_status)}</span>`:''}</div><div class="task-review-score">${sub&&sub.score!==''?`<strong>${esc(String(sub.score))}/${Number(task.max_score||0)}</strong>`:'<span>—</span>'}</div>${sub?`<button type="button" class="btn btn-secondary small-btn" data-review-submission="${esc(sub.submission_id)}">Review</button>`:'<span class="soft-chip">Belum kirim</span>'}</article>`;}).join('')}</div>`;}
function bindTaskReview(data){document.querySelectorAll('[data-review-submission]').forEach(btn=>btn.onclick=()=>openSubmissionReview(data,btn.dataset.reviewSubmission));document.getElementById('export-task-review')?.addEventListener('click',()=>{const rows=[['Nama','Username','Status','Review','Nilai','Feedback','Submitted At']];(data.items||[]).forEach(i=>rows.push([i.full_name||'',i.username||'',i.submission_status||'',i.submission?.review_status||'',i.submission?.score??'',i.submission?.feedback||'',i.submission?.submitted_at||'']));downloadCsv(`kelasku-tugas-${data.task?.task_id||'review'}.csv`,rows);});}
function openSubmissionReview(data,submissionId){const item=(data.items||[]).find(x=>String(x.submission?.submission_id)===String(submissionId));if(!item)return;const sub=item.submission||{},max=Number(data.task?.max_score||0);showModal(`<div class="modal-head"><div><div class="eyebrow">REVIEW • ${esc(item.full_name||item.username)}</div><h2>${esc(data.task?.title||'Tugas')}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="submission-preview"><div><span>Status</span><strong>${esc(sub.status||'-')}</strong></div>${sub.submission_text?`<p>${esc(sub.submission_text)}</p>`:''}${sub.submission_image_url?`<button type="button" class="review-submission-image" id="review-open-image"><img src="${esc(sub.submission_image_url)}" alt="Lampiran tugas"><span>${svg('i-eye')} Buka gambar</span></button>`:''}${sub.submission_url?`<button type="button" class="btn btn-secondary small-btn" id="review-open-link">${svg('i-link')} Buka Link</button>`:''}</div><form id="submission-review-form"><div class="form-grid"><div class="field"><label>Nilai (0–${max})</label><input name="score" type="number" min="0" max="${max}" step="0.1" class="control" value="${sub.score!==''&&sub.score!==undefined?esc(String(sub.score)):''}"></div><div class="field"><label>Status Review</label><select name="review_status" class="control"><option value="REVIEWED" ${sub.review_status==='REVIEWED'?'selected':''}>Selesai Dinilai</option><option value="NEEDS_REVISION" ${sub.review_status==='NEEDS_REVISION'?'selected':''}>Perlu Revisi</option></select></div></div><div class="field"><label>Feedback</label><textarea name="feedback" rows="4" class="control" placeholder="Catatan untuk mahasiswa…">${esc(sub.feedback||'')}</textarea></div><div id="submission-review-status" class="request-status"></div><button id="submission-review-submit" class="btn btn-primary btn-block" type="submit">Simpan Review</button></form>`);document.getElementById('review-open-link')?.addEventListener('click',()=>openExternal(sub.submission_url));document.getElementById('review-open-image')?.addEventListener('click',()=>openExternal(sub.submission_image_url));document.getElementById('submission-review-form').onsubmit=e=>saveSubmissionReview(e,data,submissionId);}
async function saveSubmissionReview(event,data,submissionId){event.preventDefault();const form=event.currentTarget,btn=document.getElementById('submission-review-submit'),status=document.getElementById('submission-review-status'),old=btn.innerHTML;if(btn.disabled)return;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';status.className='request-status progress';status.textContent='Menyimpan nilai & feedback…';try{await api('reviewTaskSubmission',{submission_id:submissionId,score:form.score.value,feedback:form.feedback.value,review_status:form.review_status.value});delete state.taskReviewCache[data.task.task_id];toast('Review tugas tersimpan.');closeModal();openTaskReview(data.task.task_id);loadClassAcademic(true);}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}}
function downloadCsv(filename,rows){const csv='\uFEFF'+rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function membersHtml(data) {
  const p=data.permissions||{}; const items=data.members||[]; const leader=items.find(m=>m.is_class_leader)||null; const candidates=items;
  const leaderCard=`<div class="class-leader-card"><div class="class-leader-icon">${svg('i-shield')}</div><div class="class-leader-copy"><span>KETUA KELAS</span><strong>${leader?esc(leader.full_name||leader.username):'Belum ditetapkan'}</strong><small>${leader?`@${esc(leader.username||'-')} · ${esc(roleLabel(leader.class_role))}`:'Owner dapat menunjuk dirinya sendiri atau anggota aktif sebagai Ketua Kelas.'}</small></div>${p.is_owner?`<div class="class-leader-control"><select id="class-leader-select" class="control"><option value="">Pilih anggota…</option>${candidates.map(m=>`<option value="${esc(m.user_id)}" ${leader&&String(leader.user_id)===String(m.user_id)?'selected':''}>${esc(m.full_name||m.username)} · ${esc(roleLabel(m.class_role))}</option>`).join('')}</select><button type="button" id="save-class-leader" class="btn btn-primary">Tetapkan</button></div>`:''}</div>`;
  return `<section class="panel members-room-panel"><div class="panel-head"><div><div class="panel-title">Anggota & Ketua Kelas</div><p class="panel-copy">Kelola anggota dan jabatan Ketua Kelas. Perubahan role teknis hanya dapat dilakukan Owner melalui Pengaturan Kelas.</p></div><span class="soft-chip">${items.length} anggota</span></div>${leaderCard}<div class="member-list member-list-v51">${items.length?items.map(m=>memberRow(m,p)).join(''):'<div class="search-empty">Belum ada anggota.</div>'}</div></section>`;
}

function electionsHtml(data){
  const p=data.permissions||{}; const polls=data.leader_elections||[];
  const active=polls.find(x=>x.status==='ACTIVE')||null;
  const history=polls.filter(x=>x.status!=='ACTIVE');
  const createButton=p.is_owner&&!active?`<button type="button" id="create-leader-election" class="btn btn-secondary">${svg('i-vote')} Buat Pemilihan</button>`:'';
  return `<section class="panel election-room-panel"><div class="panel-head election-room-head"><div><div class="eyebrow">KEPEMIMPINAN KELAS</div><div class="panel-title">Pemilihan Ketua Kelas</div><p class="panel-copy">Owner menentukan kandidat. Anggota hanya memilih dari kandidat yang ditetapkan, sehingga kelas besar tetap rapi.</p></div>${createButton}</div>${active?activeElectionHtml(active,p):`<div class="election-idle"><span class="election-idle-icon">${svg('i-vote')}</span><div><strong>Tidak ada pemilihan aktif</strong><p>Riwayat hasil tetap tersimpan di bawah. Buat pemilihan baru saat dibutuhkan.</p></div></div>`}<div class="election-history-head"><div><strong>Riwayat Pemilihan</strong><small>${history.length} riwayat terbaru</small></div></div><div class="election-history-list">${history.length?history.map(historyElectionCard).join(''):'<div class="search-empty compact-empty">Belum ada riwayat pemilihan.</div>'}</div></section>`;
}

function activeElectionHtml(poll,p){
  const candidateRows=(poll.candidates||[]).map(c=>`<label class="poll-candidate ${String(poll.my_vote)===String(c.user_id)?'selected':''}"><input type="radio" name="leader-vote" value="${esc(c.user_id)}" ${String(poll.my_vote)===String(c.user_id)?'checked':''} ${poll.can_vote?'':'disabled'}><span class="member-avatar">${avatarMarkup(c)}</span><span><strong>${esc(c.full_name||c.username)}</strong><small>${memberRoleText(c)}${c.votes!==null&&c.votes!==undefined?` · ${c.votes} suara`:''}</small></span></label>`).join('');
  return `<div class="leader-poll-card active-poll-card"><div class="leader-poll-title"><div><span class="eyebrow">SEDANG BERLANGSUNG</span><strong>${esc(poll.title)}</strong><p>${esc(poll.description||'')}</p></div><span class="phase-badge poll-${String(poll.status).toLowerCase()}">${esc(pollStatusLabel(poll.status))}</span></div><div class="poll-time">${esc(shortDateTime(poll.start_at))} → ${esc(shortDateTime(poll.end_at))} · ${poll.total_votes||0} suara · ${(poll.candidates||[]).length} kandidat</div><div class="poll-candidates">${candidateRows}</div><div class="page-actions election-actions">${poll.can_vote?`<button type="button" id="submit-leader-vote" class="btn btn-primary">${svg('i-vote')} Simpan Suara</button>`:''}${p.is_owner&&poll.status==='ACTIVE'?'<button type="button" id="close-leader-election" class="btn btn-secondary">Tutup Pemilihan</button>':''}</div></div>`;
}

function historyElectionCard(poll){
  const winner=(poll.candidates||[]).find(c=>String(c.user_id)===String(poll.winner_user_id));
  const ranked=[...(poll.candidates||[])].sort((a,b)=>Number(b.votes||0)-Number(a.votes||0));
  return `<article class="election-history-card"><div class="election-history-top"><div><strong>${esc(poll.title||'Pemilihan Ketua Kelas')}</strong><small>${esc(shortDateTime(poll.start_at))}</small></div><span class="phase-badge poll-${String(poll.status).toLowerCase()}">${esc(pollStatusLabel(poll.status))}</span></div><div class="election-result-main"><span class="election-result-icon">${svg('i-vote')}</span><div><small>${winner?'Pemenang':'Hasil'}</small><strong>${winner?esc(winner.full_name||winner.username):(String(poll.status)==='TIED'?'Seri':'Tidak ada pemenang')}</strong><span>${poll.total_votes||0} suara · ${(poll.candidates||[]).length} kandidat</span></div></div>${ranked.length?`<div class="election-result-strip">${ranked.slice(0,5).map(c=>`<span class="result-chip ${winner&&String(winner.user_id)===String(c.user_id)?'winner':''}">${esc(c.full_name||c.username)} <b>${Number(c.votes||0)}</b></span>`).join('')}</div>`:''}</article>`;
}

function memberRoleText(m){
  const base=String(m.class_role||'MEMBER').toUpperCase();
  if(base==='OWNER')return 'Owner'+(m.is_class_leader?' · Ketua Kelas':'');
  if(base==='MODERATOR')return 'Member · Moderator'+(m.is_class_leader?' · Ketua Kelas':'');
  if(base==='COORDINATOR')return 'Member · Koordinator'+(m.is_class_leader?' · Ketua Kelas':'');
  return 'Member'+(m.is_class_leader?' · Ketua Kelas':'');
}
function memberBadgesHtml(m){
  const role=String(m.class_role||'MEMBER').toUpperCase();
  const badges=[];
  if(role==='OWNER') badges.push('<span class="role-pill role-owner">Owner</span>');
  else {
    badges.push('<span class="role-pill role-member">Member</span>');
    if(role==='MODERATOR')badges.push('<span class="role-pill role-moderator">Moderator</span>');
    if(role==='COORDINATOR')badges.push('<span class="role-pill role-coordinator">Koordinator</span>');
  }
  if(m.is_class_leader)badges.push('<span class="role-pill leader-role-pill">Ketua Kelas</span>');
  return badges.join('');
}
function memberRow(m,p) {
  const canRemove=p.can_manage_members && m.class_role!=='OWNER';
  return `<div class="member-row member-row-v51"><div class="member-avatar">${avatarMarkup(m)}</div><div class="member-info"><strong>${esc(m.full_name||m.username)}</strong><span>@${esc(m.username||'-')} · ${esc(m.kelasku_id||'-')}</span><small>${esc(m.study_program||'')} ${m.cohort?'· '+esc(m.cohort):''}</small></div><div class="member-side"><div class="member-badges">${memberBadgesHtml(m)}</div><div class="member-actions">${canRemove?`<button class="icon-btn mini danger-btn" data-remove-user="${esc(m.user_id)}" title="Keluarkan anggota">${svg('i-close')}</button>`:''}</div></div></div>`;
}

function requestsHtml(data) {
  const items=data.pending_requests||[];
  return `<section class="panel"><div class="panel-head"><div><div class="panel-title">Permintaan Bergabung</div><p class="panel-copy">Setiap tindakan dikunci selama request berjalan agar tidak terkirim dua kali.</p></div></div><div class="member-list">${items.length?items.map(r=>`<div class="member-row join-request-row" data-request-row="${esc(r.request_id)}"><div class="member-avatar">${avatarMarkup(r)}</div><div class="member-info"><strong>${esc(r.full_name||r.username)}</strong><span>@${esc(r.username||'-')} · ${esc(r.kelasku_id||'-')}</span><small>${esc(r.message||'Tanpa pesan')}</small><span class="inline-request-status" data-request-status></span></div><div class="member-actions"><button class="btn btn-secondary small-btn" data-request="${esc(r.request_id)}" data-decision="REJECT">Tolak</button><button class="btn btn-primary small-btn" data-request="${esc(r.request_id)}" data-decision="APPROVE">Terima</button></div></div>`).join(''):'<div class="search-empty">Tidak ada permintaan yang menunggu.</div>'}</div></section>`;
}

function settingsHtml(data) {
  const c=data.class||{},s=data.settings||{},p=data.permissions||{},links=data.class_links||[],publicUrl=publicClassLinksUrl(c.class_code||'');
  const roleRows=p.is_owner?(data.members||[]).filter(m=>String(m.class_role)!=='OWNER').map(m=>`<div class="class-role-setting-row"><div class="member-avatar">${avatarMarkup(m)}</div><div><strong>${esc(m.full_name||m.username)}</strong><small>@${esc(m.username||'-')} · ${m.is_class_leader?'Ketua Kelas · ':''}${esc(roleLabel(m.class_role||'MEMBER'))}</small></div><select class="control compact-control" data-role-user="${esc(m.user_id)}"><option value="MEMBER" ${m.class_role==='MEMBER'?'selected':''}>Member</option><option value="MODERATOR" ${m.class_role==='MODERATOR'?'selected':''}>Moderator</option><option value="COORDINATOR" ${m.class_role==='COORDINATOR'?'selected':''}>Koordinator</option></select></div>`).join(''):'';
  return `<form id="class-settings-form" class="class-settings-console"><div class="class-settings-tabs" role="tablist"><button type="button" class="active" data-class-setting-tab="identity">Identitas</button><button type="button" data-class-setting-tab="access">Akses</button>${p.is_owner?'<button type="button" data-class-setting-tab="roles">Role</button>':''}<button type="button" data-class-setting-tab="links">Link Kelas</button></div>
    <section class="panel class-setting-pane active" data-class-setting-pane="identity"><div class="settings-compact-head"><div><h2>Identitas Kelas</h2><p>Informasi utama kelas.</p></div>${svg('i-class')}</div><div class="field"><label>Nama Kelas</label><input class="control" name="name" value="${esc(c.name||'')}"></div><div class="field"><label>Deskripsi</label><textarea class="control" rows="3" name="description">${esc(c.description||'')}</textarea></div><div class="form-grid"><div class="field"><label>Institusi</label><input class="control" name="institution" value="${esc(c.institution||'')}"></div><div class="field"><label>Program Studi</label><input class="control" name="study_program" value="${esc(c.study_program||'')}"></div><div class="field"><label>Angkatan</label><input class="control" name="cohort" value="${esc(c.cohort||'')}"></div><div class="field"><label>Semester</label><input class="control" name="semester" value="${esc(c.semester||'')}"></div></div><button type="button" id="save-class-profile" class="btn btn-primary">Simpan Identitas</button></section>
    <section class="panel class-setting-pane" data-class-setting-pane="access"><div class="settings-compact-head"><div><h2>Akses & Permission</h2><p>Join, visibility, dan hak default member.</p></div>${svg('i-shield')}</div><div class="settings-compact-grid"><div>${selectRow('Visibilitas','visibility',c.visibility,[['PUBLIC','Public'],['DISCOVERABLE','Discoverable'],['PRIVATE','Private']])}${toggleRow('Perlu persetujuan','join_approval',s.join_approval)}${toggleRow('Join Code aktif','join_code_enabled',s.join_code_enabled)}${toggleRow('Daftar anggota terlihat','member_list_visible',s.member_list_visible)}</div><div>${toggleRow('Boleh posting diskusi','allow_member_posts',s.allow_member_posts)}${toggleRow('Boleh upload file','allow_member_uploads',s.allow_member_uploads)}${toggleRow('Boleh invite orang','allow_member_invites',s.allow_member_invites)}</div></div><div class="page-actions">${p.can_regenerate_join_code?'<button type="button" id="regen-code" class="btn btn-secondary">Generate Ulang Join Code</button>':''}<button id="save-class-settings" type="submit" class="btn btn-primary">Simpan Pengaturan</button></div><div id="class-settings-status" class="request-status"></div></section>
    ${p.is_owner?`<section class="panel class-setting-pane" data-class-setting-pane="roles"><div class="settings-compact-head"><div><h2>Role Kelas</h2><p>Hanya Owner yang dapat mengubah role teknis. Jabatan Ketua Kelas tetap terpisah.</p></div>${svg('i-users')}</div><div class="class-role-settings-list">${roleRows||'<div class="search-empty">Belum ada anggota yang dapat diatur.</div>'}</div></section>`:''}
    <section class="panel class-setting-pane class-links-settings" data-class-setting-pane="links"><div class="settings-compact-head"><div><h2>Link Grup & Link Penting</h2><p>Satu landing page untuk kebutuhan kelas.</p></div>${svg('i-link')}</div><label class="setting-row public-links-toggle"><span><strong>Landing page publik</strong><small>Guest hanya melihat link PUBLIC; anggota login dapat melihat link internal.</small></span><span class="switch"><input type="checkbox" id="public-links-enabled" ${truthy(s.public_links_enabled)?'checked':''}><span></span></span></label><div class="class-public-url ${truthy(s.public_links_enabled)?'':'is-disabled'}"><div><span>LINK PUBLIK KELAS</span><strong>${esc(publicUrl)}</strong></div><button type="button" id="copy-public-links" class="icon-btn" title="Salin link publik">${svg('i-copy')}</button><a href="${esc(publicUrl)}" target="_blank" rel="noopener noreferrer" class="icon-btn" title="Preview"><span class="material-symbols-rounded">open_in_new</span></a></div><div id="class-links-editor" class="class-links-editor">${links.length?links.map((item,index)=>classLinkRow(item,index)).join(''):classLinkRow({},0)}</div><div class="class-links-actions"><button type="button" id="add-class-link" class="btn btn-secondary">${svg('i-plus')} Tambah Link</button><button type="button" id="save-class-links" class="btn btn-primary">Simpan Link</button></div><div id="class-links-status" class="request-status"></div></section>
  </form>`;
}

function bindTab(tab,data) {
  if(tab==='overview'){
    document.querySelectorAll('[data-module-tab]').forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.moduleTab,data));
    document.getElementById('quick-settings')?.addEventListener('click',()=>switchTab('settings',data));
    document.getElementById('quick-members')?.addEventListener('click',()=>switchTab('members',data));
  }
  if(tab==='tasks') document.querySelectorAll('[data-review-task]').forEach(btn=>btn.onclick=()=>openTaskReview(btn.dataset.reviewTask));
  if(tab==='members'){
    document.querySelectorAll('[data-remove-user]').forEach(btn=>btn.onclick=()=>removeMember(btn.dataset.removeUser,btn));
    document.getElementById('save-class-leader')?.addEventListener('click',setClassLeader);
  }
  if(tab==='elections'){
    document.getElementById('create-leader-election')?.addEventListener('click',openCreateLeaderElection);
    document.getElementById('submit-leader-vote')?.addEventListener('click',submitLeaderVote);
    document.getElementById('close-leader-election')?.addEventListener('click',closeLeaderElection);
  }
  if(tab==='requests') document.querySelectorAll('[data-request]').forEach(btn=>btn.onclick=()=>decideRequest(btn.dataset.request,btn.dataset.decision,btn));
  if(tab==='settings'){
    document.getElementById('class-settings-form').onsubmit=e=>saveClassSettings(e,data);
    document.getElementById('save-class-profile').onclick=()=>saveClassProfile(data);
    document.getElementById('regen-code')?.addEventListener('click',regenerateJoinCode);
    document.querySelectorAll('[data-class-setting-tab]').forEach(btn=>btn.onclick=()=>activateClassSettingPane(btn.dataset.classSettingTab));
    document.querySelectorAll('[data-role-user]').forEach(sel=>sel.onchange=()=>changeRole(sel.dataset.roleUser,sel.value,sel));
    bindClassLinksSettings(data);
  }
}

function activateClassSettingPane(key){document.querySelectorAll('[data-class-setting-tab]').forEach(b=>b.classList.toggle('active',b.dataset.classSettingTab===key));document.querySelectorAll('[data-class-setting-pane]').forEach(p=>p.classList.toggle('active',p.dataset.classSettingPane===key));}

async function decideRequest(requestId,decision,button){
  const row=button.closest('[data-request-row]');
  const buttons=[...(row?.querySelectorAll('[data-request]')||[])];
  const status=row?.querySelector('[data-request-status]');
  const old=button.innerHTML;
  if(button.disabled || row?.dataset.busy==='1') return;
  if(row) row.dataset.busy='1';
  buttons.forEach(x=>x.disabled=true);
  button.innerHTML=`<span class="btn-spinner"></span><span>${decision==='APPROVE'?'Menerima…':'Menolak…'}</span>`;
  if(status){status.className='inline-request-status progress';status.textContent='Sedang memproses… jangan klik dua kali.';}
  try{
    await api('decideJoinRequest',{request_id:requestId,decision},{onSlow:()=>{if(status)status.textContent='Masih diproses oleh server. Tombol tetap dikunci.';}});
    if(status){status.className='inline-request-status ok';status.textContent=decision==='APPROVE'?'Diterima ✓':'Ditolak ✓';}
    toast(decision==='APPROVE'?'Anggota diterima.':'Permintaan ditolak.');

    // Setelah write sukses, jangan tunggu GET kedua hanya untuk membuat UI terasa selesai.
    if(currentClassData){
      currentClassData.pending_requests=(currentClassData.pending_requests||[]).filter(x=>String(x.request_id)!==String(requestId));
      state.classDetails[state.selectedClassId]=currentClassData;
    }
    if(row){row.classList.add('is-resolved');setTimeout(()=>row.remove(),180);}
    const manageBadge=document.querySelector('[data-room-main="manage"] b');
    const pendingCount=(currentClassData?.pending_requests||[]).length;
    if(manageBadge)manageBadge.textContent=String(pendingCount);
    if(currentClassData)refreshRoomNavigation(activeTab,currentClassData);
    loadClassDetail(true);
  }catch(err){
    if(row) row.dataset.busy='0';
    if(status){status.className='inline-request-status error';status.textContent=err.message;}
    toast(err.message);buttons.forEach(x=>x.disabled=false);button.innerHTML=old;
  }
}

async function changeRole(userId,role,select){
  if(select.disabled)return;
  const member=(currentClassData?.members||[]).find(x=>String(x.user_id)===String(userId));
  const previous=member?.class_role||'MEMBER';
  select.disabled=true;
  select.dataset.busy='1';
  try{
    await api('setClassMemberRole',{class_id:state.selectedClassId,user_id:userId,class_role:role,replace_coordinator:false},{onSlow:()=>toast('Perubahan role masih diproses. Kontrol tetap dikunci.')});
    if(member)member.class_role=role;
    if(currentClassData)state.classDetails[state.selectedClassId]=currentClassData;
    toast('Role anggota diperbarui.');
    loadClassDetail(true);
  }catch(err){
    toast(err.message);
    select.value=previous;
  }finally{
    select.disabled=false;
    delete select.dataset.busy;
  }
}

async function setClassLeader(){
  const select=document.getElementById('class-leader-select');
  const btn=document.getElementById('save-class-leader');
  const userId=select?.value||'';
  if(!userId)return toast('Pilih anggota yang akan menjadi Ketua Kelas.');
  if(!btn||btn.disabled)return;
  const old=btn.innerHTML;
  btn.disabled=true;select.disabled=true;
  btn.innerHTML='<span class="btn-spinner"></span><span>Menetapkan…</span>';
  try{
    await api('setClassLeader',{class_id:state.selectedClassId,user_id:userId},{onSlow:()=>toast('Penetapan masih diproses. Tombol tetap dikunci.')});
    if(currentClassData){
      (currentClassData.members||[]).forEach(m=>{m.is_class_leader=String(m.user_id)===String(userId);});
      currentClassData.permissions=currentClassData.permissions||{};
      currentClassData.permissions.is_class_leader=String(state.user?.user_id)===String(userId);
      state.classDetails[state.selectedClassId]=currentClassData;
      if(activeTab==='members'){document.getElementById('room-content').innerHTML=membersHtml(currentClassData);bindTab('members',currentClassData);}
    }
    toast('Ketua Kelas berhasil ditetapkan.');
    loadClassDetail(true);
  }catch(err){toast(err.message);}
  finally{if(document.body.contains(btn)){btn.disabled=false;select.disabled=false;btn.innerHTML=old;}}
}

function openCreateLeaderElection(){
  const end=new Date(Date.now()+3*24*3600000);
  const items=currentClassData?.members||[];
  const candidateCards=items.map(m=>`<label class="candidate-picker-row" data-candidate-name="${esc(String(m.full_name||m.username||'').toLowerCase())}"><input type="checkbox" name="candidate_user_ids" value="${esc(m.user_id)}"><span class="member-avatar">${avatarMarkup(m)}</span><span><strong>${esc(m.full_name||m.username)}</strong><small>${esc(memberRoleText(m))} · @${esc(m.username||'-')}</small></span><span class="material-symbols-rounded candidate-check-icon">check_circle</span></label>`).join('');
  showModal(`<div class="modal-head"><div><div class="eyebrow">POLLING KELAS</div><h2>Pemilihan Ketua Kelas</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="leader-election-form"><div class="field"><label>Judul</label><input name="title" class="control" value="Pemilihan Ketua Kelas" required></div><div class="field"><label>Deskripsi</label><textarea name="description" class="control" rows="2">Pilih satu kandidat Ketua Kelas.</textarea></div><div class="candidate-picker"><div class="candidate-picker-head"><div><strong>Pilih Kandidat</strong><small>Minimal 2 kandidat. Tidak semua anggota otomatis menjadi kandidat.</small></div><span id="candidate-count" class="soft-chip">0 dipilih</span></div><label class="candidate-search"><span class="material-symbols-rounded">search</span><input id="candidate-search-input" type="search" placeholder="Cari nama anggota…"></label><div class="candidate-picker-list" id="candidate-picker-list">${candidateCards}</div></div><div class="field"><label>Berakhir</label><input name="end_at" type="datetime-local" class="control" value="${esc(toLocalInput(end))}" required></div><label class="setting-card"><span class="setting-card-copy"><strong>Auto tetapkan pemenang</strong><small>Jika tidak seri, pemenang otomatis menjadi Ketua Kelas saat polling selesai.</small></span><span class="switch"><input name="auto_apply" type="checkbox" checked><span></span></span></label><div id="leader-election-status" class="request-status"></div><button id="leader-election-submit" class="btn btn-primary btn-block" type="submit">Buka Pemilihan</button></form>`);
  const list=document.getElementById('candidate-picker-list');
  const search=document.getElementById('candidate-search-input');
  const updateCount=()=>{const n=list?.querySelectorAll('input[name="candidate_user_ids"]:checked').length||0;const out=document.getElementById('candidate-count');if(out)out.textContent=`${n} dipilih`;};
  list?.querySelectorAll('input[name="candidate_user_ids"]').forEach(x=>x.addEventListener('change',updateCount));
  search?.addEventListener('input',()=>{const q=String(search.value||'').trim().toLowerCase();list?.querySelectorAll('[data-candidate-name]').forEach(row=>row.hidden=Boolean(q)&&!String(row.dataset.candidateName||'').includes(q));});
  document.getElementById('leader-election-form').onsubmit=createLeaderElection;
}
async function createLeaderElection(e){
  e.preventDefault();
  const f=e.currentTarget,b=document.getElementById('leader-election-submit'),status=document.getElementById('leader-election-status'),old=b.innerHTML;
  const candidateIds=[...f.querySelectorAll('input[name="candidate_user_ids"]:checked')].map(x=>x.value);
  if(candidateIds.length<2){status.className='request-status error';status.textContent='Pilih minimal 2 kandidat Ketua Kelas.';return;}
  if(b.disabled)return;
  b.disabled=true;b.innerHTML='<span class="btn-spinner"></span><span>Membuka…</span>';status.className='request-status progress';status.textContent='Membuat pemilihan dan menyimpan kandidat…';
  try{
    const result=await api('createLeaderElection',{class_id:state.selectedClassId,title:f.title.value,description:f.description.value,end_at:new Date(f.end_at.value).toISOString(),auto_apply:f.auto_apply.checked,candidate_user_ids:candidateIds},{onSlow:()=>status.textContent='Masih diproses. Tombol tetap dikunci.'});
    closeModal();
    if(currentClassData&&result?.poll){currentClassData.leader_elections=[result.poll,...(currentClassData.leader_elections||[])];state.classDetails[state.selectedClassId]=currentClassData;if(activeTab==='elections'){document.getElementById('room-content').innerHTML=electionsHtml(currentClassData);bindTab('elections',currentClassData);}}
    toast('Pemilihan Ketua Kelas dibuka.');
    loadClassDetail(true);
  }catch(err){status.className='request-status error';status.textContent=err.message;}
  finally{if(document.body.contains(b)){b.disabled=false;b.innerHTML=old;}}
}

async function submitLeaderVote(){
  const selected=document.querySelector('input[name="leader-vote"]:checked');
  if(!selected)return toast('Pilih kandidat terlebih dahulu.');
  const poll=(currentClassData?.leader_elections||[]).find(x=>x.status==='ACTIVE');
  if(!poll)return toast('Polling aktif tidak ditemukan.');
  const btn=document.getElementById('submit-leader-vote');
  if(!btn||btn.disabled)return;
  const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Mengirim…</span>';
  try{
    const result=await api('voteLeaderElection',{poll_id:poll.poll_id,candidate_user_id:selected.value},{onSlow:()=>toast('Suara masih disimpan. Tombol tetap dikunci.')});
    if(currentClassData&&result?.poll){const i=currentClassData.leader_elections.findIndex(x=>String(x.poll_id)===String(result.poll.poll_id));if(i>=0)currentClassData.leader_elections[i]=result.poll;state.classDetails[state.selectedClassId]=currentClassData;if(activeTab==='elections'){document.getElementById('room-content').innerHTML=electionsHtml(currentClassData);bindTab('elections',currentClassData);}}
    toast('Suara kamu tersimpan.');
    loadClassDetail(true);
  }catch(err){toast(err.message);}
  finally{if(document.body.contains(btn)){btn.disabled=false;btn.innerHTML=old;}}
}

async function closeLeaderElection(){
  const poll=(currentClassData?.leader_elections||[]).find(x=>x.status==='ACTIVE');
  if(!poll)return;
  const ok=await confirmDialog({title:'Tutup polling sekarang?',message:'Polling akan dihitung. Jika Auto Tetapkan aktif dan tidak seri, pemenang langsung menjadi Ketua Kelas.',confirmLabel:'Tutup Polling'});
  if(!ok)return;
  const btn=document.getElementById('close-leader-election');
  if(!btn||btn.disabled)return;
  const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menutup…</span>';
  try{
    const result=await api('closeLeaderElection',{poll_id:poll.poll_id},{onSlow:()=>toast('Polling masih dihitung. Tombol tetap dikunci.')});
    if(currentClassData&&result?.poll){const i=currentClassData.leader_elections.findIndex(x=>String(x.poll_id)===String(result.poll.poll_id));if(i>=0)currentClassData.leader_elections[i]=result.poll;state.classDetails[state.selectedClassId]=currentClassData;if(activeTab==='elections'){document.getElementById('room-content').innerHTML=electionsHtml(currentClassData);bindTab('elections',currentClassData);}}
    toast('Polling ditutup.');
    loadClassDetail(true);
  }catch(err){toast(err.message);}
  finally{if(document.body.contains(btn)){btn.disabled=false;btn.innerHTML=old;}}
}

async function removeMember(userId,button){
  const ok=await confirmDialog({title:'Keluarkan anggota?',message:'Anggota akan kehilangan akses ke kelas ini. Data akademik historis tetap tersimpan.',confirmLabel:'Keluarkan',danger:true});
  if(!ok||button.disabled)return;
  const old=button.innerHTML;button.disabled=true;button.innerHTML='<span class="btn-spinner"></span>';
  try{
    await api('removeClassMember',{class_id:state.selectedClassId,user_id:userId},{onSlow:()=>toast('Penghapusan anggota masih diproses. Tombol tetap dikunci.')});
    toast('Anggota dikeluarkan.');
    if(currentClassData){
      currentClassData.members=(currentClassData.members||[]).filter(x=>String(x.user_id)!==String(userId));
      state.classDetails[state.selectedClassId]=currentClassData;
      if(activeTab==='members'){document.getElementById('room-content').innerHTML=membersHtml(currentClassData);bindTab('members',currentClassData);}
    }
    loadClassDetail(true);
  }catch(err){toast(err.message);button.disabled=false;button.innerHTML=old;}
}
function classLinkPlatforms(){return [['WHATSAPP','WhatsApp'],['ZOOM','Zoom'],['GOOGLE_MEET','Google Meet'],['GOOGLE_DRIVE','Google Drive'],['YOUTUBE','YouTube'],['TELEGRAM','Telegram'],['WEBSITE','Website'],['OTHER','Lainnya']];}
function classLinkRow(item={},index=0){return `<div class="class-link-editor-row" data-class-link-row data-link-id="${esc(item.link_id||'')}"><span class="class-link-drag">${String(index+1).padStart(2,'0')}</span><select class="control link-platform">${classLinkPlatforms().map(([value,label])=>`<option value="${value}" ${String(item.platform||'OTHER')===value?'selected':''}>${label}</option>`).join('')}</select><select class="control link-visibility" title="Akses link"><option value="PUBLIC" ${String(item.visibility||'PUBLIC')==='PUBLIC'?'selected':''}>Publik</option><option value="MEMBER" ${String(item.visibility||'PUBLIC')==='MEMBER'?'selected':''}>Anggota</option></select><input class="control link-label" placeholder="Nama link" maxlength="90" value="${esc(item.label||'')}"><input class="control link-url" type="url" placeholder="https://…" maxlength="1500" value="${esc(item.url||'')}"><input class="control link-description" placeholder="Keterangan singkat (opsional)" maxlength="180" value="${esc(item.description||'')}"><span class="class-link-row-actions"><button type="button" class="icon-btn mini" data-move-class-link="up" title="Naikkan"><span class="material-symbols-rounded">arrow_upward</span></button><button type="button" class="icon-btn mini" data-move-class-link="down" title="Turunkan"><span class="material-symbols-rounded">arrow_downward</span></button><button type="button" class="icon-btn mini danger-btn" data-remove-class-link title="Hapus link">${svg('i-close')}</button></span></div>`;}
function publicClassLinksUrl(classCode){return primaryUrl('/links.html',{c:String(classCode||'').replace(/^KLS-/i,'')}).toString();}
function renumberClassLinkRows(){document.querySelectorAll('[data-class-link-row]').forEach((row,index)=>{const n=row.querySelector('.class-link-drag');if(n)n.textContent=String(index+1).padStart(2,'0');});}
function bindClassLinksSettings(data){
  const editor=document.getElementById('class-links-editor'); if(!editor)return;
  const bindRemove=()=>editor.querySelectorAll('[data-remove-class-link]').forEach(btn=>btn.onclick=()=>{const rows=editor.querySelectorAll('[data-class-link-row]');if(rows.length<=1){const row=btn.closest('[data-class-link-row]');row.querySelectorAll('input').forEach(i=>i.value='');row.querySelector('.link-platform').value='OTHER';return;}btn.closest('[data-class-link-row]')?.remove();renumberClassLinkRows();});
  const bindMove=()=>editor.querySelectorAll('[data-move-class-link]').forEach(btn=>btn.onclick=()=>{const row=btn.closest('[data-class-link-row]');if(!row)return;if(btn.dataset.moveClassLink==='up'&&row.previousElementSibling)editor.insertBefore(row,row.previousElementSibling);if(btn.dataset.moveClassLink==='down'&&row.nextElementSibling)editor.insertBefore(row.nextElementSibling,row);renumberClassLinkRows();});
  const bindAutoPlatform=()=>editor.querySelectorAll('.link-url').forEach(input=>input.onchange=()=>{const row=input.closest('[data-class-link-row]');const select=row?.querySelector('.link-platform');if(!select||select.value!=='OTHER')return;const u=String(input.value||'').toLowerCase();if(/chat\.whatsapp\.com|wa\.me|whatsapp\.com/.test(u))select.value='WHATSAPP';else if(/zoom\.us/.test(u))select.value='ZOOM';else if(/meet\.google\.com/.test(u))select.value='GOOGLE_MEET';else if(/drive\.google\.com|docs\.google\.com/.test(u))select.value='GOOGLE_DRIVE';else if(/youtube\.com|youtu\.be/.test(u))select.value='YOUTUBE';else if(/t\.me|telegram\.me/.test(u))select.value='TELEGRAM';else if(/^https?:\/\//.test(u))select.value='WEBSITE';});
  bindRemove();bindMove();bindAutoPlatform();
  document.getElementById('add-class-link')?.addEventListener('click',()=>{const wrap=document.createElement('div');wrap.innerHTML=classLinkRow({},editor.querySelectorAll('[data-class-link-row]').length);editor.appendChild(wrap.firstElementChild);bindRemove();bindMove();bindAutoPlatform();renumberClassLinkRows();editor.lastElementChild?.querySelector('.link-label')?.focus();});
  document.getElementById('copy-public-links')?.addEventListener('click',()=>copyText(publicClassLinksUrl(data.class?.class_code||'')));
  document.getElementById('public-links-enabled')?.addEventListener('change',e=>document.querySelector('.class-public-url')?.classList.toggle('is-disabled',!e.currentTarget.checked));
  document.getElementById('save-class-links')?.addEventListener('click',()=>saveClassLinks(data));
}
async function saveClassLinks(data){
  const btn=document.getElementById('save-class-links'),status=document.getElementById('class-links-status');if(!btn||btn.disabled)return;
  const links=[...document.querySelectorAll('[data-class-link-row]')].map(row=>({link_id:row.dataset.linkId||'',platform:row.querySelector('.link-platform')?.value||'OTHER',label:row.querySelector('.link-label')?.value.trim()||'',url:row.querySelector('.link-url')?.value.trim()||'',description:row.querySelector('.link-description')?.value.trim()||'',visibility:row.querySelector('.link-visibility')?.value||'PUBLIC'})).filter(item=>item.label||item.url);
  const invalid=links.find(item=>!item.label||!/^https?:\/\//i.test(item.url));if(invalid){status.className='request-status error';status.textContent='Setiap link wajib punya nama dan URL http/https yang valid.';return;}
  const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';status.className='request-status progress';status.textContent='Menyimpan link kelas…';
  try{const result=await api('saveClassLinks',{class_id:state.selectedClassId,public_links_enabled:document.getElementById('public-links-enabled')?.checked===true,links},{onSlow:()=>status.textContent='Masih diproses. Tombol tetap dikunci.'});if(currentClassData){currentClassData.class_links=result.items||[];currentClassData.settings.public_links_enabled=result.public_links_enabled;state.classDetails[state.selectedClassId]=currentClassData;}status.className='request-status ok';status.textContent='Link kelas tersimpan ✓';toast('Link kelas tersimpan.');}
  catch(err){status.className='request-status error';status.textContent=err.message;}
  finally{btn.disabled=false;btn.innerHTML=old;}
}

async function saveClassProfile(){const form=document.getElementById('class-settings-form'),btn=document.getElementById('save-class-profile'),old=btn.innerHTML;if(btn.disabled)return;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';try{await api('updateClassProfile',{class_id:state.selectedClassId,name:form.name.value,description:form.description.value,institution:form.institution.value,study_program:form.study_program.value,cohort:form.cohort.value,semester:form.semester.value});toast('Identitas kelas tersimpan.');markClassCacheStale('classDetailsAt','kelasku_class_details_cache_at',state.selectedClassId);await loadClassDetail(false,true);}catch(err){toast(err.message);}finally{btn.disabled=false;btn.innerHTML=old;}}
async function saveClassSettings(event){event.preventDefault();const form=event.currentTarget,btn=document.getElementById('save-class-settings'),status=document.getElementById('class-settings-status'),old=btn.innerHTML;if(btn.disabled)return;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';status.className='request-status progress';status.textContent='Menyimpan pengaturan…';const payload={class_id:state.selectedClassId,visibility:form.visibility.value,join_approval:form.join_approval.checked,join_code_enabled:form.join_code_enabled.checked,member_list_visible:form.member_list_visible.checked,allow_member_posts:form.allow_member_posts.checked,allow_member_uploads:form.allow_member_uploads.checked,allow_member_invites:form.allow_member_invites.checked};try{await api('updateClassSettings',payload,{onSlow:()=>status.textContent='Masih diproses. Tombol tetap dikunci.'});status.className='request-status ok';status.textContent='Tersimpan ✓';toast('Pengaturan kelas tersimpan.');markClassCacheStale('classDetailsAt','kelasku_class_details_cache_at',state.selectedClassId);await loadClassDetail(false,true);}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}}
async function regenerateJoinCode(){const ok=await confirmDialog({title:'Generate ulang Join Code?',message:'Kode lama langsung tidak dapat dipakai. Pastikan anggota baru menerima kode terbaru.',confirmText:'Generate Ulang',danger:true});if(!ok)return;const btn=document.getElementById('regen-code'),old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Memproses…</span>';try{const data=await api('regenerateJoinCode',{class_id:state.selectedClassId});toast('Join Code baru: '+data.join_code);markClassCacheStale('classDetailsAt','kelasku_class_details_cache_at',state.selectedClassId);await loadClassDetail(false,true);}catch(err){toast(err.message);}finally{btn.disabled=false;btn.innerHTML=old;}}

async function copyAttendanceLink(token){if(!token)return toast('Link absensi belum tersedia.');await copyText(attendanceLink(token));}
function attendanceLink(token){return primaryUrl('/absensi',{a:String(token||'')}).toString();}
async function copyText(text){try{await navigator.clipboard.writeText(text||'');toast('Tautan/kode disalin.');}catch{toast('Gagal menyalin otomatis.');}}

function roomSkeleton(){return fastRoomLoader('Membuka Ruang Kelas…');}
function detail(label,value){return `<div class="detail-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;}
function roleLabel(role){const key=String(role||'MEMBER').toUpperCase();if(key==='COORDINATOR')return 'Koordinator';if(key==='OWNER')return 'Owner';if(key==='MODERATOR')return 'Moderator';return 'Member';}
function initials(name){return String(name||'K').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'K';}
function avatarMarkup(user){return user?.avatar_url?`<img src="${esc(user.avatar_url)}" alt="">`:`<span class="default-avatar-icon" aria-hidden="true">${svg('i-user')}</span>`;}
function selectRow(label,name,value,options){return `<label class="setting-row"><span><strong>${esc(label)}</strong></span><select class="control setting-control" name="${esc(name)}">${options.map(x=>`<option value="${x[0]}" ${String(value)===x[0]?'selected':''}>${esc(x[1])}</option>`).join('')}</select></label>`;}
function toggleRow(label,name,value){return `<label class="setting-row"><span><strong>${esc(label)}</strong></span><span class="switch"><input type="checkbox" name="${esc(name)}" ${truthy(value)?'checked':''}><span></span></span></label>`;}
function truthy(v){return v===true||String(v).toUpperCase()==='TRUE'||String(v)==='1';}
function showModal(html){closeModal();const el=document.createElement('div');el.id='phase-modal';el.className='overlay';el.innerHTML=`<div class="modal glass phase-modal-card">${html}</div>`;document.body.appendChild(el);el.querySelectorAll('[data-close-modal]').forEach(x=>x.onclick=closeModal);el.onclick=e=>{if(e.target===el)closeModal();};}
function closeModal(){document.getElementById('phase-modal')?.remove();}
function openExternal(url){if(!/^https?:\/\//i.test(String(url||'')))return toast('Tautan tidak valid.');window.open(url,'_blank','noopener,noreferrer');}
function dateMs(value){const n=new Date(value||'').getTime();return Number.isFinite(n)?n:0;}
function shortDate(value){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium'}).format(new Date(value));}catch{return value||'-';}}
function shortDateTime(value){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch{return value||'-';}}
function timeRange(start,end){try{const f=v=>new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit'}).format(new Date(v));return f(start)+(end?` – ${f(end)}`:'');}catch{return '';}}
function deadlineText(value){return value?'Deadline '+shortDateTime(value):'Tanpa deadline';}
function dayPart(value){try{return new Intl.DateTimeFormat('id-ID',{day:'2-digit'}).format(new Date(value));}catch{return '--';}}
function monthPart(value){try{return new Intl.DateTimeFormat('id-ID',{month:'short'}).format(new Date(value)).toUpperCase();}catch{return '---';}}
function toLocalInput(date){const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
function windowLabel(status){const k=String(status||'OPEN').toUpperCase();return k==='UPCOMING'?'Belum Dibuka':k==='CLOSED'?'Ditutup':'Aktif';}
function pollStatusLabel(status){const k=String(status||'').toUpperCase();return k==='ACTIVE'?'Aktif':k==='TIED'?'Seri':k==='CLOSED'?'Selesai':'Selesai';}
