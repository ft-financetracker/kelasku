/** One class-academic source/cache for Room and the attendance menu. */
import { state } from '../core/state.js?v=6740forms3';
import { api } from '../core/api.js?v=6740forms3';
import { loadAttendanceAnalytics, attendanceAnalyticsRequestedAt, rememberAttendanceAnalyticsRecord } from './attendanceAnalytics.js?v=6740forms3';

const TTL_MS = 90000;
const inFlight = new Map();
const revisions = new Map();
const attendanceInFlight = new Map();
const detailInFlight = new Map();
const ownOverrides = new Map();
const unverifiedAt = new Map();
let ownIndexes = new WeakMap();
let ownOwner = '';
const requestKey = id => `${state.sessionToken || ''}::${id}`;
const OWN_STATUSES = new Set(['PRESENT','SICK','PERMIT','ABSENT','UNMARKED']);

function ownContext() {
  const owner = `${state.sessionToken || ''}::${state.user?.user_id || ''}`;
  if (owner !== ownOwner) { ownOwner=owner; ownOverrides.clear(); unverifiedAt.clear(); ownIndexes=new WeakMap(); }
  return String(state.user?.user_id || '');
}
function ownRecord(classId, attendanceId) {
  const userId=ownContext(), data=state.classAnalytics?.[classId];
  const override=ownOverrides.get(`${classId}::${attendanceId}`);
  const unknownSince=unverifiedAt.get(`${classId}::${attendanceId}`) || 0;
  const fetchedAt=attendanceAnalyticsRequestedAt(data) || Number(state.classAnalyticsAt?.[classId] || 0);
  if(override && (!unknownSince || override.at>unknownSince) && override.at >= fetchedAt)return override.record;
  if(data && String(data.class_id || '') === String(classId) && Array.isArray(data.activity_records)) {
    let index=ownIndexes.get(data);
    if(!index || index.userId !== userId) {
      const records=new Map();
      data.activity_records.forEach(row=>{if(userId && String(row.user_id || '')===userId && (!row.class_id || String(row.class_id)===String(classId)) && OWN_STATUSES.has(String(row.attendance_status || '').toUpperCase()))records.set(String(row.attendance_id || ''),row);});
      index={userId,records};ownIndexes.set(data,index);
    }
    const record=index.records.get(String(attendanceId));
    if(record && (!unknownSince || fetchedAt>unknownSince)){unverifiedAt.delete(`${classId}::${attendanceId}`);return record;}
  }
  return override && (!unknownSince || override.at>unknownSince) ? override.record : null;
}
function recordPatch(record) {
  return {my_status:String(record.attendance_status || '').toUpperCase(),my_channel:record.attendance_channel || '',
    my_punctuality:record.punctuality || '',my_note:record.note || '',my_marked_at:record.marked_at || '',
    my_status_confirmed:true,my_status_user_id:String(state.user?.user_id || '')};
}
function personalItem(item) {
  const record=ownRecord(String(item.class_id || ''),String(item.attendance_id || ''));
  if(record)return {...item,...recordPatch(record)};
  const snapshot=state.classAnalytics?.[String(item.class_id || '')];
  const hasSnapshot=snapshot && String(snapshot.class_id || '')===String(item.class_id || '') && Array.isArray(snapshot.activity_records);
  const confirmed=!hasSnapshot && !unverifiedAt.has(`${item.class_id}::${item.attendance_id}`) && item.my_status_confirmed===true && String(item.my_status_user_id || '')===String(state.user?.user_id || '');
  return {...item,my_status_confirmed:confirmed};
}
function syncPersonalAttendance(classId) {
  for(const row of [...(state.classAcademic?.[classId]?.attendance_sessions || []),...(state.academicHub?.attendance || []).filter(x=>String(x.class_id)===String(classId))]) {
    const record=ownRecord(String(classId),String(row.attendance_id || ''));
    if(record)Object.assign(row,recordPatch(record));
  }
}
export function attendanceClassDataFresh(classId) {
  const data=state.classAnalytics?.[classId];
  return Boolean(state.classAcademic?.[classId] && Date.now()-Number(state.classAcademicAt?.[classId] || 0)<TTL_MS &&
    data && String(data.class_id || '')===String(classId) && Array.isArray(data.activity_records) &&
    Date.now()-Number(state.classAnalyticsAt?.[classId] || 0)<60000);
}
export function loadAttendanceClassData(classId,{force=false}={}) {
  const id=String(classId || ''),key=requestKey(id),owner=state.sessionToken,userId=String(state.user?.user_id || '');
  if(attendanceInFlight.has(key))return attendanceInFlight.get(key);
  const request=(async()=>{
    const [academic,personal]=await Promise.allSettled([loadClassAcademicData(id,{force}),loadAttendanceAnalytics(id,{force})]);
    if(academic.status==='rejected')throw academic.reason;
    if(personal.status==='rejected')throw personal.reason;
    if(state.sessionToken!==owner || String(state.user?.user_id || '')!==userId)throw new Error('Sesi akun telah berubah.');
    syncPersonalAttendance(id);persistClassAcademicData();
    return state.classAcademic[id];
  })();
  attendanceInFlight.set(key,request);
  request.finally(()=>{if(attendanceInFlight.get(key)===request)attendanceInFlight.delete(key);}).catch(()=>{});
  return request;
}

