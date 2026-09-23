import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, fmtDate } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { go } from '../core/router.js';

let overview = null;
let userQuery = { query:'', role:'ALL', status:'ALL', page:1, page_size:20 };
let classQuery = { query:'', visibility:'ALL', status:'ALL', page:1, page_size:20 };
let auditQuery = { query:'', entity_type:'ALL', page:1, page_size:20 };

export function renderAdmin() {
  const content = `
    <div class="page-head">
      <div><div class="eyebrow">08 • Super Admin</div><h1>Super Admin</h1><p>Pusat kendali KelasKu dibagi menjadi room agar tetap nyaman saat data tumbuh puluhan, ratusan, atau lebih.</p></div>
      <span class="phase-badge">SUPER ADMIN</span>
    </div>
    <div id="admin-slot">${adminSkeleton()}</div>`;

  document.getElementById('app').innerHTML = appShell({ active: 'admin', content, hideSearch: true });
  bindAppShell();
  loadAdminOverview();
}

async function loadAdminOverview() {
  try {
    overview = await api('getAdminOverview');
    drawAdminHub(overview);
  } catch (err) {
    document.getElementById('admin-slot').innerHTML = errorBox(err.message);
  }
}

function drawAdminHub(data) {
  const s = data.summary || {};
  const config = data.app_config || {};
  document.getElementById('admin-slot').innerHTML = `
    <section class="admin-summary-grid admin-summary-grid--hub">
      ${statCard('i-users', 'Total User', s.users || 0, `${s.active_users || 0} aktif`)}
      ${statCard('i-class', 'Total Kelas', s.classes || 0, `${s.active_classes || 0} aktif`)}
      ${statCard('i-key', 'Session Aktif', s.active_sessions || 0, 'Perangkat login')}
      ${statCard('i-bell', 'Join Request', s.pending_join_requests || 0, 'Menunggu keputusan')}
      ${statCard('i-shield', 'Audit Event', s.audit_events || 0, 'Riwayat aktivitas')}
    </section>

    <div class="section-title-row"><div><h2>Room Administrasi</h2><p>Buka hanya modul yang sedang dibutuhkan.</p></div></div>
    <section class="admin-room-grid">
      ${adminRoom('i-users','Pengguna & Akses','Cari, filter, ubah role, dan suspend akun dengan pagination.','admin-users',`${s.active_users || 0} user aktif`)}
      ${adminRoom('i-class','Kelas & Membership','Cari kelas, cek owner/member, visibility, dan status kelas.','admin-classes',`${s.active_classes || 0} kelas aktif`)}
      ${adminRoom('i-gear','Sistem & Release','Maintenance, minimum version, update, PWA config, dan status backend.','admin-system',`v${config.current_version || window.KELASKU_CONFIG.APP_VERSION}`)}
      ${adminRoom('i-shield','Audit & Aktivitas','Telusuri aktivitas admin, user, kelas, dan perubahan sistem.','admin-audit',`${s.audit_events || 0} event`)}
    </section>

    <section class="panel admin-health-strip">
      <div><strong>Admin Console v2.1</strong><span>Data besar tidak lagi ditampilkan dalam tabel kecil di halaman utama. Gunakan pencarian, filter, pagination, dan room khusus.</span></div>
      <button type="button" class="btn btn-secondary" data-route="admin-system">Cek Status Sistem</button>
    </section>`;

  bindAppShell();
}

