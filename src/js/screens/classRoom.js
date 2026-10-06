import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, sameData, primaryUrl, randomId } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { confirmDialog } from '../core/dialog.js';
import { go } from '../core/router.js';
import { invalidateAcademicClientCache, openTaskModal } from './academic.js';
import { compressImageFile, fileToDataUrl, formatBytes } from '../core/media.js';
import { downloadXlsx, xlsxCell } from '../core/xlsx.js?v=680r3';

let activeTab = 'overview';
let timelineCategory = 'ALL';
let currentClassData = null;
let analyticsPage = 1;
let analyticsMemberPage = 1;
let analyticsFilter = 'ALL';
let analyticsView = 'overview';
let analyticsActivityExpanded = '';
let classAttendancePage = 1;
let attendanceModalPage = 1;
let attendanceModalState = null;
let classMembersPage = 1;
const ANALYTICS_PAGE_SIZE = 15;
const ANALYTICS_MEMBER_PAGE_SIZE = 15;
const CLASS_ATTENDANCE_PAGE_SIZE = 10;
const ATTENDANCE_MEMBER_PAGE_SIZE = 20;
const CLASS_MEMBERS_PAGE_SIZE = 8;
const CLASS_DETAIL_TTL_MS = 2 * 60 * 1000;
const CLASS_ACADEMIC_TTL_MS = 90 * 1000;
const classDetailInFlight = new Map();
const classAcademicInFlight = new Map();
const classTimelineInFlight = new Map();
const classAnalyticsInFlight = new Map();
const classAnalyticsSummaryCache = new Map();
const classAnalyticsSummaryAt = new Map();
const classAnalyticsSummaryInFlight = new Map();
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
    <div class="page-head class-room-head"><div><h1>Ruang Kelas</h1></div><button id="back-classes" class="btn btn-secondary class-room-back-btn">${svg('i-back')} Kembali</button></div>
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
      syncClassHeroCache(data,{authoritative:true});
      syncPublicLandingAppearanceCache(data);
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


function classIconKey(data){
  return String(data?.class?.icon_key || data?.appearance?.icon_key || 'school').trim() || 'school';
}
function classHeroIdentityVisual(data){
  const c=data?.class||{};
  const cover=String(c.cover_url||'').trim();
  if(cover)return `<img src="${esc(cover)}" alt="" loading="lazy">`;
  return `<span class="material-symbols-rounded class-hero-symbol-v6728">${esc(classIconKey(data))}</span>`;
}

function drawClass(data, preserveTab = true) {
  currentClassData = data;
  const c = data.class || {};
  const p = data.permissions || {};
  const desiredTab = preserveTab ? activeTab : 'overview';
  const leader = (data.members || []).find(m => m.is_class_leader);
  const roomSubtitle=document.getElementById('class-room-subtitle');
  if(roomSubtitle) roomSubtitle.textContent='';

  document.getElementById('class-room-slot').innerHTML = `
    <section class="class-hero class-hero-v51 class-hero-v6720 class-hero-v6725 panel">
      <picture class="class-hero-bg-v6725" aria-hidden="true">
        <source media="(max-width:720px)" srcset="${esc(classAppearanceUrl(data,'HERO_MOBILE','assets/classroom/hero-room-default-mobile.jpg?v=680'))}">
        <img src="${esc(classAppearanceUrl(data,'HERO_DESKTOP','assets/classroom/hero-room-default-desktop.jpg?v=680'))}" alt="" loading="eager" decoding="async">
      </picture>
      <div class="class-hero-shade-v6725" aria-hidden="true"></div>
      <div class="class-hero-main class-hero-copy-v6725 class-hero-copy-v6728">
        <h2>${esc(c.name)}</h2>
        <div class="class-primary-meta class-hero-subtitle"><span>${esc(c.institution || 'KelasKu')}</span>${c.study_program?`<span>${esc(c.study_program)}</span>`:''}${c.cohort?`<span>Angkatan ${esc(c.cohort)}</span>`:''}${c.semester?`<span>${esc(c.semester)}</span>`:''}</div>
        <p class="class-hero-description">${esc(c.description || 'Belajar dan berdiskusi bersama dalam satu ruang.')}</p>
        <div class="class-hero-mobile-rule-v6720 class-hero-rule-v6725 class-hero-rule-v6728" aria-hidden="true"></div>
        <div class="class-hero-bottomline">
          <div class="class-secondary-meta"><span>Class</span><span class="visibility-badge visibility-${String(c.visibility||'DISCOVERABLE').toLowerCase()}">${esc(c.visibility || 'DISCOVERABLE')}</span></div>
          <div class="class-badge-line class-badge-bottom"><span class="role-pill role-${String(c.role||'member').toLowerCase()}">${esc(roleLabel(c.role || 'MEMBER'))}</span>${leader && String(leader.user_id)===String(state.user?.user_id)?'<span class="role-pill leader-role-pill">Ketua Kelas</span>':''}</div>
        </div>
      </div>
    </section>

    <section class="room-navigation-shell room-navigation-v6720" aria-label="Navigasi Ruang Kelas">
      <div class="room-main-nav-wrap-v6720">
        <button type="button" class="room-nav-arrow-v6720 room-nav-prev-v6720" data-room-scroll="prev" aria-label="Geser menu ke kiri"><span class="material-symbols-rounded">chevron_left</span></button>
        <nav class="room-main-nav" id="room-main-nav">
          ${roomMainButton('overview','i-home','Ringkasan')}
          ${roomMainButton('timeline','i-timeline','Timeline')}
          ${roomMainButton('messages','i-chat','Pesan')}
          ${roomMainButton('academic','i-class','Akademik')}
          ${roomMainButton('members','i-users',`Anggota`,(data.members||[]).length)}
          ${roomMainButton('elections','i-vote','Pemilihan',(data.leader_elections||[]).filter(x=>x.status==='ACTIVE').length)}
          ${(p.can_manage_members||p.can_manage_class) ? roomMainButton('manage','i-gear','Kelola',(data.pending_requests||[]).length) : ''}
        </nav>
        <button type="button" class="room-nav-arrow-v6720 room-nav-next-v6720" data-room-scroll="next" aria-label="Geser menu ke kanan"><span class="material-symbols-rounded">chevron_right</span></button>
      </div>
    </section>
    <div class="room-subnav-host-v6721" id="room-subnav" hidden></div>
    <div id="room-content"></div>`;

  document.querySelectorAll('[data-copy]').forEach(btn => btn.onclick = () => copyText(btn.dataset.copy));
  bindRoomNavigation(data);
  switchTab(desiredTab, data);
  scheduleClassWarmup(state.selectedClassId);
}

function roomMainButton(key,icon,label,count=0){
  const badge=Number(count||0)>0?`<b>${Number(count)}</b>`:'';
  return `<button type="button" class="room-main-item" data-room-main="${key}"><span class="room-main-icon">${svg(icon)}</span><span class="room-main-label">${label}</span>${badge}</button>`;
}
function roomCreateButton(id,label){
  return `<button id="${id}" class="btn btn-primary room-create-icon-v6720" type="button" title="${esc(label)}" aria-label="${esc(label)}">${svg('i-plus')}</button>`;
}
function bindRoomMainScrollerV6720(){
  const nav=document.getElementById('room-main-nav');
  if(!nav)return;
  const prev=document.querySelector('[data-room-scroll="prev"]');
  const next=document.querySelector('[data-room-scroll="next"]');
  const sync=()=>{
    const overflow=nav.scrollWidth-nav.clientWidth>6;
    if(prev){prev.classList.toggle('is-visible',overflow);prev.disabled=nav.scrollLeft<=3;}
    if(next){next.classList.toggle('is-visible',overflow);next.disabled=nav.scrollLeft+nav.clientWidth>=nav.scrollWidth-3;}
  };
  if(prev)prev.onclick=()=>nav.scrollBy({left:-Math.max(150,nav.clientWidth*.65),behavior:'smooth'});
  if(next)next.onclick=()=>nav.scrollBy({left:Math.max(150,nav.clientWidth*.65),behavior:'smooth'});
  nav.addEventListener('scroll',sync,{passive:true});
  requestAnimationFrame(sync);
}
function roomMainKey(tab){
  if(['announcements','schedule','tasks','materials','attendance','analytics'].includes(tab))return 'academic';
  if(['requests','settings'].includes(tab))return 'manage';
  return tab;
}
function roomSubmenuItems(main,data){
  if(main==='academic')return [
    ['announcements','campaign','Pengumuman'],
    ['schedule','calendar_month','Jadwal'],
    ['tasks','checklist','Tugas'],
    ['materials','description','Materi'],
    ['attendance','how_to_reg','Absensi'],
    ['analytics','monitoring','Analitik']
  ];
  if(main==='manage'){
    const items=[];
    if(data.permissions?.can_manage_members)items.push(['requests','group_add',`Permintaan ${(data.pending_requests||[]).length}`]);
    if(data.permissions?.can_manage_class)items.push(['settings','settings','Pengaturan Kelas']);
    return items;
  }
  return [];
}
function closeRoomSubmenu(){
  const host=document.getElementById('room-subnav');
  if(!host)return;
  host.hidden=true;
  host.innerHTML='';
  host.dataset.main='';
}
function renderRoomSubmenu(main,data){
  const host=document.getElementById('room-subnav');
  if(!host)return;
  const items=roomSubmenuItems(main,data);
  if(!items.length){closeRoomSubmenu();return;}
  const label=main==='academic'?'Menu Akademik':'Kelola Kelas';
  host.dataset.main=main;
  host.hidden=false;
  host.innerHTML=`<div class="room-subnav-horizontal-v6723" role="tablist" aria-label="${label}">
    ${items.map(([key,icon,itemLabel])=>`<button type="button" role="tab" aria-selected="${activeTab===key?'true':'false'}" class="room-subnav-horizontal-item-v6723 ${activeTab===key?'active':''}" data-room-sub="${key}"><span class="material-symbols-rounded">${icon}</span><span>${esc(itemLabel)}</span>${main==='academic'?roomAcademicSignal(key,state.classAcademic?.[state.selectedClassId]):''}</button>`).join('')}
  </div>`;
  host.querySelectorAll('[data-room-sub]').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    switchTab(btn.dataset.roomSub,data);
  }));
}
function bindRoomNavigation(data){
  document.querySelectorAll('[data-room-main]').forEach(btn=>btn.onclick=(event)=>{
    event.stopPropagation();
    const key=btn.dataset.roomMain;
    if(key==='academic'){
      if(roomMainKey(activeTab)!=='academic') return switchTab('announcements',data);
      renderRoomSubmenu('academic',data);
      return;
    }
    if(key==='manage'){
      if(roomMainKey(activeTab)!=='manage') return switchTab((data.pending_requests||[]).length?'requests':'settings',data);
      renderRoomSubmenu('manage',data);
      return;
    }
    closeRoomSubmenu();
    switchTab(key,data);
  });
  bindRoomMainScrollerV6720();
}
function actionableAttendanceCount(data){
  if(!data||data.permissions?.is_participant===false)return 0;
  const now=Date.now();
  return (data.attendance_sessions||[]).filter(x=>{
    const status=String(x.my_status||'UNMARKED').toUpperCase();
    const windowKey=String(x.window_status||'').toUpperCase();
    const openAt=new Date(x.open_at||x.start_at||0).getTime()||0;
    const closeAt=new Date(x.close_at||x.end_at||0).getTime()||0;
    const isOpen=windowKey==='OPEN'||(!windowKey&&openAt<=now&&(!closeAt||closeAt>=now));
    return status==='UNMARKED'&&isOpen;
  }).length;
}
function roomAcademicSignal(key,data){
  if(!data||key==='analytics')return '';
  let n=0;
  if(key==='attendance'||key==='schedule'){
    n=actionableAttendanceCount(data);
  }else if(key==='tasks'){
    if(data.permissions?.is_participant===false)return '';
    n=(data.tasks||[]).filter(x=>!['SUBMITTED','REVIEWED','GRADED'].includes(String(x.submission_status||'').toUpperCase())).length;
  }else if(key==='materials') n=(data.materials||[]).length?1:0;
  else if(key==='announcements') n=(data.announcements||[]).length?1:0;
  if(!n)return '';
  const dot=['materials','announcements'].includes(key);
  return `<b class="room-nav-signal ${dot?'dot':''}">${dot?'':(n>9?'9+':n)}</b>`;
}
function refreshRoomNavigation(tab,data){
  const main=roomMainKey(tab);
  document.querySelectorAll('[data-room-main]').forEach(btn=>btn.classList.toggle('active',btn.dataset.roomMain===main));
  if(main==='academic'||main==='manage') renderRoomSubmenu(main,data);
  else closeRoomSubmenu();
}

