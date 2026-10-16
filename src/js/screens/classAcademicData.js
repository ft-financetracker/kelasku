/** One class-academic source/cache for Room and the attendance menu. */
import { state } from '../core/state.js';
import { api } from '../core/api.js';

const TTL_MS = 90000;
const inFlight = new Map();
const revisions = new Map();
const requestKey = id => `${state.sessionToken || ''}::${id}`;

export function invalidateClassAcademicData(classId) {
  const id = String(classId || '');
  if (!id) return;
  const key = requestKey(id);
  revisions.set(key, (revisions.get(key) || 0) + 1);
  inFlight.delete(key);
  state.classAcademicAt ||= {};
  state.classAcademicAt[id] = 0;
  try { localStorage.setItem('kelasku_class_academic_cache_at', JSON.stringify(state.classAcademicAt)); } catch {}
}

export function persistClassAcademicData() {
  // Keep all loaded classes in memory; bound only the persisted cache, as Room did.
  const ids = Object.keys(state.classAcademic || {}).sort((a,b) => Number(state.classAcademicAt?.[b] || 0) - Number(state.classAcademicAt?.[a] || 0)).slice(0,4);
  try {
    localStorage.setItem('kelasku_class_academic_cache', JSON.stringify(Object.fromEntries(ids.map(id => [id,state.classAcademic[id]]))));
    localStorage.setItem('kelasku_class_academic_cache_at', JSON.stringify(Object.fromEntries(ids.map(id => [id,state.classAcademicAt?.[id] || 0]))));
  } catch {}
}

export function loadClassAcademicData(classId, { force = false } = {}) {
  const id = String(classId || '').trim(), owner = state.sessionToken, userId = String(state.user?.user_id || '');
  if (!id || !owner || !userId) return Promise.reject(new Error('Masuk kembali untuk memuat sesi kelas.'));
  const key = requestKey(id), cached = state.classAcademic?.[id];
  if (!force && cached && Date.now() - Number(state.classAcademicAt?.[id] || 0) < TTL_MS) return Promise.resolve(cached);
  if (inFlight.has(key)) return inFlight.get(key);
  const revision = revisions.get(key) || 0;
  const request = (async () => {
    const data = await api('getClassAcademic', { class_id:id });
    if (state.sessionToken !== owner || String(state.user?.user_id || '') !== userId) throw new Error('Sesi akun telah berubah.');
    if ((revisions.get(key) || 0) !== revision) {
      const error = new Error('Data kelas berubah. Muat ulang sesi.');
      error.code = 'CLASS_DATA_CHANGED';
      throw error;
    }
    if (!Array.isArray(data?.attendance_sessions) || !Array.isArray(data?.schedules)
      || (data.class_id && String(data.class_id) !== id)
      || [...data.attendance_sessions,...data.schedules].some(item => String(item.class_id || '') !== id)) throw new Error('Data sesi kelas belum lengkap. Coba lagi.');
    state.classAcademic ||= {};
    state.classAcademicAt ||= {};
    state.classAcademic[id] = data;
    state.classAcademicAt[id] = Date.now();
    persistClassAcademicData();
    return data;
  })();
  inFlight.set(key, request);
  request.finally(() => { if (inFlight.get(key) === request) inFlight.delete(key); }).catch(() => {});
  return request;
}

export function attendanceClasses(hub) {
  const classes = new Map();
  for (const key of ['attendance','schedules','tasks','materials','announcements']) {
    for (const item of hub?.[key] || []) {
      const id = String(item.class_id || '');
      if (id) classes.set(id, item.class_name || classes.get(id) || 'KelasKu');
    }
  }
  for (const item of state.myClasses || []) {
    const id = String(item.class_id || '');
    const membership = String(item.membership_status || 'ACTIVE').toUpperCase();
    if (id && membership === 'ACTIVE' && (!item.status || String(item.status).toUpperCase() === 'ACTIVE')) classes.set(id,item.name || item.class_name || classes.get(id) || 'KelasKu');
  }
  return [...classes].map(([id,name]) => ({ id,name })).sort((a,b) => a.name.localeCompare(b.name,'id'));
}

export function attendanceSourceData(hub) {
  const attendance = [], schedules = [];
  const known = attendanceClasses(hub);
  for (const { id } of known) {
    const data = state.classAcademic?.[id];
    const complete = Array.isArray(data?.attendance_sessions) && Array.isArray(data?.schedules);
    // Replace the limited preview for a class; merging it back would resurrect archived sessions.
    const sessions = complete ? data.attendance_sessions : (hub?.attendance || []).filter(item => String(item.class_id) === id);
    const timetable = complete ? data.schedules : (hub?.schedules || []).filter(item => String(item.class_id) === id);
    const seen = new Set(), seenSchedules = new Set();
    sessions.forEach(item => { const key=String(item.attendance_id || item.public_token || ''); if (key && String(item.class_id) === id && !seen.has(key)) { seen.add(key); attendance.push(item); } });
    timetable.forEach(item => { const key=String(item.schedule_id || ''); if (key && String(item.class_id) === id && !seenSchedules.has(key)) { seenSchedules.add(key); schedules.push(item); } });
  }
  return { ...hub, attendance, schedules };
}

export function applyAttendanceCheckIn(item, result, { status, channel = '', note = '' }) {
  const patch = { my_status:result.attendance_status || status, my_channel:result.attendance_channel || channel,
    my_punctuality:result.punctuality || '', my_note:note };
  const matches = row => String(row.class_id || '') === String(item.class_id || '') &&
    (item.attendance_id ? String(row.attendance_id || '') === String(item.attendance_id) : String(row.public_token || '') === String(item.public_token || ''));
  Object.assign(item, patch);
  for (const row of [...(state.academicHub?.attendance || []),...(state.classAcademic?.[String(item.class_id)]?.attendance_sessions || [])]) if (matches(row)) Object.assign(row,patch);
  persistClassAcademicData();
  try { if (state.academicHub) localStorage.setItem('kelasku_academic_cache', JSON.stringify(state.academicHub)); } catch {}
}
