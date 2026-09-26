import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast, semverCmp, C, sameData } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { applyPreferences, previewPreferences } from '../core/preferences.js';
import { go } from '../core/router.js';
import { getAppSetupState, installPWA, enableNotifications, updateApp, checkForAppUpdate } from '../core/pwa.js';

const SETTINGS_TTL_MS = 120000;

export function renderSettings() {
  const content = `
    <div class="page-head">
      <div><div class="eyebrow">07 • Settings</div><h1>Pengaturan</h1><p>Semua pengaturan akun dan aplikasi dikelompokkan per room agar cepat ditemukan.</p></div>
      <span class="phase-badge">ACTIVE</span>
    </div>
    <div class="settings-searchbar panel">
      ${svg('i-search')}
      <input id="settings-search" class="settings-search-input" placeholder="Cari pengaturan: tema, notifikasi, update…" autocomplete="off">
      <button type="button" id="settings-clear-search" class="icon-btn mini" title="Bersihkan">${svg('i-close')}</button>
    </div>
    <div id="settings-slot">${state.settings ? '' : settingsSkeleton()}</div>`;

  document.getElementById('app').innerHTML = appShell({ active: 'settings', content, hideSearch: true });
  bindAppShell();
  // Cache-first: saat kembali dari Super Admin/halaman lain, Settings langsung tampil tanpa skeleton.
  if (state.settings) {
    applyPreferences(state.settings);
    drawSettings(state.settings);
  }
  const cacheFresh = state.settings && (Date.now() - Number(state.settingsAt || 0) < SETTINGS_TTL_MS);
  if (!cacheFresh) loadSettings(Boolean(state.settings));
}

async function loadSettings(background = false) {
  try {
    const data = await api('getSettings');
    const changed = !sameData(state.settings, data.settings);
    state.settings = data.settings;
    state.settingsAt = Date.now();
    localStorage.setItem('kelasku_settings_cache_at', String(state.settingsAt));
    localStorage.setItem('kelasku_settings_cache', JSON.stringify(data.settings));
    applyPreferences(data.settings);
    if (changed || !background) drawSettings(data.settings);
  } catch (err) {
    if (!background && !state.settings) {
      const slot = document.getElementById('settings-slot');
      if (slot) slot.innerHTML = errorBox(err.message);
    }
  }
}

