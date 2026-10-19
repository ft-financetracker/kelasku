import { state } from '../core/state.js?v=6740forms3';
import { api } from '../core/api.js?v=6740forms3';
import { esc, svg, toast } from '../core/utils.js?v=6740forms3';
import { appShell, bindAppShell } from '../core/appShell.js?v=6740forms3';
import { go } from '../core/router.js?v=6740forms3';
import { directoryClasses, sortDirectoryClasses, directoryCardHtml, directoryTabsHtml, directoryEmptyHtml, directoryIcon, directoryHeroArt, directoryPage, directoryPagerHtml, DIRECTORY_PAGE_SIZE, DIRECTORY_VIEWS, isArchivedClass, isDemoClass, isClassMember, directoryVisibility } from './classDirectory.js?v=6740forms3';

let publicPage = 1;
let publicQuery = '';
let myClassesInFlight = null;
let classSearchTimer = null;
let classSearchRequestSeq = 0;
const MY_CLASSES_TTL_MS = 60 * 1000;
let myClassesRequestOwner = '';
let directoryOwner = '';
let directoryView = 'mine';
let directorySort = 'name';
let directoryLayout = 'grid';
const directoryPages = {mine:1,public:1,demo:1,archive:1};
const PUBLIC_BATCH_SIZE = 30;
const publicBatches = new Map();
let publicClassesInFlight = null;
let publicClassesAt = 0;
let publicClassesKey = '';
let publicRequestSeq = 0;
const directoryLoading = {mine:false,public:false};
const directoryErrors = {mine:'',public:''};
const classAccountKey = () => `${state.sessionToken || ''}::${state.user?.user_id || ''}`;
const directoryVisible = () => directoryOwner === classAccountKey() && Boolean(document.getElementById('class-directory-panel'));

function publicLandingUrl(c={}) {
  const origin=String(window.KELASKU_CONFIG?.PRIMARY_ORIGIN || window.location.origin).replace(/\/$/,'');
  const slug=String(c.public_slug||'').trim().toLowerCase();
  const ref=slug || String(c.class_code||'').replace(/^KLS-/i,'');
  return slug ? `${origin}/${encodeURIComponent(slug)}` : `${origin}/links.html?c=${encodeURIComponent(ref)}`;
}

export function renderClasses() {
  if (directoryOwner !== classAccountKey()) {
    publicClassesAt=0;publicClassesKey='';publicBatches.clear();directoryLoading.mine=false;directoryLoading.public=false;
    Object.keys(directoryPages).forEach(key=>directoryPages[key]=1);
  }
  directoryOwner=classAccountKey();directoryView='mine';directorySort='name';
  try{directoryLayout=localStorage.getItem('kelasku_class_directory_layout')==='list'?'list':'grid';}catch{directoryLayout='grid';}
  directoryErrors.mine='';directoryErrors.public='';
  directoryLoading.mine=!(Number(state.myClassesAt || 0)>0);directoryLoading.public=!state.publicClasses;
  publicPage=Math.floor((directoryPages.public-1)*DIRECTORY_PAGE_SIZE[directoryLayout]/PUBLIC_BATCH_SIZE)+1;publicQuery='';
  const content = `
    <div class="classes-v2">
      <header class="cl-hero"><div class="cl-hero-copy"><span class="cl-eyebrow">DAFTAR KELAS</span><h1>Temukan ruangmu.<br><em>Tumbuh bersama.</em></h1><p>Satu ruang untuk berbagi ide, belajar, dan melangkah lebih jauh.</p></div><div class="cl-hero-art" aria-hidden="true">${directoryHeroArt()}</div></header>
      <nav class="cl-categories" id="class-directory-tabs" role="tablist" aria-label="Kategori kelas"></nav>
      <div class="cl-toolbar"><div class="classes-search-panel"><div class="cl-search">${svg('i-search')}<input id="class-search-input" placeholder="Cari kelas, kode, atau institusi…" aria-label="Cari kelas, kode, atau institusi" autocomplete="off" aria-autocomplete="list" aria-controls="class-search-results"><button type="button" id="class-search-clear" class="cl-search-clear hidden" aria-label="Bersihkan pencarian">${svg('i-close')}</button></div><div id="class-search-results" class="search-results hidden" aria-live="polite"></div></div><label class="cl-sort">Urutkan<select id="class-directory-sort" aria-label="Urutkan kelas"><option value="name">Nama A–Z</option><option value="name-desc">Nama Z–A</option></select></label><div class="cl-actions"><button type="button" id="join-code-btn" class="cl-button cl-button-primary" title="Gabung dengan Kode" aria-label="Gabung dengan Kode">${svg('i-key')}<span class="cl-action-full">Gabung dengan Kode</span><span class="cl-action-short" aria-hidden="true">Gabung</span></button><button type="button" id="create-class-btn" class="cl-button" aria-label="Buat Kelas">${svg('i-plus')}<span class="cl-action-full">Buat Kelas</span><span class="cl-action-short" aria-hidden="true">Buat</span></button></div></div>
      <p id="class-create-limit-note" class="cl-limit-note" hidden></p>
      <section id="class-directory-panel" role="tabpanel" aria-labelledby="cl-tab-mine"></section>
    </div>`;

  document.getElementById('app').innerHTML = appShell({ active: 'classes', content, hideSearch: true });
  bindAppShell({onRefresh:refreshDirectory});

  document.getElementById('create-class-btn').onclick = openCreateClass;
  document.getElementById('join-code-btn').onclick = openJoinCode;
  document.getElementById('class-directory-sort').onchange = event => { directorySort=directoryView==='public'?'name':event.target.value;directoryPages[directoryView]=1;drawDirectory(); };
  const searchInput=document.getElementById('class-search-input');
  const searchClear=document.getElementById('class-search-clear');
  searchInput.oninput = () => scheduleLiveSearch();
  searchInput.onkeydown = e => {
    if (e.key === 'Escape') { hideSearchResults(); searchInput.blur(); }
    if (e.key === 'Enter') { e.preventDefault(); runSearch(searchInput.value.trim()); }
  };
  searchInput.onfocus = () => { if(searchInput.value.trim().length>=2) scheduleLiveSearch(true); };
  searchClear.onclick = () => { searchInput.value=''; searchClear.classList.add('hidden'); hideSearchResults(); searchInput.focus(); };
  document.addEventListener('pointerdown', classSearchOutsideHandler, { once:false });
  drawDirectory();
  loadMyClasses();
  loadPublicClasses(false);
}

