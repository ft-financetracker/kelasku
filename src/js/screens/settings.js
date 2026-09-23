import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, semverCmp, C } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { applyPreferences } from '../core/preferences.js';
import { go } from '../core/router.js';
import { getAppSetupState, installPWA, enableNotifications, updateApp } from '../core/pwa.js';

export function renderSettings() {
  const content = `
    <div class="page-head">
      <div><div class="eyebrow">07 • Settings</div><h1>Pengaturan</h1><p>Atur pengalaman KelasKu tanpa mengubah identitas brand.</p></div>
      <span class="phase-badge">Phase 2</span>
    </div>
    <div id="settings-slot">${settingsSkeleton()}</div>`;

  document.getElementById('app').innerHTML = appShell({ active: 'settings', content, hideSearch: true });
  bindAppShell();
  loadSettings();
}

async function loadSettings() {
  try {
    const data = await api('getSettings');
    state.settings = data.settings;
    applyPreferences(data.settings);
    drawSettings(data.settings);
  } catch (err) {
    document.getElementById('settings-slot').innerHTML = errorBox(err.message);
  }
}

function drawSettings(s) {
  const admin = String(state.user?.global_role || '') === 'SUPER_ADMIN';
  document.getElementById('settings-slot').innerHTML = `
    <form id="settings-form" class="settings-layout">
      <section class="panel settings-section">
        <div class="settings-section-head"><div><h2>Tampilan</h2><p>Personal di perangkat dan akunmu.</p></div>${svg('i-eye')}</div>
        ${selectRow('Tema', 'theme', s.theme, [['SYSTEM','Ikuti Sistem'],['DARK','Dark'],['LIGHT','Light']])}
        ${selectRow('Font', 'font', s.font, [['POPPINS','Poppins'],['INTER','Inter'],['SYSTEM','System']])}
        ${selectRow('Ukuran Teks', 'text_size', s.text_size, [['SMALL','Kecil'],['NORMAL','Normal'],['LARGE','Besar']])}
        ${selectRow('Kepadatan UI', 'density', s.density, [['COMPACT','Compact'],['COMFORTABLE','Comfortable']])}
      </section>

      <section class="panel settings-section">
        <div class="settings-section-head"><div><h2>Pengalaman</h2><p>Atur halaman awal dan onboarding.</p></div>${svg('i-home')}</div>
        ${selectRow('Halaman Awal', 'startup_page', s.startup_page, [['DASHBOARD','Beranda'],['CLASSES','Kelas']])}
        ${toggleRow('Onboarding Aktif', 'onboarding_enabled', s.onboarding_enabled, 'Onboarding tetap tersedia dan dapat diputar ulang.')}
        <button type="button" id="replay-onboarding" class="btn btn-secondary btn-block">Putar Ulang Onboarding</button>
      </section>

      <section class="panel settings-section">
        <div class="settings-section-head"><div><h2>Notifikasi</h2><p>Pilih informasi yang ingin masuk ke Notification Center.</p></div>${svg('i-bell')}</div>
        ${toggleRow('Pengumuman', 'notif_announcement', s.notif_announcement)}
        ${toggleRow('Jadwal', 'notif_schedule', s.notif_schedule)}
        ${toggleRow('Tugas', 'notif_task', s.notif_task)}
        ${toggleRow('Materi', 'notif_material', s.notif_material)}
        ${toggleRow('Sistem', 'notif_system', s.notif_system)}
      </section>

      <section class="panel settings-section">
        <div class="settings-section-head"><div><h2>Akun & Aplikasi</h2><p>Identitas, versi, dan akses administrasi.</p></div>${svg('i-gear')}</div>
        ${infoRow('KelasKu ID', state.user?.kelasku_id || '-')}
        ${infoRow('Username', '@' + (state.user?.username || '-'))}
        ${infoRow('Versi', `v${window.KELASKU_CONFIG.APP_VERSION} · Build ${window.KELASKU_CONFIG.BUILD}`)}
        ${infoRow('PWA', pwaStatusText())}
        ${infoRow('Notifikasi Browser', notificationStatusText())}
        <div class="settings-actions">
          <button type="button" id="open-profile" class="btn btn-secondary">Profil Saya</button>
          <button type="button" id="check-update" class="btn btn-secondary">Cek Update</button>
          <button type="button" id="install-from-settings" class="btn btn-secondary">Install PWA</button>
          <button type="button" id="notif-from-settings" class="btn btn-secondary">Aktifkan Notifikasi</button>
          ${admin ? '<button type="button" id="open-admin" class="btn btn-primary">Super Admin</button>' : ''}
        </div>
        <div id="app-info-status" class="request-status"></div>
      </section>

      <div class="settings-savebar glass">
        <div><strong>Simpan Pengaturan</strong><span id="settings-status">Perubahan disimpan sekaligus dalam satu request.</span></div>
        <button id="save-settings" class="btn btn-primary" type="submit">Simpan</button>
      </div>
    </form>`;

  document.getElementById('settings-form').onsubmit = saveSettings;
  document.getElementById('replay-onboarding').onclick = async () => {
    localStorage.removeItem('kelasku_onboarding_completed');
    if (state.settings) {
      state.settings.onboarding_completed = false;
      localStorage.setItem('kelasku_settings_cache', JSON.stringify(state.settings));
    }
    go('onboarding');
  };
  document.getElementById('open-profile').onclick = () => go('account');
  document.getElementById('check-update').onclick = checkUpdate;
  document.getElementById('install-from-settings').onclick = async () => {
    const ok = await installPWA();
    document.getElementById('app-info-status').textContent = ok ? 'Status instalasi diperbarui.' : 'Gunakan menu Install/Add to Home Screen dari browser bila tombol install belum tersedia.';
  };
  document.getElementById('notif-from-settings').onclick = async () => {
    const permission = await enableNotifications();
    document.getElementById('app-info-status').textContent = permission === 'granted' ? 'Notifikasi browser aktif ✓' : `Status notifikasi: ${permission}`;
  };
  const adminBtn = document.getElementById('open-admin');
  if (adminBtn) adminBtn.onclick = () => go('admin');
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('save-settings');
  const status = document.getElementById('settings-status');
  const payload = {
    theme: form.theme.value,
    font: form.font.value,
    text_size: form.text_size.value,
    density: form.density.value,
    startup_page: form.startup_page.value,
    onboarding_enabled: form.onboarding_enabled.checked,
    onboarding_completed: state.settings?.onboarding_completed ?? true,
    onboarding_version: state.settings?.onboarding_version || 1,
    notif_announcement: form.notif_announcement.checked,
    notif_schedule: form.notif_schedule.checked,
    notif_task: form.notif_task.checked,
    notif_material: form.notif_material.checked,
    notif_system: form.notif_system.checked
  };

  const old = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="btn-spinner"></span><span>Menyimpan…</span>';
  status.textContent = 'Menyimpan satu paket pengaturan…';

  try {
    const data = await api('saveSettings', payload, { onSlow: () => status.textContent = 'Masih memproses. Jangan klik dua kali.' });
    state.settings = data.settings;
    applyPreferences(data.settings);
    status.textContent = 'Tersimpan ✓';
    toast('Pengaturan tersimpan.');
  } catch (err) {
    status.textContent = err.message;
  } finally {
    button.disabled = false;
    button.innerHTML = old;
  }
}