function switchTab(tab, data) {
  activeTab = tab;
  refreshRoomNavigation(tab,data);
  const slot = document.getElementById('room-content');
  if (!slot) return;

  if (tab === 'messages') {
    sessionStorage.setItem('kelasku_message_class', state.selectedClassId);
    sessionStorage.setItem('kelasku_message_origin', 'class');
    sessionStorage.setItem('kelasku_message_origin_class', state.selectedClassId);
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
    const classId=String(state.selectedClassId||'');
    const cached=classAnalyticsSummaryCache.get(classId)||null;
    if(cached) drawClassAnalyticsSummary(cached);
    else slot.innerHTML = fastRoomLoader('Menyiapkan ringkasan Analitik…');
    loadClassAnalyticsSummary(Boolean(cached));
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
      if(String(state.selectedClassId)===classId&&currentClassData)refreshRoomNavigation(activeTab,currentClassData);
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
  const classUrl=publicClassLinksUrl(c.class_code||'',c.public_slug||''), joinUrl=joinClassUrl(c.class_code||'',c.public_slug||'');
  const leader=(data.members||[]).find(m=>m.is_class_leader);
  const joinCodeTile=p.can_manage_class?`<div class="overview-code-tile"><span>Join Code</span><strong>${esc(c.join_code||'-')}</strong><button type="button" class="icon-btn mini" id="overview-copy-join-code" title="Salin Join Code">${svg('i-copy')}</button></div>`:'';
  return `<section class="room-overview room-overview-v68">
    <details class="panel overview-fold-card overview-info-card">
      <summary><span class="overview-fold-icon material-symbols-rounded">info</span><span><strong>Informasi Kelas</strong><small>Identitas utama dan struktur kelas.</small></span><span class="material-symbols-rounded overview-fold-chevron">expand_more</span></summary>
      <div class="overview-fold-body"><div class="detail-list">
        ${detail('Institusi',c.institution||'KelasKu')}${detail('Program Studi',c.study_program||'-')}${detail('Angkatan',c.cohort?`Angkatan ${c.cohort}`:'-')}${detail('Semester',c.semester||'-')}${detail('Ketua Kelas',leader?(leader.full_name||leader.username):'Belum ditetapkan')}
      </div></div>
    </details>

    <details class="panel overview-fold-card overview-status-card">
      <summary><span class="overview-fold-icon material-symbols-rounded">verified_user</span><span><strong>Status Kelas</strong><small>Keanggotaan, akses, dan kode kelas.</small></span><span class="material-symbols-rounded overview-fold-chevron">expand_more</span></summary>
      <div class="overview-fold-body"><div class="detail-list overview-status-list">
        ${detail('Role kamu',roleLabel(c.role||'MEMBER'))}<div class="detail-row"><span>Visibilitas</span><strong><span class="visibility-badge visibility-${String(c.visibility||'PUBLIC').toLowerCase()}">${esc(c.visibility||'PUBLIC')}</span></strong></div>${detail('Anggota aktif',String((data.members||[]).length))}
      </div><div class="overview-code-grid"><div class="overview-code-tile"><span>Class Code</span><strong>${esc(c.class_code||'-')}</strong><button type="button" class="icon-btn mini" id="overview-copy-class-code" title="Salin Class Code">${svg('i-copy')}</button></div>${joinCodeTile}</div></div>
    </details>

    ${p.can_manage_class?`<div class="panel wide-panel overview-manager-panel overview-setting-card"><div><div class="panel-title">Kelola Kelas</div><p class="panel-copy">Pengaturan dan pengelolaan anggota.</p></div><div class="page-actions"><button id="quick-settings" class="btn btn-primary">${svg('i-gear')} Pengaturan</button><button id="quick-members" class="btn btn-secondary">${svg('i-users')} Anggota</button></div></div>`:''}

    <div class="overview-link-strip" aria-label="Link kelas">
      <button type="button" class="overview-link-action" id="overview-open-class-link" title="${esc(classUrl)}"><span class="material-symbols-rounded">open_in_new</span><span><small>Link Kelas</small><strong>Buka Landing</strong></span></button>
      <button type="button" class="overview-link-copy" id="overview-copy-class-link" title="Salin link kelas">${svg('i-copy')}</button>
      <button type="button" class="overview-link-action" id="overview-copy-join-link" title="${esc(joinUrl)}"><span class="material-symbols-rounded">link</span><span><small>Link Bergabung</small><strong>Salin Link</strong></span></button>
    </div>

    <div class="panel wide-panel class-exit-panel"><div><div class="panel-title">${p.is_owner?'Hapus Kelas':'Keluar dari Kelas'}</div><p class="panel-copy">${p.is_owner?'Kelas akan dinonaktifkan dari daftar aktif. Data dan histori tetap dipertahankan.':'Akses ke kelas akan dihentikan. Histori akademik yang sudah tercatat tetap tersimpan.'}</p></div><button type="button" id="class-exit-action" class="btn ${p.is_owner?'btn-danger':'btn-secondary'}">${p.is_owner?'Hapus Kelas':'Keluar Kelas'}</button></div>
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
  if (tab === 'attendance') slot.innerHTML = attendanceRoom(data.attendance_sessions || [], p, data.schedules || []);
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
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Pengumuman Kelas</div><p class="panel-copy">Klik pengumuman untuk membaca detail. Pengelola dapat mengedit atau menghapus.</p></div>${p.can_publish?roomCreateButton('create-announcement','Buat Pengumuman'):''}</div>
    <div class="academic-compact-list">${items.length?items.map(x=>`<article class="academic-compact-row priority-${String(x.priority||'normal').toLowerCase()}"><button type="button" class="academic-compact-main" data-announcement-detail="${esc(x.announcement_id)}"><span class="academic-type-icon"><span class="material-symbols-rounded">campaign</span></span><span class="academic-compact-copy"><span class="academic-meta-line"><span>${esc(shortDateTime(x.published_at))}</span><span class="status-badge status-${String(x.priority||'normal').toLowerCase()}">${esc(x.priority||'NORMAL')}</span></span><strong>${esc(x.title)}</strong><small>${esc(excerpt(x.body||'',150))}</small></span><span class="material-symbols-rounded row-chevron">chevron_right</span></button>${p.can_publish?`<div class="academic-row-actions compact-actions"><button type="button" class="icon-btn mini" data-edit-announcement="${esc(x.announcement_id)}" title="Edit"><span class="material-symbols-rounded">edit</span></button>${archiveButton('ANNOUNCEMENT',x.announcement_id,'Hapus')}</div>`:''}</article>`).join(''):'<div class="search-empty">Belum ada pengumuman.</div>'}</div></section>`;
}

function scheduleRoom(items,p,attendanceItems) {
  const now=Date.now();
  const all=decorateScheduleSessions([...items].sort((a,b)=>dateMs(a.start_at)-dateMs(b.start_at)));
  const attendanceBySchedule={}; (attendanceItems||[]).forEach(x=>{if(x.source_schedule_id)attendanceBySchedule[String(x.source_schedule_id)]=x;});
  const phaseOf=x=>{
    const state=String(x.schedule_state||'NORMAL').toUpperCase();
    if(state==='CANCELLED')return 'CANCELLED';
    const start=dateMs(x.start_at),end=dateMs(x.end_at)||start+3*60*60*1000;
    if(start<=now&&end>=now)return 'ONGOING';
    if(end<now)return 'DONE';
    return 'UPCOMING';
  };
  const phaseRank={ONGOING:0,UPCOMING:1,DONE:2,CANCELLED:3};
  const ordered=[...all].sort((a,b)=>phaseRank[phaseOf(a)]-phaseRank[phaseOf(b)]||dateMs(a.start_at)-dateMs(b.start_at));
  const weekEnd=now+7*86400000;
  const week=all.filter(x=>dateMs(x.start_at)>=now&&dateMs(x.start_at)<=weekEnd&&String(x.schedule_state||'NORMAL')!=='CANCELLED').length;
  const upcoming=all.filter(x=>phaseOf(x)==='UPCOMING').length;
  const ongoing=all.filter(x=>phaseOf(x)==='ONGOING').length;
  const completed=all.filter(x=>phaseOf(x)==='DONE').length;
  const changed=all.filter(x=>String(x.schedule_state||'NORMAL')==='CHANGED').length;
  const cancelled=all.filter(x=>String(x.schedule_state||'NORMAL')==='CANCELLED').length;
  const groups=new Map();
  ordered.forEach(x=>{const key=x.recurrence_group_id||`TITLE:${String(x.title||'').toLowerCase()}`;if(!groups.has(key))groups.set(key,{key,title:x.title||'Jadwal',items:[]});groups.get(key).items.push(x);});
  const groupValues=[...groups.values()].sort((a,b)=>{
    const ar=Math.min(...a.items.map(x=>phaseRank[phaseOf(x)])); const br=Math.min(...b.items.map(x=>phaseRank[phaseOf(x)]));
    const ad=Math.min(...a.items.filter(x=>phaseOf(x)!=='DONE').map(x=>dateMs(x.start_at)).concat([9e15]));
    const bd=Math.min(...b.items.filter(x=>phaseOf(x)!=='DONE').map(x=>dateMs(x.start_at)).concat([9e15]));
    return ar-br||ad-bd||a.title.localeCompare(b.title);
  });
  const dateStrip=ordered.filter(x=>['ONGOING','UPCOMING'].includes(phaseOf(x))).slice(0,10).map(x=>`<span class="schedule-date-chip state-${String(x.schedule_state||'NORMAL').toLowerCase()} ${phaseOf(x)==='ONGOING'?'is-ongoing':''}" aria-label="${esc(x.title||'Jadwal')} ${esc(shortDateTime(x.start_at))}"><strong>${esc(dayPart(x.start_at))}</strong><span>${esc(monthPart(x.start_at))}</span></span>`).join('');
  const groupHtml=groupValues.map((group,idx)=>{
    const sessions=group.items;
    const activeCount=sessions.filter(x=>phaseOf(x)==='ONGOING').length;
    const nextCount=sessions.filter(x=>phaseOf(x)==='UPCOMING').length;
    const doneCount=sessions.filter(x=>phaseOf(x)==='DONE').length;
    const bat=sessions.filter(x=>phaseOf(x)==='CANCELLED').length;
    const rev=sessions.filter(x=>String(x.schedule_state||'NORMAL')==='CHANGED').length;
    const autoOpen=activeCount>0 || sessions.some(x=>String(attendanceBySchedule[String(x.schedule_id)]?.window_status||'').toUpperCase()==='OPEN');
    const groupId=`schedule-group-${idx}`;
    return `<section class="schedule-series-card ${autoOpen?'open':''}" data-schedule-group>
      <button type="button" class="schedule-series-head" data-schedule-group-toggle aria-expanded="${autoOpen?'true':'false'}" aria-controls="${groupId}">
        <span class="schedule-series-copy"><span class="eyebrow">MATA KULIAH / KEGIATAN</span><h3>${esc(group.title)}</h3><small>${sessions.length} sesi${activeCount?` · ${activeCount} berlangsung`:''}${nextCount?` · ${nextCount} mendatang`:''}${doneCount?` · ${doneCount} selesai`:''}${rev?` · ${rev} revisi`:''}${bat?` · ${bat} batal`:''}</small></span>
        <span class="schedule-series-side"><span class="material-symbols-rounded schedule-series-icon">event_note</span><span class="material-symbols-rounded schedule-series-chevron">expand_more</span></span>
      </button>
      <div class="schedule-session-list" id="${groupId}" ${autoOpen?'':'hidden'}>${sessions.map(x=>{
        const at=attendanceBySchedule[String(x.schedule_id)]||null;
        const session=x._sessionNo?`Sesi ${String(x._sessionNo).padStart(2,'0')}`:'Sesi';
        const locationLabel=isWebUrl(x.location)?'Online • Zoom/Meet':(x.location||'Tanpa lokasi');
        const phase=phaseOf(x),cancelled=phase==='CANCELLED';
        const attWindow=String(at?.window_status||'').toUpperCase();
        const attendanceOpen=Boolean(at)&&attWindow==='OPEN';
        const attendanceUpcoming=Boolean(at)&&attWindow==='UPCOMING';
        const attendanceAction=attendanceOpen
          ? `<button type="button" class="session-action-btn" data-attendance-id="${esc(at.attendance_id)}" title="Buka absensi"><span class="material-symbols-rounded">how_to_reg</span><span>Absensi</span></button><button type="button" class="icon-btn mini" data-copy-attendance="${esc(at.public_token||'')}" title="Salin link presensi">${svg('i-copy')}</button>`
          : attendanceUpcoming ? '<span class="attendance-action-state attendance-state-icon-only" title="Belum dibuka" aria-label="Belum dibuka"><span class="material-symbols-rounded">schedule</span></span>' : '';
        const phaseBadge=phase==='ONGOING'?'<span class="schedule-phase-badge ongoing">Berlangsung</span>':phase==='DONE'?'<span class="schedule-phase-badge done">Selesai</span>':'';
        return `<article class="schedule-session-row state-${String(x.schedule_state||'normal').toLowerCase()} phase-${phase.toLowerCase()}"><button type="button" class="schedule-session-main" data-schedule-detail="${esc(x.schedule_id)}"><span class="academic-date-tile compact"><strong>${esc(dayPart(x.start_at))}</strong><span>${esc(monthPart(x.start_at))}</span></span><span class="schedule-session-copy"><span><b>${esc(session)}</b><i>${esc(timeRange(x.start_at,x.end_at))}</i></span><small>${esc(locationLabel)}${x.change_note?` · ${esc(excerpt(x.change_note,80))}`:''}</small></span>${phaseBadge}${scheduleStateBadge(x)}${x.recurrence_group_id?'<span class="material-symbols-rounded recurring-icon" title="Jadwal berulang">repeat</span>':''}<span class="material-symbols-rounded row-chevron">chevron_right</span></button><div class="academic-row-actions compact-actions">${attendanceAction}${(p.can_manage_schedule||p.can_manage_academic)&&!cancelled?`<button type="button" class="icon-btn mini" data-edit-schedule="${esc(x.schedule_id)}" title="Edit sesi"><span class="material-symbols-rounded">edit_calendar</span></button>`:''}</div></article>`;
      }).join('')}</div>
    </section>`;
  }).join('');
  return `<section class="class-academic-panel schedule-room-v663"><div class="academic-room-toolbar panel"><div><div class="panel-title">Jadwal Kelas</div><p class="panel-copy">Urutan: sedang berlangsung → mendatang → selesai. Sesi selesai tetap tersimpan sebagai riwayat.</p></div>${(p.can_manage_schedule||p.can_manage_academic)?roomCreateButton('create-schedule','Tambah Jadwal'):''}</div>
    <div class="schedule-kpi-strip"><div><strong>${ongoing}</strong><span>Berlangsung</span></div><div><strong>${week}</strong><span>Pekan ini</span></div><div><strong>${upcoming}</strong><span>Mendatang</span></div><div><strong>${completed}</strong><span>Selesai</span></div></div>
    ${dateStrip?`<div class="schedule-date-strip">${dateStrip}</div><div class="schedule-color-note"><span><i class="dot normal"></i>Normal</span><span><i class="dot changed"></i>Revisi (${changed})</span><span><i class="dot cancelled"></i>Batal (${cancelled})</span><small>Indikator tanggal saja.</small></div>`:''}
    <div class="schedule-series-list">${groupHtml||'<div class="panel search-empty">Belum ada jadwal.</div>'}</div></section>`;
}

function tasksRoom(items,p) {
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Tugas Kelas</div><p class="panel-copy">Deadline, pengumpulan, review, nilai, dan feedback.</p></div>${p.can_manage_academic?roomCreateButton('create-task','Buat Tugas'):''}</div><div class="academic-compact-list">${items.length?items.map(x=>`<article class="academic-compact-row task-compact-row"><button type="button" class="academic-compact-main" data-open-global-task="${esc(x.task_id)}"><span class="academic-type-icon">${svg('i-task')}</span><span class="academic-compact-copy"><span class="academic-meta-line"><span>${esc(deadlineText(x.deadline))}</span><span>${esc(x.submission_mode||'NONE')}</span><span>Maks ${esc(String(x.max_score||0))}</span></span><strong>${esc(x.title)}</strong><small>${esc(excerpt(x.description||'Klik untuk membuka tugas.',140))}</small></span><span class="academic-status-pill status-${String(x.submission_status||'NOT_SUBMITTED').toLowerCase()}">${esc(x.submission_status||'NOT_SUBMITTED')}</span><span class="material-symbols-rounded row-chevron">chevron_right</span></button><div class="academic-row-actions compact-actions">${p.can_review_tasks?`<button type="button" class="icon-btn mini" data-review-task="${esc(x.task_id)}" title="Review">${svg('i-grade')}</button>`:''}${p.can_manage_academic?archiveButton('TASK',x.task_id):''}</div></article>`).join(''):'<div class="search-empty">Belum ada tugas.</div>'}</div></section>`;
}

function materialsRoom(items,p) {
  const cards=items.length?items.map(x=>{const attachments=x.attachments||[];const images=attachments.filter(a=>String(a.mime_type||'').startsWith('image/')).length;const docs=attachments.length-images;return `<article class="room-material-card"><button type="button" class="room-material-main" data-material-detail="${esc(x.material_id)}"><span class="room-material-icon material-symbols-rounded">${attachments.length?'collections_bookmark':(x.material_type==='LINK'||x.material_type==='DRIVE_LINK')?'link':'description'}</span><span class="room-material-copy"><span class="academic-meta-line"><span>${esc(shortDate(x.published_at))}</span>${x.meeting_no?`<span>Pertemuan ${esc(x.meeting_no)}</span>`:''}</span><strong>${esc(x.title)}</strong><small>${esc(excerpt(x.description||'Klik untuk membuka materi.',120))}</small><span class="room-material-kpis">${images?`<i>${images} gambar</i>`:''}${docs?`<i>${docs} file</i>`:''}${x.url?'<i>1 link</i>':''}</span></span><span class="material-symbols-rounded row-chevron">chevron_right</span></button>${p.can_publish?`<div class="academic-row-actions compact-actions">${archiveButton('MATERIAL',x.material_id,'Hapus')}</div>`:''}</article>`;}).join(''):'<div class="search-empty">Belum ada materi.</div>';
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Materi Kelas</div><p class="panel-copy">Materi ditampilkan ringkas; gambar dan dokumen dibuka sebagai preview di KelasKu.</p></div>${p.can_publish?roomCreateButton('create-material','Tambah Materi'):''}</div><div class="room-material-grid">${cards}</div></section>`;
}
function roomAttendanceState(item,managerMode=false){
  const status=String(item?.my_status||'UNMARKED').toUpperCase(),windowKey=String(item?.window_status||'').toUpperCase();
  if(managerMode){
    if(windowKey==='OPEN')return{group:'waiting',label:'Aktif',icon:'radio_button_checked'};
    if(windowKey==='UPCOMING')return{group:'upcoming',label:'Belum dibuka',icon:'lock_clock'};
    return{group:'closed',label:'Ditutup',icon:'lock'};
  }
  if(status==='PRESENT')return{group:'done',label:'Hadir',icon:'check_circle'};
  if(status==='SICK')return{group:'done',label:'Sakit',icon:'sick'};
  if(status==='PERMIT')return{group:'done',label:'Izin',icon:'assignment'};
  if(status==='ABSENT')return{group:'done',label:'Alpa',icon:'cancel'};
  if(windowKey==='OPEN')return{group:'waiting',label:'Belum absensi',icon:'schedule'};
  if(windowKey==='UPCOMING')return{group:'upcoming',label:'Belum dibuka',icon:'lock_clock'};
  return{group:'closed',label:'Ditutup',icon:'lock'};
}

function attendanceWindowText(item){
  const start=item?.open_at||item?.start_at||'';
  const end=item?.close_at||item?.end_at||'';
  const startText=start?shortDateTime(start):'Belum diatur';
  const endText=end?shortDateTime(end):'Belum diatur';
  return `Mulai ${startText} • Selesai ${endText}`;
}

function attendanceRoom(items,p,schedules=[]) {
  const now=Date.now();
  const scheduleMap={}; decorateScheduleSessions(schedules||[]).forEach(x=>scheduleMap[String(x.schedule_id)]=x);
  const available=[...items].sort((a,b)=>{const rank={waiting:0,upcoming:1,done:2,closed:3},ar=rank[roomAttendanceState(a,p.can_manage_attendance).group]??9,br=rank[roomAttendanceState(b,p.can_manage_attendance).group]??9;if(ar!==br)return ar-br;const ad=dateMs(a.start_at),bd=dateMs(b.start_at);return ar===3?bd-ad:ad-bd;});
  const groups=new Map();
  available.forEach(x=>{const sc=scheduleMap[String(x.source_schedule_id||'')];const title=sc?.title||String(x.title||'Absensi Manual').replace(/^Absensi\s*[—-]\s*/i,'').replace(/\s*[•-]\s*Sesi\s*\d+.*$/i,'')||'Absensi Manual';const key=sc?.recurrence_group_id||sc?.title||`MANUAL:${title}`;if(!groups.has(key))groups.set(key,{title,items:[]});groups.get(key).items.push({...x,_schedule:sc});});
  const groupRows=[...groups.values()].sort((a,b)=>Number(!a.items.some(x=>roomAttendanceState(x,p.can_manage_attendance).group==='waiting'))-Number(!b.items.some(x=>roomAttendanceState(x,p.can_manage_attendance).group==='waiting'))||a.title.localeCompare(b.title)).map((group,idx)=>{
    group.items.sort((a,b)=>dateMs(a.start_at)-dateMs(b.start_at));
    const doneCount=group.items.filter(x=>roomAttendanceState(x,p.can_manage_attendance).group==='done').length,waitingCount=group.items.filter(x=>roomAttendanceState(x,p.can_manage_attendance).group==='waiting').length,upcomingCount=group.items.filter(x=>roomAttendanceState(x,p.can_manage_attendance).group==='upcoming').length,closedCount=group.items.filter(x=>roomAttendanceState(x,p.can_manage_attendance).group==='closed').length,autoOpen=waitingCount>0,groupId=`attendance-group-${idx}`;
    return `<section class="schedule-series-card attendance-series-card ${autoOpen?'open':''}"><button type="button" class="schedule-series-head attendance-course-head" data-attendance-group-toggle aria-expanded="${autoOpen?'true':'false'}" aria-controls="${groupId}"><span class="schedule-series-copy"><span class="eyebrow">MATA PELAJARAN / KEGIATAN</span><h3>${esc(group.title)}</h3><small>${group.items.length} sesi${p.can_manage_attendance?(waitingCount?` · ${waitingCount} aktif`:upcomingCount?` · ${upcomingCount} belum dibuka`:closedCount?` · ${closedCount} ditutup`:''):`${doneCount?` · ${doneCount} sudah`:''}${waitingCount?` · ${waitingCount} perlu absensi`:''}${upcomingCount?` · ${upcomingCount} belum dibuka`:''}${closedCount?` · ${closedCount} ditutup`:''}`}</small></span><span class="schedule-series-side"><span class="material-symbols-rounded schedule-series-icon">how_to_reg</span><span class="material-symbols-rounded schedule-series-chevron">expand_more</span></span></button><div class="schedule-session-list attendance-course-sessions" id="${groupId}" ${autoOpen?'':'hidden'}>${group.items.map((x,sessionIndex)=>{const sc=x._schedule,session=sc?decorateScheduleSessions([sc])[0]?._sessionNo:0,displaySessionNo=session||sessionIndex+1,ui=roomAttendanceState(x,p.can_manage_attendance),isOpen=String(x.window_status||'').toUpperCase()==='OPEN',canInspect=Boolean(p.can_manage_attendance)||isOpen,sessionLabel=`Sesi - ${String(displaySessionNo).padStart(2,'0')}`,scheduleTitle=sc?.title||group.title;return `<article class="schedule-session-row attendance-session-row state-${ui.group} ${isOpen?'is-open':'is-locked'}"><${canInspect?'button':'div'} ${canInspect?`type="button" data-attendance-id="${esc(x.attendance_id)}"`:''} class="schedule-session-main ${canInspect?'':'attendance-disabled-row'}"><span class="academic-date-tile compact"><strong>${esc(dayPart(x.start_at))}</strong><span>${esc(monthPart(x.start_at))}</span></span><span class="schedule-session-copy"><span><b>${esc(sessionLabel)}</b></span><small>${esc(scheduleTitle)}</small><small class="attendance-session-window">${esc(attendanceWindowText(x))}</small></span>${ui.group==='upcoming'?`<span class="attendance-hub-status status-upcoming attendance-state-icon-only" title="${esc(ui.label)}" aria-label="${esc(ui.label)}"><span class="material-symbols-rounded">schedule</span></span>`:`<span class="attendance-hub-status status-${ui.group}"><span class="material-symbols-rounded">${ui.icon}</span>${esc(ui.label)}</span>`}${canInspect?'<span class="material-symbols-rounded row-chevron">chevron_right</span>':''}</${canInspect?'button':'div'}>${isOpen&&ui.group==='waiting'&&!p.can_manage_attendance?`<div class="academic-row-actions compact-actions"><button type="button" class="session-action-btn" data-attendance-id="${esc(x.attendance_id)}"><span class="material-symbols-rounded">how_to_reg</span><span>Absensi</span></button></div>`:''}</article>`;}).join('')}</div></section>`;
  }).join('');
  const roomCopy=p.can_manage_attendance?'Mata pelajaran/kegiatan → sesi. Buka sesi untuk edit waktu, menyelesaikan, mengoreksi peserta, atau menghapus sesi jika kamu Owner.':'Mata pelajaran/kegiatan → sesi. Lihat status absensi, waktu mulai/selesai, dan sesi yang belum dibuka atau sudah ditutup.';
  return `<section class="panel class-academic-panel attendance-grouped-room attendance-room-v673"><div class="panel-head"><div><div class="panel-title">Absensi</div><p class="panel-copy">${roomCopy}</p></div>${p.can_manage_attendance?roomCreateButton('create-attendance','Buat Sesi Absensi'):''}</div><div class="attendance-course-list">${groupRows||'<div class="search-empty">Belum ada sesi absensi.</div>'}</div></section>`;
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
  document.querySelectorAll('[data-schedule-group-toggle]').forEach(btn=>btn.onclick=()=>{const card=btn.closest('[data-schedule-group]');const panel=card?.querySelector('.schedule-session-list');const opening=panel?.hidden!==false;if(panel)panel.hidden=!opening;card?.classList.toggle('open',opening);btn.setAttribute('aria-expanded',String(opening));});
  document.querySelectorAll('[data-attendance-group-toggle]').forEach(btn=>btn.onclick=()=>{const panel=btn.parentElement?.querySelector('.attendance-course-sessions');const opening=panel?.hidden!==false;if(panel)panel.hidden=!opening;btn.parentElement?.classList.toggle('open',opening);btn.setAttribute('aria-expanded',String(opening));});
}

const academicAttachmentQueues = new Map();
function attachmentQueueKey(file){return `${file.name}::${file.size}::${file.lastModified||0}`;}
function getAttachmentQueue(id){return academicAttachmentQueues.get(id)||[];}
function clearAttachmentQueue(id){academicAttachmentQueues.delete(id);}
function renderAttachmentQueue(id){
  const note=document.querySelector(`[data-upload-note-for="${id}"]`);if(!note)return;
  const files=getAttachmentQueue(id);
  note.innerHTML=files.length?`<div class="attachment-queue">${files.map((f,i)=>`<div class="attachment-queue-row"><span class="material-symbols-rounded">${String(f.type||'').startsWith('image/')?'image':String(f.type||'').startsWith('video/')?'movie':'attach_file'}</span><span><strong>${esc(f.name)}</strong><small>${esc(formatBytes(f.size))} · Menunggu upload</small></span><button type="button" class="icon-btn mini" data-remove-queued-file="${i}" data-queue-id="${id}" title="Hapus lampiran"><span class="material-symbols-rounded">close</span></button></div>`).join('')}</div>`:'Belum ada file dipilih.';
  note.querySelectorAll('[data-remove-queued-file]').forEach(btn=>btn.onclick=()=>{const q=[...getAttachmentQueue(id)];q.splice(Number(btn.dataset.removeQueuedFile),1);academicAttachmentQueues.set(id,q);renderAttachmentQueue(id);});
}
async function uploadAcademicFiles(files,module,statusEl){
  const ids=[]; const list=[...(files||[])].slice(0,12);
  for(let i=0;i<list.length;i++){
    const file=list[i];
    if(statusEl)statusEl.textContent=`Mengupload ${i+1}/${list.length}: ${file.name}`;
    let dataUrl='',filename=file.name;
    if(String(file.type||'').startsWith('image/')){const processed=await compressImageFile(file,{maxEdge:1600,targetBytes:700000});dataUrl=processed.dataUrl;filename=processed.name;}
    else { if(file.size>4000000)throw new Error(`${file.name} terlalu besar. Maksimal 4 MB per file untuk upload langsung. Gunakan link Drive/YouTube untuk file besar.`); dataUrl=await fileToDataUrl(file); }
    const up=await api('uploadAcademicAttachment',{class_id:state.selectedClassId,module,filename,data_url:dataUrl});
    if(up?.file?.file_id)ids.push(up.file.file_id);
  }
  return ids;
}
function attachmentPickerHtml(id,label='Lampiran'){
  return `<div class="field attachment-picker-field"><label>${esc(label)}</label><input id="${id}" type="file" multiple class="control" accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"><div class="form-help">Bisa pilih berkali-kali hingga 12 lampiran. Foto dikompresi; file/video langsung maksimal 4 MB. File besar gunakan link Drive/YouTube.</div><div class="compact-upload-note" data-upload-note-for="${id}">Belum ada file dipilih.</div></div>`;
}
function bindAttachmentPicker(id){
  const input=document.getElementById(id);if(!input)return;clearAttachmentQueue(id);renderAttachmentQueue(id);
  input.onchange=()=>{const existing=[...getAttachmentQueue(id)],seen=new Set(existing.map(attachmentQueueKey));for(const f of [...input.files]){if(existing.length>=12)break;const key=attachmentQueueKey(f);if(!seen.has(key)){existing.push(f);seen.add(key);}}academicAttachmentQueues.set(id,existing);input.value='';renderAttachmentQueue(id);};
}
function referenceUrlsFromForm(form){return String(form?.reference_urls?.value||form?.reference_url?.value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,12);}

function openCreateAnnouncement(){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Pengumuman</div><h2>Buat Pengumuman</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="announcement-create-form"><div class="form-grid"><div class="field"><label>Judul</label><input name="title" class="control" required minlength="3"></div><div class="field"><label>Prioritas</label><select name="priority" class="control"><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option><option value="LOW">Low</option></select></div></div><div class="field"><label>Isi</label><textarea name="body" class="control" rows="4" required></textarea></div><div class="field"><label>Link / Video</label><textarea name="reference_urls" class="control" rows="2" placeholder="Satu link per baris: YouTube, Drive, website, dll"></textarea></div>${attachmentPickerHtml('announcement-files','Foto / Video / PDF / File')} ${formFooter('Publikasikan')}</form>`);
  bindAttachmentPicker('announcement-files');
  const form=document.getElementById('announcement-create-form');form.onsubmit=async e=>{e.preventDefault();const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status'),old=btn.innerHTML;if(btn.disabled)return;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';try{const files=getAttachmentQueue('announcement-files');const fileIds=await uploadAcademicFiles(files,'ANNOUNCEMENT',status);const payload=Object.fromEntries(new FormData(form));payload.class_id=state.selectedClassId;payload.attachment_file_ids=fileIds;payload.reference_urls=referenceUrlsFromForm(form);const result=await api('createAnnouncement',payload,{timeout:30000,timeoutMessage:'Pengumuman masih diproses. Jangan kirim ulang; cek daftar Pengumuman beberapa saat lagi.'});mergeAcademicMutation('announcements',result);closeModal();toast('Pengumuman dipublikasikan.');refreshAcademicSilently();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}};
}
function attachmentIconName(a){const mime=String(a?.mime_type||'');if(a?.type==='LINK')return'link';if(mime.startsWith('image/'))return'image';if(mime.startsWith('video/'))return'movie';if(mime.includes('spreadsheet')||mime.includes('excel'))return'table_view';if(mime.includes('pdf'))return'picture_as_pdf';return'description';}
function attachmentListHtml(items=[]){if(!items.length)return '';return `<div class="material-download-section"><strong>Lampiran (${items.length})</strong><div class="material-download-list">${items.map((a,i)=>`<button type="button" class="material-download-row" data-preview-academic-file data-preview-url="${esc(a.preview_url||a.url||'')}" data-download-url="${esc(a.download_url||a.url||'')}" data-mime="${esc(a.mime_type||'')}" data-filename="${esc(a.filename||`Lampiran ${i+1}`)}" data-file-type="${esc(a.type||'FILE')}"><span class="material-symbols-rounded">${attachmentIconName(a)}</span><span><strong>${esc(a.filename||`Lampiran ${i+1}`)}</strong><small>${a.type==='LINK'?'Buka tautan':'Preview di KelasKu'}</small></span><span class="material-symbols-rounded">visibility</span></button>`).join('')}</div></div>`;}
function bindAcademicFilePreview(root=document){root.querySelectorAll?.('[data-preview-academic-file]').forEach(btn=>btn.onclick=()=>openAcademicFilePreview({preview_url:btn.dataset.previewUrl,download_url:btn.dataset.downloadUrl,mime_type:btn.dataset.mime,filename:btn.dataset.filename,type:btn.dataset.fileType}));}
function openAcademicFilePreview(file){
  if(String(file?.type||'').toUpperCase()==='LINK'){openExternal(file.preview_url||file.download_url);return;}
  document.getElementById('academic-file-preview-overlay')?.remove();
  const overlay=document.createElement('div');overlay.id='academic-file-preview-overlay';overlay.className='overlay academic-file-preview-overlay';
  const mime=String(file?.mime_type||'');const url=file?.preview_url||file?.download_url||'';const name=file?.filename||'Lampiran';
  const viewer=mime.startsWith('image/')?`<div class="academic-image-viewer"><img src="${esc(url)}" alt="${esc(name)}"></div>`:mime.startsWith('video/')?`<video class="academic-video-viewer" controls src="${esc(url)}"></video>`:`<iframe class="academic-doc-viewer" src="${esc(url)}" title="${esc(name)}" loading="lazy"></iframe>`;
  overlay.innerHTML=`<div class="modal glass academic-file-preview-card"><div class="modal-head"><div><div class="eyebrow">PREVIEW LAMPIRAN</div><h2>${esc(name)}</h2></div><button class="icon-btn mini" data-file-preview-close>${svg('i-close')}</button></div>${viewer}<div class="modal-actions"><a class="btn btn-secondary" href="${esc(file.download_url||url)}" target="_blank" rel="noopener noreferrer">${svg('i-download')} Download</a></div></div>`;
  document.body.appendChild(overlay);overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};overlay.querySelector('[data-file-preview-close]')?.addEventListener('click',()=>overlay.remove());
}

function openAnnouncementDetail(id,data){
  const x=(data.announcements||[]).find(v=>String(v.announcement_id)===String(id));if(!x)return;
  const can=data.permissions?.can_publish;
  showModal(`<div class="modal-head announcement-detail-head"><div><div class="eyebrow">PENGUMUMAN • ${esc(shortDateTime(x.published_at))}</div><div class="modal-title-badge"><h2>${esc(x.title)}</h2><span class="status-badge status-${String(x.priority||'normal').toLowerCase()}">${esc(x.priority||'NORMAL')}</span></div></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>${x.updated_at&&x.updated_at!==x.published_at?'<div class="detail-badge-row"><span class="soft-chip">Diperbarui</span></div>':''}<div class="academic-detail-body">${nl2br(x.body||'')}</div>${attachmentListHtml(x.attachments||[])}${can?`<div class="modal-actions"><button type="button" id="detail-edit-announcement" class="btn btn-secondary"><span class="material-symbols-rounded">edit</span> Edit</button><button type="button" id="detail-delete-announcement" class="btn btn-danger">${svg('i-close')} Hapus</button></div>`:''}`);
  bindAcademicFilePreview(document.getElementById('phase-modal')||document);document.getElementById('detail-edit-announcement')?.addEventListener('click',()=>openEditAnnouncement(id,data));
  document.getElementById('detail-delete-announcement')?.addEventListener('click',async()=>{closeModal();const btn=document.querySelector(`[data-archive-id="${CSS.escape(id)}"]`);await archiveItem('ANNOUNCEMENT',id,btn);});
}
function openEditAnnouncement(id,data){
  const x=(data.announcements||[]).find(v=>String(v.announcement_id)===String(id));if(!x)return;
  showModal(`<div class="modal-head"><div><div class="eyebrow">Pengumuman</div><h2>Edit Pengumuman</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-edit-announcement"><div class="field"><label>Judul</label><input name="title" class="control" value="${esc(x.title)}" required minlength="3"></div><div class="field"><label>Isi</label><textarea name="body" class="control" rows="6" required>${esc(x.body||'')}</textarea></div><div class="field"><label>Prioritas</label><select name="priority" class="control">${['NORMAL','HIGH','URGENT','LOW'].map(v=>`<option value="${v}" ${x.priority===v?'selected':''}>${v}</option>`).join('')}</select></div>${formFooter('Simpan Perubahan')}</form>`);
  const form=document.getElementById('academic-edit-announcement');form.onsubmit=async e=>{e.preventDefault();const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status');btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';try{await api('updateAnnouncement',{announcement_id:id,...Object.fromEntries(new FormData(form))});closeModal();toast('Pengumuman diperbarui.');await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;}};
}

function openCreateSchedule(){
  const startDate=new Date();
  startDate.setSeconds(0,0);
  const startLocal=toLocalInput(startDate);
  const endLocal=toLocalInput(new Date(startDate.getTime()+2*60*60*1000));
  showModal(`<div class="modal-head"><div><div class="eyebrow">Jadwal + Sesi</div><h2>Tambah Jadwal</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-create-form"><div class="form-grid"><div class="field"><label>Judul / Mata Kuliah</label><input name="title" class="control" required minlength="3" placeholder="Contoh: Sejarah Peradaban Islam"></div><div class="field"><label>Lokasi / Link Zoom</label><input name="location" class="control" placeholder="Ruang 3 atau https://zoom.us/..."></div></div><div class="field"><label>Deskripsi</label><textarea name="description" class="control" rows="2"></textarea></div><div class="form-grid"><div class="field"><label>Mulai sesi pertama</label><input name="start_at" type="datetime-local" class="control" value="${esc(startLocal)}" required></div><div class="field"><label>Selesai</label><input name="end_at" type="datetime-local" class="control" value="${esc(endLocal)}" required></div></div><div class="schedule-repeat-box"><div class="form-grid"><div class="field"><label>Pengulangan</label><select name="recurrence_frequency" id="schedule-repeat" class="control"><option value="NONE">Tidak berulang</option><option value="WEEKLY">Setiap minggu</option><option value="DAILY">Setiap hari</option><option value="MONTHLY">Setiap bulan</option></select></div><div class="field"><label>Mulai dari sesi</label><input name="session_start" type="number" min="1" max="99" value="1" class="control"></div></div><div class="repeat-field hidden"><div class="field"><label>Total sesi</label><input name="recurrence_count" type="number" min="1" max="32" value="16" class="control"></div></div></div><div class="field"><label>Pembuatan Absensi</label><select name="attendance_mode" id="schedule-attendance-mode" class="control"><option value="MANUAL">Tidak otomatis — buat absensi bila diperlukan</option><option value="AUTO">Otomatis — buat absensi setiap sesi</option></select></div><div id="schedule-auto-settings" class="schedule-auto-settings hidden"><div class="form-grid"><div class="field"><label>Cara mengisi</label><select name="attendance_entry_mode" class="control"><option value="SELF">Mandiri oleh mahasiswa</option><option value="HYBRID">Hybrid — mahasiswa + pengelola</option><option value="MANUAL">Manual oleh pengelola</option></select></div><div class="field"><label>Media Hadir</label><div class="choice-inline"><label><input type="checkbox" name="attendance_channel" value="ZOOM" checked> Zoom</label><label><input type="checkbox" name="attendance_channel" value="YOUTUBE" checked> YouTube</label><label><input type="checkbox" name="attendance_channel" value="OFFLINE"> Offline</label></div></div></div><div class="form-grid"><div class="field"><label>Buka sebelum jadwal</label><div class="input-suffix"><input name="attendance_open_before" type="number" min="0" max="240" value="10" class="control"><span>menit</span></div></div><div class="field"><label>Tutup setelah jadwal</label><div class="input-suffix"><input name="attendance_close_after" type="number" min="0" max="720" value="30" class="control"><span>menit</span></div></div></div><label class="setting-card compact-setting"><span class="setting-card-copy"><strong>Catat keterlambatan</strong><small>Hadir tetap Hadir, tetapi diberi atribut Terlambat.</small></span><span class="switch"><input name="attendance_lateness_enabled" id="attendance-lateness-enabled" type="checkbox"><span></span></span></label><div id="attendance-late-minutes" class="field hidden"><label>Dianggap terlambat setelah</label><div class="input-suffix"><input name="attendance_late_after_minutes" type="number" min="0" max="240" value="15" class="control"><span>menit dari mulai jadwal</span></div></div><div class="choice-inline attendance-status-options"><label><input type="checkbox" name="attendance_sick_enabled" checked> Sakit</label><label><input type="checkbox" name="attendance_permit_enabled" checked> Izin</label></div><div class="form-help">Status tetap Hadir/Sakit/Izin/Alpa. Zoom/YouTube adalah media kehadiran, bukan pengganti status.</div></div>${formFooter('Simpan Jadwal')}</form>`);
  const mode=document.getElementById('schedule-attendance-mode'),auto=document.getElementById('schedule-auto-settings'),repeat=document.getElementById('schedule-repeat'),late=document.getElementById('attendance-lateness-enabled');
  mode.onchange=()=>{auto.classList.toggle('hidden',mode.value!=='AUTO');const count=document.querySelector('[name="recurrence_count"]');if(count){count.max=mode.value==='AUTO'?'20':'32';if(mode.value==='AUTO'&&Number(count.value)>20)count.value='20';}};
  repeat.onchange=()=>document.querySelectorAll('.repeat-field').forEach(el=>el.classList.toggle('hidden',repeat.value==='NONE'));
  late.onchange=()=>document.getElementById('attendance-late-minutes').classList.toggle('hidden',!late.checked);
  bindCreateForm('createSchedule');
}

function openScheduleDetail(id,data){
  const decorated=decorateScheduleSessions(data.schedules||[]);
  const x=decorated.find(v=>String(v.schedule_id)===String(id));if(!x)return;const can=data.permissions?.can_manage_schedule||data.permissions?.can_manage_academic;
  const sessionBadge=x._sessionNo?`<span class="soft-chip">Sesi ${String(x._sessionNo).padStart(2,'0')}${x._sessionTotal>1?`/${x._sessionTotal}`:''}</span>`:'';
  const meeting=isWebUrl(x.location);const locationText=meeting?'Pertemuan online':(x.location||'-');
  const attendance=(data.attendance_sessions||[]).find(a=>String(a.source_schedule_id||'')===String(x.schedule_id));
  const attendanceWindow=String(attendance?.window_status||'').toUpperCase();
  const attendanceOpen=Boolean(attendance)&&attendanceWindow==='OPEN';
  const attendanceInfo=attendanceOpen
    ? `<div class="schedule-detail-action-grid"><button type="button" id="schedule-open-attendance" class="btn btn-primary schedule-detail-btn"><span class="material-symbols-rounded">how_to_reg</span> Buka Absensi</button>${attendance.public_token?`<button type="button" id="schedule-copy-attendance" class="btn btn-secondary schedule-detail-btn">${svg('i-copy')} Salin Link</button>`:''}${meeting?`<button type="button" id="schedule-meeting-link" class="btn btn-secondary schedule-detail-btn"><span class="material-symbols-rounded">videocam</span> Zoom / Meet</button>`:''}</div>`
    : attendance ? `<div class="attendance-availability-note"><span class="material-symbols-rounded">schedule</span><div><strong>${attendanceWindow==='UPCOMING'?'Absensi belum dibuka':'Absensi tidak aktif'}</strong><small>${attendanceWindow==='UPCOMING'?'Tombol absensi dan salin link akan tersedia saat sesi aktif.':'Sesi absensi sudah tidak dapat diakses.'}</small></div></div>${meeting?`<div class="schedule-detail-action-grid single"><button type="button" id="schedule-meeting-link" class="btn btn-secondary schedule-detail-btn"><span class="material-symbols-rounded">videocam</span> Zoom / Meet</button></div>`:''}`
    : meeting?`<div class="schedule-detail-action-grid single"><button type="button" id="schedule-meeting-link" class="btn btn-secondary schedule-detail-btn"><span class="material-symbols-rounded">videocam</span> Zoom / Meet</button></div>`:'';
  showModal(`<div class="modal-head"><div><div class="eyebrow">JADWAL • ${esc(shortDateTime(x.start_at))}</div><h2>${esc(x.title)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="detail-badge-row compact-detail-badges">${sessionBadge}${scheduleStateBadge(x)}${x.recurrence_group_id?'<span class="soft-chip"><span class="material-symbols-rounded recurring-inline-icon">repeat</span> Berulang</span>':''}${String(x.attendance_mode)==='AUTO'?'<span class="soft-chip">Absensi Auto</span>':''}</div><div class="detail-list academic-detail-list compact-detail-list">${detail('Mulai',shortDateTime(x.start_at))}${detail('Selesai',x.end_at?shortDateTime(x.end_at):'-')}${detail('Lokasi',locationText)}${x.change_note?detail('Catatan perubahan',x.change_note):''}</div>${attendanceInfo}${x.description?`<div class="academic-detail-body">${nl2br(x.description)}</div>`:''}${can&&String(x.schedule_state)!=='CANCELLED'?`<div class="modal-actions compact-modal-actions schedule-detail-actions"><button type="button" id="detail-edit-schedule" class="btn btn-secondary schedule-detail-btn"><span class="material-symbols-rounded">edit_calendar</span> Edit</button>${x.recurrence_group_id?`<button type="button" id="detail-add-schedule" class="btn btn-secondary schedule-detail-btn"><span class="material-symbols-rounded">add_circle</span> Tambah Sesi</button><button type="button" id="detail-delete-schedule" class="btn btn-secondary schedule-detail-btn danger-outline"><span class="material-symbols-rounded">delete</span> Hapus Sesi</button>`:''}<button type="button" id="detail-cancel-schedule" class="btn btn-danger schedule-detail-btn"><span class="material-symbols-rounded">event_busy</span> Batalkan</button></div>`:String(x.schedule_state)==='CANCELLED'?'<div class="alert info">Jadwal dibatalkan dan dikunci. Koreksi hanya melalui pengelola data.</div>':''}`);
  document.getElementById('schedule-open-attendance')?.addEventListener('click',()=>{closeModal();openAttendance(attendance.attendance_id);});
  document.getElementById('schedule-copy-attendance')?.addEventListener('click',()=>copyAttendanceLink(attendance.public_token));
  document.getElementById('schedule-meeting-link')?.addEventListener('click',()=>openExternal(x.location));
  document.getElementById('detail-edit-schedule')?.addEventListener('click',()=>openEditSchedule(id,data));
  document.getElementById('detail-cancel-schedule')?.addEventListener('click',()=>openCancelSchedule(id,data));
  document.getElementById('detail-add-schedule')?.addEventListener('click',()=>openAppendSchedule(id,data));
  document.getElementById('detail-delete-schedule')?.addEventListener('click',()=>openDeleteScheduleSession(id,data));
}

function openEditSchedule(id,data){
  const decorated=decorateScheduleSessions(data.schedules||[]);
  const x=decorated.find(v=>String(v.schedule_id)===String(id));if(!x)return;if(String(x.schedule_state||'').toUpperCase()==='CANCELLED'){toast('Jadwal yang sudah dibatalkan dikunci.');return;}
  const sessionLabel=x._sessionNo?`Sesi ${String(x._sessionNo).padStart(2,'0')}`:'jadwal ini';
  showModal(`<div class="modal-head"><div><div class="eyebrow">Jadwal • ${esc(sessionLabel)}</div><h2>Edit Jadwal</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-edit-schedule"><div class="field"><label>Judul</label><input name="title" class="control" value="${esc(x.title)}" required></div><div class="field"><label>Deskripsi</label><textarea name="description" rows="3" class="control">${esc(x.description||'')}</textarea></div><div class="form-grid"><div class="field"><label>Mulai</label><input name="start_at" type="datetime-local" class="control" value="${esc(toLocalInput(new Date(x.start_at)))}" required></div><div class="field"><label>Selesai</label><input name="end_at" type="datetime-local" class="control" value="${x.end_at?esc(toLocalInput(new Date(x.end_at))):''}"></div></div><div class="field"><label>Lokasi / Link Zoom atau Meet</label><input name="location" class="control" value="${esc(x.location||'')}"></div><div class="field"><label>Catatan perubahan</label><input name="change_note" class="control" placeholder="Contoh: ${esc(sessionLabel)} dimajukan 30 menit"></div>${x.recurrence_group_id?`<div class="field"><label>Terapkan perubahan</label><select name="scope" class="control"><option value="SINGLE">Hanya ${esc(sessionLabel)}</option><option value="FUTURE_SERIES">${esc(sessionLabel)} dan sesi berikutnya</option></select><div class="form-help">Nomor sesi tidak berubah. Tanggal, jam, lokasi/link meeting, judul, dan deskripsi dapat direvisi fleksibel.</div></div>`:'<input type="hidden" name="scope" value="SINGLE">'}${formFooter('Simpan Perubahan')}</form>`);
  const form=document.getElementById('academic-edit-schedule');form.onsubmit=async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(form));payload.schedule_id=id;['start_at','end_at'].forEach(k=>{if(payload[k])payload[k]=new Date(payload[k]).toISOString();});const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status');btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';try{await api('updateSchedule',payload);closeModal();toast('Jadwal sesi diperbarui dan diberi badge perubahan.');await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;}};
}