function drawSettings(s) {
  const admin = String(state.user?.global_role || '') === 'SUPER_ADMIN';
  document.getElementById('settings-slot').innerHTML = `
    <form id="settings-form" class="settings-hub">
      ${settingsRoom({
        id: 'appearance', icon: 'i-eye', title: 'Tampilan & Aksesibilitas',
        copy: 'Tema, font, ukuran teks, dan kepadatan antarmuka.', count: '4 Menu', open: true,
        keywords: 'tema dark light sistem font poppins inter ukuran teks kecil besar density compact comfortable tampilan aksesibilitas',
        body: `
          <div class="settings-room-grid">
            ${selectRow('Tema', 'theme', s.theme, [['SYSTEM','Ikuti Sistem'],['DARK','Dark'],['LIGHT','Light']], 'Berubah langsung sebagai preview sebelum disimpan.')}
            ${selectRow('Font', 'font', s.font, [['POPPINS','Poppins'],['INTER','Inter'],['SYSTEM','System']], 'Preview langsung.')}
            ${selectRow('Ukuran Teks', 'text_size', s.text_size, [['SMALL','Kecil'],['NORMAL','Normal'],['LARGE','Besar']], 'Mengubah skala teks aplikasi.')}
            ${selectRow('Kepadatan UI', 'density', s.density, [['COMPACT','Compact'],['COMFORTABLE','Comfortable']], 'Mengatur ruang antar elemen.')}
          </div>
          <div class="settings-preview-strip">
            <span id="theme-preview-dot" class="theme-preview-dot"></span>
            <div><strong id="theme-preview-title">Tema ${String(document.documentElement.dataset.theme || 'dark').toUpperCase()} aktif</strong><small>Perubahan tampil langsung. Simpan agar preference ikut akun di perangkat lain.</small></div>
            <button type="button" id="reset-appearance" class="btn btn-secondary">Reset Tampilan</button>
          </div>`
      })}

      ${settingsRoom({
        id: 'experience', icon: 'i-home', title: 'Navigasi & Pengalaman',
        copy: 'Halaman awal dan onboarding pengguna.', count: '2 Menu',
        keywords: 'halaman awal startup beranda kelas onboarding tutorial pengalaman navigasi',
        body: `
          <div class="settings-room-grid">
            ${selectRow('Halaman Awal', 'startup_page', s.startup_page, [['DASHBOARD','Beranda'],['CLASSES','Kelas'],['TASKS','Tugas'],['SCHEDULE','Jadwal'],['MATERIALS','Materi'],['ATTENDANCE','Absensi'],['MESSAGES','Pesan']], 'Dipakai saat aplikasi dibuka kembali.')}
            ${toggleRow('Onboarding Aktif', 'onboarding_enabled', s.onboarding_enabled, 'Izinkan panduan KelasKu diputar ulang dari akun ini.')}
          </div>
          <div class="settings-inline-actions">
            <button type="button" id="replay-onboarding" class="btn btn-secondary">${svg('i-refresh')} Putar Ulang Onboarding</button>
          </div>`
      })}

      ${settingsRoom({
        id: 'notifications', icon: 'i-bell', title: 'Notifikasi',
        copy: 'Kontrol jenis informasi yang masuk ke Notification Center.', count: '7 Filter',
        keywords: 'notifikasi pengumuman jadwal tugas materi pesan chat absensi sistem notification browser',
        body: `
          <div class="settings-room-grid settings-toggle-grid">
            ${toggleRow('Pengumuman', 'notif_announcement', s.notif_announcement, 'Info resmi kelas.')}
            ${toggleRow('Jadwal', 'notif_schedule', s.notif_schedule, 'Perubahan dan pengingat jadwal.')}
            ${toggleRow('Tugas', 'notif_task', s.notif_task, 'Deadline dan pembaruan tugas.')}
            ${toggleRow('Materi', 'notif_material', s.notif_material, 'Materi baru dari kelas.')}
            ${toggleRow('Pesan', 'notif_message', s.notif_message, 'Pesan dan mention dari room kelas.')}
            ${toggleRow('Absensi', 'notif_attendance', s.notif_attendance, 'Sesi absensi dibuka atau diubah.')}
            ${toggleRow('Sistem', 'notif_system', s.notif_system, 'Update aplikasi dan pesan sistem.')}
          </div>
          <div class="settings-status-card">
            <div><strong>Notifikasi Browser</strong><small id="notification-browser-status">${esc(notificationStatusText())}</small></div>
            <button type="button" id="notif-from-settings" class="btn btn-secondary">Aktifkan / Cek Izin</button>
          </div>`
      })}


      ${settingsRoom({
        id: 'privacy', icon: 'i-shield', title: 'Privasi',
        copy: 'Kontrol visibilitas profil, identitas pencarian, dan aktivitas.', count: '3 Menu',
        keywords: 'privasi profile profil visibility pencarian identitas aktivitas',
        body: `
          <div class="settings-room-grid">
            ${selectRow('Visibilitas Profil', 'profile_visibility', s.profile_visibility || 'CLASS', [['PUBLIC','Publik'],['CLASS','Anggota Kelas'],['PRIVATE','Privat']], 'Mengatur siapa yang boleh melihat profil lengkap.')}
            ${toggleRow('Identitas Akademik Dapat Dicari', 'search_identity', truthy(s.search_identity), 'NIM/NIS/NISN dapat membantu teman menemukan akun. NIK tetap tidak ditampilkan publik.')}
            ${selectRow('Visibilitas Aktivitas', 'activity_visibility', s.activity_visibility || 'CLASS', [['CLASS','Anggota Kelas'],['PRIVATE','Hanya Saya']], 'Mengatur ringkasan aktivitas profil.')}
          </div>`
      })}

      ${settingsRoom({
        id: 'application', icon: 'i-gear', title: 'Akun & Aplikasi',
        copy: 'Identitas, PWA, versi, update, timeline, dan akses akun.', count: admin ? '7 Menu' : '6 Menu',
        keywords: 'akun profil kelasku id username pwa install versi update aplikasi super admin',
        body: `
          <div class="settings-info-grid">
            ${infoCard('KelasKu ID', state.user?.kelasku_id || '-', 'ID publik aplikasi')}
            ${infoCard('Username', '@' + (state.user?.username || '-'), 'Login utama')}
            ${infoCard('Versi', `v${window.KELASKU_CONFIG.APP_VERSION}`, `Build ${window.KELASKU_CONFIG.BUILD}`)}
            ${infoCard('PWA', pwaStatusText(), 'Status instalasi perangkat')}
          </div>
          <div class="settings-action-list">
            ${actionCard('i-user', 'Profil Saya', 'Lihat dan edit identitas akun.', 'open-profile')}
            ${actionCard('i-download', 'Install PWA', 'Pasang KelasKu seperti aplikasi.', 'install-from-settings')}
            ${actionCard('i-refresh', 'Cek Update', 'Periksa versi terbaru dan refresh cache.', 'check-update')}
            ${actionCard('i-info', 'Info Aplikasi', 'Versi, build, dan timeline pembaruan KelasKu.', 'open-app-info')}
            ${admin ? actionCard('i-shield', 'Super Admin', 'Buka pusat administrasi KelasKu.', 'open-admin', true) : ''}
          </div>
          <div id="app-info-status" class="request-status"></div>`
      })}

      <div class="settings-savebar glass">
        <div><strong>Simpan Pengaturan</strong><span id="settings-status">Belum ada perubahan.</span></div>
        <button id="save-settings" class="btn btn-primary" type="submit">Simpan Semua</button>
      </div>
    </form>`;

  bindSettings();
}

