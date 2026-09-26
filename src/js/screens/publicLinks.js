import { api } from '../core/api.js';
import { state } from '../core/state.js';

const content = document.getElementById('public-links-content');
const params = new URLSearchParams(location.search);
const rawCode = (params.get('c') || '').trim();
let deferredInstallPrompt = null;
let showcaseTimer = null;

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

  const panels = {
    schedule: `${roomList(schedules,'Belum ada jadwal mendatang.',x=>`<a href="./#class" data-open-class-tab="schedule" data-class-id="${esc(classId)}" class="public-room-row public-room-clickable"><span class="public-room-row-icon material-symbols-rounded">calendar_month</span><div><strong>${esc(x.title || 'Jadwal Kelas')}</strong><small>${esc(fmtDate(x.start_at))}${x.location?` · ${esc(x.location)}`:''}</small></div><span class="material-symbols-rounded public-row-arrow">chevron_right</span></a>`)}<a class="public-text-link" href="./#class" data-open-class-tab="schedule" data-class-id="${esc(classId)}">Lihat jadwal lengkap <span class="material-symbols-rounded">arrow_forward</span></a>`,
    tasks: roomList(tasks,'Tidak ada tugas aktif.',x=>`<a href="./#class" data-open-class-tab="tasks" data-class-id="${esc(classId)}" class="public-room-row public-room-clickable"><span class="public-room-row-icon material-symbols-rounded">checklist</span><div><strong>${esc(x.title || 'Tugas')}</strong><small>${x.deadline?`Deadline ${esc(fmtDate(x.deadline))}`:'Tanpa deadline'}${x.submission_status?` · ${esc(x.submission_status)}`:''}</small></div><span class="material-symbols-rounded public-row-arrow">chevron_right</span></a>`),
    attendance: roomList(attendance,'Belum ada presensi aktif.',x=>`<div class="public-room-row public-room-row-action"><a href="./#class" data-open-class-tab="attendance" data-class-id="${esc(classId)}" class="public-room-inline-link"><span class="public-room-row-icon material-symbols-rounded">done_all</span><div><strong>${esc(x.title || 'Presensi Kelas')}</strong><small>${x.start_at?esc(fmtDate(x.start_at)):'Sesi sedang aktif'}</small></div></a><a href="./?a=${encodeURIComponent(x.public_token||'')}" class="public-primary-action">Isi Presensi</a></div>`),
    announcements: roomList(announcements,'Belum ada informasi terbaru.',x=>`<a href="./#class" data-open-class-tab="announcements" data-class-id="${esc(classId)}" class="public-room-row public-room-clickable"><span class="public-room-row-icon material-symbols-rounded">campaign</span><div><strong>${esc(x.title || 'Pengumuman')}</strong><small>${x.published_at?esc(fmtDate(x.published_at)):'Informasi kelas'}</small></div><span class="material-symbols-rounded public-row-arrow">chevron_right</span></a>`)
  };

  const tabs = [
    ['schedule','calendar_month','Jadwal'],
    ['tasks','checklist','Tugas'],
    ['attendance','done_all','Presensi'],
    ['announcements','campaign','Informasi']
  ];
  return `<section class="public-room-hub">
    <div class="public-section-head public-room-head"><div><span class="public-kicker">INFORMASI KELAS</span><h2>Akses ruang kelas.</h2><p>Pilih room untuk melihat informasi yang dibutuhkan.</p></div></div>
    <nav class="public-room-tabs" aria-label="Informasi kelas">${tabs.map(([key,icon,label],index)=>`<button type="button" class="public-room-tab ${index===0?'active':''}" data-public-room="${key}" aria-selected="${index===0?'true':'false'}"><span class="material-symbols-rounded">${icon}</span><span>${label}</span></button>`).join('')}</nav>
    <div class="public-room-panels">${Object.entries(panels).map(([key,html],index)=>`<div class="public-room-panel" data-public-room-panel="${key}" ${index?'hidden':''}>${html}</div>`).join('')}</div>
  </section>`;
}

