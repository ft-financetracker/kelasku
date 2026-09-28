import { api } from '../core/api.js';
import { esc, svg, toast, logo } from '../core/utils.js';
import { go } from '../core/router.js';

let currentToken='';

export function renderAttendanceLanding(){
  const params=new URL(window.location.href).searchParams;currentToken=params.get('a')||params.get('attendance')||'';
  if(!currentToken){go('attendance');return;}
  document.getElementById('app').innerHTML=`<div class="attendance-focus-page">
    <header class="attendance-focus-topbar">${logo()}<button id="attendance-landing-back" class="btn btn-secondary btn-sm">${svg('i-back')} Kembali</button></header>
    <main class="attendance-focus-main">
      <div class="attendance-focus-intro"><div class="eyebrow">KELASKU • CHECK-IN</div><h1>Presensi Kelas</h1><p>Satu halaman untuk mencatat kehadiran dengan cepat.</p></div>
      <div id="attendance-landing-slot">${landingSkeleton()}</div>
    </main>
  </div>`;
  document.getElementById('attendance-landing-back').onclick=backToContext;
  loadLanding();
}

function backToContext(){
  clearAttendanceQuery();
  const classId=sessionStorage.getItem('kelasku_selected_class')||'';
  if(classId) go('class'); else go('dashboard');
}

async function loadLanding(){
  const slot=document.getElementById('attendance-landing-slot');
  try{const data=await api('getAttendanceLanding',{token:currentToken});if(data?.class?.class_id){sessionStorage.setItem('kelasku_selected_class',data.class.class_id);}drawLanding(data);}catch(err){slot.innerHTML=`<section class="panel attendance-landing-card error-panel"><strong>Presensi tidak dapat dibuka.</strong><p>${esc(err.message)}</p><button id="landing-error-back" class="btn btn-secondary">Kembali</button></section>`;document.getElementById('landing-error-back').onclick=backToContext;}
}

function drawLanding(data){
  const slot=document.getElementById('attendance-landing-slot');const s=data.session||{},c=data.class||{},rec=data.my_record||{},status=String(s.window_status||'OPEN').toUpperCase(),can=Boolean(data.can_self_checkin),marked=String(rec.attendance_status||'UNMARKED')!=='UNMARKED';
  const channels=(s.channels||[]);const statusChoices=[['PRESENT','Hadir','check_circle'],...(s.sick_enabled!==false?[['SICK','Sakit','sick']]:[]),...(s.permit_enabled!==false?[['PERMIT','Izin','assignment']]:[])];
  slot.innerHTML=`<section class="panel attendance-landing-card attendance-landing-clean">
    <div class="attendance-landing-hero">
      <div class="class-hero-icon">${svg('i-check')}</div>
      <div class="attendance-landing-title"><span class="eyebrow">${esc(c.name||'KelasKu')}</span><h2>${esc(s.title||'Sesi Presensi')}</h2><p>${esc(formatDateTime(s.start_at))}${s.end_at?` — ${esc(formatTime(s.end_at))}`:''}</p></div>
      <span class="attendance-window-chip window-${status.toLowerCase()}">${esc(windowLabel(status))}</span>
    </div>
    <div class="attendance-window-info compact">
      <div><small>Dibuka</small><strong>${esc(formatDateTime(s.open_at||s.start_at))}</strong></div>
      <div><small>Ditutup</small><strong>${esc(formatDateTime(s.close_at||s.end_at))}</strong></div>
      <div><small>Status Kamu</small><strong>${esc(statusLabel(rec.attendance_status||'UNMARKED'))}${rec.attendance_channel?` • ${esc(channelLabel(rec.attendance_channel))}`:''}${rec.punctuality?` • ${esc(punctualityLabel(rec.punctuality))}`:''}</strong></div>
    </div>
    ${s.lateness_enabled?`<div class="attendance-rule-note"><span class="material-symbols-rounded">schedule</span><span>Keterlambatan dicatat${s.late_after_at?` setelah ${esc(formatTime(s.late_after_at))}`:''}.</span></div>`:''}
    <div id="landing-checkin-status" class="request-status"></div>
    ${marked?`<div class="alert success">Presensi sudah tercatat sebagai <strong>${esc(statusLabel(rec.attendance_status))}</strong>${rec.punctuality?` • ${esc(punctualityLabel(rec.punctuality))}`:''}. Perubahan setelah submit hanya dapat dilakukan pengelola kelas dari Ruang Kelas.</div><div class="attendance-submit-row"><button type="button" id="attendance-back-class" class="btn btn-secondary">Kembali ke Kelas</button></div>`:can?`<div class="attendance-self-form compact">
      <div class="attendance-form-label">Status kehadiran</div>
      <div class="attendance-status-choice">${statusChoices.map(([v,l,i])=>`<button type="button" data-att-status="${v}" class="attendance-choice ${v==='PRESENT'?'active':''}"><span class="material-symbols-rounded">${i}</span><span>${l}</span></button>`).join('')}</div>
      <div id="attendance-channel-choice" class="attendance-channel-choice"><div class="attendance-form-label">Mengikuti melalui</div><div class="attendance-channel-row">${channels.length?channels.map((ch,i)=>`<button type="button" data-att-channel="${esc(ch)}" class="attendance-channel ${i===0?'active':''}">${esc(channelLabel(ch))}</button>`).join(''):'<span class="soft-chip">Media tidak dibatasi</span>'}</div></div>
      <label class="field attendance-note-field"><span>Catatan <small>(opsional)</small></span><input id="attendance-self-note" class="control" value="" placeholder="Catatan singkat"></label>
      <div class="attendance-submit-row"><button id="landing-checkin" class="btn btn-primary attendance-submit-btn" ${status!=='OPEN'?'disabled':''}>Kirim Presensi</button><button type="button" id="attendance-back-class" class="btn btn-secondary">Kembali ke Kelas</button></div>
    </div>`:`<div class="alert">${status==='UPCOMING'?'Presensi belum dibuka.':status==='CLOSED'?'Waktu presensi sudah ditutup.':'Sesi ini menggunakan presensi manual oleh pengelola.'}</div><div class="attendance-submit-row"><button type="button" id="attendance-back-class" class="btn btn-secondary">Kembali ke Kelas</button></div>`}
  </section>`;
  let selectedStatus='PRESENT',selectedChannel=String(channels[0]||'');
  document.querySelectorAll('[data-att-status]').forEach(btn=>btn.onclick=()=>{selectedStatus=btn.dataset.attStatus;document.querySelectorAll('[data-att-status]').forEach(x=>x.classList.toggle('active',x===btn));document.getElementById('attendance-channel-choice')?.classList.toggle('hidden',selectedStatus!=='PRESENT');});
  document.querySelectorAll('[data-att-channel]').forEach(btn=>btn.onclick=()=>{selectedChannel=btn.dataset.attChannel;document.querySelectorAll('[data-att-channel]').forEach(x=>x.classList.toggle('active',x===btn));});
  document.getElementById('landing-checkin')?.addEventListener('click',()=>checkIn(selectedStatus,selectedChannel));
  document.getElementById('attendance-back-class')?.addEventListener('click',backToContext);
}

