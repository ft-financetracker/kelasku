import { state, clearSession } from '../core/state.js';
import { api } from '../core/api.js';
import { C, esc, svg, fmtDate, semverCmp, toast } from '../core/utils.js';
import { showSystemNotification, updateApp } from '../core/pwa.js';
import { go, currentRoute, openDeepLink } from '../core/router.js';
import { appShell, bindAppShell } from '../core/appShell.js';

let carouselTimer = null;
let carouselIndex = 0;

export function renderDashboard() {
  const content = `
    <div id="update-slot">${updateBanner()}</div>
    ${navigator.onLine ? '' : '<div class="offline-banner">Mode offline — menampilkan data terakhir di perangkat.</div>'}
    <div id="dashboard-slot"></div>`;

  document.getElementById('app').innerHTML = appShell({
    active: 'dashboard',
    content,
    searchPlaceholder: 'Cari kelas, KelasKu ID, NIM/NIS…'
  }) + '<div id="notif-drawer" class="drawer glass hidden"></div>';

  bindAppShell({
    onSearch: () => go('classes'),
    onNotifications: toggleNotifications
  });

  if (state.dashboard) drawDashboard(state.dashboard);
  else drawSkeleton();

  const updateBtn = document.getElementById('update-now');
  if (updateBtn) updateBtn.onclick = updateApp;

  refreshDashboard();
  startNotificationPolling();
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
  slot.innerHTML = `<div class="hello"><div><h1>Halo! 👋</h1><p>Menyiapkan dashboardmu…</p></div></div><div class="dashboard-carousel skeleton" style="height:180px"></div><section class="stats">${[1,2,3,4].map(() => '<div class="stat skeleton" style="height:82px"></div>').join('')}</section><section class="dash-grid"><div class="panel skeleton" style="height:240px"></div><div class="panel skeleton" style="height:240px"></div></section>`;
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

    ${carouselHtml(d)}

    <section class="dashboard-quick-actions" aria-label="Akses cepat akademik">
      ${quickAction('i-calendar','Jadwal','schedule')}
      ${quickAction('i-task','Tugas','tasks')}
      ${quickAction('i-file','Materi','materials')}
      ${quickAction('i-mega','Pengumuman','announcements')}
      ${quickAction('i-check','Absensi','attendance')}
    </section>

    <section class="stats">
      ${stat('i-class', s.active_classes || 0, 'Kelas Aktif')}
      ${stat('i-task', s.open_tasks || 0, 'Tugas Aktif')}
      ${stat('i-file', s.new_materials || 0, 'Materi Baru')}
      ${stat('i-mega', s.announcements || 0, 'Pengumuman')}
    </section>

    <section class="dash-grid">
      <div class="panel"><div class="panel-head"><div class="panel-title">Kelas Aktif</div><button class="mini-link button-link" id="open-all-classes">Lihat Semua</button></div>${(d.classes || []).length ? `<div class="list">${d.classes.slice(0,4).map(classRow).join('')}</div>` : empty('Belum ada kelas', 'Buat kelas sendiri atau masuk menggunakan Class Code / Join Code.')}</div>
      <div class="panel"><div class="panel-head"><div class="panel-title">Jadwal Hari Ini</div><button class="mini-link button-link" data-dashboard-route="schedule">Lihat Jadwal</button></div>${(d.schedules || []).length ? `<div class="list">${d.schedules.slice(0,5).map(x => row('i-calendar', x.title, `${x.time || ''}${x.location ? ' • '+x.location : ''}`, x.class_name)).join('')}</div>` : empty('Tidak ada jadwal', 'Jadwal hari ini akan tampil di sini.')}</div>
      <div class="panel"><div class="panel-head"><div class="panel-title">Pengumuman Terbaru</div><button class="mini-link button-link" data-dashboard-route="announcements">Lihat Semua</button></div>${(d.announcements || []).length ? `<div class="list">${d.announcements.slice(0,4).map(x => row('i-mega', x.title, x.body || '', x.class_name)).join('')}</div>` : empty('Belum ada pengumuman', 'Informasi terbaru kelas akan muncul di sini.')}</div>
      <div class="panel"><div class="panel-head"><div class="panel-title">Tugas Terdekat</div><button class="mini-link button-link" data-dashboard-route="tasks">Lihat Tugas</button></div>${(d.tasks || []).length ? `<div class="list">${d.tasks.slice(0,4).map(x => row('i-task', x.title, deadlineLabel(x.deadline), x.class_name)).join('')}</div>` : empty('Tidak ada tugas aktif', 'Tugas dan deadline terdekat akan tampil di sini.')}</div>
    </section>`;

  document.getElementById('open-all-classes')?.addEventListener('click', () => go('classes'));
  slot.querySelectorAll('[data-dashboard-route]').forEach(btn => btn.onclick = () => go(btn.dataset.dashboardRoute));
  slot.querySelectorAll('[data-dashboard-class]').forEach(btn => {
    btn.onclick = () => {
      state.selectedClassId = btn.dataset.dashboardClass;
      sessionStorage.setItem('kelasku_selected_class', state.selectedClassId);
      go('class');
    };
  });
  bindCarousel();
}

function carouselHtml(d) {
  const nextSchedule = (d.schedules || [])[0];
  const nextTask = (d.tasks || [])[0];
  const classCount = Number(d.summary?.active_classes || 0);
  const slides = [
    {
      icon:'i-class', eyebrow:'KELASKU • PHASE 3', title:`${classCount} kelas dalam satu ruang belajar`,
      copy:classCount ? 'Jadwal, tugas, materi, dan pengumuman sekarang terhubung ke kelasmu.' : 'Buat atau gabung kelas untuk mulai membangun ruang belajar.',
      action:'Buka Kelas', route:'classes', tone:'a'
    },
    {
      icon:'i-calendar', eyebrow:'AGENDA HARI INI', title:nextSchedule ? nextSchedule.title : 'Jadwalmu sedang longgar',
      copy:nextSchedule ? `${nextSchedule.class_name || 'KelasKu'} • ${nextSchedule.time || ''}${nextSchedule.location ? ' • '+nextSchedule.location : ''}` : 'Agenda perkuliahan hari ini akan muncul otomatis di sini.',
      action:'Lihat Jadwal', route:'schedule', tone:'b'
    },
    {
      icon:'i-task', eyebrow:'TUGAS TERDEKAT', title:nextTask ? nextTask.title : 'Tidak ada tugas yang mendesak',
      copy:nextTask ? `${nextTask.class_name || 'KelasKu'} • ${deadlineLabel(nextTask.deadline)}` : 'Ketika tugas dibuat oleh kelas, deadline akan terpantau di sini.',
      action:'Buka Tugas', route:'tasks', tone:'c'
    }
  ];
  return `<section class="dashboard-carousel" id="dashboard-carousel" aria-label="Informasi utama">
    <div class="dashboard-carousel-track" id="dashboard-carousel-track">${slides.map((x,i)=>carouselSlide(x,i)).join('')}</div>
    <div class="dashboard-carousel-dots">${slides.map((_,i)=>`<button type="button" class="carousel-dot ${i===0?'active':''}" data-carousel-dot="${i}" aria-label="Banner ${i+1}"></button>`).join('')}</div>
  </section>`;
}

function carouselSlide(x, index) {
  return `<article class="dashboard-carousel-slide tone-${x.tone}" data-carousel-index="${index}">
    <div class="carousel-copy"><span class="carousel-eyebrow">${esc(x.eyebrow)}</span><h2>${esc(x.title)}</h2><p>${esc(x.copy)}</p><button type="button" class="carousel-action" data-dashboard-route="${esc(x.route)}">${esc(x.action)} ${svg('i-arrow')}</button></div>
    <div class="carousel-art"><span class="carousel-diamond">${svg(x.icon)}</span><span class="carousel-orbit orbit-one"></span><span class="carousel-orbit orbit-two"></span></div>
  </article>`;
}

function bindCarousel() {
  const track = document.getElementById('dashboard-carousel-track');
  if (!track) return;
  carouselIndex = 0;
  const dots = [...document.querySelectorAll('[data-carousel-dot]')];
  const slides = [...track.children];
  const show = index => {
    carouselIndex = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${carouselIndex * 100}%)`;
    dots.forEach((d,i)=>d.classList.toggle('active',i===carouselIndex));
  };
  dots.forEach(dot => dot.onclick = () => { show(Number(dot.dataset.carouselDot)); restartCarousel(show, slides.length); });

  let startX = 0;
  track.addEventListener('pointerdown', e => { startX = e.clientX; });
  track.addEventListener('pointerup', e => {
    const delta = e.clientX - startX;
    if (Math.abs(delta) > 45) { show(carouselIndex + (delta < 0 ? 1 : -1)); restartCarousel(show, slides.length); }
  });
  restartCarousel(show, slides.length);
}

