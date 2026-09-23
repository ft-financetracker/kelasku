import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { go } from '../core/router.js';
import { invalidateAcademicClientCache } from './academic.js';

let activeTab = 'overview';

export function renderClassRoom() {
  const classId = state.selectedClassId || sessionStorage.getItem('kelasku_selected_class') || '';
  if (!classId) { go('classes'); return; }
  state.selectedClassId = classId;

  const cached = state.classDetails[classId] || null;
  const content = `
    <div class="page-head"><div><div class="eyebrow">PHASE 3 • Ruang Kelas</div><h1>Ruang Kelas</h1><p id="class-room-subtitle">${cached ? esc(`${cached.class?.class_code || ''} · ${cached.class?.role || 'MEMBER'}`) : 'Memuat detail kelas…'}</p></div><button id="back-classes" class="btn btn-secondary">${svg('i-back')} Kembali</button></div>
    <div id="class-room-slot">${cached ? '' : roomSkeleton()}</div>`;

  document.getElementById('app').innerHTML = appShell({ active: 'classes', content, hideSearch: true });
  bindAppShell();
  document.getElementById('back-classes').onclick = () => go('classes');
  activeTab = 'overview';
  if (cached) drawClass(cached, false);
  loadClassDetail(Boolean(cached));
}

async function loadClassDetail(background = false) {
  const slot = document.getElementById('class-room-slot');
  try {
    const data = await api('getClassDetail', { class_id: state.selectedClassId });
    state.classDetails[state.selectedClassId] = data;
    drawClass(data, true);
  } catch (err) {
    if (!background && slot) {
      slot.innerHTML = `<div class="panel error-panel"><strong>Kelas gagal dimuat.</strong><p>${esc(err.message)}</p><button class="btn btn-secondary" id="back-error">Kembali ke Kelas</button></div>`;
      document.getElementById('back-error').onclick = () => go('classes');
    }
  }
}

function drawClass(data, preserveTab = true) {
  const c = data.class || {};
  const p = data.permissions || {};
  const desiredTab = preserveTab ? activeTab : 'overview';
  document.getElementById('class-room-subtitle').textContent = `${c.class_code || ''} · ${c.role || 'MEMBER'}`;

  document.getElementById('class-room-slot').innerHTML = `
    <section class="class-hero panel">
      <div class="class-hero-icon">${svg('i-class')}</div>
      <div class="class-hero-main"><div class="role-pill role-${String(c.role||'member').toLowerCase()}">${esc(c.role || 'MEMBER')}</div><h2>${esc(c.name)}</h2><p>${esc(c.description || 'Belum ada deskripsi kelas.')}</p><div class="class-meta-line"><span>${esc(c.institution || 'KelasKu')}</span>${c.cohort?`<span>Angkatan ${esc(c.cohort)}</span>`:''}<span>${esc(c.visibility || 'DISCOVERABLE')}</span></div></div>
      <div class="class-code-stack">
        <div class="code-card"><span>Class Code</span><strong>${esc(c.class_code || '-')}</strong><button data-copy="${esc(c.class_code || '')}" class="icon-btn mini">${svg('i-copy')}</button></div>
        ${p.can_manage_class ? `<div class="code-card"><span>Join Code</span><strong id="join-code-value">${esc(c.join_code || '-')}</strong><button data-copy="${esc(c.join_code || '')}" class="icon-btn mini">${svg('i-copy')}</button></div>`:''}
      </div>
    </section>

    <div class="room-tabs" id="room-tabs">
      ${tabButton('overview','Ringkasan')}
      ${tabButton('announcements','Pengumuman')}
      ${tabButton('schedule','Jadwal')}
      ${tabButton('tasks','Tugas')}
      ${tabButton('materials','Materi')}
      ${tabButton('attendance','Absensi')}
      ${tabButton('members',`Anggota <span>${(data.members||[]).length}</span>`)}
      ${p.can_manage_members ? tabButton('requests',`Permintaan <span>${(data.pending_requests||[]).length}</span>`) : ''}
      ${p.can_manage_class ? tabButton('settings','Pengaturan Kelas') : ''}
    </div>

    <div id="room-content"></div>`;

  document.querySelectorAll('[data-copy]').forEach(btn => btn.onclick = () => copyText(btn.dataset.copy));
  document.querySelectorAll('.room-tab').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab, data));
  switchTab(desiredTab, data);
}

function tabButton(tab,label){ return `<button class="room-tab ${activeTab===tab?'active':''}" data-tab="${tab}">${label}</button>`; }