function drawDirectory() {
  if(!directoryVisible())return;
  syncCreateClassLimit(state.myClasses || []);
  const groups=directoryClasses(state.myClasses || [],state.publicClasses?.items || []);
  if(directoryView==='archive'&&!groups.archive.length)directoryView='mine';
  const tabs=document.getElementById('class-directory-tabs'),panel=document.getElementById('class-directory-panel');
  const focusedTab=document.activeElement?.dataset?.directoryView;
  tabs.classList.toggle('has-archive',Boolean(groups.archive.length));
  tabs.innerHTML=directoryTabsHtml(groups,directoryView,{mineKnown:Number(state.myClassesAt || 0)>0,publicKnown:Boolean(state.publicClasses),publicTotal:state.publicClasses?.total});
  tabs.querySelectorAll('[data-directory-view]').forEach(btn=>{
    btn.onclick=()=>selectDirectoryView(btn.dataset.directoryView);
    btn.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const choices=[...tabs.querySelectorAll('[data-directory-view]')],at=choices.indexOf(btn);
      const next=event.key==='Home'?0:event.key==='End'?choices.length-1:(at+(event.key==='ArrowRight'?1:-1)+choices.length)%choices.length;
      selectDirectoryView(choices[next].dataset.directoryView,true);
    };
  });
  if(focusedTab)document.getElementById('cl-tab-'+focusedTab)?.focus({preventScroll:true});
  const [key,symbol,title]=DIRECTORY_VIEWS.find(([view])=>view===directoryView);
  const isPublic=key==='public',size=DIRECTORY_PAGE_SIZE[directoryLayout];
  const sort=document.getElementById('class-directory-sort');
  sort.disabled=isPublic;sort.value=isPublic?'name':directorySort;
  sort.title=isPublic?'Kelas umum diurutkan Nama A–Z oleh server.':'Urutkan daftar kelas';
  const ordered=isPublic?groups.public:sortDirectoryClasses(groups[key],directorySort);
  const paging=directoryPage(ordered,{page:directoryPages[key],size,total:isPublic?Number(state.publicClasses?.total ?? ordered.length):ordered.length,serverPage:isPublic?Number(state.publicClasses?.page || 1):0,serverLimit:PUBLIC_BATCH_SIZE});
  directoryPages[key]=paging.page;
  const rows=paging.rows;
  const loading=key==='demo'?(directoryLoading.mine||directoryLoading.public):directoryLoading[isPublic?'public':'mine'];
  const error=key==='demo'?[directoryErrors.mine,directoryErrors.public].filter(Boolean).join(' '):directoryErrors[isPublic?'public':'mine'];
  const description=isPublic?(state.publicClasses?`${paging.total} kelas umum · lihat informasi sebelum bergabung.`:'Temukan kelas umum dan lihat informasi sebelum bergabung.'):key==='demo'?'Ruang contoh yang tersedia untuk mengenal fitur KelasKu.':key==='archive'?'Informasi kelas yang sudah selesai.':Number(state.myClassesAt || 0)>0?`${paging.total} kelas belajar yang kamu ikuti.`:'Kelas belajar yang sudah kamu ikuti.';
  panel.setAttribute('aria-labelledby','cl-tab-'+key);
  const controls=`<div class="cl-view-tools"><div class="cl-view-switch" role="group" aria-label="Tampilan kelas">${[['grid','Tampilan kartu'],['list','Tampilan daftar']].map(([layout,label])=>`<button type="button" class="cl-icon-button${directoryLayout===layout?' is-active':''}" data-directory-layout="${layout}" aria-label="${label}" title="${label}" aria-pressed="${directoryLayout===layout}">${directoryIcon(layout)}</button>`).join('')}</div><button type="button" class="cl-icon-button cl-refresh" data-directory-refresh aria-label="Perbarui ${title}" title="Perbarui ${title}" ${loading?'disabled':''}>${directoryIcon('refresh')}</button></div>`;
  panel.innerHTML=`<div class="cl-section-head"><div class="cl-section-title">${svg(symbol)}<div><h2>${title}</h2><p>${esc(description)}</p></div></div>${controls}</div>${error?`<div class="cl-source-message" role="status">${esc(error)} Data terakhir tetap tersedia.</div>`:loading?'<div class="cl-source-message" role="status"><span class="btn-spinner"></span><span>Memperbarui daftar kelas…</span></div>':''}${rows.length?`<div class="cl-grid${directoryLayout==='list'?' is-list':''}" aria-busy="${Boolean(loading)}">${rows.map(item=>directoryCardHtml(directoryIdentity(item),{mine:key==='mine',banner:directoryBanner(item),members:directoryMembers(item),layout:directoryLayout})).join('')}</div>`:loading?'':directoryEmptyHtml(key)}${directoryPagerHtml(paging,{loading})}${key==='mine'&&groups.demo.length?'<div class="cl-demo-hint">Baru mengenal KelasKu?<button type="button" data-directory-demo>Coba Kelas Demo</button></div>':''}`;
  bindClassRows(panel);
  panel.querySelectorAll('[data-directory-refresh]').forEach(btn=>btn.onclick=()=>refreshDirectory());
  panel.querySelectorAll('[data-directory-join]').forEach(btn=>btn.onclick=openJoinCode);
  panel.querySelectorAll('[data-directory-demo]').forEach(btn=>btn.onclick=()=>selectDirectoryView('demo',true));
  panel.querySelectorAll('[data-directory-number]').forEach(btn=>btn.onclick=()=>selectDirectoryPage(Number(btn.dataset.directoryNumber)));
  panel.querySelectorAll('[data-directory-layout]').forEach(btn=>btn.onclick=()=>selectDirectoryLayout(btn.dataset.directoryLayout));
}
function directoryDetail(item) {
  const detail=state.classDetails?.[item.class_id];
  return String(detail?.class?.class_id || '')===String(item.class_id)?detail:null;
}
function directoryIdentity(item) {
  const cached=directoryDetail(item)?.class;
  return {...item,cover_url:item.cover_url || cached?.cover_url || '',icon_key:item.icon_key || cached?.icon_key || ''};
}
function directoryMembers(item) {
  if(!isClassMember(item))return [];
  const detail=directoryDetail(item),user=state.user;
  const visible=detail?.settings?.member_list_visible!==false || detail?.permissions?.can_manage_members===true;
  const members=visible&&Array.isArray(detail?.members)?detail.members.filter(member=>!['PENDING','REMOVED','INACTIVE'].includes(String(member.membership_status || member.status || '').toUpperCase())):[];
  return [...(user?.user_id?[user]:[]),...members.filter(member=>String(member.user_id)!==String(user?.user_id || ''))];
}
function directoryBanner(item) {
  const active=directoryDetail(item)?.appearance?.active;
  return active?.HERO_DESKTOP?.url || active?.ROOM_DESKTOP?.url || '';
}
function selectDirectoryLayout(layout) {
  if(!DIRECTORY_PAGE_SIZE[layout]||layout===directoryLayout)return;
  const oldSize=DIRECTORY_PAGE_SIZE[directoryLayout],nextSize=DIRECTORY_PAGE_SIZE[layout];
  Object.keys(directoryPages).forEach(key=>directoryPages[key]=Math.floor((directoryPages[key]-1)*oldSize/nextSize)+1);
  directoryLayout=layout;
  try{localStorage.setItem('kelasku_class_directory_layout',layout);}catch{}
  drawDirectory();
  document.querySelector(`[data-directory-layout="${layout}"]`)?.focus({preventScroll:true});
}
function selectDirectoryPage(page) {
  if(!Number.isInteger(page)||page<1||page===directoryPages[directoryView])return;
  const previous=directoryPages[directoryView];directoryPages[directoryView]=page;
  if(directoryView==='public') {
    publicPage=Math.floor((page-1)*DIRECTORY_PAGE_SIZE[directoryLayout]/PUBLIC_BATCH_SIZE)+1;
    if(publicPage!==Number(state.publicClasses?.page || 1))return loadPublicClasses(false,previous).then(()=>{
      if(directoryVisible()&&directoryView==='public')document.querySelector(`[data-directory-number="${directoryPages.public}"]`)?.focus({preventScroll:true});
    });
  }
  drawDirectory();
  document.querySelector(`[data-directory-number="${directoryPages[directoryView]}"]`)?.focus({preventScroll:true});
}
function selectDirectoryView(view,focus=false) {
  if(!DIRECTORY_VIEWS.some(([key])=>key===view))return;
  directoryView=view;drawDirectory();
  if(focus)document.getElementById('cl-tab-'+view)?.focus({preventScroll:true});
  if(view==='public')publicPage=Math.floor((directoryPages.public-1)*DIRECTORY_PAGE_SIZE[directoryLayout]/PUBLIC_BATCH_SIZE)+1;
  if(view==='public'||view==='demo')loadPublicClasses(false);
  if(view!=='public')loadMyClasses(true);
}
function refreshDirectory() {
  if(directoryView==='demo')return Promise.allSettled([loadMyClasses(false,true),loadPublicClasses(true)]);
  return directoryView==='public'?loadPublicClasses(true):loadMyClasses(false,true);
}
export async function prefetchMyClasses() {
  return loadMyClasses(true);
}

