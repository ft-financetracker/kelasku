import { state, setIdentity } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, logo, svg } from '../core/utils.js';
import { go } from '../core/router.js';
import { shouldShowAppSetup } from '../core/pwa.js';
import { appShell, bindAppShell } from '../core/appShell.js';

export function renderProfile() {
  const user = state.user || {};
  const editing = Boolean(user.profile_complete);
  const identity = state.identity || {};
  const form = profileForm(user, identity, editing);

  if (editing) {
    const content = `
      <div class="page-head">
        <div><div class="eyebrow">Profil • Edit</div><h1>Edit Profil</h1><p>Perbarui identitas tanpa keluar dari aplikasi atau mengulang alur pendaftaran.</p></div>
        <button type="button" id="profile-cancel" class="btn btn-secondary">${svg('i-back')} Kembali</button>
      </div>
      <section class="panel edit-profile-panel">${form}</section>`;
    document.getElementById('app').innerHTML = appShell({ active: 'account', content, hideSearch: true });
    bindAppShell();
    document.getElementById('profile-cancel').onclick = () => go('account');
  } else {
    document.getElementById('app').innerHTML = `
      <section class="screen">
        <div class="shell two-col">
          <div class="intro-panel">
            ${logo()}
            <div class="eyebrow" style="margin-top:34px">04 • Profil</div>
            <h1 class="title">Kenalkan Dirimu ke <span class="accent">KelasKu</span></h1>
            <p class="copy">KelasKu ID menjadi ID publik aplikasi. NIM/NIS/NISN dapat dipakai sebagai identitas akademik dan pencarian, bukan primary key database.</p>
            <div class="profile-meta">
              <div class="meta-chip"><span>Username</span><strong>@${esc(user.username || '-')}</strong></div>
              <div class="meta-chip"><span>KelasKu ID</span><strong>${esc(user.kelasku_id || '-')}</strong></div>
            </div>
          </div>
          <div class="content-panel glass">${form}</div>
        </div>
      </section>`;
  }

  const type = user.user_type || 'STUDENT';
  document.getElementById('user-type').value = type;
  document.getElementById('identity-type').value = identity.identity_type || 'NONE';
  document.getElementById('identity-number').value = identity.identity_number || '';
  document.getElementById('profile-form').onsubmit = submitProfile;
}

function profileForm(user, identity, editing) {
  return `<form id="profile-form" class="${editing ? 'edit-profile-form' : ''}">
    <div class="field"><label>Nama Lengkap *</label><input id="full-name" class="control" value="${esc(user.full_name || '')}" required></div>

    <div class="form-grid">
      <div class="field"><label>Status</label><select id="user-type" class="control"><option value="STUDENT">Mahasiswa / Pelajar</option><option value="TEACHER">Dosen / Guru</option><option value="STAFF">Staff</option><option value="OTHER">Lainnya</option></select></div>
      <div class="field"><label>Angkatan</label><input id="cohort" class="control" placeholder="2026" value="${esc(user.cohort || '')}"></div>
    </div>

    <div class="field"><label>Institusi</label><input id="institution" class="control" placeholder="Nama kampus / sekolah / pesantren" value="${esc(user.institution || '')}"></div>
    <div class="field"><label>Program Studi / Kelas</label><input id="study-program" class="control" placeholder="Ekonomi Syariah" value="${esc(user.study_program || '')}"></div>

    <div class="form-grid">
      <div class="field"><label>Jenis Identitas</label><select id="identity-type" class="control"><option value="NONE">Tidak diisi</option><option value="NIM">NIM</option><option value="NIS">NIS</option><option value="NISN">NISN</option><option value="NIK">NIK</option><option value="OTHER">ID Lain</option></select></div>
      <div class="field"><label>Nomor Identitas</label><input id="identity-number" class="control" placeholder="Contoh: 2208123456" value="${esc(identity.identity_number || '')}"></div>
    </div>

    <div class="field"><label>Bio</label><textarea id="bio" class="control" rows="3" placeholder="Singkat saja…">${esc(user.bio || '')}</textarea></div>
    <div id="profile-status" class="request-status"></div>
    <button id="profile-submit" class="btn btn-primary btn-block" type="submit">${editing ? 'Simpan Perubahan' : `Simpan & Lanjut ${svg('i-arrow')}`}</button>
  </form>`;
}

async function submitProfile(event) {
  event.preventDefault();
  const button = document.getElementById('profile-submit');
  const status = document.getElementById('profile-status');
  const editing = Boolean(state.user?.profile_complete);

  const payload = {
    full_name: document.getElementById('full-name').value,
    user_type: document.getElementById('user-type').value,
    institution: document.getElementById('institution').value,
    study_program: document.getElementById('study-program').value,
    cohort: document.getElementById('cohort').value,
    identity_type: document.getElementById('identity-type').value,
    identity_number: document.getElementById('identity-number').value,
    identity_searchable: true,
    bio: document.getElementById('bio').value
  };

  const originalButtonHtml = button.innerHTML;
  button.disabled = true;
  button.classList.add('is-loading');
  button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>Menyimpan profil…</span>`;
  status.className = 'request-status progress';
  status.innerHTML = '<span class="status-dot"></span>Menyimpan seluruh profil dalam satu proses…';

  try {
    const data = await api('saveProfile', payload, {
      onSlow: () => {
        status.className = 'request-status slow';
        status.innerHTML = '<span class="status-dot"></span>Masih menyimpan. Jangan klik ulang.';
      }
    });
    state.user = data.user;
    localStorage.setItem('kelasku_user_cache', JSON.stringify(data.user));
    setIdentity(data.identity || null);
    status.className = 'request-status ok';
    status.textContent = editing ? 'Perubahan profil tersimpan ✓' : 'Profil tersimpan.';

    if (editing) {
      state.profileReturnRoute = '';
      go('account');
      return;
    }

    const returnRoute = state.profileReturnRoute;
    state.profileReturnRoute = '';
    go(returnRoute || (shouldShowAppSetup() ? 'setup' : 'dashboard'));
  } catch (err) {
    status.className = 'request-status error';
    status.textContent = err.message;
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.innerHTML = originalButtonHtml;
  }
}
