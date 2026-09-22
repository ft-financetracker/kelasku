import { state, clearSession } from '../core/state.js';
import { api } from '../core/api.js';
import { C, esc, svg, logo, fmtDate, semverCmp, toast } from '../core/utils.js';
import { showSystemNotification, updateApp } from '../core/pwa.js';
import { go, currentRoute, openDeepLink } from '../core/router.js';

export function renderDashboard() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="dashboard">
      <aside class="sidebar">
        ${logo()}
        <nav class="nav">
          ${nav('i-home', 'Beranda', true, true)}
          ${nav('i-class', 'Kelas')}
          ${nav('i-calendar', 'Jadwal')}
          ${nav('i-task', 'Tugas')}
          ${nav('i-file', 'Materi')}
          ${nav('i-chat', 'Pesan')}
          ${nav('i-user', 'Profil')}
        </nav>
        <div class="sidebar-foot">@${esc(state.user?.username || '-')}<br>${esc(state.user?.kelasku_id || '-')}<br><br>KelasKu v${C.APP_VERSION}<br>Belajar Bersama Lebih Mudah.</div>
      </aside>

      <main class="main">
        <div class="topbar">
          ${logo(true)}
          <div class="search" id="future-search">Cari nama, KelasKu ID, NIM/NIS…</div>
          <div class="top-actions">
            <button class="icon-btn" id="notif-toggle">${svg('i-bell')}<span id="notif-badge" class="badge hidden">0</span></button>
            <button class="icon-btn" id="logout-btn" title="Keluar">${svg('i-user')}</button>
          </div>
        </div>

        <div class="dashboard-body">
          <div id="update-slot">${updateBanner()}</div>
          ${navigator.onLine ? '' : '<div class="offline-banner">Mode offline — menampilkan data terakhir di perangkat.</div>'}
          <div id="dashboard-slot"></div>
        </div>
      </main>

      <nav class="bottom-nav">
        ${bottom('i-class', 'Kelas')}${bottom('i-task', 'Tugas')}${bottom('i-home', 'Beranda', true, true)}${bottom('i-chat', 'Chat')}${bottom('i-user', 'Profil')}
      </nav>
    </div>
    <div id="notif-drawer" class="drawer glass hidden"></div>`;

  if (state.dashboard) drawDashboard(state.dashboard);
  else drawSkeleton();

  document.getElementById('logout-btn').onclick = logout;
  document.getElementById('notif-toggle').onclick = toggleNotifications;
  document.getElementById('future-search').onclick = () => toast('Pencarian nama, KelasKu ID, NIM/NIS sudah disiapkan di backend dan akan dibuka pada fase berikutnya.');

  document.querySelectorAll('[data-nav], [data-bottom-nav]').forEach(btn => {
    btn.onclick = () => {
      const target = btn.dataset.nav || btn.dataset.bottomNav;
      if (target === 'beranda') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      toast(`${target.charAt(0).toUpperCase() + target.slice(1)} akan dibuka pada fase berikutnya.`);
    };
  });

  const updateBtn = document.getElementById('update-now');
  if (updateBtn) updateBtn.onclick = updateApp;

  refreshDashboard();
  startNotificationPolling();
}

function nav(icon, label, active = false, homeCta = false) {
  const cls = `nav-item ${active ? 'active' : ''} ${homeCta ? 'nav-home-cta' : ''}`;
  const iconHtml = homeCta
    ? `<span class="nav-diamond">${svg(icon)}</span>`
    : svg(icon);
  return `<button type="button" class="${cls}" data-nav="${label.toLowerCase()}">${iconHtml}<span>${label}</span></button>`;
}
function bottom(icon, label, active = false, homeCta = false) {
  const cls = `bottom-item ${active ? 'active' : ''} ${homeCta ? 'bottom-home-cta' : ''}`;
  const iconHtml = homeCta
    ? `<span class="bottom-diamond">${svg(icon)}</span>`
    : svg(icon);
  return `<button type="button" class="${cls}" data-bottom-nav="${label.toLowerCase()}">${iconHtml}<span>${label}</span></button>`;
}
function empty(title, copy) {
  return `<div class="empty"><div><strong>${esc(title)}</strong><span>${esc(copy)}</span></div></div>`;
}

function updateBanner() {
  const rc = state.remoteConfig;
  if (!rc || semverCmp(C.APP_VERSION, rc.current_version) >= 0) return '';
  return `<div class="update-banner"><span><strong>Update ${esc(rc.current_version)} tersedia.</strong> ${esc(rc.release_note || '')}</span><button id="update-now" class="btn btn-primary">Update</button></div>`;
}

function drawSkeleton() {
  const slot = document.getElementById('dashboard-slot');
  if (!slot) return;
  slot.innerHTML = `<div class="hello"><div><h1>Halo! 👋</h1><p>Menyiapkan dashboardmu…</p></div></div><section class="stats">${[1,2,3,4].map(() => '<div class="stat skeleton" style="height:82px"></div>').join('')}</section><section class="dash-grid"><div class="panel skeleton" style="height:240px"></div><div class="panel skeleton" style="height:240px"></div></section>`;
}

async function refreshDashboard() {
  try {
    const data = await api('getDashboard', {}, { onSlow: () => {} });
    state.dashboard = data;
    state.user = data.user || state.user;
    localStorage.setItem('kelasku_dashboard_cache', JSON.stringify(data));
    localStorage.setItem('kelasku_user_cache', JSON.stringify(state.user));
    if (currentRoute() === 'dashboard') drawDashboard(data);
  } catch (err) {
    if (!state.dashboard) {
      const slot = document.getElementById('dashboard-slot');
      if (slot) slot.innerHTML = `<div class="alert danger">${esc(err.message)}</div>`;
    }
  }
}

function drawDashboard(d) {
  const slot = document.getElementById('dashboard-slot');
  if (!slot) return;

  const user = d.user || state.user || {};
  const s = d.summary || {};
  const firstName = (user.full_name || user.username || 'Mahasiswa').split(' ')[0];

  slot.innerHTML = `
    <div class="hello">
      <div><h1>Halo, ${esc(firstName)}! 👋</h1><p>Tetap terhubung. Terus berkembang.</p></div>
      <div class="quote">“Belajar lebih rapi, informasi lebih cepat ditemukan.”</div>
    </div>

    <section class="stats">
      ${stat('i-class', s.active_classes || 0, 'Kelas Aktif')}
      ${stat('i-task', s.open_tasks || 0, 'Tugas Aktif')}
      ${stat('i-file', s.new_materials || 0, 'Materi Baru')}
      ${stat('i-mega', s.announcements || 0, 'Pengumuman')}
    </section>

    <section class="dash-grid">
      <div class="panel"><div class="panel-head"><div class="panel-title">Kelas Aktif</div><div class="mini-link">Phase 2</div></div>${(d.classes || []).length ? `<div class="list">${d.classes.slice(0,4).map(x => row('i-class', x.name, `${x.code || ''} • ${x.role || 'MEMBER'}`)).join('')}</div>` : empty('Belum ada kelas', 'Nanti kamu bisa cari kelas, kode kelas, atau masuk dengan Join Code.')}</div>
      <div class="panel"><div class="panel-head"><div class="panel-title">Jadwal Hari Ini</div><div class="mini-link">Phase 2</div></div>${(d.schedules || []).length ? `<div class="list">${d.schedules.slice(0,5).map(x => row('i-calendar', x.title, x.time || '')).join('')}</div>` : empty('Tidak ada jadwal', 'Jadwal hari ini akan tampil di sini.')}</div>
      <div class="panel"><div class="panel-head"><div class="panel-title">Pengumuman Terbaru</div><div class="mini-link">Phase 2</div></div>${(d.announcements || []).length ? `<div class="list">${d.announcements.slice(0,4).map(x => row('i-mega', x.title, x.body || '')).join('')}</div>` : empty('Belum ada pengumuman', 'Informasi terbaru kelas akan muncul di sini.')}</div>
      <div class="panel"><div class="panel-head"><div class="panel-title">Tugas Terdekat</div><div class="mini-link">Phase 2</div></div>${(d.tasks || []).length ? `<div class="list">${d.tasks.slice(0,4).map(x => row('i-task', x.title, x.deadline || '')).join('')}</div>` : empty('Tidak ada tugas aktif', 'Tugas dan deadline terdekat akan tampil di sini.')}</div>
    </section>`;
}

function stat(icon, value, label) {
  return `<div class="stat"><div class="status-icon">${svg(icon)}</div><div><strong>${value}</strong><span>${label}</span></div></div>`;
}
function row(icon, title, copy) {
  return `<div class="list-row"><div class="status-icon">${svg(icon)}</div><div><h4>${esc(title)}</h4><p>${esc(copy)}</p></div></div>`;
}

async function toggleNotifications() {
  const drawer = document.getElementById('notif-drawer');
  drawer.classList.toggle('hidden');
  if (!drawer.classList.contains('hidden')) await fetchNotifications(false);
}

async function fetchNotifications(showSystem) {
  if (!state.sessionToken) return;
  try {
    const data = await api('getNotifications', { limit: 20 });
    const oldIds = new Set(state.notifications.map(n => n.notification_id));
    state.notifications = data.items || [];
    localStorage.setItem('kelasku_notification_cache', JSON.stringify(state.notifications));

    const unread = state.notifications.filter(n => !n.read_at);
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = unread.length;
      badge.classList.toggle('hidden', !unread.length);
    }

    if (showSystem && 'Notification' in window && Notification.permission === 'granted') {
      const fresh = unread.filter(n => !oldIds.has(n.notification_id));
      for (const n of fresh.slice(0, 2)) {
        await showSystemNotification(n.title, n.body, n.deep_link || '#dashboard', n.notification_id);
      }
    }

    renderNotificationDrawer();
  } catch (err) {
    console.warn('Notification:', err);
  }
}

function renderNotificationDrawer() {
  const drawer = document.getElementById('notif-drawer');
  if (!drawer) return;

  drawer.innerHTML = `<div class="panel-head"><div class="panel-title">Notifikasi</div></div>${state.notifications.length ? `<div class="list">${state.notifications.map(n => `<div class="list-row notif-row" data-notif="${esc(n.notification_id)}"><div class="status-icon">${svg(n.type === 'TASK' ? 'i-task' : n.type === 'SCHEDULE' ? 'i-calendar' : n.type === 'MATERIAL' ? 'i-file' : 'i-bell')}</div><div><h4>${esc(n.title)}</h4><p>${esc(n.body)}</p><p>${fmtDate(n.created_at)}</p></div>${n.read_at ? '' : '<span style="color:var(--tosca)">●</span>'}</div>`).join('')}</div>` : empty('Belum ada notifikasi', 'Informasi penting akan tampil di sini.')}`;

  drawer.querySelectorAll('[data-notif]').forEach(el => {
    el.onclick = () => markNotification(el.dataset.notif);
  });
}

async function markNotification(id) {
  const n = state.notifications.find(x => x.notification_id === id);
  if (!n) return;
  if (!n.read_at) {
    await api('markNotificationRead', { notification_id: id });
    n.read_at = new Date().toISOString();
    localStorage.setItem('kelasku_notification_cache', JSON.stringify(state.notifications));
    renderNotificationDrawer();
  }
  if (n.deep_link) openDeepLink(n.deep_link);
}

function startNotificationPolling() {
  if (state.notificationTimer) clearInterval(state.notificationTimer);
  fetchNotifications(false);
  state.notificationTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) fetchNotifications(true);
  }, Number(state.remoteConfig?.notification_poll_ms || C.NOTIFICATION_POLL_MS || 60000));
}

async function logout() {
  const token = state.sessionToken;
  try {
    await api('logout');
  } catch {}
  clearSession();
  if (token) localStorage.removeItem('kelasku_session_token');
  go('auth');
  toast('Kamu telah keluar.');
}
