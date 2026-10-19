/* Interactive M1 preview model. Fictitious data only; production authority is RPC. */
export const DEMO_PASSWORD='Latihan123!';
export const DEMO_INITIAL='Masuk12345!';
export const PERIOD='Semester 1 · 2026/2027';
export const TYPES={SINGLE:'Pilihan tunggal',BOOLEAN:'Benar / salah',MULTI:'Beberapa pilihan',SHORT:'Jawaban singkat',NUMBER:'Angka',ESSAY:'Esai',SURVEY:'Pendapat / survei'};
export const RESERVED=new Set(['login','logout','dashboard','kelas','ruang-kelas','join','jadwal','tugas','materi','pengumuman','absensi','pesan','profil','pengaturan','tentang','notifikasi','lengkapi-profil','setup','admin','formulir','assets','src','docs','api','index','links','config','manifest','service-worker','update-recovery','robots','sitemap','esyabsen']);
export const copy=value=>JSON.parse(JSON.stringify(value));
export const normalizeName=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('id');
export const uid=prefix=>`${prefix}-${globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)}`;
export const formatNumber=value=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(value??0);
export const formatTime=(value,opts={})=>value?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta',...opts}).format(new Date(value))+' WIB':'Tanpa tenggat';
export function passwordProblem(value,confirm=value){
 if([...String(value)].length<8||new TextEncoder().encode(String(value)).length>72||!String(value).trim())return 'Gunakan minimal 8 karakter, maksimal 72 byte. Password tidak boleh hanya spasi.';
 if(value!==confirm)return 'Konfirmasi password belum sama.';return '';
}
function question(kind,prompt,extra={}){return {id:uid('Q'),kind,prompt,required:true,weight:kind==='ESSAY'?8:kind==='SURVEY'?0:2,options:kind==='BOOLEAN'?['Benar','Salah']:['Opsi A','Opsi B'],correct:kind==='MULTI'?[0]:0,accepted:[],number:0,tolerance:0,ignoreCase:true,collapseSpaces:true,rubric:[{label:'Ketepatan isi',max:4},{label:'Alasan dan struktur',max:4}],...extra};}
export function blankQuestion(kind='SINGLE'){return question(kind,'');}
export function baseQuestions(){return [
 question('SINGLE','Apa tujuan utama teks argumentasi?',{weight:3,options:['Menyampaikan pendapat yang didukung alasan','Menceritakan kembali pengalaman pribadi','Menggambarkan ciri sebuah benda','Menyusun urutan langkah kerja'],correct:0}),
 question('BOOLEAN','Argumen yang kuat perlu didukung bukti yang relevan.',{correct:0}),
 question('MULTI','Pilih unsur yang membantu menguatkan sebuah argumen.',{weight:3,options:['Bukti yang dapat diperiksa','Serangan kepada pribadi lawan','Alasan yang berhubungan dengan pendapat','Klaim tanpa penjelasan'],correct:[0,2]}),
 question('SHORT','Bagian pembuka yang menyatakan pendapat utama disebut …',{accepted:['tesis'],weight:2}),
 question('NUMBER','Sebuah teks memiliki tiga argumen. Jika satu dihapus, berapa argumen yang tersisa?',{number:2,tolerance:0,weight:2}),
 question('ESSAY','Menurutmu, mengapa mahasiswa perlu memeriksa sumber sebelum membagikan informasi? Tulis satu pendapat beserta alasan pendukungnya.',{weight:8})
];}
export function makeSession(categoryId,sequence=1){return {id:uid('S'),categoryId,title:'',sequence,slug:'',kind:'QUIZ',instructions:'Baca soal dengan teliti. Kerjakan dengan jujur dan periksa jawaban sebelum mengirim.',period:PERIOD,status:'DRAFT',opensAt:null,closesAt:null,questionList:[blankQuestion()],participants:[],pointWeight:100,release:'AFTER_CLOSE',released:false,rankVisibility:'PARTICIPANTS',revisionAllowed:false,activities:{onTime:true,consistent:true,earliest:false,fastest:false,achievement:true,speedBonus:false,minimumScore:80,bonusCap:5},createdAt:new Date().toISOString()};}
export function createStore(){
 const names=['Nadira Putri','Damar Pratama','Keisha Aulia','Faris Mahendra','Mira Safitri','Arumi Lestari','Raka Adinata','Bima Satriya','Laras Anindya','Zara Kirana','Satria Wicaksono','Aluna Zahra','Nadira Putri','Reno Pradana','Nayla Putri','Akmal Fadhil','Tara Anjani','Bayu Saputra'];
 const participants=names.map((name,i)=>({id:`P${String(i+1).padStart(3,'0')}`,name,group:i===12?'Kelompok B':'ESY 2026',access:i%5===1?'INITIAL':i%5===2?'UNCLAIMED':'ACTIVE',competitor:i!==17}));
 const categories=[{id:'bindo',name:'Bahasa Indonesia',short:'BINDO',description:'Menata ide, menguatkan argumen.',color:'teal',icon:'book',period:PERIOD},
 {id:'math',name:'Matematika',short:'MTK',description:'Logika kecil untuk langkah besar.',color:'blue',icon:'calculator',period:PERIOD},
 {id:'economy',name:'Ekonomi Islam',short:'ESY',description:'Belajar memilih dengan bijak.',color:'amber',icon:'leaf',period:PERIOD}];
 const now=Date.now(),day=86400000;
 const session=(id,c,title,n,status,days)=>({...makeSession(c,n),id,title,slug:c==='bindo'?`bindo0${n}`:c==='math'?`mtk0${n}`:`esy0${n}`,questionList:baseQuestions(),status,opensAt:new Date(now-days*day).toISOString(),closesAt:new Date(now+(status==='PUBLISHED'?2:-Math.max(days-1,1))*day).toISOString(),participants:participants.slice(0,c==='math'?12:18).map(p=>p.id),released:status==='CLOSED'});
 const sessions=[session('b1','bindo','Kenali teks, temukan makna',1,'CLOSED',15),session('b2','bindo','Merangkai paragraf yang padu',2,'CLOSED',8),session('b3','bindo','Pendapatmu, kuatkan dengan alasan',3,'PUBLISHED',1),session('m1','math','Persen dalam keseharian',1,'CLOSED',9),session('m2','math','Satu langkah persamaan linear',2,'PUBLISHED',1),session('e1','economy','Pilihan, kebutuhan, dan prioritas',1,'DRAFT',0)];
 sessions.find(s=>s.id==='e1').slug='esy01';
 const store={participants,categories,sessions,submissions:[],drafts:new Map(),credentials:new Map(),pointEvents:[],activeSessionId:'b3',revision:1};
 participants.forEach(p=>store.credentials.set(p.id,p.access==='INITIAL'?DEMO_INITIAL:p.access==='ACTIVE'?DEMO_PASSWORD:null));
 for(const s of sessions){
   const amount=s.status==='CLOSED'?s.participants.length-2:s.id==='b3'?6:s.id==='m2'?3:0;
   for(let i=0;i<amount;i++){
    const pending=s.id==='b3'&&i>=3,score=pending?null:Math.min(100,74+(i*7+s.sequence*3)%27);
    const answers=correctAnswers(s);answers[s.questionList[5].id]='Sumber yang dapat diperiksa membantu kita menilai informasi sebelum membagikannya.';
    const submittedAt=new Date(new Date(s.opensAt).getTime()+3600000+i*123000).toISOString();
    const sub={id:uid('SUB'),sessionId:s.id,participantId:s.participants[i],status:pending?'PENDING_GRADE':'GRADED',score,answers,essayScores:{},receipt:uid('KK'),firstStartedAt:new Date(new Date(submittedAt).getTime()-((i+5)*60000)).toISOString(),submittedAt,revision:1,idempotencyKey:uid('IK'),payload:JSON.stringify(answers)};
    store.submissions.push(sub);if(score!==null)syncPoints(store,sub,'Nilai awal contoh');
   }
 }
 return store;
}
export function correctAnswers(session){return Object.fromEntries(session.questionList.map(q=>[q.id,q.kind==='SINGLE'||q.kind==='BOOLEAN'?q.correct:q.kind==='MULTI'?[...q.correct]:q.kind==='SHORT'?q.accepted[0]||'':q.kind==='NUMBER'?q.number:'']));}
export const getSession=(store,id)=>store.sessions.find(s=>s.id===id);
export const getParticipant=(store,id)=>store.participants.find(p=>p.id===id);
export const getSubmission=(store,sid,pid)=>store.submissions.find(s=>s.sessionId===sid&&s.participantId===pid);
export const getDraft=(store,sid,pid)=>store.drafts.get(`${sid}:${pid}`);
export function stateOfSession(s,now=Date.now()){if(s.status==='DRAFT')return 'DRAFT';if(s.status==='ARCHIVED')return 'ARCHIVED';if(s.status==='CLOSED'||s.closesAt&&new Date(s.closesAt)<=now)return 'CLOSED';if(s.opensAt&&new Date(s.opensAt)>now)return 'SCHEDULED';return 'OPEN';}
export const statusLabel=status=>({DRAFT:'Draf',SCHEDULED:'Belum dibuka',OPEN:'Dibuka',CLOSED:'Ditutup',ARCHIVED:'Diarsipkan',GRADED:'Sudah dinilai',PENDING_GRADE:'Menunggu penilaian',SUBMITTED:'Terkirim'})[status]||status;
export function isAnswered(q,a){if(Array.isArray(a))return a.length>0;return a!==undefined&&a!==null&&String(a).trim()!=='';}
export function missingAnswers(s,answers){return s.questionList.filter(q=>q.required&&!isAnswered(q,answers[q.id]));}
export function validateSession(s,store){
 const errors=[];
 if(s.title.trim().length<3)errors.push('Judul minimal 3 karakter.');
 if(!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s.slug)||RESERVED.has(s.slug))errors.push('Kode tautan harus valid dan belum dipakai sistem.');
 if(store.sessions.some(x=>x.id!==s.id&&x.slug===s.slug))errors.push('Kode tautan sudah dipakai sesi lain.');
 if(!s.participants.length)errors.push('Pilih setidaknya satu peserta.');
 if(s.opensAt&&s.closesAt&&new Date(s.closesAt)<=new Date(s.opensAt))errors.push('Tenggat harus sesudah waktu buka.');
 if(!s.questionList.length)errors.push('Tambahkan setidaknya satu soal.');
 s.questionList.forEach((q,i)=>{
  if(!q.prompt.trim())errors.push(`Soal ${i+1}: pertanyaan belum diisi.`);
  if(!Number.isFinite(Number(q.weight))||Number(q.weight)<0)errors.push(`Soal ${i+1}: bobot belum valid.`);
  if(['SINGLE','BOOLEAN','MULTI'].includes(q.kind)){
   if(q.options.length<2||q.options.some(v=>!v.trim()))errors.push(`Soal ${i+1}: lengkapi opsi.`);
   const keys=q.kind==='MULTI'?q.correct:[q.correct];if(s.kind!=='SURVEY'&&(!keys.length||keys.some(k=>!Number.isInteger(k)||k<0||k>=q.options.length)))errors.push(`Soal ${i+1}: pilih kunci yang benar.`);
  }
  if(s.kind!=='SURVEY'&&q.kind==='SHORT'&&!q.accepted.some(v=>v.trim()))errors.push(`Soal ${i+1}: isi jawaban yang diterima.`);
  if(s.kind!=='SURVEY'&&q.kind==='NUMBER'&&(!Number.isFinite(Number(q.number))||!Number.isFinite(Number(q.tolerance))||Number(q.tolerance)<0))errors.push(`Soal ${i+1}: nilai/toleransi tidak valid.`);
  if(s.kind!=='SURVEY'&&q.kind==='ESSAY'&&(!q.rubric.length||q.rubric.some(r=>!r.label.trim()||r.max<0)||q.rubric.reduce((a,r)=>a+Number(r.max),0)!==Number(q.weight)))errors.push(`Soal ${i+1}: total rubrik harus sama dengan bobot esai.`);
 });
 if(s.kind!=='SURVEY'&&s.questionList.filter(q=>q.kind!=='SURVEY').reduce((a,q)=>a+Number(q.weight),0)<=0)errors.push('Kuis/tugas bernilai perlu setidaknya satu soal dengan bobot lebih dari nol.');
 if(s.activities.speedBonus&&(s.activities.minimumScore<0||s.activities.minimumScore>100||s.activities.bonusCap<0||s.activities.bonusCap>5))errors.push('Periksa ambang nilai dan batas bonus kecepatan.');
 return errors;
}
export function grade(s,answers,essayScores={}){
 if(s.kind==='SURVEY')return {pending:false,score:null,points:0,max:0,components:[]};
 let points=0,max=0,pending=false;const components=[];
 for(const q of s.questionList){
  if(q.kind==='SURVEY')continue;
  const a=answers[q.id];let score=0;
  max+=Number(q.weight);
  if(q.kind==='ESSAY'){
   if(essayScores[q.id]===undefined||essayScores[q.id]===null){pending=true;score=null;}else score=Math.min(Number(q.weight),Math.max(0,Number(essayScores[q.id])));
  }else if(q.kind==='SINGLE'||q.kind==='BOOLEAN')score=a===q.correct?Number(q.weight):0;
  else if(q.kind==='MULTI')score=Array.isArray(a)&&JSON.stringify([...new Set(a)].sort())===JSON.stringify([...q.correct].sort())?Number(q.weight):0;
  else if(q.kind==='SHORT'){
    const norm=v=>{v=String(v??'').trim();if(q.collapseSpaces)v=v.replace(/\s+/g,' ');return q.ignoreCase?v.toLocaleLowerCase('id'):v;};
    score=q.accepted.filter(v=>String(v).trim()).some(v=>norm(v)===norm(a))?Number(q.weight):0;
  }else if(q.kind==='NUMBER')score=isAnswered(q,a)&&Number.isFinite(Number(a))&&Math.abs(Number(a)-Number(q.number))<=Number(q.tolerance)?Number(q.weight):0;
  points+=Number(score||0);components.push({questionId:q.id,score});
 }
 return {pending,score:pending||!max?null:Math.round(points/max*10000)/100,points,max,components};
}
export function syncPoints(store,sub,reason){
 const s=getSession(store,sub.sessionId),p=getParticipant(store,sub.participantId);
 const result=sub.score===null||!p.competitor||s.kind==='SURVEY'?0:Math.round(sub.score*s.pointWeight)/100;
 const bonus=result&&s.activities.speedBonus&&sub.score>=s.activities.minimumScore?Number(s.activities.bonusCap):0;
 for(const [component,target] of [['RESULT',result],['ACTIVITY',bonus]]){
  const old=store.pointEvents.filter(e=>e.sessionId===s.id&&e.participantId===p.id&&e.component===component).reduce((a,e)=>a+e.delta,0);
  const eventKey=`${sub.id}:${sub.revision}:${component}`;
  if(Math.abs(target-old)>.00001&&!store.pointEvents.some(e=>e.key===eventKey))store.pointEvents.push({key:eventKey,sessionId:s.id,participantId:p.id,component,delta:Math.round((target-old)*100)/100,reason});
 }
}
export function saveDraft(store,sid,pid,answers,revision=0){
 const s=getSession(store,sid);if(stateOfSession(s)!=='OPEN')throw new Error('Sesi sudah ditutup. Jawaban contoh tetap ada.');
 const key=`${sid}:${pid}`,old=store.drafts.get(key);if(old&&old.revision!==revision)throw new Error('Draf lebih baru tersedia. Muat ulang draf sebelum melanjutkan.');
 const d={answers:copy(answers),revision:revision+1,firstStartedAt:old?.firstStartedAt||new Date().toISOString(),savedAt:new Date().toISOString()};store.drafts.set(key,d);return copy(d);
}
export function login(store,sid,pid,password='',newPassword='',confirm=''){
 const s=getSession(store,sid),p=getParticipant(store,pid);if(!p||!s.participants.includes(pid))throw new Error('Peserta tidak terdaftar pada sesi ini.');
 if(p.access==='ACTIVE'){
  if(store.credentials.get(pid)!==password)throw new Error('Password belum sesuai. Coba periksa lagi.');
 }else{
  if(stateOfSession(s)!=='OPEN')throw new Error('Aktivasi tersedia ketika sesi dibuka.');
  if(p.access==='INITIAL'&&store.credentials.get(pid)!==password)throw new Error('Password awal belum sesuai.');
  const problem=passwordProblem(newPassword,confirm);if(problem)throw new Error(problem);
  if(p.access==='INITIAL'&&password===newPassword)throw new Error('Buat password pribadi yang berbeda dari password awal.');
  store.credentials.set(pid,newPassword);p.access='ACTIVE';
 }
 return {participantId:pid,sessionId:sid,token:uid('DEMO'),startedAt:new Date().toISOString()};
}
export function submit(store,auth,answers,password,idempotencyKey){
 if(!auth)throw new Error('Masuk kembali untuk melanjutkan.');
 const {sessionId:sid,participantId:pid}=auth,s=getSession(store,sid);
 if(store.credentials.get(pid)!==password)throw new Error('Password belum sesuai. Jawaban tetap tersimpan.');
 const payload=JSON.stringify(Object.keys(answers).sort().map(k=>[k,answers[k]]));
 const old=getSubmission(store,sid,pid);
 if(old){if(old.idempotencyKey===idempotencyKey&&old.payload===payload)return old;throw new Error('Jawaban sudah terkirim. Bukti pengumpulan tersedia di Hasil saya.');}
 if(stateOfSession(s)!=='OPEN')throw new Error('Sesi sudah ditutup. Pengiriman baru tidak diterima.');
 const missing=missingAnswers(s,answers);if(missing.length)throw new Error(`Masih ada ${missing.length} soal wajib yang belum diisi.`);
 const d=getDraft(store,sid,pid),g=grade(s,answers);
 const sub={id:uid('SUB'),sessionId:sid,participantId:pid,status:g.pending?'PENDING_GRADE':g.score===null?'SUBMITTED':'GRADED',score:g.score,answers:copy(answers),essayScores:{},receipt:uid('KK'),firstStartedAt:d?.firstStartedAt||auth.startedAt,submittedAt:new Date().toISOString(),revision:1,idempotencyKey,payload};
 store.submissions.push(sub);syncPoints(store,sub,'Pengumpulan contoh');store.revision++;return sub;
}
export function review(store,submissionId,essayScores,expectedRevision){
 const sub=store.submissions.find(s=>s.id===submissionId);if(!sub)throw new Error('Pengumpulan tidak ditemukan.');
 if(sub.revision!==expectedRevision)throw new Error('Penilaian lebih baru tersedia. Buka ulang pengumpulan.');
 const s=getSession(store,sub.sessionId);
 if(s.kind==='SURVEY')throw new Error('Survei tidak dinilai. Jawaban hanya untuk ditinjau.');
 for(const q of s.questionList.filter(q=>q.kind==='ESSAY')){
  const n=essayScores[q.id];if(n===undefined||n===null||!Number.isFinite(Number(n))||Number(n)<0||Number(n)>Number(q.weight))throw new Error('Isi nilai esai sesuai batas rubrik.');
 }
 sub.essayScores=copy(essayScores);const g=grade(s,sub.answers,essayScores);sub.score=g.score;sub.status=g.pending?'PENDING_GRADE':g.score===null?'SUBMITTED':'GRADED';sub.revision++;syncPoints(store,sub,'Penilaian/koreksi contoh');store.revision++;return sub;
}
export function ranking(store,categoryId,{period=store.categories.find(c=>c.id===categoryId)?.period||PERIOD,sessionId='',publicOnly=false}={}){
 const all=store.sessions.filter(s=>s.categoryId===categoryId&&s.period===period&&s.status!=='DRAFT'&&(!sessionId||s.id===sessionId));
 const visible=all.filter(s=>!publicOnly||s.released),visibleIds=new Set(visible.map(s=>s.id));
 const participantIds=new Set(all.flatMap(s=>s.participants));
 const rows=store.participants.filter(p=>participantIds.has(p.id)&&p.competitor).map(p=>{
  const points=store.pointEvents.filter(e=>e.participantId===p.id&&visibleIds.has(e.sessionId)).reduce((a,e)=>a+e.delta,0);
  const assigned=all.filter(s=>s.participants.includes(p.id));
  const done=assigned.filter(s=>getSubmission(store,s.id,p.id)).length;
  const pending=assigned.filter(s=>getSubmission(store,s.id,p.id)?.status==='PENDING_GRADE').length;
  return {participantId:p.id,name:p.name,group:p.group,points:Math.round(points*100)/100,assigned:assigned.length,done,pending};
 }).sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name,'id')||a.participantId.localeCompare(b.participantId));
 let position=0,last=null;rows.forEach(r=>{if(r.points!==last){position++;last=r.points;}r.rank=position;});return {rows,hasReleased:visible.length>0,sessions:all,asOf:new Date().toISOString()};
}
export function stats(store,sessionId=''){
 const sessions=sessionId?[getSession(store,sessionId)]:store.sessions.filter(s=>s.status!=='DRAFT');const ids=new Set(sessions.map(s=>s.id));
 const assigned=sessions.reduce((a,s)=>a+s.participants.length,0),subs=store.submissions.filter(s=>ids.has(s.sessionId));
 return {assigned,submitted:subs.length,pending:subs.filter(s=>s.status==='PENDING_GRADE').length,remaining:assigned-subs.length};
}
export function activityBoard(store,sessionId,{publicOnly=false}={}){
 const s=getSession(store,sessionId);
 if(publicOnly&&!s.released)return {earliest:[],fastest:[],qualified:0};
 const subs=store.submissions.filter(x=>x.sessionId===sessionId&&x.score!==null&&x.score>=s.activities.minimumScore&&getParticipant(store,x.participantId).competitor);
 const map=x=>({name:getParticipant(store,x.participantId).name,submittedAt:x.submittedAt,duration:Math.max(0,new Date(x.submittedAt)-new Date(x.firstStartedAt)),score:x.score});
 const rows=subs.map(map);return {earliest:[...rows].sort((a,b)=>new Date(a.submittedAt)-new Date(b.submittedAt)),fastest:[...rows].sort((a,b)=>a.duration-b.duration),qualified:rows.length};
}
export function formulaSafe(v){return typeof v==='string'&&/^[\s\uFEFF]*[=+\-@]/u.test(v)?"'"+v:v;}
export function exportSnapshot(store,categoryId,{period=store.categories.find(c=>c.id===categoryId)?.period||PERIOD,group=''}={}){
 const board=ranking(store,categoryId,{period}),category=store.categories.find(c=>c.id===categoryId);
 const rows=[['ID peserta','Nama','Kelompok',...board.sessions.map(s=>`S${String(s.sequence).padStart(2,'0')}`),'Total poin','Peringkat','Selesai','Ditugaskan']];
 for(const r of board.rows.filter(r=>!group||r.group===group)){
  const cells=board.sessions.map(s=>{if(!s.participants.includes(r.participantId))return 'Tidak ditugaskan';const sub=getSubmission(store,s.id,r.participantId);return !sub?'Belum mengumpulkan':sub.score===null?sub.status==='PENDING_GRADE'?'Menunggu penilaian':'Tanpa nilai':sub.score;});
  rows.push([r.participantId,formulaSafe(r.name),formulaSafe(r.group),...cells,r.points,r.rank,r.done,r.assigned]);
 }
 return {category:category.name,period,asOf:board.asOf,revision:store.revision,rows,filters:{categoryId,period,group}};
}
export function csvText(rows){return '\uFEFF'+rows.map(row=>row.map(v=>'"'+String(formulaSafe(v)??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');}
export function parseTsv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else cell+=ch;}
  else if(ch==='\t'&&!quoted){row.push(cell);cell='';}
  else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';}
  else cell+=ch;
 }
 row.push(cell);if(row.some(v=>v!==''))rows.push(row);return rows;
}
export function previewImport(store,text,mapping=null){
 const data=parseTsv(text);if(!data.length)return {rows:[],errors:['Tempel setidaknya satu baris.'],mapping:{name:0,group:1,password:2,id:-1},hasHeader:false};
 const header=data[0].map(normalizeName);const find=keys=>header.findIndex(h=>keys.includes(h));
 const named=find(['nama','name','nama mahasiswa']),hasHeader=named>=0;
 const map=mapping||{name:hasHeader?named:0,group:hasHeader?find(['kelompok','kelas/kelompok','group','kelas']):1,password:hasHeader?find(['password awal','password','initialpassword']):2,id:hasHeader?find(['id peserta','participant_id','id']):-1};
 const seen=new Set(),seenIds=new Set(),rows=(hasHeader?data.slice(1):data).map((cells,index)=>{
  const name=String(cells[map.name]??'').trim().replace(/\s+/g,' '),group=String(cells[map.group]??'').trim(),password=cells[map.password]??'',id=cells[map.id]??'';
  let error='';const key=`${normalizeName(name)}:${normalizeName(group)}`,existing=store.participants.find(p=>p.id===id);
  const conflict=!id&&(seen.has(key)||store.participants.some(p=>normalizeName(p.name)===normalizeName(name)));
  if(!name)error='Nama wajib diisi.';
  else if(id&&!existing)error='ID peserta tidak dikenal.';
  else if(id&&seenIds.has(id))error='ID peserta muncul lebih dari sekali pada impor.';
  else if(password&&passwordProblem(password))error='Password awal belum memenuhi batas.';
  seen.add(key);if(id)seenIds.add(id);return {line:index+(hasHeader?2:1),name,group,password,id,error,conflict,action:existing?'UPDATE':conflict?'REVIEW':'NEW'};
 });
 return {rows,errors:[],mapping:map,hasHeader,headers:data[0]};
}
export function commitImport(store,preview){
 if(!preview.rows.length||preview.rows.some(r=>r.error||r.action==='REVIEW'))throw new Error('Selesaikan baris salah dan konflik terlebih dahulu.');
 let added=0,updated=0;
 for(const r of preview.rows){
  if(r.action==='SKIP')continue;
  if(r.action==='UPDATE'){
    const p=getParticipant(store,r.id);p.name=r.name;p.group=r.group;updated++; // Never reset existing credentials during import.
  }else{
    const p={id:uid('P'),name:r.name,group:r.group,access:r.password?'INITIAL':'UNCLAIMED',competitor:true};store.participants.push(p);store.credentials.set(p.id,r.password||null);added++;
  }
 }
 preview.rows.forEach(r=>{r.password='';});store.revision++;return {added,updated};
}