export function renderAdminUsers() {
  const content = adminRoomShell('Pengguna & Akses','Kelola akun tanpa memuat seluruh user sekaligus.', 'i-users', `
    <section class="panel admin-data-panel">
      <div class="admin-toolbar">
        <div class="admin-search-wide">${svg('i-search')}<input id="admin-user-q" class="admin-toolbar-input" placeholder="Nama, username, KelasKu ID, institusi…" value="${esc(userQuery.query)}"></div>
        <select id="admin-user-role" class="control compact-control"><option value="ALL">Semua Role</option><option value="USER">USER</option><option value="SUPER_ADMIN">SUPER_ADMIN</option></select>
        <select id="admin-user-status" class="control compact-control"><option value="ALL">Semua Status</option><option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option></select>
        <button id="admin-user-search-btn" class="btn btn-primary" type="button">Cari</button>
      </div>
      <div id="admin-users-meta" class="admin-result-meta">Memuat data…</div>
      <div id="admin-users-list" class="admin-data-list">${loadingRow('Memuat user…')}</div>
      <div id="admin-users-pagination"></div>
    </section>`);

  document.getElementById('app').innerHTML = appShell({ active:'admin', content, hideSearch:true });
  bindAppShell();
  document.getElementById('admin-back').onclick = () => go('admin');
  document.getElementById('admin-user-role').value = userQuery.role;
  document.getElementById('admin-user-status').value = userQuery.status;
  document.getElementById('admin-user-search-btn').onclick = () => applyUserFilters();
  document.getElementById('admin-user-q').onkeydown = e => { if(e.key==='Enter'){ e.preventDefault(); applyUserFilters(); } };
  document.getElementById('admin-user-role').onchange = () => applyUserFilters();
  document.getElementById('admin-user-status').onchange = () => applyUserFilters();
  loadAdminUsers();
}

async function loadAdminUsers() {
  const list = document.getElementById('admin-users-list');
  list.innerHTML = loadingRow('Memuat user…');
  try {
    const data = await api('adminListUsers', userQuery);
    userQuery.page = data.page;
    document.getElementById('admin-users-meta').textContent = `${data.total} user • halaman ${data.page} dari ${data.total_pages}`;
    list.innerHTML = data.items.length ? data.items.map(userRow).join('') : emptyRow('User tidak ditemukan.');
    document.getElementById('admin-users-pagination').innerHTML = pagination(data, 'users');
    bindUserRows();
    bindPagination('users', data);
  } catch (err) {
    list.innerHTML = emptyRow(err.message);
  }
}

function applyUserFilters() {
  userQuery.query = document.getElementById('admin-user-q').value.trim();
  userQuery.role = document.getElementById('admin-user-role').value;
  userQuery.status = document.getElementById('admin-user-status').value;
  userQuery.page = 1;
  loadAdminUsers();
}

function bindUserRows() {
  document.querySelectorAll('[data-admin-save-user]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.adminSaveUser;
      const row = btn.closest('.admin-data-row');
      const role = row.querySelector('[data-admin-role]').value;
      const status = row.querySelector('[data-admin-status]').value;
      const old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-spinner"></span><span>Menyimpan…</span>';
      try {
        await api('adminUpdateUser', { user_id:id, global_role:role, account_status:status }, { onSlow:()=>toast('Masih memproses. Jangan klik dua kali.') });
        toast('User diperbarui.');
        await loadAdminUsers();
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = old;
      }
    };
  });
}

export function renderAdminClasses() {
  const content = adminRoomShell('Kelas & Membership','Kelola data kelas dengan pencarian, filter, dan pagination.', 'i-class', `
    <section class="panel admin-data-panel">
      <div class="admin-toolbar">
        <div class="admin-search-wide">${svg('i-search')}<input id="admin-class-q" class="admin-toolbar-input" placeholder="Nama, kode kelas, owner, institusi…" value="${esc(classQuery.query)}"></div>
        <select id="admin-class-visibility" class="control compact-control"><option value="ALL">Semua Visibility</option><option value="PUBLIC">PUBLIC</option><option value="DISCOVERABLE">DISCOVERABLE</option><option value="PRIVATE">PRIVATE</option></select>
        <select id="admin-class-status" class="control compact-control"><option value="ALL">Semua Status</option><option value="ACTIVE">ACTIVE</option><option value="ARCHIVED">ARCHIVED</option></select>
        <button id="admin-class-search-btn" class="btn btn-primary" type="button">Cari</button>
      </div>
      <div id="admin-classes-meta" class="admin-result-meta">Memuat data…</div>
      <div id="admin-classes-list" class="admin-data-list">${loadingRow('Memuat kelas…')}</div>
      <div id="admin-classes-pagination"></div>
    </section>`);

  document.getElementById('app').innerHTML = appShell({ active:'admin', content, hideSearch:true });
  bindAppShell();
  document.getElementById('admin-back').onclick = () => go('admin');
  document.getElementById('admin-class-visibility').value = classQuery.visibility;
  document.getElementById('admin-class-status').value = classQuery.status;
  document.getElementById('admin-class-search-btn').onclick = () => applyClassFilters();
  document.getElementById('admin-class-q').onkeydown = e => { if(e.key==='Enter'){ e.preventDefault(); applyClassFilters(); } };
  document.getElementById('admin-class-visibility').onchange = () => applyClassFilters();
  document.getElementById('admin-class-status').onchange = () => applyClassFilters();
  loadAdminClasses();
}