function selectRow(label, name, value, options) {
  return `<label class="setting-row"><span><strong>${esc(label)}</strong></span><select class="control setting-control" name="${esc(name)}">${options.map(x => `<option value="${x[0]}" ${String(value)===x[0]?'selected':''}>${esc(x[1])}</option>`).join('')}</select></label>`;
}
function toggleRow(label, name, value, help='') {
  return `<label class="setting-row"><span><strong>${esc(label)}</strong>${help?`<small>${esc(help)}</small>`:''}</span><span class="switch"><input type="checkbox" name="${esc(name)}" ${truthy(value)?'checked':''}><span></span></span></label>`;
}
function infoRow(label, value) { return `<div class="setting-row"><span><strong>${esc(label)}</strong></span><b>${esc(value)}</b></div>`; }
function truthy(v){ return v === true || String(v).toUpperCase()==='TRUE' || String(v)==='1'; }
async function checkUpdate() {
  const btn = document.getElementById('check-update');
  const status = document.getElementById('app-info-status');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span><span>Mengecek…</span>';
  status.textContent = 'Memeriksa versi terbaru…';
  try {
    const config = await api('getAppConfig', {}, { auth: false });
    state.remoteConfig = config;
    localStorage.setItem('kelasku_app_config_cache', JSON.stringify(config));
    const newer = semverCmp(C.APP_VERSION, config.current_version) < 0 || config.update_required === true;
    if (newer) {
      status.innerHTML = `Update tersedia: v${esc(config.current_version)}. <button type="button" id="run-update-now" class="button-link">Update sekarang</button>`;
      document.getElementById('run-update-now').onclick = updateApp;
    } else {
      status.textContent = 'KelasKu sudah versi terbaru ✓';
    }
  } catch (err) {
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}
function pwaStatusText(){ return getAppSetupState().installed ? 'Terpasang' : 'Belum terpasang / browser mode'; }
function notificationStatusText(){ const p=getAppSetupState().notificationPermission; return p==='granted'?'Aktif':p==='denied'?'Diblokir':p==='unsupported'?'Tidak didukung':'Belum diaktifkan'; }
function settingsSkeleton(){ return `<div class="settings-layout">${[1,2,3,4].map(()=>'<div class="panel skeleton settings-skeleton"></div>').join('')}</div>`; }
function errorBox(msg){ return `<div class="panel error-panel"><strong>Pengaturan gagal dimuat.</strong><p>${esc(msg)}</p><button class="btn btn-secondary" onclick="location.reload()">Coba Lagi</button></div>`; }