export function renderJoinLink() {
  const url = new URL(window.location.href);
  const ref = String(url.searchParams.get('c') || url.searchParams.get('class') || url.searchParams.get('slug') || '').trim();
  const guest = !state.sessionToken;
  const content = `<div class="page-head"><div><div class="eyebrow">KELASKU • LINK BERGABUNG</div><h1>Gabung Kelas</h1><p>Lihat informasi kelas terlebih dahulu. Akun hanya diperlukan saat benar-benar mengajukan bergabung.</p></div></div><section class="panel join-link-panel" id="join-link-panel"><div class="fast-load-panel"><span class="status-dot"></span><div><strong>Menyiapkan kelas…</strong><small>Memeriksa link bergabung.</small></div></div></section>`;
  if (guest) {
    document.getElementById('app').innerHTML = `<main class="public-join-page"><header class="public-join-brand"><img src="/assets/brand/logo-lockup.svg" alt="KelasKu"><span>Preview Kelas</span></header><div class="public-join-wrap">${content}</div></main>`;
  } else {
    document.getElementById('app').innerHTML = appShell({ active: 'classes', content, searchPlaceholder: 'Cari kelas…' });
    bindAppShell();
  }
  if (!ref) return drawJoinLinkError('Link bergabung tidak lengkap.');
  loadJoinLinkPreview(ref);
}

