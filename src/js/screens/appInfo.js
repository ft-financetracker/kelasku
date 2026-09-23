import { state } from '../core/state.js';
import { C, esc, svg, toast } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { getAppSetupState, checkForAppUpdate, updateApp } from '../core/pwa.js';
import { go } from '../core/router.js';

const CHANGELOG_CACHE_KEY='kelasku_changelog_cache';

export function renderAppInfo(){
  const content=`
    <div class="page-head app-info-head"><div><div class="eyebrow">INFORMASI APLIKASI</div><h1>KelasKu</h1><p>Versi, status PWA, dan timeline pembaruan aplikasi.</p></div><button type="button" id="app-info-back" class="btn btn-secondary">${svg('i-back')} Pengaturan</button></div>
    <section class="app-info-hero panel">
      <div class="app-info-logo"><img src="assets/brand/logo-mark.svg" alt="KelasKu"></div>
      <div><span class="app-info-kicker">BELAJAR BERSAMA LEBIH MUDAH</span><h2>KelasKu v${esc(C.APP_VERSION)}</h2><p>Build ${esc(C.BUILD)} · Sistem Komunikasi & Informasi Kelas</p></div>
      <button type="button" id="app-info-check" class="btn btn-primary">${svg('i-refresh')} Cek Update</button>
    </section>
    <div id="app-info-update-status" class="request-status"></div>
    <section class="app-info-status-grid">
      ${statusCard('i-download','PWA',getAppSetupState().installed?'Terpasang':'Browser mode')}
      ${statusCard('i-bell','Notifikasi',notificationLabel())}
      ${statusCard('i-refresh','Versi',`v${C.APP_VERSION}`)}
      ${statusCard('i-shield','Build',C.BUILD)}
    </section>
    <section class="panel app-timeline-panel"><div class="panel-head"><div><div class="panel-title">Timeline Pembaruan</div><p class="panel-copy">Riwayat fitur dan perbaikan KelasKu, dari foundation hingga versi saat ini.</p></div><span id="release-count" class="phase-badge">…</span></div><div id="release-timeline">${timelineSkeleton()}</div></section>`;

  document.getElementById('app').innerHTML=appShell({active:'app-info',content,hideSearch:true});
  bindAppShell();
  document.getElementById('app-info-back').onclick=()=>go('settings');
  document.getElementById('app-info-check').onclick=manualCheck;
  const cached=readCache();
  if(cached) drawTimeline(cached);
  loadTimeline(Boolean(cached));
}

function statusCard(icon,label,value){return `<div class="app-info-status-card"><span>${svg(icon)}</span><div><small>${esc(label)}</small><strong>${esc(value)}</strong></div></div>`;}
function notificationLabel(){if(!('Notification'in window))return'Tidak didukung';return Notification.permission==='granted'?'Aktif':Notification.permission==='denied'?'Diblokir':'Belum aktif';}
function timelineSkeleton(){return `<div class="app-release-list">${[1,2,3].map(()=>'<div class="app-release-card skeleton" style="height:120px"></div>').join('')}</div>`;}
function readCache(){try{return JSON.parse(localStorage.getItem(CHANGELOG_CACHE_KEY)||'null');}catch{return null;}}

async function loadTimeline(background=false){
  try{
    const res=await fetch(`./changelog.json?t=${Date.now()}`,{cache:'no-store'});
    if(!res.ok)throw new Error('Changelog tidak dapat dimuat.');
    const data=await res.json();
    localStorage.setItem(CHANGELOG_CACHE_KEY,JSON.stringify(data));
    drawTimeline(data);
  }catch(err){if(!background){document.getElementById('release-timeline').innerHTML=`<div class="alert danger">${esc(err.message)}</div>`;}}
}

function drawTimeline(data){
  const releases=Array.isArray(data?.releases)?data.releases:[];
  const slot=document.getElementById('release-timeline');
  const count=document.getElementById('release-count');
  if(count)count.textContent=`${releases.length} RILIS`;
  if(!slot)return;
  slot.innerHTML=releases.length?`<div class="app-release-list">${releases.map(releaseCard).join('')}</div>`:'<div class="search-empty">Belum ada riwayat pembaruan.</div>';
}

function releaseCard(r,index){
  const groups=Array.isArray(r.groups)?r.groups:[];
  const changes=groups.length?groups.map(g=>`<div class="app-release-group"><strong>${esc(g.label||'Perubahan')}</strong><ul>${(g.items||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`).join(''):`<div class="app-release-group"><ul>${(r.changes||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
  return `<article class="app-release-card ${index===0?'is-latest':''}"><div class="app-release-rail"><span></span></div><div class="app-release-body"><header><div><span class="app-release-version">v${esc(r.version||'-')}</span><strong>${esc(r.title||'Pembaruan KelasKu')}</strong><small>${esc(r.date||'')} · Build ${esc(r.build||'-')}</small></div>${index===0?'<b>TERBARU</b>':''}</header><p>${esc(r.description||'')}</p>${changes}</div></article>`;
}

async function manualCheck(){
  const btn=document.getElementById('app-info-check');const status=document.getElementById('app-info-update-status');const old=btn.innerHTML;
  btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Mengecek…</span>';status.className='request-status progress';status.textContent='Memeriksa versi terbaru…';
  try{const result=await checkForAppUpdate({notify:false});if(result.available){status.className='request-status ok';status.innerHTML=`Update v${esc(result.version)} tersedia. <button type="button" id="app-info-update-now" class="button-link">Update sekarang</button>`;document.getElementById('app-info-update-now').onclick=updateApp;}else{status.className='request-status ok';status.textContent='KelasKu sudah menggunakan versi terbaru ✓';}}
  catch(err){status.className='request-status error';status.textContent=err.message;toast(err.message);}
  finally{btn.disabled=false;btn.innerHTML=old;}
}
