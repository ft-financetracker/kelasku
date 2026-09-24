import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, toast } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';

let activeClassId = '';
let sending = false;
let loadingOlder = false;
const QUICK_EMOJI = ['😀','😂','😊','👍','🙏','🔥','✅','📚','🎯','❤️','👏','🤝'];

export function renderMessages() {
  activeClassId = sessionStorage.getItem('kelasku_message_class') || activeClassId || '';
  const content = `
    <div class="page-head message-page-head">
      <div><div class="eyebrow">RUANG KOMUNIKASI</div><h1>Pesan Kelas</h1><p>Chat kelas yang ringkas, cepat, dan fokus untuk koordinasi belajar.</p></div>
      <span class="phase-badge">CLASS CHAT</span>
    </div>
    <section class="message-layout panel">
      <aside class="message-room-list" id="message-room-list">${roomSkeleton()}</aside>
      <div class="message-conversation" id="message-conversation"><div class="message-empty">Pilih kelas untuk membuka percakapan.</div></div>
    </section>`;
  document.getElementById('app').innerHTML = appShell({ active: 'messages', content, hideSearch: true });
  bindAppShell();
  if (state.messageRooms?.length) drawRooms(state.messageRooms);
  loadRooms(Boolean(state.messageRooms?.length));
}

async function loadRooms(background=false) {
  try {
    const data = await api('getMessageRooms');
    state.messageRooms = data.items || [];
    localStorage.setItem('kelasku_message_rooms_cache', JSON.stringify(state.messageRooms));
    drawRooms(state.messageRooms);
    if (!activeClassId && state.messageRooms.length) activeClassId = state.messageRooms[0].class_id;
    if (activeClassId) openRoom(activeClassId, true);
  } catch (err) {
    if (!background) document.getElementById('message-room-list').innerHTML = `<div class="alert danger">${esc(err.message)}</div>`;
  }
}

function drawRooms(items) {
  const root = document.getElementById('message-room-list'); if (!root) return;
  root.innerHTML = `<div class="message-room-head"><strong>Room Kelas</strong><small>${items.length} kelas</small></div>${items.length ? items.map(roomCard).join('') : '<div class="message-empty compact">Belum ada kelas.</div>'}`;
  root.querySelectorAll('[data-message-room]').forEach(btn => btn.onclick = () => openRoom(btn.dataset.messageRoom));
}

function roomCard(item) {
  return `<button type="button" class="message-room-card ${String(item.class_id)===String(activeClassId)?'active':''}" data-message-room="${esc(item.class_id)}">
    <span class="message-room-icon">${svg('i-class')}</span><span class="message-room-copy"><strong>${esc(item.name)}</strong><small>${esc(item.last_message || 'Belum ada pesan.')}</small></span>
    ${Number(item.unread_count||0)>0?`<b>${Number(item.unread_count)}</b>`:''}
  </button>`;
}

async function openRoom(classId, background=false) {
  activeClassId = classId;
  sessionStorage.setItem('kelasku_message_class', classId);
  document.querySelectorAll('[data-message-room]').forEach(x=>x.classList.toggle('active',x.dataset.messageRoom===classId));
  const cached = state.messagesByClass[classId];
  if (cached) drawConversation(cached);
  else if (!background) document.getElementById('message-conversation').innerHTML = conversationSkeleton();
  try {
    const data = await api('getMessages',{class_id:classId,limit:50});
    state.messagesByClass[classId] = data;
    drawConversation(data);
    const last = data.items?.[data.items.length-1];
    if (last) api('markMessagesRead',{class_id:classId,last_message_id:last.message_id},{onSlow:()=>{}}).catch(()=>{});
    const room=state.messageRooms.find(x=>String(x.class_id)===String(classId)); if(room) room.unread_count=0;
    drawRooms(state.messageRooms);
  } catch(err) {
    if(!cached) document.getElementById('message-conversation').innerHTML=`<div class="alert danger">${esc(err.message)}</div>`;
  }
}

