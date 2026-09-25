import { api } from '../core/api.js';
import { esc, svg, toast } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { go } from '../core/router.js';

let currentToken='';

export function renderAttendanceLanding(){
  const params=new URL(window.location.href).searchParams;currentToken=params.get('a')||params.get('attendance')||'';
  if(!currentToken){go('attendance');return;}
  const content=`<div class="attendance-landing-page"><div class="page-head"><div><div class="eyebrow">KELASKU • CHECK-IN</div><h1>Absensi Kelas</h1><p>Login KelasKu diperlukan agar kehadiran tercatat pada akun yang benar.</p></div><button id="attendance-landing-back" class="btn btn-secondary">${svg('i-back')} Beranda</button></div><div id="attendance-landing-slot">${landingSkeleton()}</div></div>`;
  document.getElementById('app').innerHTML=appShell({active:'attendance',content,hideSearch:true});
  bindAppShell();
  document.getElementById('attendance-landing-back').onclick=()=>{clearAttendanceQuery();go('dashboard');};
  loadLanding();
}

async function loadLanding(){
  const slot=document.getElementById('attendance-landing-slot');
  try{const data=await api('getAttendanceLanding',{token:currentToken});drawLanding(data);}catch(err){slot.innerHTML=`<section class="panel attendance-landing-card error-panel"><strong>Absensi tidak dapat dibuka.</strong><p>${esc(err.message)}</p><button id="landing-error-back" class="btn btn-secondary">Kembali</button></section>`;document.getElementById('landing-error-back').onclick=()=>{clearAttendanceQuery();go('dashboard');};}
}

function drawLanding(data){
  const slot=document.getElementById('attendance-landing-slot'); const s=data.session||{}; const c=data.class||{}; const rec=data.my_record||{}; const status=String(s.window_status||'OPEN').toUpperCase();
  const can=Boolean(data.can_self_checkin); const already=String(rec.attendance_status||'UNMARKED')==='PRESENT';
  slot.innerHTML=`<section class="panel attendance-landing-card"><div class="attendance-landing-hero"><div class="class-hero-icon">${svg('i-check')}</div><div><span class="eyebrow">${esc(c.name||'KelasKu')}</span><h2>${esc(s.title||'Sesi Absensi')}</h2><p>${esc(formatDateTime(s.start_at))} ${s.end_at?`– ${esc(formatTime(s.end_at))}`:''}</p></div><span class="attendance-window-chip window-${status.toLowerCase()}">${esc(windowLabel(status))}</span></div><div class="attendance-window-info"><div><small>Dibuka</small><strong>${esc(formatDateTime(s.open_at||s.start_at))}</strong></div><div><small>Ditutup</small><strong>${esc(formatDateTime(s.close_at||s.end_at))}</strong></div><div><small>Status Kamu</small><strong>${esc(rec.attendance_status||'UNMARKED')}</strong></div></div><div id="landing-checkin-status" class="request-status"></div><button id="landing-checkin" class="btn btn-primary btn-block" ${(!can||already)?'disabled':''}>${already?`${svg('i-check')} Sudah Check-in`:status==='UPCOMING'?'Belum Dibuka':status==='CLOSED'?'Sesi Ditutup':`${svg('i-check')} Check-in Hadir`}</button></section><section class="panel attendance-upcoming-panel"><div class="panel-head"><div><div class="panel-title">Jadwal Mendatang</div><p class="panel-copy">Agenda terdekat dari kelas ini.</p></div></div><div class="academic-card-list">${(data.upcoming_schedules||[]).length?(data.upcoming_schedules||[]).slice(0,5).map(x=>`<div class="academic-row-card"><div class="academic-date-tile"><strong>${esc(dayPart(x.start_at))}</strong><span>${esc(monthPart(x.start_at))}</span></div><div class="academic-row-main"><div class="academic-meta-line"><span>${esc(formatTime(x.start_at))}</span><span>${esc(x.location||'Tanpa lokasi')}</span></div><h3>${esc(x.title)}</h3></div></div>`).join(''):'<div class="search-empty">Belum ada jadwal mendatang.</div>'}</div></section>`;
  document.getElementById('landing-checkin')?.addEventListener('click',checkIn);
}

async function checkIn(){
  const btn=document.getElementById('landing-checkin'),status=document.getElementById('landing-checkin-status'); if(!btn||btn.disabled)return; const old=btn.innerHTML;
  btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Mencatat kehadiran…</span>';status.className='request-status progress';status.textContent='Mencatat check-in. Jangan klik dua kali.';
  try{await api('selfCheckInAttendance',{token:currentToken},{onSlow:()=>status.textContent='Server masih memproses. Kehadiran hanya akan dicatat satu kali.'});status.className='request-status ok';status.textContent='Kehadiran berhasil dicatat ✓';toast('Check-in berhasil.');await loadLanding();}catch(err){status.className='request-status error';status.textContent=err.message;btn.disabled=false;btn.innerHTML=old;}
}

function clearAttendanceQuery(){const url=new URL(window.location.href);url.searchParams.delete('a');url.searchParams.delete('attendance');history.replaceState({},'',url.pathname+(url.search||''));}
function landingSkeleton(){return `<div class="panel skeleton" style="height:270px"></div><div class="panel skeleton" style="height:180px;margin-top:14px"></div>`;}
function formatDateTime(v){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}catch{return v||'-';}}
function formatTime(v){try{return new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit'}).format(new Date(v));}catch{return '-';}}
function dayPart(v){try{return new Intl.DateTimeFormat('id-ID',{day:'2-digit'}).format(new Date(v));}catch{return '--';}}
function monthPart(v){try{return new Intl.DateTimeFormat('id-ID',{month:'short'}).format(new Date(v)).toUpperCase();}catch{return '---';}}
function windowLabel(v){const s=String(v||'OPEN').toUpperCase();return s==='UPCOMING'?'Belum Dibuka':s==='CLOSED'?'Ditutup':'Aktif';}