function openCancelSchedule(id,data){
  const x=(data.schedules||[]).find(v=>String(v.schedule_id)===String(id));if(!x)return;
  showModal(`<div class="modal-head"><div><div class="eyebrow">Pembatalan</div><h2>Batalkan Jadwal</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-cancel-schedule"><div class="alert warning">Jadwal tetap terlihat dengan badge <b>Dibatalkan</b> agar riwayat tidak hilang.</div><div class="field"><label>Alasan / catatan</label><textarea name="change_note" rows="3" class="control" required placeholder="Contoh: Dosen berhalangan hadir"></textarea></div>${x.recurrence_group_id?`<div class="field"><label>Batalkan</label><select name="scope" class="control"><option value="SINGLE">Hanya jadwal ini</option><option value="FUTURE_SERIES">Jadwal ini dan berikutnya</option></select></div>`:'<input type="hidden" name="scope" value="SINGLE">'}${formFooter('Batalkan Jadwal')}</form>`);
  const form=document.getElementById('academic-cancel-schedule');form.onsubmit=async e=>{e.preventDefault();const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status');btn.disabled=true;try{await api('cancelSchedule',{schedule_id:id,...Object.fromEntries(new FormData(form))});closeModal();toast('Jadwal dibatalkan.');await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;}};
}

function inferredNextScheduleWindow(x){
  const rule=scheduleRuleObject(x)||{};
  const frequency=String(rule.frequency||'WEEKLY').toUpperCase();
  const interval=Math.max(1,Number(rule.interval||1)||1);
  const start=new Date(x.start_at);
  const end=x.end_at?new Date(x.end_at):null;
  const nextStart=new Date(start);
  if(frequency==='DAILY') nextStart.setDate(nextStart.getDate()+interval);
  else if(frequency==='MONTHLY') nextStart.setMonth(nextStart.getMonth()+interval);
  else nextStart.setDate(nextStart.getDate()+(7*interval));
  const duration=end?Math.max(0,end.getTime()-start.getTime()):0;
  return {start:nextStart,end:duration?new Date(nextStart.getTime()+duration):null};
}

function openAppendSchedule(id,data){
  const decorated=decorateScheduleSessions(data.schedules||[]);
  const x=decorated.find(v=>String(v.schedule_id)===String(id)); if(!x)return;
  const guess=inferredNextScheduleWindow(x);
  const current=x._sessionNo?`Sesi ${String(x._sessionNo).padStart(2,'0')}`:'jadwal ini';
  showModal(`<div class="modal-head"><div><div class="eyebrow">Jadwal • Seri</div><h2>Tambah Sesi</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-append-schedule"><div class="alert info">Sesi baru tetap masuk ke seri yang sama. Nomor sesi akan dirapikan otomatis.</div><div class="field"><label>Posisi</label><select name="placement" class="control"><option value="AFTER">Setelah ${esc(current)}</option><option value="END">Di akhir seri</option></select></div><div class="field"><label>Judul</label><input name="title" class="control" value="${esc(x.title)}" required></div><div class="form-grid"><div class="field"><label>Mulai</label><input name="start_at" type="datetime-local" class="control" value="${esc(toLocalInput(guess.start))}" required></div><div class="field"><label>Selesai</label><input name="end_at" type="datetime-local" class="control" value="${guess.end?esc(toLocalInput(guess.end)):''}"></div></div><div class="field"><label>Lokasi / Link Zoom atau Meet</label><input name="location" class="control" value="${esc(x.location||'')}"></div><div class="field"><label>Catatan</label><input name="change_note" class="control" placeholder="Contoh: Sesi tambahan / pengganti"></div>${formFooter('Tambah Sesi')}</form>`);
  const form=document.getElementById('academic-append-schedule');
  form.onsubmit=async e=>{e.preventDefault();const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status'),old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';try{const payload=Object.fromEntries(new FormData(form));payload.schedule_id=id;payload.after_schedule_id=payload.placement==='END'?'':id;delete payload.placement;['start_at','end_at'].forEach(k=>{if(payload[k])payload[k]=new Date(payload[k]).toISOString();});await api('appendScheduleSession',payload);closeModal();toast('Sesi berhasil ditambahkan ke seri.');await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}};
}

function openDeleteScheduleSession(id,data){
  const decorated=decorateScheduleSessions(data.schedules||[]);
  const x=decorated.find(v=>String(v.schedule_id)===String(id)); if(!x)return;
  const label=x._sessionNo?`Sesi ${String(x._sessionNo).padStart(2,'0')}`:'Sesi ini';
  showModal(`<div class="modal-head"><div><div class="eyebrow">Jadwal • Seri</div><h2>Hapus ${esc(label)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-delete-schedule"><div class="alert warning">Sesi diarsipkan, bukan dihapus permanen. Absensi otomatis terkait ikut dinonaktifkan dan histori lama tetap tersimpan.</div><div class="field"><label>Catatan</label><textarea name="change_note" class="control" rows="3" placeholder="Opsional. Contoh: Semester hanya 9 pertemuan."></textarea></div>${formFooter('Hapus Sesi')}</form>`);
  const form=document.getElementById('academic-delete-schedule');
  form.onsubmit=async e=>{e.preventDefault();const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status'),old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menghapus…</span>';try{await api('deleteScheduleSession',{schedule_id:id,...Object.fromEntries(new FormData(form))});closeModal();toast('Sesi dihapus dari seri dan nomor sesi dirapikan.');await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}};
}

function openCreateTask(){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Tugas</div><h2>Buat Tugas</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="task-create-form"><div class="form-grid"><div class="field"><label>Judul</label><input name="title" class="control" required minlength="3"></div><div class="field"><label>Deadline</label><input name="deadline" type="datetime-local" class="control"></div></div><div class="field"><label>Instruksi</label><textarea name="description" class="control" rows="3"></textarea></div><div class="form-grid"><div class="field"><label>Mode Pengumpulan</label><select name="submission_mode" class="control"><option value="TEXT_LINK">Teks atau Link</option><option value="TEXT">Teks</option><option value="LINK">Link</option><option value="NONE">Tidak melalui KelasKu</option></select></div><div class="field"><label>Nilai Maksimum</label><input name="max_score" type="number" min="0" max="1000" value="100" class="control"></div></div><div class="field"><label>Link pendukung</label><textarea name="reference_urls" class="control" rows="2" placeholder="Satu link per baris"></textarea></div>${attachmentPickerHtml('task-files','Lampiran tugas (foto / video / PDF / file)')}<label class="setting-card compact-setting"><span class="setting-card-copy"><strong>Izinkan terlambat</strong><small>Status pengumpulan akan ditandai terlambat.</small></span><span class="switch"><input name="allow_late" type="checkbox" checked><span></span></span></label>${formFooter('Terbitkan Tugas')}</form>`);
  bindAttachmentPicker('task-files');const form=document.getElementById('task-create-form');form.onsubmit=async e=>{e.preventDefault();const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status'),old=btn.innerHTML;if(btn.disabled)return;btn.disabled=true;try{const fileIds=await uploadAcademicFiles(getAttachmentQueue('task-files'),'TASK',status);const payload=Object.fromEntries(new FormData(form));payload.class_id=state.selectedClassId;payload.allow_late=form.allow_late.checked;payload.attachment_file_ids=fileIds;payload.reference_urls=referenceUrlsFromForm(form);if(payload.deadline)payload.deadline=new Date(payload.deadline).toISOString();const result=await api('createTask',payload,{timeout:30000,timeoutMessage:'Tugas masih diproses. Jangan kirim ulang; cek daftar Tugas beberapa saat lagi.'});mergeAcademicMutation('tasks',result);closeModal();toast('Tugas diterbitkan.');refreshAcademicSilently();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}};
}

function openCreateMaterial(){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Materi</div><h2>Tambah Materi</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="material-create-form"><div class="form-grid"><div class="field"><label>Judul</label><input name="title" class="control" required minlength="3"></div><div class="field"><label>Topik / Pertemuan</label><div class="inline-two-controls"><input name="topic" class="control" placeholder="Topik"><input name="meeting_no" class="control" placeholder="01"></div></div></div><div class="field"><label>Deskripsi / Catatan</label><textarea name="description" class="control" rows="3"></textarea></div><input type="hidden" name="material_type" value="NOTE"><div class="field"><label>Link / Video / Drive</label><textarea name="reference_urls" class="control" rows="2" placeholder="Satu link per baris. Bisa YouTube, Drive, website, dll."></textarea></div>${attachmentPickerHtml('material-files','Foto / Video / PDF / File')} ${formFooter('Terbitkan Materi')}</form>`);
  bindAttachmentPicker('material-files');
  bindMaterialCreateForm();
}
async function bindMaterialCreateForm(){
  const form=document.getElementById('material-create-form');form.onsubmit=async e=>{e.preventDefault();const btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status');if(btn.disabled)return;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Mengupload…</span>';status.className='request-status progress';status.textContent='Menyiapkan lampiran…';try{const files=getAttachmentQueue('material-files'),fileIds=await uploadAcademicFiles(files,'MATERIAL',status);status.textContent='Lampiran selesai. Menyimpan materi…';const payload=Object.fromEntries(new FormData(form));payload.class_id=state.selectedClassId;payload.attachment_file_ids=fileIds;payload.reference_urls=referenceUrlsFromForm(form);const result=await api('createMaterial',payload,{timeout:30000,timeoutMessage:'Materi masih diproses. Jangan kirim ulang; cek daftar Materi beberapa saat lagi.'});mergeAcademicMutation('materials',result);closeModal();toast(`Materi tersimpan${fileIds.length?` dengan ${fileIds.length} file`:''}.`);refreshAcademicSilently();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML='Terbitkan Materi';}};
}
function openMaterialDetail(id,data){
  const x=(data.materials||[]).find(v=>String(v.material_id)===String(id));if(!x)return;const attachments=x.attachments||[];
  showModal(`<div class="modal-head"><div><div class="eyebrow">MATERI • ${esc(shortDate(x.published_at))}</div><h2>${esc(x.title)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="detail-badge-row">${x.topic?`<span class="soft-chip">${esc(x.topic)}</span>`:''}${x.meeting_no?`<span class="soft-chip">Pertemuan ${esc(x.meeting_no)}</span>`:''}</div>${x.description?`<div class="academic-detail-body">${nl2br(x.description)}</div>`:''}${x.url?`<button type="button" id="material-detail-url" class="btn btn-secondary btn-block">${svg('i-link')} Buka Tautan Materi</button>`:''}${attachmentListHtml(attachments)}`);
  document.getElementById('material-detail-url')?.addEventListener('click',()=>openExternal(x.url));bindAcademicFilePreview(document.getElementById('phase-modal')||document);
}

function openCreateAttendance(){
  const startDate=new Date();
  const nowLocal=toLocalInput(startDate);
  const endLocal=toLocalInput(new Date(startDate.getTime()+2*60*60*1000));
  showModal(`<div class="modal-head"><div><div class="eyebrow">Absensi</div><h2>Buat Sesi Absensi</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-create-form"><div class="field"><label>Judul Pertemuan</label><input name="title" class="control" placeholder="Pertemuan 01 — Pengantar Ekonomi" required minlength="3"></div><div class="form-grid"><div class="field"><label>Mulai</label><input name="start_at" type="datetime-local" class="control" value="${esc(nowLocal)}" required></div><div class="field"><label>Selesai</label><input name="end_at" type="datetime-local" class="control" value="${esc(endLocal)}" required></div></div><div class="form-grid"><div class="field"><label>Metode Presensi</label><select name="entry_mode" class="control"><option value="SELF">Mandiri</option><option value="HYBRID">Hybrid</option><option value="MANUAL">Manual Pengelola</option></select></div><div class="field"><label>Media Hadir</label><div class="choice-inline"><label><input type="checkbox" name="attendance_channel" value="ZOOM" checked> Zoom</label><label><input type="checkbox" name="attendance_channel" value="YOUTUBE" checked> YouTube</label><label><input type="checkbox" name="attendance_channel" value="OFFLINE"> Offline</label></div></div></div><label class="setting-card compact-setting"><span class="setting-card-copy"><strong>Catat keterlambatan</strong><small>Opsional. Jika mati, Hadir tidak dibedakan tepat waktu/terlambat.</small></span><span class="switch"><input name="lateness_enabled" id="manual-lateness-enabled" type="checkbox"><span></span></span></label><div id="manual-late-minutes" class="field hidden"><label>Terlambat setelah</label><div class="input-suffix"><input name="late_after_minutes" type="number" min="0" max="240" value="15" class="control"><span>menit dari mulai</span></div></div><div class="choice-inline attendance-status-options"><label><input type="checkbox" name="sick_enabled" checked> Boleh Sakit</label><label><input type="checkbox" name="permit_enabled" checked> Boleh Izin</label></div><div class="form-help">Mahasiswa memilih status berdasarkan kejujuran. Jika Hadir, ia memilih media Zoom/YouTube/Offline yang tersedia.</div>${formFooter('Buat Sesi')}</form>`);
  const late=document.getElementById('manual-lateness-enabled');late.onchange=()=>document.getElementById('manual-late-minutes').classList.toggle('hidden',!late.checked);bindCreateForm('createAttendanceSession');
}

function formFooter(label){return `<div id="academic-form-status" class="request-status"></div><button id="academic-form-submit" class="btn btn-primary btn-block" type="submit">${esc(label)}</button>`;}
function bindCreateForm(action){
  const formNode=document.getElementById('academic-create-form');
  if(!formNode)return;
  const requestKey=randomId(action==='createSchedule'?'SCH':'ACA',24);
  formNode.onsubmit=async e=>{
    e.preventDefault(); const form=e.currentTarget,btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status'),old=btn.innerHTML;
    if(btn.disabled)return;
    btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';
    status.className='request-status progress';
    status.textContent=action==='createSchedule'?'Membuat jadwal dan sesi absensi dalam satu proses…':'Menyimpan…';
    const payload=Object.fromEntries(new FormData(form)); payload.class_id=state.selectedClassId;
    if(form.allow_late) payload.allow_late=form.allow_late.checked;
    if(action==='createSchedule'){
      payload.client_request_key=requestKey;
      payload.attendance_channels=[...form.querySelectorAll('[name="attendance_channel"]:checked')].map(x=>x.value);
      payload.attendance_lateness_enabled=form.attendance_lateness_enabled?.checked===true;
      payload.attendance_sick_enabled=form.attendance_sick_enabled?.checked===true;
      payload.attendance_permit_enabled=form.attendance_permit_enabled?.checked===true;
    }
    if(action==='createAttendanceSession'){
      payload.attendance_channels=[...form.querySelectorAll('[name="attendance_channel"]:checked')].map(x=>x.value);
      payload.lateness_enabled=form.lateness_enabled?.checked===true;payload.sick_enabled=form.sick_enabled?.checked===true;payload.permit_enabled=form.permit_enabled?.checked===true;payload.self_checkin_enabled=payload.entry_mode!=='MANUAL';
    }
    ['start_at','end_at','deadline'].forEach(key=>{ if(payload[key]){const parsed=new Date(payload[key]);if(Number.isFinite(parsed.getTime()))payload[key]=parsed.toISOString();} });
    try{
      const result=await api(action,payload,{
        timeout:action==='createSchedule'?90000:30000,
        timeoutMessage:action==='createSchedule'?'Jadwal masih diproses server. Jangan klik Simpan lagi; tutup dialog lalu cek menu Jadwal beberapa saat lagi.':'Data masih diproses. Jangan kirim ulang; cek daftar beberapa saat lagi.',
        onSlow:()=>status.textContent=action==='createSchedule'?'Sedang membuat seluruh jadwal + absensi. Untuk seri banyak, proses dapat memerlukan beberapa detik…':'Server masih memproses…'
      });
      if(result?.processing){status.className='request-status progress';status.textContent='Jadwal sedang diproses. Jangan kirim ulang.';setTimeout(()=>{closeModal();refreshAcademicSilently();toast('Jadwal sedang diproses dan akan muncul otomatis.');},800);return;}
      if(action==='createSchedule'){
        mergeAcademicMutation('schedule',result);
        closeModal();
        toast(`${Number(result?.created_count||1)} jadwal${Number(result?.attendance_created_count||0)?` + ${Number(result.attendance_created_count)} sesi absensi`:''} berhasil dibuat.`);
        refreshAcademicSilently();
      } else if(action==='createAttendanceSession') {
        mergeAcademicMutation('attendance',result);
        closeModal();toast('Sesi absensi berhasil dibuat.');refreshAcademicSilently();
      } else {
        closeModal();toast('Data berhasil disimpan.');refreshAcademicSilently();
      }
    }catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}
  };
}

function mergeAcademicMutation(kind, result, classId = String(state.selectedClassId || '')) {
  const data = state.classAcademic?.[classId];
  if (!data || !result) return;
  const cfg = {
    schedule:['schedules','schedule_id'], announcements:['announcements','announcement_id'],
    tasks:['tasks','task_id'], materials:['materials','material_id'], attendance:['attendance_sessions','attendance_id']
  }[kind];
  if (!cfg) return;
  const [key,idKey]=cfg;
  const incoming = (result.items || (result.item ? [result.item] : [])).filter(Boolean);
  if (!incoming.length) return;
  const ids = new Set(incoming.map(x=>String(x[idKey]||'')));
  data[key] = [...incoming, ...(data[key]||[]).filter(x=>!ids.has(String(x[idKey]||'')))];
  if (kind === 'schedule' && Array.isArray(result.attendance_items) && result.attendance_items.length) {
    const attIds = new Set(result.attendance_items.map(x=>String(x.attendance_id||'')));
    data.attendance_sessions = [...result.attendance_items, ...(data.attendance_sessions||[]).filter(x=>!attIds.has(String(x.attendance_id||'')))];
  }
  state.classAcademicAt[classId]=Date.now();
  try {
    localStorage.setItem('kelasku_class_academic_cache',JSON.stringify(state.classAcademic));
    localStorage.setItem('kelasku_class_academic_cache_at',JSON.stringify(state.classAcademicAt));
  } catch {}
  if (String(state.selectedClassId)===classId && ['announcements','schedule','tasks','materials','attendance'].includes(activeTab)) drawAcademicTab(activeTab,data);
  invalidateAcademicClientCache(classId);
}

