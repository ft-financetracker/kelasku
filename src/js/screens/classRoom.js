import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { go } from '../core/router.js';

export function renderClassRoom() {
  const classId = state.selectedClassId || sessionStorage.getItem('kelasku_selected_class') || '';
  if (!classId) { go('classes'); return; }
  state.selectedClassId = classId;

  const content = `
    <div class="page-head"><div><div class="eyebrow">11–12 • Class Members & Permission</div><h1>Ruang Kelas</h1><p id="class-room-subtitle">Memuat detail kelas…</p></div><button id="back-classes" class="btn btn-secondary">${svg('i-back')} Kembali</button></div>
    <div id="class-room-slot">${roomSkeleton()}</div>`;

  document.getElementById('app').innerHTML = appShell({ active: 'classes', content, hideSearch: true });
  bindAppShell();
  document.getElementById('back-classes').onclick = () => go('classes');
  loadClassDetail();
}

async function loadClassDetail() {
  const slot = document.getElementById('class-room-slot');
  try {
    const data = await api('getClassDetail', { class_id: state.selectedClassId });
    drawClass(data);
  } catch (err) {
    slot.innerHTML = `<div class="panel error-panel"><strong>Kelas gagal dimuat.</strong><p>${esc(err.message)}</p><button class="btn btn-secondary" id="back-error">Kembali ke Kelas</button></div>`;
    document.getElementById('back-error').onclick = () => go('classes');
  }
}

