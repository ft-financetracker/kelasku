import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, sameData } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { go } from '../core/router.js';

let publicPage = 1;
let publicQuery = '';
let myClassesInFlight = null;
let classSearchTimer = null;
let classSearchRequestSeq = 0;
const MY_CLASSES_TTL_MS = 60 * 1000;

function publicLandingUrl(c={}) {
  const origin=String(window.KELASKU_CONFIG?.PRIMARY_ORIGIN || window.location.origin).replace(/\/$/,'');
  const slug=String(c.public_slug||'').trim().toLowerCase();
  const ref=slug || String(c.class_code||'').replace(/^KLS-/i,'');
  return slug ? `${origin}/${encodeURIComponent(slug)}` : `${origin}/links.html?c=${encodeURIComponent(ref)}`;
}

export function renderClasses() {
  const content = `
    <div class="classes-page">
      <section class="classes-top-shell">
        <div class="classes-title-block"><h1>Daftar Kelas</h1><p>Kelas yang kamu ikuti dan kelas umum yang dapat ditemukan langsung.</p></div>
        <div class="classes-primary-actions"><button id="join-code-btn" class="btn btn-secondary">${svg('i-key')} <span>Masuk Kode</span></button><button id="create-class-btn" class="btn btn-primary">${svg('i-plus')} <span>Buat Kelas</span></button></div>
        <div class="classes-search-panel">
          <div class="class-search-box classes-search-row">${svg('i-search')}<input id="class-search-input" placeholder="Cari nama kelas, Class Code, institusi…" autocomplete="off" aria-autocomplete="list" aria-controls="class-search-results"><button type="button" id="class-search-clear" class="classes-search-clear hidden" aria-label="Bersihkan pencarian"><span class="material-symbols-rounded">close</span></button></div>
          <div id="class-search-results" class="search-results hidden"></div>
        </div>
      </section>

      <section class="class-list-section">
        <div class="section-title-row class-section-head"><div><h2>Kelas Saya</h2><p id="class-count">Memuat kelas…</p></div><button type="button" id="my-class-toggle" class="class-section-toggle" aria-expanded="true" title="Ciutkan Kelas Saya"><span class="material-symbols-rounded">expand_less</span></button></div>
        <div id="class-grid" class="class-table-shell class-card-stack">${classSkeleton()}</div>
      </section>

      <section class="class-list-section public-class-section">
        <div class="section-title-row class-section-head"><div><h2>Kelas Umum</h2><p id="public-class-count">Kelas PUBLIC yang dapat dijelajahi.</p></div><div class="class-section-actions"><button id="public-class-refresh" class="btn btn-secondary small-btn">${svg('i-refresh')} Refresh</button><button type="button" id="public-class-toggle" class="class-section-toggle" aria-expanded="true" title="Ciutkan Kelas Umum"><span class="material-symbols-rounded">expand_less</span></button></div></div>
        <div id="public-class-list" class="class-table-shell class-card-stack">${classSkeleton()}</div>
        <div class="class-public-pager" id="public-class-pager"></div>
      </section>
    </div>`;

  document.getElementById('app').innerHTML = appShell({ active: 'classes', content, hideSearch: true });
  bindAppShell();

  document.getElementById('create-class-btn').onclick = openCreateClass;
  document.getElementById('join-code-btn').onclick = openJoinCode;
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
  document.getElementById('public-class-refresh').onclick = () => loadPublicClasses(true);
  bindClassSectionToggle('my-class-toggle','class-grid','kelasku_classes_mine_collapsed');
  bindClassSectionToggle('public-class-toggle','public-class-list','kelasku_classes_public_collapsed','public-class-pager');

  if (Array.isArray(state.myClasses) && state.myClasses.length) drawMyClasses(state.myClasses);
  loadMyClasses();
  loadPublicClasses(false);
}

