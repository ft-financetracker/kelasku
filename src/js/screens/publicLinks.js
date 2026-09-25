import { api } from '../core/api.js';
import { state } from '../core/state.js';

const content = document.getElementById('public-links-content');
const params = new URLSearchParams(location.search);
const rawCode = (params.get('c') || '').trim();
let deferredInstallPrompt = null;

const PLATFORM = {
  WHATSAPP: ['WhatsApp', 'chat', 'Terhubung ke ruang diskusi kelas'],
  ZOOM: ['Zoom', 'videocam', 'Masuk ke perkuliahan online'],
  GOOGLE_DRIVE: ['Google Drive', 'folder', 'Materi dan dokumen kelas'],
  GOOGLE_MEET: ['Google Meet', 'video_call', 'Pertemuan kelas online'],
  YOUTUBE: ['YouTube', 'smart_display', 'Channel dan playlist pembelajaran'],
  TELEGRAM: ['Telegram', 'send', 'Kanal komunikasi tambahan'],
  WEBSITE: ['Website', 'language', 'Sumber dan portal kelas'],
  OTHER: ['Lainnya', 'link', 'Akses penting lainnya']
};
const ORDERED = ['WHATSAPP','ZOOM','GOOGLE_MEET','GOOGLE_DRIVE','YOUTUBE','TELEGRAM','WEBSITE','OTHER'];
const esc = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const classCode = rawCode ? (rawCode.toUpperCase().startsWith('KLS-') ? rawCode.toUpperCase() : 'KLS-' + rawCode.toUpperCase()) : '';
const fmtDate = value => { try { return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value)); } catch { return value || '-'; } };
const isFuture = value => value && new Date(value).getTime() >= Date.now();

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; updateInstallButton(); });
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; updateInstallButton(); });

function groupsFromItems(items=[]) {
  return items.reduce((acc,item) => { const key=PLATFORM[item.platform]?item.platform:'OTHER'; (acc[key] ||= []).push(item); return acc; }, {});
}

function groupSection(key, items) {
  const [label, icon, copy] = PLATFORM[key] || PLATFORM.OTHER;
  const visible = items.slice(0,3);
  const extra = items.slice(3);
  const cards = arr => arr.map(item => `<a class="public-link-card" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span class="public-link-icon material-symbols-rounded">${icon}</span><span class="public-link-copy"><strong>${esc(item.label)}</strong>${item.description?`<small>${esc(item.description)}</small>`:''}</span><span class="material-symbols-rounded public-link-arrow">arrow_outward</span></a>`).join('');
  return `<section class="public-link-group" data-public-group="${key}">
    <div class="public-group-hero platform-${key.toLowerCase()}"><div class="public-group-art"><span class="material-symbols-rounded">${icon}</span></div><div><span class="public-kicker">AKSES CEPAT</span><strong>${esc(label)}</strong><small>${esc(copy)} · ${items.length} link</small></div></div>
    <div class="public-link-list">${cards(visible)}<div class="public-link-extra" ${extra.length?'hidden':''}>${cards(extra)}</div></div>
    ${extra.length?`<button class="public-show-more" type="button" data-show-more="${key}"><span>Lihat ${extra.length} link lainnya</span><span class="material-symbols-rounded">expand_more</span></button>`:''}
  </section>`;
}

function publicHero(cls) {
  return `<section class="public-hero"><span class="public-hero-icon material-symbols-rounded">school</span><div class="public-hero-copy"><span class="public-kicker">SATU LINK KELAS</span><h1>${esc(cls.name || 'Kelas')}</h1><div class="public-meta public-meta-primary">${cls.institution?`<span>${esc(cls.institution)}</span>`:''}${cls.study_program?`<span>${esc(cls.study_program)}</span>`:''}${cls.cohort?`<span>Angkatan ${esc(cls.cohort)}</span>`:''}${cls.semester?`<span>${esc(cls.semester)}</span>`:''}<span>${esc(cls.visibility || 'KELAS')}</span></div>${cls.description?`<p>${esc(cls.description)}</p>`:''}<div class="public-hero-separator"></div><small class="public-class-code">${esc(cls.class_code || '')} • ${esc(cls.status || 'ACTIVE')}</small></div></section>`;
}

