/** Shared attendance analytics source and C6 counters for Room and /absen. */
import { state } from '../core/state.js';
import { api } from '../core/api.js';

const TTL_MS = 60000;
const inFlight = new Map();
const revisions = new Map();
const requestTimes = new WeakMap();
const confirmedRecords = new Map();
let confirmedOwner = '';
const requestKey = classId => `${state.sessionToken || ''}::${classId}`;

function confirmedContext() {
  const owner=`${state.sessionToken || ''}::${state.user?.user_id || ''}`;
  if(confirmedOwner!==owner){confirmedOwner=owner;confirmedRecords.clear();}
  return String(state.user?.user_id || '');
}
export function attendanceAnalyticsRequestedAt(data) { return requestTimes.get(data) || 0; }
function patchConfirmedRecord(data,record) {
  const activity=(data.activities || []).find(row=>String(row.attendance_id || '')===String(record.attendance_id));
  if(!activity)return;
  const existing=(data.activity_records || []).find(row=>String(row.attendance_id || '')===String(record.attendance_id) && String(row.user_id || '')===String(record.user_id));
  if(existing)Object.assign(existing,record);
  else data.activity_records.push({...activity,...record});
}
export function rememberAttendanceAnalyticsRecord(classId,record) {
  const userId=confirmedContext(),id=String(classId || ''),attendanceId=String(record?.attendance_id || '');
  if(!id || !attendanceId || !userId || String(record.user_id || '')!==userId)return;
  confirmedRecords.set(`${id}::${attendanceId}`,{classId:id,at:Date.now(),record:{...record}});
  const cached=state.classAnalytics?.[id];
  if(cached)patchConfirmedRecord(cached,record);
}

export function invalidateAttendanceAnalytics(classId) {
  const id = String(classId || '');
  if (!id) return;
  const key = requestKey(id);
  confirmedContext();
  revisions.set(key, (revisions.get(key) || 0) + 1);
  inFlight.delete(key);
  state.classAnalyticsAt ||= {};
  state.classAnalyticsAt[id] = 0;
}

export function loadAttendanceAnalytics(classId, { force = false } = {}) {
  const id = String(classId || '').trim();
  if (!id) return Promise.reject(new Error('Pilih kelas untuk memuat rekap.'));
  const owner = state.sessionToken;
  const userId = String(state.user?.user_id || '');
  if (!owner || !userId) return Promise.reject(new Error('Masuk kembali untuk memuat rekap.'));
  confirmedContext();
  const key = requestKey(id);
  const cached = state.classAnalytics?.[id];
  if (!force && cached && Date.now() - Number(state.classAnalyticsAt?.[id] || 0) < TTL_MS) return Promise.resolve(cached);
  if (inFlight.has(key)) return inFlight.get(key);
  const revision = revisions.get(key) || 0;
  const startedAt = Date.now();
  const request = (async () => {
    const data = await api('getAttendanceAnalytics', { class_id:id });
    if (state.sessionToken !== owner || String(state.user?.user_id || '') !== userId) throw new Error('Sesi akun telah berubah.');
    if ((revisions.get(key) || 0) !== revision) { const error=new Error('Data presensi berubah. Muat ulang rekap.');error.code='ATTENDANCE_DATA_CHANGED';throw error; }
    if (String(data?.class_id || '') !== id || !Array.isArray(data?.activities) || !Array.isArray(data?.activity_records)) throw new Error('Data rekap kelas belum lengkap. Coba Refresh.');
    confirmedRecords.forEach(value=>{if(value.classId===id && value.at>=startedAt)patchConfirmedRecord(data,value.record);});
    requestTimes.set(data,startedAt);
    state.classAnalytics ||= {};
    state.classAnalyticsAt ||= {};
    state.classAnalytics[id] = data;
    state.classAnalyticsAt[id] = Date.now();
    return data;
  })();
  inFlight.set(key, request);
  request.finally(() => { if (inFlight.get(key) === request) inFlight.delete(key); }).catch(() => {});
  return request;
}

function dateMs(value) { const n = new Date(value || '').getTime(); return Number.isFinite(n) ? n : 0; }

export function progressedAttendanceRecords(records,activities=[]){
  const now=Date.now(),started=new Set();
  (activities||[]).forEach(a=>{if(!a.start_at||dateMs(a.start_at)<=now)started.add(String(a.attendance_id||''));});
  return (records||[]).filter(r=>started.has(String(r.attendance_id||''))||String(r.attendance_status||'UNMARKED').toUpperCase()!=='UNMARKED');
}

export function canonicalAttendanceActivityName(item={}){
  let name=String(item.activity_name||item.session_title||item.title||'Kegiatan').trim()||'Kegiatan';
  // Attendance session titles may be stored as "Absensi — MAPEL • Sesi 03" when
  // source_schedule_id is unavailable. Export/analytics must still group by MAPEL.
  name=name
    .replace(/^absensi\s*[—–-]\s*/i,'')
    .replace(/\s*[•·]\s*sesi\s*0*\d+\s*$/i,'')
    .replace(/\s*[—–-]\s*sesi\s*0*\d+\s*$/i,'')
    .trim();
  return name||'Kegiatan';
}