function academicLoading() {
  return `<section class="public-room-hub public-room-loading" aria-live="polite"><div class="public-inline-loader"><span class="public-loader"></span><div><strong>Menyiapkan informasi kelas…</strong><small>Link publik sudah dapat digunakan sambil data anggota dimuat.</small></div></div></section>`;
}

function lockedPreview(loggedIn) {
  return `<section class="public-locked"><span class="material-symbols-rounded">lock</span><div><strong>${loggedIn?'Konten ini hanya tersedia untuk anggota kelas.':'Masuk untuk melihat informasi kelas'}</strong><p>${loggedIn?'Jadwal, tugas, presensi, materi, dan informasi internal tetap terlindungi.':'Simpan satu link kelas, lalu akses jadwal, tugas, presensi, materi, dan informasi internal setelah masuk.'}</p></div><a href="./#auth" class="public-secondary-action">${loggedIn?'Buka KelasKu':'Masuk KelasKu'}</a></section>`;
}

function showcase() {
  const slides=[['dashboard','Dashboard','Semua informasi penting dalam satu layar.'],['calendar_month','Jadwal','Agenda kelas lebih teratur.'],['checklist','Tugas','Deadline dan progres lebih jelas.'],['done_all','Presensi','Check-in dan riwayat kehadiran.'],['folder','Materi','Referensi kelas tetap rapi.'],['groups','Kelola Kelas','Koordinasi anggota dalam satu ruang.']];
  return `<section class="public-showcase"><div class="public-section-head"><div><span class="public-kicker">KENAL KELASKU</span><h2>Satu ruang untuk kebutuhan kelas.</h2></div><div class="public-showcase-nav"><button type="button" data-showcase-prev aria-label="Sebelumnya"><span class="material-symbols-rounded">arrow_back</span></button><button type="button" data-showcase-next aria-label="Berikutnya"><span class="material-symbols-rounded">arrow_forward</span></button></div></div><div class="public-showcase-track" id="public-showcase-track">${slides.map(([icon,title,copy],i)=>`<article class="public-device-card"><div class="public-browser-bar"><i></i><i></i><i></i><span>kelasku.app</span></div><div class="public-device-screen"><span class="material-symbols-rounded">${icon}</span><small>PREVIEW ${String(i+1).padStart(2,'0')}</small><strong>${title}</strong><p>${copy}</p><div class="public-mock-lines"><i></i><i></i><i></i></div></div></article>`).join('')}</div><div class="public-showcase-actions"><a href="./" class="public-promo-btn">Buka KelasKu <span class="material-symbols-rounded">arrow_forward</span></a><button id="public-install-btn" type="button" class="public-install-btn" hidden>Install KelasKu <span class="material-symbols-rounded">download</span></button></div></section>`;
}

function render(data, memberData=null, academic=null, { membershipLoading=false }={}) {
  const cls = data.class || {};
  document.title = `${cls.name || 'Link Kelas'} — KelasKu`;
  const isMember=Boolean(memberData);
  const loggedIn=Boolean(state.sessionToken && state.user);
  const sourceGroups=isMember?groupsFromItems(memberData.class_links||[]):(data.groups||{});
  const sections=ORDERED.filter(key=>Array.isArray(sourceGroups[key])&&sourceGroups[key].length).map(key=>groupSection(key,sourceGroups[key])).join('');
  const infoSection = isMember
    ? memberAcademicHub(academic||{},cls.class_id||'')
    : (membershipLoading ? academicLoading() : lockedPreview(loggedIn));

  content.innerHTML = `${publicHero(cls)}
    ${infoSection}
    <section class="public-section-block"><div class="public-section-head"><div><span class="public-kicker">LINK CEPAT</span><h2>Akses penting kelas</h2><p>Satu halaman untuk link yang paling sering dipakai.</p></div></div>${sections || `<div class="public-empty"><span class="material-symbols-rounded">link_off</span><strong>Belum ada link yang dibagikan</strong><p>Pengelola kelas belum menambahkan link untuk akses ini.</p></div>`}</section>
    ${showcase()}`;
  bindInteractions();
}