function refreshAcademicSilently(classId=String(state.selectedClassId||'')){
  markClassCacheStale('classAcademicAt','kelasku_class_academic_cache_at',classId);
  state.classAnalyticsAt[classId]=0;
  setTimeout(()=>loadClassAcademic(true,true).catch(()=>{}),60);
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
function attendanceLateMinutes(session={}){
  if(!session.lateness_enabled||!session.late_after_at||!session.start_at)return 15;
  const late=dateMs(session.late_after_at),start=dateMs(session.start_at);
  return late&&start?Math.max(0,Math.min(240,Math.round((late-start)/60000))):15;
}
function attendanceLocalInput(value){const d=new Date(value||'');return Number.isFinite(d.getTime())?toLocalInput(d):'';}
function attendanceSelfCheckPanel(session={},record=null,canSelf=false){
  const current=String(record?.attendance_status||'UNMARKED').toUpperCase();
  const marked=current!=='UNMARKED';
  if(marked){
    return `<section class="attendance-self-panel is-done"><div class="attendance-self-panel-head"><span class="material-symbols-rounded">verified</span><div><strong>Absensi Saya</strong><small>Sudah tercatat untuk sesi ini.</small></div></div><div class="attendance-self-result"><span class="soft-chip">${esc(attendanceStatusLabel(current))}</span>${record?.attendance_channel?`<span class="soft-chip">${esc(attendanceChannelLabel(record.attendance_channel))}</span>`:''}${record?.punctuality?`<span class="soft-chip">${esc(String(record.punctuality).toUpperCase()==='LATE'?'Terlambat':'Tepat waktu')}</span>`:''}</div></section>`;
  }
  if(!canSelf)return '';
  const channels=Array.isArray(session.channels)&&session.channels.length?session.channels:['ZOOM','YOUTUBE','OFFLINE'];
  const choices=[
    ['PRESENT','Hadir','person_check'],
    ...(session.sick_enabled===true?[['SICK','Sakit','sick']]:[]),
    ...(session.permit_enabled===true?[['PERMIT','Izin','assignment']]:[])
  ];
  return `<section class="attendance-self-panel"><div class="attendance-self-panel-head"><span class="material-symbols-rounded">how_to_reg</span><div><strong>Absensi Saya</strong><small>Pilih status dan media kehadiran tanpa keluar dari Ruang Kelas.</small></div></div>
    <div class="attendance-self-form room-self-check-form">
      <div class="attendance-form-label">Status kehadiran</div>
      <div class="attendance-status-choice">${choices.map(([v,l,i])=>`<button type="button" data-room-self-status="${v}" class="attendance-choice ${v==='PRESENT'?'active':''}" aria-pressed="${v==='PRESENT'?'true':'false'}"><span class="material-symbols-rounded attendance-choice-icon">${i}</span><span>${l}</span><span class="attendance-selected-mark material-symbols-rounded">check</span></button>`).join('')}</div>
      <div id="room-self-channel-wrap" class="attendance-channel-choice"><div class="attendance-form-label">Mengikuti melalui</div><div class="attendance-channel-row">${channels.map((ch,i)=>`<button type="button" data-room-self-channel="${esc(ch)}" class="attendance-channel ${i===0?'active':''}" aria-pressed="${i===0?'true':'false'}"><span>${esc(attendanceChannelLabel(ch))}</span><span class="attendance-selected-mark material-symbols-rounded">check</span></button>`).join('')}</div></div>
      <label class="field attendance-note-field"><span>Catatan <small>(opsional)</small></span><input id="room-self-note" class="control" placeholder="Catatan singkat"></label>
      <div id="room-self-status" class="request-status"></div>
      <button type="button" id="room-self-submit" class="btn btn-primary compact-save-btn">Kirim Absensi Saya</button>
    </div>
  </section>`;
}

function bindAttendanceSelfCheck(session={}){
  const submit=document.getElementById('room-self-submit');
  if(!submit)return;
  const channels=Array.isArray(session.channels)&&session.channels.length?session.channels:['ZOOM','YOUTUBE','OFFLINE'];
  let selectedStatus='PRESENT',selectedChannel=String(channels[0]||'ZOOM');
  document.querySelectorAll('[data-room-self-status]').forEach(btn=>btn.onclick=()=>{
    selectedStatus=btn.dataset.roomSelfStatus;
    document.querySelectorAll('[data-room-self-status]').forEach(x=>{const active=x===btn;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});
    document.getElementById('room-self-channel-wrap')?.classList.toggle('hidden',selectedStatus!=='PRESENT');
  });
  document.querySelectorAll('[data-room-self-channel]').forEach(btn=>btn.onclick=()=>{
    selectedChannel=btn.dataset.roomSelfChannel;
    document.querySelectorAll('[data-room-self-channel]').forEach(x=>{const active=x===btn;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});
  });
  submit.onclick=async()=>{
    if(submit.disabled)return;
    const statusEl=document.getElementById('room-self-status'),old=submit.innerHTML;
    submit.disabled=true;submit.innerHTML='<span class="btn-spinner"></span><span>Mencatat…</span>';
    if(statusEl){statusEl.className='request-status progress';statusEl.textContent='Mencatat absensi…';}
    try{
      const result=await api('selfCheckInAttendance',{
        token:String(session.public_token||''),
        attendance_status:selectedStatus,
        attendance_channel:selectedStatus==='PRESENT'?selectedChannel:'',
        note:document.getElementById('room-self-note')?.value||''
      },{onSlow:()=>{if(statusEl)statusEl.textContent='Server masih memproses. Jangan klik dua kali.';}});
      toast(`Absensi tersimpan: ${attendanceStatusLabel(result.attendance_status)}.`);
      refreshAcademicSilently();
      await openAttendance(session.attendance_id);
    }catch(err){
      if(statusEl){statusEl.className='request-status error';statusEl.textContent=err.message;}
      submit.disabled=false;submit.innerHTML=old;
    }
  };
}

function drawAttendanceModal(data){
  const s=data.session||{}; const link=s.public_token?attendanceLink(s.public_token):'';
  const linkBlock=link?`<details class="attendance-link-disclosure"><summary><span class="material-symbols-rounded">link</span><span>Link check-in</span><span class="material-symbols-rounded attendance-disclosure-arrow">expand_more</span></summary><div class="attendance-link-box compact"><div><small>Link check-in</small><strong>${esc(link)}</strong></div><button type="button" id="modal-copy-attendance" class="icon-btn mini" title="Salin link">${svg('i-copy')}</button></div></details>`:'';
  const records=data.records||[];
  const myRecord=data.my_record || records.find(r=>String(r.user_id)===String(state.user?.user_id)) || null;
  const filled=records.filter(r=>String(r.attendance_status||'UNMARKED').toUpperCase()!=='UNMARKED').length;
  const present=records.filter(r=>String(r.attendance_status||'').toUpperCase()==='PRESENT').length;
  const waiting=Math.max(0,records.length-filled);
  const ordered=[...records].sort((a,b)=>{const au=String(a.attendance_status||'UNMARKED').toUpperCase()==='UNMARKED'?1:0;const bu=String(b.attendance_status||'UNMARKED').toUpperCase()==='UNMARKED'?1:0;return au-bu||String(a.full_name||a.username||'').localeCompare(String(b.full_name||b.username||''));});
  const totalPages=Math.max(1,Math.ceil(ordered.length/ATTENDANCE_MEMBER_PAGE_SIZE));attendanceModalPage=Math.min(Math.max(1,attendanceModalPage),totalPages);
  const pageRecords=ordered.slice((attendanceModalPage-1)*ATTENDANCE_MEMBER_PAGE_SIZE,attendanceModalPage*ATTENDANCE_MEMBER_PAGE_SIZE);
  const summary=data.can_manage?`<div class="attendance-modal-summary"><div><strong>${records.length}</strong><span>Mahasiswa</span></div><div><strong>${filled}</strong><span>Sudah isi</span></div><div><strong>${present}</strong><span>Hadir</span></div><div><strong>${waiting}</strong><span>Belum</span></div></div>`:'';
  const sessionMeta=`<div class="attendance-session-meta"><span><small>Mulai</small><strong>${esc(shortDateTime(s.open_at||s.start_at))}</strong></span><span><small>Selesai</small><strong>${esc(s.close_at||s.end_at?shortDateTime(s.close_at||s.end_at):'Belum diatur')}</strong></span><span><small>Status sesi</small><strong>${esc(windowLabel(s.window_status))}</strong></span>${s.lateness_enabled?`<span><small>Terlambat setelah</small><strong>${attendanceLateMinutes(s)} menit</strong></span>`:''}</div>`;
  const manageActions=data.can_manage?`<div class="attendance-session-actions"><button type="button" id="attendance-edit-session" class="btn btn-secondary compact-session-btn"><span class="material-symbols-rounded">edit_calendar</span> Edit Sesi</button>${String(s.window_status||'').toUpperCase()!=='CLOSED'?`<button type="button" id="attendance-close-session" class="btn btn-secondary compact-session-btn"><span class="material-symbols-rounded">stop_circle</span> Selesaikan</button>`:''}${data.can_delete?`<button type="button" id="attendance-delete-session" class="btn btn-danger compact-session-btn"><span class="material-symbols-rounded">delete</span> Hapus Sesi</button>`:''}</div>`:'';
  const selfPanel=attendanceSelfCheckPanel(s,myRecord,Boolean(data.can_self_checkin));
  const body=data.can_manage?`<details class="attendance-admin-details"><summary><span><strong>Daftar Absensi</strong><small>Kelola status mahasiswa bila diperlukan.</small></span><span class="attendance-admin-count">${filled}/${records.length}</span><span class="material-symbols-rounded attendance-disclosure-arrow">expand_more</span></summary><form id="attendance-record-form"><div class="attendance-record-head"><div><strong>Daftar Absensi</strong><small>Perubahan status setelah submit hanya dilakukan pengelola dari Ruang Kelas.</small></div></div><div class="attendance-record-list">${pageRecords.map(attendanceRecordRow).join('')}</div>${attendanceMemberPaginationHtml(attendanceModalPage,totalPages,records.length)}<div id="attendance-save-status" class="request-status"></div><button id="attendance-save-btn" class="btn btn-primary compact-save-btn" type="submit">Simpan Perubahan</button></form></details>`:(selfPanel||`<div class="attendance-own-card"><span class="academic-type-icon attendance-icon"><span class="material-symbols-rounded">how_to_reg</span></span><div><span>Status Kehadiran</span><strong>${esc(attendanceStatusLabel(myRecord?.attendance_status||'UNMARKED'))}</strong><small>${esc(myRecord?.note||'Belum ada catatan.')}</small></div></div>`);
  showModal(`<div class="modal-head attendance-modal-head"><div><div class="eyebrow">Absensi</div><h2>${esc(s.title||'Sesi Absensi')}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>${sessionMeta}${manageActions}${summary}${selfPanel&&data.can_manage?selfPanel:''}${body}${linkBlock}`);
  document.querySelector('#phase-modal .phase-modal-card')?.classList.add('attendance-session-modal-v5');
  bindAttendanceModalPage(data);
  bindAttendanceSelfCheck(s);
  document.getElementById('modal-copy-attendance')?.addEventListener('click',()=>copyText(link));
  document.getElementById('attendance-edit-session')?.addEventListener('click',()=>openEditAttendanceSession(data));
  document.getElementById('attendance-close-session')?.addEventListener('click',()=>closeAttendanceSessionFlow(s.attendance_id));
  document.getElementById('attendance-delete-session')?.addEventListener('click',()=>deleteAttendanceSessionFlow(s.attendance_id));
}

function openEditAttendanceSession(data){
  const s=data.session||{},lateMinutes=attendanceLateMinutes(s),channels=Array.isArray(s.channels)?s.channels:[];
  const start=attendanceLocalInput(s.open_at||s.start_at),end=attendanceLocalInput(s.close_at||s.end_at);
  showModal(`<div class="modal-head"><div><div class="eyebrow">Kelola Absensi</div><h2>Edit Sesi</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="attendance-session-edit-form"><div class="field"><label>Judul Pertemuan</label><input name="title" class="control" value="${esc(s.title||'')}" required minlength="3"></div><div class="form-grid"><div class="field"><label>Mulai</label><input name="start_at" type="datetime-local" class="control" value="${esc(start)}" required></div><div class="field"><label>Selesai</label><input name="end_at" type="datetime-local" class="control" value="${esc(end)}" required></div></div><div class="form-grid"><div class="field"><label>Metode Presensi</label><select name="entry_mode" class="control"><option value="SELF" ${String(s.entry_mode)==='SELF'?'selected':''}>Mandiri</option><option value="HYBRID" ${String(s.entry_mode)==='HYBRID'?'selected':''}>Hybrid</option><option value="MANUAL" ${String(s.entry_mode)==='MANUAL'?'selected':''}>Manual Pengelola</option></select></div><div class="field"><label>Media Hadir</label><div class="choice-inline"><label><input type="checkbox" name="attendance_channel" value="ZOOM" ${channels.includes('ZOOM')?'checked':''}> Zoom</label><label><input type="checkbox" name="attendance_channel" value="YOUTUBE" ${channels.includes('YOUTUBE')?'checked':''}> YouTube</label><label><input type="checkbox" name="attendance_channel" value="OFFLINE" ${channels.includes('OFFLINE')?'checked':''}> Offline</label></div></div></div><label class="setting-card compact-setting"><span class="setting-card-copy"><strong>Catat keterlambatan</strong><small>Peserta tetap dapat presensi selama sesi belum ditutup.</small></span><span class="switch"><input name="lateness_enabled" id="edit-lateness-enabled" type="checkbox" ${s.lateness_enabled?'checked':''}><span></span></span></label><div id="edit-late-minutes" class="field ${s.lateness_enabled?'':'hidden'}"><label>Terlambat setelah</label><div class="input-suffix"><input name="late_after_minutes" type="number" min="0" max="240" value="${lateMinutes}" class="control"><span>menit dari mulai</span></div></div><div class="choice-inline attendance-status-options"><label><input type="checkbox" name="sick_enabled" ${s.sick_enabled!==false?'checked':''}> Boleh Sakit</label><label><input type="checkbox" name="permit_enabled" ${s.permit_enabled!==false?'checked':''}> Boleh Izin</label></div><div id="attendance-edit-status" class="request-status"></div><button id="attendance-edit-submit" class="btn btn-primary btn-block" type="submit">Simpan Sesi</button></form>`);
  const late=document.getElementById('edit-lateness-enabled');late?.addEventListener('change',()=>document.getElementById('edit-late-minutes')?.classList.toggle('hidden',!late.checked));
  document.getElementById('attendance-session-edit-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,btn=document.getElementById('attendance-edit-submit'),status=document.getElementById('attendance-edit-status');if(btn.disabled)return;const raw=Object.fromEntries(new FormData(form)),startDate=new Date(raw.start_at),endDate=new Date(raw.end_at);if(!Number.isFinite(startDate.getTime())||!Number.isFinite(endDate.getTime())||endDate<=startDate){status.className='request-status error';status.textContent='Waktu selesai harus setelah waktu mulai.';return;}btn.disabled=true;status.className='request-status progress';status.textContent='Menyimpan perubahan sesi…';try{await api('updateAttendanceSession',{attendance_id:s.attendance_id,title:raw.title,start_at:startDate.toISOString(),end_at:endDate.toISOString(),open_at:startDate.toISOString(),close_at:endDate.toISOString(),entry_mode:raw.entry_mode,self_checkin_enabled:raw.entry_mode!=='MANUAL',attendance_channels:[...form.querySelectorAll('[name="attendance_channel"]:checked')].map(x=>x.value),lateness_enabled:form.lateness_enabled?.checked===true,late_after_minutes:Number(raw.late_after_minutes||15),sick_enabled:form.sick_enabled?.checked===true,permit_enabled:form.permit_enabled?.checked===true});closeModal();toast('Sesi absensi diperbarui.');await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;}};
}
async function closeAttendanceSessionFlow(attendanceId){
  const ok=await confirmDialog({title:'Selesaikan sesi absensi?',message:'Presensi mandiri akan langsung ditutup. Data yang sudah masuk tetap tersimpan dan masih dapat dikoreksi pengelola.',confirmText:'Selesaikan',danger:false});if(!ok)return;
  try{await api('closeAttendanceSession',{attendance_id:attendanceId});closeModal();toast('Sesi absensi selesai.');await refreshAcademicAfterMutation();}catch(err){toast(err.message);}
}
async function deleteAttendanceSessionFlow(attendanceId){
  const ok=await confirmDialog({title:'Hapus sesi absensi?',message:'Sesi akan dihapus dari kelas aktif. Record disimpan secara internal agar tidak merusak data existing.',confirmText:'Hapus Sesi',danger:true});if(!ok)return;
  try{await api('archiveAcademicItem',{type:'ATTENDANCE',id:attendanceId});closeModal();toast('Sesi absensi dihapus dari kelas aktif.');await refreshAcademicAfterMutation();}catch(err){toast(err.message);}
}
function attendanceMemberPaginationHtml(page,totalPages,total){
  if(totalPages<=1)return `<div class="table-pagination compact"><span>${total} mahasiswa</span></div>`;
  const pages=[];for(let i=Math.max(1,page-2);i<=Math.min(totalPages,page+2);i++)pages.push(`<button type="button" data-attendance-member-page="${i}" class="${i===page?'active':''}">${i}</button>`);
  return `<div class="table-pagination attendance-member-pagination"><span>${total} mahasiswa • Halaman ${page}/${totalPages}</span><div><button type="button" data-attendance-member-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>‹</button>${pages.join('')}<button type="button" data-attendance-member-page="${Math.min(totalPages,page+1)}" ${page>=totalPages?'disabled':''}>›</button></div></div>`;
}
function bindAttendanceModalPage(data){
  if(data.can_manage){
    document.querySelectorAll('[data-att-user]').forEach(row=>{
      const id=String(row.dataset.attUser||'');const draft=attendanceModalState?.draft?.[id];
      const status=row.querySelector('[data-att-status]'),note=row.querySelector('[data-att-note]'),fill=row.querySelector('[data-att-fill]');
      if(draft&&status)status.value=draft.attendance_status||'UNMARKED';if(draft&&note)note.value=draft.note||'';
      const refreshFill=()=>{const done=String(status?.value||'UNMARKED').toUpperCase()!=='UNMARKED';if(fill){fill.textContent=done?'Sudah isi':'Belum';fill.classList.toggle('done',done);}};
      refreshFill();
      status?.addEventListener('change',()=>{if(attendanceModalState?.draft?.[id])attendanceModalState.draft[id].attendance_status=status.value;refreshFill();});
      note?.addEventListener('input',()=>{if(attendanceModalState?.draft?.[id])attendanceModalState.draft[id].note=note.value;});
    });
    document.querySelectorAll('[data-attendance-member-page]').forEach(btn=>btn.onclick=()=>{attendanceModalPage=Number(btn.dataset.attendanceMemberPage)||1;drawAttendanceModal(data);});
    document.getElementById('attendance-record-form').onsubmit=e=>saveAttendance(e,data.session?.attendance_id);
  }
}
function attendanceRecordRow(r){const done=String(r.attendance_status||'UNMARKED').toUpperCase()!=='UNMARKED';return `<div class="attendance-record-row" data-att-user="${esc(r.user_id)}"><div class="member-avatar">${avatarMarkup(r)}</div><div class="attendance-member-copy"><strong>${esc(r.full_name||r.username)}</strong><span>@${esc(r.username||'-')} · ${esc(r.kelasku_id||'-')}</span></div><span class="attendance-fill-chip ${done?'done':''}" data-att-fill>${done?'Sudah isi':'Belum'}</span><select class="control compact-control" data-att-status><option value="UNMARKED">Belum</option><option value="PRESENT">Hadir</option><option value="SICK">Sakit</option><option value="PERMIT">Izin</option><option value="ABSENT">Alpa</option></select><input class="control compact-control" data-att-note placeholder="Catatan opsional"></div>`;}

async function saveAttendance(event,attendanceId){event.preventDefault();const btn=document.getElementById('attendance-save-btn'),status=document.getElementById('attendance-save-status'),old=btn.innerHTML;if(btn.disabled)return;const original=attendanceModalState?.data?.records||[];const draft=attendanceModalState?.draft||{};const records=original.map(row=>({user_id:row.user_id,attendance_status:draft[String(row.user_id)]?.attendance_status||row.attendance_status||'UNMARKED',note:draft[String(row.user_id)]?.note||''}));btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';status.className='request-status progress';status.textContent=`Menyimpan ${records.length} anggota dalam satu request… Jangan klik dua kali.`;try{await api('saveAttendanceRecords',{attendance_id:attendanceId,records},{onSlow:()=>status.textContent='Masih menyimpan. Tombol tetap dikunci.'});toast('Absensi tersimpan.');attendanceModalState=null;closeModal();await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}}



async function loadClassAnalyticsSummary(background=false,force=false){
  const classId=String(state.selectedClassId||'');
  const cached=classAnalyticsSummaryCache.get(classId)||null;
  if(!force&&cached&&Date.now()-Number(classAnalyticsSummaryAt.get(classId)||0)<45000)return cached;
  if(classAnalyticsSummaryInFlight.has(classId))return classAnalyticsSummaryInFlight.get(classId);
  const request=(async()=>{
    try{
      const data=await api('getAttendanceAnalyticsSummary',{class_id:classId});
      classAnalyticsSummaryCache.set(classId,data);
      classAnalyticsSummaryAt.set(classId,Date.now());
      if(String(state.selectedClassId)===classId&&activeTab==='analytics'&&!background)drawClassAnalyticsSummary(data);
      if(String(state.selectedClassId)===classId&&activeTab==='analytics'&&background)drawClassAnalyticsSummary(data);
      return data;
    }catch(err){
      if(!background&&!cached&&activeTab==='analytics'&&String(state.selectedClassId)===classId){
        document.getElementById('room-content').innerHTML=`<div class="panel error-panel"><strong>Ringkasan Analitik gagal dimuat.</strong><p>${esc(err.message)}</p></div>`;
      }
      return cached||null;
    }finally{classAnalyticsSummaryInFlight.delete(classId);}
  })();
  classAnalyticsSummaryInFlight.set(classId,request);
  return request;
}
function analyticsRate_(counter={}){
  const d=Number(counter.PRESENT||0)+Number(counter.SICK||0)+Number(counter.PERMIT||0)+Number(counter.ABSENT||0);
  return d?Math.round((Number(counter.PRESENT||0)/d)*1000)/10:0;
}
function drawClassAnalyticsSummary(data){
  const slot=document.getElementById('room-content');if(!slot)return;
  const own=data.own||{},aggregate=data.aggregate||null;
  const ownRate=Number(own.attendance_rate??analyticsRate_(own));
  const classRate=aggregate?Number(aggregate.attendance_rate??analyticsRate_(aggregate)):null;
  const primary=aggregate||own;
  const statusItems=[
    ['check_circle','Hadir',Number(primary.PRESENT||0),'present'],
    ['healing','Sakit',Number(primary.SICK||0),'sick'],
    ['event_available','Izin',Number(primary.PERMIT||0),'permit'],
    ['cancel','Alpa',Number(primary.ABSENT||0),'absent'],
    ['pending','Belum',Number(primary.UNMARKED||0),'unmarked']
  ];
  slot.innerHTML=`<section class="analytics-quick-shell">
    <div class="analytics-quick-hero">
      <div class="analytics-quick-copy">
        <span class="analytics-quick-eyebrow">ANALITIK KELAS</span>
        <h2>Ringkasan cepat</h2>
        <p>Informasi inti dimuat lebih ringan. Detail lengkap hanya diambil saat dibutuhkan.</p>
      </div>
      <button type="button" id="open-analytics-detail" class="btn btn-primary analytics-detail-cta"><span class="material-symbols-rounded">insights</span> Buka Analitik Lengkap</button>
    </div>
    <div class="analytics-quick-kpis">
      <article><span class="material-symbols-rounded">event_note</span><div><small>Total Sesi</small><strong>${Number(data.session_count||0)}</strong><em>jadwal presensi aktif</em></div></article>
      <article><span class="material-symbols-rounded">groups</span><div><small>Peserta</small><strong>${Number(data.participant_count||0)}</strong><em>anggota peserta kelas</em></div></article>
      <article><span class="material-symbols-rounded">how_to_reg</span><div><small>Kehadiran Saya</small><strong>${ownRate}%</strong><em>${Number(own.PRESENT||0)} hadir dari ${Number(own.total||0)} record</em></div></article>
      <article><span class="material-symbols-rounded">monitoring</span><div><small>${aggregate?'Presensi Kelas':'Record Saya'}</small><strong>${aggregate?`${classRate}%`:Number(own.total||0)}</strong><em>${aggregate?'berdasarkan status yang sudah ditandai':'total record presensi'}</em></div></article>
    </div>
    <div class="analytics-quick-status-card">
      <div class="analytics-quick-status-head"><div><strong>${aggregate?'Status Presensi Kelas':'Status Presensi Saya'}</strong><span>${aggregate?'Ringkasan seluruh peserta tanpa memuat detail 1 per 1.':'Ringkasan presensi akun Anda.'}</span></div><span class="analytics-quick-scope">${aggregate?'KELAS':'SAYA'}</span></div>
      <div class="analytics-quick-status-grid">${statusItems.map(([icon,label,value,key])=>`<div class="analytics-status-item analytics-status-${key}"><span class="material-symbols-rounded">${icon}</span><div><small>${label}</small><strong>${value}</strong></div></div>`).join('')}</div>
    </div>
    <div class="analytics-quick-note"><span class="material-symbols-rounded">bolt</span><div><strong>Mode ringan aktif</strong><p>Daftar anggota, kegiatan, detail record, ranking, dan Export XLSX tidak dimuat di halaman ini. Semua tersedia di Analitik Lengkap.</p></div></div>
  </section>`;
  document.getElementById('open-analytics-detail')?.addEventListener('click',async()=>{
    const btn=document.getElementById('open-analytics-detail');
    if(btn){btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Memuat detail…</span>';}
    const cached=state.classAnalytics[String(state.selectedClassId||'')];
    if(cached){drawClassAnalytics(cached);loadClassAnalytics(true).catch(()=>{});return;}
    slot.innerHTML=fastRoomLoader('Memuat Analitik Lengkap…');
    await loadClassAnalytics(false,true);
  });
}

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
  const activitySummary=buildActivitySummary(allRecords,activities);
  const views=[['overview','monitoring','Ringkasan'],['members','groups','Anggota'],['activities','event_note','Kegiatan'],['detail','table_rows','Detail']].filter(v=>data.can_manage||v[0]!=='members');
  if(!views.some(v=>v[0]===analyticsView))analyticsView='overview';
  let body='';
  if(analyticsView==='overview')body=`<div class="analytics-own-card"><div class="academic-type-icon attendance-icon"><span class="material-symbols-rounded">how_to_reg</span></div><div><span>Ringkasan Saya</span><strong>${Number(own.PRESENT||0)} hadir · ${Number(own.SICK||0)} sakit · ${Number(own.PERMIT||0)} izin · ${Number(own.ABSENT||0)} alpa</strong><small>Belum ditandai: ${Number(own.UNMARKED||0)} · Total ${Number(own.total||0)} record</small></div></div><div class="section-title-row ranking-title-row"><div><h2>Peringkat Tugas</h2><p>Top 10 berdasarkan rata-rata nilai tugas yang sudah direview.</p></div><span class="soft-chip">${ranking.length} peserta bernilai</span></div>${rankingHtml}`;
  else if(analyticsView==='members')body=`<div class="section-title-row"><div><h2>Ringkasan Anggota</h2><p>${members.length} anggota · Hadir ${Number(ag.PRESENT||0)} · Sakit ${Number(ag.SICK||0)} · Izin ${Number(ag.PERMIT||0)} · Alpa ${Number(ag.ABSENT||0)}</p></div></div><div class="analytics-table-wrap"><table class="analytics-table analytics-member-table"><thead><tr><th>No.</th><th>Anggota</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Belum</th><th>Total</th><th>% Presensi</th></tr></thead><tbody>${memberRows||'<tr><td colspan="9" class="table-empty">Belum ada anggota.</td></tr>'}</tbody></table></div>${memberPaginationHtml(analyticsMemberPage,memberTotalPages,members.length)}`;
  else if(analyticsView==='activities')body=`<div class="section-title-row"><div><h2>Rekap Kegiatan / Mata Kuliah</h2><p>${activitySummary.length} kegiatan. Klik 1 row mata pelajaran untuk melihat rekap peserta sesuai urutan Anggota Kelas.</p></div></div>${activitySummaryHtml(activitySummary,allRecords,activities,members)}`;
  else body=`<div class="analytics-activity-toolbar"><div><strong>Detail Record Presensi</strong><small>${data.can_manage?'Seluruh anggota sesuai filter kegiatan/sesi.':'Akun member hanya melihat data sendiri.'}</small></div><select id="analytics-activity-filter" class="control compact-control"><option value="ALL">Semua kegiatan / sesi</option>${activities.map(a=>`<option value="${esc(a.attendance_id)}" ${analyticsFilter===String(a.attendance_id)?'selected':''}>${esc(a.activity_name||a.session_title||'Absensi')}${a.session_no?` • Sesi ${String(a.session_no).padStart(2,'0')}`:''} • ${esc(shortDate(a.start_at))}</option>`).join('')}</select></div><div class="analytics-table-wrap"><table class="analytics-table analytics-activity-table"><thead><tr><th>No.</th>${data.can_manage?'<th>Anggota</th>':''}<th>Kegiatan / Sesi</th><th>Status</th><th>Catatan</th></tr></thead><tbody>${activityRows}</tbody></table></div>${paginationHtml(analyticsPage,totalPages,filtered.length)}`;
  slot.innerHTML=`<section class="panel class-analytics-panel analytics-detail-panel"><div class="analytics-detail-head"><button type="button" id="back-analytics-summary" class="btn btn-secondary analytics-back-btn"><span class="material-symbols-rounded">arrow_back</span> Ringkasan</button><div class="analytics-detail-title"><span>ANALITIK LENGKAP</span><strong>Analitik Akademik</strong><small>Data detail dimuat hanya pada halaman ini agar Ruang Kelas tetap ringan.</small></div><button type="button" id="export-attendance-xlsx" class="btn btn-secondary">${svg('i-download')} Export XLSX</button></div><div class="analytics-kpi-grid"><div><span>Sesi</span><strong>${Number(data.session_count||0)}</strong></div><div><span>Kehadiran Saya</span><strong>${Number(own.attendance_rate||0)}%</strong></div><div><span>Hadir</span><strong>${Number(own.PRESENT||0)}</strong></div><div><span>Alpa</span><strong>${Number(own.ABSENT||0)}</strong></div></div><nav class="analytics-view-tabs">${views.map(([key,icon,label])=>`<button type="button" class="analytics-view-tab ${analyticsView===key?'active':''}" data-analytics-view="${key}"><span class="material-symbols-rounded">${icon}</span><span>${label}</span></button>`).join('')}</nav><div class="analytics-view-body">${body}</div></section>`;
  document.querySelectorAll('[data-analytics-view]').forEach(btn=>btn.onclick=()=>{analyticsView=btn.dataset.analyticsView||'overview';drawClassAnalytics(data);});
  document.getElementById('analytics-activity-filter')?.addEventListener('change',e=>{analyticsFilter=e.target.value;analyticsPage=1;drawClassAnalytics(data);});
  document.querySelectorAll('[data-analytics-page]').forEach(btn=>btn.onclick=()=>{analyticsPage=Number(btn.dataset.analyticsPage)||1;drawClassAnalytics(data);});
  document.querySelectorAll('[data-analytics-member-page]').forEach(btn=>btn.onclick=()=>{analyticsMemberPage=Number(btn.dataset.analyticsMemberPage)||1;drawClassAnalytics(data);});
  document.querySelectorAll('[data-activity-summary-row]').forEach(row=>row.onclick=()=>{const key=row.dataset.activitySummaryRow||'';analyticsActivityExpanded=analyticsActivityExpanded===key?'':key;drawClassAnalytics(data);});
  document.getElementById('back-analytics-summary')?.addEventListener('click',()=>{const id=String(state.selectedClassId||'');const summary=classAnalyticsSummaryCache.get(id);if(summary)drawClassAnalyticsSummary(summary);else{document.getElementById('room-content').innerHTML=fastRoomLoader('Menyiapkan ringkasan Analitik…');loadClassAnalyticsSummary(false,true);}});
  document.getElementById('export-attendance-xlsx')?.addEventListener('click',()=>exportAttendanceXlsx(data));
}
function paginationHtml(page,totalPages,total){if(totalPages<=1)return `<div class="table-pagination compact"><span>${total} record</span></div>`;const pages=[];for(let i=Math.max(1,page-2);i<=Math.min(totalPages,page+2);i++)pages.push(`<button type="button" data-analytics-page="${i}" class="${i===page?'active':''}">${i}</button>`);return `<div class="table-pagination"><span>${total} record • Halaman ${page}/${totalPages}</span><div><button type="button" data-analytics-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>‹</button>${pages.join('')}<button type="button" data-analytics-page="${Math.min(totalPages,page+1)}" ${page>=totalPages?'disabled':''}>›</button></div></div>`;}
function memberPaginationHtml(page,totalPages,total){if(totalPages<=1)return `<div class="table-pagination compact"><span>${total} anggota</span></div>`;const pages=[];for(let i=Math.max(1,page-2);i<=Math.min(totalPages,page+2);i++)pages.push(`<button type="button" data-analytics-member-page="${i}" class="${i===page?'active':''}">${i}</button>`);return `<div class="table-pagination"><span>${total} anggota • Halaman ${page}/${totalPages}</span><div><button type="button" data-analytics-member-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>‹</button>${pages.join('')}<button type="button" data-analytics-member-page="${Math.min(totalPages,page+1)}" ${page>=totalPages?'disabled':''}>›</button></div></div>`;}
function progressedAttendanceRecords(records,activities=[]){
  const now=Date.now(),started=new Set();
  (activities||[]).forEach(a=>{if(!a.start_at||dateMs(a.start_at)<=now)started.add(String(a.attendance_id||''));});
  return (records||[]).filter(r=>started.has(String(r.attendance_id||''))||String(r.attendance_status||'UNMARKED').toUpperCase()!=='UNMARKED');
}
function canonicalAttendanceActivityName(item={}){
  let name=String(item.activity_name||item.session_title||item.title||'Kegiatan').trim()||'Kegiatan';
  // Attendance session titles may be stored as "Absensi — MAPEL • Sesi 03" when
  // source_schedule_id is unavailable. Export/analytics must still group by MAPEL.
  name=name
    .replace(/^absensi\s*[—–-]\s*/i,'')
    .replace(/\s*[•·]\s*sesi\s*0*\d+\s*$/i,'')
    .replace(/\s*[—–-]\s*sesi\s*0*\d+\s*$/i,'')
    .trim();
  return name||'Kegiatan';
}
function buildActivitySummary(records,activities=[]){
  const now=Date.now(),groups={},activityById={};
  (activities||[]).forEach(a=>{activityById[String(a.attendance_id||'')]=a;const name=canonicalAttendanceActivityName(a),key=name.toLowerCase();if(!groups[key])groups[key]={name,plannedSessionIds:new Set(),progressedSessionIds:new Set(),studentNames:new Set(),PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,ZOOM:0,YOUTUBE:0,OFFLINE:0,OTHER:0,ON_TIME:0,LATE:0,total:0};groups[key].plannedSessionIds.add(String(a.attendance_id||''));if(!a.start_at||dateMs(a.start_at)<=now)groups[key].progressedSessionIds.add(String(a.attendance_id||''));});
  (records||[]).forEach(r=>{const a=activityById[String(r.attendance_id||'')]||r,name=canonicalAttendanceActivityName({...a,...r}),key=name.toLowerCase();if(!groups[key])groups[key]={name,plannedSessionIds:new Set(),progressedSessionIds:new Set(),studentNames:new Set(),PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,ZOOM:0,YOUTUBE:0,OFFLINE:0,OTHER:0,ON_TIME:0,LATE:0,total:0};const g=groups[key],sessionId=String(r.attendance_id||'');g.plannedSessionIds.add(sessionId);const started=(!r.start_at||dateMs(r.start_at)<=now)||String(r.attendance_status||'UNMARKED').toUpperCase()!=='UNMARKED';if(!started)return;g.progressedSessionIds.add(sessionId);if(r.full_name||r.username)g.studentNames.add(String(r.full_name||r.username));const st=String(r.attendance_status||'UNMARKED').toUpperCase();g[st]=(g[st]||0)+1;const ch=String(r.attendance_channel||'').toUpperCase();if(ch)g[ch]=(g[ch]||0)+1;const pn=String(r.punctuality||'').toUpperCase();if(pn)g[pn]=(g[pn]||0)+1;g.total+=1;});
  return Object.values(groups).map(g=>{const denominator=g.PRESENT+g.SICK+g.PERMIT+g.ABSENT;return {...g,sessions:g.plannedSessionIds.size,progressed_sessions:g.progressedSessionIds.size,student_names:[...g.studentNames],attendance_rate:denominator?Math.round((g.PRESENT/denominator)*1000)/10:0};}).sort((a,b)=>a.name.localeCompare(b.name));
}
function activitySummaryHtml(items,records=[],activities=[],members=[]){
  if(!items.length)return '<div class="search-empty">Belum ada data kegiatan.</div>';
  const activityIdsByName={};
  (activities||[]).forEach(a=>{const key=canonicalAttendanceActivityName(a).toLowerCase();(activityIdsByName[key]||=(new Set())).add(String(a.attendance_id||''));});
  const statusSummaryFor=(summary)=>{
    const key=String(summary.name||'').trim().toLowerCase(),ids=activityIdsByName[key]||new Set();
    const related=progressedAttendanceRecords((records||[]).filter(r=>ids.has(String(r.attendance_id||''))),activities);
    const byUser={};
    related.forEach(r=>{const id=String(r.user_id||'');if(!byUser[id])byUser[id]={PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,total:0};const st=String(r.attendance_status||'UNMARKED').toUpperCase();byUser[id][st]=(byUser[id][st]||0)+1;byUser[id].total+=1;});
    return (members||[]).map((m,index)=>{const x=byUser[String(m.user_id)]||{PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,total:0};const den=x.PRESENT+x.SICK+x.PERMIT+x.ABSENT;return {...m,...x,_index:index+1,attendance_rate:den?Math.round((x.PRESENT/den)*1000)/10:0};}).filter(m=>m.total>0 || !['TEACHER','OBSERVER'].includes(String(m.class_role||'').toUpperCase()));
  };
  return `<div class="analytics-table-wrap"><table class="analytics-table analytics-summary-table"><thead><tr><th>Kegiatan / Mata Kuliah</th><th>Sesi</th><th>Record</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Belum</th><th>% Presensi</th><th></th></tr></thead><tbody>${items.map(x=>{const key=String(x.name||'').trim().toLowerCase(),expanded=analyticsActivityExpanded===key,people=statusSummaryFor(x);return `<tr class="analytics-activity-summary-row ${expanded?'expanded':''}" data-activity-summary-row="${esc(key)}" tabindex="0"><td><strong>${esc(x.name)}</strong><small>${people.length} peserta tercatat</small></td><td>${x.sessions}</td><td>${x.total}</td><td>${x.PRESENT}</td><td>${x.SICK}</td><td>${x.PERMIT}</td><td>${x.ABSENT}</td><td>${x.UNMARKED}</td><td><strong>${x.attendance_rate}%</strong></td><td><span class="material-symbols-rounded">${expanded?'expand_less':'expand_more'}</span></td></tr>${expanded?`<tr class="analytics-activity-member-detail"><td colspan="10"><div class="analytics-inline-member-list"><div class="analytics-inline-head"><span>No.</span><span>Peserta</span><span>Record</span><span>Hadir</span><span>Sakit</span><span>Izin</span><span>Alpa</span><span>Belum</span><span>%</span></div>${people.map(m=>`<div class="analytics-inline-row"><span>${m._index}</span><span><strong>${esc(m.full_name||m.username||'-')}</strong><small>@${esc(m.username||'-')}${['TEACHER','OBSERVER'].includes(String(m.class_role||'').toUpperCase())?' · histori':''}</small></span><span>${m.total}</span><span>${m.PRESENT}</span><span>${m.SICK}</span><span>${m.PERMIT}</span><span>${m.ABSENT}</span><span>${m.UNMARKED}</span><span><strong>${m.attendance_rate}%</strong></span></div>`).join('')}</div></td></tr>`:''}`}).join('')}</tbody></table></div>`;
}
function buildSessionSummary(records){
  const groups={};
  (records||[]).forEach(r=>{const key=String(r.attendance_id||'');if(!groups[key])groups[key]={attendance_id:key,name:r.activity_name||r.session_title||'Kegiatan',session_no:Number(r.session_no||0),start_at:r.start_at||'',PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,ZOOM:0,YOUTUBE:0,OFFLINE:0,OTHER:0,ON_TIME:0,LATE:0,total:0};const g=groups[key];const st=String(r.attendance_status||'UNMARKED').toUpperCase();g[st]=(g[st]||0)+1;const ch=String(r.attendance_channel||'').toUpperCase();if(ch)g[ch]=(g[ch]||0)+1;const pn=String(r.punctuality||'').toUpperCase();if(pn)g[pn]=(g[pn]||0)+1;g.total+=1;});
  return Object.values(groups).map(g=>{const d=g.PRESENT+g.SICK+g.PERMIT+g.ABSENT;return {...g,attendance_rate:d?Math.round((g.PRESENT/d)*1000)/10:0};}).sort((a,b)=>dateMs(a.start_at)-dateMs(b.start_at));
}
function memberSummaryForRecords(records,members){
  const map={};(members||[]).forEach(m=>map[String(m.user_id)]={...m,PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,ZOOM:0,YOUTUBE:0,OFFLINE:0,OTHER:0,ON_TIME:0,LATE:0,total:0});
  (records||[]).forEach(r=>{const id=String(r.user_id||'');if(!map[id])map[id]={user_id:id,full_name:r.full_name||'',username:r.username||'',kelasku_id:r.kelasku_id||'',PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,ZOOM:0,YOUTUBE:0,OFFLINE:0,OTHER:0,ON_TIME:0,LATE:0,total:0};const st=String(r.attendance_status||'UNMARKED').toUpperCase();map[id][st]=(map[id][st]||0)+1;const ch=String(r.attendance_channel||'').toUpperCase();if(ch)map[id][ch]=(map[id][ch]||0)+1;const pn=String(r.punctuality||'').toUpperCase();if(pn)map[id][pn]=(map[id][pn]||0)+1;map[id].total+=1;});
  return Object.values(map).map(m=>{const d=m.PRESENT+m.SICK+m.PERMIT+m.ABSENT;return {...m,attendance_rate:d?Math.round((m.PRESENT/d)*1000)/10:0};}).sort((a,b)=>String(a.full_name||a.username||'').localeCompare(String(b.full_name||b.username||'')));
}
function analyticsSheetRows(title,records,members){
  const progressed=records.filter(r=>!r.start_at||dateMs(r.start_at)<=Date.now()||String(r.attendance_status||'UNMARKED').toUpperCase()!=='UNMARKED'),memberSummary=memberSummaryForRecords(progressed,members),sessions=buildSessionSummary(records);
  const statusCode=r=>{const st=String(r?.attendance_status||'UNMARKED').toUpperCase();if(st==='PRESENT'){const ch=String(r?.attendance_channel||'').toUpperCase();return ch==='ZOOM'?'H-Z':ch==='YOUTUBE'?'H-YT':ch==='OFFLINE'?'H-O':'H';}if(st==='SICK')return'S';if(st==='PERMIT')return'I';if(st==='ABSENT')return'A';return'-';};
  const present=progressed.filter(r=>r.attendance_status==='PRESENT').length,sick=progressed.filter(r=>r.attendance_status==='SICK').length,permit=progressed.filter(r=>r.attendance_status==='PERMIT').length,absent=progressed.filter(r=>r.attendance_status==='ABSENT').length,unmarked=progressed.filter(r=>r.attendance_status==='UNMARKED').length,den=present+sick+permit+absent,rate=den?Math.round((present/den)*1000)/10:0;
  const rows=[
    [xlsxCell(`KELASKU — ${title}`,3)],
    [`${sessions.length} sesi rencana • ${memberSummary.length} mahasiswa • ${progressed.length} record berjalan • Presensi ${rate}%`],
    ['Kode: H-Z=Hadir Zoom | H-YT=Hadir YouTube | H-O=Hadir Offline | H=Hadir | S=Sakit | I=Izin | A=Alpa | -=Belum'],
    [],
    [xlsxCell('Mata Kuliah / Kegiatan',5),xlsxCell('Nama',5),xlsxCell('Username',5),...sessions.map((x,i)=>xlsxCell(`${x.session_no?`S${String(x.session_no).padStart(2,'0')}`:`S${String(i+1).padStart(2,'0')}`} • ${shortDate(x.start_at)}`,6)),xlsxCell('Total',5),xlsxCell('Hadir',5),xlsxCell('Sakit',5),xlsxCell('Izin',5),xlsxCell('Alpa',5),xlsxCell('Belum',5),xlsxCell('Zoom',5),xlsxCell('YouTube',5),xlsxCell('Tepat',5),xlsxCell('Terlambat',5),xlsxCell('% Presensi',5)]
  ];
  memberSummary.forEach(m=>{
    const mine=records.filter(r=>String(r.user_id||'')===String(m.user_id||''));
    const cells=sessions.map(sess=>{const rec=mine.find(r=>String(r.attendance_id||'')===String(sess.attendance_id||''));return rec?statusCode(rec):'-';});
    rows.push([title,m.full_name||'',m.username||'',...cells.map(v=>xlsxCell(v,7)),m.total||0,m.PRESENT||0,m.SICK||0,m.PERMIT||0,m.ABSENT||0,m.UNMARKED||0,m.ZOOM||0,m.YOUTUBE||0,m.ON_TIME||0,m.LATE||0,(m.attendance_rate||0)+'%']);
  });
  rows.push([], [xlsxCell('RINGKASAN STATUS',4)], [xlsxCell('Hadir',1),xlsxCell('Sakit',1),xlsxCell('Izin',1),xlsxCell('Alpa',1),xlsxCell('Belum',1),xlsxCell('% Presensi',1)], [present,sick,permit,absent,unmarked,rate+'%']);
  return rows;
}
function exportAttendanceXlsx(data){
  const records=data.activity_records||[],own=data.own||{},scopeMembers=data.can_manage?(data.members||[]):[own].filter(Boolean),scope=data.can_manage?'Seluruh anggota':'Data saya saja',summaries=buildActivitySummary(records,data.activities||[]),progressedRecords=progressedAttendanceRecords(records,data.activities||[]),members=memberSummaryForRecords(progressedRecords,scopeMembers);
  const pCount=progressedRecords.filter(r=>r.attendance_status==='PRESENT').length,sCount=progressedRecords.filter(r=>r.attendance_status==='SICK').length,iCount=progressedRecords.filter(r=>r.attendance_status==='PERMIT').length,aCount=progressedRecords.filter(r=>r.attendance_status==='ABSENT').length,uCount=progressedRecords.filter(r=>r.attendance_status==='UNMARKED').length,attendanceDen=pCount+sCount+iCount+aCount,overallRate=attendanceDen?Math.round((pCount/attendanceDen)*1000)/10:0;
  const overview=[
    [xlsxCell('KELASKU — REKAP PRESENSI',3)],
    ['Scope',scope],
    ['Kelas',String(currentClassData?.class?.name||currentClassData?.class_name||state.selectedClassId||'KelasKu')],
    ['Jumlah mahasiswa',members.length],
    ['Jumlah sesi',data.session_count||0],
    ['% Presensi',overallRate+'%'],
    [],
    [xlsxCell('RINGKASAN PER MATA KULIAH / KEGIATAN',4)],
    [xlsxCell('Kegiatan',5),xlsxCell('Mahasiswa',5),xlsxCell('Sesi',5),xlsxCell('Record Berjalan',5),xlsxCell('Hadir',5),xlsxCell('Sakit',5),xlsxCell('Izin',5),xlsxCell('Alpa',5),xlsxCell('Belum',5),xlsxCell('Zoom',5),xlsxCell('YouTube',5),xlsxCell('Tepat',5),xlsxCell('Terlambat',5),xlsxCell('% Presensi',5)]
  ];
  summaries.forEach(g=>overview.push([g.name,(g.student_names||[]).length,g.sessions,g.total,g.PRESENT,g.SICK,g.PERMIT,g.ABSENT,g.UNMARKED,g.ZOOM||0,g.YOUTUBE||0,g.ON_TIME||0,g.LATE||0,g.attendance_rate+'%']));
  overview.push([], [xlsxCell('TOTAL KELAS',4)], [xlsxCell('Hadir',1),xlsxCell('Sakit',1),xlsxCell('Izin',1),xlsxCell('Alpa',1),xlsxCell('Belum',1),xlsxCell('Zoom',1),xlsxCell('YouTube',1),xlsxCell('Tepat',1),xlsxCell('Terlambat',1),xlsxCell('% Presensi',1)], [pCount,sCount,iCount,aCount,uCount,progressedRecords.filter(r=>r.attendance_channel==='ZOOM').length,progressedRecords.filter(r=>r.attendance_channel==='YOUTUBE').length,progressedRecords.filter(r=>r.punctuality==='ON_TIME').length,progressedRecords.filter(r=>r.punctuality==='LATE').length,overallRate+'%']);
  const allRows=[
    [xlsxCell('Mata Kuliah / Kegiatan',5),xlsxCell('Nama',5),xlsxCell('Username',5),xlsxCell('Sesi',5),xlsxCell('Tanggal',5),xlsxCell('Status',5),xlsxCell('Media',5),xlsxCell('Ketepatan',5),xlsxCell('Catatan',5)]
  ];
  progressedRecords
    .slice()
    .sort((a,b)=>canonicalAttendanceActivityName(a).localeCompare(canonicalAttendanceActivityName(b))||dateMs(a.start_at)-dateMs(b.start_at)||String(a.full_name||'').localeCompare(String(b.full_name||'')))
    .forEach(r=>allRows.push([
      canonicalAttendanceActivityName(r),r.full_name||'',r.username||'',r.session_no?`Sesi ${String(r.session_no).padStart(2,'0')}`:'-',shortDateTime(r.start_at),attendanceStatusLabel(r.attendance_status),attendanceChannelLabel(r.attendance_channel),punctualityLabel(r.punctuality),r.note||''
    ]));
  const sheets=[{name:'ANALISIS',rows:overview},{name:'ALL',rows:allRows}];
  summaries.forEach((summary,index)=>{
    const activityRecords=records.filter(r=>canonicalAttendanceActivityName(r).toLowerCase()===String(summary.name).trim().toLowerCase());
    const sessionCount=buildSessionSummary(activityRecords).length;
    sheets.push({name:`${String(index+1).padStart(2,'0')}-${summary.name}`,rows:analyticsSheetRows(summary.name,activityRecords,scopeMembers),columnWidths:[22,28,18,...Array(sessionCount).fill(4.5),...Array(11).fill(10)],rowHeights:{5:92}});
  });
  downloadXlsx(`KelasKu-Presensi-${state.selectedClassId}.xlsx`,sheets);
}

function attendanceChannelLabel(v){return ({ZOOM:'Zoom',YOUTUBE:'YouTube',OFFLINE:'Offline',OTHER:'Lainnya'})[String(v||'').toUpperCase()]||'-';}
function punctualityLabel(v){return ({ON_TIME:'Tepat Waktu',LATE:'Terlambat'})[String(v||'').toUpperCase()]||'-';}
function attendanceStatusLabel(status){return ({PRESENT:'Hadir',SICK:'Sakit',PERMIT:'Izin',ABSENT:'Alpa',UNMARKED:'Belum'})[String(status||'UNMARKED').toUpperCase()]||String(status||'-');}

async function openTaskReview(taskId){
  const cached=state.taskReviewCache[taskId];
  showModal(`<div class="modal-head"><div><div class="eyebrow">REVIEW TUGAS</div><h2>${cached?esc(cached.task?.title||'Review Tugas'):'Memuat pengumpulan…'}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div id="task-review-slot">${cached?taskReviewHtml(cached):'<div class="search-loading"><span class="status-dot"></span>Memuat submission anggota…</div>'}</div>`);
  if(cached)bindTaskReview(cached);
  try{const data=await api('getTaskSubmissions',{task_id:taskId});state.taskReviewCache[taskId]=data;const slot=document.getElementById('task-review-slot');if(slot){slot.innerHTML=taskReviewHtml(data);bindTaskReview(data);}}catch(err){const slot=document.getElementById('task-review-slot');if(slot)slot.innerHTML=`<div class="alert danger">${esc(err.message)}</div>`;}
}
function taskReviewHtml(data){const s=data.summary||{},task=data.task||{},items=data.items||[];return `<div class="review-summary-grid"><div><strong>${Number(s.submitted||0)}</strong><span>Dikumpulkan</span></div><div><strong>${Number(s.reviewed||0)}</strong><span>Dinilai</span></div><div><strong>${Number(s.needs_revision||0)}</strong><span>Revisi</span></div><div><strong>${Number(s.pending||0)}</strong><span>Menunggu</span></div></div><div class="review-toolbar"><small>Nilai maksimum ${Number(task.max_score||0)}</small><button type="button" class="btn btn-secondary small-btn" id="export-task-review">${svg('i-download')} Export XLSX</button></div><div class="task-review-list">${items.map(item=>{const sub=item.submission;return `<article class="task-review-row"><span class="member-avatar">${avatarMarkup(item)}</span><div class="task-review-main"><strong>${esc(item.full_name||item.username)}</strong><small>@${esc(item.username||'-')} · ${esc(item.submission_status)}</small>${sub?.review_status?`<span class="review-status-pill review-${String(sub.review_status).toLowerCase()}">${esc(sub.review_status)}</span>`:''}</div><div class="task-review-score">${sub&&sub.score!==''?`<strong>${esc(String(sub.score))}/${Number(task.max_score||0)}</strong>`:'<span>—</span>'}</div>${sub?`<button type="button" class="btn btn-secondary small-btn" data-review-submission="${esc(sub.submission_id)}">Review</button>`:'<span class="soft-chip">Belum kirim</span>'}</article>`;}).join('')}</div>`;}
function bindTaskReview(data){document.querySelectorAll('[data-review-submission]').forEach(btn=>btn.onclick=()=>openSubmissionReview(data,btn.dataset.reviewSubmission));document.getElementById('export-task-review')?.addEventListener('click',()=>{const rows=[['Nama','Username','Status','Review','Nilai','Feedback','Submitted At']];(data.items||[]).forEach(i=>rows.push([i.full_name||'',i.username||'',i.submission_status||'',i.submission?.review_status||'',i.submission?.score??'',i.submission?.feedback||'',i.submission?.submitted_at||'']));downloadXlsx(`kelasku-tugas-${data.task?.task_id||'review'}.xlsx`,[{name:'Review Tugas',rows:rows.map((r,i)=>r.map(v=>i===0?xlsxCell(v,1):v))}]);});}
function openSubmissionReview(data,submissionId){
  const item=(data.items||[]).find(x=>String(x.submission?.submission_id)===String(submissionId));if(!item)return;
  const sub=item.submission||{},max=Number(data.task?.max_score||0);const attachments=sub.attachments||[];
  const legacy=sub.submission_image_url&&!attachments.some(a=>String(a.file_id)===String(sub.submission_image_file_id))?[{type:'IMAGE',mime_type:'image/jpeg',filename:sub.submission_image_name||'Lampiran gambar',url:sub.submission_image_url,preview_url:sub.submission_image_url,download_url:sub.submission_image_url}]:[];
  showModal(`<div class="modal-head"><div><div class="eyebrow">REVIEW • ${esc(item.full_name||item.username)}</div><h2>${esc(data.task?.title||'Tugas')}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="submission-preview"><div><span>Status</span><strong>${esc(sub.status||'-')}</strong></div>${sub.submission_text?`<p>${esc(sub.submission_text)}</p>`:''}${attachmentListHtml([...attachments,...legacy])}${sub.submission_url?`<button type="button" class="btn btn-secondary small-btn" id="review-open-link">${svg('i-link')} Buka Link</button>`:''}</div><form id="submission-review-form"><div class="form-grid"><div class="field"><label>Nilai (0–${max})</label><input name="score" type="number" min="0" max="${max}" step="0.1" class="control" value="${sub.score!==''&&sub.score!==undefined?esc(String(sub.score)):''}"></div><div class="field"><label>Status Review</label><select name="review_status" class="control"><option value="REVIEWED" ${sub.review_status==='REVIEWED'?'selected':''}>Selesai Dinilai</option><option value="NEEDS_REVISION" ${sub.review_status==='NEEDS_REVISION'?'selected':''}>Perlu Revisi</option></select></div></div><div class="field"><label>Feedback</label><textarea name="feedback" rows="4" class="control" placeholder="Catatan untuk mahasiswa…">${esc(sub.feedback||'')}</textarea></div><div id="submission-review-status" class="request-status"></div><button id="submission-review-submit" class="btn btn-primary btn-block" type="submit">Simpan Review</button></form>`);
  document.getElementById('review-open-link')?.addEventListener('click',()=>openExternal(sub.submission_url));bindAcademicFilePreview(document.getElementById('phase-modal')||document);document.getElementById('submission-review-form').onsubmit=e=>saveSubmissionReview(e,data,submissionId);
}
async function saveSubmissionReview(event,data,submissionId){event.preventDefault();const form=event.currentTarget,btn=document.getElementById('submission-review-submit'),status=document.getElementById('submission-review-status'),old=btn.innerHTML;if(btn.disabled)return;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';status.className='request-status progress';status.textContent='Menyimpan nilai & feedback…';try{await api('reviewTaskSubmission',{submission_id:submissionId,score:form.score.value,feedback:form.feedback.value,review_status:form.review_status.value});delete state.taskReviewCache[data.task.task_id];toast('Review tugas tersimpan.');closeModal();openTaskReview(data.task.task_id);loadClassAcademic(true);}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}}
function downloadCsv(filename,rows){const csv='\uFEFF'+rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function membersHtml(data) {
  const p=data.permissions||{};
  const items=data.members||[];
  const leader=items.find(m=>m.is_class_leader)||null;
  const candidates=items;
  const totalPages=Math.max(1,Math.ceil(items.length/CLASS_MEMBERS_PAGE_SIZE));
  classMembersPage=Math.min(Math.max(1,classMembersPage),totalPages);
  const pageItems=items.slice((classMembersPage-1)*CLASS_MEMBERS_PAGE_SIZE,classMembersPage*CLASS_MEMBERS_PAGE_SIZE);

  const leaderCard=`<div class="class-leader-card">
    <div class="class-leader-icon">${svg('i-shield')}</div>
    <div class="class-leader-copy">
      <span>KETUA KELAS</span>
      <strong>${leader?esc(leader.full_name||leader.username):'Belum ditetapkan'}</strong>
      <small>${leader?`@${esc(leader.username||'-')} · ${esc(roleLabel(leader.class_role))}`:'Owner dapat menunjuk dirinya sendiri atau anggota aktif sebagai Ketua Kelas.'}</small>
    </div>
    ${p.is_owner?`<div class="class-leader-control">
      <select id="class-leader-select" class="control">
        <option value="">Pilih anggota…</option>
        ${candidates.map(m=>`<option value="${esc(m.user_id)}" ${leader&&String(leader.user_id)===String(m.user_id)?'selected':''}>${esc(m.full_name||m.username)} · ${esc(roleLabel(m.class_role))}</option>`).join('')}
      </select>
      <button type="button" id="save-class-leader" class="btn btn-primary">Tetapkan</button>
    </div>`:''}
  </div>`;

  return `<section class="panel members-room-panel">
    <div class="panel-head">
      <div>
        <div class="panel-title">Anggota & Ketua Kelas</div>
        <p class="panel-copy">Kelola anggota dan jabatan Ketua Kelas. Perubahan role teknis hanya dapat dilakukan Owner melalui Pengaturan Kelas.</p>
      </div>
      <span class="soft-chip">${items.length} anggota</span>
    </div>
    ${leaderCard}
    <div class="member-list member-list-v52">
      ${pageItems.length?pageItems.map(m=>memberRow(m,p)).join(''):'<div class="search-empty">Belum ada anggota.</div>'}
    </div>
    ${classMembersPaginationHtml(classMembersPage,totalPages,items.length)}
  </section>`;
}

function classMembersPaginationHtml(page,totalPages,total){
  if(totalPages<=1)return `<div class="table-pagination compact"><span>${total} anggota</span></div>`;
  const pages=[];
  for(let i=Math.max(1,page-2);i<=Math.min(totalPages,page+2);i++){
    pages.push(`<button type="button" data-class-members-page="${i}" class="${i===page?'active':''}">${i}</button>`);
  }
  return `<div class="table-pagination class-members-pagination">
    <span>${total} anggota • Halaman ${page}/${totalPages}</span>
    <div>
      <button type="button" data-class-members-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>‹</button>
      ${pages.join('')}
      <button type="button" data-class-members-page="${Math.min(totalPages,page+1)}" ${page>=totalPages?'disabled':''}>›</button>
    </div>
  </div>`;
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
  if(base==='TEACHER')return 'Pengajar · Monitoring'+(m.is_class_leader?' · Ketua Kelas':'');
  if(base==='OBSERVER')return 'Pengamat · Read-only'+(m.is_class_leader?' · Ketua Kelas':'');
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
    if(role==='TEACHER')badges.push('<span class="role-pill role-teacher">Pengajar</span>');
    if(role==='OBSERVER')badges.push('<span class="role-pill role-observer">Pengamat</span>');
  }
  if(m.is_class_leader)badges.push('<span class="role-pill leader-role-pill">Ketua Kelas</span>');
  return badges.join('');
}
function memberRow(m,p) {
  const canRemove=p.can_manage_members && m.class_role!=='OWNER';
  const academic=[m.study_program,m.cohort].filter(Boolean).join(' · ') || '-';
  return `<div class="member-row member-row-v52">
    <div class="member-avatar">${avatarMarkup(m)}</div>
    <div class="member-main-v52">
      <strong class="member-name-v52">${esc(m.full_name||m.username)}</strong>
      <span class="member-id-v52">@${esc(m.username||'-')} · ${esc(m.kelasku_id||'-')}</span>
      <span class="member-bio-mobile-v6722">@${esc(m.username||'-')} · ${esc(academic)}</span>
    </div>
    <div class="member-academic-v52">${esc(academic)}</div>
    <div class="member-side member-side-v52">
      <div class="member-badges">${memberBadgesHtml(m)}</div>
      ${canRemove?`<button class="member-remove-btn" data-remove-user="${esc(m.user_id)}" title="Keluarkan anggota" aria-label="Keluarkan ${esc(m.full_name||m.username)}">
        <span class="material-symbols-rounded">person_remove</span>
      </button>`:''}
    </div>
  </div>`;
}

function requestsHtml(data) {
  const items=data.pending_requests||[];
  return `<section class="panel"><div class="panel-head"><div><div class="panel-title">Permintaan Bergabung</div><p class="panel-copy">Setiap tindakan dikunci selama request berjalan agar tidak terkirim dua kali.</p></div></div><div class="member-list">${items.length?items.map(r=>`<div class="member-row join-request-row" data-request-row="${esc(r.request_id)}"><div class="member-avatar">${avatarMarkup(r)}</div><div class="member-info"><strong>${esc(r.full_name||r.username)}</strong><span>@${esc(r.username||'-')} · ${esc(r.kelasku_id||'-')}</span><small>${esc(r.message||'Tanpa pesan')}</small><span class="inline-request-status" data-request-status></span></div><div class="member-actions"><button class="btn btn-secondary small-btn" data-request="${esc(r.request_id)}" data-decision="REJECT">Tolak</button><button class="btn btn-primary small-btn" data-request="${esc(r.request_id)}" data-decision="APPROVE">Terima</button></div></div>`).join(''):'<div class="search-empty">Tidak ada permintaan yang menunggu.</div>'}</div></section>`;
}


const CLASS_APPEARANCE_META = Object.freeze({
  HERO_DESKTOP:{label:'Hero Kelas — Desktop',size:'2048 × 384 px',ratio:'5.33 : 1',width:2048,height:384,category:'hero'},
  HERO_MOBILE:{label:'Hero Kelas — Mobile',size:'1440 × 320 px',ratio:'4.50 : 1',width:1440,height:320,category:'hero'},
  CARD_SQUARE:{label:'Foto Kelas',size:'800 × 800 px',ratio:'1 : 1',width:800,height:800,category:'icon'},
  LANDING_ACCESS:{label:'Informasi Kelas',size:'1440 × 240 px',ratio:'6 : 1',width:1440,height:240,category:'landing'},
  LANDING_LINKS:{label:'Link Cepat',size:'1440 × 240 px',ratio:'6 : 1',width:1440,height:240,category:'landing'},
  LANDING_SHOWCASE:{label:'Kenal KelasKu',size:'1440 × 240 px',ratio:'6 : 1',width:1440,height:240,category:'landing'},
  LANDING_BG_DESKTOP:{label:'Background Landing — Desktop',size:'1920 × 1080 px',ratio:'16 : 9',width:1920,height:1080,category:'landing'},
  LANDING_BG_MOBILE:{label:'Background Landing — Mobile',size:'1080 × 1920 px',ratio:'9 : 16',width:1080,height:1920,category:'landing'}
});
const HERO_MASTER_META=Object.freeze({width:2048,height:384,mobileWidth:1440,mobileHeight:320,size:'2048 × 384 px'});
const CLASS_ICON_PRESETS=Object.freeze([
  ['school','Kelas'],['language','Bahasa'],['menu_book','Buku'],['calculate','Ekonomi'],['science','Sains'],['computer','Teknologi'],['groups','Komunitas'],['account_balance','Institusi'],['psychology','Belajar'],['history_edu','Akademik'],['business_center','Bisnis'],['sports_soccer','Olahraga']
]);
const LANDING_PRESET_ASSETS=Object.freeze({
  ACCESS:{label:'Informasi / Akses Kelas',desktop:'assets/public/hero-access.webp?v=680',mobile:'assets/public/hero-access.webp?v=680'},
  LINKS:{label:'Link Cepat',desktop:'assets/public/hero-links.webp?v=680',mobile:'assets/public/hero-links.webp?v=680'},
  SHOWCASE:{label:'Kenal KelasKu',desktop:'assets/public/hero-showcase.webp?v=680',mobile:'assets/public/hero-showcase.webp?v=680'},
  CAMPUS:{label:'Kampus / Lapangan',desktop:'assets/public/campus-landscape-desktop.png?v=680',mobile:'assets/public/campus-landscape-mobile.png?v=680'}
});
const LANDING_PAGE_BG_PRESETS=Object.freeze([['MIDNIGHT','Midnight Grid','Deep navy, bersih, profesional.'],['AURORA','Aurora Indigo','Indigo glow modern tanpa neon berlebihan.'],['EMERALD','Emerald Flow','Navy dengan aksen emerald yang tenang.']]);
const LANDING_SECTION_META=Object.freeze({
  access:{label:'Informasi Kelas',copy:'Header jadwal, presensi, tugas, dan informasi kelas.',slot:'LANDING_ACCESS'},
  links:{label:'Link Cepat',copy:'Header akses grup, meeting, drive, dan tautan penting.',slot:'LANDING_LINKS'},
  showcase:{label:'Kenal KelasKu',copy:'Header section pengenalan fitur KelasKu.',slot:'LANDING_SHOWCASE'}
});
const APPEARANCE_PAGE_SIZE=12;
let appearanceOpenCategory='';
let appearanceDraft=null;
let appearanceAlbumPage=1;
let appearanceAlbumFilter='ALL';
let activeClassSettingPane='identity';

function classHeroCacheKey(classId=''){ return `kelasku_class_hero_cache_v6733_${String(classId||'').trim()}`; }
function readClassHeroCache(classId=''){
  if(!classId)return {};
  try{return JSON.parse(localStorage.getItem(classHeroCacheKey(classId))||'{}')||{};}catch{return {};}
}
function syncClassHeroCache(data,{authoritative=false}={}){
  const classId=String(data?.class?.class_id||state.selectedClassId||'').trim();
  if(!classId)return;
  const active=data?.appearance?.active||{};
  const prev=readClassHeroCache(classId);
  const next={
    desktop:String(active?.HERO_DESKTOP?.url||active?.ROOM_DESKTOP?.url||(!authoritative?prev.desktop:'')||''),
    mobile:String(active?.HERO_MOBILE?.url||active?.ROOM_MOBILE?.url||(!authoritative?prev.mobile:'')||'')
  };
  try{localStorage.setItem(classHeroCacheKey(classId),JSON.stringify(next));}catch{}
}
function syncPublicLandingAppearanceCache(data){
  const classId=String(data?.class?.class_id||state.selectedClassId||'');
  if(!classId)return;
  try{
    const active=data?.appearance?.active||{};
    const hero={
      desktop:String(active?.HERO_DESKTOP?.url||active?.ROOM_DESKTOP?.url||''),
      mobile:String(active?.HERO_MOBILE?.url||active?.ROOM_MOBILE?.url||'')
    };
    const refs=[String(data?.class?.class_code||'').replace(/^KLS-/i,'').toLowerCase(),String(data?.class?.public_slug||'').trim().toLowerCase()].filter(Boolean);
    refs.forEach(ref=>localStorage.setItem(`kelasku_public_appearance_v6733_${ref}`,JSON.stringify(hero)));
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      if(!key.startsWith('kelasku_public_links_cache_v676_'))continue;
      const cached=JSON.parse(localStorage.getItem(key)||'null');
      if(String(cached?.data?.class?.class_id||'')!==classId)continue;
      cached.data.appearance=data?.appearance||cached.data.appearance||{};
      cached.at=Date.now();
      localStorage.setItem(key,JSON.stringify(cached));
    }
  }catch{}
}
function persistCurrentClassVisualCache(data){
  const classId=String(data?.class?.class_id||state.selectedClassId||'');
  if(!classId||!data)return;
  syncClassHeroCache(data,{authoritative:true});
  syncPublicLandingAppearanceCache(data);
  try{
    state.classDetails ||= {};
    state.classDetailsAt ||= {};
    state.classDetails[classId]=data;
    state.classDetailsAt[classId]=Date.now();
    localStorage.setItem('kelasku_class_details_cache',JSON.stringify(state.classDetails));
    localStorage.setItem('kelasku_class_details_cache_at',JSON.stringify(state.classDetailsAt));
  }catch{}
}
function classAppearanceUrl(data,slot,fallback=''){
  const direct=data?.appearance?.active?.[slot]?.url || (slot==='HERO_DESKTOP'?data?.appearance?.active?.ROOM_DESKTOP?.url:'') || (slot==='HERO_MOBILE'?data?.appearance?.active?.ROOM_MOBILE?.url:'');
  const classId=String(data?.class?.class_id||state.selectedClassId||'');
  if(direct){
    const prev=readClassHeroCache(classId);
    const next={...prev,[slot==='HERO_DESKTOP'?'desktop':'mobile']:String(direct)};
    try{localStorage.setItem(classHeroCacheKey(classId),JSON.stringify(next));}catch{}
    return direct;
  }
  const cached=readClassHeroCache(classId);
  const saved=slot==='HERO_DESKTOP'?cached.desktop:slot==='HERO_MOBILE'?cached.mobile:'';
  return saved || fallback;
}
function appearanceFallback(slot){
  if(slot==='HERO_DESKTOP')return 'assets/classroom/hero-room-default-desktop.jpg?v=680';
  if(slot==='HERO_MOBILE')return 'assets/classroom/hero-room-default-mobile.jpg?v=680';
  return '';
}
function currentClassIcon(data){ return String(data?.class?.icon_key || data?.appearance?.icon_key || 'school').trim() || 'school'; }
function appearanceCategoryForSlot(slot){ return CLASS_APPEARANCE_META[slot]?.category || 'album'; }
function landingSectionKeyFromSlot(slot){ return ({LANDING_ACCESS:'access',LANDING_LINKS:'links',LANDING_SHOWCASE:'showcase'})[slot]||''; }
function appearanceMediaById(data,id){ return (data?.appearance?.library||[]).find(x=>String(x.media_id||'')===String(id||''))||null; }
function ensureAppearanceDraft(data){
  const classId=String(data?.class?.class_id||state.selectedClassId||'');
  if(appearanceDraft?.classId===classId)return appearanceDraft;
  const card=data?.appearance?.active?.CARD_SQUARE||null;
  const landing={};
  Object.entries(LANDING_SECTION_META).forEach(([section,meta])=>{
    const custom=data?.appearance?.active?.[meta.slot]||null;
    landing[section]=custom?{type:'MEDIA',mediaId:custom.media_id,preset:''}:{type:'PRESET',mediaId:'',preset:String(data?.appearance?.landing_sections?.[section]||section).toUpperCase()};
  });
  appearanceDraft={classId,dirty:false,iconMode:card?'MEDIA':'PRESET',iconKey:currentClassIcon(data),iconMediaId:card?.media_id||'',landing};
  return appearanceDraft;
}
function resetAppearanceDraft(data){ appearanceDraft=null; ensureAppearanceDraft(data); }
function setAppearanceDirty(){ if(appearanceDraft)appearanceDraft.dirty=true; }
function draftLandingConfig(section,data){ return ensureAppearanceDraft(data).landing[section]||{type:'PRESET',preset:String(section).toUpperCase(),mediaId:''}; }
function draftLandingPreview(section,data){
  const cfg=draftLandingConfig(section,data),meta=LANDING_SECTION_META[section];
  if(cfg.type==='MEDIA'){
    const item=appearanceMediaById(data,cfg.mediaId)||data?.appearance?.active?.[meta.slot];
    if(item?.url)return {desktop:item.url,mobile:item.url,label:'Custom kelas'};
  }
  const preset=LANDING_PRESET_ASSETS[String(cfg.preset||section).toUpperCase()]||LANDING_PRESET_ASSETS[String(section).toUpperCase()]||LANDING_PRESET_ASSETS.ACCESS;
  return {...preset,label:preset.label};
}
function appearanceCategorySummary(key,data){
  if(key==='hero')return data?.appearance?.active?.HERO_DESKTOP?'Custom aktif':'Default KelasKu';
  if(key==='icon')return ensureAppearanceDraft(data).iconMode==='MEDIA'?'Foto custom':(CLASS_ICON_PRESETS.find(x=>x[0]===ensureAppearanceDraft(data).iconKey)?.[1]||'Kelas');
  if(key==='landing')return '3 section';
  return `${appearanceLibraryGroups(data).length} item`;
}
function appearanceCategory(key,icon,title,copy,body,data){
  const open=appearanceOpenCategory===key;
  return `<section class="appearance-category ${open?'is-open':''}" data-appearance-category="${key}">
    <button type="button" class="appearance-category-head" data-appearance-category-toggle="${key}" aria-expanded="${open?'true':'false'}">
      <span class="appearance-category-icon material-symbols-rounded">${icon}</span>
      <span class="appearance-category-copy"><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>
      <span class="appearance-category-summary">${esc(appearanceCategorySummary(key,data))}</span>
      <span class="appearance-category-chevron material-symbols-rounded">expand_more</span>
    </button>
    <div class="appearance-category-body" ${open?'':'hidden'}>${body}</div>
  </section>`;
}
function heroSettingsHtml(data){
  const desktop=classAppearanceUrl(data,'HERO_DESKTOP',appearanceFallback('HERO_DESKTOP'));
  const mobile=classAppearanceUrl(data,'HERO_MOBILE',appearanceFallback('HERO_MOBILE'));
  return `<div class="appearance-category-note"><span class="material-symbols-rounded">wallpaper</span><div><strong>Desktop dan Mobile diatur terpisah.</strong><small>Room Class dan Landing Page memakai hero yang sama sesuai perangkat. Desktop: ${CLASS_APPEARANCE_META.HERO_DESKTOP.size}. Mobile: ${CLASS_APPEARANCE_META.HERO_MOBILE.size}.</small></div></div>
    <div class="hero-slot-grid-v6732">
      <article class="hero-slot-card-v6732">
        <div class="hero-slot-head-v6732"><div><strong>Desktop</strong><small>${CLASS_APPEARANCE_META.HERO_DESKTOP.size} · rasio ${CLASS_APPEARANCE_META.HERO_DESKTOP.ratio}</small></div>${data?.appearance?.active?.HERO_DESKTOP?'<span class="album-active-chip hero-slot-active-v6732">AKTIF</span>':'<span class="hero-slot-default-v6732">DEFAULT</span>'}</div>
        <img src="${esc(desktop)}" alt="Hero Desktop" loading="lazy">
        <div class="hero-slot-actions-v6732"><label class="btn btn-primary small-btn"><span class="material-symbols-rounded">upload</span> Upload Desktop<input type="file" accept="image/png,image/jpeg,image/webp" data-hero-slot-file="HERO_DESKTOP" hidden></label>${data?.appearance?.active?.HERO_DESKTOP?'<button type="button" class="btn btn-secondary small-btn" data-hero-slot-default="HERO_DESKTOP">Default</button>':''}</div>
      </article>
      <article class="hero-slot-card-v6732">
        <div class="hero-slot-head-v6732"><div><strong>Mobile</strong><small>${CLASS_APPEARANCE_META.HERO_MOBILE.size} · rasio ${CLASS_APPEARANCE_META.HERO_MOBILE.ratio}</small></div>${data?.appearance?.active?.HERO_MOBILE?'<span class="album-active-chip hero-slot-active-v6732">AKTIF</span>':'<span class="hero-slot-default-v6732">DEFAULT</span>'}</div>
        <img src="${esc(mobile)}" alt="Hero Mobile" loading="lazy">
        <div class="hero-slot-actions-v6732"><label class="btn btn-primary small-btn"><span class="material-symbols-rounded">upload</span> Upload Mobile<input type="file" accept="image/png,image/jpeg,image/webp" data-hero-slot-file="HERO_MOBILE" hidden></label>${data?.appearance?.active?.HERO_MOBILE?'<button type="button" class="btn btn-secondary small-btn" data-hero-slot-default="HERO_MOBILE">Default</button>':''}</div>
      </article>
    </div>`;
}
function iconSettingsHtml(data){
  const draft=ensureAppearanceDraft(data);
  const customItems=(data?.appearance?.library||[]).filter(x=>x.slot==='CARD_SQUARE'&&x.url&&String(x.status||'').toUpperCase()!=='DELETED');
  return `<div class="appearance-category-note"><span class="material-symbols-rounded">category</span><div><strong>Pilih dulu, simpan sekali.</strong><small>Klik icon/foto hanya mengubah pilihan di layar. Tidak ada request sampai tombol Simpan Perubahan ditekan.</small></div></div>
    <div class="class-icon-radio-grid">${CLASS_ICON_PRESETS.map(([key,label])=>`<label class="class-icon-radio ${draft.iconMode==='PRESET'&&draft.iconKey===key?'selected':''}"><input type="radio" name="class-icon-draft" value="${key}" ${draft.iconMode==='PRESET'&&draft.iconKey===key?'checked':''}><span class="material-symbols-rounded">${key}</span><small>${esc(label)}</small></label>`).join('')}</div>
    <div class="appearance-mini-head"><div><strong>Foto kelas</strong><small>800 × 800 px · tampil di daftar kelas dan frame identitas hero.</small></div><label class="btn btn-secondary small-btn"><span class="material-symbols-rounded">add_photo_alternate</span> Upload Foto<input type="file" accept="image/png,image/jpeg,image/webp" data-icon-draft-file hidden></label></div>
    <div class="icon-custom-radio-grid">${customItems.length?customItems.map(item=>`<label class="icon-custom-radio ${draft.iconMode==='MEDIA'&&String(draft.iconMediaId)===String(item.media_id)?'selected':''}"><input type="radio" name="class-icon-custom-draft" value="${esc(item.media_id)}" ${draft.iconMode==='MEDIA'&&String(draft.iconMediaId)===String(item.media_id)?'checked':''}><img src="${esc(item.url)}" alt="Foto kelas" loading="lazy"><span>${draft.iconMode==='MEDIA'&&String(draft.iconMediaId)===String(item.media_id)?'Dipilih':'Pilih'}</span></label>`).join(''):'<div class="appearance-inline-empty">Belum ada foto custom.</div>'}</div>`;
}
function landingPageBackgroundHtml(data){
  const active=data?.appearance?.active||{},preset=String(data?.appearance?.landing_page_background?.preset||'MIDNIGHT').toUpperCase();
  const desktop=active.LANDING_BG_DESKTOP?.url||'',mobile=active.LANDING_BG_MOBILE?.url||desktop;
  return `<div class="landing-page-bg-manager"><div class="appearance-mini-head"><div><strong>Background Utama Landing Page</strong><small>Per kelas · Default ringan tanpa download. Custom: Desktop 1920 × 1080, Mobile 1080 × 1920.</small></div></div><div class="landing-page-bg-presets">${LANDING_PAGE_BG_PRESETS.map(([key,label,copy])=>`<button type="button" class="landing-page-bg-preset preset-${key.toLowerCase()} ${!desktop&&!mobile&&preset===key?'selected':''}" data-landing-page-preset="${key}"><span></span><strong>${label}</strong><small>${copy}</small></button>`).join('')}</div><div class="landing-page-bg-upload-grid"><article><div><strong>Desktop</strong><small>1920 × 1080 px · 16:9</small></div>${desktop?`<img src="${esc(desktop)}" alt="Background Landing Desktop" loading="lazy">`:'<div class="landing-page-bg-empty preset-'+preset.toLowerCase()+'">PRESET</div>'}<label class="btn btn-secondary small-btn"><span class="material-symbols-rounded">upload</span> Upload Desktop<input type="file" accept="image/png,image/jpeg,image/webp" data-landing-page-bg-file="LANDING_BG_DESKTOP" hidden></label></article><article><div><strong>Mobile</strong><small>1080 × 1920 px · 9:16</small></div>${mobile?`<img src="${esc(mobile)}" alt="Background Landing Mobile" loading="lazy">`:'<div class="landing-page-bg-empty preset-'+preset.toLowerCase()+'">PRESET</div>'}<label class="btn btn-secondary small-btn"><span class="material-symbols-rounded">upload</span> Upload Mobile<input type="file" accept="image/png,image/jpeg,image/webp" data-landing-page-bg-file="LANDING_BG_MOBILE" hidden></label></article></div><div class="appearance-category-note compact"><span class="material-symbols-rounded">bolt</span><div><strong>Anti-flicker.</strong><small>Preset tampil instan. Background custom dicache, dipreload, lalu dipasang setelah decode — Landing tidak menunggu gambar untuk render.</small></div></div></div>`;
}
async function setLandingPageBackgroundPreset(key,data){
  try{const result=await api('setClassLandingBackgroundPreset',{class_id:state.selectedClassId,preset:key},{onSlow:()=>toast('Masih menyimpan background…')});if(currentClassData){currentClassData.appearance=result.appearance||currentClassData.appearance;state.classDetails[state.selectedClassId]=currentClassData;persistCurrentClassVisualCache(currentClassData);}toast('Background Landing diperbarui.');appearanceOpenCategory='landing';renderAppearancePaneOnly(currentClassData||data);}catch(err){toast(err.message);}
}
function landingSettingsHtml(data){
  return `${landingPageBackgroundHtml(data)}<div class="appearance-category-note"><span class="material-symbols-rounded">dashboard_customize</span><div><strong>Setiap section cukup tampilkan preview aktif.</strong><small>Klik Ganti Background untuk memilih preset bawaan, gambar album, atau upload sendiri. Semua perubahan disimpan sekaligus.</small></div></div>
    <div class="landing-simple-grid">${Object.entries(LANDING_SECTION_META).map(([section,meta])=>{const preview=draftLandingPreview(section,data);return `<article class="landing-simple-card"><div><strong>${esc(meta.label)}</strong><small>${esc(meta.copy)}</small></div><picture><source media="(max-width:720px)" srcset="${esc(preview.mobile)}"><img src="${esc(preview.desktop)}" alt="${esc(meta.label)}" loading="lazy"></picture><div class="landing-simple-foot"><span>${esc(preview.label||'Background aktif')}</span><button type="button" class="btn btn-secondary small-btn" data-landing-background-open="${section}">Ganti Background</button></div></article>`;}).join('')}</div>`;
}
function appearanceLibraryGroups(data){
  const rows=(data?.appearance?.library||[]).filter(x=>x?.media_id&&x?.url&&String(x.status||'').toUpperCase()!=='DELETED');
  const groups=[],used=new Set();
  rows.forEach(item=>{
    if(used.has(item.media_id))return;
    if((item.slot==='HERO_DESKTOP'||item.slot==='HERO_MOBILE')&&String(item.pair_id||'').startsWith('PAIR_')){
      const mate=rows.find(x=>x.media_id!==item.media_id&&x.pair_id===item.pair_id&&(x.slot==='HERO_DESKTOP'||x.slot==='HERO_MOBILE'));
      const desktop=item.slot==='HERO_DESKTOP'?item:mate, mobile=item.slot==='HERO_MOBILE'?item:mate;
      if(desktop&&mobile){used.add(desktop.media_id);used.add(mobile.media_id);groups.push({kind:'HERO_PAIR',category:'HERO',title:'Hero Kelas',url:desktop.url,pairId:item.pair_id,mediaIds:[desktop.media_id,mobile.media_id],active:Boolean(desktop.active&&mobile.active),created_at:desktop.created_at||mobile.created_at});return;}
    }
    used.add(item.media_id);
    const category=item.slot==='CARD_SQUARE'?'CARD':item.slot?.startsWith('LANDING_')?'LANDING':'HERO';
    groups.push({kind:'MEDIA',category,title:CLASS_APPEARANCE_META[item.slot]?.label||'Media Kelas',url:item.url,slot:item.slot,mediaId:item.media_id,active:Boolean(item.active),created_at:item.created_at,filename:item.filename||''});
  });
  return groups;
}
function classAppearanceLibraryHtml(data){
  const all=appearanceLibraryGroups(data);
  const filtered=appearanceAlbumFilter==='ALL'?all:all.filter(x=>x.category===appearanceAlbumFilter);
  const pages=Math.max(1,Math.ceil(filtered.length/APPEARANCE_PAGE_SIZE));appearanceAlbumPage=Math.min(Math.max(1,appearanceAlbumPage),pages);
  const pageItems=filtered.slice((appearanceAlbumPage-1)*APPEARANCE_PAGE_SIZE,appearanceAlbumPage*APPEARANCE_PAGE_SIZE);
  return `<div class="album-toolbar"><div class="album-filter-chips">${[['ALL','Semua'],['HERO','Hero'],['CARD','Foto Kelas'],['LANDING','Landing']].map(([key,label])=>`<button type="button" class="filter-chip ${appearanceAlbumFilter===key?'active':''}" data-album-filter="${key}">${label}</button>`).join('')}</div><span>${filtered.length} item</span></div>
    ${pageItems.length?`<div class="appearance-album-grid">${pageItems.map((item,index)=>`<article class="album-tile ${item.active?'is-active':''}"><img src="${esc(item.url)}" alt="${esc(item.title)}" loading="lazy"><div class="album-tile-meta"><strong>${esc(item.title)}</strong><small>${item.created_at?esc(new Date(item.created_at).toLocaleDateString('id-ID')):''}</small></div>${item.active?'<span class="album-active-chip">AKTIF</span>':''}<button type="button" class="album-more-btn" data-album-menu="${index}" aria-label="Menu gambar"><span class="material-symbols-rounded">more_vert</span></button><div class="album-tile-menu" data-album-menu-panel="${index}" hidden>${item.kind==='HERO_PAIR'?`<button type="button" data-hero-pair-use="${esc(item.pairId)}" ${item.active?'disabled':''}>Gunakan</button><button type="button" data-appearance-preview="${esc(item.url)}">Preview</button><button type="button" class="danger" data-hero-pair-delete="${esc(item.pairId)}">Hapus Permanen</button>`:`<button type="button" data-album-use-media="${esc(item.mediaId)}" data-album-use-slot="${esc(item.slot||'')}">Gunakan</button><button type="button" data-appearance-preview="${esc(item.url)}">Preview</button><button type="button" class="danger" data-appearance-delete="${esc(item.mediaId)}" data-appearance-delete-slot="${esc(item.slot||'')}">Hapus Permanen</button>`}</div></article>`).join('')}</div>`:'<div class="appearance-library-empty"><span class="material-symbols-rounded">photo_library</span><div><strong>Belum ada gambar di kategori ini.</strong><small>Upload baru akan tersimpan di album kelas.</small></div></div>'}
    ${pages>1?`<div class="album-pagination"><button type="button" class="btn btn-secondary small-btn" data-album-page="${appearanceAlbumPage-1}" ${appearanceAlbumPage<=1?'disabled':''}>Sebelumnya</button><span>${appearanceAlbumPage} / ${pages}</span><button type="button" class="btn btn-secondary small-btn" data-album-page="${appearanceAlbumPage+1}" ${appearanceAlbumPage>=pages?'disabled':''}>Berikutnya</button></div>`:''}`;
}
function appearanceSaveBar(data){ const draft=ensureAppearanceDraft(data);return `<div class="appearance-savebar ${draft.dirty?'is-dirty':''}"><div><strong>${draft.dirty?'Ada perubahan belum disimpan':'Tampilan tersimpan'}</strong><small>${draft.dirty?'Periksa pilihan lalu simpan sekali.':'Hero disimpan langsung; background section Landing memakai draft.'}</small></div><div><button type="button" class="btn btn-secondary" data-appearance-cancel ${draft.dirty?'':'disabled'}>Batal</button><button type="button" class="btn btn-primary" data-appearance-save ${draft.dirty?'':'disabled'}>Simpan Perubahan</button></div></div>`; }
function classAppearanceHtml(data){
  ensureAppearanceDraft(data);
  return `<div class="appearance-settings-v6731"><div class="appearance-guide appearance-guide-compact"><span class="material-symbols-rounded">palette</span><div><strong>Tampilan tersimpan khusus kelas ini.</strong><small>Hero Desktop dan Mobile diatur terpisah, Landing memakai preset/custom, dan Album tetap menyimpan riwayat media.</small></div></div><div class="appearance-category-list">${appearanceCategory('hero','wallpaper','Hero Kelas','Desktop + Mobile → Room + Landing',heroSettingsHtml(data),data)}${appearanceCategory('landing','dashboard_customize','Landing Page','Background per section',landingSettingsHtml(data),data)}${appearanceCategory('album','photo_library','Album Tampilan','Grid, filter, paging, hapus permanen',classAppearanceLibraryHtml(data),data)}</div>${appearanceSaveBar(data)}</div>`;
}
function setAppearanceCategory(key){
  appearanceOpenCategory=appearanceOpenCategory===key?'':key;
  document.querySelectorAll('[data-appearance-category]').forEach(section=>{const active=section.dataset.appearanceCategory===appearanceOpenCategory;section.classList.toggle('is-open',active);const head=section.querySelector('[data-appearance-category-toggle]'),body=section.querySelector('.appearance-category-body');head?.setAttribute('aria-expanded',active?'true':'false');if(body)body.hidden=!active;});
}
function renderAppearancePaneOnly(data){
  const pane=document.querySelector('[data-class-setting-pane="appearance"]');if(!pane)return;
  pane.innerHTML=`<div class="settings-compact-head"><div><h2>Tampilan Kelas</h2><p>Hero Room + Landing, background section Landing, dan album.</p></div><span class="material-symbols-rounded">palette</span></div>${classAppearanceHtml(data)}`;
  bindClassAppearanceSettings(data);activateClassSettingPane('appearance');
}
function cropCanvasBlob(canvas,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Gambar gagal diproses.')),'image/jpeg',quality));}
function cropRectFor(img,targetW,targetH,focusX=.5,focusY=.5,zoom=1){
  const nw=img.naturalWidth,nh=img.naturalHeight,targetRatio=targetW/targetH,nativeRatio=nw/nh;let sw,sh;
  if(nativeRatio>targetRatio){sh=nh;sw=nh*targetRatio;}else{sw=nw;sh=nw/targetRatio;}
  sw/=zoom;sh/=zoom;const sx=Math.max(0,Math.min(nw-sw,focusX*nw-sw/2)),sy=Math.max(0,Math.min(nh-sh,focusY*nh-sh/2));return {sx,sy,sw,sh};
}
async function croppedJpegData(img,w,h,focusX,focusY,zoom,maxBytes=730000){
  const rect=cropRectFor(img,w,h,focusX,focusY,zoom),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false});ctx.drawImage(img,rect.sx,rect.sy,rect.sw,rect.sh,0,0,w,h);let quality=.9,blob=await cropCanvasBlob(canvas,quality);while(blob.size>maxBytes&&quality>.5){quality=Math.max(.5,quality-.08);blob=await cropCanvasBlob(canvas,quality);}if(blob.size>800000)throw new Error('Hasil gambar masih terlalu besar.');return {dataUrl:await fileToDataUrl(blob),blob};
}
function bindFocusStage(stage,img,getState,setState,renderAll){
  let dragging=false,lastX=0,lastY=0;
  stage.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;stage.setPointerCapture?.(e.pointerId);});
  stage.addEventListener('pointermove',e=>{if(!dragging)return;const st=getState(),scale=Math.max(stage.clientWidth/img.naturalWidth,stage.clientHeight/img.naturalHeight)*st.zoom;const fx=Math.max(0,Math.min(1,st.focusX-(e.clientX-lastX)/(img.naturalWidth*scale))),fy=Math.max(0,Math.min(1,st.focusY-(e.clientY-lastY)/(img.naturalHeight*scale)));lastX=e.clientX;lastY=e.clientY;setState({...st,focusX:fx,focusY:fy});renderAll();});
  const stop=e=>{dragging=false;try{stage.releasePointerCapture?.(e.pointerId);}catch{}};stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);
}
function renderFocusPreview(stage,img,state){
  if(!stage||!img.naturalWidth)return;const scale=Math.max(stage.clientWidth/img.naturalWidth,stage.clientHeight/img.naturalHeight)*state.zoom,dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;let left=stage.clientWidth/2-state.focusX*dw,top=stage.clientHeight/2-state.focusY*dh;left=Math.min(0,Math.max(stage.clientWidth-dw,left));top=Math.min(0,Math.max(stage.clientHeight-dh,top));img.style.width=`${dw}px`;img.style.height=`${dh}px`;img.style.left=`${left}px`;img.style.top=`${top}px`;}
