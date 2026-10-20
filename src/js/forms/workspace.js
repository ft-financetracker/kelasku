import * as Base from './model.js?v=6741forms1';

export const newId=()=>crypto.randomUUID();
export function emptyWorkspace(){return {categories:[],participants:[],sessions:[],submissions:[],pointEvents:[],credentials:new Map(),drafts:new Map(),activeSessionId:'',revision:0,ownerName:'',publicBoards:{},exportSnapshot:null};}
export function workspaceModel(store){
 const cleanSession=s=>({...s,id:newId(),revision:0,questionList:s.questionList.map(q=>({...q,id:newId()}))});
 return {...Base,uid:newId,blankQuestion:kind=>({...Base.blankQuestion(kind),id:newId()}),makeSession:(...args)=>cleanSession(Base.makeSession(...args)),
 stats:(s,sid='')=>{const sessions=sid?s.sessions.filter(x=>x.id===sid):s.sessions.filter(x=>x.status!=='DRAFT'),subs=s.submissions.filter(x=>x.status!=='VOID'&&sessions.some(y=>y.id===x.sessionId&&y.participants.includes(x.participantId))),assigned=sessions.reduce((a,x)=>a+x.participants.length,0);return {assigned,submitted:subs.length,pending:subs.filter(x=>x.status==='PENDING_GRADE').length,remaining:assigned-subs.length};},
 ranking:(s,cid,opts={})=>opts.publicOnly?(s.publicBoards[opts.sessionId?'session':'category']?.board||{rows:[],sessions:[],hasReleased:false}):(s.ownerBoards?.[`${cid}:${opts.period||s.categories.find(c=>c.id===cid)?.period}:${opts.sessionId||''}`]||Base.ranking(s,cid,opts)),
 activityBoard:(s,sid,opts={})=>opts.publicOnly?(s.publicBoards.category?.activity||{earliest:[],fastest:[],qualified:0}):Base.activityBoard(s,sid,opts),
 exportSnapshot:()=>store.exportSnapshot||{rows:[['ID peserta','Nama','Kelompok','Total poin','Peringkat']],asOf:null,revision:'',category:'',period:''}};
}
export function createWorkspaceService(client,{api,store=emptyWorkspace(),alias='',target='session',onOwnerUpdate=()=>{}}={}){
 let sessionAlias=alias;const categoryEntry=target==='category';
 let ownerReady=false,disposed=false;const operations=new Map();
 const operation=(key,body)=>{const digest=JSON.stringify(body),old=operations.get(key);if(old?.digest===digest)return old.id;const id=newId();operations.set(key,{id,digest});return id;};
 async function owner(fn){if(!ownerReady){const r=await api('getFormsOwnerTicket',{});await client.exchangeOwner(r.ticket);ownerReady=true;}
  try{return await fn();}catch(e){if(!['UNAUTHORIZED_OWNER','FRESH_OWNER_REQUIRED'].includes(e.code))throw e;ownerReady=false;const r=await api('getFormsOwnerTicket',{});await client.exchangeOwner(r.ticket);ownerReady=true;return fn();}}
 function merge(data){if(disposed)return;Object.assign(store,data);store.credentials=new Map();store.drafts=store.drafts||new Map();store.publicBoards=store.publicBoards||{};if(!store.sessions.some(s=>s.id===store.activeSessionId))store.activeSessionId=store.sessions.find(s=>Base.stateOfSession(s)==='OPEN')?.id||store.sessions.at(-1)?.id||'';}
 const refreshOwner=async()=>{const data=await owner(()=>client.ownerState());merge(data);store.ownerBoards={};if(!disposed)onOwnerUpdate(data);return store;};
 function acceptParticipant(data){if(disposed)return;const s=data.session,i=store.sessions.findIndex(x=>x.id===s.id);if(i>=0)store.sessions[i]={...store.sessions[i],...s};else store.sessions.push(s);
  if(categoryEntry)store.sessions.find(x=>x.id===s.id).slug=alias;
  const p=data.participant,pi=store.participants.findIndex(x=>x.id===p.id);if(pi>=0)store.participants[pi]={...store.participants[pi],...p};else store.participants.push(p);
  store.drafts.set(s.id+':'+p.id,{answers:data.draft?.answers||{},revision:data.draft?.revision||0});
  const previous=store.submissions.findIndex(b=>b.sessionId===s.id&&b.participantId===p.id);if(previous>=0)store.submissions.splice(previous,1);if(data.submission)store.submissions.push(data.submission);}
 async function publicSession(){if(categoryEntry&&sessionAlias===alias){const c=await client.categoryPublic(alias);if(disposed)return;store.categoryLanding=c;store.ownerName=c.ownerName;store.sessions=[];store.activeSessionId='';store.categories=[{id:c.id,name:c.name,period:c.period,short:c.name,icon:'book',color:'teal',slug:alias}];return c;}const s=await client.publicSession(sessionAlias);if(disposed)return;if(categoryEntry)s.slug=alias;store.ownerName=s.ownerName;store.sessions=[s];store.activeSessionId=s.id;store.categories=[{id:s.categoryId,name:s.categoryName,period:s.period,short:s.categoryName,icon:'book',color:'teal'}];return s;}
 async function categoryLink(category,code){const saved=store.categories.find(c=>c.id===category.id)||category;code=saved.slug||code;let op=saved.requestedAlias===code?saved.publishOp:null;if(!op){op=operation('category-link:'+category.id,{alias:code});await owner(()=>client.ownerCategoryLink(category.id,code,op));await refreshOwner();}const proof=await api('reserveFormsAlias',{alias:code,target_type:'FORM_CATEGORY',target_id:category.id,operation_id:op});const commit=await owner(()=>client.applyAlias(proof.reservation_proof));await api('confirmFormsAlias',{confirmation_proof:commit.confirmation_proof});await refreshOwner();return code;}
 const refreshParticipant=async()=>{const x=await client.participantContext();acceptParticipant(x);return x;};
 async function attachLink(session,code){
  let saved=store.sessions.find(s=>s.id===session.id);let op=saved?.requestedAlias===code?saved.publishOp:null;
  if(!op){op=operation('link:'+session.id,{alias:code});await owner(()=>client.ownerControl(session.id,'link',{alias:code},op));await refreshOwner();}
  const proof=await api('reserveFormsAlias',{alias:code,target_type:'FORM_SESSION',target_id:session.id,operation_id:op});
  const commit=await owner(()=>client.applyAlias(proof.reservation_proof));
  await api('confirmFormsAlias',{confirmation_proof:commit.confirmation_proof});await refreshOwner();return code;
 }
 return {store,model:workspaceModel(store),refreshOwner,publicSession,refreshParticipant,categoryLink,
  async selectCategorySession(id){if(!store.categoryLanding?.sessions.some(s=>s.id===id))throw Error('Sesi tidak tersedia pada kategori ini.');await client.revokeParticipant();store.participants=[];store.submissions=[];store.drafts.clear();store.publicBoards={};sessionAlias=alias+'/'+id;return publicSession();},
  async categoryHome(){await client.revokeParticipant();store.participants=[];store.submissions=[];store.drafts.clear();store.publicBoards={};sessionAlias=alias;return publicSession();},
  classSources:()=>api('getFormsClassSources',{}, {timeout:30000}),
  classRoster:id=>api('getFormsClassRoster',{class_id:id},{timeout:30000}),
  async importClass(classId,userIds,categoryId,classOnly,links={}){const {proof}=await api('getFormsClassRosterProof',{class_id:classId,user_ids:userIds},{timeout:30000});const r=await owner(()=>client.ownerClassImport(proof,categoryId,classOnly,operation('class-import:'+categoryId,{proof,classOnly,links}),links));await refreshOwner();return r.ids;},
  async category(category){await owner(()=>client.ownerCategory(category,operation('category:'+category.id,category)));await refreshOwner();},
  async saveSession(session,publish){const saved=store.sessions.find(s=>s.id===session.id);
   if(publish)await categoryLink(store.categories.find(c=>c.id===session.categoryId),session.slug);
   if(!saved||saved.status==='DRAFT')await owner(()=>client.ownerSession(session,publish,operation('session:'+session.id,{session,publish})));
   await refreshOwner();},
  attachLink,
  async importRows(preview,categoryId=''){if(preview.rows.some(r=>r.error||r.action==='REVIEW'))throw new Error('Periksa konflik data sebelum menyimpan.');if(store.categories.find(c=>c.id===categoryId)?.sourceClass)throw new Error('Kategori khusus kelas: gunakan tombol Dari kelas.');const rows=preview.rows.filter(r=>r.action!=='SKIP');
   for(let i=0;i<rows.length;i+=20){const batch=rows.slice(i,i+20).map(r=>{if(!r.liveId)r.liveId=r.action==='UPDATE'?r.id:newId();return {id:r.liveId,name:r.name,group:r.group,password:r.password,action:r.action};});await owner(()=>client.ownerImport(batch,operation('import:'+i,batch)));}
   if(categoryId)await owner(()=>client.ownerCategoryPeople(categoryId,rows.map(r=>r.liveId)));
   const result={added:rows.filter(r=>r.action==='NEW').length,updated:rows.filter(r=>r.action==='UPDATE').length};preview.rows.forEach(r=>r.password='');await refreshOwner();return result;},
  async reset(id,password){await owner(()=>client.ownerResetAccess(id,password||null));await refreshOwner();},
  async competitor(id,value){await owner(()=>client.ownerParticipant(id,value));await refreshOwner();},
  async assign(id,participants){await owner(()=>client.ownerAssign(id,participants,operation('assign:'+id,participants)));await refreshOwner();},
  async resultControl(id,command,reason,revision){const body={command,reason,revision};await owner(()=>client.ownerResultControl(id,command,reason,revision,operation('result:'+id,body)));await refreshOwner();},
  async submission(id){const x=await owner(()=>client.ownerSubmission(id));const i=store.submissions.findIndex(s=>s.id===id);if(i>=0)store.submissions[i]=x;return x;},
  async grade(id,scores,revision){await owner(()=>client.ownerGrade(id,scores,revision));await refreshOwner();},
  async rekey(sid,qid,key){await owner(()=>client.ownerRekey(sid,qid,key,operation('rekey:'+sid+qid,key)));await refreshOwner();},
  async control(id,command,value={}){await owner(()=>client.ownerControl(id,command,value,operation('control:'+id+command,value)));await refreshOwner();},
  async snapshot(cid,period,group='',sid=null){const x=await owner(()=>client.ownerSnapshot(cid,period,group,sid));x.rows=x.rows.map(r=>r.map(Base.formulaSafe));store.exportSnapshot=x;store.ownerBoards||={};store.ownerBoards[`${cid}:${period}:${sid||''}`]=x.board;return x;},
  async search(query,accept=()=>true){const r=await client.findParticipants(sessionAlias,query);if(disposed||!accept())return [];store.participants=r.participants.map(p=>({id:p.participant_id,name:p.display_name,group:p.group_label,access:p.access_mode}));const s=store.sessions[0];s.participants=store.participants.map(p=>p.id);return store.participants;},
  async login(id,password,newPassword,confirm){const a=await client.participantAccess({p_alias:sessionAlias,p_participant_id:id,p_password:password,p_new_password:newPassword,p_confirm_password:confirm});await refreshParticipant();return {participantId:a.participant_id,sessionId:a.session_id};},
  saveDraft:async(answers,revision)=>client.saveDraft(answers,revision),
  async submit(answers,password,key,revision,resultRevision=0){const sub=await client.submit(answers,password,key,revision,resultRevision);await refreshParticipant();return sub;},
  async ranking(scope='category'){try{store.publicBoards[scope]=await client.ranking(sessionAlias,scope);}catch(e){if(e.code!=='RANKING_PRIVATE')throw e;store.publicBoards[scope]={board:{rows:[],sessions:[],hasReleased:false},activity:{earliest:[],fastest:[],qualified:0},private:true};}},
  async leave(){store.participants=[];store.submissions=[];store.drafts.clear();store.publicBoards={};try{await client.revokeParticipant();}catch{}await publicSession();},
  dispose(){disposed=true;ownerReady=false;client.revokeOwner().catch(()=>{});client.revokeParticipant().catch(()=>{});client.clearLocalAccess();operations.clear();store.credentials.clear();store.drafts.clear();store.submissions=[];store.participants=[];store.sessions=[];store.categories=[];store.pointEvents=[];store.publicBoards={};store.ownerBoards={};store.exportSnapshot=null;}
 };
}
