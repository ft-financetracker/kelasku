/** Class directory presentation. Membership, permissions and requests stay in classes.js. */
import { esc, svg } from '../core/utils.js';

export function isDemoClass(item = {}) {
  return item.is_demo === true || String(item.class_type || '').toUpperCase() === 'DEMO' || /^DEMO-/i.test(String(item.class_code || ''));
}
export function isArchivedClass(item = {}) { return String(item.status || '').toUpperCase() === 'ARCHIVED'; }
export function isClassMember(item = {}) {
  return String(item.membership_status || '').toUpperCase() !== 'PENDING' && Boolean(item.directory_member || item.role || item.is_member);
}
export function directoryClasses(mine = [], publicItems = []) {
  const all = new Map();
  publicItems.forEach(item => { if (item?.class_id) all.set(String(item.class_id), { ...item }); });
  mine.forEach(item => { if (item?.class_id) all.set(String(item.class_id), { ...all.get(String(item.class_id)), ...item, directory_member:true,membership_status:'ACTIVE' }); });
  return {
    mine:mine.filter(item => !isDemoClass(item) && !isArchivedClass(item)).map(item => all.get(String(item.class_id)) || item),
    public:publicItems.filter(item => !isArchivedClass(item)).map(item => all.get(String(item.class_id)) || item),
    demo:[...all.values()].filter(item => isDemoClass(item) && !isArchivedClass(item)),
    archive:[...all.values()].filter(isArchivedClass)
  };
}
export function sortDirectoryClasses(items = [], sort = 'name') {
  return [...items].sort((a,b) => {
    const value=String(a.name || '').localeCompare(String(b.name || ''), 'id', {numeric:true,sensitivity:'base'});
    return (sort === 'name-desc' ? -value : value) || String(a.class_id || '').localeCompare(String(b.class_id || ''));
  });
}
export function directoryVisibility(item = {}) {
  const key=String(item.visibility || 'DISCOVERABLE').toUpperCase();
  return key === 'PRIVATE' ? 'Dengan kode' : key === 'PUBLIC' ? 'Umum' : 'Perlu persetujuan';
}
function directoryRole(role) {
  return ({OWNER:'Pemilik',COORDINATOR:'Koordinator',MODERATOR:'Moderator',TEACHER:'Pengajar',OBSERVER:'Pengamat',MEMBER:'Anggota'})[String(role || '').toUpperCase()] || 'Anggota';
}
function imageUrl(value) { const url=String(value || '').trim(); return /^(https?:\/\/|\/(?!\/)|assets\/)/i.test(url) ? url : ''; }
function directoryImage(url, className) {
  const safe=imageUrl(url);
  return safe ? `<img class="${className}" src="${esc(safe)}" alt="" loading="lazy" decoding="async" data-directory-image>` : '';
}
export function directoryCardHtml(item, {mine = false, banner = ''} = {}) {
  const member=mine || isClassMember(item),demo=isDemoClass(item),archived=isArchivedClass(item);
  const pending=String(item.membership_status || '').toUpperCase() === 'PENDING';
  const id=esc(String(item.class_id || '')),name=esc(item.name || 'Kelas');
  const label=archived ? 'Arsip' : demo ? 'Demo' : directoryVisibility(item);
  const action=archived ? 'Lihat Informasi' : member ? demo ? 'Buka Demo' : 'Buka Kelas' : demo ? 'Lihat Demo' : pending ? 'Lihat Permintaan' : 'Lihat Kelas';
  const code=String(item.class_code || '');
  const count=Number(item.member_count),hasCount=item.member_count !== undefined && item.member_count !== null && Number.isFinite(count) && count >= 0;
  const subtitle=[item.institution || 'KelasKu',item.cohort ? `Angkatan ${item.cohort}` : ''].filter(Boolean).join(' · ');
  const chips=[item.study_program || '',item.semester || ''].filter(Boolean);
  const identity=item.icon_key && String(item.icon_key)!=='school' ? `<span class="material-symbols-rounded cl-card-custom-icon">${esc(item.icon_key)}</span>` : svg('i-class');
  return `<article class="cl-card${demo?' is-demo':''}${archived?' is-archived':''}">
    <div class="cl-card-banner" aria-hidden="true">${directoryImage(banner,'cl-banner-image')}<span class="cl-banner-pattern">${svg(demo?'i-eye':'i-class')}</span></div>
    <div class="cl-card-top"><span class="cl-badge${demo?' cl-badge-demo':''}">${esc(label)}</span><span class="cl-card-state">${archived?'Selesai':pending?'Menunggu persetujuan':'Aktif'}</span></div>
    <div class="cl-card-main"><span class="cl-card-logo" aria-hidden="true">${identity}${directoryImage(item.cover_url,'cl-logo-image')}</span><div class="cl-card-copy"><h3>${name}</h3><p>${esc(subtitle)}</p>${chips.length?`<div class="cl-card-chips">${chips.map(text=>`<span>${esc(text)}</span>`).join('')}</div>`:''}</div></div>
    <div class="cl-card-meta">${code?`<span class="cl-code">${esc(code)}</span>`:''}${member?`<span>${esc(directoryRole(item.role))}</span>`:''}${item.is_class_leader?'<span>Ketua Kelas</span>':''}${hasCount?`<span>${count} anggota</span>`:''}</div>
    <div class="cl-card-foot"><span>${demo?'Ruang contoh KelasKu':member?'Sudah bergabung':pending?'Permintaan sedang diproses':'Lihat informasi sebelum bergabung'}</span><button type="button" class="cl-open" ${member&&!archived?`data-open-class="${id}"`:`data-directory-preview="${id}"`} aria-label="${esc(action)}: ${name}">${esc(action)}${svg('i-arrow')}</button></div>
  </article>`;
}

