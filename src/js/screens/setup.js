import { svg, logo, isStandalone } from '../core/utils.js';
import { installPWA, enableNotifications } from '../core/pwa.js';
import { writeBool } from '../core/storage.js';
import { go } from '../core/router.js';

export function renderSetup() {
  const app = document.getElementById('app');
  const installed = isStandalone() || localStorage.getItem('kelasku_pwa_installed') === 'true';
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';

  app.innerHTML = `
    <section class="screen">
      <div class="shell">
        <div style="margin-bottom:24px">${logo()}</div>
        <div class="eyebrow">05 • App Setup</div>
        <h1 class="title" style="max-width:820px">Biar Informasi Kelas Tidak <span class="accent">Ketinggalan</span></h1>
        <p class="copy" style="max-width:760px">Install KelasKu sebagai PWA, lalu aktifkan notifikasi. Keduanya boleh dilewati dan diaktifkan nanti.</p>

        <div class="setup-grid" style="margin-top:24px">
          <div class="setup-card">
            <div class="status-icon">${svg('i-download')}</div>
            <h2>Install KelasKu</h2>
            <p class="copy">Buka langsung dari layar utama dengan mode aplikasi.</p>
            <div class="checklist">
              <div class="checkline">${svg('i-check')} Akses lebih cepat</div>
              <div class="checkline">${svg('i-check')} Fullscreen / standalone</div>
              <div class="checkline">${svg('i-check')} App shell tersedia offline</div>
            </div>
            <button id="install-btn" class="btn ${installed ? 'btn-secondary' : 'btn-primary'} btn-block" ${installed ? 'disabled' : ''}>${installed ? '✓ Sudah Terpasang' : 'Install KelasKu'}</button>
          </div>

          <div class="setup-card">
            <div class="status-icon">${svg('i-bell')}</div>
            <h2>Aktifkan Notifikasi</h2>
            <p class="copy">Pengumuman, jadwal, tugas, materi, dan informasi penting bisa muncul selama aplikasi aktif.</p>
            <div class="checklist">
              <div class="checkline">${svg('i-check')} Pengumuman penting</div>
              <div class="checkline">${svg('i-check')} Perubahan jadwal</div>
              <div class="checkline">${svg('i-check')} Deadline tugas</div>
            </div>
            <button id="notif-btn" class="btn ${permission === 'granted' ? 'btn-secondary' : 'btn-primary'} btn-block" ${permission === 'granted' ? 'disabled' : ''}>${permission === 'granted' ? '✓ Notifikasi Aktif' : 'Aktifkan Notifikasi'}</button>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:20px">
          <button id="finish-setup" class="btn btn-primary">Masuk Dashboard ${svg('i-arrow')}</button>
        </div>
      </div>
    </section>`;

  const installBtn = document.getElementById('install-btn');
  if (installBtn && !installed) installBtn.onclick = async () => {
    const old = installBtn.innerHTML;
    installBtn.disabled = true;
    installBtn.innerHTML = '<span class="btn-spinner"></span><span>Menyiapkan instalasi…</span>';
    try { await installPWA(); } finally { installBtn.innerHTML = old; renderSetup(); }
  };

  const notifBtn = document.getElementById('notif-btn');
  if (notifBtn && permission !== 'granted') notifBtn.onclick = async () => {
    const old = notifBtn.innerHTML;
    notifBtn.disabled = true;
    notifBtn.innerHTML = '<span class="btn-spinner"></span><span>Meminta izin…</span>';
    try { await enableNotifications(); } finally { notifBtn.innerHTML = old; renderSetup(); }
  };

  document.getElementById('finish-setup').onclick = () => {
    writeBool('kelasku_app_setup_completed', true);
    go('dashboard');
  };
}