function switchTab(tab, data) {
  activeTab = tab;
  document.querySelectorAll('.room-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  const slot = document.getElementById('room-content');
  if (!slot) return;

  if (['announcements','schedule','tasks','materials','attendance'].includes(tab)) {
    const cached = state.classAcademic[state.selectedClassId];
    if (cached) drawAcademicTab(tab, cached);
    else slot.innerHTML = academicRoomSkeleton();
    loadClassAcademic(Boolean(cached));
    return;
  }

  if (tab === 'members') slot.innerHTML = membersHtml(data);
  else if (tab === 'requests') slot.innerHTML = requestsHtml(data);
  else if (tab === 'settings') slot.innerHTML = settingsHtml(data);
  else slot.innerHTML = overviewHtml(data);
  bindTab(tab, data);
}

async function loadClassAcademic(background = false) {
  try {
    const data = await api('getClassAcademic', { class_id: state.selectedClassId });
    state.classAcademic[state.selectedClassId] = data;
    if (['announcements','schedule','tasks','materials','attendance'].includes(activeTab)) drawAcademicTab(activeTab, data);
  } catch (err) {
    if (!background && ['announcements','schedule','tasks','materials','attendance'].includes(activeTab)) {
      document.getElementById('room-content').innerHTML = `<div class="panel error-panel"><strong>Data akademik gagal dimuat.</strong><p>${esc(err.message)}</p></div>`;
    }
  }
}

function overviewHtml(data) {
  const c=data.class||{}, p=data.permissions||{};
  return `<section class="settings-grid two-settings room-overview">
    <div class="panel"><div class="panel-head"><div><div class="panel-title">Fondasi Kelas</div><p class="panel-copy">Identitas dan akses kelas aktif.</p></div></div><div class="detail-list">
      ${detail('Role kamu', c.role||'MEMBER')}${detail('Class Code', c.class_code||'-')}${detail('Visibilitas', c.visibility||'-')}${detail('Anggota aktif', String((data.members||[]).length))}
    </div></div>
    <div class="panel"><div class="panel-head"><div><div class="panel-title">Academic Core</div><p class="panel-copy">Phase 3 sudah aktif.</p></div></div><div class="class-module-grid">
      ${moduleButton('i-mega','Pengumuman','Informasi resmi kelas','announcements')}
      ${moduleButton('i-calendar','Jadwal','Agenda perkuliahan','schedule')}
      ${moduleButton('i-task','Tugas','Deadline & pengumpulan','tasks')}
      ${moduleButton('i-file','Materi','Link & catatan materi','materials')}
      ${moduleButton('i-check','Absensi','Kehadiran per pertemuan','attendance')}
    </div></div>
    ${p.can_manage_class ? `<div class="panel wide-panel"><div class="panel-head"><div><div class="panel-title">Akses Cepat Pengelola</div><p class="panel-copy">Kelola anggota dan konfigurasi kelas.</p></div></div><div class="page-actions"><button id="quick-settings" class="btn btn-primary">${svg('i-gear')} Pengaturan Kelas</button><button id="quick-members" class="btn btn-secondary">${svg('i-users')} Kelola Anggota</button></div></div>`:''}
  </section>`;
}

function moduleButton(icon,title,copy,tab){ return `<button type="button" class="class-module-card" data-module-tab="${tab}"><span>${svg(icon)}</span><span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span>${svg('i-arrow')}</button>`; }

function drawAcademicTab(tab, data) {
  const slot = document.getElementById('room-content');
  if (!slot) return;
  const p = data.permissions || {};
  if (tab === 'announcements') slot.innerHTML = announcementsRoom(data.announcements || [], p);
  if (tab === 'schedule') slot.innerHTML = scheduleRoom(data.schedules || [], p);
  if (tab === 'tasks') slot.innerHTML = tasksRoom(data.tasks || [], p);
  if (tab === 'materials') slot.innerHTML = materialsRoom(data.materials || [], p);
  if (tab === 'attendance') slot.innerHTML = attendanceRoom(data.attendance_sessions || [], p);
  bindAcademicTab(tab, data);
}

function announcementsRoom(items,p) {
  return `<section class="panel class-academic-panel">
    <div class="panel-head"><div><div class="panel-title">Pengumuman Kelas</div><p class="panel-copy">Informasi resmi yang tidak tenggelam di chat.</p></div>${p.can_publish?`<button id="create-announcement" class="btn btn-primary">${svg('i-plus')} Buat</button>`:''}</div>
    <div class="announcement-feed class-feed">${items.length?items.map(x=>`<article class="announcement-card priority-${String(x.priority||'normal').toLowerCase()}"><div class="announcement-marker">${svg('i-mega')}</div><div><div class="academic-meta-line"><span>${esc(shortDateTime(x.published_at))}</span><span>${esc(x.priority||'NORMAL')}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.body||'')}</p></div>${p.can_publish?archiveButton('ANNOUNCEMENT',x.announcement_id):''}</article>`).join(''):'<div class="search-empty">Belum ada pengumuman.</div>'}</div>
  </section>`;
}