async function loadJoinLinkPreview(ref) {
  const slot = document.getElementById('join-link-panel');
  if (!slot) return;
  const guest = !state.sessionToken;
  try {
    const data = await api(guest ? 'getPublicJoinClassPreview' : 'getJoinClassPreview', { ref }, guest ? { auth:false } : {});
    const c = data.class || {};
    const status = String(c.membership_status || '').toUpperCase();
    const already = status === 'ACTIVE';
    const pending = status === 'PENDING';
    const publicRef = String(c.public_slug || c.class_code || ref).replace(/^KLS-/i,'');
    const infoUrl = `${String(window.KELASKU_CONFIG?.PRIMARY_ORIGIN || window.location.origin).replace(/\/$/,'')}/links.html?c=${encodeURIComponent(publicRef)}`;
    slot.innerHTML = `<div class="join-link-card"><span class="class-symbol">${svg('i-class')}</span><div class="join-link-copy"><span class="eyebrow">${esc(c.institution || 'KELASKU')}</span><h2>${esc(c.name || 'Kelas')}</h2><p>${esc(c.study_program || '')}${c.cohort ? `${c.study_program?' · ':''}Angkatan ${esc(c.cohort)}` : ''}${c.semester ? ` · ${esc(c.semester)}` : ''}</p>${c.description?`<p class="join-link-description">${esc(c.description)}</p>`:''}<div class="join-link-meta"><span>${esc(c.class_code || '')}</span><span class="visibility-badge visibility-${String(c.visibility||'PUBLIC').toLowerCase()}">${esc(c.visibility || 'PUBLIC')}</span>${Number(c.member_count||0)?`<span>${Number(c.member_count)} anggota</span>`:''}</div></div></div><div id="join-link-status" class="request-status ${pending?'ok':''}">${pending?'Permintaan bergabung sedang menunggu persetujuan.':''}</div><div class="page-actions join-link-actions">${guest?'<button type="button" id="join-link-auth" class="btn btn-primary">Masuk / Daftar untuk Bergabung</button>':already?'<button type="button" id="join-link-open" class="btn btn-primary">Buka Kelas</button>':`<button type="button" id="join-link-submit" class="btn btn-primary" ${pending?'disabled':''}>${pending?'Menunggu Persetujuan':'Ajukan Bergabung'}</button>`}<a class="btn btn-secondary" href="${esc(infoUrl)}">Lihat Info Kelas</a>${guest?'':'<button type="button" id="join-link-classes" class="btn btn-secondary">Daftar Kelas</button>'}</div>${guest?'<p class="join-link-hint">Belum punya akun? Pilih <b>Masuk / Daftar</b>. Setelah selesai, KelasKu akan mengembalikanmu ke kelas ini.</p>':''}`;
    document.getElementById('join-link-auth')?.addEventListener('click',()=>{sessionStorage.setItem('kelasku_post_auth_route','join');go('auth');});
    document.getElementById('join-link-classes')?.addEventListener('click',()=>go('classes'));
    document.getElementById('join-link-open')?.addEventListener('click',()=>{state.selectedClassId=c.class_id;sessionStorage.setItem('kelasku_selected_class',c.class_id);go('class');});
    document.getElementById('join-link-submit')?.addEventListener('click',()=>submitJoinLink(ref,c));
  } catch (err) { drawJoinLinkError(err.message); }
}

async function submitJoinLink(ref,c) {
  const btn=document.getElementById('join-link-submit'), status=document.getElementById('join-link-status');
  if(!btn||btn.disabled)return; const old=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="btn-spinner"></span><span>Mengirim…</span>';
  status.className='request-status progress'; status.textContent='Mengirim permintaan ke pengelola kelas…';
  try{const data=await api('requestJoinByLink',{ref});if(data.status==='ALREADY_MEMBER'){state.selectedClassId=c.class_id;sessionStorage.setItem('kelasku_selected_class',c.class_id);toast('Kamu sudah menjadi anggota kelas.');return go('class');}status.className='request-status ok';status.textContent='Permintaan terkirim. Tinggal menunggu persetujuan pengelola.';btn.textContent='Menunggu Persetujuan';state.myClassesAt=0;}catch(err){status.className='request-status error';status.textContent=err.message;btn.disabled=false;btn.innerHTML=old;}}

function drawJoinLinkError(message){const slot=document.getElementById('join-link-panel');if(slot)slot.innerHTML=`<div class="search-empty">${esc(message||'Link bergabung tidak tersedia.')}</div><div class="page-actions"><button type="button" id="join-link-back" class="btn btn-secondary">Kembali ke Daftar Kelas</button></div>`;document.getElementById('join-link-back')?.addEventListener('click',()=>go('classes'));}

