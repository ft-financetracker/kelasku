import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, sameData } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { go } from '../core/router.js';

let publicPage = 1;
let publicQuery = '';
let myClassesInFlight = null;
const MY_CLASSES_TTL_MS = 60 * 1000;

export function renderClasses() {
  const content = `
    <div class="page-head">
      <div><div class="eyebrow">KELASKU • RUANG BELAJAR</div><h1>Daftar Kelas</h1><p>Kelas yang kamu ikuti dan kelas umum yang dapat ditemukan langsung.</p></div>
      <div class="page-actions"><button id="join-code-btn" class="btn btn-secondary">${svg('i-key')} Masuk dengan Kode</button><button id="create-class-btn" class="btn btn-primary">${svg('i-plus')} Buat Kelas</button></div>
    </div>

    <section class="class-search panel">
      <div class="class-search-box">${svg('i-search')}<input id="class-search-input" placeholder="Cari nama kelas, Class Code, institusi…" autocomplete="off"><button id="class-search-btn" class="btn btn-secondary">Cari</button></div>
      <div id="class-search-results" class="search-results hidden"></div>
    </section>

    <section class="class-list-section">
      <div class="section-title-row"><div><h2>Kelas Saya</h2><p id="class-count">Memuat kelas…</p></div></div>
      <div id="class-grid" class="class-table-shell">${classSkeleton()}</div>
    </section>

    <section class="class-list-section public-class-section">
      <div class="section-title-row"><div><h2>Kelas Umum</h2><p id="public-class-count">Kelas PUBLIC yang dapat dijelajahi.</p></div><button id="public-class-refresh" class="btn btn-secondary small-btn">${svg('i-refresh')} Refresh</button></div>
      <div id="public-class-list" class="class-table-shell">${classSkeleton()}</div>
      <div class="class-public-pager" id="public-class-pager"></div>
    </section>`;

  document.getElementById('app').innerHTML = appShell({ active: 'classes', content, searchPlaceholder: 'Cari kelas, kode kelas, atau teman…' });
  bindAppShell({ onSearch: () => document.getElementById('class-search-input')?.focus() });

  document.getElementById('create-class-btn').onclick = openCreateClass;
  document.getElementById('join-code-btn').onclick = openJoinCode;
  document.getElementById('class-search-btn').onclick = runSearch;
  document.getElementById('class-search-input').onkeydown = e => { if (e.key === 'Enter') runSearch(); };
  document.getElementById('public-class-refresh').onclick = () => loadPublicClasses(true);

  if (Array.isArray(state.myClasses) && state.myClasses.length) drawMyClasses(state.myClasses);
  loadMyClasses();
  loadPublicClasses(false);
}
export async function prefetchMyClasses() {
  return loadMyClasses(true);
}
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

  grid.innerHTML = `<div class="class-table-head"><span>Kelas</span><span>Peran</span><span>Visibilitas</span><span></span></div>${items.map(c => classListRow(c, true)).join('')}`;
  bindClassRows(grid);
}

function classListRow(c, mine = false) {
  const leader = c.is_class_leader ? '<span class="role-pill leader-role-pill">Ketua Kelas</span>' : '';
  const action = mine || c.is_member
    ? `<button type="button" class="class-row-action" data-open-class="${esc(c.class_id)}">${svg('i-arrow')}<span>Buka</span></button>`
    : `<button type="button" class="class-row-action join" data-public-join="${esc(c.class_id)}">${svg('i-plus')}<span>Gabung</span></button>`;
  return `<article class="class-list-row">
    <div class="class-list-identity"><span class="class-symbol small">${svg('i-class')}</span><div class="class-list-copy"><small class="class-list-subtitle">${esc(c.institution || 'KelasKu')}${c.cohort ? ' · Angkatan ' + esc(c.cohort) : ''}</small><strong>${esc(c.name)}</strong><span class="class-code-inline">${esc(c.class_code || '')}</span></div></div>
    <div class="class-list-role">${c.role ? `<span class="role-pill role-${String(c.role||'member').toLowerCase()}">${esc(roleLabel(c.role))}</span>` : '<span class="soft-chip">Umum</span>'}${leader}</div>
    <div class="class-list-visibility"><span class="visibility-badge visibility-${String(c.visibility||'PUBLIC').toLowerCase()}">${esc(c.visibility || 'PUBLIC')}</span>${Number(c.member_count || 0) ? `<small>${Number(c.member_count)} anggota</small>` : ''}</div>
    <div class="class-list-action">${action}</div>
  </article>`;
}

