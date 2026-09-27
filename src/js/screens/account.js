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

    <section class="panel account-security-zone">
      <div class="account-security-copy"><span class="account-security-icon">${svg('i-key')}</span><div><strong>Keamanan Akun</strong><p>Ganti password kapan saja. Session perangkat ini tetap aktif setelah password diperbarui.</p></div></div>
      <button id="toggle-password-form" class="btn btn-secondary" type="button">Ganti Password</button>
      <form id="password-form" class="account-password-form" hidden>
        <div class="field"><label>Password Saat Ini</label><input id="current-password" class="control" type="password" autocomplete="current-password" required></div>
        <div class="field"><label>Password Baru</label><input id="new-password" class="control" type="password" autocomplete="new-password" minlength="8" placeholder="Minimal 8 karakter" required></div>
        <div id="password-status" class="request-status"></div>
        <button id="save-password" class="btn btn-primary" type="submit">Simpan Password</button>
      </form>
    </section>

    <section class="feedback-hero panel">
      <div class="feedback-hero-art" aria-hidden="true">
        <span class="feedback-bubble feedback-bubble-a">💡</span>
        <span class="feedback-bubble feedback-bubble-b">💬</span>
        <span class="feedback-bubble feedback-bubble-c">✨</span>
      </div>
      <div class="feedback-hero-copy">
        <div class="eyebrow">Bantu KelasKu Berkembang</div>
        <h2>Saran & Masukan</h2>
        <p>Ada yang kurang nyaman, punya ide, atau sekadar ingin memberi apresiasi? Kirim langsung ke tim KelasKu. Feedback tersimpan di sistem dan dapat dipantau Super Admin.</p>
        <button id="toggle-feedback-form" class="btn btn-primary" type="button">${svg('i-chat')} Berikan Saran</button>
      </div>
      <form id="feedback-form" class="feedback-form" hidden>
        <div class="feedback-form-grid">
          <div class="field"><label>Nama</label><input id="feedback-name" class="control" value="${esc(u.full_name || u.username || '')}" required></div>
          <div class="field feedback-message-field"><label>Isi Saran / Masukan</label><textarea id="feedback-message" class="control" rows="4" maxlength="3000" placeholder="Tulis dengan singkat dan jelas…" required></textarea></div>
        </div>
        <div class="feedback-block"><span class="feedback-label">Respon Anda</span><div class="feedback-reactions">
          ${reactionOption('LOVE','😄','Suka')}${reactionOption('GOOD','🙂','Baik',true)}${reactionOption('NEUTRAL','😐','Netral')}${reactionOption('ISSUE','😕','Kendala')}${reactionOption('IDEA','💡','Ide')}
        </div></div>
        <div class="feedback-reply-row"><div><strong>Perlu dibalas?</strong><small>Pilih “Ya” jika ingin menerima tindak lanjut melalui email.</small></div><div class="feedback-reply-options"><label><input type="radio" name="feedback-reply" value="NO" checked> Cukup saran</label><label><input type="radio" name="feedback-reply" value="YES"> Ya, balas</label></div></div>
        <div id="feedback-email-wrap" class="field" hidden><label>Email Balasan</label><input id="feedback-email" class="control" type="email" autocomplete="email" placeholder="nama@email.com"></div>
        <div id="feedback-status" class="request-status"></div>
        <div class="feedback-actions"><button id="submit-feedback" class="btn btn-primary" type="submit">Kirim Feedback</button><button id="cancel-feedback" class="btn btn-secondary" type="button">Tutup</button></div>
      </form>
    </section>

    <section class="panel account-danger-zone">
      <div><strong>Keluar dari perangkat ini</strong><p>Session dibuat persisten agar tetap login di perangkat ini. Session baru dihentikan ketika Anda memilih Keluar.</p></div>
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
  bindPasswordForm();
  bindFeedbackForm();
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