async function loadAdminClasses() {
  const list = document.getElementById('admin-classes-list');
  list.innerHTML = loadingRow('Memuat kelas…');
  try {
    const data = await api('adminListClasses', classQuery);
    classQuery.page = data.page;
    document.getElementById('admin-classes-meta').textContent = `${data.total} kelas • halaman ${data.page} dari ${data.total_pages}`;
    list.innerHTML = data.items.length ? data.items.map(classRow).join('') : emptyRow('Kelas tidak ditemukan.');
    document.getElementById('admin-classes-pagination').innerHTML = pagination(data, 'classes');
    bindClassRows();
    bindPagination('classes', data);
  } catch (err) {
    list.innerHTML = emptyRow(err.message);
  }
}

function applyClassFilters() {
  classQuery.query = document.getElementById('admin-class-q').value.trim();
  classQuery.visibility = document.getElementById('admin-class-visibility').value;
  classQuery.status = document.getElementById('admin-class-status').value;
  classQuery.page = 1;
  loadAdminClasses();
}

function bindClassRows() {
  document.querySelectorAll('[data-admin-save-class]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.adminSaveClass;
      const row = btn.closest('.admin-data-row');
      const visibility = row.querySelector('[data-admin-visibility]').value;
      const status = row.querySelector('[data-admin-class-status]').value;
      const old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-spinner"></span><span>Menyimpan…</span>';
      try {
        await api('adminUpdateClass', { class_id:id, visibility, status });
        toast('Kelas diperbarui.');
        await loadAdminClasses();
      } catch(err) { toast(err.message); }
      finally { btn.disabled=false; btn.innerHTML=old; }
    };
  });
}

export function renderAdminSystem() {
  const content = adminRoomShell('Sistem & Release','Konfigurasi operasional, status backend, dan riwayat release.', 'i-gear', `<div id="admin-system-slot">${loadingRow('Memuat status sistem…')}</div>`);
  document.getElementById('app').innerHTML = appShell({ active:'admin', content, hideSearch:true });
  bindAppShell();
  document.getElementById('admin-back').onclick = () => go('admin');
  loadAdminSystem();
}

async function loadAdminSystem() {
  const slot = document.getElementById('admin-system-slot');
  try {
    const data = await api('adminGetSystemStatus');
    drawAdminSystem(data);
  } catch(err) { slot.innerHTML = errorBox(err.message); }
}

function drawAdminSystem(data) {
  const config = data.app_config || {};
  document.getElementById('admin-system-slot').innerHTML = `
    <section class="admin-system-grid">
      ${systemStatusCard('Backend', data.database, 'Spreadsheet database')}
      ${systemStatusCard('Storage', data.storage, 'Google Drive storage')}
      ${systemStatusCard('Backend Version', `v${data.version}`, `Build ${data.build}`)}
      ${systemStatusCard('Schema', `v${data.schema_version}`, 'Database schema')}
    </section>

    <form id="admin-config-form" class="panel admin-section admin-config-section">
      <div class="panel-head"><div><div class="panel-title">Konfigurasi Operasional</div><p class="panel-copy">Perubahan ini memengaruhi seluruh pengguna aplikasi.</p></div>${svg('i-gear')}</div>
      <div class="admin-config-grid">
        ${inputField('Minimum Version','min_version',config.min_version || '')}
        ${inputField('Onboarding Version','onboarding_version',config.onboarding_version || 1,'number')}
        ${inputField('Notification Poll (ms)','notification_poll_ms',config.notification_poll_ms || 60000,'number')}
        ${inputField('Max Upload (MB)','max_upload_mb',config.max_upload_mb || 10,'number')}
        ${selectField('Release Channel','release_channel',config.release_channel || 'stable',[['stable','Stable'],['beta','Beta'],['dev','Development']])}
        ${toggleConfig('Force Update','update_required',config.update_required,'Paksa user versi lama melakukan update.')}
        ${toggleConfig('Maintenance','maintenance',config.maintenance,'Tandai aplikasi sedang maintenance.')}
        <label class="field admin-note-field"><span>Release Note</span><textarea class="control" name="release_note" rows="4">${esc(config.release_note || '')}</textarea></label>
      </div>
      <div class="admin-config-footer"><span id="admin-config-status">Simpan hanya setelah konfigurasi diperiksa.</span><button id="admin-config-save" class="btn btn-primary" type="submit">Simpan Konfigurasi</button></div>
    </form>

    <section class="panel admin-section admin-release-panel">
      <div class="panel-head"><div><div class="panel-title">10 Release Terakhir</div><p class="panel-copy">Riwayat versi dari APP_RELEASES.</p></div>${svg('i-refresh')}</div>
      <div class="admin-release-list">${(data.releases || []).length ? data.releases.map(releaseRow).join('') : emptyRow('Belum ada release.')}</div>
    </section>`;
  document.getElementById('admin-config-form').onsubmit = saveConfig;
}

