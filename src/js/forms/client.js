/* Production foundation client, intentionally unused by the M1 fictitious preview. */
const RPCS=new Set(['status','owner_exchange','owner_context','owner_revoke','owner_reset_access','public_session','find_participants','participant_access','participant_context','participant_revoke','alias_apply','owner_state','owner_category','owner_import','owner_session','owner_control','owner_participant','owner_grade','owner_rekey','owner_snapshot','owner_submission','owner_assign','owner_result_control','save_draft','submit','ranking'].map(n=>'kkf_v1_'+n));
export class FormsError extends Error{constructor(code,message){super(message);this.name='FormsError';this.code=code;}}
export function createFormsClient(config,{fetcher=globalThis.fetch,timeoutMs=12000}={}){
 const project=new URL(config.SUPABASE_URL);
 if(project.protocol!=='https:'||project.username||project.password||project.search||project.hash||project.pathname!=='/')throw new FormsError('INVALID_CONFIG','Periksa alamat project tugas Global.');
 const key=String(config.PUBLISHABLE_KEY||'');
 if(!key||key.startsWith('sb_secret_'))throw new FormsError('INVALID_CONFIG','Gunakan publishable key, bukan secret key.');
 if(key.startsWith('eyJ')){try{const raw=key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');if(JSON.parse(atob(raw)).role==='service_role')throw new FormsError('SECRET_KEY_REJECTED','Kredensial server tidak boleh digunakan di browser.');}catch(e){if(e instanceof FormsError)throw e;throw new FormsError('INVALID_CONFIG','Publishable key tidak valid.');}}
 let ownerToken='',participantToken='';
 async function rpc(name,parameters={},signal){
  if(!RPCS.has(name))throw new FormsError('UNSUPPORTED_RPC','Operasi belum tersedia pada fondasi ini.');
  const controller=new AbortController(),abort=()=>controller.abort();
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(abort,timeoutMs);
  try{
   const response=await fetcher(`${project.origin}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(parameters),signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
   if(!response.ok)throw new FormsError('NETWORK_RESPONSE','Layanan belum merespons dengan benar. Periksa status sebelum mencoba lagi.');
   const value=await response.json();if(value?.ok!==true){const messages={ACCESS_DENIED:'Password atau akses belum sesuai. Jawaban tetap ada.',RATE_LIMITED:'Terlalu banyak percobaan. Tunggu beberapa menit sebelum mencoba kembali.',DRAFT_CONFLICT:'Draf di server lebih baru. Salin jawabanmu lalu muat ulang draf sebelum melanjutkan.',RESULT_CONFLICT:'Penilaian sudah diperbarui. Buka ulang pengumpulan sebelum mengoreksi.',SESSION_NOT_OPEN:'Sesi belum dibuka atau sudah ditutup. Jawaban yang sudah dikirim tetap tersimpan.',RANKING_PRIVATE:'Peringkat ini dibatasi oleh pengelola.',MODULE_DISABLED:'Tugas Global belum diaktifkan.',ALREADY_SUBMITTED:'Jawaban sudah terkirim. Buka Hasil saya untuk melihat buktinya.',NEW_DEADLINE_REQUIRED:'Isi tenggat baru yang masih akan datang untuk membuka sesi.',ALIAS_TAKEN:'Kode tautan sudah digunakan. Pilih kode lain.',FRESH_OWNER_REQUIRED:'Akses pengelola perlu diperbarui.',PILOT_DATA_LIMIT:'Dataset melewati batas tampilan V1. Data tetap tersimpan; paging perlu ditambahkan.'};const error=new FormsError(value?.code||'INVALID_RESPONSE',messages[value?.code]||'Permintaan belum berhasil. Periksa isian dan coba kembali.');error.data=value?.data;throw error;}return value.data;
  }catch(error){if(error instanceof FormsError)throw error;throw new FormsError(controller.signal.aborted?'REQUEST_INTERRUPTED':'NETWORK_UNAVAILABLE','Koneksi terputus. Proses mungkin masih berjalan; periksa status sebelum mengulang.');}
  finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
 }
 return Object.freeze({
  rpc,
  async exchangeOwner(ticket){const r=await rpc('kkf_v1_owner_exchange',{p_ticket:ticket});ownerToken=r.token;return {...r,token:undefined};},
  ownerContext:()=>rpc('kkf_v1_owner_context',{p_token:ownerToken}),
  ownerState:()=>rpc('kkf_v1_owner_state',{p_token:ownerToken}),
  ownerCategory:(category,operationId)=>rpc('kkf_v1_owner_category',{p_token:ownerToken,p_category:category,p_operation_id:operationId}),
  ownerImport:(rows,operationId)=>rpc('kkf_v1_owner_import',{p_token:ownerToken,p_rows:rows,p_operation_id:operationId}),
  ownerSession:(session,publish,operationId)=>rpc('kkf_v1_owner_session',{p_token:ownerToken,p_session:session,p_publish:publish,p_operation_id:operationId}),
  ownerControl:(sessionId,command,value,operationId)=>rpc('kkf_v1_owner_control',{p_token:ownerToken,p_session_id:sessionId,p_command:command,p_value:value,p_operation_id:operationId}),
  ownerParticipant:(participantId,competitor)=>rpc('kkf_v1_owner_participant',{p_token:ownerToken,p_participant_id:participantId,p_competitor:competitor}),
  ownerAssign:(sessionId,participants,operationId)=>rpc('kkf_v1_owner_assign',{p_token:ownerToken,p_session_id:sessionId,p_participants:participants,p_operation_id:operationId}),
  ownerResultControl:(submissionId,command,reason,revision,operationId)=>rpc('kkf_v1_owner_result_control',{p_token:ownerToken,p_submission_id:submissionId,p_command:command,p_reason:reason,p_revision:revision,p_operation_id:operationId}),
  ownerGrade:(submissionId,scores,revision)=>rpc('kkf_v1_owner_grade',{p_token:ownerToken,p_submission_id:submissionId,p_scores:scores,p_revision:revision}),
  ownerSubmission:submissionId=>rpc('kkf_v1_owner_submission',{p_token:ownerToken,p_submission_id:submissionId}),
  ownerRekey:(sessionId,questionId,key,operationId)=>rpc('kkf_v1_owner_rekey',{p_token:ownerToken,p_session_id:sessionId,p_question_id:questionId,p_key:key,p_operation_id:operationId}),
  ownerSnapshot:(categoryId,period,group='',sessionId=null)=>rpc('kkf_v1_owner_snapshot',{p_token:ownerToken,p_category_id:categoryId,p_period:period,p_group:group,p_session_id:sessionId}),
  ownerResetAccess:(participantId,initialPassword=null)=>rpc('kkf_v1_owner_reset_access',{p_token:ownerToken,p_participant_id:participantId,p_initial_password:initialPassword}),
  applyAlias:proof=>rpc('kkf_v1_alias_apply',{p_token:ownerToken,p_proof:proof}),
  publicSession:alias=>rpc('kkf_v1_public_session',{p_alias:alias}),
  findParticipants:(alias,query)=>rpc('kkf_v1_find_participants',{p_alias:alias,p_query:query}),
  async participantAccess(parameters){const r=await rpc('kkf_v1_participant_access',parameters);participantToken=r.token;return {...r,token:undefined};},
  participantContext:()=>rpc('kkf_v1_participant_context',{p_token:participantToken}),
  saveDraft:(answers,revision)=>rpc('kkf_v1_save_draft',{p_token:participantToken,p_answers:answers,p_revision:revision}),
  submit:(answers,password,key,revision,resultRevision=0)=>rpc('kkf_v1_submit',{p_token:participantToken,p_answers:answers,p_password:password,p_idempotency_key:key,p_revision:revision,p_result_revision:resultRevision}),
  ranking:(alias,scope='category')=>rpc('kkf_v1_ranking',{p_alias:alias,p_token:participantToken,p_scope:scope}),
  async revokeOwner(){const token=ownerToken;ownerToken='';if(token)await rpc('kkf_v1_owner_revoke',{p_token:token});},
  async revokeParticipant(){const token=participantToken;participantToken='';if(token)await rpc('kkf_v1_participant_revoke',{p_token:token});},
  clearLocalAccess(){ownerToken='';participantToken='';}
 });
}