function scheduleRoom(items,p) {
  const sorted=[...items].sort((a,b)=>dateMs(a.start_at)-dateMs(b.start_at));
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Jadwal Kelas</div><p class="panel-copy">Agenda dan lokasi perkuliahan.</p></div>${p.can_manage_academic?`<button id="create-schedule" class="btn btn-primary">${svg('i-plus')} Tambah Jadwal</button>`:''}</div>
  <div class="academic-card-list">${sorted.length?sorted.map(x=>`<article class="academic-row-card"><div class="academic-date-tile"><strong>${esc(dayPart(x.start_at))}</strong><span>${esc(monthPart(x.start_at))}</span></div><div class="academic-row-main"><div class="academic-meta-line"><span>${esc(timeRange(x.start_at,x.end_at))}</span><span>${esc(x.location||'Tanpa lokasi')}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.description||'')}</p></div>${p.can_manage_academic?archiveButton('SCHEDULE',x.schedule_id):''}</article>`).join(''):'<div class="search-empty">Belum ada jadwal.</div>'}</div></section>`;
}

function tasksRoom(items,p) {
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Tugas Kelas</div><p class="panel-copy">Deadline dan status pengumpulan kamu.</p></div>${p.can_manage_academic?`<button id="create-task" class="btn btn-primary">${svg('i-plus')} Buat Tugas</button>`:''}</div>
  <div class="academic-card-list">${items.length?items.map(x=>`<article class="academic-row-card"><span class="academic-type-icon">${svg('i-task')}</span><div class="academic-row-main"><div class="academic-meta-line"><span>${esc(deadlineText(x.deadline))}</span><span>${esc(x.submission_mode||'NONE')}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.description||'')}</p><small>Status kamu: ${esc(x.submission_status||'NOT_SUBMITTED')}</small></div><div class="academic-row-actions"><button type="button" class="btn btn-secondary small-btn" data-open-global-task="${esc(x.task_id)}">Buka</button>${p.can_manage_academic?archiveButton('TASK',x.task_id):''}</div></article>`).join(''):'<div class="search-empty">Belum ada tugas.</div>'}</div></section>`;
}

