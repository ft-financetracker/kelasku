import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { primaryUrl } from '../core/utils.js';

const content = document.getElementById('public-links-content');
const params = new URLSearchParams(location.search);
const rawCode = (params.get('c') || '').trim();
let deferredInstallPrompt = null;
let showcaseTimer = null;
let currentPublicAcademic = null;
let currentPublicClassId = '';

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
const classCode = rawCode ? (rawCode.toUpperCase().startsWith('KLS-') ? rawCode.toUpperCase() : 'KLS-' + rawCode.toUpperCase()) : '';
const PUBLIC_CACHE_KEY = classCode ? `kelasku_public_links_cache_${classCode}` : '';
const PUBLIC_CACHE_MS = 10 * 60 * 1000;
const fmtDate = value => { try { return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value)); } catch { return value || '-'; } };
const isFuture = value => value && new Date(value).getTime() >= Date.now();
const byDate = key => (a,b) => new Date(a?.[key] || 8640000000000000) - new Date(b?.[key] || 8640000000000000);

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

function groupsFromItems(items=[]) {
  return items.reduce((acc,item) => {
    const key = PLATFORM[item.platform] ? item.platform : 'OTHER';
    (acc[key] ||= []).push(item);
    return acc;
  }, {});
}

function groupSection(key, items) {
  const [label, icon, copy] = PLATFORM[key] || PLATFORM.OTHER;
  const visible = items.slice(0,3);
  const extra = items.slice(3);
  // Icon item sengaja berbeda dari icon kategori. Kategori = platform/room,
  // item = link yang dibuka dari room tersebut.
  const cards = arr => arr.map(item => `<a class="public-link-card" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
    <span class="public-link-icon material-symbols-rounded">link</span>
    <span class="public-link-copy"><strong>${esc(item.label)}</strong>${item.description?`<small>${esc(item.description)}</small>`:''}</span>
    <span class="material-symbols-rounded public-link-arrow">arrow_outward</span>
  </a>`).join('');
  const panelId = `public-group-panel-${key.toLowerCase()}`;
  return `<section class="public-link-group" data-public-group="${key}">
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

function publicHero(cls) {
  const meta = [
    cls.institution || '',
    cls.study_program && !String(cls.name || '').toLowerCase().includes(String(cls.study_program).toLowerCase()) ? cls.study_program : '',
    cls.cohort ? `Angkatan ${cls.cohort}` : '',
    cls.semester || '',
    cls.visibility || 'KELAS'
  ].filter(Boolean);
  return `<section class="public-hero">
    <span class="public-hero-icon material-symbols-rounded">school</span>
    <div class="public-hero-copy">
      <span class="public-kicker">SATU LINK KELAS</span>
      <h1>${esc(cls.name || 'Kelas')}</h1>
      <div class="public-meta-line">${meta.map((item,index)=>`${index?'<i>•</i>':''}<span>${esc(item)}</span>`).join('')}</div>
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

function memberAcademicHub(academic={}, classId='') {
  const schedules=(academic.schedules||[]).filter(x=>isFuture(x.start_at)).sort(byDate('start_at')).slice(0,4);
  const tasks=(academic.tasks||[]).filter(x=>x.submission_status!=='SUBMITTED' && (!x.deadline || isFuture(x.deadline))).sort(byDate('deadline')).slice(0,4);
  const attendance=(academic.attendance_sessions||[]).filter(x=>String(x.window_status||'').toUpperCase()==='OPEN').slice(0,3);
  const announcements=(academic.announcements||[]).slice(0,4);
  const safeLocation=value=>/^https?:\/\//i.test(String(value||'').trim())?'Pertemuan online':String(value||'').trim();

  const panels = {
    schedule: `${roomList(schedules,'Belum ada jadwal mendatang.',x=>`<button type="button" data-public-open-detail="schedule" data-public-item-id="${esc(x.schedule_id)}" class="public-room-row public-room-clickable"><span class="public-room-row-icon material-symbols-rounded">calendar_month</span><div><strong>${esc(x.title || 'Jadwal Kelas')}</strong><small>${esc(fmtDate(x.start_at))}${x.location?` · ${esc(safeLocation(x.location))}`:''}</small></div><span class="material-symbols-rounded public-row-arrow">chevron_right</span></button>`)}<a class="public-text-link" href="/ruang-kelas" data-open-class-tab="schedule" data-class-id="${esc(classId)}">Lihat jadwal lengkap <span class="material-symbols-rounded">arrow_forward</span></a>`,
    tasks: roomList(tasks,'Tidak ada tugas aktif.',x=>`<button type="button" data-public-open-detail="task" data-public-item-id="${esc(x.task_id)}" class="public-room-row public-room-clickable"><span class="public-room-row-icon material-symbols-rounded">checklist</span><div><strong>${esc(x.title || 'Tugas')}</strong><small>${x.deadline?`Deadline ${esc(fmtDate(x.deadline))}`:'Tanpa deadline'}${x.submission_status?` · ${esc(x.submission_status)}`:''}</small></div><span class="material-symbols-rounded public-row-arrow">chevron_right</span></button>`),
    attendance: roomList(attendance,'Belum ada presensi aktif.',x=>`<div class="public-room-row public-room-row-action"><button type="button" data-public-open-detail="attendance" data-public-item-id="${esc(x.attendance_id)}" class="public-room-inline-link"><span class="public-room-row-icon material-symbols-rounded">done_all</span><div><strong>${esc(x.title || 'Presensi Kelas')}</strong><small>${x.start_at?esc(fmtDate(x.start_at)):'Sesi sedang aktif'}</small></div></button><a href="/absensi?a=${encodeURIComponent(x.public_token||'')}" class="public-primary-action">Isi Presensi</a></div>`),
    announcements: roomList(announcements,'Belum ada informasi terbaru.',x=>`<button type="button" data-public-open-detail="announcement" data-public-item-id="${esc(x.announcement_id)}" class="public-room-row public-room-clickable"><span class="public-room-row-icon material-symbols-rounded">campaign</span><div><strong>${esc(x.title || 'Pengumuman')}</strong><small>${x.published_at?esc(fmtDate(x.published_at)):'Informasi kelas'}</small></div><span class="material-symbols-rounded public-row-arrow">chevron_right</span></button>`)
  };

  const tabs = [
    ['schedule','calendar_month','Jadwal'],
    ['tasks','checklist','Tugas'],
    ['attendance','done_all','Presensi'],
    ['announcements','campaign','Informasi']
  ];
  return `<section class="public-room-hub">
    <div class="public-section-head public-room-head"><div><span class="public-kicker">INFORMASI KELAS</span><h2>Akses ruang kelas.</h2><p>Pilih room, lalu klik item untuk melihat detail tanpa meninggalkan halaman.</p></div></div>
    <nav class="public-room-tabs" aria-label="Informasi kelas">${tabs.map(([key,icon,label],index)=>`<button type="button" class="public-room-tab ${index===0?'active':''}" data-public-room="${key}" aria-selected="${index===0?'true':'false'}"><span class="material-symbols-rounded">${icon}</span><span>${label}</span></button>`).join('')}</nav>
    <div class="public-room-panels">${Object.entries(panels).map(([key,html],index)=>`<div class="public-room-panel" data-public-room-panel="${key}" ${index?'hidden':''}>${html}</div>`).join('')}</div>
  </section>`;
}

function academicLoading() {
  return `<section class="public-room-hub public-room-loading" aria-live="polite"><div class="public-inline-loader"><span class="public-loader"></span><div><strong>Menyiapkan informasi kelas…</strong><small>Link publik sudah dapat digunakan sambil data anggota dimuat.</small></div></div></section>`;
}

function guestAcademicHub(loggedIn) {
  const tabs=[['schedule','calendar_month','Jadwal'],['tasks','checklist','Tugas'],['attendance','done_all','Presensi'],['announcements','campaign','Informasi']];
  const copy={
    schedule:['Jadwal Kelas','Agenda dan perubahan jadwal tersedia setelah masuk.'],
    tasks:['Tugas Kelas','Deadline dan progres tugas ada di Ruang Kelas.'],
    attendance:['Presensi Kelas','Presensi membutuhkan login agar identitas kehadiran valid.'],
    announcements:['Informasi Kelas','Pengumuman internal tersedia untuk anggota kelas.']
  };
  const panels=tabs.map(([key,icon])=>{const c=copy[key];return `<div class="public-room-panel" data-public-room-panel="${key}" ${key!=='schedule'?'hidden':''}><button type="button" class="public-room-row public-room-clickable public-room-guest-row" data-public-login-required="${key}"><span class="public-room-row-icon material-symbols-rounded">${icon}</span><div><strong>${c[0]}</strong><small>${c[1]}</small></div><span class="material-symbols-rounded public-row-arrow">${key==='attendance'?'login':'arrow_forward'}</span></button></div>`;}).join('');
  return `<section class="public-room-hub"><div class="public-section-head public-room-head"><div><span class="public-kicker">INFORMASI KELAS</span><h2>Akses ruang kelas.</h2><p>${loggedIn?'Akun ini belum menjadi anggota kelas.':'Room dapat dijelajahi; data internal dibuka setelah login.'}</p></div></div><nav class="public-room-tabs" aria-label="Informasi kelas">${tabs.map(([key,icon,label],index)=>`<button type="button" class="public-room-tab ${index===0?'active':''}" data-public-room="${key}" aria-selected="${index===0?'true':'false'}"><span class="material-symbols-rounded">${icon}</span><span>${label}</span></button>`).join('')}</nav><div class="public-room-panels">${panels}</div></section>`;
}

function showPublicNotice(message){
  let notice=document.getElementById('public-notice');
  if(!notice){notice=document.createElement('div');notice.id='public-notice';notice.className='public-notice';document.body.appendChild(notice);}
  notice.textContent=message;notice.classList.add('show');clearTimeout(showPublicNotice.timer);showPublicNotice.timer=setTimeout(()=>notice.classList.remove('show'),2600);
}

function showcase() {
  const slides=[['dashboard','Dashboard','Semua informasi penting dalam satu layar.'],['calendar_month','Jadwal','Agenda kelas lebih teratur.'],['checklist','Tugas','Deadline dan progres lebih jelas.'],['done_all','Presensi','Check-in dan riwayat kehadiran.'],['folder','Materi','Referensi kelas tetap rapi.'],['groups','Kelola Kelas','Koordinasi anggota dalam satu ruang.']];
  return `<section class="public-showcase"><div class="public-section-head"><div><span class="public-kicker">KENAL KELASKU</span><h2>Satu ruang untuk kebutuhan kelas.</h2></div><div class="public-showcase-nav"><button type="button" data-showcase-prev aria-label="Sebelumnya"><span class="material-symbols-rounded">arrow_back</span></button><button type="button" data-showcase-next aria-label="Berikutnya"><span class="material-symbols-rounded">arrow_forward</span></button></div></div><div class="public-showcase-track" id="public-showcase-track">${slides.map(([icon,title,copy],i)=>`<article class="public-device-card"><div class="public-browser-bar"><i></i><i></i><i></i><span>klasku.my.id</span></div><div class="public-device-screen"><span class="material-symbols-rounded">${icon}</span><small>PREVIEW ${String(i+1).padStart(2,'0')}</small><strong>${title}</strong><p>${copy}</p><div class="public-mock-lines"><i></i><i></i><i></i></div></div></article>`).join('')}</div><div class="public-showcase-actions"><a href="/" class="public-promo-btn">Buka KelasKu <span class="material-symbols-rounded">arrow_forward</span></a><button id="public-install-btn" type="button" class="public-install-btn" hidden>Install KelasKu <span class="material-symbols-rounded">download</span></button></div></section>`;
}

function render(data, memberData=null, academic=null, { membershipLoading=false }={}) {
  const cls = data.class || {};
  document.title = `${cls.name || 'Link Kelas'} — KelasKu`;
  syncPublicMetadata(cls);
  const isMember=Boolean(memberData);
  const loggedIn=Boolean(state.sessionToken && state.user);
  const sourceGroups=isMember?groupsFromItems(memberData.class_links||[]):(data.groups||{});
  const sections=ORDERED.filter(key=>Array.isArray(sourceGroups[key])&&sourceGroups[key].length).map(key=>groupSection(key,sourceGroups[key])).join('');
  currentPublicAcademic = isMember ? (academic || {}) : null;
  currentPublicClassId = cls.class_id || '';
  const infoSection = isMember
    ? memberAcademicHub(academic||{},cls.class_id||'')
    : (membershipLoading ? academicLoading() : guestAcademicHub(loggedIn));

  content.innerHTML = `${publicHero(cls)}
    ${infoSection}
    <section class="public-section-block"><div class="public-section-head"><div><span class="public-kicker">LINK CEPAT</span><h2>Akses penting kelas</h2><p>Satu halaman untuk link yang paling sering dipakai.</p></div></div>${sections || `<div class="public-empty"><span class="material-symbols-rounded">link_off</span><strong>Belum ada link yang dibagikan</strong><p>Pengelola kelas belum menambahkan link untuk akses ini.</p></div>`}</section>
    ${showcase()}`;
  bindInteractions();
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
    item=(academic.attendance_sessions||[]).find(x=>String(x.attendance_id)===String(id));if(!item)return;title=item.title||'Presensi';meta=item.start_at?fmtDate(item.start_at):'Sesi aktif';body='<p>Presensi menggunakan akun KelasKu agar identitas dan riwayat kehadiran tetap valid.</p>';action=item.public_token?`<a href="/absensi?a=${encodeURIComponent(item.public_token)}" class="public-primary-action public-detail-action">Isi Presensi</a>`:'';
  }
  closePublicDetail();const overlay=document.createElement('div');overlay.id='public-detail-overlay';overlay.className='public-detail-overlay';overlay.innerHTML=`<div class="public-detail-card"><div class="public-detail-head"><div><span class="public-kicker">DETAIL KELAS</span><h3>${esc(title)}</h3><small>${esc(meta)}</small></div><button type="button" data-public-detail-close class="public-detail-close"><span class="material-symbols-rounded">close</span></button></div><div class="public-detail-body">${body}</div>${action?`<div class="public-detail-actions">${action}</div>`:''}</div>`;document.body.appendChild(overlay);overlay.addEventListener('click',e=>{if(e.target===overlay)closePublicDetail();});overlay.querySelector('[data-public-detail-close]')?.addEventListener('click',closePublicDetail);overlay.querySelectorAll('[data-open-class-tab]').forEach(link=>link.addEventListener('click',()=>{sessionStorage.setItem('kelasku_selected_class',link.dataset.classId||'');sessionStorage.setItem('kelasku_class_tab',link.dataset.openClassTab||'overview');}));
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

  document.querySelectorAll('[data-public-room]').forEach(btn=>btn.addEventListener('click',()=>{
    const key=btn.dataset.publicRoom;
    document.querySelectorAll('[data-public-room]').forEach(item=>{
      const active=item===btn;
      item.classList.toggle('active',active);
      item.setAttribute('aria-selected',String(active));
    });
    document.querySelectorAll('[data-public-room-panel]').forEach(panel=>{ panel.hidden=panel.dataset.publicRoomPanel!==key; });
  }));

  document.querySelectorAll('[data-public-login-required]').forEach(btn=>btn.addEventListener('click',()=>{
    const loggedIn=Boolean(state.sessionToken && state.user);
    const room=String(btn.dataset.publicLoginRequired||'fitur');
    const labels={schedule:'Jadwal',tasks:'Tugas',attendance:'Presensi',announcements:'Informasi'};
    showPublicNotice(loggedIn?`${labels[room]||'Konten'} hanya tersedia untuk anggota kelas ini.`:`Silakan login untuk membuka ${labels[room]||'fitur'} kelas. Link publik tetap bisa digunakan tanpa login.`);
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
  if(showcaseTimer){clearInterval(showcaseTimer);showcaseTimer=null;}
  const track=document.getElementById('public-showcase-track');if(!track)return;
  const originals=[...track.querySelectorAll('.public-device-card')];if(!originals.length)return;
  originals.forEach(card=>{const clone=card.cloneNode(true);clone.dataset.loopClone='after';clone.setAttribute('aria-hidden','true');track.appendChild(clone);});
  const count=originals.length;let index=0;let resetTimer=null;let resumeTimer=null;let userInteracting=false;
  const cards=()=>[...track.querySelectorAll('.public-device-card')];
  const goTo=(target,smooth=true)=>{const list=cards();const card=list[target];if(!card)return;track.scrollTo({left:card.offsetLeft,behavior:smooth?'smooth':'auto'});};
  const next=()=>{if(userInteracting)return;index+=1;goTo(index,true);if(index===count){clearTimeout(resetTimer);resetTimer=setTimeout(()=>{index=0;goTo(0,false);},650);}};
  const prev=()=>{if(index<=0){index=count;goTo(count,false);requestAnimationFrame(()=>{index=count-1;goTo(index,true);});}else{index-=1;goTo(index,true);}};
  document.querySelector('[data-showcase-prev]')?.addEventListener('click',prev);
  document.querySelector('[data-showcase-next]')?.addEventListener('click',next);
  const start=()=>{if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;if(!showcaseTimer)showcaseTimer=setInterval(()=>{if(document.visibilityState==='visible')next();},3800);};
  const pauseBriefly=()=>{userInteracting=true;if(showcaseTimer){clearInterval(showcaseTimer);showcaseTimer=null;}clearTimeout(resumeTimer);resumeTimer=setTimeout(()=>{userInteracting=false;start();},5000);};
  track.addEventListener('pointerdown',pauseBriefly,{passive:true});track.addEventListener('touchstart',pauseBriefly,{passive:true});
  track.addEventListener('scroll',()=>{if(userInteracting){clearTimeout(resumeTimer);resumeTimer=setTimeout(()=>{const first=cards()[0];const stride=(cards()[1]?.offsetLeft||0)-(first?.offsetLeft||0)||260;index=Math.max(0,Math.min(count-1,Math.round(track.scrollLeft/stride)));userInteracting=false;start();},1200);}},{passive:true});
  goTo(0,false);start();
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
  const canonical=primaryUrl('/links.html',code?{c:code}:null).toString();
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
