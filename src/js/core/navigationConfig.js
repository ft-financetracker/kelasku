// One catalogue for the shell, admin editor and offline preview.
export const NAVIGATION_MENUS = Object.freeze([
  { id:'classes', label:'Kelas', icon:'i-class' },
  { id:'tasks', label:'Tugas', icon:'i-task' },
  { id:'forms', label:'Formulir', icon:'i-file' },
  { id:'dashboard', label:'Beranda', icon:'i-home' },
  { id:'messages', label:'Chat', icon:'i-chat' },
  { id:'account', label:'Profil', icon:'i-user' },
  { id:'attendance', label:'Absensi', icon:'i-check' },
  { id:'schedule', label:'Jadwal', icon:'i-calendar' },
  { id:'materials', label:'Materi', icon:'i-file' },
  { id:'announcements', label:'Pengumuman', icon:'i-mega' },
  { id:'notifications', label:'Notifikasi', icon:'i-bell' },
  { id:'settings', label:'Pengaturan', icon:'i-gear' },
  { id:'app-info', label:'Tentang', icon:'i-info' }
].map(item => Object.freeze(item)));
export const DEFAULT_NAVIGATION = Object.freeze(['classes','tasks','dashboard','messages','account']);
export const NAVIGATION_MIN = 3;
export const NAVIGATION_MAX = 5;
const menuIds = new Set(NAVIGATION_MENUS.map(item => item.id));

export function validateNavigation(value) {
  let items = value;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { return 'Susunan menu tidak valid.'; }
  }
  if (!Array.isArray(items) || items.some(id => typeof id !== 'string' || !menuIds.has(id))) return 'Pilih menu dari daftar yang tersedia.';
  if (items.length < NAVIGATION_MIN || items.length > NAVIGATION_MAX) return 'Tampilkan 3–5 menu agar mudah disentuh.';
  if (new Set(items).size !== items.length) return 'Menu yang sama tidak boleh ditampilkan dua kali.';
  if (!items.includes('dashboard')) return 'Beranda harus tetap tersedia.';
  return '';
}

export function navigationIds(value) {
  if (validateNavigation(value)) return [...DEFAULT_NAVIGATION];
  return typeof value === 'string' ? JSON.parse(value) : [...value];
}

export function navigationMenus(config = {}) {
  return navigationIds(config?.bottom_navigation).map(id => NAVIGATION_MENUS.find(item => item.id === id));
}

export function navigationActiveRoute(active = '', ids = DEFAULT_NAVIGATION) {
  if (ids.includes(active)) return active;
  let parent = '';
  if (active === 'forms') parent = 'tasks';
  else if (['class','join','schedule','materials','announcements','attendance','attendance-link'].includes(active)) parent = 'classes';
  else if (['profile','settings','app-info','notifications'].includes(active) || String(active).startsWith('admin')) parent = 'account';
  return ids.includes(parent) ? parent : '';
}

export function moveNavigation(items, id, targetIndex) {
  const from = items.indexOf(id);
  if (from < 0) return [...items];
  const next = [...items];
  next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, Number(targetIndex) || 0)), 0, id);
  return next;
}