function bindClassSectionToggle(buttonId, contentId, storageKey, extraId='') {
  const btn=document.getElementById(buttonId), content=document.getElementById(contentId), extra=extraId?document.getElementById(extraId):null;
  if(!btn||!content)return;
  const head=btn.closest('.class-section-head');
  const apply=collapsed=>{
    content.classList.toggle('class-section-collapsed',collapsed);
    if(extra)extra.classList.toggle('class-section-collapsed',collapsed);
    btn.setAttribute('aria-expanded',collapsed?'false':'true');
    btn.title=collapsed?'Buka daftar kelas':'Ciutkan daftar kelas';
    const icon=btn.querySelector('.material-symbols-rounded');
    if(icon)icon.textContent=collapsed?'expand_more':'expand_less';
    head?.classList.toggle('is-collapsed',collapsed);
  };
  let collapsed=localStorage.getItem(storageKey)==='1';
  const toggle=()=>{collapsed=!collapsed;localStorage.setItem(storageKey,collapsed?'1':'0');apply(collapsed);};
  apply(collapsed);
  btn.onclick=e=>{e.preventDefault();e.stopPropagation();toggle();};
  if(head) head.onclick=e=>{
    if(e.target.closest('button:not(#'+buttonId+')'))return;
    if(e.target.closest('a,input,select,textarea'))return;
    toggle();
  };
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
  const hadCache = Array.isArray(state.myClasses) && state.myClasses.length > 0;
  const fresh = hadCache && (Date.now() - Number(state.myClassesAt || 0) < MY_CLASSES_TTL_MS);
  if (!force && fresh) return state.myClasses;
  if (myClassesInFlight) return myClassesInFlight;
  myClassesInFlight = (async () => {
    try {
      const data = await api('getMyClasses');
      const next = data.items || [];
      const changed = !sameData(state.myClasses, next);
      state.myClasses = next;
      state.myClassesAt = Date.now();
      localStorage.setItem('kelasku_classes_cache', JSON.stringify(state.myClasses));
      localStorage.setItem('kelasku_classes_cache_at', String(state.myClassesAt));
      const grid = document.getElementById('class-grid');
      if (grid && (changed || !grid.querySelector('.class-list-row'))) drawMyClasses(state.myClasses);
      return state.myClasses;
    } catch (err) {
      const grid = document.getElementById('class-grid');
      if (!background && !hadCache && grid) grid.innerHTML = `<div class="panel error-panel"><strong>Daftar kelas gagal dimuat.</strong><p>${esc(err.message)}</p></div>`;
      return state.myClasses || [];
    } finally { myClassesInFlight = null; }
  })();
  return myClassesInFlight;
}

function drawMyClasses(items) {
  syncCreateClassLimit(items);
  const grid = document.getElementById('class-grid');
  const count = document.getElementById('class-count');
  if (!grid) return;
  if (count) count.textContent = `${items.length} kelas aktif`;
  if (!items.length) {
    grid.innerHTML = `<div class="empty class-empty"><div><div class="empty-icon">${svg('i-class')}</div><strong>Belum ada kelas</strong><span>Buat kelas sendiri atau masuk menggunakan kode dari ketua kelas.</span><div class="empty-actions"><button id="empty-create" class="btn btn-primary">Buat Kelas</button><button id="empty-join" class="btn btn-secondary">Masuk dengan Kode</button></div></div></div>`;
    document.getElementById('empty-create').onclick = openCreateClass;
    document.getElementById('empty-join').onclick = openJoinCode;
    return;
  }

  grid.innerHTML = items.map(c => classListRow(c, true)).join('');
  bindClassRows(grid);
}