export function rememberAttendanceSessionDetail(item,data) {
  const id=String(item.attendance_id || ''),classId=String(item.class_id || ''),userId=ownContext();
  const session=data?.session;
  if(!session || String(session.attendance_id || '')!==id || String(session.class_id || '')!==classId || typeof data.can_self_checkin!=='boolean')throw new Error('Data status sesi belum lengkap. Coba periksa lagi.');
  const record=data.my_record || (data.records || []).find(row=>String(row.user_id || '')===userId) || null;
  if(record && (String(record.user_id || '')!==userId || (record.attendance_id && String(record.attendance_id)!==id) || (record.class_id && String(record.class_id)!==classId) || !OWN_STATUSES.has(String(record.attendance_status || '').toUpperCase())))throw new Error('Data kehadiran akun tidak sesuai.');
  unverifiedAt.delete(`${classId}::${id}`);
  if(record) {
    const saved={...record,attendance_id:id,user_id:userId};
    ownOverrides.set(`${classId}::${id}`,{at:Date.now(),record:saved});
    rememberAttendanceAnalyticsRecord(classId,saved);
    const analytics=state.classAnalytics?.[classId];
    if(analytics) {
      const existing=(analytics.activity_records || []).find(row=>String(row.attendance_id || '')===id && String(row.user_id || '')===userId);
      if(existing)Object.assign(existing,record);
      ownIndexes.delete(analytics);
    }
  }
  const patch={...session,...(record?recordPatch(record):data.can_self_checkin?{my_status:'UNMARKED',my_status_confirmed:true,my_status_user_id:userId}:{my_status_confirmed:false})};
  for(const row of [item,...(state.classAcademic?.[classId]?.attendance_sessions || []),...(state.academicHub?.attendance || [])])if(String(row.class_id || '')===classId && String(row.attendance_id || '')===id)Object.assign(row,patch);
  persistClassAcademicData();
  return {...item,...patch,can_self_checkin:data.can_self_checkin};
}
export function markAttendanceUnverified(item) {
  ownContext();
  unverifiedAt.set(`${item.class_id}::${item.attendance_id}`,Date.now());
  for(const row of [item,...(state.classAcademic?.[item.class_id]?.attendance_sessions || []),...(state.academicHub?.attendance || [])])if(String(row.class_id || '')===String(item.class_id || '') && String(row.attendance_id || '')===String(item.attendance_id || ''))row.my_status_confirmed=false;
  persistClassAcademicData();
}
export function loadAttendanceSessionState(item) {
  const owner=state.sessionToken,userId=String(state.user?.user_id || ''),key=`${requestKey(item.class_id)}::${item.attendance_id}`;
  if(!owner || !userId)return Promise.reject(new Error('Masuk kembali untuk memeriksa presensi.'));
  if(detailInFlight.has(key))return detailInFlight.get(key);
  const request=(async()=>{
    const data=await api('getAttendanceSessionDetail',{attendance_id:String(item.attendance_id || '')});
    if(state.sessionToken!==owner || String(state.user?.user_id || '')!==userId)throw new Error('Sesi akun telah berubah.');
    return rememberAttendanceSessionDetail(item,data);
  })();
  detailInFlight.set(key,request);
  request.finally(()=>{if(detailInFlight.get(key)===request)detailInFlight.delete(key);}).catch(()=>{});
  return request;
}

export function invalidateClassAcademicData(classId) {
  const id = String(classId || '');
  if (!id) return;
  const key = requestKey(id);
  revisions.set(key, (revisions.get(key) || 0) + 1);
  attendanceInFlight.delete(key);
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
    syncPersonalAttendance(id);
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
    sessions.forEach(item => { const key=String(item.attendance_id || item.public_token || ''); if (key && String(item.class_id) === id && !seen.has(key)) { seen.add(key); attendance.push(personalItem(item)); } });
    timetable.forEach(item => { const key=String(item.schedule_id || ''); if (key && String(item.class_id) === id && !seenSchedules.has(key)) { seenSchedules.add(key); schedules.push(item); } });
  }
  return { ...hub, attendance, schedules };
}

export function applyAttendanceCheckIn(item, result, { status, channel = '', note = '' }) {
  const savedStatus=String(result?.attendance_status || '').toUpperCase();
  if(!OWN_STATUSES.has(savedStatus)||savedStatus==='UNMARKED')throw new Error('Status hasil presensi belum tersedia. Periksa kembali sesi.');
  const patch = { my_status:savedStatus, my_channel:result.attendance_channel || channel,
    my_punctuality:result.punctuality || '', my_note:note,my_status_confirmed:true,my_status_user_id:ownContext() };
  ownOverrides.set(`${item.class_id}::${item.attendance_id}`,{at:Date.now(),record:{attendance_id:item.attendance_id,user_id:String(state.user?.user_id || ''),attendance_status:patch.my_status,attendance_channel:patch.my_channel,punctuality:patch.my_punctuality,note,marked_at:result.marked_at || ''}});
  unverifiedAt.delete(`${item.class_id}::${item.attendance_id}`);
  rememberAttendanceAnalyticsRecord(item.class_id,ownOverrides.get(`${item.class_id}::${item.attendance_id}`).record);
  if(state.classAnalytics?.[item.class_id])ownIndexes.delete(state.classAnalytics[item.class_id]);
  const matches = row => String(row.class_id || '') === String(item.class_id || '') &&
    (item.attendance_id ? String(row.attendance_id || '') === String(item.attendance_id) : String(row.public_token || '') === String(item.public_token || ''));
  Object.assign(item, patch);
  for (const row of [...(state.academicHub?.attendance || []),...(state.classAcademic?.[String(item.class_id)]?.attendance_sessions || [])]) if (matches(row)) Object.assign(row,patch);
  persistClassAcademicData();
  try { if (state.academicHub) localStorage.setItem('kelasku_academic_cache', JSON.stringify(state.academicHub)); } catch {}
}
