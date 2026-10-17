// C9: presentation and deliberate pull refresh only. No API, polling or router writes.
let releaseShell = null;
let lastNavIndex = null;
const PULL_THRESHOLD = 60;
const PULL_LIMIT = 84;

export function bottomNavigationRoute(active = '') {
  if (['classes','class','join','schedule','materials','announcements','attendance','attendance-link'].includes(active)) return 'classes';
  if (active === 'tasks' || active === 'messages') return active;
  if (['account','profile','settings','app-info'].includes(active) || String(active).startsWith('admin')) return 'account';
  return 'dashboard';
}

// Pixel geometry: a real transparent concave cradle, including the edge stations.
export function navigationSurfacePath(width, height, center) {
  const w = Math.max(1, Number(width) || 400), h = Math.max(58, Number(height) || 72);
  const x = Math.max(34, Math.min(w - 34, Number(center) || w / 2));
  const left = Math.max(0, x - 46), right = Math.min(w, x + 46);
  const corner = Math.max(0, Math.min(16, left, w - right));
  const n = value => Math.round(value * 100) / 100;
  return `M ${n(corner)} .5 H ${n(left)} C ${n(x-35)} .5 ${n(x-34)} 5 ${n(x-32)} 13 C ${n(x-28)} 33 ${n(x-18)} 44 ${n(x)} 44 C ${n(x+18)} 44 ${n(x+28)} 33 ${n(x+32)} 13 C ${n(x+34)} 5 ${n(x+35)} .5 ${n(right)} .5 H ${n(w-corner)} Q ${n(w-.5)} .5 ${n(w-.5)} ${n(corner)} V ${n(h)} H .5 V ${n(corner)} Q .5 .5 ${n(corner)} .5 Z`;
}