async function checkIn(attendanceStatus='PRESENT',attendanceChannel=''){
  const btn=document.getElementById('landing-checkin'),status=document.getElementById('landing-checkin-status');if(!btn||btn.disabled)return;const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Mencatat…</span>';status.className='request-status progress';status.textContent='Mencatat presensi. Jangan klik dua kali.';
  try{const result=await api('selfCheckInAttendance',{token:currentToken,attendance_status:attendanceStatus,attendance_channel:attendanceChannel,note:document.getElementById('attendance-self-note')?.value||''},{onSlow:()=>status.textContent='Server masih memproses. Data hanya akan dicatat satu kali.'});status.className='request-status ok';status.textContent=`Tersimpan: ${statusLabel(result.attendance_status)}${result.attendance_channel?` • ${channelLabel(result.attendance_channel)}`:''}${result.punctuality?` • ${punctualityLabel(result.punctuality)}`:''}`;toast('Presensi tersimpan.');await loadLanding();}catch(err){status.className='request-status error';status.textContent=err.message;btn.disabled=false;btn.innerHTML=old;}
}

function clearAttendanceQuery(){const url=new URL(window.location.href);url.searchParams.delete('a');url.searchParams.delete('attendance');history.replaceState({},'',url.pathname+(url.search||''));}
function landingSkeleton(){return '<div class="panel fast-load-panel"><span class="status-dot"></span><div><strong>Memeriksa sesi presensi…</strong><small>Identitas dan status sesi sedang diverifikasi.</small></div></div>';}
function formatDateTime(v){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}catch{return v||'-';}}
function formatTime(v){try{return new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit'}).format(new Date(v));}catch{return '-';}}
function windowLabel(v){const s=String(v||'OPEN').toUpperCase();return s==='UPCOMING'?'Belum Dibuka':s==='CLOSED'?'Ditutup':'Aktif';}
function statusLabel(v){return ({PRESENT:'Hadir',SICK:'Sakit',PERMIT:'Izin',ABSENT:'Alpa',UNMARKED:'Belum'})[String(v||'UNMARKED').toUpperCase()]||String(v||'-');}
function channelLabel(v){return ({ZOOM:'Zoom',YOUTUBE:'YouTube',OFFLINE:'Offline',OTHER:'Lainnya'})[String(v||'').toUpperCase()]||String(v||'-');}
function punctualityLabel(v){return ({ON_TIME:'Tepat Waktu',LATE:'Terlambat'})[String(v||'').toUpperCase()]||String(v||'-');}
