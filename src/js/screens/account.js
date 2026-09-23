import { state, clearSession } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { go } from '../core/router.js';
import { confirmDialog } from '../core/dialog.js';

export function renderAccount() {
  const u = state.user || {};
  const identity = state.identity || {};
  const admin = String(u.global_role || '') === 'SUPER_ADMIN';

  const content = `
    <div class="page-head">
      <div><div class="eyebrow">Profil</div><h1>Profil Saya</h1><p>Identitas akun yang digunakan di seluruh ekosistem KelasKu.</p></div>
      <div class="page-actions">
        <button id="edit-profile" class="btn btn-secondary">${svg('i-user')} Edit Profil</button>
        <button id="account-settings" class="btn btn-primary">${svg('i-gear')} Pengaturan</button>
        ${admin ? `<button id="account-admin" class="btn btn-secondary">${svg('i-shield')} Super Admin</button>` : ''}
      </div>
    </div>

    <section class="profile-card panel">
      <div class="profile-avatar">${u.avatar_url ? `<img src="${esc(u.avatar_url)}" alt="Foto profil">` : `<span class="default-avatar-icon" aria-hidden="true">${svg('i-user')}</span>`}</div>
      <div class="profile-main">
        <h2>${esc(u.full_name || u.username || 'Pengguna KelasKu')}</h2>
        <p>@${esc(u.username || '-')}</p>
        <div class="profile-tags"><span class="soft-chip">${esc(u.user_type || 'USER')}</span><span class="soft-chip">${esc(u.global_role || 'USER')}</span></div>
      </div>
      <div class="account-id-box"><span>KelasKu ID</span><strong>${esc(u.kelasku_id || '-')}</strong></div>
    </section>


    <section class="profile-overview panel">
      <div class="panel-head"><div><div class="panel-title">Ringkasan Aktivitas</div><p class="panel-copy">Ringkasan akun dari kelas dan aktivitas akademik.</p></div>${svg('i-timeline')}</div>
      <div id="profile-overview-grid" class="profile-overview-grid">
        ${profileStat('i-class','-','Kelas')}
        ${profileStat('i-shield','-','Ketua Kelas')}
        ${profileStat('i-task','-','Tugas Aktif')}
        ${profileStat('i-check','-','Kehadiran')}
      </div>
    </section>

    <section class="account-quick-panel panel">
      <div class="panel-head"><div><div class="panel-title">Akses Cepat</div><p class="panel-copy">Akses utama akun, terutama untuk tampilan mobile.</p></div>${svg('i-link')}</div>
      <div class="account-quick-grid">
        ${quickCard('i-user','Edit Profil','Ubah identitas dan data akademik.','quick-edit-profile')}
        ${quickCard('i-gear','Pengaturan','Tema, font, notifikasi, PWA, dan update.','quick-settings')}
        ${admin ? quickCard('i-shield','Super Admin','Kelola user, kelas, sistem, dan audit.','quick-admin',true) : ''}
      </div>
    </section>

    <div class="account-grid">
      <section class="panel detail-list">
        <div class="panel-head"><div><div class="panel-title">Akademik</div><p class="panel-copy">Data profil utama.</p></div>${svg('i-class')}</div>
        ${detail('Institusi', u.institution || '-')}
        ${detail('Program Studi / Kelas', u.study_program || '-')}
        ${detail('Angkatan', u.cohort || '-')}
        ${detail('Status', u.user_type || '-')}
        ${detail(identity.identity_type || 'Identitas', identity.identity_number || '-')}
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
  const edit = () => { state.profileReturnRoute = 'account'; go('profile'); };
  document.getElementById('edit-profile').onclick = edit;
  document.getElementById('quick-edit-profile').onclick = edit;
  document.getElementById('account-settings').onclick = () => go('settings');
  document.getElementById('quick-settings').onclick = () => go('settings');
  const adminTop = document.getElementById('account-admin');
  const adminQuick = document.getElementById('quick-admin');
  if (adminTop) adminTop.onclick = () => go('admin');
  if (adminQuick) adminQuick.onclick = () => go('admin');
  document.getElementById('logout-account').onclick = logout;
  loadProfileOverview();
}

async function logout() {
  const ok = await confirmDialog({
    title: 'Keluar dari KelasKu?',
    message: 'Session pada perangkat ini akan dihentikan. Data akun dan kelas tetap tersimpan.',
    confirmLabel: 'Ya, Keluar',
    cancelLabel: 'Tetap Masuk',
    danger: true
  });
  if (!ok) return;

  const btn = document.getElementById('logout-account');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span><span>Keluar…</span>';
  try { await api('logout'); } catch (err) { console.warn('Logout server:', err); }
  clearSession();
  toast('Session perangkat dihentikan.');
  go('auth');
}

function quickCard(icon,title,copy,id,primary=false){
  return `<button type="button" id="${esc(id)}" class="account-quick-card ${primary?'is-primary':''}"><span class="account-quick-icon">${svg(icon)}</span><span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>${svg('i-arrow')}</button>`;
}
function detail(label, value) { return `<div class="detail-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`; }
function initials(name) { return String(name || 'K').trim().split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase() || 'K'; }


async function loadProfileOverview() {
  const root = document.getElementById('profile-overview-grid');
  if (!root) return;
  try {
    const data = await api('getProfileOverview');
    const attendance = Number(data.attendance_total || 0)
      ? `${Number(data.attendance_present || 0)}/${Number(data.attendance_total || 0)}`
      : '0';
    root.innerHTML = [
      profileStat('i-class', data.classes || 0, 'Kelas'),
      profileStat('i-shield', data.leader_classes || 0, 'Ketua Kelas'),
      profileStat('i-task', data.active_tasks || 0, 'Tugas Aktif'),
      profileStat('i-check', attendance, 'Kehadiran')
    ].join('');
  } catch (err) {
    console.warn('Profile overview:', err);
  }
}
function profileStat(icon,value,label){
  return `<div class="profile-stat"><span>${svg(icon)}</span><div><strong>${esc(String(value))}</strong><small>${esc(label)}</small></div></div>`;
}
