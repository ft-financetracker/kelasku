import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { primaryUrl } from '../core/utils.js';

const content = document.getElementById('public-links-content');
const params = new URLSearchParams(location.search);
const pathRef=location.pathname.replace(/^\/+|\/+$/g,'');
const rawCode = (params.get('c') || ((!['','links.html','index.html'].includes(pathRef))?pathRef:'')).trim();
let deferredInstallPrompt = null;
let showcaseTimer = null;
let currentPublicAcademic = null;
let currentPublicClassId = '';
let currentPublicData = null;
let currentPublicMemberData = null;

const PLATFORM = {
  WHATSAPP: ['WhatsApp', 'chat', 'Ruang komunikasi dan grup kelas'],
  ZOOM: ['Zoom', 'videocam', 'Akses perkuliahan dan pertemuan online'],
  GOOGLE_DRIVE: ['Google Drive', 'folder', 'Materi, dokumen, dan arsip kelas'],
  GOOGLE_MEET: ['Google Meet', 'video_call', 'Pertemuan kelas secara online'],
  YOUTUBE: ['YouTube', 'smart_display', 'Channel dan playlist pembelajaran'],
  TELEGRAM: ['Telegram', 'send', 'Kanal komunikasi tambahan'],
  WEBSITE: ['Website', 'language', 'Portal dan sumber informasi kelas'],
  OTHER: ['Lainnya', 'link', 'Akses penting lainnya']
};
const ORDERED = ['WHATSAPP','ZOOM','GOOGLE_MEET','GOOGLE_DRIVE','YOUTUBE','TELEGRAM','WEBSITE','OTHER'];
const esc = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const classCode = rawCode;
const PUBLIC_CACHE_KEY = classCode ? `kelasku_public_links_cache_v676_${classCode.toLowerCase()}` : '';
const PUBLIC_CACHE_MS = 10 * 60 * 1000;
const fmtDate = value => { try { return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value)); } catch { return value || '-'; } };
const isFuture = value => value && new Date(value).getTime() >= Date.now();
const scheduleStillActive = x => { const end=x?.end_at?new Date(x.end_at).getTime():new Date(x?.start_at||0).getTime()+3*60*60*1000; return Number.isFinite(end)&&end>=Date.now(); };
const taskStillActive = x => !x?.deadline || new Date(x.deadline).getTime() >= Date.now();
const byDate = key => (a,b) => new Date(a?.[key] || 8640000000000000) - new Date(b?.[key] || 8640000000000000);
const schedulePhase = x => { const now=Date.now(),start=new Date(x?.start_at||0).getTime(),end=x?.end_at?new Date(x.end_at).getTime():start+3*60*60*1000; if(start<=now&&end>=now)return 'ONGOING'; if(end<now)return 'DONE'; return 'UPCOMING'; };
const scheduleSort = (a,b) => ({ONGOING:0,UPCOMING:1,DONE:2}[schedulePhase(a)]??9)-({ONGOING:0,UPCOMING:1,DONE:2}[schedulePhase(b)]??9) || byDate('start_at')(a,b);

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButton();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallButton();
});


function readPublicCache(){
  if(!PUBLIC_CACHE_KEY)return null;
  try{
    const cached=JSON.parse(localStorage.getItem(PUBLIC_CACHE_KEY)||'null');
    if(!cached?.data || !cached?.at || Date.now()-Number(cached.at)>PUBLIC_CACHE_MS)return null;
    return cached.data;
  }catch{return null;}
}
function writePublicCache(data){
  if(!PUBLIC_CACHE_KEY || !data)return;
  try{localStorage.setItem(PUBLIC_CACHE_KEY,JSON.stringify({at:Date.now(),data}));}catch{}
}
function samePublicData(a,b){
  try{return JSON.stringify(a)===JSON.stringify(b);}catch{return false;}
}

function publicReturnPath(){
  const path=`${location.pathname}${location.search}`;
  return path.startsWith('/')&&!path.startsWith('//')?path:'/';
}
function loginAndReturnToPublic(){
  const back=publicReturnPath();
  try{sessionStorage.setItem('kelasku_post_auth_url',back);}catch{}
  const loginUrl=new URL('/login',location.origin);
  loginUrl.searchParams.set('return',back);
  location.assign(loginUrl.toString());
}

function groupsFromItems(items=[]) {
  return items.reduce((acc,item) => {
    const key = PLATFORM[item.platform] ? item.platform : 'OTHER';
    (acc[key] ||= []).push(item);
    return acc;
  }, {});
}

function linkSectionLabel(item={}) {
  const label=String(item.section_label||'').trim();
  return label || 'Umum';
}

function linkSectionKey(label='',index=0) {
  const clean=String(label||'umum').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32);
  return `${clean||'umum'}-${index+1}`;
}

function linkSectionBuckets(items=[]) {
  const order=[];
  const map={};
  items.forEach(item=>{
    const label=linkSectionLabel(item);
    if(!map[label]){map[label]=[];order.push(label);}
    map[label].push(item);
  });
  return order.map((label,index)=>({label,key:linkSectionKey(label,index),items:map[label]}));
}