export function renderAdminAudit() {
  const content = adminRoomShell('Audit & Aktivitas','Cari riwayat perubahan tanpa membuka Spreadsheet secara manual.', 'i-shield', `
    <section class="panel admin-data-panel">
      <div class="admin-toolbar admin-toolbar--audit">
        <div class="admin-search-wide">${svg('i-search')}<input id="admin-audit-q" class="admin-toolbar-input" placeholder="Action, user, entity, detail…" value="${esc(auditQuery.query)}"></div>
        <select id="admin-audit-entity" class="control compact-control"><option value="ALL">Semua Entity</option><option value="USER">USER</option><option value="CLASS">CLASS</option><option value="SYSTEM">SYSTEM</option></select>
        <button id="admin-audit-search-btn" class="btn btn-primary" type="button">Cari</button>
      </div>
      <div id="admin-audit-meta" class="admin-result-meta">Memuat data…</div>
      <div id="admin-audit-list" class="admin-audit-list">${loadingRow('Memuat audit log…')}</div>
      <div id="admin-audit-pagination"></div>
    </section>`);
  document.getElementById('app').innerHTML = appShell({ active:'admin', content, hideSearch:true });
  bindAppShell();
  document.getElementById('admin-back').onclick = () => go('admin');
  document.getElementById('admin-audit-entity').value = auditQuery.entity_type;
  document.getElementById('admin-audit-search-btn').onclick = applyAuditFilters;
  document.getElementById('admin-audit-q').onkeydown = e => { if(e.key==='Enter'){ e.preventDefault(); applyAuditFilters(); } };
  document.getElementById('admin-audit-entity').onchange = applyAuditFilters;
  loadAdminAudit();
}

async function loadAdminAudit() {
  const list = document.getElementById('admin-audit-list');
  list.innerHTML = loadingRow('Memuat audit log…');
  try {
    const data = await api('adminListAudit', auditQuery);
    auditQuery.page = data.page;
    document.getElementById('admin-audit-meta').textContent = `${data.total} event • halaman ${data.page} dari ${data.total_pages}`;
    list.innerHTML = data.items.length ? data.items.map(auditRow).join('') : emptyRow('Audit log tidak ditemukan.');
    document.getElementById('admin-audit-pagination').innerHTML = pagination(data,'audit');
    bindPagination('audit',data);
  } catch(err) { list.innerHTML = emptyRow(err.message); }
}

function applyAuditFilters() {
  auditQuery.query = document.getElementById('admin-audit-q').value.trim();
  auditQuery.entity_type = document.getElementById('admin-audit-entity').value;
  auditQuery.page = 1;
  loadAdminAudit();
}

function bindPagination(type, data) {
  document.querySelectorAll(`[data-page-type="${type}"]`).forEach(btn => {
    btn.onclick = () => {
      const next = Number(btn.dataset.page || 1);
      if (type === 'users') { userQuery.page = next; loadAdminUsers(); }
      if (type === 'classes') { classQuery.page = next; loadAdminClasses(); }
      if (type === 'audit') { auditQuery.page = next; loadAdminAudit(); }
    };
  });
}