export function buildActivitySummary(records,activities=[]){
  const now=Date.now(),groups={},activityById={};
  (activities||[]).forEach(a=>{activityById[String(a.attendance_id||'')]=a;const name=canonicalAttendanceActivityName(a),key=name.toLowerCase();if(!groups[key])groups[key]={name,plannedSessionIds:new Set(),progressedSessionIds:new Set(),studentNames:new Set(),PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,ZOOM:0,YOUTUBE:0,OFFLINE:0,OTHER:0,ON_TIME:0,LATE:0,total:0};groups[key].plannedSessionIds.add(String(a.attendance_id||''));if(!a.start_at||dateMs(a.start_at)<=now)groups[key].progressedSessionIds.add(String(a.attendance_id||''));});
  (records||[]).forEach(r=>{const a=activityById[String(r.attendance_id||'')]||r,name=canonicalAttendanceActivityName({...a,...r}),key=name.toLowerCase();if(!groups[key])groups[key]={name,plannedSessionIds:new Set(),progressedSessionIds:new Set(),studentNames:new Set(),PRESENT:0,SICK:0,PERMIT:0,ABSENT:0,UNMARKED:0,ZOOM:0,YOUTUBE:0,OFFLINE:0,OTHER:0,ON_TIME:0,LATE:0,total:0};const g=groups[key],sessionId=String(r.attendance_id||'');g.plannedSessionIds.add(sessionId);const started=(!r.start_at||dateMs(r.start_at)<=now)||String(r.attendance_status||'UNMARKED').toUpperCase()!=='UNMARKED';if(!started)return;g.progressedSessionIds.add(sessionId);if(r.full_name||r.username)g.studentNames.add(String(r.full_name||r.username));const st=String(r.attendance_status||'UNMARKED').toUpperCase();g[st]=(g[st]||0)+1;const ch=String(r.attendance_channel||'').toUpperCase();if(ch)g[ch]=(g[ch]||0)+1;const pn=String(r.punctuality||'').toUpperCase();if(pn)g[pn]=(g[pn]||0)+1;g.total+=1;});
  return Object.values(groups).map(g=>{const denominator=g.PRESENT+g.SICK+g.PERMIT+g.ABSENT+g.UNMARKED;return {...g,sessions:g.plannedSessionIds.size,progressed_sessions:g.progressedSessionIds.size,student_names:[...g.studentNames],attendance_rate:denominator?Math.round((g.PRESENT/denominator)*1000)/10:0};}).sort((a,b)=>a.name.localeCompare(b.name));
}

export function attendanceReportData(data, { userId = '', scope = 'own', courseTitle = '', query = '', className = '' } = {}) {
  const canViewAll = data?.can_view_all === true || data?.can_manage === true;
  const resolvedScope = scope === 'class' && canViewAll ? 'class' : 'own';
  const allActivities = data?.activities || [];
  const course = canonicalAttendanceActivityName({ title:courseTitle }).toLowerCase();
  const search = String(query || '').trim().toLowerCase();
  const matches = item => {
    if (courseTitle && canonicalAttendanceActivityName(item).toLowerCase() !== course) return false;
    if (!search) return true;
    const no = Number(item.session_no || 0);
    const date = item.start_at ? new Date(item.start_at) : null;
    const formatted = date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('id-ID', { timeZone:'Asia/Jakarta', dateStyle:'medium' }).format(date) : '';
    return [item.activity_name,item.session_title,item.title,item.start_at,formatted,className,no ? `Sesi ${String(no).padStart(2,'0')}` : 'Sesi'].join(' ').toLowerCase().includes(search);
  };
  const activities = allActivities.filter(matches);
  const ids = new Set(activities.map(item => String(item.attendance_id || '')));
  const rawRecords = (data?.activity_records || []).filter(item => resolvedScope === 'class' || (userId && String(item.user_id || '') === String(userId)));
  const records = courseTitle || search ? rawRecords.filter(item => ids.has(String(item.attendance_id || ''))) : rawRecords;
  const groups = buildActivitySummary(records, activities);
  const summary = { sessions:0, progressed_sessions:0, total:0, PRESENT:0, SICK:0, PERMIT:0, ABSENT:0, UNMARKED:0, attendance_rate:0 };
  groups.forEach(group => Object.keys(summary).filter(key => key !== 'attendance_rate').forEach(key => { summary[key] += Number(group[key] || 0); }));
  summary.attendance_rate = summary.total ? Math.round(summary.PRESENT / summary.total * 1000) / 10 : 0;
  return { scope:resolvedScope, canViewAll, groups, summary };
}
