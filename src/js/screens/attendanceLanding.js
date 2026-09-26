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
  const slot=document.getElementById('attendance-landing-slot');const s=data.session||{},c=data.class||{},rec=data.my_record||{},status=String(s.window_status||'OPEN').toUpperCase(),can=Boolean(data.can_self_checkin),marked=String(rec.attendance_status||'UNMARKED')!=='UNMARKED';
  const channels=(s.channels||[]);const statusChoices=[['PRESENT','Hadir','check_circle'],...(s.sick_enabled!==false?[['SICK','Sakit','sick']]:[]),...(s.permit_enabled!==false?[['PERMIT','Izin','assignment']]:[])];
  slot.innerHTML=`<section class="panel attendance-landing-card"><div class="attendance-landing-hero"><div class="class-hero-icon">${svg('i-check')}</div><div><span class="eyebrow">${esc(c.name||'KelasKu')}</span><h2>${esc(s.title||'Sesi Absensi')}</h2><p>${esc(formatDateTime(s.start_at))} ${s.end_at?`– ${esc(formatTime(s.end_at))}`:''}</p></div><span class="attendance-window-chip window-${status.toLowerCase()}">${esc(windowLabel(status))}</span></div><div class="attendance-window-info"><div><small>Dibuka</small><strong>${esc(formatDateTime(s.open_at||s.start_at))}</strong></div><div><small>Ditutup</small><strong>${esc(formatDateTime(s.close_at||s.end_at))}</strong></div><div><small>Status Kamu</small><strong>${esc(statusLabel(rec.attendance_status||'UNMARKED'))}${rec.attendance_channel?` • ${esc(channelLabel(rec.attendance_channel))}`:''}${rec.punctuality?` • ${esc(punctualityLabel(rec.punctuality))}`:''}</strong></div></div>${s.lateness_enabled?`<div class="attendance-rule-note"><span class="material-symbols-rounded">schedule</span><span>Sesi ini mencatat keterlambatan${s.late_after_at?` setelah ${esc(formatTime(s.late_after_at))}`:''}.</span></div>`:''}<div id="landing-checkin-status" class="request-status"></div>${can?`<div class="attendance-self-form"><div class="attendance-status-choice">${statusChoices.map(([v,l,i])=>`<button type="button" data-att-status="${v}" class="attendance-choice ${String(rec.attendance_status)===v?'active':''}"><span class="material-symbols-rounded">${i}</span>${l}</button>`).join('')}</div><div id="attendance-channel-choice" class="attendance-channel-choice ${String(rec.attendance_status||'PRESENT')==='PRESENT'?'':'hidden'}"><small>Mengikuti melalui</small>${channels.length?channels.map(ch=>`<button type="button" data-att-channel="${esc(ch)}" class="attendance-channel ${String(rec.attendance_channel)===String(ch)?'active':''}">${esc(channelLabel(ch))}</button>`).join(''):'<span class="soft-chip">Media tidak dibatasi</span>'}</div><div class="field"><label>Catatan (opsional)</label><input id="attendance-self-note" class="control" value="${esc(rec.note||'')}" placeholder="Catatan singkat"></div><button id="landing-checkin" class="btn btn-primary btn-block" ${status!=='OPEN'?'disabled':''}>${marked?'Perbarui Presensi':'Kirim Presensi'}</button></div>`:`<div class="alert">Sesi ini menggunakan presensi manual oleh pengelola.</div>`}</section><section class="panel attendance-upcoming-panel"><div class="panel-head"><div><div class="panel-title">Jadwal Mendatang</div><p class="panel-copy">Agenda terdekat dari kelas ini.</p></div></div><div class="academic-card-list">${(data.upcoming_schedules||[]).length?(data.upcoming_schedules||[]).slice(0,5).map(x=>`<div class="academic-row-card"><div class="academic-date-tile"><strong>${esc(dayPart(x.start_at))}</strong><span>${esc(monthPart(x.start_at))}</span></div><div class="academic-row-main"><div class="academic-meta-line"><span>${esc(formatTime(x.start_at))}</span><span>${esc(x.location||'Tanpa lokasi')}</span></div><h3>${esc(x.title)}</h3></div></div>`).join(''):'<div class="search-empty">Belum ada jadwal mendatang.</div>'}</div></section>`;
  let selectedStatus=String(rec.attendance_status||'PRESENT')==='UNMARKED'?'PRESENT':String(rec.attendance_status||'PRESENT'),selectedChannel=String(rec.attendance_channel||channels[0]||'');
  document.querySelectorAll('[data-att-status]').forEach(btn=>btn.onclick=()=>{selectedStatus=btn.dataset.attStatus;document.querySelectorAll('[data-att-status]').forEach(x=>x.classList.toggle('active',x===btn));document.getElementById('attendance-channel-choice')?.classList.toggle('hidden',selectedStatus!=='PRESENT');});
  document.querySelectorAll('[data-att-channel]').forEach(btn=>btn.onclick=()=>{selectedChannel=btn.dataset.attChannel;document.querySelectorAll('[data-att-channel]').forEach(x=>x.classList.toggle('active',x===btn));});
  document.getElementById('landing-checkin')?.addEventListener('click',()=>checkIn(selectedStatus,selectedChannel));
}