async function saveConfig(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const btn = document.getElementById('admin-config-save');
  const status = document.getElementById('admin-config-status');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span><span>Menyimpan…</span>';
  status.textContent = 'Menyimpan konfigurasi sekaligus…';

  const values = {
    MIN_VERSION: form.min_version.value,
    UPDATE_REQUIRED: form.update_required.checked,
    MAINTENANCE: form.maintenance.checked,
    ONBOARDING_VERSION: Number(form.onboarding_version.value || 1),
    RELEASE_CHANNEL: form.release_channel.value,
    RELEASE_NOTE: form.release_note.value,
    NOTIFICATION_POLL_MS: Number(form.notification_poll_ms.value || 60000),
    MAX_UPLOAD_MB: Number(form.max_upload_mb.value || 10)
  };

  try {
    const data = await api('adminUpdateAppConfig', { values }, { onSlow: () => status.textContent = 'Masih diproses. Jangan klik dua kali.' });
    state.remoteConfig = data.config;
    localStorage.setItem('kelasku_app_config_cache', JSON.stringify(data.config));
    status.textContent = 'Konfigurasi tersimpan ✓';
    toast('Konfigurasi aplikasi diperbarui.');
  } catch (err) { status.textContent = err.message; }
  finally { btn.disabled = false; btn.innerHTML = old; }
}

