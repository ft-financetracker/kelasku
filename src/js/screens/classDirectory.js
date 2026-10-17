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
export function directoryIcon(name) {
  const paths={refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.55-1.9L20 8M4 16l2.35 2.9A7 7 0 0 0 17.9 17"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',list:'<path d="M9 5h12M9 12h12M9 19h12"/><rect x="3" y="4" width="2" height="2" rx=".5"/><rect x="3" y="11" width="2" height="2" rx=".5"/><rect x="3" y="18" width="2" height="2" rx=".5"/>',previous:'<path d="m14 6-6 6 6 6"/>',next:'<path d="m10 6 6 6-6 6"/>'};
  return `<svg class="cl-ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
}
export function directoryHeroArt() {
  return '<svg class="cl-hero-illustration" viewBox="0 0 260 165" fill="none" aria-hidden="true"><defs><linearGradient id="cl-book-shade" x1="45" y1="10" x2="200" y2="150" gradientUnits="userSpaceOnUse"><stop stop-color="#38d7d2"/><stop offset="1" stop-color="#1969c8"/></linearGradient></defs><circle cx="146" cy="81" r="66" stroke="#4ee0db" stroke-opacity=".14"/><circle cx="146" cy="81" r="82" stroke="#4ee0db" stroke-opacity=".08"/><rect x="169" y="25" width="58" height="69" rx="12" fill="#124c73" stroke="#47cdcf" stroke-opacity=".5" transform="rotate(10 169 25)"/><path d="m184 48 7 7 13-12M182 68h22" stroke="#7cf8d9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M43 73c23-9 50-6 78 8 29-14 56-17 81-8v61c-26-9-53-5-81 8-28-13-54-17-78-8V73Z" fill="url(#cl-book-shade)" fill-opacity=".7" stroke="#6be4df" stroke-opacity=".65" stroke-width="2"/><path d="M121 82v57M61 91c14-2 27 1 42 7M61 108c14-2 27 1 42 7M140 98c14-6 28-9 44-7M140 115c14-6 28-9 44-7" stroke="#b6fff0" stroke-opacity=".65" stroke-width="2.5" stroke-linecap="round"/><path d="m54 35 4 9 9 4-9 4-4 9-4-9-9-4 9-4 4-9Z" fill="#57edce"/><circle cx="219" cy="123" r="5" fill="#55d4ee"/><circle cx="94" cy="31" r="3" fill="#86f6dd"/></svg>';
}
export const DIRECTORY_PAGE_SIZE = Object.freeze({grid:6,list:10});
export function directoryPage(items,{page=1,size=6,total=items.length,serverPage=0,serverLimit=30}={}) {
  const count=Math.max(0,Number(total)||0),pages=Math.max(1,Math.ceil(count/size)),current=Math.max(1,Math.min(pages,Number(page)||1));
  const offset=(current-1)*size,expectedServer=Math.floor(offset/serverLimit)+1;
  const available=!serverPage || serverPage===expectedServer;
  const start=serverPage?offset-(serverPage-1)*serverLimit:offset;
  const rows=available?items.slice(start,start+size):[];
  return {rows,page:current,pages,total:count,from:rows.length?offset+1:0,to:rows.length?offset+rows.length:0,serverPage:expectedServer};
}
export function directoryPagerHtml(paging,{loading=false}={}) {
  if(!paging.total)return '';
  const numbers=new Set([1,paging.pages]);for(let n=Math.max(1,paging.page-1);n<=Math.min(paging.pages,paging.page+1);n++)numbers.add(n);
  if(paging.page<=2)for(let n=1;n<=Math.min(3,paging.pages);n++)numbers.add(n);
  if(paging.page>=paging.pages-1)for(let n=Math.max(1,paging.pages-2);n<=paging.pages;n++)numbers.add(n);
  let last=0;const controls=[...numbers].sort((a,b)=>a-b).map(n=>{const gap=last&&n-last>1?'<span class="cl-page-gap" aria-hidden="true">…</span>':'';last=n;return `${gap}<button type="button" class="cl-page-button${n===paging.page?' is-current':''}" data-directory-number="${n}" aria-label="Halaman ${n}"${n===paging.page?' aria-current="page"':''} ${loading?'disabled':''}>${n}</button>`;}).join('');
  const caption=loading&&!paging.rows.length?`Memuat halaman ${paging.page}…`:`Menampilkan ${paging.from}–${paging.to} dari ${paging.total} kelas`;
  return `<nav class="cl-pager" aria-label="Halaman daftar kelas"><p>${caption}</p><div class="cl-page-controls"><button type="button" class="cl-page-button" data-directory-number="${paging.page-1}" aria-label="Halaman sebelumnya" ${paging.page<=1||loading?'disabled':''}>${directoryIcon('previous')}</button>${controls}<button type="button" class="cl-page-button" data-directory-number="${paging.page+1}" aria-label="Halaman berikutnya" ${paging.page>=paging.pages||loading?'disabled':''}>${directoryIcon('next')}</button></div></nav>`;
}
function directoryPeopleHtml(members,item,caption) {
  const seen=new Set(),people=members.filter(person=>{const key=String(person.user_id || person.avatar_url || '');if(!key||seen.has(key))return false;seen.add(key);return true;}).slice(0,3);
  const total=Number(item.member_count),known=item.member_count!==undefined && item.member_count!==null && item.member_count!=='' && Number.isFinite(total) && total>=0;
  const avatars=people.map(person=>{const name=String(person.full_name || person.username || 'Anggota'),initials=name.trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0] || '').join('').toUpperCase();return `<span class="cl-member-avatar" title="${esc(name)}" aria-label="${esc(name)}"><span aria-hidden="true">${esc(initials || '•')}</span>${directoryImage(person.avatar_url,'cl-member-image')}</span>`;}).join('');
  const remaining=known?Math.max(0,total-people.length):0;
  return `<div class="cl-people">${people.length?`<span class="cl-avatar-stack" aria-label="Avatar anggota kelas">${avatars}${remaining?`<span class="cl-avatar-more" title="${remaining} anggota lainnya">+${remaining}</span>`:''}</span>`:''}<small>${esc(known?`${total} anggota`:caption)}</small></div>`;
}
export function directoryCardHtml(item, {mine = false, banner = '', members = [], layout = 'grid'} = {}) {
  const member=mine || isClassMember(item),demo=isDemoClass(item),archived=isArchivedClass(item);
  const pending=String(item.membership_status || '').toUpperCase() === 'PENDING';
  const id=esc(String(item.class_id || '')),name=esc(item.name || 'Kelas');
  const label=archived ? 'Arsip' : demo ? 'Demo' : directoryVisibility(item);
  const action=archived ? 'Lihat Informasi' : member ? demo ? 'Buka Demo' : 'Buka Kelas' : demo ? 'Lihat Demo' : pending ? 'Lihat Permintaan' : 'Lihat Kelas';
  const code=String(item.class_code || '');
  const subtitle=[item.institution || 'KelasKu',item.cohort ? `Angkatan ${item.cohort}` : ''].filter(Boolean).join(' · ');
  const chips=[item.study_program || '',item.semester || ''].filter(Boolean);
  const identity=item.icon_key && String(item.icon_key)!=='school' ? `<span class="material-symbols-rounded cl-card-custom-icon">${esc(item.icon_key)}</span>` : svg('i-class');
  const status=archived?'Selesai':pending?'Menunggu persetujuan':'Aktif';
  const badges=`<span class="cl-badge${demo?' cl-badge-demo':''}" title="${esc(label)}">${esc(label)}</span><span class="cl-card-state" title="${esc(status)}">${status}</span>`;
  const logo=`<span class="cl-card-logo" aria-hidden="true">${identity}${directoryImage(item.cover_url,'cl-logo-image')}</span>`;
  const footer=`<div class="cl-card-foot">${directoryPeopleHtml(members,item,demo?'Ruang contoh KelasKu':member?'Sudah bergabung':pending?'Permintaan sedang diproses':'Lihat informasi sebelum bergabung')}<button type="button" class="cl-open" ${member&&!archived?`data-open-class="${id}"`:`data-directory-preview="${id}"`} aria-label="${esc(action)}: ${name}"><span>${esc(action)}</span>${svg('i-arrow')}</button></div>`;
  const cardClass=`cl-card${demo?' is-demo':''}${archived?' is-archived':''}`;
  if(layout==='list'){
    const details=[{text:subtitle},...chips.map(text=>({text})),...(code?[{text:code,className:'cl-code'}]:[]),...(member?[{text:directoryRole(item.role)}]:[]),...(item.is_class_leader?[{text:'Ketua Kelas'}]:[])];
    return `<article class="${cardClass} cl-list-row">${logo}<div class="cl-list-heading"><h3 title="${name}">${name}</h3><div class="cl-list-badges">${badges}</div></div><div class="cl-list-details" title="${esc(details.map(part=>part.text).join(' · '))}">${details.map(part=>`<span${part.className?` class="${part.className}"`:''}>${esc(part.text)}</span>`).join('')}</div>${footer}</article>`;
  }
  return `<article class="${cardClass}">
    <div class="cl-card-banner" aria-hidden="true">${directoryImage(banner,'cl-banner-image')}<span class="cl-banner-pattern">${svg(demo?'i-eye':'i-class')}</span></div>
    <div class="cl-card-top">${badges}</div>
    <div class="cl-card-main">${logo}<div class="cl-card-copy"><h3>${name}</h3><p>${esc(subtitle)}</p>${chips.length?`<div class="cl-card-chips">${chips.map(text=>`<span>${esc(text)}</span>`).join('')}</div>`:''}</div></div>
    <div class="cl-card-meta">${code?`<span class="cl-code">${esc(code)}</span>`:''}${member?`<span>${esc(directoryRole(item.role))}</span>`:''}${item.is_class_leader?'<span>Ketua Kelas</span>':''}</div>
    ${footer}
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