function memberAcademicSections(academic={}, classId='') {
  const schedules=(academic.schedules||[]).filter(x=>isFuture(x.start_at)).slice(0,2);
  const tasks=(academic.tasks||[]).filter(x=>x.submission_status!=='SUBMITTED' && (!x.deadline || isFuture(x.deadline))).slice(0,3);
  const attendance=(academic.attendance_sessions||[]).filter(x=>String(x.window_status||'').toUpperCase()==='OPEN').slice(0,1);
  const announcements=(academic.announcements||[]).slice(0,3);
  return `<section class="public-smart-grid">
    <article class="public-info-card public-schedule-card"><div class="public-info-head"><span class="material-symbols-rounded">calendar_month</span><div><strong>Jadwal Terdekat</strong><small>Agenda yang paling relevan</small></div></div>${schedules.length?schedules.map(x=>`<div class="public-compact-item"><div><strong>${esc(x.title)}</strong><small>${esc(fmtDate(x.start_at))}${x.location?` · ${esc(x.location)}`:''}</small></div></div>`).join(''):'<div class="public-muted-state">Belum ada jadwal mendatang.</div>'}<a class="public-text-link" href="./#class" data-open-class-tab="schedule" data-class-id="${esc(classId)}">Lihat jadwal lengkap <span class="material-symbols-rounded">arrow_forward</span></a></article>
    <article class="public-info-card"><div class="public-info-head"><span class="material-symbols-rounded">checklist</span><div><strong>Tugas Aktif</strong><small>Prioritas deadline terdekat</small></div></div>${tasks.length?tasks.map(x=>`<div class="public-compact-item"><div><strong>${esc(x.title)}</strong><small>${x.deadline?`Deadline ${esc(fmtDate(x.deadline))}`:'Tanpa deadline'} · ${esc(x.submission_status||'NOT_SUBMITTED')}</small></div></div>`).join(''):'<div class="public-muted-state">Tidak ada tugas aktif.</div>'}</article>
    <article class="public-info-card public-attendance-card"><div class="public-info-head"><span class="material-symbols-rounded">done_all</span><div><strong>Presensi</strong><small>Check-in sesi yang sedang aktif</small></div></div>${attendance.length?attendance.map(x=>`<div class="public-attendance-active"><strong>${esc(x.title)}</strong><small>${esc(fmtDate(x.start_at))}</small><a href="./?a=${encodeURIComponent(x.public_token||'')}" class="public-primary-action">Isi Presensi</a></div>`).join(''):'<div class="public-muted-state">Belum ada presensi aktif.</div>'}</article>
    <article class="public-info-card"><div class="public-info-head"><span class="material-symbols-rounded">campaign</span><div><strong>Informasi Terbaru</strong><small>Pengumuman kelas</small></div></div>${announcements.length?announcements.map(x=>`<div class="public-compact-item"><div><strong>${esc(x.title)}</strong><small>${esc(fmtDate(x.published_at))}</small></div></div>`).join(''):'<div class="public-muted-state">Belum ada pengumuman terbaru.</div>'}</article>
  </section>`;
}

function lockedPreview(loggedIn) {
  return `<section class="public-locked"><span class="material-symbols-rounded">lock</span><div><strong>${loggedIn?'Konten ini hanya tersedia untuk anggota kelas.':'Masuk untuk melihat informasi kelas'}</strong><p>${loggedIn?'Jadwal, tugas, presensi, materi, dan informasi internal tetap terlindungi.':'Simpan satu link kelas, lalu akses jadwal, tugas, presensi, materi, dan informasi internal setelah masuk.'}</p></div><a href="./#auth" class="public-secondary-action">${loggedIn?'Buka KelasKu':'Masuk KelasKu'}</a></section>`;
}

function showcase() {
  const slides=[['dashboard','Dashboard','Semua informasi penting dalam satu layar.'],['calendar_month','Jadwal','Agenda kelas lebih teratur.'],['checklist','Tugas','Deadline dan progres lebih jelas.'],['done_all','Presensi','Check-in dan riwayat kehadiran.'],['folder','Materi','Referensi kelas tetap rapi.'],['groups','Kelola Kelas','Koordinasi anggota dalam satu ruang.']];
  return `<section class="public-showcase"><div class="public-section-head"><div><span class="public-kicker">KENAL KELASKU</span><h2>Satu ruang untuk kebutuhan kelas.</h2></div><div class="public-showcase-nav"><button type="button" data-showcase-prev aria-label="Sebelumnya"><span class="material-symbols-rounded">arrow_back</span></button><button type="button" data-showcase-next aria-label="Berikutnya"><span class="material-symbols-rounded">arrow_forward</span></button></div></div><div class="public-showcase-track" id="public-showcase-track">${slides.map(([icon,title,copy],i)=>`<article class="public-device-card"><div class="public-browser-bar"><i></i><i></i><i></i><span>kelasku.app</span></div><div class="public-device-screen"><span class="material-symbols-rounded">${icon}</span><small>PREVIEW ${String(i+1).padStart(2,'0')}</small><strong>${title}</strong><p>${copy}</p><div class="public-mock-lines"><i></i><i></i><i></i></div></div></article>`).join('')}</div><div class="public-showcase-actions"><a href="./" class="public-promo-btn">Buka KelasKu <span class="material-symbols-rounded">arrow_forward</span></a><button id="public-install-btn" type="button" class="public-install-btn" hidden>Install KelasKu <span class="material-symbols-rounded">download</span></button></div></section>`;
}