function bindSettings() {
  const form = document.getElementById('settings-form');
  form.onsubmit = saveSettings;

  document.querySelectorAll('[data-settings-room-toggle]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.settingsRoomToggle;
      const panel = document.querySelector(`[data-settings-room-panel="${id}"]`);
      const open = !panel.hidden;
      panel.hidden = open;
      btn.classList.toggle('is-open', !open);
      btn.setAttribute('aria-expanded', String(!open));
    };
  });

  const appearanceNames = ['theme','font','text_size','density'];
  appearanceNames.forEach(name => {
    const control = form.elements[name];
    if (!control) return;
    control.addEventListener('change', () => {
      const effective = previewPreferences({
        theme: form.theme.value,
        font: form.font.value,
        text_size: form.text_size.value,
        density: form.density.value
      });
      document.getElementById('theme-preview-title').textContent = `Preview ${effective === 'LIGHT' ? 'Light' : 'Dark'} aktif`;
      setDirty('Preview tampilan aktif — klik Simpan Semua.');
    });
  });

  form.querySelectorAll('select,input[type="checkbox"]').forEach(el => {
    if (appearanceNames.includes(el.name)) return;
    el.addEventListener('change', () => setDirty('Ada perubahan yang belum disimpan.'));
  });

  document.getElementById('reset-appearance').onclick = () => {
    form.theme.value = 'SYSTEM';
    form.font.value = 'POPPINS';
    form.text_size.value = 'NORMAL';
    form.density.value = 'COMFORTABLE';
    const effective = previewPreferences({ theme:'SYSTEM', font:'POPPINS', text_size:'NORMAL', density:'COMFORTABLE' });
    document.getElementById('theme-preview-title').textContent = `Preview ${effective === 'LIGHT' ? 'Light' : 'Dark'} aktif`;
    setDirty('Tampilan di-reset sebagai preview. Klik Simpan Semua.');
  };

  document.getElementById('replay-onboarding').onclick = replayOnboarding;
  document.getElementById('open-profile').onclick = () => go('account');
  document.getElementById('check-update').onclick = checkUpdate;
  document.getElementById('install-from-settings').onclick = installFromSettings;
  document.getElementById('open-app-info').onclick = () => go('app-info');
  document.getElementById('notif-from-settings').onclick = notificationFromSettings;
  const adminBtn = document.getElementById('open-admin');
  if (adminBtn) adminBtn.onclick = () => go('admin');

  const search = document.getElementById('settings-search');
  const clear = document.getElementById('settings-clear-search');
  if (search) search.oninput = () => filterSettingsRooms(search.value);
  if (clear) clear.onclick = () => { search.value = ''; filterSettingsRooms(''); search.focus(); };
}

async function replayOnboarding() {
  const form = document.getElementById('settings-form');
  if (!form.onboarding_enabled.checked) {
    form.onboarding_enabled.checked = true;
  }
  const payload = collectPayload(form);
  payload.onboarding_completed = false;
  try {
    const data = await api('saveSettings', payload);
    state.settings = data.settings;
    state.settingsAt = Date.now();
    localStorage.setItem('kelasku_settings_cache_at', String(state.settingsAt));
    applyPreferences(data.settings);
    localStorage.removeItem('kelasku_onboarding_completed');
    go('onboarding');
  } catch (err) {
    toast(err.message);
  }
}

async function installFromSettings() {
  const status = document.getElementById('app-info-status');
  status.textContent = 'Memeriksa dukungan instalasi…';
  const ok = await installPWA();
  status.textContent = ok ? 'Status instalasi diperbarui ✓' : 'Gunakan menu Install / Add to Home Screen dari browser bila prompt belum tersedia.';
}

async function notificationFromSettings() {
  const status = document.getElementById('app-info-status');
  const label = document.getElementById('notification-browser-status');
  status.textContent = 'Meminta / memeriksa izin notifikasi…';
  const permission = await enableNotifications();
  if (label) label.textContent = notificationStatusText();
  status.textContent = permission === 'granted' ? 'Notifikasi browser aktif ✓' : `Status notifikasi: ${permission}`;
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('save-settings');
  const status = document.getElementById('settings-status');
  const payload = collectPayload(form);

  const old = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="btn-spinner"></span><span>Menyimpan…</span>';
  status.textContent = 'Menyimpan satu paket pengaturan…';

  try {
    const data = await api('saveSettings', payload, { onSlow: () => status.textContent = 'Masih memproses. Jangan klik dua kali.' });
    state.settings = data.settings;
    state.settingsAt = Date.now();
    localStorage.setItem('kelasku_settings_cache_at', String(state.settingsAt));
    applyPreferences(data.settings);
    status.textContent = 'Semua pengaturan tersimpan ✓';
    toast('Pengaturan tersimpan.');
  } catch (err) {
    status.textContent = err.message;
  } finally {
    button.disabled = false;
    button.innerHTML = old;
  }
}