async function loadMyClasses(background = false, force = false) {
  const owner=classAccountKey(),known=Array.isArray(state.myClasses)&&Number(state.myClassesAt || 0)>0;
  const fresh = known && (Date.now() - Number(state.myClassesAt || 0) < MY_CLASSES_TTL_MS);
  if (!force && fresh) return state.myClasses;
  if (myClassesInFlight && myClassesRequestOwner===owner) return myClassesInFlight;
  myClassesRequestOwner=owner;directoryLoading.mine=true;directoryErrors.mine='';drawDirectory();
  const request = (async () => {
    try {
      const data = await api('getMyClasses');
      if(owner!==classAccountKey())return [];
      if(!Array.isArray(data?.items))throw new Error('Daftar kelas belum lengkap.');
      const next = data.items || [];
      state.myClasses = next;
      state.myClassesAt = Date.now();
      try{localStorage.setItem('kelasku_classes_cache', JSON.stringify(state.myClasses));localStorage.setItem('kelasku_classes_cache_at', String(state.myClassesAt));}catch{}
      return state.myClasses;
    } catch (err) {
      if(owner===classAccountKey())directoryErrors.mine='Kelasmu belum dapat diperbarui. Gunakan tombol Perbarui untuk mencoba lagi.';
      return state.myClasses || [];
    } finally { if(myClassesInFlight===request){myClassesInFlight=null;if(owner===classAccountKey()){directoryLoading.mine=false;drawDirectory();}} }
  })();
  myClassesInFlight=request;return request;
}


function syncCreateClassLimit(items = []) {
  const btn = document.getElementById('create-class-btn');
  if (!btn) return;
  const isSuperAdmin = String(state.user?.global_role || '').toUpperCase() === 'SUPER_ADMIN';
  const owned = (items || []).filter(c => String(c.role || '').toUpperCase() === 'OWNER').length;
  const full = !isSuperAdmin && owned >= 3;
  btn.disabled = full;
  const demoOwned=(items || []).filter(c=>String(c.role || '').toUpperCase()==='OWNER'&&isDemoClass(c)).length;
  const limitNote=document.getElementById('class-create-limit-note');
  if(limitNote){limitNote.hidden=!full;limitNote.textContent=full?`Batas 3 kelas buatanmu sudah terpakai${demoOwned?`, termasuk ${demoOwned} kelas demo`:''}.`:'';}
  btn.title = isSuperAdmin
    ? `Super Admin: ${owned} kelas dimiliki, tanpa batas sementara.`
    : (full ? 'Batas sementara tercapai: maksimal 3 kelas yang dibuat per akun.' : `Kamu sudah membuat ${owned}/3 kelas.`);
  btn.setAttribute('aria-label',full?'Batas 3 kelas tercapai':'Buat Kelas');
  btn.innerHTML = full ? `${svg('i-info')}<span class="cl-action-full">Batas 3 Kelas</span><span class="cl-action-short" aria-hidden="true">Penuh</span>` : `${svg('i-plus')}<span class="cl-action-full">Buat Kelas</span><span class="cl-action-short" aria-hidden="true">Buat</span>`;
}


function classIdentityIconMarkup(c){
  const icon=String(c?.icon_key||'school').trim()||'school';
  return `<span class="material-symbols-rounded class-list-material-icon">${esc(icon)}</span>`;
}

function classCoverClass(c){
  return String(c?.cover_url||'').trim() ? ' has-cover' : '';
}

function classCoverAttrs(c){
  const cover=String(c?.cover_url||'').trim();
  return cover ? ` data-class-cover-url="${esc(cover)}"` : '';
}

function hydrateClassCoverImages(root=document){
  root.querySelectorAll?.('[data-class-cover-url]').forEach(el=>{
    if(el.dataset.coverHydrated==='1')return;
    el.dataset.coverHydrated='1';
    const url=String(el.dataset.classCoverUrl||'').trim();
    if(!url)return;
    const probe=new Image();
    probe.onload=()=>{
      if(!document.body.contains(el))return;
      el.style.backgroundImage=`url("${url.replace(/"/g,'%22')}")`;
      el.classList.add('cover-loaded');
      el.classList.remove('cover-failed');
    };
    probe.onerror=()=>{
      if(!document.body.contains(el))return;
      el.style.backgroundImage='';
      el.classList.remove('cover-loaded');
      el.classList.add('cover-failed');
    };
    probe.src=url;
  });
}


function bindClassRows(root) {
  hydrateClassCoverImages(root);
  root.querySelectorAll('[data-directory-image]').forEach(img=>{
    const loaded=()=>img.classList.add('is-loaded');
    const failed=()=>img.remove();
    img.addEventListener('load',loaded,{once:true});img.addEventListener('error',failed,{once:true});
    if(img.complete){if(img.naturalWidth)loaded();else failed();}
  });
  const openClass = id => {
    state.selectedClassId = id;
    sessionStorage.setItem('kelasku_selected_class', state.selectedClassId);
    go('class');
  };
  const previewClass = id => {
    const item = localSearchPool().find(x => String(x.class_id) === String(id));
    if(!item)return;
    if(isArchivedClass(item)){showModal(`<div class="modal-head"><div><div class="eyebrow">KELAS ARSIP</div><h2>${esc(item.name)}</h2></div><button class="icon-btn mini" data-close-modal aria-label="Tutup informasi kelas">${svg('i-close')}</button></div><p class="copy compact-copy">Kelas ini sudah diarsipkan. Akses aktivitas mengikuti ketentuan pengelola kelas.</p><p class="copy compact-copy">${esc(item.description || item.institution || '')}</p>`);return;}
    openJoinPreview(item, item.class_code || '');
  };

  root.querySelectorAll('[data-class-card-open]').forEach(row => {
    const activate = e => {
      if (e?.target?.closest?.('button,a,input,select,textarea')) return;
      openClass(row.dataset.classCardOpen);
    };
    row.onclick = activate;
    row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(e); } };
  });
  root.querySelectorAll('[data-class-card-preview]').forEach(row => {
    const activate = e => {
      if (e?.target?.closest?.('button,a,input,select,textarea')) return;
      previewClass(row.dataset.classCardPreview);
    };
    row.onclick = activate;
    row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(e); } };
  });
  root.querySelectorAll('[data-open-class]').forEach(el => {
    el.onclick = e => { e.stopPropagation(); openClass(el.dataset.openClass); };
  });
  root.querySelectorAll('[data-directory-preview]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); previewClass(btn.dataset.directoryPreview); };
  });
}

