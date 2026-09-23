import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';

let adminData = null;

export function renderAdmin() {
  const content = `
    <div class="page-head">
      <div>
        <div class="eyebrow">08 • Super Admin</div>
        <h1>Admin Console</h1>
        <p>Kontrol aplikasi, user, kelas, dan konfigurasi sistem dari satu tempat.</p>
      </div>
      <span class="phase-badge">SUPER ADMIN</span>
    </div>
    <div id="admin-slot">${adminSkeleton()}</div>`;

  document.getElementById('app').innerHTML = appShell({ active: 'admin', content, searchPlaceholder: 'Cari user atau kelas…' });
  bindAppShell({ onSearch: () => document.getElementById('admin-user-search')?.focus() });
  loadAdmin();
}

async function loadAdmin() {
  try {
    adminData = await api('getAdminOverview');
    drawAdmin(adminData);
  } catch (err) {
    document.getElementById('admin-slot').innerHTML = errorBox(err.message);
  }
}

function drawAdmin(data) {
  const s = data.summary || {};
  const config = data.app_config || {};
  document.getElementById('admin-slot').innerHTML = `
    <section class="admin-summary-grid">
      ${statCard('i-users', 'User Aktif', s.users || 0)}
      ${statCard('i-shield', 'Super Admin', s.super_admins || 0)}
      ${statCard('i-class', 'Kelas Aktif', s.classes || 0)}
      ${statCard('i-key', 'Session Aktif', s.active_sessions || 0)}
      ${statCard('i-bell', 'Join Request', s.pending_join_requests || 0)}
    </section>

    <div class="admin-layout">
      <section class="panel admin-section">
        <div class="panel-head">
          <div><div class="panel-title">Kelola User</div><p class="panel-copy">Cari melalui nama, username, atau KelasKu ID.</p></div>
          ${svg('i-users')}
        </div>
        <div class="admin-search-row">
          <input id="admin-user-search" class="control" placeholder="Cari user…" autocomplete="off">
          <button id="admin-user-search-btn" class="btn btn-secondary">Cari</button>
        </div>
        <div id="admin-user-results" class="admin-results">${recentUsers(data.recent_users || [])}</div>
      </section>

      <section class="panel admin-section">
        <div class="panel-head">
          <div><div class="panel-title">Kelola Kelas</div><p class="panel-copy">Cari kelas dan cek owner, kode, serta status.</p></div>
          ${svg('i-class')}
        </div>
        <div class="admin-search-row">
          <input id="admin-class-search" class="control" placeholder="Cari kelas / Class Code…" autocomplete="off">
          <button id="admin-class-search-btn" class="btn btn-secondary">Cari</button>
        </div>
        <div id="admin-class-results" class="admin-results">${recentClasses(data.recent_classes || [])}</div>
      </section>
    </div>

    <form id="admin-config-form" class="panel admin-section admin-config-section">
      <div class="panel-head">
        <div><div class="panel-title">App Configuration</div><p class="panel-copy">Mengubah konfigurasi operasional tanpa edit Apps Script.</p></div>
        ${svg('i-gear')}
      </div>
      <div class="admin-config-grid">
        ${inputField('Minimum Version', 'min_version', config.min_version || '')}
        ${inputField('Onboarding Version', 'onboarding_version', config.onboarding_version || 1, 'number')}
        ${inputField('Notification Poll (ms)', 'notification_poll_ms', config.notification_poll_ms || 60000, 'number')}
        ${inputField('Max Upload (MB)', 'max_upload_mb', config.max_upload_mb || 10, 'number')}
        ${selectField('Release Channel', 'release_channel', config.release_channel || 'stable', [['stable','Stable'],['beta','Beta'],['dev','Development']])}
        <label class="admin-toggle-field"><span><strong>Force Update</strong><small>Paksa user update aplikasi.</small></span><span class="switch"><input name="update_required" type="checkbox" ${truthy(config.update_required)?'checked':''}><span></span></span></label>
        <label class="admin-toggle-field"><span><strong>Maintenance</strong><small>Tandai sistem sedang maintenance.</small></span><span class="switch"><input name="maintenance" type="checkbox" ${truthy(config.maintenance)?'checked':''}><span></span></span></label>
        <label class="field admin-note-field"><span>Release Note</span><textarea class="control" name="release_note" rows="3">${esc(config.release_note || '')}</textarea></label>
      </div>
      <div class="admin-config-footer">
        <span id="admin-config-status">Perubahan dikirim satu kali ke backend.</span>
        <button id="admin-config-save" class="btn btn-primary" type="submit">Simpan Konfigurasi</button>
      </div>
    </form>`;

  bindAdmin();
}

function bindAdmin() {
  const userInput = document.getElementById('admin-user-search');
  const classInput = document.getElementById('admin-class-search');
  document.getElementById('admin-user-search-btn').onclick = () => searchUsers(userInput.value);
  document.getElementById('admin-class-search-btn').onclick = () => searchClasses(classInput.value);
  userInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); searchUsers(userInput.value); } };
  classInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); searchClasses(classInput.value); } };
  document.getElementById('admin-config-form').onsubmit = saveConfig;
  bindUserRows();
}

