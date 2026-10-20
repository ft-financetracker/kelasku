// Shared shell lifecycle. No API, polling or router writes.
import { navigationActiveRoute, DEFAULT_NAVIGATION } from './navigationConfig.js?v=6741forms1';
let releaseShell = null;
let navigationController = null;
let interactionShell = null, interactionOptions = null;
const PULL_THRESHOLD = 60;
const PULL_LIMIT = 84;

export function bottomNavigationRoute(active = '', ids = DEFAULT_NAVIGATION) {
  return navigationActiveRoute(active, ids);
}

// Pixel geometry: a real transparent concave cradle, including the edge stations.
export function navigationSurfacePath(width, height, center) {
  const w = Math.max(1, Number(width) || 400), h = Math.max(58, Number(height) || 72);
  if (center === null) return `M 16 .5 H ${w-16} Q ${w-.5} .5 ${w-.5} 16 V ${h} H .5 V 16 Q .5 .5 16 .5 Z`;
  const x = Math.max(34, Math.min(w - 34, Number(center) || w / 2));
  const left = Math.max(0, x - 46), right = Math.min(w, x + 46);
  const corner = Math.max(0, Math.min(16, left, w - right));
  const n = value => Math.round(value * 100) / 100;
  return `M ${n(corner)} .5 H ${n(left)} C ${n(x-35)} .5 ${n(x-34)} 5 ${n(x-32)} 13 C ${n(x-28)} 33 ${n(x-18)} 44 ${n(x)} 44 C ${n(x+18)} 44 ${n(x+28)} 33 ${n(x+32)} 13 C ${n(x+34)} 5 ${n(x+35)} .5 ${n(right)} .5 H ${n(w-corner)} Q ${n(w-.5)} .5 ${n(w-.5)} ${n(corner)} V ${n(h)} H .5 V ${n(corner)} Q .5 .5 ${n(corner)} .5 Z`;
}

function createNavigationController(nav) {
  let frame = 0, currentX = null, targetX = null, width = 0, height = 0, disposed = false, lastPath = null, lastIndicator = null;
  const reduced = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const update = (resize = false) => {
    if (disposed || !nav.isConnected) return;
    const box = nav.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const surface = nav.querySelector('.floating-nav-surface'), path = surface?.querySelector('path');
    const indicator = nav.querySelector('.floating-nav-indicator');
    const active = nav.querySelector('.floating-nav-item.active');
    if (!surface || !path) return;
    const activeBox = active?.getBoundingClientRect();
    const end = activeBox ? activeBox.left + activeBox.width/2 - box.left : null;
    const resized = Math.abs(width-box.width)>.5 || Math.abs(height-box.height)>.5;
    const sameTarget = end === targetX && !resized && lastPath === path && lastIndicator === indicator;
    if (sameTarget && (frame || currentX === end)) return;
    cancelAnimationFrame(frame); frame = 0;
    width = box.width; height = box.height; targetX = end; lastPath = path; lastIndicator = indicator;
    surface.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const draw = x => {
      currentX = x;
      path.setAttribute('d',navigationSurfacePath(width,height,x));
      if (indicator && x !== null) indicator.style.transform = `translate3d(${Math.round((x-26)*100)/100}px,0,0)`;
    };
    if (end === null || currentX === null || currentX === end || resize || resized || reduced()) { draw(end); return; }
    const start = currentX, began = performance.now();
    const step = now => {
      frame = 0;
      if (disposed || !nav.isConnected) return;
      const progress = Math.min(1,Math.max(0,(now-began)/220));
      draw(start + (end-start)*(1-Math.pow(1-progress,3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  const resized = () => update(true);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resized) : null;
  observer?.observe(nav);
  window.addEventListener('resize',resized,{passive:true});
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const motionChanged = () => update(true);
  media?.addEventListener?.('change',motionChanged);
  return {nav,update,dispose(){disposed=true;cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',resized);media?.removeEventListener?.('change',motionChanged);}};
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
  if (shell && interactionShell === shell) {
    Object.assign(interactionOptions, options);
    refreshFloatingNavigation(shell);
    return;
  }
  releaseShell?.(); releaseShell = null;
  if (!shell) return;
  interactionShell = shell; interactionOptions = options;
  refreshFloatingNavigation(shell);
  const releasePull = bindPullRefresh(shell,options);
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(() => { if (!shell.isConnected) release(); }) : null;
  const host = document.getElementById('app');
  const release = () => {
    if (navigationController && !navigationController.nav.isConnected) { navigationController.dispose(); navigationController = null; }
    releasePull(); observer?.disconnect(); if (releaseShell === release) { releaseShell = null; interactionShell = null; interactionOptions = null; }
  };
  if (host) observer?.observe(host,{childList:true});
  releaseShell = release;
}

export function refreshFloatingNavigation(shell) {
  const nav = shell?.querySelector('.bottom-nav-floating');
  if (!nav) return;
  if (navigationController?.nav !== nav) {
    navigationController?.dispose();
    navigationController = createNavigationController(nav);
  }
  navigationController.update();
}