async function loadPublicClasses(force = false, rollbackPage = directoryPages.public) {
  if(!directoryVisible())return;
  const owner=classAccountKey(),query=publicQuery,key=`${owner}::${publicPage}::${query}`;
  let page=publicPage;
  if(!force&&publicClassesKey===key&&state.publicClasses&&Date.now()-publicClassesAt<MY_CLASSES_TTL_MS)return state.publicClasses;
  if(publicClassesInFlight?.key===key)return publicClassesInFlight.request;
  const cached=publicBatches.get(key);
  if(!force&&cached&&Date.now()-cached.at<MY_CLASSES_TTL_MS){
    publicRequestSeq++;state.publicClasses=cached.data;publicClassesKey=key;publicClassesAt=cached.at;
    directoryLoading.public=false;directoryErrors.public='';drawDirectory();return cached.data;
  }
  const seq=++publicRequestSeq;
  directoryLoading.public=true;directoryErrors.public='';drawDirectory();
  const request=(async()=>{
    try{
      let data=await api('listPublicClasses',{page,limit:PUBLIC_BATCH_SIZE,query});
      if(owner!==classAccountKey()||seq!==publicRequestSeq)return;
      if(!Array.isArray(data?.items))throw new Error('Daftar kelas umum belum lengkap.');
      // A class may disappear while paging. Fetch the last valid batch once.
      const lastBatch=Math.max(1,Math.ceil(Number(data.total || 0)/PUBLIC_BATCH_SIZE));
      if(page>lastBatch){
        page=lastBatch;data=await api('listPublicClasses',{page,limit:PUBLIC_BATCH_SIZE,query});
        if(owner!==classAccountKey()||seq!==publicRequestSeq)return;
        if(!Array.isArray(data?.items))throw new Error('Daftar kelas umum belum lengkap.');
      }
      data={...data,page};
      if(force||Number(state.publicClasses?.total)!==Number(data.total))publicBatches.clear();
      state.publicClasses=data;publicPage=page;publicClassesKey=`${owner}::${page}::${query}`;publicClassesAt=Date.now();
      publicBatches.delete(publicClassesKey);publicBatches.set(publicClassesKey,{data,at:publicClassesAt});
      while(publicBatches.size>3)publicBatches.delete(publicBatches.keys().next().value);
      if(page===1&&!query){try{localStorage.setItem('kelasku_public_classes_cache',JSON.stringify(data));}catch{}}
      return data;
    }catch(err){
      if(owner===classAccountKey()&&seq===publicRequestSeq){
        directoryErrors.public='Kelas umum belum dapat diperbarui. Gunakan tombol Perbarui untuk mencoba lagi.';
        publicPage=Number(state.publicClasses?.page || 1);
        const size=DIRECTORY_PAGE_SIZE[directoryLayout],first=(publicPage-1)*PUBLIC_BATCH_SIZE/size+1;
        directoryPages.public=Math.max(first,Math.min(first+PUBLIC_BATCH_SIZE/size-1,rollbackPage));
      }
    }finally{
      if(publicClassesInFlight?.request===request){publicClassesInFlight=null;if(owner===classAccountKey()&&seq===publicRequestSeq){directoryLoading.public=false;drawDirectory();}}
    }
  })();
  publicClassesInFlight={key,request};return request;
}

function classSearchOutsideHandler(e){
  const panel=document.querySelector('.classes-search-panel');
  if(panel && !panel.contains(e.target)) hideSearchResults();
}

function hideSearchResults(){
  const box=document.getElementById('class-search-results');
  if(box) box.classList.add('hidden');
}

function scheduleLiveSearch(immediate=false){
  const input=document.getElementById('class-search-input');
  const clear=document.getElementById('class-search-clear');
  if(!input)return;
  const query=input.value.trim();
  clear?.classList.toggle('hidden',!query);
  if(classSearchTimer)clearTimeout(classSearchTimer);
  if(query.length<2){hideSearchResults();return;}
  drawLocalSearchSuggestions(query);
  classSearchRequestSeq++;
  classSearchTimer=setTimeout(()=>runSearch(query),immediate?0:300);
}

function localSearchPool(){
  const map=new Map();
  [...(state.myClasses||[]),...(state.publicClasses?.items||[])].forEach(item=>{
    if(item?.class_id&&!map.has(String(item.class_id)))map.set(String(item.class_id),item);
  });
  return [...map.values()];
}

