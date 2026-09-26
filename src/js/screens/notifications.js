import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { esc, svg, fmtDate, toast, sameData } from '../core/utils.js';
import { appShell, bindAppShell } from '../core/appShell.js';
import { openDeepLink } from '../core/router.js';

let category='ALL';
let currentItems=[];
const CATS=[['ALL','Semua'],['CLASS','Kelas'],['TASK','Tugas'],['SCHEDULE','Jadwal'],['ATTENDANCE','Absensi'],['MESSAGE','Pesan'],['SYSTEM','Sistem']];

export function renderNotifications(){
  const content=`<div class="page-head"><div><div class="eyebrow">NOTIFICATION CENTER 2.0</div><h1>Notifikasi</h1><p>Informasi penting kelas, akademik, absensi, dan sistem dalam satu tempat.</p></div><button id="notif-read-all" class="btn btn-secondary">${svg('i-check')} Tandai Semua Dibaca</button></div>
  <div class="notification-filter">${CATS.map(c=>`<button class="filter-chip ${category===c[0]?'active':''}" data-notif-cat="${c[0]}">${esc(c[1])}</button>`).join('')}</div>
  <section class="panel notification-center"><div id="notification-center-list">${notificationSkeleton()}</div></section>`;
  document.getElementById('app').innerHTML=appShell({active:'notifications',content,hideSearch:true}); bindAppShell();
  document.querySelectorAll('[data-notif-cat]').forEach(b=>b.onclick=()=>switchCategory(b.dataset.notifCat));
  document.getElementById('notif-read-all').onclick=markAll;
  if(category==='ALL'&&state.notifications?.length) draw(state.notifications);
  load(Boolean(category==='ALL'&&state.notifications?.length));
}

function switchCategory(next){
  if(next===category)return;
  category=next;
  document.querySelectorAll('[data-notif-cat]').forEach(b=>b.classList.toggle('active',b.dataset.notifCat===category));
  const panel=document.querySelector('.notification-center');
  if(panel)panel.setAttribute('aria-busy','true');
  load(true).finally(()=>panel?.removeAttribute('aria-busy'));
}

async function load(background=false){try{const data=await api('getNotifications',{limit:50,category});const next=data.items||[];const previous=category==='ALL'?(state.notifications||[]):currentItems;const changed=!sameData(previous,next);if(category==='ALL'){state.notifications=next;localStorage.setItem('kelasku_notification_cache',JSON.stringify(state.notifications));}if(changed||!background)draw(next);}catch(err){if(!background)document.getElementById('notification-center-list').innerHTML=`<div class="alert danger">${esc(err.message)}</div>`;}}
function draw(items){currentItems=items||[];const root=document.getElementById('notification-center-list');if(!root)return;root.innerHTML=items.length?`<div class="notification-list">${items.map(row).join('')}</div>`:'<div class="message-empty">Belum ada notifikasi pada kategori ini.</div>';root.querySelectorAll('[data-notification]').forEach(el=>el.onclick=()=>openItem(el.dataset.notification));}
function row(n){return `<button type="button" class="notification-center-row ${n.read_at?'':'unread'}" data-notification="${esc(n.notification_id)}"><span class="notification-center-icon">${svg(iconFor(n.type))}</span><span><small>${esc(labelFor(n.type))} • ${esc(fmtDate(n.created_at))}</small><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p></span>${n.read_at?'':'<b></b>'}</button>`;}
async function openItem(id){const target=currentItems.find(x=>x.notification_id===id)||state.notifications.find(x=>x.notification_id===id);if(!target)return;if(!target.read_at){target.read_at=new Date().toISOString();if(category==='ALL')localStorage.setItem('kelasku_notification_cache',JSON.stringify(state.notifications));api('markNotificationRead',{notification_id:id},{onSlow:()=>{}}).catch(()=>{});}if(target.deep_link)openDeepLink(target.deep_link);else{draw(currentItems);toast('Notifikasi dibaca.');}}
async function markAll(){const btn=document.getElementById('notif-read-all');const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="btn-spinner"></span><span>Memproses…</span>';try{await api('markAllNotificationsRead',{category});if(category==='ALL'){state.notifications=(state.notifications||[]).map(x=>({...x,read_at:x.read_at||new Date().toISOString()}));localStorage.setItem('kelasku_notification_cache',JSON.stringify(state.notifications));}await load(false);toast('Notifikasi ditandai dibaca.');}catch(err){toast(err.message);}finally{btn.disabled=false;btn.innerHTML=old;}}
function iconFor(t){const x=String(t||'SYSTEM').toUpperCase();return x==='TASK'?'i-task':x==='SCHEDULE'?'i-calendar':x==='ATTENDANCE'?'i-check':x==='MESSAGE'?'i-chat':x==='ANNOUNCEMENT'?'i-mega':x==='MATERIAL'?'i-file':'i-bell';}
function labelFor(t){const x=String(t||'SYSTEM').toUpperCase();return x==='ANNOUNCEMENT'?'KELAS':x;}
function notificationSkeleton(){return '<div class="fast-load-panel"><span class="status-dot"></span><div><strong>Menyiapkan notifikasi…</strong><small>Data terakhir akan langsung dipakai jika tersedia.</small></div></div>';}
