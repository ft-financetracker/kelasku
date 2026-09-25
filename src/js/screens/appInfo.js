import { C, esc, svg, toast, sameData } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { getAppSetupState, checkForAppUpdate, updateApp } from '../core/pwa.js';
import { go } from '../core/router.js';

const CHANGELOG_CACHE_KEY='kelasku_changelog_cache';
const RELEASE_BATCH=20;
let allReleases=[];
let renderedCount=0;

export function renderAppInfo(){
  const content=`<div class="app-info-page">
    <div class="page-head app-info-head"><div><div class="eyebrow">INFORMASI APLIKASI</div><h1>KelasKu</h1><p>Tentang aplikasi, versi, status PWA, dan riwayat pengembangan.</p></div><button type="button" id="app-info-back" class="btn btn-secondary">${svg('i-back')} Pengaturan</button></div>
    <section class="app-info-hero panel"><div class="app-info-logo"><img src="assets/brand/logo-mark.svg?v=610" alt="KelasKu"></div><div><span class="app-info-kicker">BELAJAR BERSAMA LEBIH MUDAH</span><h2>KelasKu v${esc(C.APP_VERSION)}</h2><p>Build ${esc(C.BUILD)} · Sistem Komunikasi & Informasi Kelas</p></div><button type="button" id="app-info-check" class="btn btn-primary">${svg('i-refresh')} Cek Update</button></section>
    <div id="app-info-update-status" class="request-status"></div>
    <section class="app-info-status-grid">${statusCard('i-download','PWA',getAppSetupState().installed?'Terpasang':'Browser mode')}${statusCard('i-bell','Notifikasi',notificationLabel())}${statusCard('i-refresh','Versi',`v${C.APP_VERSION}`)}${statusCard('i-shield','Build',C.BUILD)}</section>
    <section class="panel about-kelasku"><div class="panel-head"><div><div class="panel-title">Tentang KelasKu</div><p class="panel-copy">Ruang digital kelas yang dirancang untuk mengurangi informasi tercecer.</p></div>${svg('i-info')}</div><div class="about-kelasku-grid"><article><span>${svg('i-class')}</span><div><strong>Satu ruang belajar</strong><p>Kelas, jadwal, tugas, materi, pengumuman, absensi, anggota, dan koordinasi peran tersusun dalam satu aplikasi.</p></div></article><article><span>${svg('i-download')}</span><div><strong>PWA, mobile-first</strong><p>Dapat dipasang seperti aplikasi dan tetap nyaman digunakan dari HP maupun desktop tanpa membuat aplikasi terpisah.</p></div></article><article><span>${svg('i-shield')}</span><div><strong>Akun & akses terkontrol</strong><p>Setiap kelas memiliki role, izin, Class Code, Join Code, session perangkat, dan akses yang mengikuti status anggota.</p></div></article><article><span>${svg('i-file')}</span><div><strong>Sistem terhubung</strong><p>Frontend PWA terhubung ke Apps Script, Spreadsheet sebagai metadata/database, dan Google Drive untuk penyimpanan file.</p></div></article></div></section>
    <section class="panel app-timeline-panel"><div class="panel-head"><div><div class="panel-title">Timeline Pembaruan</div><p class="panel-copy">Riwayat fitur, perbaikan, dan perubahan KelasKu. Area timeline menampilkan sekitar 5 rilis sekaligus agar tetap rapi.</p></div><span id="release-count" class="phase-badge">…</span></div><div id="release-timeline" class="app-release-scroll">${timelineSkeleton()}</div></section>
  </div>`;

  document.getElementById('app').innerHTML=appShell({active:'app-info',content,hideSearch:true});
  bindAppShell();
  document.getElementById('app-info-back').onclick=()=>go('settings');
  document.getElementById('app-info-check').onclick=manualCheck;
  const cached=readCache(); if(cached)drawTimeline(cached); loadTimeline(Boolean(cached));
}

