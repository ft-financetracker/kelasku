import { state, clearSession } from '../core/state.js';
import { api } from '../core/api.js';
import { C, esc, svg, fmtDate, semverCmp, toast, sameData } from '../core/utils.js';
import { showSystemNotification, updateApp } from '../core/pwa.js';
import { go, currentRoute, openDeepLink } from '../core/router.js';
import { appShell, bindAppShell } from '../core/appShell.js';

let carouselTimer = null;
let carouselIndex = 0;
let carouselPhysicalIndex = 1;
let carouselMoving = false;
let updateEventHandler = null;

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

  if (updateEventHandler) window.removeEventListener('kelasku-update-check', updateEventHandler);
  updateEventHandler = () => {
    const updateSlot = document.getElementById('update-slot');
    if (updateSlot) {
      updateSlot.innerHTML = updateBanner();
      const btn = document.getElementById('update-now');
      if (btn) btn.onclick = updateApp;
    }
    refreshNotificationSummary();
    if (!document.getElementById('notif-drawer')?.classList.contains('hidden')) renderNotificationDrawer();
  };
  window.addEventListener('kelasku-update-check', updateEventHandler);

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
  slot.innerHTML = `<div class="hello"><div><h1>Halo! 👋</h1><p>Menyiapkan dashboardmu…</p></div></div><section class="dashboard-summary-strip">${[1,2,3,4].map(() => '<div class="summary-mini skeleton" style="height:64px"></div>').join('')}</section><div class="dashboard-carousel skeleton" style="height:180px"></div><section class="dashboard-quick-actions">${[1,2,3,4,5].map(() => '<div class="dashboard-quick-action skeleton" style="height:66px"></div>').join('')}</section><section class="dash-grid"><div class="panel skeleton" style="height:240px"></div><div class="panel skeleton" style="height:240px"></div></section>`;
}

