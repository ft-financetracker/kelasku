import { state } from './state.js';
import { esc, svg, logo, toast } from './utils.js';
import { go } from './router.js';

function unreadCount(type){const key=String(type||'').toUpperCase();return (state.notifications||[]).filter(n=>!n.read_at&&String(n.type||'SYSTEM').toUpperCase()===key).length;}
function unreadAny(types=[]){const set=new Set(types.map(x=>String(x).toUpperCase()));return (state.notifications||[]).filter(n=>!n.read_at&&set.has(String(n.type||'SYSTEM').toUpperCase())).length;}
function signalHtml(count,{dotOnly=false}={}){const n=Number(count||0);if(!n)return '';return `<span class="nav-signal ${dotOnly?'dot':''}">${dotOnly?'':(n>9?'9+':n)}</span>`;}
function signalForRoute(route){if(route==='schedule')return signalHtml(unreadCount('SCHEDULE'));if(route==='tasks')return signalHtml(unreadCount('TASK'));if(route==='materials')return signalHtml(unreadCount('MATERIAL'),{dotOnly:true});if(route==='announcements')return signalHtml(unreadCount('ANNOUNCEMENT'),{dotOnly:true});if(route==='attendance')return signalHtml(unreadCount('ATTENDANCE'));if(route==='messages')return signalHtml(unreadCount('MESSAGE'));if(route==='classes')return signalHtml(unreadAny(['ANNOUNCEMENT','MATERIAL','ATTENDANCE','SCHEDULE','TASK']),{dotOnly:true});return '';}
export function refreshShellIndicators(){document.querySelectorAll('[data-route]').forEach(btn=>{const route=btn.dataset.route;const old=btn.querySelector('.nav-signal');if(old)old.remove();const html=signalForRoute(route);if(html)btn.insertAdjacentHTML('beforeend',html);});const bell=document.getElementById('notif-badge');if(bell){const n=(state.notifications||[]).filter(x=>!x.read_at).length;bell.textContent=n>99?'99+':String(n);bell.classList.toggle('hidden',!n);}}
export function appShell(options = {}) {
  const active = options.active || 'dashboard';
  const content = options.content || '';
  const searchPlaceholder = options.searchPlaceholder || 'Cari di KelasKu…';
  const admin = String(state.user?.global_role || '') === 'SUPER_ADMIN';
  const sidebarCollapsed = localStorage.getItem('kelasku_sidebar_collapsed') === '1';

  return `
    <div class="dashboard ${sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      <aside class="sidebar">
        <button type="button" class="sidebar-brand-toggle" id="sidebar-brand-toggle" aria-label="Ciutkan atau buka menu" title="Ciutkan / buka menu">${logo()}</button>
        <nav class="nav" aria-label="Navigasi utama">
          ${sideItem('i-home', 'Beranda', 'dashboard', active === 'dashboard', true)}
          ${sideItem('i-class', 'Kelas', 'classes', active === 'classes' || active === 'class')}
          ${sideItem('i-calendar', 'Jadwal', 'schedule', active === 'schedule')}
          ${sideItem('i-task', 'Tugas', 'tasks', active === 'tasks')}
          ${sideItem('i-file', 'Materi', 'materials', active === 'materials')}
          ${sideItem('i-mega', 'Pengumuman', 'announcements', active === 'announcements')}
          ${sideItem('i-check', 'Absensi', 'attendance', active === 'attendance')}
          ${sideItem('i-chat', 'Pesan', 'messages', active === 'messages')}
          ${sideItem('i-user', 'Profil', 'account', active === 'account')}
          ${sideItem('i-gear', 'Pengaturan', 'settings', active === 'settings' || active === 'app-info')}
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
            <button class="icon-btn shell-account-btn" id="shell-account" title="Profil" aria-label="Profil">${state.user?.avatar_url ? `<img class="shell-avatar-img" src="${esc(state.user.avatar_url)}" alt="">` : svg('i-user')}</button>
          </div>
        </div>
        <div class="dashboard-body">${content}</div>
      </main>

      <nav class="bottom-nav bottom-nav-minimal" aria-label="Navigasi bawah">
        ${bottomMaterialItem('school', 'Kelas', 'classes', active === 'classes' || active === 'class')}
        ${bottomMaterialItem('assignment_turned_in', 'Tugas', 'tasks', active === 'tasks')}
        ${bottomMaterialItem('home', 'Beranda', 'dashboard', active === 'dashboard')}
        ${bottomMaterialItem('chat_bubble', 'Chat', 'messages', active === 'messages')}
        ${bottomMaterialItem('person', 'Profil', 'account', active === 'account' || active === 'settings' || active === 'app-info' || String(active).startsWith('admin'))}
      </nav>
    </div>`;
}

export function bindAppShell(options = {}) {
  refreshShellIndicators();
  if(!window.__kelaskuShellSignalBound){window.__kelaskuShellSignalBound=true;window.addEventListener('kelasku-notifications-updated',refreshShellIndicators);}
  document.querySelectorAll('[data-route]').forEach(btn => {
    btn.onclick = () => handleRoute(btn.dataset.route);
  });

  const brandToggle = document.getElementById('sidebar-brand-toggle');
  if (brandToggle) brandToggle.onclick = () => {
    const shell = document.querySelector('.dashboard');
    if (!shell) return;
    const collapsed = shell.classList.toggle('sidebar-collapsed');
    localStorage.setItem('kelasku_sidebar_collapsed', collapsed ? '1' : '0');
    brandToggle.setAttribute('aria-label', collapsed ? 'Buka menu' : 'Ciutkan menu');
    brandToggle.title = collapsed ? 'Buka menu' : 'Ciutkan menu';
  };

  const account = document.getElementById('shell-account');
  if (account) account.onclick = () => go('account');

  const settings = document.getElementById('shell-settings');
  if (settings) settings.onclick = () => go('settings');

  const admin = document.getElementById('shell-admin');
  if (admin) admin.onclick = () => go('admin');

  const notif = document.getElementById('shell-notif');
  if (notif) notif.onclick = () => {
    if (typeof options.onNotifications === 'function') options.onNotifications();
    else go('notifications');
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
  return `<button type="button" class="${cls}" data-route="${esc(route)}" title="${esc(label)}">${iconHtml}<span>${esc(label)}</span>${signalForRoute(route)}</button>`;
}

function bottomMaterialItem(symbol, label, route, active) {
  const cls = `bottom-item bottom-material-item ${active ? 'active' : ''}`;
  return `<button type="button" class="${cls}" data-route="${esc(route)}" title="${esc(label)}" aria-label="${esc(label)}"><span class="bottom-material-hit"><span class="material-symbols-rounded bottom-material-icon">${esc(symbol)}</span></span>${signalForRoute(route)}</button>`;
}