function bindClassRows(root) {
  root.querySelectorAll('[data-open-class]').forEach(el => {
    el.onclick = () => {
      state.selectedClassId = el.dataset.openClass;
      sessionStorage.setItem('kelasku_selected_class', state.selectedClassId);
      go('class');
    };
  });
  root.querySelectorAll('[data-public-join]').forEach(btn => {
    btn.onclick = () => {
      const item = (state.publicClasses?.items || []).find(x => String(x.class_id) === String(btn.dataset.publicJoin));
      if (item) openJoinPreview(item, item.class_code || '');
    };
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
    ? `<div class="class-table-head"><span>Kelas</span><span>Status</span><span>Anggota</span><span></span></div>${items.map(c => classListRow(c, false)).join('')}`
    : '<div class="search-empty">Belum ada kelas umum.</div>';
  bindClassRows(slot);
  if (pager) {
    pager.innerHTML = `<button class="btn btn-secondary small-btn" id="public-prev" ${Number(data.page||1)<=1?'disabled':''}>${svg('i-back')} Sebelumnya</button><span>Halaman ${Number(data.page||1)}</span><button class="btn btn-secondary small-btn" id="public-next" ${data.has_more?'':'disabled'}>Berikutnya ${svg('i-arrow')}</button>`;
    document.getElementById('public-prev')?.addEventListener('click',()=>{publicPage=Math.max(1,publicPage-1);loadPublicClasses(true);});
    document.getElementById('public-next')?.addEventListener('click',()=>{publicPage+=1;loadPublicClasses(true);});
  }
}

async function runSearch() {
  const input = document.getElementById('class-search-input');
  const box = document.getElementById('class-search-results');
  const query = input.value.trim();
  if (query.length < 2) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = '<div class="search-loading"><span class="status-dot"></span>Mencari kelas…</div>';
  try {
    const data = await api('searchClasses', { query });
    const items = data.items || [];
    box.innerHTML = items.length ? items.map(searchCard).join('') : '<div class="search-empty">Kelas tidak ditemukan.</div>';
    box.querySelectorAll('[data-search-class]').forEach(btn => btn.onclick = () => selectSearchClass(items.find(x => x.class_id === btn.dataset.searchClass), query));
  } catch (err) {
    box.innerHTML = `<div class="search-empty">${esc(err.message)}</div>`;
  }
}

function searchCard(c) {
  return `<button type="button" class="search-class-row" data-search-class="${esc(c.class_id)}"><span class="status-icon">${svg('i-class')}</span><span><strong>${esc(c.name)}</strong><small>${esc(c.class_code || '')} · ${esc(c.institution || '')}</small></span><b>${c.role ? esc(roleLabel(c.role)) : 'Lihat'}</b></button>`;
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
  showModal(`<div class="modal-head"><div><div class="eyebrow">Gabung Kelas</div><h2>${esc(c.name)}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>${joinPreviewHtml(c, effectiveCode)}`);
  document.getElementById('confirm-join-btn').onclick = () => submitJoin(c, effectiveCode);
}

function joinPreviewHtml(c, code) {
  const viaJoin = String(c.match_type || '').toUpperCase() === 'JOIN_CODE' || (code && code.toUpperCase() !== String(c.class_code || '').toUpperCase());
  const waiting = String(c.membership_status || '').toUpperCase() === 'PENDING';
  return `<div class="join-preview panel"><span class="class-symbol">${svg('i-class')}</span><div><h3>${esc(c.name)}</h3><p>${esc(c.institution || '')} ${c.cohort?'· '+esc(c.cohort):''}</p><small>${esc(c.class_code || '')} · ${esc(c.visibility || '')}</small></div></div>${viaJoin?'<div class="join-code-valid">'+svg('i-check')+' Join Code valid</div>':''}<div id="join-request-status" class="request-status ${waiting?'ok':''}">${waiting?'Permintaan bergabung sedang menunggu persetujuan.':''}</div><button id="confirm-join-btn" class="btn btn-primary btn-block" ${waiting?'disabled':''}>${waiting?'Menunggu Persetujuan':'Ajukan Bergabung'}</button>`;
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
  if (key === 'COORDINATOR') return 'Ketua Kelas';
  if (key === 'OWNER') return 'Owner';
  if (key === 'MODERATOR') return 'Moderator';
  return 'Member';
}