function drawClass(data) {
  const c = data.class || {};
  const p = data.permissions || {};
  const s = data.settings || {};
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
      <button class="room-tab active" data-tab="overview">Ringkasan</button>
      <button class="room-tab" data-tab="members">Anggota <span>${(data.members||[]).length}</span></button>
      ${p.can_manage_members ? `<button class="room-tab" data-tab="requests">Permintaan <span>${(data.pending_requests||[]).length}</span></button>`:''}
      ${p.can_manage_class ? '<button class="room-tab" data-tab="settings">Pengaturan Kelas</button>':''}
    </div>

    <div id="room-content"></div>`;

  document.querySelectorAll('[data-copy]').forEach(btn => btn.onclick = () => copyText(btn.dataset.copy));
  document.querySelectorAll('.room-tab').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab, data));
  switchTab('overview', data);
}

function switchTab(tab, data) {
  document.querySelectorAll('.room-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  const slot = document.getElementById('room-content');
  if (tab === 'members') slot.innerHTML = membersHtml(data);
  else if (tab === 'requests') slot.innerHTML = requestsHtml(data);
  else if (tab === 'settings') slot.innerHTML = settingsHtml(data);
  else slot.innerHTML = overviewHtml(data);
  bindTab(tab, data);
}

function overviewHtml(data) {
  const c=data.class||{}, p=data.permissions||{};
  return `<section class="settings-grid two-settings room-overview">
    <div class="panel"><div class="panel-head"><div class="panel-title">Fondasi Kelas</div></div><div class="detail-list">
      ${detail('Role kamu', c.role||'MEMBER')}${detail('Class Code', c.class_code||'-')}${detail('Visibilitas', c.visibility||'-')}${detail('Anggota aktif', String((data.members||[]).length))}
    </div></div>
    <div class="panel"><div class="panel-head"><div class="panel-title">Fitur Berikutnya</div></div><div class="feature-roadmap"><span>Materi</span><span>Tugas</span><span>Jadwal</span><span>Pengumuman</span><span>Absensi</span><span>Diskusi</span></div><p class="copy compact-copy">Phase 2 mengunci identitas kelas, akses anggota, role, dan permission terlebih dahulu.</p></div>
    ${p.can_manage_class ? `<div class="panel wide-panel"><div class="panel-head"><div class="panel-title">Akses Cepat Pengelola</div></div><div class="page-actions"><button id="quick-settings" class="btn btn-primary">${svg('i-gear')} Pengaturan Kelas</button><button id="quick-members" class="btn btn-secondary">${svg('i-users')} Kelola Anggota</button></div></div>`:''}
  </section>`;
}

function membersHtml(data) {
  const p=data.permissions||{};
  const items=data.members||[];
  return `<section class="panel"><div class="panel-head"><div><div class="panel-title">Anggota Kelas</div><p class="panel-copy">Role berlaku khusus di kelas ini, bukan global aplikasi.</p></div></div>
    <div class="member-list">${items.length?items.map(m=>memberRow(m,p)).join(''):'<div class="search-empty">Belum ada anggota.</div>'}</div></section>`;
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
  return `<form id="class-settings-form" class="settings-layout">
    <section class="panel settings-section"><div class="settings-section-head"><div><h2>Identitas Kelas</h2><p>Informasi utama yang dilihat anggota.</p></div>${svg('i-class')}</div>
      <div class="field"><label>Nama Kelas</label><input class="control" name="name" value="${esc(c.name||'')}"></div><div class="field"><label>Deskripsi</label><textarea class="control" rows="3" name="description">${esc(c.description||'')}</textarea></div><div class="form-grid"><div class="field"><label>Institusi</label><input class="control" name="institution" value="${esc(c.institution||'')}"></div><div class="field"><label>Angkatan</label><input class="control" name="cohort" value="${esc(c.cohort||'')}"></div></div>
      <button type="button" id="save-class-profile" class="btn btn-secondary btn-block">Simpan Identitas</button>
    </section>
    <section class="panel settings-section"><div class="settings-section-head"><div><h2>Akses & Join</h2><p>Atur siapa yang dapat menemukan dan masuk.</p></div>${svg('i-key')}</div>
      ${selectRow('Visibilitas','visibility',c.visibility,[['PUBLIC','Public'],['DISCOVERABLE','Discoverable'],['PRIVATE','Private']])}
      ${toggleRow('Perlu persetujuan', 'join_approval', s.join_approval)}${toggleRow('Join Code aktif','join_code_enabled',s.join_code_enabled)}${toggleRow('Daftar anggota terlihat','member_list_visible',s.member_list_visible)}
      ${p.can_regenerate_join_code?'<button type="button" id="regen-code" class="btn btn-secondary btn-block">Generate Ulang Join Code</button>':''}
    </section>
    <section class="panel settings-section"><div class="settings-section-head"><div><h2>Permission Member</h2><p>Default permission untuk member biasa.</p></div>${svg('i-shield')}</div>
      ${toggleRow('Boleh posting diskusi','allow_member_posts',s.allow_member_posts)}${toggleRow('Boleh upload file','allow_member_uploads',s.allow_member_uploads)}${toggleRow('Boleh invite orang','allow_member_invites',s.allow_member_invites)}
      <button id="save-class-settings" type="submit" class="btn btn-primary btn-block">Simpan Pengaturan</button><div id="class-settings-status" class="request-status"></div>
    </section>
  </form>`;
}

function bindTab(tab,data) {
  if(tab==='overview'){
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

async function decideRequest(requestId,decision){
  try{ await api('decideJoinRequest',{request_id:requestId,decision}); toast(decision==='APPROVE'?'Anggota diterima.':'Permintaan ditolak.'); await loadClassDetail(); }catch(err){toast(err.message);}
}
async function changeRole(userId,role){
  try{await api('setClassMemberRole',{class_id:state.selectedClassId,user_id:userId,class_role:role});toast('Role anggota diperbarui.');await loadClassDetail();}catch(err){toast(err.message);await loadClassDetail();}
}
async function removeMember(userId){
  if(!confirm('Keluarkan anggota ini dari kelas?'))return;
  try{await api('removeClassMember',{class_id:state.selectedClassId,user_id:userId});toast('Anggota dikeluarkan.');await loadClassDetail();}catch(err){toast(err.message);}
}
async function saveClassProfile(data){
  const form=document.getElementById('class-settings-form'); const btn=document.getElementById('save-class-profile'); const old=btn.innerHTML; btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';
  try{await api('updateClassProfile',{class_id:state.selectedClassId,name:form.name.value,description:form.description.value,institution:form.institution.value,cohort:form.cohort.value});toast('Identitas kelas tersimpan.');await loadClassDetail();}catch(err){toast(err.message);}finally{btn.disabled=false;btn.innerHTML=old;}
}
async function saveClassSettings(event,data){
  event.preventDefault(); const form=event.currentTarget; const btn=document.getElementById('save-class-settings'); const status=document.getElementById('class-settings-status'); const old=btn.innerHTML; btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Menyimpan…</span>';
  const payload={class_id:state.selectedClassId,visibility:form.visibility.value,join_approval:form.join_approval.checked,join_code_enabled:form.join_code_enabled.checked,member_list_visible:form.member_list_visible.checked,allow_member_posts:form.allow_member_posts.checked,allow_member_uploads:form.allow_member_uploads.checked,allow_member_invites:form.allow_member_invites.checked};
  try{await api('updateClassSettings',payload);status.className='request-status ok';status.textContent='Tersimpan ✓';toast('Pengaturan kelas tersimpan.');await loadClassDetail();}catch(err){status.className='request-status error';status.textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=old;}
}
async function regenerateJoinCode(){
  if(!confirm('Generate ulang Join Code? Kode lama tidak dapat dipakai lagi.'))return;
  try{const data=await api('regenerateJoinCode',{class_id:state.selectedClassId});toast('Join Code baru: '+data.join_code);await loadClassDetail();}catch(err){toast(err.message);}
}
async function copyText(text){try{await navigator.clipboard.writeText(text||'');toast('Kode disalin.');}catch{toast('Gagal menyalin otomatis.');}}
function detail(label,value){return `<div class="detail-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;}
function initials(name){return String(name||'K').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'K';}
function selectRow(label,name,value,options){return `<label class="setting-row"><span><strong>${esc(label)}</strong></span><select class="control setting-control" name="${esc(name)}">${options.map(x=>`<option value="${x[0]}" ${String(value)===x[0]?'selected':''}>${esc(x[1])}</option>`).join('')}</select></label>`;}
function toggleRow(label,name,value){return `<label class="setting-row"><span><strong>${esc(label)}</strong></span><span class="switch"><input type="checkbox" name="${esc(name)}" ${truthy(value)?'checked':''}><span></span></span></label>`;}
function truthy(v){return v===true||String(v).toUpperCase()==='TRUE'||String(v)==='1';}
function roomSkeleton(){return `<div class="class-hero panel skeleton" style="height:190px"></div><div class="panel skeleton" style="height:300px;margin-top:16px"></div>`;}