function render(data, memberData=null, academic=null) {
  const cls = data.class || {};
  document.title = `${cls.name || 'Link Kelas'} — KelasKu`;
  const isMember=Boolean(memberData);
  const loggedIn=Boolean(state.sessionToken && state.user);
  const sourceGroups=isMember?groupsFromItems(memberData.class_links||[]):(data.groups||{});
  const sections=ORDERED.filter(key=>Array.isArray(sourceGroups[key])&&sourceGroups[key].length).map(key=>groupSection(key,sourceGroups[key])).join('');
  content.innerHTML = `${publicHero(cls)}
    ${isMember?memberAcademicSections(academic||{},cls.class_id||''):lockedPreview(loggedIn)}
    <section class="public-section-block"><div class="public-section-head"><div><span class="public-kicker">LINK CEPAT</span><h2>Akses penting kelas</h2><p>Cukup simpan satu halaman ini untuk link yang paling sering dipakai.</p></div></div>${sections || `<div class="public-empty"><span class="material-symbols-rounded">link_off</span><strong>Belum ada link yang dibagikan</strong><p>Pengelola kelas belum menambahkan link untuk akses ini.</p></div>`}</section>
    ${showcase()}`;
  bindInteractions();
}

function bindInteractions(){
  document.querySelectorAll('[data-open-class-tab]').forEach(link=>link.addEventListener('click',()=>{const id=link.dataset.classId||'';if(id){sessionStorage.setItem('kelasku_selected_class',id);sessionStorage.setItem('kelasku_class_tab',link.dataset.openClassTab||'overview');}}));
  document.querySelectorAll('[data-show-more]').forEach(btn=>btn.onclick=()=>{const group=btn.closest('[data-public-group]');const extra=group?.querySelector('.public-link-extra');if(!extra)return;const opening=extra.hidden;extra.hidden=!opening;btn.classList.toggle('open',opening);btn.querySelector('span:first-child').textContent=opening?'Tampilkan lebih sedikit':`Lihat ${extra.children.length} link lainnya`;});
  const track=document.getElementById('public-showcase-track');
  document.querySelector('[data-showcase-prev]')?.addEventListener('click',()=>track?.scrollBy({left:-Math.max(260,track.clientWidth*.72),behavior:'smooth'}));
  document.querySelector('[data-showcase-next]')?.addEventListener('click',()=>track?.scrollBy({left:Math.max(260,track.clientWidth*.72),behavior:'smooth'}));
  document.getElementById('public-install-btn')?.addEventListener('click',async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;updateInstallButton();});
  updateInstallButton();
}

function updateInstallButton(){const btn=document.getElementById('public-install-btn');if(!btn)return;const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true;btn.hidden=!deferredInstallPrompt||standalone;}

function renderError(message) { content.innerHTML = `<section class="public-empty error"><span class="material-symbols-rounded">link_off</span><strong>Link kelas tidak tersedia</strong><p>${esc(message || 'Periksa kembali tautan yang dibagikan.')}</p><a href="./" class="public-promo-btn">Buka KelasKu</a></section>`; }

async function init() {
  if (!classCode) return renderError('Kode kelas tidak ditemukan pada URL.');
  try {
    const data = await api('getPublicClassLinks', { class_code: classCode }, { auth: false, timeout: 20000 });
    let memberData=null, academic=null;
    if(state.sessionToken && data.class?.class_id){
      try{memberData=await api('getClassDetail',{class_id:data.class.class_id},{timeout:16000});academic=await api('getClassAcademic',{class_id:data.class.class_id},{timeout:16000});}catch{memberData=null;academic=null;}
    }
    render(data,memberData,academic);
  } catch (err) { renderError(err.message); }
}
init();