function drawLocalSearchSuggestions(query){
  const q=String(query||'').toLowerCase();
  const box=document.getElementById('class-search-results');
  if(!box)return;
  const hits=localSearchPool().filter(c=>[
    c.name,c.class_code,c.institution,c.study_program,c.cohort
  ].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,6);
  if(!hits.length)return;
  box.classList.remove('hidden');
  box.innerHTML=hits.map(searchCard).join('');
  bindSearchRows(box,hits,query);
}

async function runSearch(queryOverride='') {
  const input = document.getElementById('class-search-input');
  const box = document.getElementById('class-search-results');
  const query = String(queryOverride || input?.value || '').trim();
  if (!box || query.length < 2) { hideSearchResults(); return; }
  const seq=++classSearchRequestSeq;
  const owner=classAccountKey();
  box.classList.remove('hidden');
  if(!box.querySelector('[data-search-class]'))box.innerHTML = '<div class="search-loading"><span class="status-dot"></span>Mencari kelas…</div>';
  try {
    const data = await api('searchClasses', { query });
    if(owner!==classAccountKey()||!directoryVisible()||seq!==classSearchRequestSeq || String(input?.value||'').trim()!==query)return;
    const items = (data.items || []).slice(0,8);
    box.innerHTML = items.length ? items.map(searchCard).join('') : '<div class="search-empty">Kelas tidak ditemukan.</div>';
    bindSearchRows(box,items,query);
  } catch (err) {
    if(owner!==classAccountKey()||!directoryVisible()||seq!==classSearchRequestSeq)return;
    box.innerHTML = `<div class="search-empty">${esc(err.message)}</div>`;
  }
}

function bindSearchRows(box,items,query){
  hydrateClassCoverImages(box);
  box.querySelectorAll('[data-search-class]').forEach(btn => btn.onclick = () => selectSearchClass(items.find(x => String(x.class_id) === String(btn.dataset.searchClass)), query));
}

function searchCard(c) {
  const meta=[c.class_code||'',c.institution||'',c.cohort?`Angkatan ${c.cohort}`:''].filter(Boolean).join(' · ');
  return `<button type="button" class="search-class-row" data-search-class="${esc(c.class_id)}"><span class="status-icon${classCoverClass(c)}"${classCoverAttrs(c)}>${classIdentityIconMarkup(c)}</span><span class="search-class-inline"><strong>${esc(c.name)}</strong><small>${esc(meta)}</small></span><b>${c.role ? esc(roleLabel(c.role)) : 'Lihat'}</b></button>`;
}

function selectSearchClass(c, query = '') {
  if (!c) return;
  if(isArchivedClass(c)){showModal(`<div class="modal-head"><h2>${esc(c.name)}</h2><button class="icon-btn mini" data-close-modal aria-label="Tutup">${svg('i-close')}</button></div><p class="copy compact-copy">Kelas ini telah diarsipkan.</p>`);return;}
  if (c.role) {
    state.selectedClassId = c.class_id;
    sessionStorage.setItem('kelasku_selected_class', c.class_id);
    go('class');
    return;
  }
  openJoinPreview(c, c.match_type === 'JOIN_CODE' ? query : c.class_code);
}

function openCreateClass() {
  const isSuperAdmin = String(state.user?.global_role || '').toUpperCase() === 'SUPER_ADMIN';
  const owned = (state.myClasses || []).filter(c => String(c.role || '').toUpperCase() === 'OWNER').length;
  if (!isSuperAdmin && owned >= 3) { toast('Batas sementara: maksimal 3 kelas yang dibuat per akun.'); return; }
  showModal(`
    <div class="modal-head"><div><div class="eyebrow">Buat Kelas</div><h2>Kelas baru</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>
    <form id="create-class-form">
      <div class="field"><label>Nama Kelas *</label><input name="name" class="control" placeholder="Ekonomi Syariah — Angkatan 3" required minlength="3"></div>
      <div class="field"><label>Deskripsi</label><textarea name="description" class="control" rows="3" placeholder="Tujuan / keterangan singkat kelas"></textarea></div>
      <div class="form-grid"><div class="field"><label>Institusi</label><input name="institution" class="control" value="${esc(state.user?.institution || '')}"></div><div class="field"><label>Angkatan</label><input name="cohort" class="control" value="${esc(state.user?.cohort || '')}"></div></div>
      <div class="field"><label>Visibilitas</label><select name="visibility" class="control"><option value="DISCOVERABLE">Discoverable — bisa dicari, perlu approval</option><option value="PUBLIC">Public</option><option value="PRIVATE">Private — Join Code</option></select></div>
      <div id="create-class-status" class="request-status"></div>
      <button id="create-class-submit" class="btn btn-primary btn-block" type="submit">${svg('i-plus')} Buat Kelas</button>
    </form>`);

  document.getElementById('create-class-form').onsubmit = submitCreateClass;
}

async function submitCreateClass(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const btn = document.getElementById('create-class-submit');
  const status = document.getElementById('create-class-status');
  const old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span><span>Membuat kelas…</span>';
  status.className = 'request-status progress'; status.textContent = 'Membuat kelas, kode, dan role OWNER dalam satu proses…';
  try {
    const data = await api('createClass', Object.fromEntries(new FormData(form)), { onSlow: () => status.textContent = 'Masih menyimpan. Jangan klik dua kali.' });
    closeModal();
    toast('Kelas berhasil dibuat.');
    state.selectedClassId = data.class.class_id;
    sessionStorage.setItem('kelasku_selected_class', state.selectedClassId);
    state.myClasses = [];
    state.myClassesAt = 0;
    localStorage.removeItem('kelasku_classes_cache');
    localStorage.removeItem('kelasku_classes_cache_at');
    go('class');
  } catch (err) { status.className='request-status error'; status.textContent=err.message; }
  finally { btn.disabled=false; btn.innerHTML=old; }
}

