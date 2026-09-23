import { state, setIdentity } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, logo, svg, toast } from '../core/utils.js';
import { go } from '../core/router.js';
import { shouldShowAppSetup } from '../core/pwa.js';
import { appShell, bindAppShell } from '../core/appShell.js';

let pendingAvatarDataUrl = '';
let avatarRemove = false;

export function renderProfile() {
  pendingAvatarDataUrl = '';
  avatarRemove = false;
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
  bindAvatarEditor(user);
}

function profileForm(user, identity, editing) {
  return `<form id="profile-form" class="${editing ? 'edit-profile-form' : ''}">
    <section class="avatar-editor">
      <div id="avatar-preview" class="avatar-preview">${avatarMarkup(user)}</div>
      <div class="avatar-editor-copy"><strong>Foto Profil</strong><small>Foto otomatis dipotong persegi dan dikompresi agar tetap cepat.</small>
        <div class="page-actions avatar-actions">
          <label class="btn btn-secondary small-btn" for="avatar-input">${svg('i-camera')} Pilih Foto</label>
          ${user.avatar_url ? '<button type="button" id="avatar-remove" class="btn btn-ghost small-btn">Gunakan Default</button>' : ''}
        </div>
      </div>
      <input id="avatar-input" type="file" accept="image/png,image/jpeg,image/webp" hidden>
    </section>
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
    bio: document.getElementById('bio').value,
    avatar_data_url: pendingAvatarDataUrl,
    avatar_remove: avatarRemove
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
        status.innerHTML = '<span class="status-dot"></span>Masih menyimpan profil/foto. Jangan klik ulang.';
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
    go(returnRoute || (shouldShowAppSetup() ? 'setup' : (new URL(window.location.href).searchParams.get('attendance') ? 'attendance-link' : 'dashboard')));
  } catch (err) {
    status.className = 'request-status error';
    status.textContent = err.message;
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.innerHTML = originalButtonHtml;
  }
}


function avatarMarkup(user) {
  if (user?.avatar_url && !avatarRemove) return `<img src="${esc(user.avatar_url)}" alt="Foto profil">`;
  return `<span class="default-avatar-icon" aria-hidden="true">${svg('i-user')}</span>`;
}

function bindAvatarEditor(user) {
  const input = document.getElementById('avatar-input');
  const preview = document.getElementById('avatar-preview');
  const remove = document.getElementById('avatar-remove');
  if (!input || !preview) return;

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      pendingAvatarDataUrl = await prepareAvatar(file);
      avatarRemove = false;
      preview.innerHTML = `<img src="${pendingAvatarDataUrl}" alt="Preview foto profil">`;
      toast('Foto siap. Klik Simpan Perubahan untuk memasang.');
    } catch (err) {
      input.value = '';
      toast(err.message || 'Foto tidak dapat diproses.');
    }
  };

  if (remove) remove.onclick = () => {
    pendingAvatarDataUrl = '';
    avatarRemove = true;
    preview.innerHTML = avatarMarkup({ ...user, avatar_url: '' });
    toast('Foto akan dikembalikan ke icon default setelah disimpan.');
  };
}

export async function prepareAvatar(file) {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type || '')) throw new Error('Gunakan JPG, PNG, atau WebP.');
  if (file.size > 6 * 1024 * 1024) throw new Error('File awal maksimal 6 MB.');

  const bitmap = await loadImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  if (!size) throw new Error('Ukuran gambar tidak valid.');
  const sx = Math.max(0, Math.floor((bitmap.width - size) / 2));
  const sy = Math.max(0, Math.floor((bitmap.height - size) / 2));

  const canvas = document.createElement('canvas');
  const target = 192;
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0,0,target,target);
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, target, target);
  if (bitmap.close) bitmap.close();

  let quality = .82;
  let data = canvas.toDataURL('image/webp', quality);
  if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', .84);
  while (data.length > 32000 && quality > .48) {
    quality -= .08;
    data = data.startsWith('data:image/webp')
      ? canvas.toDataURL('image/webp', quality)
      : canvas.toDataURL('image/jpeg', quality);
  }
  if (data.length > 36000) throw new Error('Foto masih terlalu kompleks. Coba gambar lain.');
  return data;
}

async function loadImageBitmap(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gambar tidak dapat dibaca.'));
    };
    img.src = url;
  });
}