function materialsRoom(items,p) {
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Materi Kelas</div><p class="panel-copy">Link referensi dan catatan belajar.</p></div>${p.can_publish?`<button id="create-material" class="btn btn-primary">${svg('i-plus')} Tambah Materi</button>`:''}</div>
  <div class="academic-material-grid">${items.length?items.map(x=>`<article class="academic-material-card panel"><div class="academic-material-icon">${svg(x.material_type==='LINK'?'i-link':'i-file')}</div><div class="academic-meta-line"><span>${esc(shortDate(x.published_at))}</span><span>${esc(x.material_type||'LINK')}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.description||'')}</p><div class="academic-row-actions">${x.url?`<button type="button" class="btn btn-secondary small-btn" data-open-material-url="${esc(x.url)}">${svg('i-link')} Buka</button>`:''}${p.can_publish?archiveButton('MATERIAL',x.material_id):''}</div></article>`).join(''):'<div class="search-empty">Belum ada materi.</div>'}</div></section>`;
}

function attendanceRoom(items,p) {
  return `<section class="panel class-academic-panel"><div class="panel-head"><div><div class="panel-title">Absensi</div><p class="panel-copy">Satu sesi per pertemuan, status tersimpan per anggota.</p></div>${p.can_manage_attendance?`<button id="create-attendance" class="btn btn-primary">${svg('i-plus')} Buat Sesi</button>`:''}</div>
  <div class="academic-card-list">${items.length?items.map(x=>`<button type="button" class="academic-row-card academic-row-button" data-attendance-id="${esc(x.attendance_id)}"><span class="academic-type-icon">${svg('i-check')}</span><span class="academic-row-main"><span class="academic-meta-line"><span>${esc(shortDateTime(x.start_at))}</span><span>${esc(timeRange(x.start_at,x.end_at))}</span></span><strong class="academic-row-title">${esc(x.title)}</strong><span class="academic-row-copy">Status kamu: ${esc(x.my_status||'UNMARKED')}</span></span>${svg('i-arrow')}</button>`).join(''):'<div class="search-empty">Belum ada sesi absensi.</div>'}</div></section>`;
}

function bindAcademicTab(tab,data) {
  const p=data.permissions||{};
  if(tab==='announcements'&&p.can_publish) document.getElementById('create-announcement').onclick=openCreateAnnouncement;
  if(tab==='schedule'&&p.can_manage_academic) document.getElementById('create-schedule').onclick=openCreateSchedule;
  if(tab==='tasks'&&p.can_manage_academic) document.getElementById('create-task').onclick=openCreateTask;
  if(tab==='materials'&&p.can_publish) document.getElementById('create-material').onclick=openCreateMaterial;
  if(tab==='attendance'&&p.can_manage_attendance) document.getElementById('create-attendance').onclick=openCreateAttendance;
  document.querySelectorAll('[data-archive-type]').forEach(btn=>btn.onclick=()=>archiveItem(btn.dataset.archiveType,btn.dataset.archiveId));
  document.querySelectorAll('[data-open-material-url]').forEach(btn=>btn.onclick=()=>openExternal(btn.dataset.openMaterialUrl));
  document.querySelectorAll('[data-open-global-task]').forEach(btn=>btn.onclick=()=>go('tasks'));
  document.querySelectorAll('[data-attendance-id]').forEach(btn=>btn.onclick=()=>openAttendance(btn.dataset.attendanceId));
}

function openCreateAnnouncement(){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Pengumuman</div><h2>Buat Pengumuman</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-create-form"><div class="field"><label>Judul</label><input name="title" class="control" required minlength="3"></div><div class="field"><label>Isi</label><textarea name="body" class="control" rows="5" required></textarea></div><div class="field"><label>Prioritas</label><select name="priority" class="control"><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option><option value="LOW">Low</option></select></div>${formFooter('Publikasikan')}</form>`);
  bindCreateForm('createAnnouncement');
}
function openCreateSchedule(){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Jadwal</div><h2>Tambah Jadwal</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-create-form"><div class="field"><label>Judul</label><input name="title" class="control" required minlength="3"></div><div class="field"><label>Deskripsi</label><textarea name="description" class="control" rows="3"></textarea></div><div class="form-grid"><div class="field"><label>Mulai</label><input name="start_at" type="datetime-local" class="control" required></div><div class="field"><label>Selesai</label><input name="end_at" type="datetime-local" class="control"></div></div><div class="field"><label>Lokasi / Link Zoom</label><input name="location" class="control"></div>${formFooter('Simpan Jadwal')}</form>`);
  bindCreateForm('createSchedule');
}
function openCreateTask(){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Tugas</div><h2>Buat Tugas</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-create-form"><div class="field"><label>Judul</label><input name="title" class="control" required minlength="3"></div><div class="field"><label>Instruksi</label><textarea name="description" class="control" rows="5"></textarea></div><div class="form-grid"><div class="field"><label>Deadline</label><input name="deadline" type="datetime-local" class="control"></div><div class="field"><label>Mode Pengumpulan</label><select name="submission_mode" class="control"><option value="TEXT_LINK">Teks atau Link</option><option value="TEXT">Teks</option><option value="LINK">Link</option><option value="NONE">Tidak melalui KelasKu</option></select></div></div><label class="setting-card"><span class="setting-card-copy"><strong>Izinkan terlambat</strong><small>Status akan ditandai LATE.</small></span><span class="switch"><input name="allow_late" type="checkbox" checked><span></span></span></label>${formFooter('Terbitkan Tugas')}</form>`);
  bindCreateForm('createTask');
}
function openCreateMaterial(){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Materi</div><h2>Tambah Materi</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-create-form"><div class="field"><label>Judul</label><input name="title" class="control" required minlength="3"></div><div class="field"><label>Deskripsi / Catatan</label><textarea name="description" class="control" rows="4"></textarea></div><div class="field"><label>Tipe</label><select name="material_type" id="material-type" class="control"><option value="LINK">Link</option><option value="NOTE">Catatan</option></select></div><div class="field" id="material-url-field"><label>URL</label><input name="url" type="url" class="control" placeholder="https://…"></div>${formFooter('Publikasikan Materi')}</form>`);
  document.getElementById('material-type').onchange=e=>document.getElementById('material-url-field').classList.toggle('hidden',e.target.value==='NOTE');
  bindCreateForm('createMaterial');
}
function openCreateAttendance(){
  const nowLocal=toLocalInput(new Date());
  showModal(`<div class="modal-head"><div><div class="eyebrow">Absensi</div><h2>Buat Sesi Absensi</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><form id="academic-create-form"><div class="field"><label>Judul Pertemuan</label><input name="title" class="control" placeholder="Pertemuan 01 — Pengantar Ekonomi" required minlength="3"></div><div class="form-grid"><div class="field"><label>Mulai</label><input name="start_at" type="datetime-local" class="control" value="${esc(nowLocal)}" required></div><div class="field"><label>Selesai</label><input name="end_at" type="datetime-local" class="control"></div></div><p class="form-help">Saat dibuat, seluruh anggota aktif otomatis disiapkan sebagai UNMARKED agar pencatatan berikutnya cukup satu kali simpan.</p>${formFooter('Buat Sesi')}</form>`);
  bindCreateForm('createAttendanceSession');
}