function collectPayload(form) {
  return {
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
    notif_message: form.notif_message.checked,
    notif_attendance: form.notif_attendance.checked,
    notif_system: form.notif_system.checked,
    profile_visibility: form.profile_visibility.value,
    search_identity: form.search_identity.checked,
    activity_visibility: form.activity_visibility.value
  };
}

function setDirty(text) {
  const status = document.getElementById('settings-status');
  if (status) status.textContent = text;
}

function filterSettingsRooms(value) {
  const q = String(value || '').trim().toLowerCase();
  document.querySelectorAll('[data-settings-room]').forEach(room => {
    const hit = !q || String(room.dataset.settingsKeywords || '').toLowerCase().includes(q) || room.textContent.toLowerCase().includes(q);
    room.classList.toggle('hidden', !hit);
    if (hit && q) {
      const panel = room.querySelector('[data-settings-room-panel]');
      const toggle = room.querySelector('[data-settings-room-toggle]');
      if (panel) panel.hidden = false;
      if (toggle) { toggle.classList.add('is-open'); toggle.setAttribute('aria-expanded','true'); }
    }
  });
}

function settingsRoom({ id, icon, title, copy, count, keywords, body, open=false }) {
  return `<section class="settings-room" data-settings-room data-settings-keywords="${esc(keywords || '')}">
    <button type="button" class="settings-main-card ${open ? 'is-open' : ''}" data-settings-room-toggle="${esc(id)}" aria-expanded="${open}">
      <span class="settings-main-icon">${svg(icon)}</span>
      <span class="settings-main-body"><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>
      <span class="settings-main-meta"><span>${esc(count)}</span>${svg('i-arrow')}</span>
    </button>
    <div class="settings-room-panel" data-settings-room-panel="${esc(id)}" ${open ? '' : 'hidden'}>${body}</div>
  </section>`;
}

function selectRow(label, name, value, options, help='') {
  return `<label class="setting-card"><span class="setting-card-copy"><strong>${esc(label)}</strong>${help?`<small>${esc(help)}</small>`:''}</span><select class="control setting-control" name="${esc(name)}">${options.map(x => `<option value="${x[0]}" ${String(value)===x[0]?'selected':''}>${esc(x[1])}</option>`).join('')}</select></label>`;
}
function toggleRow(label, name, value, help='') {
  return `<label class="setting-card"><span class="setting-card-copy"><strong>${esc(label)}</strong>${help?`<small>${esc(help)}</small>`:''}</span><span class="switch"><input type="checkbox" name="${esc(name)}" ${truthy(value)?'checked':''}><span></span></span></label>`;
}
function infoCard(label, value, help='') {
  return `<div class="settings-info-card"><span>${esc(label)}</span><strong>${esc(value)}</strong>${help?`<small>${esc(help)}</small>`:''}</div>`;
}
function actionCard(icon, title, copy, id, primary=false) {
  return `<button type="button" id="${esc(id)}" class="settings-action-card ${primary?'is-primary':''}"><span class="settings-action-icon">${svg(icon)}</span><span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>${svg('i-arrow')}</button>`;
}
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
    const result = await checkForAppUpdate({ notify: false });
    const minVersion = String(config.min_version || '0.0.0');
    const forcedByMinimum = config.update_required === true && semverCmp(C.APP_VERSION, minVersion) < 0;
    const newer = result.available || forcedByMinimum;
    if (newer) {
      status.innerHTML = `Update tersedia: v${esc(result.version || config.current_version)}. <button type="button" id="run-update-now" class="button-link">Update sekarang</button>`;
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

function pwaStatusText(){ return getAppSetupState().installed ? 'Terpasang' : 'Browser mode'; }
function notificationStatusText(){ const p=getAppSetupState().notificationPermission; return p==='granted'?'Aktif':p==='denied'?'Diblokir':p==='unsupported'?'Tidak didukung':'Belum diaktifkan'; }
function settingsSkeleton(){ return `<div class="settings-hub">${[1,2,3,4].map(()=>'<div class="panel skeleton settings-skeleton"></div>').join('')}</div>`; }
function errorBox(msg){ return `<div class="panel error-panel"><strong>Pengaturan gagal dimuat.</strong><p>${esc(msg)}</p><button class="btn btn-secondary" onclick="location.reload()">Coba Lagi</button></div>`; }