async function checkIn(attendanceStatus='PRESENT',attendanceChannel=''){
  const btn=document.getElementById('landing-checkin'),status=document.getElementById('landing-checkin-status');if(!btn||btn.disabled)return;const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Mencatat…</span>';status.className='request-status progress';status.textContent='Mencatat presensi. Jangan klik dua kali.';
  try{const result=await api('selfCheckInAttendance',{token:currentToken,attendance_status:attendanceStatus,attendance_channel:attendanceChannel,note:document.getElementById('attendance-self-note')?.value||''},{onSlow:()=>status.textContent='Server masih memproses. Data hanya akan dicatat satu kali.'});status.className='request-status ok';status.textContent=`Tersimpan: ${statusLabel(result.attendance_status)}${result.attendance_channel?` • ${channelLabel(result.attendance_channel)}`:''}${result.punctuality?` • ${punctualityLabel(result.punctuality)}`:''}`;toast('Presensi tersimpan.');await loadLanding();}catch(err){status.className='request-status error';status.textContent=err.message;btn.disabled=false;btn.innerHTML=old;}
}

function clearAttendanceQuery(){const url=new URL(window.location.href);url.searchParams.delete('a');url.searchParams.delete('attendance');history.replaceState({},'',url.pathname+(url.search||''));}
function landingSkeleton(){return '<div class="panel fast-load-panel"><span class="status-dot"></span><div><strong>Memeriksa sesi absensi…</strong><small>Identitas dan status sesi sedang diverifikasi.</small></div></div>';}
function formatDateTime(v){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}catch{return v||'-';}}
function formatTime(v){try{return new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit'}).format(new Date(v));}catch{return '-';}}
function dayPart(v){try{return new Intl.DateTimeFormat('id-ID',{day:'2-digit'}).format(new Date(v));}catch{return '--';}}
function monthPart(v){try{return new Intl.DateTimeFormat('id-ID',{month:'short'}).format(new Date(v)).toUpperCase();}catch{return '---';}}
function windowLabel(v){const s=String(v||'OPEN').toUpperCase();return s==='UPCOMING'?'Belum Dibuka':s==='CLOSED'?'Ditutup':'Aktif';}

function statusLabel(v){return ({PRESENT:'Hadir',SICK:'Sakit',PERMIT:'Izin',ABSENT:'Alpa',UNMARKED:'Belum'})[String(v||'UNMARKED').toUpperCase()]||String(v||'-');}
function channelLabel(v){return ({ZOOM:'Zoom',YOUTUBE:'YouTube',OFFLINE:'Offline',OTHER:'Lainnya'})[String(v||'').toUpperCase()]||String(v||'-');}
function punctualityLabel(v){return ({ON_TIME:'Tepat Waktu',LATE:'Terlambat'})[String(v||'').toUpperCase()]||String(v||'-');}