function adminRoomShell(title, copy, icon, body) {
  return `<div class="page-head"><div><div class="eyebrow">Super Admin • Room</div><h1>${esc(title)}</h1><p>${esc(copy)}</p></div><button type="button" id="admin-back" class="btn btn-secondary">${svg('i-back')} Admin Home</button></div><div class="admin-room-heading">${svg(icon)}<span>${esc(title)}</span></div>${body}`;
}
function adminRoom(icon,title,copy,route,meta) {
  return `<button type="button" class="admin-room-card" data-route="${esc(route)}"><span class="admin-room-icon">${svg(icon)}</span><span class="admin-room-body"><strong>${esc(title)}</strong><small>${esc(copy)}</small><b>${esc(meta)}</b></span>${svg('i-arrow')}</button>`;
}
function statCard(icon,label,value,help='') {
  return `<div class="panel admin-stat-card"><span class="admin-stat-icon">${svg(icon)}</span><div><strong>${esc(value)}</strong><span>${esc(label)}</span>${help?`<small>${esc(help)}</small>`:''}</div></div>`;
}
function userRow(u) {
  return `<div class="admin-data-row admin-user-data-row">
    <div class="member-avatar">${initials(u.full_name || u.username)}</div>
    <div class="admin-data-main"><strong>${esc(u.full_name || u.username)}</strong><span>@${esc(u.username)} · ${esc(u.kelasku_id)}</span><small>${esc(u.institution || '-')}${u.study_program ? ' · '+esc(u.study_program) : ''}</small></div>
    <div class="admin-data-meta"><span>Dibuat</span><strong>${esc(shortDate(u.created_at))}</strong></div>
    <div class="admin-data-controls"><select class="control compact-control" data-admin-role><option value="USER" ${u.global_role==='USER'?'selected':''}>USER</option><option value="SUPER_ADMIN" ${u.global_role==='SUPER_ADMIN'?'selected':''}>SUPER_ADMIN</option></select><select class="control compact-control" data-admin-status><option value="ACTIVE" ${u.account_status==='ACTIVE'?'selected':''}>ACTIVE</option><option value="SUSPENDED" ${u.account_status==='SUSPENDED'?'selected':''}>SUSPENDED</option></select><button type="button" class="btn btn-secondary small-btn" data-admin-save-user="${esc(u.user_id)}">Simpan</button></div>
  </div>`;
}
function classRow(c) {
  return `<div class="admin-data-row admin-class-data-row">
    <span class="class-symbol small">${svg('i-class')}</span>
    <div class="admin-data-main"><strong>${esc(c.name || '-')}</strong><span>${esc(c.class_code || '')} · ${esc(c.institution || 'KelasKu')}</span><small>Owner: ${esc(c.owner_name || '-')} · ${esc(c.member_count || 0)} member</small></div>
    <div class="admin-data-meta"><span>Dibuat</span><strong>${esc(shortDate(c.created_at))}</strong></div>
    <div class="admin-data-controls"><select class="control compact-control" data-admin-visibility><option value="PUBLIC" ${c.visibility==='PUBLIC'?'selected':''}>PUBLIC</option><option value="DISCOVERABLE" ${c.visibility==='DISCOVERABLE'?'selected':''}>DISCOVERABLE</option><option value="PRIVATE" ${c.visibility==='PRIVATE'?'selected':''}>PRIVATE</option></select><select class="control compact-control" data-admin-class-status><option value="ACTIVE" ${c.status==='ACTIVE'?'selected':''}>ACTIVE</option><option value="ARCHIVED" ${c.status==='ARCHIVED'?'selected':''}>ARCHIVED</option></select><button type="button" class="btn btn-secondary small-btn" data-admin-save-class="${esc(c.class_id)}">Simpan</button></div>
  </div>`;
}
function auditRow(a) {
  return `<article class="admin-audit-row"><span class="admin-audit-icon">${svg(a.entity_type==='CLASS'?'i-class':a.entity_type==='USER'?'i-user':'i-shield')}</span><div><strong>${esc(a.action || 'ACTIVITY')}</strong><span>${esc(a.actor_name || 'SYSTEM')}${a.actor_username?` · @${esc(a.actor_username)}`:''}</span><small>${esc(a.entity_type || '-')} · ${esc(a.entity_id || '-')} · ${esc(a.detail || '')}</small></div><time>${esc(fmtDate(a.created_at))}</time></article>`;
}
function pagination(data,type) {
  if (data.total_pages <= 1) return '';
  return `<div class="admin-pagination"><button type="button" class="btn btn-secondary" data-page-type="${type}" data-page="${Math.max(1,data.page-1)}" ${data.has_prev?'':'disabled'}>Sebelumnya</button><span>Halaman <strong>${data.page}</strong> / ${data.total_pages}</span><button type="button" class="btn btn-secondary" data-page-type="${type}" data-page="${Math.min(data.total_pages,data.page+1)}" ${data.has_next?'':'disabled'}>Berikutnya</button></div>`;
}
function systemStatusCard(label,value,help){ const ok=String(value).toLowerCase()==='online'||String(value).startsWith('v'); return `<div class="panel admin-system-card"><span class="system-dot ${ok?'is-ok':''}"></span><div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(help)}</small></div></div>`; }
function releaseRow(r){ return `<div class="admin-release-row"><div><strong>v${esc(r.version || '-')}</strong><span>${esc(r.type || 'RELEASE')}</span></div><div><span>Build ${esc(r.build || '-')}</span><small>${esc(r.release_note || '')}</small></div><time>${esc(shortDate(r.release_date || r.created_at))}</time></div>`; }
function inputField(label,name,value,type='text'){ return `<label class="field"><span>${esc(label)}</span><input class="control" type="${type}" name="${esc(name)}" value="${esc(value)}"></label>`; }
function selectField(label,name,value,options){ return `<label class="field"><span>${esc(label)}</span><select class="control" name="${esc(name)}">${options.map(o=>`<option value="${esc(o[0])}" ${String(value)===o[0]?'selected':''}>${esc(o[1])}</option>`).join('')}</select></label>`; }
function toggleConfig(label,name,value,help){ return `<label class="admin-toggle-field"><span><strong>${esc(label)}</strong><small>${esc(help)}</small></span><span class="switch"><input name="${esc(name)}" type="checkbox" ${truthy(value)?'checked':''}><span></span></span></label>`; }
function loadingRow(text){ return `<div class="search-loading"><span class="status-dot"></span>${esc(text)}</div>`; }
function emptyRow(text){ return `<div class="search-empty">${esc(text)}</div>`; }
function initials(name){ return String(name || 'K').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase() || 'K'; }
function truthy(v){ return v===true || String(v).toUpperCase()==='TRUE' || String(v)==='1'; }
function shortDate(value){ try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium'}).format(new Date(value));}catch{return value||'-';} }
function adminSkeleton(){ return `<div class="admin-summary-grid admin-summary-grid--hub">${[1,2,3,4,5].map(()=>'<div class="panel skeleton" style="height:92px"></div>').join('')}</div><div class="admin-room-grid">${[1,2,3,4].map(()=>'<div class="panel skeleton" style="height:170px"></div>').join('')}</div>`; }
function errorBox(msg){ return `<div class="panel error-panel"><strong>Admin Console gagal dimuat.</strong><p>${esc(msg)}</p><button class="btn btn-secondary" onclick="location.reload()">Coba Lagi</button></div>`; }