function bindInteractions(){
  document.querySelectorAll('[data-open-class-tab]').forEach(link=>link.addEventListener('click',()=>{
    const id=link.dataset.classId||'';
    if(id){
      sessionStorage.setItem('kelasku_selected_class',id);
      sessionStorage.setItem('kelasku_class_tab',link.dataset.openClassTab||'overview');
    }
  }));

  document.querySelectorAll('[data-public-room]').forEach(btn=>btn.addEventListener('click',()=>{
    const key=btn.dataset.publicRoom;
    document.querySelectorAll('[data-public-room]').forEach(item=>{
      const active=item===btn;
      item.classList.toggle('active',active);
      item.setAttribute('aria-selected',String(active));
    });
    document.querySelectorAll('[data-public-room-panel]').forEach(panel=>{ panel.hidden=panel.dataset.publicRoomPanel!==key; });
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
  if(showcaseTimer){ clearInterval(showcaseTimer); showcaseTimer=null; }
  const track=document.getElementById('public-showcase-track');
  if(!track)return;

  const originals=[...track.querySelectorAll('.public-device-card')];
  if(!originals.length)return;

  // 3 set identik: [clone 1..6] [asli 1..6] [clone 1..6].
  // User selalu melihat gerakan ke arah yang dipilih; saat masuk set clone,
  // posisi di-recenter secara instan ke card identik sehingga tidak ada animasi balik 6 -> 1.
  const before=document.createDocumentFragment();
  const after=document.createDocumentFragment();
  originals.forEach(card=>{
    const a=card.cloneNode(true); a.dataset.loopClone='before'; a.setAttribute('aria-hidden','true'); before.appendChild(a);
    const b=card.cloneNode(true); b.dataset.loopClone='after'; b.setAttribute('aria-hidden','true'); after.appendChild(b);
  });
  track.insertBefore(before,track.firstChild);
  track.appendChild(after);

  let settlingTimer=null;
  const stride=()=>{
    const cards=track.querySelectorAll('.public-device-card');
    if(cards.length<2)return (cards[0]?.getBoundingClientRect().width||260)+9;
    return Math.max(1,cards[1].offsetLeft-cards[0].offsetLeft);
  };
  const middleStart=()=>originals[0].offsetLeft;
  const setWidth=()=>stride()*originals.length;
  const recenter=()=>{
    const start=middleStart();
    const width=setWidth();
    if(!width)return;
    const x=track.scrollLeft;
    const tolerance=Math.max(3,stride()*.15);
    if(x>=start+width-tolerance) track.scrollLeft=x-width;
    else if(x<start-tolerance) track.scrollLeft=x+width;
  };
  const move=direction=>track.scrollBy({left:direction*stride(),behavior:'smooth'});
  const next=()=>move(1);

  // Mulai dari set tengah agar next maupun previous dapat loop tanpa ujung.
  requestAnimationFrame(()=>{ track.scrollLeft=middleStart(); });
  track.addEventListener('scroll',()=>{
    clearTimeout(settlingTimer);
    settlingTimer=setTimeout(recenter,180);
  },{passive:true});

  document.querySelector('[data-showcase-prev]')?.addEventListener('click',()=>move(-1));
  document.querySelector('[data-showcase-next]')?.addEventListener('click',next);

  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if(reduced)return;
  const start=()=>{ if(!showcaseTimer)showcaseTimer=setInterval(()=>{if(document.visibilityState==='visible')next();},4500); };
  const stop=()=>{ if(showcaseTimer){clearInterval(showcaseTimer);showcaseTimer=null;} };
  ['pointerenter','focusin','touchstart'].forEach(event=>track.addEventListener(event,stop,{passive:true}));
  ['pointerleave','focusout','touchend'].forEach(event=>track.addEventListener(event,start,{passive:true}));
  start();
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

function renderError(message) {
  content.innerHTML = `<section class="public-empty error"><span class="material-symbols-rounded">link_off</span><strong>Link kelas tidak tersedia</strong><p>${esc(message || 'Periksa kembali tautan yang dibagikan.')}</p><a href="./" class="public-promo-btn">Buka KelasKu</a></section>`;
}

function registerPublicServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('./service-worker.js').catch(err=>console.warn('Public SW:',err));
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