function syncCreateClassLimit(items = []) {
  const btn = document.getElementById('create-class-btn');
  if (!btn) return;
  const isSuperAdmin = String(state.user?.global_role || '').toUpperCase() === 'SUPER_ADMIN';
  const owned = (items || []).filter(c => String(c.role || '').toUpperCase() === 'OWNER').length;
  const full = !isSuperAdmin && owned >= 3;
  btn.disabled = full;
  btn.title = isSuperAdmin
    ? `Super Admin: ${owned} kelas dimiliki, tanpa batas sementara.`
    : (full ? 'Batas sementara tercapai: maksimal 3 kelas yang dibuat per akun.' : `Kamu sudah membuat ${owned}/3 kelas.`);
  btn.innerHTML = full ? `${svg('i-lock')} Batas 3 Kelas` : `${svg('i-plus')} Buat Kelas`;
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

function classListRow(c, mine = false) {
  const leader = c.is_class_leader ? '<span class="role-pill leader-role-pill">Ketua Kelas</span>' : '';
  const isMember = Boolean(mine || c.is_member);
  const action = isMember
    ? `<button type="button" class="class-row-action" data-open-class="${esc(c.class_id)}" aria-label="Buka ${esc(c.name || 'kelas')}">${svg('i-arrow')}<span>Buka</span></button>`
    : `<button type="button" class="class-row-action join" data-public-join="${esc(c.class_id)}" aria-label="Gabung ${esc(c.name || 'kelas')}">${svg('i-plus')}<span>Gabung</span></button>`;
  const memberCount = Number(c.member_count || 0);
  const desc = [c.institution || 'KelasKu', c.cohort ? `Angkatan ${c.cohort}` : '', c.class_code || ''].filter(Boolean).join(' · ');
  const rowTarget = isMember ? `data-class-card-open="${esc(c.class_id)}"` : `data-class-card-preview="${esc(c.class_id)}"`;
  return `<article class="class-list-row class-room-card" ${rowTarget} tabindex="0" role="button" aria-label="${isMember?'Buka':'Lihat'} ${esc(c.name || 'kelas')}">
    <span class="class-symbol small class-room-icon${classCoverClass(c)}"${classCoverAttrs(c)}>${classIdentityIconMarkup(c)}</span>
    <div class="class-list-copy class-room-copy"><strong>${esc(c.name)}</strong><small class="class-list-subtitle">${esc(desc)}</small></div>
    <div class="class-list-badge-line class-room-badges">${c.role ? `<span class="role-pill role-${String(c.role||'member').toLowerCase()}">${esc(roleLabel(c.role))}</span>` : ''}${leader}<span class="visibility-badge visibility-${String(c.visibility||'PUBLIC').toLowerCase()}">${esc(c.visibility || 'PUBLIC')}</span>${memberCount ? `<span class="class-member-mobile class-card-kpi" aria-label="${memberCount} anggota"><span class="material-symbols-rounded">group</span>${memberCount}</span>` : ''}</div>
    <div class="class-list-action class-room-action">${action}</div>
  </article>`;
}

function bindClassRows(root) {
  hydrateClassCoverImages(root);
  const openClass = id => {
    state.selectedClassId = id;
    sessionStorage.setItem('kelasku_selected_class', state.selectedClassId);
    go('class');
  };
  const previewClass = id => {
    const item = (state.publicClasses?.items || []).find(x => String(x.class_id) === String(id));
    if (item) openJoinPreview(item, item.class_code || '');
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
  root.querySelectorAll('[data-public-join]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); previewClass(btn.dataset.publicJoin); };
  });
}

async function loadPublicClasses(force = false) {
  const slot = document.getElementById('public-class-list');
  if (!slot) return;
  if (!force && state.publicClasses?.items?.length) drawPublicClasses(state.publicClasses);
  try {
    const data = await api('listPublicClasses', { page: publicPage, limit: 30, query: publicQuery });
    state.publicClasses = data;
    if (publicPage === 1 && !publicQuery) { try { localStorage.setItem('kelasku_public_classes_cache', JSON.stringify(data)); } catch {} }
    drawPublicClasses(data);
  } catch (err) {
    if (!state.publicClasses?.items?.length) slot.innerHTML = `<div class="panel error-panel"><strong>Kelas umum gagal dimuat.</strong><p>${esc(err.message)}</p></div>`;
  }
}

function drawPublicClasses(data) {
  const slot = document.getElementById('public-class-list');
  const count = document.getElementById('public-class-count');
  const pager = document.getElementById('public-class-pager');
  if (!slot) return;
  const items = data.items || [];
  if (count) count.textContent = `${Number(data.total || items.length)} kelas PUBLIC`;
  slot.innerHTML = items.length
    ? items.map(c => classListRow(c, false)).join('')
    : '<div class="search-empty">Belum ada kelas umum.</div>';
  bindClassRows(slot);
  if (pager) {
    pager.innerHTML = `<button class="btn btn-secondary small-btn" id="public-prev" ${Number(data.page||1)<=1?'disabled':''}>${svg('i-back')} Sebelumnya</button><span>Halaman ${Number(data.page||1)}</span><button class="btn btn-secondary small-btn" id="public-next" ${data.has_more?'':'disabled'}>Berikutnya ${svg('i-arrow')}</button>`;
    document.getElementById('public-prev')?.addEventListener('click',()=>{publicPage=Math.max(1,publicPage-1);loadPublicClasses(true);});
    document.getElementById('public-next')?.addEventListener('click',()=>{publicPage+=1;loadPublicClasses(true);});
  }
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
  classSearchTimer=setTimeout(()=>runSearch(query),immediate?0:220);
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
  box.classList.remove('hidden');
  if(!box.querySelector('[data-search-class]'))box.innerHTML = '<div class="search-loading"><span class="status-dot"></span>Mencari kelas…</div>';
  try {
    const data = await api('searchClasses', { query });
    if(seq!==classSearchRequestSeq || String(input?.value||'').trim()!==query)return;
    const items = (data.items || []).slice(0,8);
    box.innerHTML = items.length ? items.map(searchCard).join('') : '<div class="search-empty">Kelas tidak ditemukan.</div>';
    bindSearchRows(box,items,query);
  } catch (err) {
    if(seq!==classSearchRequestSeq)return;
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
  return `<div class="join-preview panel join-preview-compact"><span class="class-symbol">${svg('i-class')}</span><div class="join-preview-copy"><h3>${esc(c.name)}</h3><p>${[c.institution||'',c.cohort?`Angkatan ${c.cohort}`:'',c.class_code||''].filter(Boolean).map(esc).join(' · ')}</p><div class="join-preview-kpis"><span class="visibility-badge visibility-${String(c.visibility||'PUBLIC').toLowerCase()}">${esc(c.visibility||'PUBLIC')}</span>${memberCount?`<span class="class-card-kpi"><span class="material-symbols-rounded">group</span>${memberCount}</span>`:''}</div></div></div>${viaJoin?'<div class="join-code-valid">'+svg('i-check')+' Join Code valid</div>':''}<div id="join-request-status" class="request-status ${waiting?'ok':''}">${waiting?'Permintaan bergabung sedang menunggu persetujuan.':''}</div><div class="join-preview-actions"><button id="confirm-join-btn" class="btn btn-primary" ${waiting?'disabled':''}>${waiting?'Menunggu Persetujuan':'Ajukan Bergabung'}</button><a class="btn btn-secondary" href="${esc(landingUrl)}"><span class="material-symbols-rounded">open_in_new</span> Landing Kelas</a></div>`;
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
  el.querySelectorAll('[data-close-modal]').forEach(x=>x.onclick=closeModal);
  el.onclick=e=>{ if(e.target===el) closeModal(); };
}
function closeModal(){ document.getElementById('phase-modal')?.remove(); }
function classSkeleton(){ return '<div class="panel fast-load-panel"><span class="status-dot"></span><div><strong>Menyiapkan daftar kelas…</strong><small>Cache kelas akan dipakai pada pembukaan berikutnya.</small></div></div>'; }

function roleLabel(role) {
  const key = String(role || 'MEMBER').toUpperCase();
  if (key === 'COORDINATOR') return 'Koordinator';
  if (key === 'OWNER') return 'Owner';
  if (key === 'MODERATOR') return 'Moderator';
  if (key === 'TEACHER') return 'Pengajar';
  if (key === 'OBSERVER') return 'Pengamat';
  return 'Member';
}