function formFooter(label){return `<div id="academic-form-status" class="request-status"></div><button id="academic-form-submit" class="btn btn-primary btn-block" type="submit">${esc(label)}</button>`;}
function bindCreateForm(action){
  document.getElementById('academic-create-form').onsubmit=async e=>{
    e.preventDefault(); const form=e.currentTarget,btn=document.getElementById('academic-form-submit'),status=document.getElementById('academic-form-status'),old=btn.innerHTML;
    btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';status.className='request-status progress';status.textContent='Menyimpan dalam satu proses…';
    const payload=Object.fromEntries(new FormData(form));
    payload.class_id=state.selectedClassId;
    if(form.allow_late) payload.allow_late=form.allow_late.checked;
    ['start_at','end_at','deadline'].forEach(key=>{
      if(payload[key]){
        const parsed=new Date(payload[key]);
        if(Number.isFinite(parsed.getTime())) payload[key]=parsed.toISOString();
      }
    });
    try{await api(action,payload,{onSlow:()=>status.textContent='Masih diproses. Jangan klik dua kali.'});closeModal();toast('Data berhasil disimpan.');await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}
  };
}

async function refreshAcademicAfterMutation(){ invalidateAcademicClientCache(state.selectedClassId); delete state.classAcademic[state.selectedClassId]; await loadClassAcademic(false); }
async function archiveItem(type,id){ if(!confirm('Arsipkan item ini?'))return; try{await api('archiveAcademicItem',{type,id});toast('Item diarsipkan.');await refreshAcademicAfterMutation();}catch(err){toast(err.message);} }
function archiveButton(type,id){return `<button type="button" class="icon-btn mini danger-btn" data-archive-type="${esc(type)}" data-archive-id="${esc(id)}" title="Arsipkan">${svg('i-close')}</button>`;}