function drawConversation(data) {
  const root=document.getElementById('message-conversation'); if(!root)return;
  const room=state.messageRooms.find(x=>String(x.class_id)===String(activeClassId))||{};
  root.innerHTML=`<header class="message-conversation-head"><div class="message-conversation-room"><span class="message-room-icon small">${svg('i-class')}</span><div><strong>${esc(room.name||'Room Kelas')}</strong><small>${esc(room.class_code||'')} · ${esc(roleLabel(room.role))}</small></div></div><span class="material-symbols-rounded message-head-icon" aria-hidden="true">forum</span></header>
    <div class="message-stream" id="message-stream">${data.has_more?'<button type="button" class="load-older-messages" id="load-older-messages">Muat pesan sebelumnya</button>':''}${(data.items||[]).length?(data.items||[]).map(messageBubble).join(''):'<div class="message-empty">Belum ada pesan. Mulai percakapan kelas.</div>'}</div>
    ${composerHtml()}`;
  bindComposer();
  document.getElementById('load-older-messages')?.addEventListener('click',loadOlderMessages);
  scrollBottom();
}

function composerHtml(){
  return `<form class="message-composer-wa" id="message-composer"><div class="emoji-popover" id="emoji-popover" hidden>${QUICK_EMOJI.map(e=>`<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div><button class="chat-icon-btn" id="emoji-toggle" type="button" aria-label="Pilih emoji" title="Emoji"><span class="material-symbols-rounded">sentiment_satisfied</span></button><div class="message-input-wrap"><textarea id="message-input" maxlength="1600" rows="1" placeholder="Ketik pesan"></textarea></div><button class="message-send-circle" id="message-send" type="submit" aria-label="Kirim pesan" title="Kirim"><span class="material-symbols-rounded">send</span></button></form>`;
}

function bindComposer(){
  const form=document.getElementById('message-composer');
  const input=document.getElementById('message-input');
  const toggle=document.getElementById('emoji-toggle');
  const pop=document.getElementById('emoji-popover');
  if(!form||!input)return;
  form.onsubmit=sendMessage;
  const resize=()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,120)+'px';};
  input.addEventListener('input',resize);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
  toggle?.addEventListener('click',()=>{if(pop)pop.hidden=!pop.hidden;});
  pop?.querySelectorAll('[data-emoji]').forEach(btn=>btn.onclick=()=>{const start=input.selectionStart??input.value.length;const end=input.selectionEnd??start;input.value=input.value.slice(0,start)+btn.dataset.emoji+input.value.slice(end);input.focus();input.selectionStart=input.selectionEnd=start+btn.dataset.emoji.length;resize();pop.hidden=true;});
}

function messageBubble(item) {
  const avatar=item.sender?.avatar_url?`<img src="${esc(item.sender.avatar_url)}" alt="">`:`<span class="default-avatar-icon">${svg('i-user')}</span>`;
  const badges=chatRoleBadges(item.sender||{});
  return `<article class="message-bubble ${item.is_mine?'mine':''}" data-message-id="${esc(item.message_id)}"><span class="message-avatar">${avatar}</span><div class="message-body"><div class="message-meta"><div><strong>${esc(item.is_mine?'Kamu':(item.sender?.full_name||item.sender?.username||'User'))}</strong><span class="message-role-badges">${badges}</span></div><time>${esc(shortTime(item.created_at))}</time></div><p>${esc(item.body)}</p></div></article>`;
}

function chatRoleBadges(sender){
  const role=String(sender.class_role||'MEMBER').toUpperCase(); const out=[];
  if(role==='OWNER')out.push('<span>Owner</span>');
  else {out.push('<span>Member</span>');if(role==='MODERATOR')out.push('<span>Moderator</span>');if(role==='COORDINATOR')out.push('<span>Koordinator</span>');}
  if(sender.is_class_leader)out.push('<span>Ketua Kelas</span>');
  return out.join('');
}

async function loadOlderMessages(){
  if(loadingOlder||!activeClassId)return;
  const current=state.messagesByClass[activeClassId]||{items:[]};
  const before=current.next_before || current.items?.[0]?.created_at || '';
  if(!before)return;
  const btn=document.getElementById('load-older-messages');
  loadingOlder=true;if(btn){btn.disabled=true;btn.textContent='Memuat…';}
  try{
    const older=await api('getMessages',{class_id:activeClassId,limit:40,before});
    const seen=new Set((current.items||[]).map(x=>x.message_id));
    current.items=[...(older.items||[]).filter(x=>!seen.has(x.message_id)),...(current.items||[])];
    current.has_more=older.has_more; current.next_before=older.next_before; state.messagesByClass[activeClassId]=current; drawConversation(current);
  }catch(err){toast(err.message);} finally{loadingOlder=false;}
}

async function sendMessage(event) {
  event.preventDefault(); if(sending||!activeClassId)return;
  const input=document.getElementById('message-input'); const btn=document.getElementById('message-send');
  const body=String(input?.value||'').trim(); if(!body||!input||!btn)return;
  sending=true; input.value=''; input.style.height='auto'; btn.disabled=true; btn.classList.add('sending'); const sendIcon=btn.querySelector('.material-symbols-rounded'); if(sendIcon)sendIcon.textContent='sync';
  const activeRoom=state.messageRooms.find(x=>String(x.class_id)===String(activeClassId))||{};
  const optimistic={message_id:'LOCAL-'+Date.now(),class_id:activeClassId,user_id:state.user?.user_id,body,created_at:new Date().toISOString(),is_mine:true,sender:{full_name:state.user?.full_name||state.user?.username,username:state.user?.username,avatar_url:state.user?.avatar_url||'',class_role:activeRoom.role||'MEMBER',is_class_leader:false}};
  const cache=state.messagesByClass[activeClassId]||{items:[]}; cache.items=[...(cache.items||[]),optimistic]; state.messagesByClass[activeClassId]=cache;
  appendBubble(optimistic); scrollBottom();
  try{
    const data=await api('sendMessage',{class_id:activeClassId,body},{onSlow:()=>btn.classList.add('slow')});
    const current=state.messagesByClass[activeClassId]||{items:[]}; current.items=(current.items||[]).map(x=>x.message_id===optimistic.message_id?data.item:x); state.messagesByClass[activeClassId]=current;
    const pending=document.querySelector(`[data-message-id="${CSS.escape(optimistic.message_id)}"]`); if(pending)pending.outerHTML=messageBubble(data.item);
    const room=state.messageRooms.find(x=>String(x.class_id)===String(activeClassId)); if(room){room.last_message=body;room.last_message_at=data.item.created_at;} drawRooms(state.messageRooms);
  }catch(err){
    const current=state.messagesByClass[activeClassId]||{items:[]}; current.items=(current.items||[]).filter(x=>x.message_id!==optimistic.message_id); state.messagesByClass[activeClassId]=current;
    document.querySelector(`[data-message-id="${CSS.escape(optimistic.message_id)}"]`)?.remove(); const currentInput=document.getElementById('message-input');if(currentInput)currentInput.value=body; toast('Pesan gagal dikirim: '+err.message);
  }finally{sending=false;const currentBtn=document.getElementById('message-send');if(currentBtn){currentBtn.disabled=false;currentBtn.classList.remove('sending','slow');const icon=currentBtn.querySelector('.material-symbols-rounded');if(icon)icon.textContent='send';}document.getElementById('message-input')?.focus();}
}

function appendBubble(item){const stream=document.getElementById('message-stream');if(!stream)return;stream.querySelector('.message-empty')?.remove();stream.insertAdjacentHTML('beforeend',messageBubble(item));}
function scrollBottom(){const stream=document.getElementById('message-stream');if(stream)requestAnimationFrame(()=>stream.scrollTop=stream.scrollHeight);}
function roomSkeleton(){return `<div class="message-room-head skeleton" style="height:40px"></div>${[1,2,3].map(()=>'<div class="message-room-card skeleton" style="height:68px"></div>').join('')}`;}
function conversationSkeleton(){return `<div class="message-conversation-head skeleton" style="height:58px"></div><div class="message-stream">${[1,2,3].map((_,i)=>`<div class="message-bubble skeleton ${i%2?'mine':''}" style="height:66px"></div>`).join('')}</div>`;}
function roleLabel(role){const x=String(role||'MEMBER').toUpperCase();return x==='OWNER'?'Owner':x==='COORDINATOR'?'Koordinator':x==='MODERATOR'?'Moderator':'Member';}
function shortTime(value){try{return new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch{return '';}}
