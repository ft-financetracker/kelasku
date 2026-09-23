import { state } from './state.js';
import { esc, svg, logo, toast } from './utils.js';
import { go } from './router.js';

export function appShell(options = {}) {
  const active = options.active || 'dashboard';
  const content = options.content || '';
  const searchPlaceholder = options.searchPlaceholder || 'Cari di KelasKu…';
  const admin = String(state.user?.global_role || '') === 'SUPER_ADMIN';

  return `
    <div class="dashboard">
      <aside class="sidebar">
        ${logo()}
        <nav class="nav" aria-label="Navigasi utama">
          ${sideItem('i-home', 'Beranda', 'dashboard', active === 'dashboard', true)}
          ${sideItem('i-class', 'Kelas', 'classes', active === 'classes' || active === 'class')}
          ${sideItem('i-calendar', 'Jadwal', 'schedule', active === 'schedule')}
          ${sideItem('i-task', 'Tugas', 'tasks', active === 'tasks')}
          ${sideItem('i-file', 'Materi', 'materials', active === 'materials')}
          ${sideItem('i-mega', 'Pengumuman', 'announcements', active === 'announcements')}
          ${sideItem('i-check', 'Absensi', 'attendance', active === 'attendance')}
          ${sideItem('i-chat', 'Pesan', 'future:pesan', false)}
          ${sideItem('i-user', 'Profil', 'account', active === 'account')}
          ${sideItem('i-gear', 'Pengaturan', 'settings', active === 'settings')}
          ${admin ? sideItem('i-shield', 'Super Admin', 'admin', active === 'admin') : ''}
        </nav>
        <div class="sidebar-foot">@${esc(state.user?.username || '-')}<br>${esc(state.user?.kelasku_id || '-')}<br><br>KelasKu v${esc(window.KELASKU_CONFIG.APP_VERSION)}<br>Belajar Bersama Lebih Mudah.</div>
      </aside>

      <main class="main">
        <div class="topbar">
          ${logo(true)}
          ${options.hideSearch ? '<div class="search-spacer"></div>' : `<button type="button" class="search search-button" id="shell-search">${esc(searchPlaceholder)}</button>`}
          <div class="top-actions">
            <button class="icon-btn shell-mobile-quick" id="shell-settings" title="Pengaturan" aria-label="Pengaturan">${svg('i-gear')}</button>
            ${admin ? `<button class="icon-btn shell-mobile-quick" id="shell-admin" title="Super Admin" aria-label="Super Admin">${svg('i-shield')}</button>` : ''}
            <button class="icon-btn" id="shell-notif" title="Notifikasi" aria-label="Notifikasi">${svg('i-bell')}<span id="notif-badge" class="badge hidden">0</span></button>
            <button class="icon-btn" id="shell-account" title="Profil" aria-label="Profil">${svg('i-user')}</button>
          </div>
        </div>
        <div class="dashboard-body">${content}</div>
      </main>

      <nav class="bottom-nav" aria-label="Navigasi bawah">
        ${bottomItem('i-class', 'Kelas', 'classes', active === 'classes' || active === 'class')}
        ${bottomItem('i-task', 'Tugas', 'tasks', active === 'tasks')}
        ${bottomItem('i-home', 'Beranda', 'dashboard', active === 'dashboard', true)}
        ${bottomItem('i-chat', 'Chat', 'future:chat', false)}
        ${bottomItem('i-user', 'Profil', 'account', active === 'account' || active === 'settings' || active === 'admin')}
      </nav>
    </div>`;
}

export function bindAppShell(options = {}) {
  document.querySelectorAll('[data-route]').forEach(btn => {
    btn.onclick = () => handleRoute(btn.dataset.route);
  });

  const account = document.getElementById('shell-account');
  if (account) account.onclick = () => go('account');

  const settings = document.getElementById('shell-settings');
  if (settings) settings.onclick = () => go('settings');

  const admin = document.getElementById('shell-admin');
  if (admin) admin.onclick = () => go('admin');

  const notif = document.getElementById('shell-notif');
  if (notif) notif.onclick = () => {
    if (typeof options.onNotifications === 'function') options.onNotifications();
    else {
      go('dashboard');
      toast('Notifikasi dibuka dari Beranda.');
    }
  };

  const search = document.getElementById('shell-search');
  if (search) search.onclick = () => {
    if (typeof options.onSearch === 'function') options.onSearch();
    else go('classes');
  };
}

function handleRoute(route) {
  if (!route) return;
  if (route.startsWith('future:')) {
    const label = route.split(':')[1] || 'Fitur';
    toast(`${label.charAt(0).toUpperCase() + label.slice(1)} akan dibuka pada fase berikutnya.`);
    return;
  }
  go(route);
}

function sideItem(icon, label, route, active, homeCta = false) {
  const cls = `nav-item ${active ? 'active' : ''} ${homeCta ? 'nav-home-cta' : ''}`;
  const iconHtml = homeCta ? `<span class="nav-diamond">${svg(icon)}</span>` : svg(icon);
  return `<button type="button" class="${cls}" data-route="${esc(route)}">${iconHtml}<span>${esc(label)}</span></button>`;
}

function bottomItem(icon, label, route, active, homeCta = false) {
  const cls = `bottom-item ${active ? 'active' : ''} ${homeCta ? 'bottom-home-cta' : ''}`;
  const iconHtml = homeCta ? `<span class="bottom-diamond">${svg(icon)}</span>` : `<span class="bottom-icon-wrap">${svg(icon)}</span>`;
  return `<button type="button" class="${cls}" data-route="${esc(route)}">${iconHtml}<span class="bottom-label">${esc(label)}</span></button>`;
}