function openJoinCode() {
  showModal(`
    <div class="modal-head"><div><div class="eyebrow">Masuk Kelas</div><h2>Class Code / Join Code</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>
    <p class="copy compact-copy">Masukkan kode kelas seperti <b>KLS-ABC123</b> atau Join Code 6 karakter.</p>
    <div class="field"><label>Kode</label><input id="join-code-input" class="control code-input" placeholder="KLS-XXXXXX / ABC123" autocomplete="off"></div>
    <div id="join-code-status" class="request-status"></div>
    <button id="lookup-code-btn" class="btn btn-primary btn-block">Cari Kelas</button>
    <div id="join-preview-slot"></div>`);
  document.getElementById('lookup-code-btn').onclick = lookupCode;
}

async function lookupCode() {
  const code = document.getElementById('join-code-input').value.trim();
  const status = document.getElementById('join-code-status');
  const slot = document.getElementById('join-preview-slot');
  if (!code) return;
  status.className='request-status progress'; status.textContent='Mencari kelas…';
  try {
    const data = await api('lookupClass', { code });
    status.textContent='';
    slot.innerHTML = joinPreviewHtml(data.class, code);
    document.getElementById('confirm-join-btn').onclick = () => submitJoin(data.class, code);
  } catch(err){ status.className='request-status error'; status.textContent=err.message; slot.innerHTML=''; }
}

function openJoinPreview(c, code = '') {
  const effectiveCode = code || c.class_code || '';
  showModal(`<div class="modal-head class-preview-modal-head"><div><div class="eyebrow">GABUNG KELAS</div><h2>Preview Kelas</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>${joinPreviewHtml(c, effectiveCode)}`);
  document.getElementById('confirm-join-btn').onclick = () => submitJoin(c, effectiveCode);
}

function joinPreviewHtml(c, code) {
  const viaJoin = String(c.match_type || '').toUpperCase() === 'JOIN_CODE' || (code && code.toUpperCase() !== String(c.class_code || '').toUpperCase());
  const waiting = String(c.membership_status || '').toUpperCase() === 'PENDING';
  const landingUrl=publicLandingUrl(c);
  const memberCount=Number(c.member_count||0);
  return `<div class="join-preview panel join-preview-compact"><span class="class-symbol">${svg('i-class')}</span><div class="join-preview-copy"><h3>${esc(c.name)}</h3><p>${[c.institution||'',c.cohort?`Angkatan ${c.cohort}`:'',c.class_code||''].filter(Boolean).map(esc).join(' · ')}</p><div class="join-preview-kpis"><span class="visibility-badge visibility-${String(c.visibility||'PUBLIC').toLowerCase()}">${esc(directoryVisibility(c))}</span>${memberCount?`<span class="class-card-kpi"><span class="material-symbols-rounded">group</span>${memberCount}</span>`:''}</div></div></div>${viaJoin?'<div class="join-code-valid">'+svg('i-check')+' Kode bergabung valid</div>':''}<div id="join-request-status" class="request-status ${waiting?'ok':''}">${waiting?'Permintaan bergabung sedang menunggu persetujuan.':''}</div><div class="join-preview-actions"><button id="confirm-join-btn" class="btn btn-primary" ${waiting?'disabled':''}>${waiting?'Menunggu Persetujuan':'Ajukan Bergabung'}</button><a class="btn btn-secondary" href="${esc(landingUrl)}">${svg('i-eye')}Info Publik Kelas</a></div>`;
}

async function submitJoin(c, code) {
  const btn = document.getElementById('confirm-join-btn');
  const status = document.getElementById('join-request-status');
  const old = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="btn-spinner"></span><span>Memproses…</span>';
  try {
    const data = await api('joinClass', { class_id:c.class_id, code });
    if (data.status === 'JOINED' || data.status === 'ALREADY_MEMBER') {
      closeModal(); toast(data.status === 'JOINED' ? 'Berhasil masuk kelas.' : 'Kamu sudah menjadi anggota.'); loadMyClasses(false,true);
    } else {
      status.className='request-status ok'; status.textContent='Permintaan bergabung sudah dikirim ke pengelola kelas.';
      btn.textContent='Menunggu Persetujuan'; btn.disabled=true;
    }
  } catch(err){ status.className='request-status error'; status.textContent=err.message; btn.disabled=false; btn.innerHTML=old; }
}

function showModal(html) {
  closeModal();
  const el = document.createElement('div'); el.id='phase-modal'; el.className='overlay';
  el.innerHTML=`<div class="modal glass phase-modal-card">${html}</div>`; document.body.appendChild(el);
  el.querySelectorAll('[data-close-modal]').forEach(x=>{x.onclick=closeModal;if(!x.getAttribute('aria-label'))x.setAttribute('aria-label','Tutup');});
  el.onclick=e=>{ if(e.target===el) closeModal(); };
}
function closeModal(){ document.getElementById('phase-modal')?.remove(); }

function roleLabel(role) {
  const key = String(role || 'MEMBER').toUpperCase();
  if (key === 'COORDINATOR') return 'Koordinator';
  if (key === 'OWNER') return 'Owner';
  if (key === 'MODERATOR') return 'Moderator';
  if (key === 'TEACHER') return 'Pengajar';
  if (key === 'OBSERVER') return 'Pengamat';
  return 'Member';
}