async function openAttendance(attendanceId){
  showModal(`<div class="modal-head"><div><div class="eyebrow">Absensi</div><h2>Memuat sesi…</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="search-loading"><span class="status-dot"></span>Memuat data anggota…</div>`);
  try{const data=await api('getAttendanceSessionDetail',{attendance_id:attendanceId});drawAttendanceModal(data);}catch(err){showModal(`<div class="modal-head"><h2>Absensi</h2><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div><div class="alert danger">${esc(err.message)}</div>`);}
}
function drawAttendanceModal(data){
  const s=data.session||{};
  const body=data.can_manage?`<form id="attendance-record-form"><div class="attendance-record-list">${(data.records||[]).map(attendanceRecordRow).join('')}</div><div id="attendance-save-status" class="request-status"></div><button id="attendance-save-btn" class="btn btn-primary btn-block" type="submit">Simpan Absensi</button></form>`:`<div class="attendance-own-card"><span class="academic-type-icon">${svg('i-check')}</span><div><span>Status Kehadiran</span><strong>${esc(data.records?.[0]?.attendance_status||'UNMARKED')}</strong><small>${esc(data.records?.[0]?.note||'Belum ada catatan.')}</small></div></div>`;
  showModal(`<div class="modal-head"><div><div class="eyebrow">Absensi • ${esc(shortDateTime(s.start_at))}</div><h2>${esc(s.title||'Sesi Absensi')}</h2></div><button class="icon-btn mini" data-close-modal>${svg('i-close')}</button></div>${body}`);
  if(data.can_manage) document.getElementById('attendance-record-form').onsubmit=e=>saveAttendance(e,s.attendance_id);
}
function attendanceRecordRow(r){return `<div class="attendance-record-row" data-att-user="${esc(r.user_id)}"><div class="member-avatar">${initials(r.full_name||r.username)}</div><div class="member-info"><strong>${esc(r.full_name||r.username)}</strong><span>@${esc(r.username||'-')} · ${esc(r.kelasku_id||'-')}</span></div><select class="control compact-control" data-att-status><option value="UNMARKED" ${r.attendance_status==='UNMARKED'?'selected':''}>Belum</option><option value="PRESENT" ${r.attendance_status==='PRESENT'?'selected':''}>Hadir</option><option value="SICK" ${r.attendance_status==='SICK'?'selected':''}>Sakit</option><option value="PERMIT" ${r.attendance_status==='PERMIT'?'selected':''}>Izin</option><option value="ABSENT" ${r.attendance_status==='ABSENT'?'selected':''}>Alpa</option></select><input class="control compact-control" data-att-note placeholder="Catatan" value="${esc(r.note||'')}"></div>`;}
async function saveAttendance(event,attendanceId){event.preventDefault();const btn=document.getElementById('attendance-save-btn'),status=document.getElementById('attendance-save-status'),old=btn.innerHTML;const records=[...document.querySelectorAll('[data-att-user]')].map(row=>({user_id:row.dataset.attUser,attendance_status:row.querySelector('[data-att-status]').value,note:row.querySelector('[data-att-note]').value}));btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';status.className='request-status progress';status.textContent=`Menyimpan ${records.length} anggota dalam satu request…`;try{await api('saveAttendanceRecords',{attendance_id:attendanceId,records},{onSlow:()=>status.textContent='Masih menyimpan. Jangan klik dua kali.'});toast('Absensi tersimpan.');closeModal();await refreshAcademicAfterMutation();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}}

function membersHtml(data) {
  const p=data.permissions||{};
  const items=data.members||[];
  return `<section class="panel"><div class="panel-head"><div><div class="panel-title">Anggota Kelas</div><p class="panel-copy">Role berlaku khusus di kelas ini, bukan global aplikasi.</p></div></div><div class="member-list">${items.length?items.map(m=>memberRow(m,p)).join(''):'<div class="search-empty">Belum ada anggota.</div>'}</div></section>`;
}
function memberRow(m,p) {
  const canEdit=p.can_manage_roles && m.class_role!=='OWNER';
  const canRemove=p.can_manage_members && m.class_role!=='OWNER';
  return `<div class="member-row"><div class="member-avatar">${initials(m.full_name||m.username)}</div><div class="member-info"><strong>${esc(m.full_name||m.username)}</strong><span>@${esc(m.username||'-')} · ${esc(m.kelasku_id||'-')}</span><small>${esc(m.study_program||'')} ${m.cohort?'· '+esc(m.cohort):''}</small></div><div class="member-actions">${canEdit?`<select class="control role-select" data-role-user="${esc(m.user_id)}"><option value="MEMBER" ${m.class_role==='MEMBER'?'selected':''}>Member</option><option value="MODERATOR" ${m.class_role==='MODERATOR'?'selected':''}>Moderator</option><option value="COORDINATOR" ${m.class_role==='COORDINATOR'?'selected':''}>Coordinator</option></select>`:`<span class="role-pill role-${String(m.class_role||'member').toLowerCase()}">${esc(m.class_role||'MEMBER')}</span>`}${canRemove?`<button class="icon-btn mini danger-btn" data-remove-user="${esc(m.user_id)}">${svg('i-close')}</button>`:''}</div></div>`;
}
function requestsHtml(data) {
  const items=data.pending_requests||[];
  return `<section class="panel"><div class="panel-head"><div><div class="panel-title">Permintaan Bergabung</div><p class="panel-copy">Approve atau reject tanpa membuka Spreadsheet.</p></div></div><div class="member-list">${items.length?items.map(r=>`<div class="member-row"><div class="member-avatar">${initials(r.full_name||r.username)}</div><div class="member-info"><strong>${esc(r.full_name||r.username)}</strong><span>@${esc(r.username||'-')} · ${esc(r.kelasku_id||'-')}</span><small>${esc(r.message||'Tanpa pesan')}</small></div><div class="member-actions"><button class="btn btn-secondary small-btn" data-request="${esc(r.request_id)}" data-decision="REJECT">Tolak</button><button class="btn btn-primary small-btn" data-request="${esc(r.request_id)}" data-decision="APPROVE">Terima</button></div></div>`).join(''):'<div class="search-empty">Tidak ada permintaan yang menunggu.</div>'}</div></section>`;
}
function settingsHtml(data) {
  const c=data.class||{}, s=data.settings||{}, p=data.permissions||{};
  return `<form id="class-settings-form" class="settings-layout"><section class="panel settings-section"><div class="settings-section-head"><div><h2>Identitas Kelas</h2><p>Informasi utama yang dilihat anggota.</p></div>${svg('i-class')}</div><div class="field"><label>Nama Kelas</label><input class="control" name="name" value="${esc(c.name||'')}"></div><div class="field"><label>Deskripsi</label><textarea class="control" rows="3" name="description">${esc(c.description||'')}</textarea></div><div class="form-grid"><div class="field"><label>Institusi</label><input class="control" name="institution" value="${esc(c.institution||'')}"></div><div class="field"><label>Angkatan</label><input class="control" name="cohort" value="${esc(c.cohort||'')}"></div></div><button type="button" id="save-class-profile" class="btn btn-secondary btn-block">Simpan Identitas</button></section><section class="panel settings-section"><div class="settings-section-head"><div><h2>Akses & Join</h2><p>Atur siapa yang dapat menemukan dan masuk.</p></div>${svg('i-key')}</div>${selectRow('Visibilitas','visibility',c.visibility,[['PUBLIC','Public'],['DISCOVERABLE','Discoverable'],['PRIVATE','Private']])}${toggleRow('Perlu persetujuan','join_approval',s.join_approval)}${toggleRow('Join Code aktif','join_code_enabled',s.join_code_enabled)}${toggleRow('Daftar anggota terlihat','member_list_visible',s.member_list_visible)}${p.can_regenerate_join_code?'<button type="button" id="regen-code" class="btn btn-secondary btn-block">Generate Ulang Join Code</button>':''}</section><section class="panel settings-section"><div class="settings-section-head"><div><h2>Permission Member</h2><p>Default permission untuk member biasa.</p></div>${svg('i-shield')}</div>${toggleRow('Boleh posting diskusi','allow_member_posts',s.allow_member_posts)}${toggleRow('Boleh upload file','allow_member_uploads',s.allow_member_uploads)}${toggleRow('Boleh invite orang','allow_member_invites',s.allow_member_invites)}<button id="save-class-settings" type="submit" class="btn btn-primary btn-block">Simpan Pengaturan</button><div id="class-settings-status" class="request-status"></div></section></form>`;
}

function bindTab(tab,data) {
  if(tab==='overview'){
    document.querySelectorAll('[data-module-tab]').forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.moduleTab,data));
    const qs=document.getElementById('quick-settings'); if(qs) qs.onclick=()=>switchTab('settings',data);
    const qm=document.getElementById('quick-members'); if(qm) qm.onclick=()=>switchTab('members',data);
  }
  if(tab==='members'){
    document.querySelectorAll('[data-role-user]').forEach(sel=>sel.onchange=()=>changeRole(sel.dataset.roleUser,sel.value));
    document.querySelectorAll('[data-remove-user]').forEach(btn=>btn.onclick=()=>removeMember(btn.dataset.removeUser));
  }
  if(tab==='requests') document.querySelectorAll('[data-request]').forEach(btn=>btn.onclick=()=>decideRequest(btn.dataset.request,btn.dataset.decision));
  if(tab==='settings'){
    document.getElementById('class-settings-form').onsubmit=e=>saveClassSettings(e,data);
    document.getElementById('save-class-profile').onclick=()=>saveClassProfile(data);
    const regen=document.getElementById('regen-code'); if(regen) regen.onclick=regenerateJoinCode;
  }
}

