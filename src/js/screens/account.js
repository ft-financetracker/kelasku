import { state, clearSession } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { go } from '../core/router.js';

export function renderAccount() {
  const u = state.user || {};
  const content = `
    <div class="page-head">
      <div><div class="eyebrow">Profil</div><h1>Profil Saya</h1><p>Identitas akun yang digunakan di seluruh ekosistem KelasKu.</p></div>
      <div class="page-actions"><button id="edit-profile" class="btn btn-secondary">Edit Profil</button><button id="account-settings" class="btn btn-primary">Pengaturan</button></div>
    </div>

    <section class="profile-card panel">
      <div class="profile-avatar">${initials(u.full_name || u.username)}</div>
      <div class="profile-main">
        <h2>${esc(u.full_name || u.username || 'Pengguna KelasKu')}</h2>
        <p>@${esc(u.username || '-')}</p>
        <div class="profile-tags"><span class="soft-chip">${esc(u.user_type || 'USER')}</span><span class="soft-chip">${esc(u.global_role || 'USER')}</span></div>
      </div>
      <div class="account-id-box"><span>KelasKu ID</span><strong>${esc(u.kelasku_id || '-')}</strong></div>
    </section>

    <div class="account-grid">
      <section class="panel detail-list">
        <div class="panel-head"><div><div class="panel-title">Akademik</div><p class="panel-copy">Data profil utama.</p></div>${svg('i-class')}</div>
        ${detail('Institusi', u.institution || '-')}
        ${detail('Program Studi / Kelas', u.study_program || '-')}
        ${detail('Angkatan', u.cohort || '-')}
        ${detail('Status', u.user_type || '-')}
      </section>
      <section class="panel detail-list">
        <div class="panel-head"><div><div class="panel-title">Akun</div><p class="panel-copy">Identitas aplikasi dan kontrol session.</p></div>${svg('i-user')}</div>
        ${detail('Username', '@' + (u.username || '-'))}
        ${detail('KelasKu ID', u.kelasku_id || '-')}
        ${detail('Role Global', u.global_role || 'USER')}
        ${detail('Status', u.account_status || 'ACTIVE')}
      </section>
    </div>

    <section class="panel account-danger-zone">
      <div><strong>Keluar dari perangkat ini</strong><p>Session perangkat ini akan dihentikan. Data akun tetap aman.</p></div>
      <button id="logout-account" class="btn btn-ghost">Keluar</button>
    </section>`;

  document.getElementById('app').innerHTML = appShell({ active: 'account', content, hideSearch: true });
  bindAppShell();
  document.getElementById('edit-profile').onclick = () => { state.profileReturnRoute = 'account'; go('profile'); };
  document.getElementById('account-settings').onclick = () => go('settings');
  document.getElementById('logout-account').onclick = logout;
}

async function logout() {
  const btn = document.getElementById('logout-account');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span><span>Keluar…</span>';
  try { await api('logout'); } catch (err) { console.warn('Logout server:', err); }
  clearSession();
  toast('Session perangkat dihentikan.');
  go('auth');
  if (btn) { btn.disabled = false; btn.innerHTML = old; }
}

function detail(label, value) { return `<div class="detail-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`; }
function initials(name) { return String(name || 'K').trim().split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase() || 'K'; }
