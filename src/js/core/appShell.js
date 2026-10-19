import { state } from './state.js?v=6740forms3';
import { esc, svg, logo, toast } from './utils.js?v=6740forms3';
import { go, currentRoute } from './router.js?v=6740forms3';
import { bindShellInteractions, refreshFloatingNavigation, navigationSurfacePath, bottomNavigationRoute } from './shellInteractions.js?v=6740forms3';
import { navigationMenus } from './navigationConfig.js?v=6740forms3';
import { receiveAppConfig } from './configSync.js?v=6740forms3';
import { startShellUpdates } from './shellUpdates.js?v=6740forms3';

let retainedNavigation = null, retainedOwner = '';
const shellOptions = new WeakMap();

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
    <div class="dashboard ${sidebarCollapsed ? 'sidebar-collapsed' : ''}${active === 'class' ? ' room-shell' : ''}" data-shell-active="${esc(active)}">
      <aside class="sidebar">
        <button type="button" class="sidebar-brand-toggle" id="sidebar-brand-toggle" aria-label="Ciutkan atau buka menu" title="Ciutkan / buka menu">${logo()}</button>
        <nav class="nav" aria-label="Navigasi utama">
          ${sideItem('i-home', 'Beranda', 'dashboard', active === 'dashboard', true)}
          ${sideItem('i-class', 'Kelas', 'classes', active === 'classes' || active === 'class')}
          ${sideItem('i-calendar', 'Jadwal', 'schedule', active === 'schedule')}
          ${sideItem('i-task', 'Tugas', 'tasks', active === 'tasks')}
          ${window.KELASKU_FORMS_CONFIG?.ENABLED ? sideItem('i-file', 'Formulir', 'forms', active === 'forms') : ''}
          ${sideItem('i-file', 'Materi', 'materials', active === 'materials')}
          ${sideItem('i-mega', 'Pengumuman', 'announcements', active === 'announcements')}
          ${sideItem('i-check', 'Absensi', 'attendance', active === 'attendance')}
          ${sideItem('i-chat', 'Pesan', 'messages', active === 'messages')}
          ${sideItem('i-user', 'Profil', 'account', active === 'account')}
          ${sideItem('i-gear', 'Pengaturan', 'settings', active === 'settings' || active === 'app-info')}
          ${admin ? sideItem('i-shield', 'Super Admin', 'admin', active === 'admin') : ''}
          ${admin ? sideItem('i-menu', 'Navigasi Bawah', 'admin-navigation', active === 'admin-navigation') : ''}
        </nav>
        <div class="sidebar-foot">@${esc(state.user?.username || '-')}<br>${esc(state.user?.kelasku_id || '-')}<br><br>KelasKu v${esc(window.KELASKU_CONFIG.APP_VERSION)}<br>Belajar Bersama Lebih Mudah.</div>
      </aside>

      <main class="main">
        <div class="shell-pull-status" role="status" aria-live="polite" hidden><span class="shell-pull-icon">${svg('i-refresh')}</span><span data-pull-label>Tarik untuk memperbarui</span></div>
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
        <div class="dashboard-body">${active==='dashboard'&&window.KELASKU_FORMS_CONFIG?.ENABLED?`<section class="forms-launch"><div><strong>Formulir</strong><small>Tugas global, penilaian, dan peringkat.</small></div><button type="button" class="btn btn-primary" data-route="forms">Buka Formulir</button></section>`:''}${content}</div>
      </main>

      ${bottomNavigationHtml(active)}
    </div>`;
}

export function bindAppShell(options = {}) {
  const shell = document.querySelector('.dashboard'), owner = state.sessionToken;
  if (shell) { options = {...(shellOptions.get(shell) || {}),...options}; shellOptions.set(shell, options); }
  attachSharedNavigation(shell, owner);
  bindShellInteractions(shell, { onRefresh: options.onRefresh, canRefresh: options.canRefresh,
    isCurrent: () => state.sessionToken === owner && shell?.isConnected,
    onError: error => toast(error?.message || 'Data belum dapat diperbarui. Coba lagi.') });
  refreshShellIndicators();
  if(!window.__kelaskuShellSignalBound){window.__kelaskuShellSignalBound=true;window.addEventListener('kelasku-notifications-updated',refreshShellIndicators);}
  if (!window.__kelaskuNavigationConfigBound) {
    window.__kelaskuNavigationConfigBound = true;
    window.addEventListener('kelasku-config-updated', refreshShellNavigation);
    window.addEventListener('storage', event => {
      if (event.key !== 'kelasku_app_config_cache' || !event.newValue) return;
      try { receiveAppConfig(JSON.parse(event.newValue)); } catch {}
    });
  }
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
  if (account) {
    account.onclick = () => go('account');
    const avatar=account.querySelector('.shell-avatar-img');
    if(avatar){const fallback=()=>{if(account.contains(avatar))account.innerHTML=svg('i-user');};avatar.addEventListener('error',fallback,{once:true});if(avatar.complete&&!avatar.naturalWidth)fallback();}
  }

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
  startShellUpdates();
}

function handleRoute(route) {
  if (!route) return;
  if (currentRoute() === route) return;
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

function bottomItem(icon, label, route, active) {
  const cls = `bottom-item floating-nav-item ${active ? 'active' : ''}`;
  return `<button type="button" class="${cls}" data-route="${esc(route)}" ${active ? 'aria-current="page"' : ''} title="${esc(label)}" aria-label="${esc(label)}"><span class="floating-nav-hit">${svg(icon)}</span><span class="floating-nav-label">${esc(label)}</span>${signalForRoute(route)}</button>`;
}

export function bottomNavigationHtml(active, config = state.remoteConfig) {
  const menus = navigationMenus(config), ids = menus.map(item => item.id);
  const selected = bottomNavigationRoute(active, ids), index = ids.indexOf(selected);
  const center = index < 0 ? null : 12 + 376 * (index + .5) / menus.length;
  return `<nav class="bottom-nav bottom-nav-floating" data-navigation="c92" data-navigation-items="${ids.join(',')}" style="--nav-count:${menus.length}" aria-label="Navigasi bawah">
    <svg class="floating-nav-surface" viewBox="0 0 400 72" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${navigationSurfacePath(400,72,center)}"></path></svg>
    <span class="floating-nav-indicator" data-indicator-route="${esc(selected)}" aria-hidden="true" ${index < 0 ? 'hidden' : ''} style="transform:translate3d(${(center || 26)-26}px,0,0)">${index < 0 ? '' : svg(menus[index].icon)}</span>
    ${menus.map(item => bottomItem(item.icon, item.label, item.id, item.id === selected)).join('')}
  </nav>`;
}

export function refreshShellNavigation() {
  const shell = document.querySelector('.dashboard');
  const nav = shell?.querySelector('.bottom-nav-floating');
  if (!nav) return;
  reconcileNavigation(nav, shell.dataset.shellActive || 'dashboard');
  shell.querySelectorAll('.bottom-nav-floating [data-route]').forEach(button => {
    button.onclick = () => handleRoute(button.dataset.route);
  });
  refreshFloatingNavigation(shell);
  refreshShellIndicators();
}

function attachSharedNavigation(shell, owner) {
  const fresh = shell?.querySelector('.bottom-nav-floating');
  if (!fresh) return;
  if (retainedNavigation && retainedOwner === owner && fresh !== retainedNavigation) fresh.replaceWith(retainedNavigation);
  else { retainedNavigation = fresh; retainedOwner = owner; }
  reconcileNavigation(retainedNavigation, shell.dataset.shellActive || 'dashboard');
}

function reconcileNavigation(nav, active) {
  const menus = navigationMenus(state.remoteConfig), ids = menus.map(menu => menu.id);
  if (nav.dataset.navigationItems !== ids.join(',')) {
    const holder = document.createElement('div');
    holder.innerHTML = bottomNavigationHtml(active);
    nav.innerHTML = holder.querySelector('.bottom-nav-floating').innerHTML;
    nav.dataset.navigationItems = ids.join(',');
    nav.style.setProperty('--nav-count', String(ids.length));
  }
  const selected = bottomNavigationRoute(active, ids);
  nav.querySelectorAll('.floating-nav-item').forEach(item => {
    const yes = item.dataset.route === selected;
    item.classList.toggle('active', yes);
    if (yes) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current');
  });
  const indicator = nav.querySelector('.floating-nav-indicator');
  if (indicator) {
    indicator.hidden = !selected;
    if (indicator.dataset.indicatorRoute !== selected) {
      indicator.dataset.indicatorRoute = selected;
      const menu = menus.find(item => item.id === selected);
      indicator.innerHTML = menu ? svg(menu.icon) : '';
    }
  }
}