async function refreshDashboard() {
  try {
    const data = await api('getDashboard', {}, { onSlow: () => {} });
    const changed = !sameData(state.dashboard, data);
    state.dashboard = data;
    state.user = data.user || state.user;
    localStorage.setItem('kelasku_dashboard_cache', JSON.stringify(data));
    localStorage.setItem('kelasku_user_cache', JSON.stringify(state.user));
    if (changed && currentRoute() === 'dashboard') drawDashboard(data);
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

    <section class="dashboard-summary-strip" aria-label="Ringkasan dashboard">
      ${summaryMini('i-class', s.active_classes || 0, 'Kelas Aktif', 'classes')}
      ${summaryMini('i-task', s.open_tasks || 0, 'Tugas Aktif', 'tasks')}
      ${summaryMini('i-file', s.new_materials || 0, 'Materi Baru', 'materials')}
      ${summaryMini('i-bell', unreadNotificationCount(), 'Notifikasi', 'notifications')}
    </section>

    ${carouselHtml(d)}

    <section class="dashboard-quick-actions" aria-label="Akses cepat akademik">
      ${quickAction('i-calendar','Jadwal','schedule')}
      ${quickAction('i-task','Tugas','tasks')}
      ${quickAction('i-file','Materi','materials')}
      ${quickAction('i-mega','Pengumuman','announcements')}
      ${quickAction('i-check','Absensi','attendance')}
    </section>

    <section class="dash-grid">
      <div class="panel"><div class="panel-head"><div class="panel-title">Kelas Aktif</div><button class="mini-link button-link" id="open-all-classes">Lihat Semua</button></div>${(d.classes || []).length ? `<div class="list">${d.classes.slice(0,4).map(classRow).join('')}</div>` : empty('Belum ada kelas', 'Buat kelas sendiri atau masuk menggunakan Class Code / Join Code.')}</div>
      <div class="panel"><div class="panel-head"><div class="panel-title">Jadwal Hari Ini</div><button class="mini-link button-link" data-dashboard-route="schedule">Lihat Jadwal</button></div>${(d.schedules || []).length ? `<div class="list">${d.schedules.slice(0,5).map(x => row('i-calendar', x.title, `${x.time || ''}${x.location ? ' • '+x.location : ''}`, x.class_name)).join('')}</div>` : empty('Tidak ada jadwal', 'Jadwal hari ini akan tampil di sini.')}</div>
      <div class="panel"><div class="panel-head"><div class="panel-title">Pengumuman Terbaru</div><button class="mini-link button-link" data-dashboard-route="announcements">Lihat Semua</button></div>${(d.announcements || []).length ? `<div class="list">${d.announcements.slice(0,4).map(x => row('i-mega', x.title, x.body || '', x.class_name)).join('')}</div>` : empty('Belum ada pengumuman', 'Informasi terbaru kelas akan muncul di sini.')}</div>
      <div class="panel"><div class="panel-head"><div class="panel-title">Tugas Terdekat</div><button class="mini-link button-link" data-dashboard-route="tasks">Lihat Tugas</button></div>${(d.tasks || []).length ? `<div class="list">${d.tasks.slice(0,4).map(x => row('i-task', x.title, deadlineLabel(x.deadline), x.class_name)).join('')}</div>` : empty('Tidak ada tugas aktif', 'Tugas dan deadline terdekat akan tampil di sini.')}</div>
    </section>`;

  document.getElementById('open-all-classes')?.addEventListener('click', () => go('classes'));
  slot.querySelectorAll('[data-dashboard-route]').forEach(btn => btn.onclick = () => {
    const route = btn.dataset.dashboardRoute;
    if (route === 'notifications') toggleNotifications();
    else go(route);
  });
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
    { icon:'i-class', eyebrow:'KELASKU • PHASE 6', title:`${classCount} kelas dalam satu ruang belajar`, copy:classCount ? 'Jadwal, tugas, review, materi, absensi, dan analitik sekarang terhubung ke kelasmu.' : 'Buat atau gabung kelas untuk mulai membangun ruang belajar.', action:'Buka Kelas', route:'classes', tone:'a' },
    { icon:'i-calendar', eyebrow:'AGENDA HARI INI', title:nextSchedule ? nextSchedule.title : 'Jadwalmu sedang longgar', copy:nextSchedule ? `${nextSchedule.class_name || 'KelasKu'} • ${nextSchedule.time || ''}${nextSchedule.location ? ' • '+nextSchedule.location : ''}` : 'Agenda perkuliahan hari ini akan muncul otomatis di sini.', action:'Lihat Jadwal', route:'schedule', tone:'b' },
    { icon:'i-task', eyebrow:'TUGAS TERDEKAT', title:nextTask ? nextTask.title : 'Tidak ada tugas yang mendesak', copy:nextTask ? `${nextTask.class_name || 'KelasKu'} • ${deadlineLabel(nextTask.deadline)}` : 'Ketika tugas dibuat oleh kelas, deadline akan terpantau di sini.', action:'Buka Tugas', route:'tasks', tone:'c' }
  ];
  const physical=[slides[slides.length-1],...slides,slides[0]];
  return `<section class="dashboard-carousel" id="dashboard-carousel" aria-label="Informasi utama">
    <div class="dashboard-carousel-track" id="dashboard-carousel-track">${physical.map((x,i)=>carouselSlide(x,i)).join('')}</div>
    <div class="dashboard-carousel-dots">${slides.map((_,i)=>`<button type="button" class="carousel-dot ${i===0?'active':''}" data-carousel-dot="${i}" aria-label="Banner ${i+1}"></button>`).join('')}</div>
  </section>`;
}

function carouselSlide(x, index) {
  return `<article class="dashboard-carousel-slide tone-${x.tone}" data-carousel-index="${index}"><div class="carousel-copy"><span class="carousel-eyebrow">${esc(x.eyebrow)}</span><h2>${esc(x.title)}</h2><p>${esc(x.copy)}</p><button type="button" class="carousel-action" data-dashboard-route="${esc(x.route)}">${esc(x.action)} ${svg('i-arrow')}</button></div><div class="carousel-art"><span class="carousel-diamond">${svg(x.icon)}</span><span class="carousel-orbit orbit-one"></span><span class="carousel-orbit orbit-two"></span></div></article>`;
}

function bindCarousel() {
  const track=document.getElementById('dashboard-carousel-track'); if(!track)return;
  const dots=[...document.querySelectorAll('[data-carousel-dot]')]; const realTotal=3;
  carouselIndex=0; carouselPhysicalIndex=1; carouselMoving=false;
  track.style.transition='none'; track.style.transform='translateX(-100%)'; requestAnimationFrame(()=>{track.style.transition='transform .42s cubic-bezier(.22,.75,.2,1)';});
  const updateDots=()=>dots.forEach((d,i)=>d.classList.toggle('active',i===carouselIndex));
  const moveToPhysical=(physical,animate=true)=>{ if(carouselMoving&&animate)return; carouselMoving=animate; carouselPhysicalIndex=physical; track.style.transition=animate?'transform .42s cubic-bezier(.22,.75,.2,1)':'none'; track.style.transform=`translateX(-${physical*100}%)`; if(!animate){void track.offsetWidth;track.style.transition='transform .42s cubic-bezier(.22,.75,.2,1)';carouselMoving=false;} };
  const moveLogical=index=>{carouselIndex=(index+realTotal)%realTotal;updateDots();if(index>=realTotal){moveToPhysical(realTotal+1,true);}else if(index<0){moveToPhysical(0,true);}else{moveToPhysical(carouselIndex+1,true);}};
  track.addEventListener('transitionend',()=>{carouselMoving=false;if(carouselPhysicalIndex===realTotal+1){carouselIndex=0;moveToPhysical(1,false);}else if(carouselPhysicalIndex===0){carouselIndex=realTotal-1;moveToPhysical(realTotal,false);}updateDots();});
  dots.forEach(dot=>dot.onclick=()=>{const target=Number(dot.dataset.carouselDot);carouselIndex=target;updateDots();moveToPhysical(target+1,true);restartCarousel(moveLogical);});
  let startX=0;track.addEventListener('pointerdown',e=>{startX=e.clientX;});track.addEventListener('pointerup',e=>{const delta=e.clientX-startX;if(Math.abs(delta)>45){moveLogical(carouselIndex+(delta<0?1:-1));restartCarousel(moveLogical);}});
  restartCarousel(moveLogical);
}

function restartCarousel(show) {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer=setInterval(()=>{if(!document.getElementById('dashboard-carousel-track')){clearInterval(carouselTimer);carouselTimer=null;return;}if(document.visibilityState==='visible'&&!carouselMoving)show(carouselIndex+1);},5200);
}

function quickAction(icon,label,route) {
  return `<button type="button" class="dashboard-quick-action" data-dashboard-route="${esc(route)}"><span>${svg(icon)}</span><strong>${esc(label)}</strong></button>`;
}

function summaryMini(icon, value, label, route) {
  return `<button type="button" class="summary-mini" data-dashboard-route="${esc(route)}"><span class="summary-mini-icon">${svg(icon)}</span><span class="summary-mini-copy"><strong data-summary-value="${esc(route)}">${Number(value||0)}</strong><small>${esc(label)}</small></span></button>`;
}
function unreadNotificationCount(){ return (state.notifications || []).filter(n => !n.read_at).length; }
function refreshNotificationSummary(value = unreadNotificationCount()){
  const el=document.querySelector('[data-summary-value="notifications"]');
  if(el) el.textContent=String(Number(value||0));
}
function row(icon, title, copy, meta='') {
  return `<div class="list-row"><div class="status-icon">${svg(icon)}</div><div><h4>${esc(title)}</h4><p>${meta ? esc(meta)+' • ' : ''}${esc(copy)}</p></div></div>`;
}
function classRow(item) {
  const classId = item.class_id || item.id || '';
  const role = roleLabel(item.role || 'MEMBER') + (item.is_class_leader ? ' • Ketua Kelas' : '');
  return `<button type="button" class="list-row list-row-button" data-dashboard-class="${esc(classId)}"><div class="status-icon">${svg('i-class')}</div><div><h4>${esc(item.name)}</h4><p>${esc((item.code || item.class_code || '') + ' • ' + role)}</p></div>${svg('i-arrow')}</button>`;
}
function roleLabel(role){const key=String(role||'MEMBER').toUpperCase();if(key==='COORDINATOR')return 'Koordinator';if(key==='OWNER')return 'Owner';if(key==='MODERATOR')return 'Moderator';return 'Member';}
function deadlineLabel(value) {
  if (!value) return 'Tanpa deadline';
  try { return 'Deadline ' + new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
  catch { return String(value); }
}

async function toggleNotifications() {
  const drawer = document.getElementById('notif-drawer');
  if (!drawer) return;
  const opening = drawer.classList.contains('hidden');
  drawer.classList.toggle('hidden');
  if (!opening) return;

  // Cache-first: drawer harus langsung berisi sesuatu, jangan terlihat stuck.
  renderNotificationDrawer();
  fetchNotifications(false).catch(err => console.warn('Notification refresh:', err));
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
    refreshNotificationSummary(unread.length);

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

  const updateAvailable = state.remoteConfig && semverCmp(C.APP_VERSION, state.remoteConfig.current_version) < 0;
  const updateRow = updateAvailable ? `<button type="button" class="list-row notif-row update-notif-row" id="notif-update-app"><div class="status-icon">${svg('i-refresh')}</div><div><h4>Update KelasKu v${esc(state.remoteConfig.current_version)}</h4><p>${esc(state.remoteConfig.release_note || 'Pembaruan aplikasi tersedia.')}</p><p>Ketuk untuk memperbarui.</p></div><span style="color:var(--tosca)">●</span></button>` : '';
  const notificationList = state.notifications.length ? state.notifications.map(n => `<div class="list-row notif-row" data-notif="${esc(n.notification_id)}"><div class="status-icon">${svg(n.type === 'TASK' ? 'i-task' : n.type === 'SCHEDULE' ? 'i-calendar' : n.type === 'ATTENDANCE' ? 'i-check' : n.type === 'MESSAGE' ? 'i-chat' : n.type === 'MATERIAL' ? 'i-file' : n.type === 'ANNOUNCEMENT' ? 'i-mega' : 'i-bell')}</div><div><h4>${esc(n.title)}</h4><p>${esc(n.body)}</p><p>${fmtDate(n.created_at)}</p></div>${n.read_at ? '' : '<span style="color:var(--tosca)">●</span>'}</div>`).join('') : '';
  drawer.innerHTML = `<div class="panel-head"><div class="panel-title">Notifikasi</div><button class="icon-btn mini" id="close-notif">${svg('i-close')}</button></div>${updateRow || notificationList ? `<div class="list">${updateRow}${notificationList}</div>` : empty('Belum ada notifikasi', 'Informasi penting akan tampil di sini.')}`;

  document.getElementById('close-notif')?.addEventListener('click', () => drawer.classList.add('hidden'));
  document.getElementById('notif-update-app')?.addEventListener('click', updateApp);
  drawer.querySelectorAll('[data-notif]').forEach(el => {
    el.onclick = () => markNotification(el.dataset.notif);
  });
}

async function markNotification(id) {
  const n = state.notifications.find(x => x.notification_id === id);
  if (!n) return;
  const wasUnread=!n.read_at;
  if(wasUnread){
    n.read_at=new Date().toISOString();
    localStorage.setItem('kelasku_notification_cache',JSON.stringify(state.notifications));
    renderNotificationDrawer();
    refreshNotificationSummary();
  }
  if(n.deep_link) openDeepLink(n.deep_link);
  if(wasUnread){
    api('markNotificationRead',{notification_id:id},{onSlow:()=>{}}).catch(err=>{
      console.warn('Mark notification:',err);
      const current=state.notifications.find(x=>x.notification_id===id);
      if(current){current.read_at='';localStorage.setItem('kelasku_notification_cache',JSON.stringify(state.notifications));refreshNotificationSummary();}
    });
  }
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