function openHeroMasterCropper(file,data){
  const objectUrl=URL.createObjectURL(file);let cropState={focusX:.5,focusY:.5,zoom:1};
  showModal(`<div class="modal-head"><div><div class="eyebrow">HERO KELAS</div><h2>Satu gambar untuk Desktop + Mobile</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="hero-pair-cropper"><div class="appearance-crop-help"><span class="material-symbols-rounded">open_with</span><span>Geser gambar pada salah satu preview. Titik fokus yang sama dipakai untuk Desktop dan Mobile agar hasil tetap konsisten.</span></div><div class="hero-pair-stages"><div><small>Desktop · 2048 × 384</small><div class="appearance-crop-stage" data-hero-stage="desktop" style="aspect-ratio:2048/384"><img src="${esc(objectUrl)}" alt="Preview Desktop" draggable="false"></div></div><div><small>Mobile · 1440 × 320</small><div class="appearance-crop-stage" data-hero-stage="mobile" style="aspect-ratio:1440/320"><img src="${esc(objectUrl)}" alt="Preview Mobile" draggable="false"></div></div></div><label class="appearance-zoom-control"><span>Zoom</span><input data-hero-zoom type="range" min="1" max="2.4" step="0.01" value="1"><b data-hero-zoom-value>100%</b></label><div class="request-status" data-hero-crop-status></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="button" class="btn btn-primary" data-hero-crop-save>Simpan Hero</button></div></div>`);
  const stages=[...document.querySelectorAll('[data-hero-stage]')],imgs=stages.map(x=>x.querySelector('img')),slider=document.querySelector('[data-hero-zoom]'),value=document.querySelector('[data-hero-zoom-value]'),save=document.querySelector('[data-hero-crop-save]'),status=document.querySelector('[data-hero-crop-status]');
  const render=()=>{imgs.forEach((img,i)=>renderFocusPreview(stages[i],img,cropState));if(value)value.textContent=`${Math.round(cropState.zoom*100)}%`;};
  const bindHeroStages=()=>{render();stages.forEach((stage,i)=>{const img=imgs[i];if(img.dataset.dragBound==='1')return;const bind=()=>{if(img.dataset.dragBound==='1'||!img.naturalWidth)return;img.dataset.dragBound='1';bindFocusStage(stage,img,()=>cropState,v=>cropState=v,render);render();};if(img.complete&&img.naturalWidth)bind();else img.addEventListener('load',bind,{once:true});});};
  imgs[0].addEventListener('load',bindHeroStages,{once:true});if(imgs[0].complete&&imgs[0].naturalWidth)bindHeroStages();
  slider?.addEventListener('input',()=>{cropState.zoom=Number(slider.value||1);render();});
  save?.addEventListener('click',async()=>{if(save.disabled)return;save.disabled=true;const old=save.innerHTML;save.innerHTML='<span class="btn-spinner"></span><span>Memproses…</span>';try{const master=imgs[0];if(!master.naturalWidth)throw new Error('Gambar belum siap.');status.className='request-status progress';status.textContent='Membuat versi Desktop dan Mobile…';const desktop=await croppedJpegData(master,2048,384,cropState.focusX,cropState.focusY,cropState.zoom),mobile=await croppedJpegData(master,1440,320,cropState.focusX,cropState.focusY,cropState.zoom);status.textContent='Mengunggah dua versi dalam satu proses…';const result=await api('uploadClassHeroPair',{class_id:state.selectedClassId,filename:file.name,desktop_data_url:desktop.dataUrl,mobile_data_url:mobile.dataUrl},{onSlow:()=>{status.textContent='Masih menyimpan ke Drive…';}});if(currentClassData){currentClassData.appearance=result.appearance||currentClassData.appearance;state.classDetails[state.selectedClassId]=currentClassData;persistCurrentClassVisualCache(currentClassData);}closeModal();toast('Hero Desktop + Mobile tersimpan.');renderAppearancePaneOnly(currentClassData||data);applyRoomHeroAppearance(currentClassData||data);}catch(err){status.className='request-status error';status.textContent=err.message;save.disabled=false;save.innerHTML=old;toast(err.message);}finally{URL.revokeObjectURL(objectUrl);}});
}
function openSingleAppearanceCropper(slot,file,data,onUploaded,options={}){
  const meta=CLASS_APPEARANCE_META[slot];if(!meta)return;const activate=Boolean(options.activate),saveLabel=String(options.saveLabel||'Simpan ke Album');const objectUrl=URL.createObjectURL(file);let cropState={focusX:.5,focusY:.5,zoom:1};
  showModal(`<div class="modal-head"><div><div class="eyebrow">ATUR GAMBAR</div><h2>${esc(meta.label)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="appearance-cropper"><div class="appearance-crop-help"><span class="material-symbols-rounded">open_with</span><span>Geser dan zoom sampai framing sesuai.</span></div><div class="appearance-crop-stage" data-single-crop-stage style="aspect-ratio:${meta.width}/${meta.height}"><img src="${esc(objectUrl)}" alt="Preview crop" draggable="false"></div><label class="appearance-zoom-control"><span>Zoom</span><input data-single-crop-zoom type="range" min="1" max="2.5" step="0.01" value="1"><b data-single-crop-value>100%</b></label><div class="request-status" data-single-crop-status></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="button" class="btn btn-primary" data-single-crop-save>${esc(saveLabel)}</button></div></div>`);
  const stage=document.querySelector('[data-single-crop-stage]'),img=stage?.querySelector('img'),slider=document.querySelector('[data-single-crop-zoom]'),value=document.querySelector('[data-single-crop-value]'),save=document.querySelector('[data-single-crop-save]'),status=document.querySelector('[data-single-crop-status]');
  const render=()=>{renderFocusPreview(stage,img,cropState);if(value)value.textContent=`${Math.round(cropState.zoom*100)}%`;};img.onload=()=>{render();bindFocusStage(stage,img,()=>cropState,v=>cropState=v,render);};slider?.addEventListener('input',()=>{cropState.zoom=Number(slider.value||1);render();});
  save?.addEventListener('click',async()=>{if(save.disabled)return;save.disabled=true;const old=save.innerHTML;save.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';try{const prepared=await croppedJpegData(img,meta.width,meta.height,cropState.focusX,cropState.focusY,cropState.zoom);const result=await api('uploadClassAppearanceMedia',{class_id:state.selectedClassId,slot,filename:file.name,data_url:prepared.dataUrl,activate});if(currentClassData){currentClassData.appearance=result.appearance||currentClassData.appearance;state.classDetails[state.selectedClassId]=currentClassData;persistCurrentClassVisualCache(currentClassData);}closeModal();onUploaded?.(result.uploaded?.file_id,result);renderAppearancePaneOnly(currentClassData||data);if(activate){applyRoomHeroAppearance(currentClassData||data);toast(`${meta.label} tersimpan.`);}else{toast('Gambar masuk Album. Simpan perubahan untuk mengaktifkannya.');}}catch(err){status.className='request-status error';status.textContent=err.message;save.disabled=false;save.innerHTML=old;toast(err.message);}finally{URL.revokeObjectURL(objectUrl);}});
}
function openLandingBackgroundPicker(section,data){
  const meta=LANDING_SECTION_META[section],draft=ensureAppearanceDraft(data),cfg=draft.landing[section],custom=(data?.appearance?.library||[]).filter(x=>x.slot===meta.slot&&x.url&&String(x.status||'').toUpperCase()!=='DELETED');
  showModal(`<div class="modal-head"><div><div class="eyebrow">LANDING PAGE</div><h2>${esc(meta.label)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="landing-picker"><div class="appearance-mini-head"><div><strong>Preset KelasKu</strong><small>Ringan dan tidak memakai Drive.</small></div></div><div class="landing-picker-grid">${Object.entries(LANDING_PRESET_ASSETS).map(([key,item])=>`<button type="button" class="landing-picker-item ${cfg.type==='PRESET'&&cfg.preset===key?'selected':''}" data-landing-preset-choice="${key}"><picture><source media="(max-width:720px)" srcset="${esc(item.mobile)}"><img src="${esc(item.desktop)}" alt="${esc(item.label)}"></picture><span>${esc(item.label)}</span></button>`).join('')}</div><div class="appearance-mini-head"><div><strong>Album kelas</strong><small>${custom.length?`${custom.length} gambar custom`:'Belum ada gambar custom.'}</small></div><label class="btn btn-secondary small-btn"><span class="material-symbols-rounded">upload</span> Upload Sendiri<input type="file" accept="image/png,image/jpeg,image/webp" data-landing-custom-upload="${section}" hidden></label></div>${custom.length?`<div class="landing-picker-custom-grid">${custom.map(item=>`<button type="button" class="landing-picker-custom ${cfg.type==='MEDIA'&&String(cfg.mediaId)===String(item.media_id)?'selected':''}" data-landing-media-choice="${esc(item.media_id)}"><img src="${esc(item.url)}" alt="Custom"><span>${cfg.type==='MEDIA'&&String(cfg.mediaId)===String(item.media_id)?'Dipilih':'Pilih'}</span></button>`).join('')}</div>`:''}</div>`);
  document.querySelectorAll('[data-landing-preset-choice]').forEach(btn=>btn.onclick=()=>{draft.landing[section]={type:'PRESET',preset:btn.dataset.landingPresetChoice,mediaId:''};setAppearanceDirty();closeModal();renderAppearancePaneOnly(data);});
  document.querySelectorAll('[data-landing-media-choice]').forEach(btn=>btn.onclick=()=>{draft.landing[section]={type:'MEDIA',preset:'',mediaId:btn.dataset.landingMediaChoice};setAppearanceDirty();closeModal();renderAppearancePaneOnly(data);});
  document.querySelector('[data-landing-custom-upload]')?.addEventListener('change',e=>{const file=e.currentTarget.files?.[0];if(!file)return;closeModal();appearanceOpenCategory='landing';openSingleAppearanceCropper(meta.slot,file,data,(mediaId)=>{draft.landing[section]={type:'MEDIA',preset:'',mediaId};setAppearanceDirty();});});
}
async function saveAppearanceDraft(data){
  const draft=ensureAppearanceDraft(data),btn=document.querySelector('[data-appearance-save]');if(!draft.dirty||btn?.disabled)return;if(btn)btn.disabled=true;
  try{const landing_sections={};Object.keys(LANDING_SECTION_META).forEach(section=>{const cfg=draft.landing[section];landing_sections[section]=cfg.type==='MEDIA'?{type:'MEDIA',media_id:cfg.mediaId}:{type:'PRESET',preset:cfg.preset};});const result=await api('saveClassAppearanceSettings',{class_id:state.selectedClassId,icon_mode:draft.iconMode,icon_key:draft.iconKey,icon_media_id:draft.iconMediaId,landing_sections},{onSlow:()=>toast('Masih menyimpan tampilan…')});if(currentClassData){currentClassData.appearance=result.appearance||currentClassData.appearance;if(result.class)currentClassData.class={...currentClassData.class,...result.class};state.classDetails[state.selectedClassId]=currentClassData;persistCurrentClassVisualCache(currentClassData);}syncClassIdentityState(result.class?.cover_url||'',result.class?.icon_key||draft.iconKey);resetAppearanceDraft(currentClassData||data);toast('Tampilan kelas tersimpan ✓');renderAppearancePaneOnly(currentClassData||data);applyRoomHeroAppearance(currentClassData||data);}catch(err){toast(err.message);if(btn)btn.disabled=false;}
}
async function activateHeroPair(pairId,data){ try{const result=await api('setClassHeroPair',{class_id:state.selectedClassId,pair_id:pairId});if(currentClassData){currentClassData.appearance=result.appearance||currentClassData.appearance;state.classDetails[state.selectedClassId]=currentClassData;persistCurrentClassVisualCache(currentClassData);}toast('Hero lama digunakan kembali.');renderAppearancePaneOnly(currentClassData||data);applyRoomHeroAppearance(currentClassData||data);}catch(err){toast(err.message);} }
async function useLegacyAppearance(mediaId,slot,data){
  if(slot==='CARD_SQUARE'){const d=ensureAppearanceDraft(data);d.iconMode='MEDIA';d.iconMediaId=mediaId;setAppearanceDirty();appearanceOpenCategory='icon';renderAppearancePaneOnly(data);return;}
  if(slot==='LANDING_BG_DESKTOP'||slot==='LANDING_BG_MOBILE'){try{const result=await api('setClassAppearanceMedia',{class_id:state.selectedClassId,slot,media_id:mediaId});if(currentClassData){currentClassData.appearance=result.appearance||currentClassData.appearance;state.classDetails[state.selectedClassId]=currentClassData;persistCurrentClassVisualCache(currentClassData);}appearanceOpenCategory='landing';renderAppearancePaneOnly(currentClassData||data);toast('Background Landing digunakan kembali.');}catch(err){toast(err.message);}return;}
  if(slot?.startsWith('LANDING_')){const section=landingSectionKeyFromSlot(slot),d=ensureAppearanceDraft(data);d.landing[section]={type:'MEDIA',preset:'',mediaId};setAppearanceDirty();appearanceOpenCategory='landing';renderAppearancePaneOnly(data);return;}
  try{const result=await api('setClassAppearanceMedia',{class_id:state.selectedClassId,slot,media_id:mediaId});if(currentClassData){currentClassData.appearance=result.appearance||currentClassData.appearance;state.classDetails[state.selectedClassId]=currentClassData;persistCurrentClassVisualCache(currentClassData);}toast('Gambar digunakan kembali.');renderAppearancePaneOnly(currentClassData||data);applyRoomHeroAppearance(currentClassData||data);}catch(err){toast(err.message);}
}
async function deleteClassAppearance(mediaId,slot,data){
  const ok=await confirmDialog({title:'Hapus gambar permanen?',message:'File akan dipindahkan ke Trash Google Drive dan hilang dari Album KelasKu. Tindakan ini tidak dapat dibatalkan dari KelasKu.',confirmText:'Hapus Permanen',danger:true});if(!ok)return;
  try{const result=await api('deleteClassAppearanceMedia',{class_id:state.selectedClassId,media_id:mediaId});if(currentClassData){currentClassData.appearance=result.appearance||currentClassData.appearance;state.classDetails[state.selectedClassId]=currentClassData;persistCurrentClassVisualCache(currentClassData);}appearanceAlbumPage=1;resetAppearanceDraft(currentClassData||data);toast('Gambar dihapus permanen.');renderAppearancePaneOnly(currentClassData||data);applyRoomHeroAppearance(currentClassData||data);}catch(err){toast(err.message);}
}
async function deleteHeroPair(pairId,data){const ok=await confirmDialog({title:'Hapus Hero permanen?',message:'Versi Desktop dan Mobile dari hero ini akan dipindahkan ke Trash Google Drive. Tindakan ini tidak dapat dibatalkan dari KelasKu.',confirmText:'Hapus Permanen',danger:true});if(!ok)return;try{const result=await api('deleteClassAppearanceGroup',{class_id:state.selectedClassId,pair_id:pairId});if(currentClassData){currentClassData.appearance=result.appearance||currentClassData.appearance;state.classDetails[state.selectedClassId]=currentClassData;persistCurrentClassVisualCache(currentClassData);}appearanceAlbumPage=1;toast('Hero dihapus permanen.');renderAppearancePaneOnly(currentClassData||data);applyRoomHeroAppearance(currentClassData||data);}catch(err){toast(err.message);}}
async function setHeroSlotDefault(slot,data){
  try{
    const result=await api('setClassAppearanceMedia',{class_id:state.selectedClassId,slot,media_id:''});
    if(currentClassData){currentClassData.appearance=result.appearance||currentClassData.appearance;state.classDetails[state.selectedClassId]=currentClassData;persistCurrentClassVisualCache(currentClassData);}
    toast(`${CLASS_APPEARANCE_META[slot]?.label||'Hero'} kembali ke default.`);
    renderAppearancePaneOnly(currentClassData||data);
    applyRoomHeroAppearance(currentClassData||data);
  }catch(err){toast(err.message);}
}
async function setHeroDefault(data){try{await api('setClassAppearanceMedia',{class_id:state.selectedClassId,slot:'HERO_DESKTOP',media_id:''});const result=await api('setClassAppearanceMedia',{class_id:state.selectedClassId,slot:'HERO_MOBILE',media_id:''});if(currentClassData){currentClassData.appearance=result.appearance||currentClassData.appearance;state.classDetails[state.selectedClassId]=currentClassData;persistCurrentClassVisualCache(currentClassData);}toast('Hero kembali ke default.');renderAppearancePaneOnly(currentClassData||data);applyRoomHeroAppearance(currentClassData||data);}catch(err){toast(err.message);}}
function openAppearancePreview(url){showModal(`<div class="modal-head"><div><div class="eyebrow">PREVIEW</div><h2>Gambar Tampilan</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><img class="appearance-full-preview" src="${esc(url)}" alt="Preview">`);}
function syncClassIdentityState(url='',iconKey='school'){
  if(currentClassData?.class){currentClassData.class.cover_url=url||'';currentClassData.class.icon_key=iconKey||'school';}
  const id=String(state.selectedClassId||'');(state.myClasses||[]).forEach(item=>{if(String(item.class_id)===id){item.cover_url=url||'';item.icon_key=iconKey||'school';}});try{localStorage.setItem('kelasku_classes_cache',JSON.stringify(state.myClasses||[]));}catch{}
}
function applyRoomHeroAppearance(data){
  const picture=document.querySelector('.class-hero-bg-v6725'),source=picture?.querySelector('source'),img=picture?.querySelector('img');
  const mobile=classAppearanceUrl(data,'HERO_MOBILE',appearanceFallback('HERO_MOBILE')),desktop=classAppearanceUrl(data,'HERO_DESKTOP',appearanceFallback('HERO_DESKTOP'));
  if(source)source.srcset=mobile;
  if(img)img.src=desktop;
}
function bindClassAppearanceSettings(data){
  ensureAppearanceDraft(data);
  document.querySelectorAll('[data-appearance-category-toggle]').forEach(btn=>btn.addEventListener('click',()=>setAppearanceCategory(btn.dataset.appearanceCategoryToggle)));
  document.querySelectorAll('[data-hero-slot-file]').forEach(input=>input.addEventListener('change',e=>{const file=e.currentTarget.files?.[0],slot=e.currentTarget.dataset.heroSlotFile;if(!file||!slot)return;appearanceOpenCategory='hero';openSingleAppearanceCropper(slot,file,data,null,{activate:true,saveLabel:'Simpan Hero'});}));
  document.querySelectorAll('[data-hero-slot-default]').forEach(btn=>btn.addEventListener('click',()=>setHeroSlotDefault(btn.dataset.heroSlotDefault,data)));
  document.querySelectorAll('[data-landing-background-open]').forEach(btn=>btn.addEventListener('click',()=>openLandingBackgroundPicker(btn.dataset.landingBackgroundOpen,data)));
  document.querySelectorAll('[data-landing-page-preset]').forEach(btn=>btn.addEventListener('click',()=>setLandingPageBackgroundPreset(btn.dataset.landingPagePreset,data)));
  document.querySelectorAll('[data-landing-page-bg-file]').forEach(input=>input.addEventListener('change',e=>{const file=e.currentTarget.files?.[0],slot=e.currentTarget.dataset.landingPageBgFile;if(!file||!slot)return;appearanceOpenCategory='landing';openSingleAppearanceCropper(slot,file,data,null,{activate:true,saveLabel:'Simpan Background'});}));
  document.querySelector('[data-appearance-save]')?.addEventListener('click',()=>saveAppearanceDraft(data));
  document.querySelector('[data-appearance-cancel]')?.addEventListener('click',()=>{resetAppearanceDraft(data);renderAppearancePaneOnly(data);});
  document.querySelectorAll('[data-album-filter]').forEach(btn=>btn.onclick=()=>{appearanceAlbumFilter=btn.dataset.albumFilter;appearanceAlbumPage=1;appearanceOpenCategory='album';renderAppearancePaneOnly(data);});
  document.querySelectorAll('[data-album-page]').forEach(btn=>btn.onclick=()=>{appearanceAlbumPage=Number(btn.dataset.albumPage||1);appearanceOpenCategory='album';renderAppearancePaneOnly(data);});
  document.querySelectorAll('[data-album-menu]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const panel=document.querySelector(`[data-album-menu-panel="${btn.dataset.albumMenu}"]`);document.querySelectorAll('[data-album-menu-panel]').forEach(x=>{if(x!==panel)x.hidden=true;});if(panel)panel.hidden=!panel.hidden;});
  document.querySelectorAll('[data-hero-pair-use]').forEach(btn=>btn.onclick=()=>activateHeroPair(btn.dataset.heroPairUse,data));
  document.querySelectorAll('[data-hero-pair-delete]').forEach(btn=>btn.onclick=()=>deleteHeroPair(btn.dataset.heroPairDelete,data));
  document.querySelectorAll('[data-album-use-media]').forEach(btn=>btn.onclick=()=>useLegacyAppearance(btn.dataset.albumUseMedia,btn.dataset.albumUseSlot,data));
  document.querySelectorAll('[data-appearance-delete]').forEach(btn=>btn.onclick=()=>deleteClassAppearance(btn.dataset.appearanceDelete,btn.dataset.appearanceDeleteSlot,data));
  document.querySelectorAll('[data-appearance-preview]').forEach(btn=>btn.onclick=()=>openAppearancePreview(btn.dataset.appearancePreview));
}


function settingsHtml(data) {
  const c=data.class||{},s=data.settings||{},p=data.permissions||{},links=data.class_links||[],publicUrl=publicClassLinksUrl(c.class_code||'',c.public_slug||''),joinUrl=joinClassUrl(c.class_code||'',c.public_slug||'');
  const roleRows=p.is_owner?(data.members||[]).filter(m=>String(m.class_role)!=='OWNER').map(m=>`<div class="class-role-setting-row"><div class="member-avatar">${avatarMarkup(m)}</div><div><strong>${esc(m.full_name||m.username)}</strong><small>@${esc(m.username||'-')} · ${m.is_class_leader?'Ketua Kelas · ':''}${esc(roleLabel(m.class_role||'MEMBER'))}</small></div><select class="control compact-control" data-role-user="${esc(m.user_id)}"><option value="MEMBER" ${m.class_role==='MEMBER'?'selected':''}>Member</option><option value="MODERATOR" ${m.class_role==='MODERATOR'?'selected':''}>Moderator</option><option value="COORDINATOR" ${m.class_role==='COORDINATOR'?'selected':''}>Koordinator</option><option value="TEACHER" ${m.class_role==='TEACHER'?'selected':''}>Pengajar</option><option value="OBSERVER" ${m.class_role==='OBSERVER'?'selected':''}>Pengamat</option></select></div>`).join(''):'';
  return `<form id="class-settings-form" class="class-settings-console"><div class="class-settings-tabs" role="tablist"><button type="button" class="active" data-class-setting-tab="identity">Identitas</button><button type="button" data-class-setting-tab="appearance">Tampilan</button><button type="button" data-class-setting-tab="access">Akses</button>${p.is_owner?'<button type="button" data-class-setting-tab="roles">Role</button>':''}<button type="button" data-class-setting-tab="links">Link Kelas</button></div>
    <section class="panel class-setting-pane active" data-class-setting-pane="identity"><div class="settings-compact-head"><div><h2>Identitas Kelas</h2><p>Informasi utama kelas.</p></div>${svg('i-class')}</div><div class="field"><label>Nama Kelas</label><input class="control" name="name" value="${esc(c.name||'')}"></div><div class="field"><label>Deskripsi</label><textarea class="control" rows="3" name="description">${esc(c.description||'')}</textarea></div><div class="form-grid"><div class="field"><label>Institusi</label><input class="control" name="institution" value="${esc(c.institution||'')}"></div><div class="field"><label>Program Studi</label><input class="control" name="study_program" value="${esc(c.study_program||'')}"></div><div class="field"><label>Angkatan</label><input class="control" name="cohort" value="${esc(c.cohort||'')}"></div><div class="field"><label>Semester</label><input class="control" name="semester" value="${esc(c.semester||'')}"></div></div>${p.is_owner?`<div class="field"><label>Custom URL Kelas</label><div class="slug-control"><span>klasku.my.id/</span><input class="control" name="public_slug" value="${esc(c.public_slug||'')}" placeholder="esy3"></div><div class="form-help">Opsional. Class Code tetap menjadi fallback permanen.</div></div>`:''}<button type="button" id="save-class-profile" class="btn btn-primary">Simpan Identitas</button></section>
    <section class="panel class-setting-pane" data-class-setting-pane="appearance"><div class="settings-compact-head"><div><h2>Tampilan Kelas</h2><p>Hero Desktop/Mobile, background section Landing, dan album media per kelas.</p></div><span class="material-symbols-rounded">palette</span></div>${classAppearanceHtml(data)}</section>
    <section class="panel class-setting-pane" data-class-setting-pane="access"><div class="settings-compact-head"><div><h2>Akses & Permission</h2><p>Join, visibility, dan hak default member.</p></div>${svg('i-shield')}</div><div class="settings-compact-grid"><div>${selectRow('Visibilitas','visibility',c.visibility,[['PUBLIC','Public'],['DISCOVERABLE','Discoverable'],['PRIVATE','Private']])}${toggleRow('Perlu persetujuan','join_approval',s.join_approval)}${toggleRow('Join Code aktif','join_code_enabled',s.join_code_enabled)}${toggleRow('Daftar anggota terlihat','member_list_visible',s.member_list_visible)}</div><div>${toggleRow('Boleh posting diskusi','allow_member_posts',s.allow_member_posts)}${toggleRow('Boleh upload file','allow_member_uploads',s.allow_member_uploads)}${toggleRow('Boleh invite orang','allow_member_invites',s.allow_member_invites)}</div></div><div class="page-actions">${p.can_regenerate_join_code?'<button type="button" id="regen-code" class="btn btn-secondary">Generate Ulang Join Code</button>':''}<button id="save-class-settings" type="submit" class="btn btn-primary">Simpan Pengaturan</button></div><div id="class-settings-status" class="request-status"></div></section>
    ${p.is_owner?`<section class="panel class-setting-pane" data-class-setting-pane="roles"><div class="settings-compact-head"><div><h2>Role Kelas</h2><p>Owner mengatur role existing + Pengajar/Pengamat. Pengajar dan Pengamat dapat memantau data kelas tetapi tidak masuk roster Absensi/Tugas peserta.</p></div>${svg('i-users')}</div><div class="class-role-settings-list">${roleRows||'<div class="search-empty">Belum ada anggota yang dapat diatur.</div>'}</div></section>`:''}
    <section class="panel class-setting-pane class-links-settings" data-class-setting-pane="links"><div class="settings-compact-head"><div><h2>Link Grup & Link Penting</h2><p>Satu landing page untuk kebutuhan kelas.</p></div>${svg('i-link')}</div><label class="setting-row public-links-toggle"><span><strong>Landing page publik</strong><small>Guest dapat melihat bahwa link Anggota tersedia, tetapi URL private tidak pernah dikirim ke browser sebelum membership tervalidasi.</small></span><span class="switch"><input type="checkbox" id="public-links-enabled" ${truthy(s.public_links_enabled)?'checked':''}><span></span></span></label><div class="class-public-url ${truthy(s.public_links_enabled)?'':'is-disabled'}"><div><span>LINK PUBLIK KELAS</span><strong>${esc(publicUrl)}</strong></div><button type="button" id="copy-public-links" class="icon-btn" title="Salin link publik">${svg('i-copy')}</button><a href="${esc(publicUrl)}" target="_blank" rel="noopener noreferrer" class="icon-btn" title="Preview"><span class="material-symbols-rounded">open_in_new</span></a></div><div class="class-public-url join-class-url"><div><span>LINK BERGABUNG</span><strong>${esc(joinUrl)}</strong><small>Klik link → login bila perlu → ajukan bergabung → tunggu approval.</small></div><button type="button" id="copy-join-link" class="icon-btn" title="Salin link bergabung">${svg('i-copy')}</button></div>${classLinksManagerHtml(links)}<div class="class-links-actions"><button type="button" id="add-class-link" class="btn btn-secondary">${svg('i-plus')} Tambah Link</button><button type="button" id="save-class-links" class="btn btn-primary">Simpan Link</button></div><div id="class-links-status" class="request-status"></div></section>
  </form>`;
}

function bindTab(tab,data) {
  if(tab==='overview'){
    document.querySelectorAll('[data-module-tab]').forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.moduleTab,data));
    document.getElementById('quick-settings')?.addEventListener('click',()=>switchTab('settings',data));
    document.getElementById('quick-members')?.addEventListener('click',()=>switchTab('members',data));
    document.getElementById('overview-copy-class-code')?.addEventListener('click',()=>copyText(data.class?.class_code||''));
    document.getElementById('overview-copy-join-code')?.addEventListener('click',()=>copyText(data.class?.join_code||''));
    document.getElementById('overview-copy-class-link')?.addEventListener('click',()=>copyText(publicClassLinksUrl(data.class?.class_code||'',data.class?.public_slug||'')));
    document.getElementById('overview-open-class-link')?.addEventListener('click',()=>window.open(publicClassLinksUrl(data.class?.class_code||'',data.class?.public_slug||''),'_blank','noopener,noreferrer'));
    document.getElementById('overview-copy-join-link')?.addEventListener('click',()=>copyText(joinClassUrl(data.class?.class_code||'',data.class?.public_slug||'')));
    document.getElementById('class-exit-action')?.addEventListener('click',()=>handleClassExit(data));
  }
  if(tab==='tasks') document.querySelectorAll('[data-review-task]').forEach(btn=>btn.onclick=()=>openTaskReview(btn.dataset.reviewTask));
  if(tab==='members'){
    document.querySelectorAll('[data-remove-user]').forEach(btn=>btn.onclick=()=>removeMember(btn.dataset.removeUser,btn));
    document.querySelectorAll('[data-class-members-page]').forEach(btn=>btn.addEventListener('click',()=>{
      classMembersPage=Number(btn.dataset.classMembersPage||1);
      const slot=document.getElementById('room-content');
      if(slot){slot.innerHTML=membersHtml(currentClassData);bindTab('members',currentClassData);}
    }));
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
    bindClassAppearanceSettings(data);
    bindClassLinksSettings(data);
    activateClassSettingPane(activeClassSettingPane);
  }
}

async function handleClassExit(data){const isOwner=Boolean(data.permissions?.is_owner);const className=data.class?.name||'kelas ini';const ok=await confirmDialog({title:isOwner?'Hapus kelas dari daftar aktif?':'Keluar dari kelas?',message:isOwner?`“${className}” akan dinonaktifkan. Data, histori, tugas, absensi, dan file existing tidak dihapus permanen.`:`Kamu akan kehilangan akses ke “${className}”. Histori akademik yang sudah tercatat tetap disimpan.`,confirmText:isOwner?'Hapus Kelas':'Keluar Kelas',danger:true});if(!ok)return;const btn=document.getElementById('class-exit-action');if(btn)btn.disabled=true;try{await api(isOwner?'archiveClass':'leaveClass',{class_id:state.selectedClassId},{onSlow:()=>toast('Masih memproses. Jangan tutup halaman.')});const id=String(state.selectedClassId||'');state.myClasses=(state.myClasses||[]).filter(x=>String(x.class_id)!==id);state.myClassesAt=Date.now();localStorage.setItem('kelasku_classes_cache',JSON.stringify(state.myClasses));localStorage.setItem('kelasku_classes_cache_at',String(state.myClassesAt));delete state.classDetails[id];delete state.classDetailsAt[id];delete state.classAcademic[id];delete state.classAcademicAt[id];try{localStorage.setItem('kelasku_class_details_cache',JSON.stringify(state.classDetails));localStorage.setItem('kelasku_class_details_cache_at',JSON.stringify(state.classDetailsAt));localStorage.setItem('kelasku_class_academic_cache',JSON.stringify(state.classAcademic));localStorage.setItem('kelasku_class_academic_cache_at',JSON.stringify(state.classAcademicAt));sessionStorage.removeItem('kelasku_selected_class');}catch{}state.selectedClassId='';toast(isOwner?'Kelas dinonaktifkan.':'Kamu sudah keluar dari kelas.');go('classes');}catch(err){toast(err.message);if(btn)btn.disabled=false;}}

function activateClassSettingPane(key){activeClassSettingPane=key||'identity';document.querySelectorAll('[data-class-setting-tab]').forEach(b=>b.classList.toggle('active',b.dataset.classSettingTab===activeClassSettingPane));document.querySelectorAll('[data-class-setting-pane]').forEach(p=>p.classList.toggle('active',p.dataset.classSettingPane===activeClassSettingPane));}

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
  const items=(currentClassData?.members||[]).filter(m=>!['TEACHER','OBSERVER'].includes(String(m.class_role||'').toUpperCase()));
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
function classLinkPlatforms(){return [['WHATSAPP','WhatsApp','chat'],['ZOOM','Zoom','videocam'],['GOOGLE_MEET','Google Meet','video_call'],['GOOGLE_FORMS','Google Forms','fact_check'],['GOOGLE_CLASSROOM','Google Classroom','school'],['GOOGLE_DRIVE','Google Drive','folder'],['GOOGLE_DOCS','Google Docs','description'],['GOOGLE_SHEETS','Google Sheets','table_chart'],['GOOGLE_SLIDES','Google Slides','co_present'],['GOOGLE_CALENDAR','Google Calendar','calendar_month'],['YOUTUBE','YouTube','smart_display'],['TELEGRAM','Telegram','send'],['INSTAGRAM','Instagram','photo_camera'],['TIKTOK','TikTok','music_note'],['FACEBOOK','Facebook','public'],['MICROSOFT_TEAMS','Microsoft Teams','groups'],['ONEDRIVE','OneDrive','cloud'],['DROPBOX','Dropbox','inventory_2'],['CANVA','Canva','design_services'],['NOTION','Notion','view_quilt'],['GITHUB','GitHub','code'],['MOODLE','Moodle / LMS','school'],['WEBSITE','Website','language'],['OTHER','Custom / Lainnya','link']];}
const CLASS_LINK_LIMIT=60,CLASS_LINK_TAB_LIMIT=12,CLASS_LINK_PAGE_SIZE=8;
const classLinkPageState=new Map();
function classLinkPlatformMeta(value){return classLinkPlatforms().find(x=>x[0]===String(value||'OTHER'))||classLinkPlatforms().at(-1);}
function classLinkSectionLabel(item={}){return String(item.section_label||'').trim()||'Umum';}
function classLinkGroupKey(section,group,platform){return `${String(section||'umum').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,22)||'umum'}--${String(group||'direct').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,22)||'direct'}--${String(platform||'OTHER').toLowerCase()}`;}
function classLinkDisplayPlatform(item={}){const meta=classLinkPlatformMeta(item.platform);return String(item.platform||'OTHER')==='OTHER'&&String(item.platform_label||'').trim()?String(item.platform_label).trim():meta[1];}
function classLinkRow(item={},index=0){
  const [platform,,icon]=classLinkPlatformMeta(item.platform),visibility=String(item.visibility||'PUBLIC').toUpperCase()==='MEMBER'?'MEMBER':'PUBLIC';
  return `<div class="class-link-manager-row" data-class-link-row data-link-id="${esc(item.link_id||'')}"><button type="button" class="class-link-drag-handle" data-link-drag title="Tahan lalu geser"><span class="material-symbols-rounded">drag_indicator</span></button><button type="button" class="class-link-summary" data-edit-class-link><span class="class-link-platform-icon material-symbols-rounded">${icon}</span><span><strong>${esc(item.label||'Link baru')}</strong><small>${esc(item.description||classLinkDisplayPlatform(item))}</small></span></button><span class="class-link-visibility-badge ${visibility==='MEMBER'?'private':'public'}">${visibility==='MEMBER'?'ANGGOTA':'PUBLIK'}</span><button type="button" class="icon-btn mini danger-btn" data-remove-class-link>${svg('i-close')}</button><input type="hidden" class="link-section" value="${esc(classLinkSectionLabel(item))}"><input type="hidden" class="link-group" value="${esc(item.group_label||'')}"><input type="hidden" class="link-platform" value="${esc(platform)}"><input type="hidden" class="link-platform-label" value="${esc(item.platform_label||'')}"><input type="hidden" class="link-visibility" value="${esc(visibility)}"><input type="hidden" class="link-label" value="${esc(item.label||'')}"><input type="hidden" class="link-url" value="${esc(item.url||'')}"><input type="hidden" class="link-description" value="${esc(item.description||'')}"></div>`;
}
function classLinksManagerHtml(links=[]){
  const items=Array.isArray(links)?links:[],sections=[],bySection={};items.forEach((item,index)=>{const section=classLinkSectionLabel(item);if(!bySection[section]){bySection[section]=[];sections.push(section);}bySection[section].push({...item,_index:index});});
  const cards=sections.map(section=>{const direct=bySection[section].filter(x=>!String(x.group_label||'').trim()),groupOrder=[],named={};bySection[section].filter(x=>String(x.group_label||'').trim()).forEach(item=>{const g=String(item.group_label).trim();if(!named[g]){named[g]=[];groupOrder.push(g);}named[g].push(item);});const categories=(arr,group='')=>{const order=[],map={};arr.forEach(item=>{const p=String(item.platform||'OTHER');if(!map[p]){map[p]=[];order.push(p);}map[p].push(item);});return order.map(p=>classLinkCategoryHtml(section,group,p,map[p])).join('');};return `<section class="class-link-tab-card" data-link-tab-card="${esc(section)}"><button type="button" class="class-link-tab-head" data-toggle-link-tab aria-expanded="false"><span class="material-symbols-rounded">playlist_play</span><span><strong>${esc(section)}</strong><small>${bySection[section].length} link</small></span><span class="material-symbols-rounded link-tab-chevron">expand_more</span></button><div class="class-link-tab-body" hidden>${direct.length?categories(direct):''}${groupOrder.map(g=>`<div class="class-link-named-group"><div class="class-link-named-group-head"><span class="material-symbols-rounded">folder_open</span><div><strong>${esc(g)}</strong><small>${named[g].length} link</small></div></div>${categories(named[g],g)}</div>`).join('')}<button type="button" class="class-link-add-category" data-add-link-section="${esc(section)}"><span class="material-symbols-rounded">add</span> Tambah kategori / link</button></div></section>`;}).join('');
  return `<div class="class-links-manager-head"><div><strong>Kelompok Link</strong><small>Semester/Tab → Group opsional → Platform → Link. Tanpa Group tetap langsung ke Platform.</small></div><span class="soft-chip" id="class-link-count">${items.length} / ${CLASS_LINK_LIMIT}</span></div><div id="class-links-editor" class="class-links-editor class-links-manager">${cards||'<div class="class-links-empty">Belum ada link. Klik <b>Tambah Link</b> untuk membuat tab pertama.</div>'}</div>`;
}
function classLinkCategoryHtml(section,group,platform,items=[]){const [value,label,icon]=classLinkPlatformMeta(platform),display=value==='OTHER'&&items[0]?.platform_label?items[0].platform_label:label,key=classLinkGroupKey(section,group,value);return `<section class="class-link-category-card" data-link-category="${esc(key)}" data-section="${esc(section)}" data-group="${esc(group||'')}" data-platform="${esc(value)}"><button type="button" class="class-link-category-head" data-toggle-link-category><span class="material-symbols-rounded">${icon}</span><span><strong>${esc(display)}</strong><small>${items.length} link</small></span><span class="material-symbols-rounded link-category-chevron">expand_more</span></button><div class="class-link-category-body" hidden><div class="class-link-category-list">${items.map((item,index)=>classLinkRow(item,index)).join('')}</div><div class="class-link-category-footer"><button type="button" class="class-link-add-inline" data-add-link-section="${esc(section)}" data-add-link-group="${esc(group||'')}" data-add-link-platform="${esc(value)}"><span class="material-symbols-rounded">add</span> Tambah link</button><div class="class-link-category-pager" data-link-pager></div></div></div></section>`;}
function collectClassLinkDrafts(){return [...document.querySelectorAll('[data-class-link-row]')].map(row=>({link_id:row.dataset.linkId||'',section_label:row.querySelector('.link-section')?.value||'Umum',group_label:row.querySelector('.link-group')?.value||'',platform:row.querySelector('.link-platform')?.value||'OTHER',platform_label:row.querySelector('.link-platform-label')?.value||'',visibility:row.querySelector('.link-visibility')?.value||'PUBLIC',label:row.querySelector('.link-label')?.value||'',url:row.querySelector('.link-url')?.value||'',description:row.querySelector('.link-description')?.value||''}));}
function renderClassLinksManager(links){const editor=document.getElementById('class-links-editor');if(!editor)return;const wrap=document.createElement('div');wrap.innerHTML=classLinksManagerHtml(links);const next=wrap.querySelector('#class-links-editor');editor.replaceWith(next);const count=document.getElementById('class-link-count');if(count)count.textContent=`${links.length} / ${CLASS_LINK_LIMIT}`;bindClassLinksManagerEvents();}
function inferClassLinkPlatform(url){const u=String(url||'').toLowerCase();if(/chat\.whatsapp\.com|wa\.me|whatsapp\.com/.test(u))return'WHATSAPP';if(/zoom\.us/.test(u))return'ZOOM';if(/meet\.google\.com/.test(u))return'GOOGLE_MEET';if(/forms\.gle|docs\.google\.com\/forms/.test(u))return'GOOGLE_FORMS';if(/classroom\.google\.com/.test(u))return'GOOGLE_CLASSROOM';if(/docs\.google\.com\/document/.test(u))return'GOOGLE_DOCS';if(/docs\.google\.com\/spreadsheets/.test(u))return'GOOGLE_SHEETS';if(/docs\.google\.com\/presentation/.test(u))return'GOOGLE_SLIDES';if(/calendar\.google\.com/.test(u))return'GOOGLE_CALENDAR';if(/drive\.google\.com/.test(u))return'GOOGLE_DRIVE';if(/youtube\.com|youtu\.be/.test(u))return'YOUTUBE';if(/t\.me|telegram\.me/.test(u))return'TELEGRAM';if(/instagram\.com/.test(u))return'INSTAGRAM';if(/tiktok\.com/.test(u))return'TIKTOK';if(/github\.com/.test(u))return'GITHUB';if(/canva\.com/.test(u))return'CANVA';if(/notion\.(site|so)/.test(u))return'NOTION';if(/^https?:\/\//.test(u))return'WEBSITE';return'OTHER';}
function openClassLinkEditor(row=null,defaults={}){
  const read=selector=>row?.querySelector(selector)?.value||'';const current={link_id:row?.dataset.linkId||'',section_label:defaults.section||read('.link-section')||'Umum',group_label:defaults.group||read('.link-group')||'',platform:defaults.platform||read('.link-platform')||'OTHER',platform_label:read('.link-platform-label')||'',visibility:read('.link-visibility')||'PUBLIC',label:read('.link-label')||'',url:read('.link-url')||'',description:read('.link-description')||''};
  showModal(`<div class="modal-head"><div><span class="eyebrow">LINK KELAS</span><h2>${row?'Edit Link':'Tambah Link'}</h2></div><button type="button" class="icon-btn" data-close-modal>${svg('i-close')}</button></div><div class="class-link-edit-form"><div class="form-grid"><div class="field"><label>Semester / Tab Utama</label><input class="control" id="link-edit-section" maxlength="40" value="${esc(current.section_label)}" placeholder="Semester 1 / Umum"></div><div class="field"><label>Nama Group (opsional)</label><input class="control" id="link-edit-group" maxlength="40" value="${esc(current.group_label)}" placeholder="Contoh: Pelajaran"></div></div><div class="form-grid"><div class="field"><label>Platform</label><select class="control" id="link-edit-platform">${classLinkPlatforms().map(([value,label])=>`<option value="${value}" ${current.platform===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="field" id="link-custom-platform-field" ${current.platform==='OTHER'?'':'hidden'}><label>Nama Platform Custom</label><input class="control" id="link-edit-platform-label" maxlength="60" value="${esc(current.platform_label)}" placeholder="e-Riyadh / LMS Kampus"></div></div><div class="field"><label>Akses</label><select class="control" id="link-edit-visibility"><option value="PUBLIC" ${current.visibility==='PUBLIC'?'selected':''}>Publik</option><option value="MEMBER" ${current.visibility==='MEMBER'?'selected':''}>Anggota (Private)</option></select></div><div class="field"><label>Nama Link</label><input class="control" id="link-edit-label" maxlength="90" value="${esc(current.label)}" placeholder="Contoh: Absensi Pertemuan 1"></div><div class="field"><label>URL</label><input class="control" id="link-edit-url" type="url" maxlength="1500" value="${esc(current.url)}" placeholder="https://…"></div><div class="field"><label>Keterangan (opsional)</label><input class="control" id="link-edit-description" maxlength="180" value="${esc(current.description)}" placeholder="Keterangan singkat"></div><div id="link-edit-status" class="request-status"></div><div class="page-actions"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="button" class="btn btn-primary" id="link-edit-save">Simpan Link</button></div></div>`);
  const url=document.getElementById('link-edit-url'),platform=document.getElementById('link-edit-platform'),customField=document.getElementById('link-custom-platform-field');const syncCustom=()=>{if(customField)customField.hidden=platform?.value!=='OTHER';};platform?.addEventListener('change',syncCustom);syncCustom();url?.addEventListener('change',()=>{if(platform?.value==='OTHER'&&!document.getElementById('link-edit-platform-label')?.value.trim()){platform.value=inferClassLinkPlatform(url.value);syncCustom();}});
  document.getElementById('link-edit-save')?.addEventListener('click',()=>{const status=document.getElementById('link-edit-status'),section=document.getElementById('link-edit-section')?.value.trim()||'Umum',group=document.getElementById('link-edit-group')?.value.trim()||'',label=document.getElementById('link-edit-label')?.value.trim()||'',linkUrl=url?.value.trim()||'',visibility=document.getElementById('link-edit-visibility')?.value||'PUBLIC',platformValue=platform?.value||'OTHER',platformLabel=document.getElementById('link-edit-platform-label')?.value.trim()||'',description=document.getElementById('link-edit-description')?.value.trim()||'';if(label.length<2||!/^https?:\/\//i.test(linkUrl)){status.className='request-status error';status.textContent='Nama link minimal 2 karakter dan URL wajib http/https.';return;}if(platformValue==='OTHER'&&!platformLabel){status.className='request-status error';status.textContent='Isi nama platform custom.';return;}const drafts=collectClassLinkDrafts();if(!row&&drafts.length>=CLASS_LINK_LIMIT){status.className='request-status error';status.textContent=`Maksimal ${CLASS_LINK_LIMIT} link aktif.`;return;}const next={link_id:current.link_id||'',section_label:section,group_label:group,platform:platformValue,platform_label:platformValue==='OTHER'?platformLabel:'',visibility,label,url:linkUrl,description};if(row){row.outerHTML=classLinkRow(next);}else{drafts.push(next);renderClassLinksManager(drafts);closeModal();return;}closeModal();bindClassLinksManagerEvents();});
}
function applyClassLinkPagination(category,pageOverride=null){const key=category.dataset.linkCategory||'',rows=[...category.querySelectorAll('[data-class-link-row]')],pages=Math.max(1,Math.ceil(rows.length/CLASS_LINK_PAGE_SIZE)),page=Math.min(pages,Math.max(1,pageOverride||classLinkPageState.get(key)||1));classLinkPageState.set(key,page);rows.forEach((row,index)=>row.hidden=Math.floor(index/CLASS_LINK_PAGE_SIZE)!==(page-1));const pager=category.querySelector('[data-link-pager]');if(!pager)return;if(pages<=1){pager.innerHTML='';return;}pager.innerHTML=`<button type="button" data-link-page="prev" ${page<=1?'disabled':''}><span class="material-symbols-rounded">chevron_left</span></button><span>${page} / ${pages}</span><button type="button" data-link-page="next" ${page>=pages?'disabled':''}><span class="material-symbols-rounded">chevron_right</span></button>`;pager.querySelectorAll('[data-link-page]').forEach(btn=>btn.onclick=()=>applyClassLinkPagination(category,page+(btn.dataset.linkPage==='next'?1:-1)));}
function bindClassLinkDrag(){document.querySelectorAll('[data-link-drag]').forEach(handle=>{let timer=null,dragging=false,row=null;const stop=()=>{clearTimeout(timer);timer=null;if(row)row.classList.remove('is-dragging');dragging=false;row=null;};handle.onpointerdown=e=>{row=handle.closest('[data-class-link-row]');timer=setTimeout(()=>{if(!row)return;dragging=true;row.classList.add('is-dragging');try{handle.setPointerCapture(e.pointerId);}catch{}},180);};handle.onpointermove=e=>{if(!dragging||!row)return;e.preventDefault();const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-class-link-row]');if(!target||target===row||target.closest('[data-link-category]')!==row.closest('[data-link-category]')||target.hidden)return;const rect=target.getBoundingClientRect();target.parentElement.insertBefore(row,e.clientY<rect.top+rect.height/2?target:target.nextSibling);};handle.onpointerup=()=>{const category=row?.closest('[data-link-category]');stop();if(category)applyClassLinkPagination(category);};handle.onpointercancel=stop;});}
function bindClassLinksManagerEvents(){
  document.querySelectorAll('[data-toggle-link-tab]').forEach(btn=>btn.onclick=()=>{const card=btn.closest('[data-link-tab-card]'),body=card?.querySelector('.class-link-tab-body'),open=body?.hidden;if(!body)return;body.hidden=!open;card.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open));});
  document.querySelectorAll('[data-toggle-link-category]').forEach(btn=>btn.onclick=()=>{const card=btn.closest('[data-link-category]'),body=card?.querySelector('.class-link-category-body'),open=body?.hidden;if(!body)return;body.hidden=!open;card.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open));if(open)applyClassLinkPagination(card);});
  document.querySelectorAll('[data-edit-class-link]').forEach(btn=>btn.onclick=()=>openClassLinkEditor(btn.closest('[data-class-link-row]')));
  document.querySelectorAll('[data-remove-class-link]').forEach(btn=>btn.onclick=()=>{const row=btn.closest('[data-class-link-row]'),drafts=collectClassLinkDrafts(),index=[...document.querySelectorAll('[data-class-link-row]')].indexOf(row);if(index>=0)drafts.splice(index,1);renderClassLinksManager(drafts);});
  document.querySelectorAll('[data-add-link-section]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();openClassLinkEditor(null,{section:btn.dataset.addLinkSection||'Umum',platform:btn.dataset.addLinkPlatform||'OTHER'});});
  document.querySelectorAll('[data-link-category]').forEach(category=>applyClassLinkPagination(category));bindClassLinkDrag();
}
function publicClassLinksUrl(classCode,slug=''){const clean=String(slug||'').trim().toLowerCase();const ref=clean||String(classCode||'').replace(/^KLS-/i,'');return primaryUrl('/links.html',{c:ref}).toString();}
function joinClassUrl(classCode,slug=''){const ref=String(slug||'').trim().toLowerCase()||String(classCode||'').replace(/^KLS-/i,'');return primaryUrl('/join',{c:ref}).toString();}
function bindClassLinksSettings(data){
  bindClassLinksManagerEvents();
  document.getElementById('add-class-link')?.addEventListener('click',()=>openClassLinkEditor());
  document.getElementById('copy-public-links')?.addEventListener('click',()=>copyText(publicClassLinksUrl(data.class?.class_code||'',data.class?.public_slug||'')));
  document.getElementById('copy-join-link')?.addEventListener('click',()=>copyText(joinClassUrl(data.class?.class_code||'',data.class?.public_slug||'')));
  document.getElementById('public-links-enabled')?.addEventListener('change',e=>document.querySelector('.class-public-url')?.classList.toggle('is-disabled',!e.currentTarget.checked));
  document.getElementById('save-class-links')?.addEventListener('click',()=>saveClassLinks(data));
}
function invalidatePublicLinkCacheForClass(data={}){
  const classId=String(data?.class?.class_id||state.selectedClassId||'');
  const refs=[String(data?.class?.class_code||'').replace(/^KLS-/i,'').trim().toLowerCase(),String(data?.class?.public_slug||'').trim().toLowerCase()].filter(Boolean);
  try{
    const remove=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      if(!/^kelasku_public_links_cache_/i.test(key))continue;
      if(refs.some(ref=>key.toLowerCase().endsWith('_'+ref))){remove.push(key);continue;}
      try{const cached=JSON.parse(localStorage.getItem(key)||'null');if(classId&&String(cached?.data?.class?.class_id||'')===classId)remove.push(key);}catch{}
    }
    remove.forEach(key=>localStorage.removeItem(key));
  }catch{}
}
async function saveClassLinks(data){
  const btn=document.getElementById('save-class-links'),status=document.getElementById('class-links-status');if(!btn||btn.disabled)return;
  // Gunakan satu source of truth agar field baru (group_label/platform_label) tidak hilang
  // ketika payload dikirim ke backend.
  const links=collectClassLinkDrafts().map(item=>({...item,section_label:String(item.section_label||'').trim(),group_label:String(item.group_label||'').trim(),platform_label:String(item.platform_label||'').trim(),label:String(item.label||'').trim(),url:String(item.url||'').trim(),description:String(item.description||'').trim()})).filter(item=>item.label||item.url);
  if(links.length>CLASS_LINK_LIMIT){status.className='request-status error';status.textContent=`Maksimal ${CLASS_LINK_LIMIT} link per kelas.`;return;}const sectionCount=new Set(links.map(item=>String(item.section_label||'Umum').trim().toLowerCase())).size;if(sectionCount>CLASS_LINK_TAB_LIMIT){status.className='request-status error';status.textContent=`Maksimal ${CLASS_LINK_TAB_LIMIT} tab/kelompok.`;return;}const invalid=links.find(item=>!item.label||!/^https?:\/\//i.test(item.url));if(invalid){status.className='request-status error';status.textContent='Setiap link wajib punya nama dan URL http/https yang valid.';return;}const invalidCustom=links.find(item=>String(item.platform||'').toUpperCase()==='OTHER'&&!String(item.platform_label||'').trim());if(invalidCustom){status.className='request-status error';status.textContent='Platform Custom wajib memiliki nama platform.';return;}
  const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';status.className='request-status progress';status.textContent='Menyimpan link kelas…';
  try{const result=await api('saveClassLinks',{class_id:state.selectedClassId,public_links_enabled:document.getElementById('public-links-enabled')?.checked===true,links},{onSlow:()=>status.textContent='Masih diproses. Tombol tetap dikunci.'});if(currentClassData){currentClassData.class_links=result.items||[];currentClassData.settings.public_links_enabled=result.public_links_enabled;state.classDetails[state.selectedClassId]=currentClassData;}invalidatePublicLinkCacheForClass(currentClassData||data);renderClassLinksManager(result.items||links);status.className='request-status ok';status.textContent='Link kelas tersimpan ✓';toast('Link kelas tersimpan. Landing akan membaca struktur terbaru.');}
  catch(err){status.className='request-status error';status.textContent=err.message;}
  finally{btn.disabled=false;btn.innerHTML=old;}
}

async function saveClassProfile(){const form=document.getElementById('class-settings-form'),btn=document.getElementById('save-class-profile'),old=btn.innerHTML;if(btn.disabled)return;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';try{const payload={class_id:state.selectedClassId,name:form.name.value,description:form.description.value,institution:form.institution.value,study_program:form.study_program.value,cohort:form.cohort.value,semester:form.semester.value};if(form.public_slug)payload.public_slug=form.public_slug.value;await api('updateClassProfile',payload);toast('Identitas kelas tersimpan.');markClassCacheStale('classDetailsAt','kelasku_class_details_cache_at',state.selectedClassId);await loadClassDetail(false,true);}catch(err){toast(err.message);}finally{btn.disabled=false;btn.innerHTML=old;}}
async function saveClassSettings(event){event.preventDefault();const form=event.currentTarget,btn=document.getElementById('save-class-settings'),status=document.getElementById('class-settings-status'),old=btn.innerHTML;if(btn.disabled)return;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';status.className='request-status progress';status.textContent='Menyimpan pengaturan…';const payload={class_id:state.selectedClassId,visibility:form.visibility.value,join_approval:form.join_approval.checked,join_code_enabled:form.join_code_enabled.checked,member_list_visible:form.member_list_visible.checked,allow_member_posts:form.allow_member_posts.checked,allow_member_uploads:form.allow_member_uploads.checked,allow_member_invites:form.allow_member_invites.checked};try{await api('updateClassSettings',payload,{onSlow:()=>status.textContent='Masih diproses. Tombol tetap dikunci.'});status.className='request-status ok';status.textContent='Tersimpan ✓';toast('Pengaturan kelas tersimpan.');markClassCacheStale('classDetailsAt','kelasku_class_details_cache_at',state.selectedClassId);await loadClassDetail(false,true);}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}}
async function regenerateJoinCode(){const ok=await confirmDialog({title:'Generate ulang Join Code?',message:'Kode lama langsung tidak dapat dipakai. Pastikan anggota baru menerima kode terbaru.',confirmText:'Generate Ulang',danger:true});if(!ok)return;const btn=document.getElementById('regen-code'),old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Memproses…</span>';try{const data=await api('regenerateJoinCode',{class_id:state.selectedClassId});toast('Join Code baru: '+data.join_code);markClassCacheStale('classDetailsAt','kelasku_class_details_cache_at',state.selectedClassId);await loadClassDetail(false,true);}catch(err){toast(err.message);}finally{btn.disabled=false;btn.innerHTML=old;}}

async function copyAttendanceLink(token){if(!token)return toast('Link absensi belum tersedia.');await copyText(attendanceLink(token));}
function attendanceLink(token){return primaryUrl('/absensi',{a:String(token||'')}).toString();}
async function copyText(text){try{await navigator.clipboard.writeText(text||'');toast('Tautan/kode disalin.');}catch{toast('Gagal menyalin otomatis.');}}

function roomSkeleton(){return fastRoomLoader('Membuka Ruang Kelas…');}
function detail(label,value){return `<div class="detail-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;}
function roleLabel(role){const key=String(role||'MEMBER').toUpperCase();if(key==='COORDINATOR')return 'Koordinator';if(key==='OWNER')return 'Owner';if(key==='MODERATOR')return 'Moderator';if(key==='TEACHER')return 'Pengajar';if(key==='OBSERVER')return 'Pengamat';return 'Member';}
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