function groupSection(key, items, scope='default') {
  const [label, icon, copy] = PLATFORM[key] || PLATFORM.OTHER;
  const visible = items.slice(0,3);
  const extra = items.slice(3);
  const cards = arr => arr.map(item => {
    const isPrivate=String(item.visibility||'PUBLIC').toUpperCase()==='MEMBER';
    const locked=Boolean(item.locked || (isPrivate && !String(item.url||'').trim()));
    const inner=`
      <span class="public-link-icon material-symbols-rounded">${locked?'lock':(isPrivate?'lock':'link')}</span>
      <span class="public-link-copy"><strong>${esc(item.label)}</strong>${locked?'<small>Khusus anggota kelas</small>':(item.description?`<small>${esc(item.description)}</small>`:'')}</span>
      ${isPrivate?'<span class="public-link-private-badge">ANGGOTA</span>':''}
      <span class="material-symbols-rounded public-link-arrow">${locked?'login':'arrow_outward'}</span>`;
    if(locked){
      return `<button type="button" class="public-link-card is-member-link is-locked-link" data-private-link-login data-private-link-label="${esc(item.label)}">${inner}</button>`;
    }
    return `<a class="public-link-card ${isPrivate?'is-member-link':''}" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }).join('');
  const safeScope=String(scope||'default').replace(/[^a-z0-9_-]/gi,'-').toLowerCase();
  const panelId = `public-group-panel-${safeScope}-${key.toLowerCase()}`;
  return `<section class="public-link-group" data-public-group="${key}" data-public-group-scope="${esc(safeScope)}">
    <button type="button" class="public-group-hero platform-${key.toLowerCase()}" data-public-group-toggle="${key}" aria-expanded="false" aria-controls="${panelId}">
      <span class="public-group-art"><span class="material-symbols-rounded">${icon}</span></span>
      <span class="public-group-title"><span class="public-kicker">${esc(label)}</span><strong>${esc(copy)}</strong></span>
      <span class="public-group-count">${items.length} LINK</span>
    </button>
    <div class="public-group-panel" id="${panelId}" hidden>
      <div class="public-link-list">${cards(visible)}<div class="public-link-extra" ${extra.length?'hidden':''}>${cards(extra)}</div></div>
      ${extra.length?`<button class="public-show-more" type="button" data-show-more="${key}"><span>Lihat ${extra.length} link lainnya</span><span class="material-symbols-rounded">expand_more</span></button>`:''}
    </div>
  </section>`;
}

function linkPeriodUi(items=[]) {
  const buckets=linkSectionBuckets(items);
  if(!buckets.length) return {nav:'',panels:''};
  const nav=`<section class="public-link-period-switch" aria-label="Kelompok link kelas">
    <button type="button" class="public-period-arrow" data-period-scroll="prev" aria-label="Tab sebelumnya"><span class="material-symbols-rounded">chevron_left</span></button>
    <div class="public-link-period-tabs" data-period-tabs>${buckets.map((bucket,index)=>`<button type="button" class="public-link-period-tab ${index===0?'active':''}" data-public-link-period="${esc(bucket.key)}" aria-selected="${index===0?'true':'false'}">${esc(bucket.label)}</button>`).join('')}</div>
    <button type="button" class="public-period-arrow" data-period-scroll="next" aria-label="Tab berikutnya"><span class="material-symbols-rounded">chevron_right</span></button>
  </section>`;
  const panels=buckets.map((bucket,index)=>{
    const groups=groupsFromItems(bucket.items);
    const body=ORDERED.filter(key=>Array.isArray(groups[key])&&groups[key].length).map(key=>groupSection(key,groups[key],bucket.key)).join('');
    return `<div class="public-link-period-panel" data-public-link-period-panel="${esc(bucket.key)}" ${index?'hidden':''}>${body}</div>`;
  }).join('');
  return {nav,panels};
}

function publicHero(cls, appearance={}) {
  const meta = [
    cls.institution || '',
    cls.study_program && !String(cls.name || '').toLowerCase().includes(String(cls.study_program).toLowerCase()) ? cls.study_program : '',
    cls.cohort ? `Angkatan ${cls.cohort}` : '',
    cls.semester || ''
  ].filter(Boolean);
  const visibility = cls.visibility || 'KELAS';
  const desktop=appearance?.active?.LANDING_DESKTOP?.url || '';
  const mobile=appearance?.active?.LANDING_MOBILE?.url || desktop;
  const customHero=Boolean(desktop||mobile);
  return `<section class="public-hero ${customHero?'public-hero-custom-v6725':''}">
    ${customHero?`<picture class="public-hero-bg-v6725" aria-hidden="true"><source media="(max-width:720px)" srcset="${esc(mobile||desktop)}"><img src="${esc(desktop||mobile)}" alt="" loading="eager" decoding="async"></picture><span class="public-hero-shade-v6725" aria-hidden="true"></span>`:''}
    <span class="public-hero-icon material-symbols-rounded">school</span>
    <div class="public-hero-copy">
      <div class="public-hero-heading">
        <h1>${esc(cls.name || 'Kelas')}</h1>
      </div>
      <div class="public-meta-line">${meta.map((item,index)=>`${index?'<i>•</i>':''}<span>${esc(item)}</span>`).join('')}<span class="public-visibility-badge">${esc(visibility)}</span></div>
      <div class="public-hero-foot">
        <p>${esc(cls.description || 'Belajar dan berdiskusi bersama dalam satu ruang.')}</p>
        <small class="public-class-code">${esc(cls.class_code || '')}${cls.status?` • ${esc(cls.status)}`:''}</small>
      </div>
    </div>
  </section>`;
}

function roomList(items, emptyText, renderItem) {
  return items.length
    ? `<div class="public-room-list">${items.map(renderItem).join('')}</div>`
    : `<div class="public-room-empty"><span class="material-symbols-rounded">inbox</span><span>${esc(emptyText)}</span></div>`;
}

function renderPublicScheduleRows(items=[], {guest=false}={}) {
  return items.map(x=>`<button type="button" ${guest?'data-guest-detail':'data-public-open-detail'}="schedule" data-public-item-id="${esc(x.schedule_id)}" class="public-room-row public-room-clickable"><span class="public-room-row-icon material-symbols-rounded">calendar_month</span><div><strong>${esc(x.title || 'Jadwal Kelas')}</strong><small>${schedulePhase(x)==='ONGOING'?'Sedang berlangsung · ':''}${esc(fmtDate(x.start_at))}${x.location?` · ${esc(/^https?:\/\//i.test(String(x.location||'').trim())?'Pertemuan online':x.location)}`:''}</small></div><span class="material-symbols-rounded public-row-arrow">chevron_right</span></button>`).join('');
}

function publicScheduleBlock(schedules=[], activeAttendance=null, {guest=false,classId=''}={}) {
  const activeScheduleId=String(activeAttendance?.source_schedule_id||'');
  const clean=schedules.filter(x=>!activeScheduleId || String(x.schedule_id)!==activeScheduleId);
  const first=clean.slice(0,4),extra=clean.slice(4);
  const list=clean.length?`<div class="public-room-list">${renderPublicScheduleRows(first,{guest})}${extra.length?`<div class="public-schedule-extra" hidden>${renderPublicScheduleRows(extra,{guest})}</div>`:''}</div>`:`<div class="public-room-empty"><span class="material-symbols-rounded">event_busy</span><span>Belum ada jadwal aktif atau mendatang.</span></div>`;
  const controls=`<div class="public-schedule-controls">${extra.length?`<button type="button" class="public-schedule-toggle" data-public-schedule-expand><span class="material-symbols-rounded">unfold_more</span><span>Lihat semua jadwal</span></button><button type="button" class="public-schedule-toggle" data-public-schedule-collapse hidden><span class="material-symbols-rounded">unfold_less</span><span>Lipat jadwal</span></button>`:''}${guest?'':`<a class="public-text-link" href="/ruang-kelas" data-open-class-tab="schedule" data-class-id="${esc(classId)}">Buka jadwal lengkap <span class="material-symbols-rounded">arrow_forward</span></a>`}</div>`;
  return `${list}${controls}`;
}


function imageSectionHead(kind,kicker,title,copy='',extra='') {
  return `<div class="public-image-head public-image-head-${esc(kind)}"><div class="public-image-head-copy"><span class="public-kicker">${esc(kicker)}</span><h2>${esc(title)}</h2>${copy?`<p>${esc(copy)}</p>`:''}</div>${extra||''}</div>`;
}

function memberAcademicHub(academic={}, classId='') {
  const allSchedules=(academic.schedules||[]).filter(scheduleStillActive).sort(scheduleSort);
  const tasks=(academic.tasks||[]).filter(x=>!['SUBMITTED','REVIEWED','GRADED'].includes(String(x.submission_status||'').toUpperCase()) && taskStillActive(x)).sort(byDate('deadline')).slice(0,4);
  const attendance=(academic.permissions?.is_participant===false?[]:(academic.attendance_sessions||[]))
    .filter(x=>String(x.my_status||'UNMARKED').toUpperCase()==='UNMARKED')
    .sort((a,b)=>{const rank={LATE:0,OPEN:1,UPCOMING:2,CLOSED:3},ak=publicAttendanceState(a).key,bk=publicAttendanceState(b).key,ar=rank[ak]??9,br=rank[bk]??9;if(ar!==br)return ar-br;const ad=new Date(a.open_at||a.start_at||0).getTime()||0,bd=new Date(b.open_at||b.start_at||0).getTime()||0;return ak==='CLOSED'?bd-ad:ad-bd;})
    .slice(0,4);
  const announcements=(academic.announcements||[]).slice(0,4);
  const activeAttendance=attendance.find(x=>['OPEN','LATE'].includes(publicAttendanceState(x).key));
  const activeBanner=activeAttendance?publicActiveAttendanceBanner(activeAttendance):'';
  const panels = {
    schedule: `${activeBanner}${publicScheduleBlock(allSchedules,activeAttendance,{guest:false,classId})}`,
    attendance: attendance.length?`<div class="public-attendance-list">${attendance.map(publicAttendanceRowHtml).join('')}</div>`:`<div class="public-room-empty"><span class="material-symbols-rounded">task_alt</span><span>Tidak ada presensi yang perlu kamu isi.</span></div>`,
    tasks: roomList(tasks,'Tidak ada tugas aktif.',x=>`<button type="button" data-public-open-detail="task" data-public-item-id="${esc(x.task_id)}" class="public-room-row public-room-clickable"><span class="public-room-row-icon material-symbols-rounded">checklist</span><div><strong>${esc(x.title || 'Tugas')}</strong><small>${x.deadline?`Deadline ${esc(fmtDate(x.deadline))}`:'Tanpa deadline'}${x.submission_status?` · ${esc(x.submission_status)}`:''}</small></div><span class="material-symbols-rounded public-row-arrow">chevron_right</span></button>`),
    announcements: roomList(announcements,'Belum ada informasi terbaru.',x=>`<button type="button" data-public-open-detail="announcement" data-public-item-id="${esc(x.announcement_id)}" class="public-room-row public-room-clickable"><span class="public-room-row-icon material-symbols-rounded">campaign</span><div><strong>${esc(x.title || 'Pengumuman')}</strong><small>${x.published_at?esc(fmtDate(x.published_at)):'Informasi kelas'}</small></div><span class="material-symbols-rounded public-row-arrow">chevron_right</span></button>`)
  };
  const counts={schedule:allSchedules.length,attendance:attendance.filter(x=>['OPEN','LATE'].includes(publicAttendanceState(x).key)).length,tasks:tasks.length,announcements:announcements.length};
  const tabs = [['schedule','calendar_month','Jadwal'],['attendance','done_all','Presensi'],['tasks','checklist','Tugas'],['announcements','campaign','Informasi']];
  return `<section class="public-room-hub">${imageSectionHead('access','INFORMASI KELAS','Jadwal & aktivitas kelas','Lihat jadwal terdekat, presensi yang perlu diisi, tugas, dan informasi kelas.')}<nav class="public-room-tabs" aria-label="Informasi kelas">${tabs.map(([key,icon,label],index)=>`<button type="button" class="public-room-tab ${index===0?'active':''}" data-public-room="${key}" aria-selected="${index===0?'true':'false'}"><span class="material-symbols-rounded">${icon}</span><span>${label}</span>${counts[key]?`<b class="public-tab-signal">${counts[key]>9?'9+':counts[key]}</b>`:''}</button>`).join('')}</nav><div class="public-room-panels">${tabs.map(([key],index)=>`<div class="public-room-panel" data-public-room-panel="${key}" ${index?'hidden':''}>${panels[key]}</div>`).join('')}</div></section>`;
}

function academicLoading() {
  return `<section class="public-room-hub public-room-loading" aria-live="polite"><div class="public-inline-loader"><span class="public-loader"></span><div><strong>Menyiapkan informasi kelas…</strong><small>Link publik sudah dapat digunakan sambil data anggota dimuat.</small></div></div></section>`;
}

function guestAcademicHub(loggedIn,academic={}) {
  const allSchedules=(academic.schedules||[]).filter(scheduleStillActive).sort(scheduleSort);
  const tasks=(academic.tasks||[]).filter(taskStillActive).slice(0,4),attendance=(academic.attendance_sessions||academic.attendance||[]).filter(x=>String(x.window_status||'').toUpperCase()==='OPEN').slice(0,3),announcements=(academic.announcements||[]).slice(0,4);
  const activeAttendance=attendance[0];
  const activeBanner=activeAttendance?`<div class="public-active-attendance locked"><div><span class="public-active-kicker"><span class="material-symbols-rounded">how_to_reg</span> PRESENSI AKTIF</span><strong>${esc(activeAttendance.title||'Presensi Kelas')}</strong><small>Login sebagai anggota kelas untuk mengisi presensi.</small></div><button type="button" data-locked-action="Presensi" class="public-primary-action">Masuk untuk Presensi</button></div>`:'';
  const panels={
    schedule:`${activeBanner}${publicScheduleBlock(allSchedules,activeAttendance,{guest:true})}`,
    attendance:roomList(attendance,'Belum ada presensi aktif.',x=>`<div class="public-room-row public-room-row-action"><button type="button" data-guest-detail="attendance" data-public-item-id="${esc(x.attendance_id)}" class="public-room-inline-link"><span class="public-room-row-icon material-symbols-rounded">done_all</span><div><strong>${esc(x.title)}</strong><small>${x.start_at?esc(fmtDate(x.start_at)):'Sesi aktif'}</small></div></button><button type="button" data-locked-action="Presensi" class="public-primary-action">Login</button></div>`),
    tasks:roomList(tasks,'Belum ada tugas publik.',x=>`<button type="button" data-guest-detail="task" data-public-item-id="${esc(x.task_id)}" class="public-room-row public-room-clickable"><span class="public-room-row-icon material-symbols-rounded">checklist</span><div><strong>${esc(x.title)}</strong><small>${x.deadline?`Deadline ${esc(fmtDate(x.deadline))}`:'Tanpa deadline'}</small></div><span class="material-symbols-rounded public-row-arrow">chevron_right</span></button>`),
    announcements:roomList(announcements,'Belum ada informasi publik.',x=>`<button type="button" data-guest-detail="announcement" data-public-item-id="${esc(x.announcement_id)}" class="public-room-row public-room-clickable"><span class="public-room-row-icon material-symbols-rounded">campaign</span><div><strong>${esc(x.title)}</strong><small>${x.published_at?esc(fmtDate(x.published_at)):'Informasi kelas'}</small></div><span class="material-symbols-rounded public-row-arrow">chevron_right</span></button>`)
  };
  const counts={schedule:allSchedules.length,attendance:attendance.length,tasks:tasks.length,announcements:announcements.length};
  const tabs=[['schedule','calendar_month','Jadwal'],['attendance','done_all','Presensi'],['tasks','checklist','Tugas'],['announcements','campaign','Informasi']];
  return `<section class="public-room-hub">${imageSectionHead('access','INFORMASI KELAS','Jadwal & aktivitas kelas','Jadwal publik dapat dilihat. Presensi internal memerlukan login sebagai anggota kelas.')}<nav class="public-room-tabs" aria-label="Informasi kelas">${tabs.map(([key,icon,label],index)=>`<button type="button" class="public-room-tab ${index===0?'active':''}" data-public-room="${key}" aria-selected="${index===0?'true':'false'}"><span class="material-symbols-rounded">${icon}</span><span>${label}</span>${counts[key]?`<b class="public-tab-signal">${counts[key]>9?'9+':counts[key]}</b>`:''}</button>`).join('')}</nav><div class="public-room-panels">${tabs.map(([key],index)=>`<div class="public-room-panel" data-public-room-panel="${key}" ${index?'hidden':''}>${panels[key]}</div>`).join('')}</div></section>`;
}

function showPublicNotice(message){
  let notice=document.getElementById('public-notice');
  if(!notice){notice=document.createElement('div');notice.id='public-notice';notice.className='public-notice';document.body.appendChild(notice);}
  notice.textContent=message;notice.classList.add('show');clearTimeout(showPublicNotice.timer);showPublicNotice.timer=setTimeout(()=>notice.classList.remove('show'),2600);
}

function showcase() {
  const slides=[['dashboard','Dashboard','Semua informasi penting dalam satu layar.'],['calendar_month','Jadwal','Agenda kelas lebih teratur.'],['checklist','Tugas','Deadline dan progres lebih jelas.'],['done_all','Presensi','Check-in dan riwayat kehadiran.'],['folder','Materi','Referensi kelas tetap rapi.'],['groups','Kelola Kelas','Koordinasi anggota dalam satu ruang.']];
  return `<section class="public-showcase">${imageSectionHead('showcase','KENAL KELASKU','Satu ruang untuk kebutuhan kelas.','',`<div class="public-showcase-nav"><button type="button" data-showcase-prev aria-label="Sebelumnya"><span class="material-symbols-rounded">arrow_back</span></button><button type="button" data-showcase-next aria-label="Berikutnya"><span class="material-symbols-rounded">arrow_forward</span></button></div>`)}<div class="public-showcase-track" id="public-showcase-track">${slides.map(([icon,title,copy],i)=>`<article class="public-device-card"><div class="public-browser-bar"><i></i><i></i><i></i><span>klasku.my.id</span></div><div class="public-device-screen"><span class="material-symbols-rounded">${icon}</span><small>PREVIEW ${String(i+1).padStart(2,'0')}</small><strong>${title}</strong><p>${copy}</p><div class="public-mock-lines"><i></i><i></i><i></i></div></div></article>`).join('')}</div><div class="public-showcase-actions"><a href="/" class="public-promo-btn">Buka KelasKu <span class="material-symbols-rounded">arrow_forward</span></a><button id="public-install-btn" type="button" class="public-install-btn" hidden>Install KelasKu <span class="material-symbols-rounded">download</span></button></div></section>`;
}


function syncPublicReleaseFooter(){
  const version=document.getElementById('public-footer-version');
  const updated=document.getElementById('public-footer-updated');
  if(version)version.textContent=`v${window.KELASKU_CONFIG?.APP_VERSION||'6.7.6'}`;
  if(updated)updated.textContent=window.KELASKU_CONFIG?.RELEASED_AT_WIB||'28 Sep 2026, 11:13 WIB';
}

function render(data, memberData=null, academic=null, { membershipLoading=false }={}) {
  const cls = data.class || {};
  document.title = `${cls.name || 'Link Kelas'} — KelasKu`;
  syncPublicMetadata(cls);
  const isMember=Boolean(memberData);
  const loggedIn=Boolean(state.sessionToken && state.user);
  // Guest hanya memakai `data.items` dari endpoint publik yang sudah disaring server-side.
  // Fallback groups dipertahankan untuk cache/release lama, tetap hanya berisi PUBLIC links.
  const publicItems=Array.isArray(data.items)?data.items:Object.values(data.groups||{}).flat();
  const sourceItems=isMember?(memberData.class_links||[]):publicItems;
  const linkUi=linkPeriodUi(sourceItems);
  currentPublicAcademic = isMember ? (academic || {}) : (data.public_academic || {});
  currentPublicClassId = cls.class_id || '';
  currentPublicData = data;
  currentPublicMemberData = memberData;
  const infoSection = isMember
    ? memberAcademicHub(academic||{},cls.class_id||'')
    : (membershipLoading ? academicLoading() : guestAcademicHub(loggedIn,data.public_academic||{}));

  content.innerHTML = `${publicHero(cls,data.appearance||{})}
    ${infoSection}
    ${linkUi.nav?`<div class="public-period-standalone">${linkUi.nav}</div>`:''}
    <section class="public-section-block">${imageSectionHead('links','LINK CEPAT','Akses penting kelas','Pilih tab, lalu buka kategori link yang dibutuhkan.')}${linkUi.panels || `<div class="public-empty"><span class="material-symbols-rounded">link_off</span><strong>Belum ada link yang dibagikan</strong><p>Pengelola kelas belum menambahkan link untuk akses ini.</p></div>`}</section>
    ${showcase()}`;
  bindInteractions();
  syncPublicReleaseFooter();
}

function publicAttendanceLabel(v){return ({PRESENT:'Hadir',SICK:'Sakit',PERMIT:'Izin',ABSENT:'Alpa',UNMARKED:'Belum'})[String(v||'UNMARKED').toUpperCase()]||String(v||'Belum');}
function publicChannelLabel(v){return ({ZOOM:'Zoom',YOUTUBE:'YouTube',OFFLINE:'Offline',OTHER:'Lainnya'})[String(v||'').toUpperCase()]||String(v||'');}
function publicAttendanceState(item={}){
  const myStatus=String(item.my_status||'UNMARKED').toUpperCase();
  if(myStatus!=='UNMARKED')return{key:'DONE',label:publicAttendanceLabel(myStatus),icon:'check_circle'};
  const now=Date.now(),open=new Date(item.open_at||item.start_at||0).getTime(),close=new Date(item.close_at||item.end_at||0).getTime(),late=new Date(item.late_after_at||0).getTime();
  if(Number.isFinite(open)&&open&&now<open)return{key:'UPCOMING',label:'Belum dibuka',icon:'lock_clock'};
  if(Number.isFinite(close)&&close&&now>close)return{key:'CLOSED',label:'Ditutup',icon:'lock'};
  if(item.lateness_enabled&&Number.isFinite(late)&&late&&now>late)return{key:'LATE',label:'Terlambat',icon:'schedule'};
  return{key:'OPEN',label:'Belum presensi',icon:'how_to_reg'};
}
function publicAttendanceWindowText(item={}){
  const start=item.open_at||item.start_at||'',end=item.close_at||item.end_at||'';
  return `${start?`Mulai ${fmtDate(start)}`:'Mulai belum diatur'}${end?` • Selesai ${fmtDate(end)}`:' • Selesai belum diatur'}`;
}
function publicActiveAttendanceBanner(item){
  const ui=publicAttendanceState(item);
  return `<div class="public-active-attendance state-${ui.key.toLowerCase()}" data-public-attendance-card="${esc(item.attendance_id)}"><div><span class="public-active-kicker"><span class="material-symbols-rounded">${ui.icon}</span> ${ui.key==='LATE'?'PRESENSI TERLAMBAT':'PRESENSI AKTIF'}</span><strong>${esc(item.title||'Presensi Kelas')}</strong><small>${esc(publicAttendanceWindowText(item))} · ${esc(ui.label)}</small></div><button type="button" class="public-primary-action" data-public-quick-attendance="${esc(item.attendance_id)}">Isi Presensi</button></div>`;
}
function publicAttendanceRowHtml(item){
  const ui=publicAttendanceState(item),canSubmit=['OPEN','LATE'].includes(ui.key);
  const kicker=ui.key==='LATE'?'TERLAMBAT':ui.key==='UPCOMING'?'BELUM DIBUKA':ui.key==='CLOSED'?'DITUTUP':'PERLU PRESENSI';
  return `<article class="public-attendance-row state-${ui.key.toLowerCase()}" data-public-attendance-card="${esc(item.attendance_id)}"><div class="public-attendance-main"><span class="public-attendance-icon material-symbols-rounded">${ui.icon}</span><div><span class="public-attendance-kicker">${kicker}</span><strong>${esc(item.title||'Presensi Kelas')}</strong><small>${esc(publicAttendanceWindowText(item))}</small></div></div><span class="public-attendance-state state-${ui.key.toLowerCase()}">${esc(ui.label)}</span>${canSubmit?`<button type="button" data-public-quick-attendance="${esc(item.attendance_id)}" class="public-primary-action">Presensi</button>`:''}</article>`;
}

function showQuickAttendance(attendanceId){
  const academic=currentPublicAcademic||{},item=(academic.attendance_sessions||[]).find(x=>String(x.attendance_id)===String(attendanceId));
  if(!item||!item.public_token)return showPublicNotice('Presensi belum dapat diisi.');
  const ui=publicAttendanceState(item);
  if(String(item.my_status||'UNMARKED').toUpperCase()!=='UNMARKED')return showPublicNotice('Presensi sudah tercatat. Perubahan dilakukan pengelola dari Ruang Kelas.');
  if(!['OPEN','LATE'].includes(ui.key))return showPublicNotice(ui.key==='UPCOMING'?'Presensi belum dibuka.':'Waktu presensi sudah ditutup.');
  const choices=[['PRESENT','Hadir','check_circle'],...(item.sick_enabled===false?[]:[['SICK','Sakit','sick']]),...(item.permit_enabled===false?[]:[['PERMIT','Izin','assignment']])];
  const channels=Array.isArray(item.channels)?item.channels:[];let selected='PRESENT',channel=String(channels[0]||'');
  closePublicDetail();const overlay=document.createElement('div');overlay.id='public-detail-overlay';overlay.className='public-detail-overlay';
  overlay.innerHTML=`<div class="public-detail-card public-attendance-card"><div class="public-detail-head"><div><span class="public-kicker">${ui.key==='LATE'?'PRESENSI TERLAMBAT':'PRESENSI AKTIF'}</span><h3>${esc(item.title||'Presensi Kelas')}</h3><small>${esc(publicAttendanceWindowText(item))}</small></div><button type="button" data-public-detail-close class="public-detail-close"><span class="material-symbols-rounded">close</span></button></div>${ui.key==='LATE'?'<div class="public-attendance-late-note"><span class="material-symbols-rounded">schedule</span><span>Kamu sudah melewati batas tepat waktu, tetapi presensi masih dibuka.</span></div>':''}<div class="public-attendance-statuses">${choices.map(([v,l,i])=>`<button type="button" data-quick-status="${v}" class="public-attendance-choice ${selected===v?'active':''}"><span class="material-symbols-rounded">${i}</span>${l}</button>`).join('')}</div><div class="public-attendance-channels" data-quick-channels><small>Mengikuti melalui</small><div>${channels.length?channels.map(ch=>`<button type="button" data-quick-channel="${esc(ch)}" class="public-channel-choice ${channel===ch?'active':''}">${esc(publicChannelLabel(ch))}</button>`).join(''):'<span class="soft-chip">Media tidak dibatasi</span>'}</div></div><label class="public-quick-note">Catatan (opsional)<input id="public-quick-att-note" value="" placeholder="Catatan singkat"></label><div id="public-quick-att-status" class="public-quick-status"></div><button type="button" id="public-quick-att-submit" class="public-primary-action public-quick-submit">Kirim Presensi</button><small class="public-attendance-lock-note">Setelah dikirim, presensi tidak dapat diubah dari Landing. Koreksi dilakukan pengelola kelas.</small></div>`;
  document.body.appendChild(overlay);overlay.querySelector('[data-public-detail-close]')?.addEventListener('click',closePublicDetail);overlay.addEventListener('click',e=>{if(e.target===overlay)closePublicDetail();});
  overlay.querySelectorAll('[data-quick-status]').forEach(btn=>btn.onclick=()=>{selected=btn.dataset.quickStatus;overlay.querySelectorAll('[data-quick-status]').forEach(x=>x.classList.toggle('active',x===btn));overlay.querySelector('[data-quick-channels]')?.classList.toggle('hidden',selected!=='PRESENT');});
  overlay.querySelectorAll('[data-quick-channel]').forEach(btn=>btn.onclick=()=>{channel=btn.dataset.quickChannel;overlay.querySelectorAll('[data-quick-channel]').forEach(x=>x.classList.toggle('active',x===btn));});
  overlay.querySelector('#public-quick-att-submit')?.addEventListener('click',async()=>{const btn=overlay.querySelector('#public-quick-att-submit'),status=overlay.querySelector('#public-quick-att-status');if(btn.disabled)return;btn.disabled=true;status.textContent='Menyimpan presensi…';try{const result=await api('selfCheckInAttendance',{token:item.public_token,attendance_status:selected,attendance_channel:selected==='PRESENT'?channel:'',note:overlay.querySelector('#public-quick-att-note')?.value||''});item.my_status=result.attendance_status||selected;item.my_channel=result.attendance_channel||'';item.my_punctuality=result.punctuality||'';status.textContent=`Tersimpan: ${publicAttendanceLabel(item.my_status)}${item.my_channel?` • ${publicChannelLabel(item.my_channel)}`:''}`;showPublicNotice('Presensi berhasil disimpan.');setTimeout(()=>{closePublicDetail();if(currentPublicData)render(currentPublicData,currentPublicMemberData,currentPublicAcademic);},450);}catch(err){status.textContent=err.message;btn.disabled=false;}});
}

function closePublicDetail(){document.getElementById('public-detail-overlay')?.remove();}
function showPublicAcademicDetail(type,id){
  const academic=currentPublicAcademic||{};let item=null,title='',meta='',body='',action='';
  if(type==='schedule'){
    item=(academic.schedules||[]).find(x=>String(x.schedule_id)===String(id));if(!item)return;
    title=item.title||'Jadwal Kelas';const online=/^https?:\/\//i.test(String(item.location||'').trim());meta=`${fmtDate(item.start_at)}${item.end_at?` — ${fmtDate(item.end_at)}`:''}`;body=`${item.description?`<p>${esc(item.description)}</p>`:''}<div class="public-detail-meta"><span class="material-symbols-rounded">location_on</span><span>${esc(online?'Pertemuan online':(item.location||'Lokasi belum ditentukan'))}</span></div>`;action=`<a href="/ruang-kelas" data-open-class-tab="schedule" data-class-id="${esc(currentPublicClassId)}" class="public-primary-action public-detail-action">Buka Ruang Kelas</a>`;
  }else if(type==='task'){
    item=(academic.tasks||[]).find(x=>String(x.task_id)===String(id));if(!item)return;title=item.title||'Tugas';meta=item.deadline?`Deadline ${fmtDate(item.deadline)}`:'Tanpa deadline';body=`<p>${esc(item.description||'Tidak ada deskripsi tambahan.')}</p>${item.submission_status?`<div class="public-detail-meta"><span class="material-symbols-rounded">task_alt</span><span>Status: ${esc(item.submission_status)}</span></div>`:''}`;action=`<a href="/ruang-kelas" data-open-class-tab="tasks" data-class-id="${esc(currentPublicClassId)}" class="public-primary-action public-detail-action">Buka Tugas</a>`;
  }else if(type==='announcement'){
    item=(academic.announcements||[]).find(x=>String(x.announcement_id)===String(id));if(!item)return;title=item.title||'Informasi';meta=item.published_at?fmtDate(item.published_at):'Informasi kelas';body=`<p>${esc(item.body||'Tidak ada isi tambahan.')}</p>`;action=`<a href="/ruang-kelas" data-open-class-tab="announcements" data-class-id="${esc(currentPublicClassId)}" class="public-primary-action public-detail-action">Buka Pengumuman</a>`;
  }else if(type==='attendance'){
    item=((academic.attendance_sessions||academic.attendance)||[]).find(x=>String(x.attendance_id)===String(id));if(!item)return;const ui=publicAttendanceState(item);title=item.title||'Presensi';meta=publicAttendanceWindowText(item);body=`<p>Status saat ini: <strong>${esc(ui.label)}</strong>. Presensi Landing hanya dapat dikirim satu kali; koreksi dilakukan pengelola dari Ruang Kelas.</p>`;action=item.public_token&&String(item.my_status||'UNMARKED').toUpperCase()==='UNMARKED'&&['OPEN','LATE'].includes(ui.key)?`<button type="button" data-public-quick-attendance="${esc(item.attendance_id)}" class="public-primary-action public-detail-action">Isi Presensi</button>`:'';
  }
  closePublicDetail();const overlay=document.createElement('div');overlay.id='public-detail-overlay';overlay.className='public-detail-overlay';overlay.innerHTML=`<div class="public-detail-card"><div class="public-detail-head"><div><span class="public-kicker">DETAIL KELAS</span><h3>${esc(title)}</h3><small>${esc(meta)}</small></div><button type="button" data-public-detail-close class="public-detail-close"><span class="material-symbols-rounded">close</span></button></div><div class="public-detail-body">${body}</div>${action?`<div class="public-detail-actions">${action}</div>`:''}</div>`;document.body.appendChild(overlay);overlay.addEventListener('click',e=>{if(e.target===overlay)closePublicDetail();});overlay.querySelector('[data-public-detail-close]')?.addEventListener('click',closePublicDetail);overlay.querySelectorAll('[data-open-class-tab]').forEach(link=>link.addEventListener('click',()=>{sessionStorage.setItem('kelasku_selected_class',link.dataset.classId||'');sessionStorage.setItem('kelasku_class_tab',link.dataset.openClassTab||'overview');}));overlay.querySelectorAll('[data-public-quick-attendance]').forEach(btn=>btn.addEventListener('click',()=>showQuickAttendance(btn.dataset.publicQuickAttendance)));
}

function bindInteractions(){
  document.querySelectorAll('[data-open-class-tab]').forEach(link=>link.addEventListener('click',()=>{
    const id=link.dataset.classId||'';
    if(id){
      sessionStorage.setItem('kelasku_selected_class',id);
      sessionStorage.setItem('kelasku_class_tab',link.dataset.openClassTab||'overview');
    }
  }));

  document.querySelectorAll('[data-public-open-detail]').forEach(btn=>btn.addEventListener('click',()=>showPublicAcademicDetail(btn.dataset.publicOpenDetail,btn.dataset.publicItemId)));
  document.querySelectorAll('[data-public-quick-attendance]').forEach(btn=>btn.addEventListener('click',()=>showQuickAttendance(btn.dataset.publicQuickAttendance)));
  document.querySelectorAll('[data-guest-detail]').forEach(btn=>btn.addEventListener('click',()=>showPublicAcademicDetail(btn.dataset.guestDetail,btn.dataset.publicItemId)));
  document.querySelectorAll('[data-locked-action]').forEach(btn=>btn.addEventListener('click',()=>{
    if(Boolean(state.sessionToken&&state.user)) return showPublicNotice(`${btn.dataset.lockedAction} hanya tersedia untuk anggota kelas ini.`);
    loginAndReturnToPublic();
  }));
  document.querySelectorAll('[data-private-link-login]').forEach(btn=>btn.addEventListener('click',()=>{
    if(Boolean(state.sessionToken&&state.user)) return showPublicNotice(`${btn.dataset.privateLinkLabel||'Link'} khusus anggota kelas ini.`);
    loginAndReturnToPublic();
  }));
  const periodTabs=document.querySelector('[data-period-tabs]');
  const syncPeriodArrows=()=>{
    if(!periodTabs)return;
    const max=Math.max(0,periodTabs.scrollWidth-periodTabs.clientWidth-2);
    const prev=document.querySelector('[data-period-scroll="prev"]'),next=document.querySelector('[data-period-scroll="next"]');
    if(prev)prev.disabled=periodTabs.scrollLeft<=2;
    if(next)next.disabled=periodTabs.scrollLeft>=max;
  };
  document.querySelectorAll('[data-period-scroll]').forEach(btn=>btn.addEventListener('click',()=>{
    if(!periodTabs)return;
    periodTabs.scrollBy({left:(btn.dataset.periodScroll==='prev'?-1:1)*Math.max(180,periodTabs.clientWidth*.72),behavior:'smooth'});
    setTimeout(syncPeriodArrows,260);
  }));
  periodTabs?.addEventListener('scroll',syncPeriodArrows,{passive:true});
  requestAnimationFrame(syncPeriodArrows);

  document.querySelectorAll('[data-public-room]').forEach(btn=>btn.addEventListener('click',()=>{
    const key=btn.dataset.publicRoom;
    document.querySelectorAll('[data-public-room]').forEach(item=>{
      const active=item===btn;
      item.classList.toggle('active',active);
      item.setAttribute('aria-selected',String(active));
    });
    document.querySelectorAll('[data-public-room-panel]').forEach(panel=>{ panel.hidden=panel.dataset.publicRoomPanel!==key; });
  }));

  document.querySelectorAll('[data-public-schedule-expand]').forEach(btn=>btn.addEventListener('click',()=>{
    const panel=btn.closest('[data-public-room-panel]')||btn.parentElement?.parentElement;
    const extra=panel?.querySelector('.public-schedule-extra');
    const collapse=panel?.querySelector('[data-public-schedule-collapse]');
    if(extra)extra.hidden=false;
    btn.hidden=true;
    if(collapse)collapse.hidden=false;
  }));
  document.querySelectorAll('[data-public-schedule-collapse]').forEach(btn=>btn.addEventListener('click',()=>{
    const panel=btn.closest('[data-public-room-panel]')||btn.parentElement?.parentElement;
    const extra=panel?.querySelector('.public-schedule-extra');
    const expand=panel?.querySelector('[data-public-schedule-expand]');
    if(extra)extra.hidden=true;
    btn.hidden=true;
    if(expand)expand.hidden=false;
  }));

  document.querySelectorAll('[data-public-login-required]').forEach(btn=>btn.addEventListener('click',()=>{
    const loggedIn=Boolean(state.sessionToken && state.user);
    const room=String(btn.dataset.publicLoginRequired||'fitur');
    const labels={schedule:'Jadwal',tasks:'Tugas',attendance:'Presensi',announcements:'Informasi'};
    if(loggedIn)return showPublicNotice(`${labels[room]||'Konten'} hanya tersedia untuk anggota kelas ini.`);
    loginAndReturnToPublic();
  }));

  document.querySelectorAll('[data-public-link-period]').forEach(btn=>btn.addEventListener('click',()=>{
    const key=btn.dataset.publicLinkPeriod;
    document.querySelectorAll('[data-public-link-period]').forEach(tab=>{
      const active=tab===btn;
      tab.classList.toggle('active',active);
      tab.setAttribute('aria-selected',String(active));
    });
    document.querySelectorAll('[data-public-link-period-panel]').forEach(panel=>{panel.hidden=panel.dataset.publicLinkPeriodPanel!==key;});
    // Saat pindah periode, tutup accordion kategori agar konteks tidak tercampur.
    document.querySelectorAll('[data-public-group]').forEach(group=>{
      const panel=group.querySelector('.public-group-panel');
      const toggle=group.querySelector('[data-public-group-toggle]');
      if(panel)panel.hidden=true;
      if(toggle)toggle.setAttribute('aria-expanded','false');
      group.classList.remove('open');
    });
  }));

  // Accordion ala room/category: hero kategori tetap menjadi parent control,
  // daftar link baru muncul setelah kategori dipilih. Hanya satu kategori terbuka.
  document.querySelectorAll('[data-public-group-toggle]').forEach(toggle=>toggle.addEventListener('click',()=>{
    const group=toggle.closest('[data-public-group]');
    const panel=group?.querySelector('.public-group-panel');
    if(!group || !panel)return;
    const opening=panel.hidden;
    document.querySelectorAll('[data-public-group]').forEach(other=>{
      const otherPanel=other.querySelector('.public-group-panel');
      const otherToggle=other.querySelector('[data-public-group-toggle]');
      if(otherPanel)otherPanel.hidden=true;
      if(otherToggle)otherToggle.setAttribute('aria-expanded','false');
      other.classList.remove('open');
    });
    if(opening){
      panel.hidden=false;
      toggle.setAttribute('aria-expanded','true');
      group.classList.add('open');
    }
  }));

  document.querySelectorAll('[data-show-more]').forEach(btn=>btn.onclick=()=>{
    const group=btn.closest('[data-public-group]');
    const extra=group?.querySelector('.public-link-extra');
    if(!extra)return;
    const opening=extra.hidden;
    extra.hidden=!opening;
    btn.classList.toggle('open',opening);
    btn.querySelector('span:first-child').textContent=opening?'Tampilkan lebih sedikit':`Lihat ${extra.children.length} link lainnya`;
  });

  bindShowcase();

  document.getElementById('public-install-btn')?.addEventListener('click',handleInstall);
  updateInstallButton();
}

function bindShowcase(){
  if(showcaseTimer){clearTimeout(showcaseTimer);showcaseTimer=null;}
  const track=document.getElementById('public-showcase-track');if(!track)return;
  const originals=[...track.querySelectorAll('.public-device-card')];if(!originals.length)return;
  const count=originals.length;
  originals.map(x=>x.cloneNode(true)).forEach(x=>{x.dataset.loopClone='before';x.setAttribute('aria-hidden','true');track.insertBefore(x,track.firstChild);});
  originals.map(x=>x.cloneNode(true)).forEach(x=>{x.dataset.loopClone='after';x.setAttribute('aria-hidden','true');track.appendChild(x);});
  let index=count, interacting=false, resumeTimer=null;
  const cards=()=>[...track.querySelectorAll('.public-device-card')];
  const goTo=(i,smooth=true)=>{const card=cards()[i];if(card)track.scrollTo({left:card.offsetLeft,behavior:smooth?'smooth':'auto'});};
  const normalize=()=>{if(index>=count*2){index-=count;goTo(index,false);}else if(index<count){index+=count;goTo(index,false);}};
  const scheduleNext=()=>{clearTimeout(showcaseTimer);if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;showcaseTimer=setTimeout(()=>{if(document.visibilityState==='visible'&&!interacting){index+=1;goTo(index,true);setTimeout(normalize,520);}scheduleNext();},3200);};
  const resume=()=>{clearTimeout(resumeTimer);resumeTimer=setTimeout(()=>{const list=cards();const stride=(list[1]?.offsetLeft||0)-(list[0]?.offsetLeft||0)||260;index=Math.max(0,Math.round(track.scrollLeft/stride));normalize();interacting=false;scheduleNext();},900);};
  const pause=()=>{interacting=true;clearTimeout(showcaseTimer);showcaseTimer=null;clearTimeout(resumeTimer);};
  document.querySelector('[data-showcase-prev]')?.addEventListener('click',()=>{pause();index-=1;goTo(index,true);setTimeout(normalize,520);resume();});
  document.querySelector('[data-showcase-next]')?.addEventListener('click',()=>{pause();index+=1;goTo(index,true);setTimeout(normalize,520);resume();});
  ['pointerdown','touchstart','wheel'].forEach(evt=>track.addEventListener(evt,pause,{passive:true}));
  ['pointerup','pointercancel','touchend','touchcancel'].forEach(evt=>track.addEventListener(evt,resume,{passive:true}));
  track.addEventListener('scroll',()=>{if(interacting)resume();},{passive:true});
  requestAnimationFrame(()=>{goTo(index,false);scheduleNext();});
}

async function handleInstall(){
  const btn=document.getElementById('public-install-btn');
  if(!deferredInstallPrompt || !btn){ updateInstallButton(); return; }
  const original=btn.innerHTML;
  btn.disabled=true;
  btn.innerHTML='Membuka instalasi… <span class="material-symbols-rounded">hourglass_top</span>';
  try{
    deferredInstallPrompt.prompt();
    const choice=await deferredInstallPrompt.userChoice;
    if(choice?.outcome==='accepted')deferredInstallPrompt=null;
  }catch(err){
    console.warn('Install prompt:',err);
    deferredInstallPrompt=null;
  }finally{
    if(document.body.contains(btn)){
      btn.disabled=false;
      btn.innerHTML=original;
    }
    updateInstallButton();
  }
}

function updateInstallButton(){
  const btn=document.getElementById('public-install-btn');
  if(!btn)return;
  const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true;
  btn.hidden=!deferredInstallPrompt||standalone;
}

function syncPublicMetadata(cls={}) {
  const code=String(cls.class_code||classCode||'').replace(/^KLS-/i,'');
  const slug=String(cls.public_slug||'').trim().toLowerCase();
  const canonical=slug?primaryUrl('/'+slug).toString():primaryUrl('/links.html',code?{c:code}:null).toString();
  const title=`${cls.name || 'Link Kelas'} — KelasKu`;
  const description=String(cls.description || 'Quick Access Hub kelas — KelasKu').trim();
  const canonicalEl=document.querySelector('link[rel="canonical"]');
  if(canonicalEl)canonicalEl.href=canonical;
  const ogUrl=document.querySelector('meta[property="og:url"]');
  if(ogUrl)ogUrl.content=canonical;
  const ogTitle=document.querySelector('meta[property="og:title"]');
  if(ogTitle)ogTitle.content=title;
  const ogDescription=document.querySelector('meta[property="og:description"]');
  if(ogDescription)ogDescription.content=description;
  const metaDescription=document.querySelector('meta[name="description"]');
  if(metaDescription)metaDescription.content=description;
}

function renderError(message) {
  content.innerHTML = `<section class="public-empty error"><span class="material-symbols-rounded">link_off</span><strong>Link kelas tidak tersedia</strong><p>${esc(message || 'Periksa kembali tautan yang dibagikan.')}</p><a href="/" class="public-promo-btn">Buka KelasKu</a></section>`;
}

function registerPublicServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('/service-worker.js',{scope:'/'}).catch(err=>console.warn('Public SW:',err));
}

async function init() {
  registerPublicServiceWorker();
  if (!classCode) return renderError('Kode kelas tidak ditemukan pada URL.');
  const cached=readPublicCache();
  if(cached){
    const cachedMemberLookup=Boolean(state.sessionToken && cached.class?.class_id);
    render(cached,null,null,{membershipLoading:cachedMemberLookup});
  }
  try {
    const data = await api('getPublicClassLinks', { class_code: classCode }, { auth: false, timeout: 16000 });
    writePublicCache(data);
    const mayHaveMemberData=Boolean(state.sessionToken && data.class?.class_id);

    // Cache-first on repeat visits; network refresh only redraws public content if it changed.
    if(!cached || !samePublicData(cached,data))render(data,null,null,{membershipLoading:mayHaveMemberData});
    if(!mayHaveMemberData)return;

    // Member detail + academic are independent: fetch in parallel instead of serially.
    const [detailResult,academicResult]=await Promise.allSettled([
      api('getClassDetail',{class_id:data.class.class_id},{timeout:14000}),
      api('getClassAcademic',{class_id:data.class.class_id},{timeout:14000})
    ]);
    const memberData=detailResult.status==='fulfilled'?detailResult.value:null;
    const academic=academicResult.status==='fulfilled'?academicResult.value:null;
    render(data,memberData,academic,{membershipLoading:false});
  } catch (err) {
    if(!cached)renderError(err.message);
  }
}
init();