async function searchUsers(query) {
  const slot = document.getElementById('admin-user-results');
  slot.innerHTML = loadingRow('Mencari user…');
  try {
    const data = await api('adminSearchUsers', { query: String(query || '').trim() });
    slot.innerHTML = (data.items || []).length ? userRows(data.items) : emptyRow('User tidak ditemukan.');
    bindUserRows();
  } catch (err) { slot.innerHTML = emptyRow(err.message); }
}

async function searchClasses(query) {
  const slot = document.getElementById('admin-class-results');
  slot.innerHTML = loadingRow('Mencari kelas…');
  try {
    const data = await api('adminSearchClasses', { query: String(query || '').trim() });
    slot.innerHTML = (data.items || []).length ? classRows(data.items) : emptyRow('Kelas tidak ditemukan.');
  } catch (err) { slot.innerHTML = emptyRow(err.message); }
}

function bindUserRows() {
  document.querySelectorAll('[data-admin-save-user]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.adminSaveUser;
      const row = btn.closest('.admin-user-row');
      const role = row.querySelector('[data-admin-role]').value;
      const status = row.querySelector('[data-admin-status]').value;
      const old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-spinner"></span>';
      try {
        await api('adminUpdateUser', { user_id: id, global_role: role, account_status: status }, { onSlow: () => toast('Masih memproses. Jangan klik dua kali.') });
        toast('User diperbarui.');
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = old;
      }
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
  } catch (err) {
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

function statCard(icon, label, value) {
  return `<div class="panel admin-stat-card"><span class="admin-stat-icon">${svg(icon)}</span><div><strong>${esc(value)}</strong><span>${esc(label)}</span></div></div>`;
}
function recentUsers(items) { return items.length ? `<div class="admin-caption">User terbaru</div>${userRows(items)}` : emptyRow('Belum ada user.'); }
function recentClasses(items) { return items.length ? `<div class="admin-caption">Kelas terbaru</div>${classRows(items)}` : emptyRow('Belum ada kelas.'); }
function userRows(items) { return items.map(userRow).join(''); }
function userRow(u) {
  return `<div class="admin-user-row">
    <div class="member-avatar">${initials(u.full_name || u.username)}</div>
    <div class="admin-user-main"><strong>${esc(u.full_name || u.username)}</strong><span>@${esc(u.username)} · ${esc(u.kelasku_id)}</span><small>${esc(u.institution || '')}${u.study_program ? ' · ' + esc(u.study_program) : ''}</small></div>
    <select class="control compact-control" data-admin-role><option value="USER" ${u.global_role==='USER'?'selected':''}>USER</option><option value="SUPER_ADMIN" ${u.global_role==='SUPER_ADMIN'?'selected':''}>SUPER_ADMIN</option></select>
    <select class="control compact-control" data-admin-status><option value="ACTIVE" ${u.account_status==='ACTIVE'?'selected':''}>ACTIVE</option><option value="SUSPENDED" ${u.account_status==='SUSPENDED'?'selected':''}>SUSPENDED</option></select>
    <button type="button" class="icon-btn mini" data-admin-save-user="${esc(u.user_id)}" title="Simpan">${svg('i-check')}</button>
  </div>`;
}
function classRows(items) { return items.map(c => `<div class="admin-class-row"><span class="class-symbol small">${svg('i-class')}</span><div><strong>${esc(c.name)}</strong><span>${esc(c.class_code || '')} · ${esc(c.institution || 'KelasKu')}</span></div><span class="soft-chip">${esc(c.visibility || 'DISCOVERABLE')}</span></div>`).join(''); }
function inputField(label, name, value, type='text') { return `<label class="field"><span>${esc(label)}</span><input class="control" type="${type}" name="${esc(name)}" value="${esc(value)}"></label>`; }
function selectField(label, name, value, options) { return `<label class="field"><span>${esc(label)}</span><select class="control" name="${esc(name)}">${options.map(o=>`<option value="${esc(o[0])}" ${String(value)===o[0]?'selected':''}>${esc(o[1])}</option>`).join('')}</select></label>`; }
function loadingRow(text) { return `<div class="search-loading"><span class="status-dot"></span>${esc(text)}</div>`; }
function emptyRow(text) { return `<div class="search-empty">${esc(text)}</div>`; }
function initials(name) { return String(name || 'K').trim().split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase() || 'K'; }
function truthy(v) { return v === true || String(v).toUpperCase() === 'TRUE' || String(v) === '1'; }
function adminSkeleton() { return `<div class="admin-summary-grid">${[1,2,3,4,5].map(()=>'<div class="panel skeleton" style="height:92px"></div>').join('')}</div><div class="admin-layout"><div class="panel skeleton" style="height:350px"></div><div class="panel skeleton" style="height:350px"></div></div>`; }
function errorBox(msg) { return `<div class="panel error-panel"><strong>Admin Console gagal dimuat.</strong><p>${esc(msg)}</p><button class="btn btn-secondary" onclick="location.reload()">Coba Lagi</button></div>`; }