function statusCard(icon,label,value){return `<div class="app-info-status-card"><span>${svg(icon)}</span><div><small>${esc(label)}</small><strong>${esc(value)}</strong></div></div>`;}
function notificationLabel(){if(!('Notification'in window))return'Tidak didukung';return Notification.permission==='granted'?'Aktif':Notification.permission==='denied'?'Diblokir':'Belum aktif';}
function timelineSkeleton(){return `<div class="app-release-list">${[1,2,3,4].map(()=>'<div class="app-release-card skeleton" style="height:148px"></div>').join('')}</div>`;}
function readCache(){try{return JSON.parse(localStorage.getItem(CHANGELOG_CACHE_KEY)||'null');}catch{return null;}}

async function loadTimeline(background=false){
  try{
    const cached=readCache();
    const res=await fetch(`./changelog.json?t=${Date.now()}`,{cache:'no-store'});
    if(!res.ok)throw new Error('Changelog tidak dapat dimuat.');
    const data=await res.json();
    localStorage.setItem(CHANGELOG_CACHE_KEY,JSON.stringify(data));
    if(!sameData(cached,data) || !background) drawTimeline(data);
  }catch(err){if(!background){document.getElementById('release-timeline').innerHTML=`<div class="alert danger">${esc(err.message)}</div>`;}}
}

function drawTimeline(data){
  allReleases=Array.isArray(data?.releases)?data.releases:[]; renderedCount=0;
  const slot=document.getElementById('release-timeline'),count=document.getElementById('release-count'); if(count)count.textContent=`${allReleases.length} RILIS`; if(!slot)return;
  const previousScroll=slot.scrollTop;
  if(!allReleases.length){slot.innerHTML='<div class="search-empty">Belum ada riwayat pembaruan.</div>';return;}
  slot.innerHTML='<div class="app-release-list" id="app-release-list"></div><div id="release-load-sentinel" class="release-load-sentinel"></div>';
  appendReleaseBatch();
  if(previousScroll) requestAnimationFrame(()=>{slot.scrollTop=previousScroll;});
  slot.onscroll=()=>{if(slot.scrollTop+slot.clientHeight>=slot.scrollHeight-180)appendReleaseBatch();};
}

function appendReleaseBatch(){
  const list=document.getElementById('app-release-list'); if(!list||renderedCount>=allReleases.length)return;
  const end=Math.min(renderedCount+RELEASE_BATCH,allReleases.length); const html=allReleases.slice(renderedCount,end).map((r,i)=>releaseCard(r,renderedCount+i)).join(''); list.insertAdjacentHTML('beforeend',html); renderedCount=end;
}

function releaseCard(r,index){
  const groups=Array.isArray(r.groups)?r.groups:[];
  const changes=groups.length?groups.map(g=>`<div class="app-release-group"><strong>${esc(g.label||'Perubahan')}</strong><ul>${(g.items||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`).join(''):`<div class="app-release-group"><ul>${(r.changes||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
  return `<article class="app-release-card ${index===0?'is-latest':''}"><div class="app-release-rail"><span></span></div><div class="app-release-body"><header><div><span class="app-release-version">v${esc(r.version||'-')}</span><strong>${esc(r.title||'Pembaruan KelasKu')}</strong><small>${esc(r.date||'')} · Build ${esc(r.build||'-')}</small></div>${index===0?'<b>TERBARU</b>':''}</header><p>${esc(r.description||'')}</p>${changes}</div></article>`;
}

async function manualCheck(){
  const btn=document.getElementById('app-info-check'),status=document.getElementById('app-info-update-status'),old=btn.innerHTML;if(btn.disabled)return;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Mengecek…</span>';status.className='request-status progress';status.textContent='Memeriksa versi terbaru…';
  try{const result=await checkForAppUpdate({notify:false});if(result.available){status.className='request-status ok';status.innerHTML=`Update v${esc(result.version)} tersedia. <button type="button" id="app-info-update-now" class="button-link">Update sekarang</button>`;document.getElementById('app-info-update-now').onclick=updateApp;}else{status.className='request-status ok';status.textContent='KelasKu sudah menggunakan versi terbaru ✓';}}
  catch(err){status.className='request-status error';status.textContent=err.message;toast(err.message);}finally{btn.disabled=false;btn.innerHTML=old;}
}