export const DIRECTORY_VIEWS = [
  ['mine','i-class','Kelas Saya','Kelas belajar yang kamu ikuti'],
  ['public','i-search','Jelajahi Kelas','Temukan kelas umum'],
  ['demo','i-eye','Kelas Demo','Kenali fitur lewat ruang contoh'],
  ['archive','i-file','Kelas Arsip','Informasi kelas yang sudah selesai']
];
export function directoryTabsHtml(groups, selected, {mineKnown = false, publicKnown = false, publicTotal = null} = {}) {
  return DIRECTORY_VIEWS.filter(([key]) => key !== 'archive' || groups.archive.length).map(([key,symbol,title,description]) => {
    const count=key==='public' ? publicKnown ? Number(publicTotal ?? groups.public.length) : '—' : key==='mine' && !mineKnown ? '—' : key==='demo' && !mineKnown && !publicKnown ? '—' : groups[key].length;
    return `<button type="button" class="cl-category${key===selected?' is-active':''}" id="cl-tab-${key}" role="tab" aria-selected="${key===selected}" aria-controls="class-directory-panel" tabindex="${key===selected?0:-1}" data-directory-view="${key}"><span class="cl-category-icon">${svg(symbol)}</span><span><strong>${title}</strong><small>${description}</small></span><b>${count}</b></button>`;
  }).join('');
}
export function directoryEmptyHtml(view) {
  const copy={mine:['Kelasmu dimulai di sini','Punya kode kelas? Bergabunglah, atau buat ruang belajarmu sendiri.'],public:['Belum ada kelas umum','Coba pencarian di atas atau gunakan kode dari pengelola kelas.'],demo:['Belum ada demo yang tersedia','Kelas contoh akan muncul di sini jika tersedia pada daftar kelasmu atau kelas umum.'],archive:['Belum ada kelas arsip','Informasi kelas yang sudah selesai akan tersedia sesuai akses akunmu.']}[view] || ['Belum ada kelas',''];
  return `<div class="cl-empty">${svg(view==='demo'?'i-eye':'i-class')}<h3>${copy[0]}</h3><p>${copy[1]}</p>${view==='mine'?'<button type="button" class="cl-button cl-button-primary" data-directory-join>Gabung dengan Kode</button>':''}</div>`;
}