function reactionOption(value, emoji, label, checked=false) {
  return `<label class="feedback-reaction"><input type="radio" name="feedback-reaction" value="${esc(value)}" ${checked?'checked':''}><span><b>${emoji}</b><small>${esc(label)}</small></span></label>`;
}

function bindPasswordForm() {
  const toggle = document.getElementById('toggle-password-form');
  const form = document.getElementById('password-form');
  if (!toggle || !form) return;
  toggle.onclick = () => {
    form.hidden = !form.hidden;
    toggle.textContent = form.hidden ? 'Ganti Password' : 'Tutup Form';
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const status = document.getElementById('password-status');
    const button = document.getElementById('save-password');
    const old = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="btn-spinner"></span><span>Menyimpan…</span>';
    status.className = 'request-status progress';
    status.textContent = 'Memperbarui password…';
    try {
      await api('changePassword', {
        current_password: document.getElementById('current-password').value,
        new_password: document.getElementById('new-password').value
      });
      form.reset();
      status.className = 'request-status ok';
      status.textContent = 'Password berhasil diperbarui ✓';
      toast('Password diperbarui.');
    } catch (err) {
      status.className = 'request-status error';
      status.textContent = err.message;
    } finally {
      button.disabled = false;
      button.innerHTML = old;
    }
  };
}

function bindFeedbackForm() {
  const toggle = document.getElementById('toggle-feedback-form');
  const form = document.getElementById('feedback-form');
  const cancel = document.getElementById('cancel-feedback');
  if (!toggle || !form) return;
  const setOpen = open => {
    form.hidden = !open;
    toggle.hidden = open;
    if (open) setTimeout(() => document.getElementById('feedback-message')?.focus(), 20);
  };
  toggle.onclick = () => setOpen(true);
  if (cancel) cancel.onclick = () => setOpen(false);
  document.querySelectorAll('input[name="feedback-reply"]').forEach(input => {
    input.onchange = () => {
      const yes = document.querySelector('input[name="feedback-reply"]:checked')?.value === 'YES';
      const wrap = document.getElementById('feedback-email-wrap');
      const email = document.getElementById('feedback-email');
      wrap.hidden = !yes;
      email.required = yes;
      if (!yes) email.value = '';
    };
  });
  form.onsubmit = async event => {
    event.preventDefault();
    const status = document.getElementById('feedback-status');
    const button = document.getElementById('submit-feedback');
    const reaction = document.querySelector('input[name="feedback-reaction"]:checked')?.value || 'GOOD';
    const wantReply = document.querySelector('input[name="feedback-reply"]:checked')?.value === 'YES';
    const type = reaction === 'ISSUE' ? 'ISSUE' : reaction === 'IDEA' ? 'IDEA' : reaction === 'LOVE' ? 'APPRECIATION' : 'SUGGESTION';
    const old = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="btn-spinner"></span><span>Mengirim…</span>';
    status.className = 'request-status progress';
    status.textContent = 'Menyimpan feedback…';
    try {
      await api('submitFeedback', {
        name: document.getElementById('feedback-name').value,
        message: document.getElementById('feedback-message').value,
        reaction,
        type,
        want_reply: wantReply,
        email: wantReply ? document.getElementById('feedback-email').value : '',
        app_version: window.KELASKU_CONFIG.APP_VERSION,
        app_build: window.KELASKU_CONFIG.BUILD
      });
      document.getElementById('feedback-message').value = '';
      document.getElementById('feedback-email').value = '';
      document.querySelector('input[name="feedback-reply"][value="NO"]').checked = true;
      document.getElementById('feedback-email-wrap').hidden = true;
      status.className = 'request-status ok';
      status.textContent = 'Terima kasih. Feedback sudah tersimpan ✓';
      toast('Feedback terkirim. Terima kasih.');
    } catch (err) {
      status.className = 'request-status error';
      status.textContent = err.message;
    } finally {
      button.disabled = false;
      button.innerHTML = old;
    }
  };
}