function restartCarousel(show, total) {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = setInterval(() => {
    if (!document.getElementById('dashboard-carousel-track')) { clearInterval(carouselTimer); carouselTimer = null; return; }
    if (document.visibilityState === 'visible') show(carouselIndex + 1);
  }, 5200);
}

function quickAction(icon,label,route) {
  return `<button type="button" class="dashboard-quick-action" data-dashboard-route="${esc(route)}"><span>${svg(icon)}</span><strong>${esc(label)}</strong></button>`;
}

function stat(icon, value, label) {
  return `<div class="stat"><div class="status-icon">${svg(icon)}</div><div><strong>${value}</strong><span>${label}</span></div></div>`;
}
function row(icon, title, copy, meta='') {
  return `<div class="list-row"><div class="status-icon">${svg(icon)}</div><div><h4>${esc(title)}</h4><p>${meta ? esc(meta)+' • ' : ''}${esc(copy)}</p></div></div>`;
}
function classRow(item) {
  const classId = item.class_id || item.id || '';
  return `<button type="button" class="list-row list-row-button" data-dashboard-class="${esc(classId)}"><div class="status-icon">${svg('i-class')}</div><div><h4>${esc(item.name)}</h4><p>${esc((item.code || item.class_code || '') + ' • ' + (item.role || 'MEMBER'))}</p></div>${svg('i-arrow')}</button>`;
}
function deadlineLabel(value) {
  if (!value) return 'Tanpa deadline';
  try { return 'Deadline ' + new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
  catch { return String(value); }
}

async function toggleNotifications() {
  const drawer = document.getElementById('notif-drawer');
  if (!drawer) return;
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
        await showSystemNotification(n.title, n.body, n.deep_link || 'dashboard', n.notification_id);
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

  drawer.innerHTML = `<div class="panel-head"><div class="panel-title">Notifikasi</div><button class="icon-btn mini" id="close-notif">${svg('i-close')}</button></div>${state.notifications.length ? `<div class="list">${state.notifications.map(n => `<div class="list-row notif-row" data-notif="${esc(n.notification_id)}"><div class="status-icon">${svg(n.type === 'TASK' ? 'i-task' : n.type === 'SCHEDULE' ? 'i-calendar' : n.type === 'MATERIAL' ? 'i-file' : n.type === 'ANNOUNCEMENT' ? 'i-mega' : 'i-bell')}</div><div><h4>${esc(n.title)}</h4><p>${esc(n.body)}</p><p>${fmtDate(n.created_at)}</p></div>${n.read_at ? '' : '<span style="color:var(--tosca)">●</span>'}</div>`).join('')}</div>` : empty('Belum ada notifikasi', 'Informasi penting akan tampil di sini.')}`;

  document.getElementById('close-notif')?.addEventListener('click', () => drawer.classList.add('hidden'));
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

export async function logoutFromDashboard() {
  try { await api('logout'); } catch {}
  clearSession();
  go('auth');
  toast('Kamu telah keluar.');
}