function bindFloatingNavigation(shell) {
  const nav = shell.querySelector('.bottom-nav-floating');
  const surface = nav?.querySelector('.floating-nav-surface');
  const path = surface?.querySelector('path');
  const items = nav ? [...nav.querySelectorAll('.floating-nav-item')] : [];
  const index = items.findIndex(item => item.classList.contains('active'));
  if (!path || index < 0) return () => {};
  const hit = items[index].querySelector('.floating-nav-hit');
  let frame = 0, lastWidth = 0, lastHeight = 0;
  const reduced = () => document.documentElement.classList.contains('kk-mobile-safe-render') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const paint = (animate = false) => {
    cancelAnimationFrame(frame);
    const box = nav.getBoundingClientRect();
    if (!box.width || !box.height) return;
    lastWidth = box.width; lastHeight = box.height;
    const center = i => { const r = items[i].getBoundingClientRect(); return r.left + r.width / 2 - box.left; };
    const end = center(index), start = animate && lastNavIndex !== null ? center(lastNavIndex) : end;
    surface.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    const draw = x => {
      path.setAttribute('d', navigationSurfacePath(box.width, box.height, x));
      if (hit) hit.style.transform = `translateX(${Math.round((x-end)*100)/100}px)`;
    };
    draw(start);
    lastNavIndex = index;
    if (start === end || reduced()) { draw(end); return; }
    let started;
    const step = now => {
      if (!nav.isConnected) return;
      started ??= now;
      const t = Math.min(1, (now-started)/220), eased = 1-Math.pow(1-t,3);
      draw(start+(end-start)*eased);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  paint(true);
  const resized = () => { const box = nav.getBoundingClientRect(); if (Math.abs(box.width-lastWidth)>.5 || Math.abs(box.height-lastHeight)>.5) paint(); };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resized) : null;
  observer?.observe(nav);
  window.addEventListener('resize', resized, {passive:true});
  return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', resized); };
}

function bindPullRefresh(shell, options) {
  const main = shell.querySelector('.main');
  const status = main?.querySelector('.shell-pull-status');
  const label = status?.querySelector('[data-pull-label]');
  if (!main || !status || typeof options.onRefresh !== 'function') return () => {};
  let touch = null, distance = 0, busy = false, disposed = false, lastStarted = -Infinity;
  const current = () => !disposed && main.isConnected && (!options.isCurrent || options.isCurrent());
  const mobile = () => Boolean(window.matchMedia?.('(max-width:900px)').matches);
  const top = () => Math.max(0, main.scrollTop || 0, document.scrollingElement?.scrollTop || 0, window.scrollY || 0) <= 1;
  const blocked = () => Boolean(document.querySelector('.overlay:not(.hidden),[aria-modal="true"],.app-dialog-backdrop,.drawer:not(.hidden),.update-progress-overlay'));
  const reset = () => {
    touch = null; distance = 0;
    if (!busy) { status.hidden = true; status.classList.remove('is-ready','is-loading'); status.style.removeProperty('--pull-progress'); }
  };
  const nested = target => {
    if (!target || target.closest('button,a,input,textarea,select,[contenteditable="true"],[contenteditable=""],.room-main-nav,.message-layout,.analytics-table-wrap')) return true;
    for (let el = target; el && el !== main; el = el.parentElement) {
      const style = window.getComputedStyle(el);
      if ((/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight+1) || (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth+1)) return true;
    }
    return false;
  };
  const enabled = () => {
    const yes = mobile() && current();
    main.classList.toggle('kk-pull-enabled', yes);
    document.documentElement.classList.toggle('kk-pull-page', yes);
    if (!yes) reset();
  };
  const start = event => {
    reset();
    if (!mobile() || !current() || busy || Date.now()-lastStarted < 1800 || event.touches.length !== 1 || !top() || blocked() || nested(event.target) || options.canRefresh?.() === false) return;
    const finger = event.touches[0];
    touch = {id:finger.identifier,x:finger.clientX,y:finger.clientY};
  };
  const move = event => {
    if (!touch) return;
    if (!current() || event.touches.length !== 1 || !top() || blocked() || options.canRefresh?.() === false) { reset(); return; }
    const finger = [...event.touches].find(item => item.identifier === touch.id);
    if (!finger) { reset(); return; }
    const dx = finger.clientX-touch.x, dy = finger.clientY-touch.y;
    if (dy < -6 || (Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy)*.85)) { reset(); return; }
    if (dy <= 6) { distance = 0; status.hidden = true; return; }
    if (dy <= Math.abs(dx)*1.25) return;
    if (!event.cancelable) { reset(); return; }
    event.preventDefault();
    distance = Math.min(PULL_LIMIT,dy*.55);
    status.hidden = false;
    const ready = distance >= PULL_THRESHOLD;
    status.classList.toggle('is-ready',ready);
    status.style.setProperty('--pull-progress',String(distance/PULL_THRESHOLD));
    const text = ready ? 'Lepas untuk memperbarui' : 'Tarik untuk memperbarui';
    if (label && label.textContent !== text) label.textContent = text;
  };
  const end = async () => {
    if (!touch) return;
    const ready = distance >= PULL_THRESHOLD && current() && top() && !blocked() && options.canRefresh?.() !== false;
    touch = null;
    if (!ready) { reset(); return; }
    busy = true; lastStarted = Date.now();
    status.hidden = false; status.classList.remove('is-ready'); status.classList.add('is-loading');
    if (label) label.textContent = 'Memperbarui data…';
    try {
      if (navigator.onLine === false) throw new Error('Sedang offline. Data terakhir tetap tersedia.');
      await options.onRefresh();
    } catch (error) { if (current()) options.onError?.(error); }
    finally { busy = false; if (current()) reset(); }
  };
  main.addEventListener('touchstart',start,{passive:true});
  main.addEventListener('touchmove',move,{passive:false});
  main.addEventListener('touchend',end,{passive:true});
  main.addEventListener('touchcancel',reset,{passive:true});
  window.addEventListener('resize',enabled,{passive:true});
  enabled();
  return () => {
    disposed = true;
    main.removeEventListener('touchstart',start); main.removeEventListener('touchmove',move);
    main.removeEventListener('touchend',end); main.removeEventListener('touchcancel',reset);
    window.removeEventListener('resize',enabled);
    main.classList.remove('kk-pull-enabled'); document.documentElement.classList.remove('kk-pull-page');
    status.hidden = true;
  };
}

export function bindShellInteractions(shell, options = {}) {
  releaseShell?.(); releaseShell = null;
  if (!shell) return;
  const releaseNav = bindFloatingNavigation(shell), releasePull = bindPullRefresh(shell,options);
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(() => { if (!shell.isConnected) release(); }) : null;
  const host = document.getElementById('app');
  const release = () => { releaseNav(); releasePull(); observer?.disconnect(); if (releaseShell === release) releaseShell = null; };
  if (host) observer?.observe(host,{childList:true});
  releaseShell = release;
}