async function decideRequest(requestId,decision){try{await api('decideJoinRequest',{request_id:requestId,decision});toast(decision==='APPROVE'?'Anggota diterima.':'Permintaan ditolak.');delete state.classDetails[state.selectedClassId];await loadClassDetail(false);}catch(err){toast(err.message);}}
async function changeRole(userId,role){try{await api('setClassMemberRole',{class_id:state.selectedClassId,user_id:userId,class_role:role});toast('Role anggota diperbarui.');delete state.classDetails[state.selectedClassId];await loadClassDetail(false);}catch(err){toast(err.message);delete state.classDetails[state.selectedClassId];await loadClassDetail(false);}}
async function removeMember(userId){if(!confirm('Keluarkan anggota ini dari kelas?'))return;try{await api('removeClassMember',{class_id:state.selectedClassId,user_id:userId});toast('Anggota dikeluarkan.');delete state.classDetails[state.selectedClassId];await loadClassDetail(false);}catch(err){toast(err.message);}}
async function saveClassProfile(){const form=document.getElementById('class-settings-form'),btn=document.getElementById('save-class-profile'),old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';try{await api('updateClassProfile',{class_id:state.selectedClassId,name:form.name.value,description:form.description.value,institution:form.institution.value,cohort:form.cohort.value});toast('Identitas kelas tersimpan.');delete state.classDetails[state.selectedClassId];await loadClassDetail(false);}catch(err){toast(err.message);}finally{btn.disabled=false;btn.innerHTML=old;}}
async function saveClassSettings(event){event.preventDefault();const form=event.currentTarget,btn=document.getElementById('save-class-settings'),status=document.getElementById('class-settings-status'),old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';const payload={class_id:state.selectedClassId,visibility:form.visibility.value,join_approval:form.join_approval.checked,join_code_enabled:form.join_code_enabled.checked,member_list_visible:form.member_list_visible.checked,allow_member_posts:form.allow_member_posts.checked,allow_member_uploads:form.allow_member_uploads.checked,allow_member_invites:form.allow_member_invites.checked};try{await api('updateClassSettings',payload);status.className='request-status ok';status.textContent='Tersimpan ✓';toast('Pengaturan kelas tersimpan.');delete state.classDetails[state.selectedClassId];await loadClassDetail(false);}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}}
async function regenerateJoinCode(){if(!confirm('Generate ulang Join Code? Kode lama tidak dapat dipakai lagi.'))return;try{const data=await api('regenerateJoinCode',{class_id:state.selectedClassId});toast('Join Code baru: '+data.join_code);delete state.classDetails[state.selectedClassId];await loadClassDetail(false);}catch(err){toast(err.message);}}
async function copyText(text){try{await navigator.clipboard.writeText(text||'');toast('Kode disalin.');}catch{toast('Gagal menyalin otomatis.');}}

function academicRoomSkeleton(){return `<div class="academic-card-list">${[1,2,3].map(()=>'<div class="panel skeleton" style="height:104px"></div>').join('')}</div>`;}
function roomSkeleton(){return `<div class="class-hero panel skeleton" style="height:190px"></div><div class="panel skeleton" style="height:300px;margin-top:16px"></div>`;}
function detail(label,value){return `<div class="detail-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;}
function initials(name){return String(name||'K').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'K';}
function selectRow(label,name,value,options){return `<label class="setting-row"><span><strong>${esc(label)}</strong></span><select class="control setting-control" name="${esc(name)}">${options.map(x=>`<option value="${x[0]}" ${String(value)===x[0]?'selected':''}>${esc(x[1])}</option>`).join('')}</select></label>`;}
function toggleRow(label,name,value){return `<label class="setting-row"><span><strong>${esc(label)}</strong></span><span class="switch"><input type="checkbox" name="${esc(name)}" ${truthy(value)?'checked':''}><span></span></span></label>`;}
function truthy(v){return v===true||String(v).toUpperCase()==='TRUE'||String(v)==='1';}
function showModal(html){closeModal();const el=document.createElement('div');el.id='phase-modal';el.className='overlay';el.innerHTML=`<div class="modal glass phase-modal-card">${html}</div>`;document.body.appendChild(el);el.querySelectorAll('[data-close-modal]').forEach(x=>x.onclick=closeModal);el.onclick=e=>{if(e.target===el)closeModal();};}
function closeModal(){document.getElementById('phase-modal')?.remove();}
function openExternal(url){if(!/^https?:\/\//i.test(String(url||'')))return toast('Tautan tidak valid.');window.open(url,'_blank','noopener,noreferrer');}
function dateMs(value){const n=new Date(value||'').getTime();return Number.isFinite(n)?n:0;}
function shortDate(value){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium'}).format(new Date(value));}catch{return value||'-';}}
function shortDateTime(value){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch{return value||'-';}}
function timeRange(start,end){try{const f=v=>new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit'}).format(new Date(v));return f(start)+(end?` – ${f(end)}`:'');}catch{return '';}}
function deadlineText(value){return value?'Deadline '+shortDateTime(value):'Tanpa deadline';}
function dayPart(value){try{return new Intl.DateTimeFormat('id-ID',{day:'2-digit'}).format(new Date(value));}catch{return '--';}}
function monthPart(value){try{return new Intl.DateTimeFormat('id-ID',{month:'short'}).format(new Date(value)).toUpperCase();}catch{return '---';}}
function toLocalInput(date){const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
