import { state } from './state.js';
import { api } from './api.js';
import { C } from './utils.js';
import { showSystemNotification } from './pwa.js';

let timer=null;
let bound=false;
let initialized=false;

export async function refreshNotificationSignals({showSystem=true}={}){
  if(!state.sessionToken||!navigator.onLine)return state.notifications||[];
  try{
    const before=new Set((state.notifications||[]).map(n=>String(n.notification_id)));
    const data=await api('getNotifications',{limit:50},{onSlow:()=>{}});
    const next=data.items||[];
    state.notifications=next;
    localStorage.setItem('kelasku_notification_cache',JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('kelasku-notifications-updated',{detail:{items:next}}));
    if(initialized&&showSystem&&'Notification' in window&&Notification.permission==='granted'){
      const fresh=next.filter(n=>!n.read_at&&!before.has(String(n.notification_id))).slice(0,2);
      for(const n of fresh)await showSystemNotification(n.title,n.body,n.deep_link||'notifications',n.notification_id);
    }
    initialized=true;
    return next;
  }catch(err){console.warn('Notification signals:',err);return state.notifications||[];}
}

export function startNotificationSignals(){
  if(bound)return;bound=true;
  const run=()=>{if(document.visibilityState==='visible'&&navigator.onLine&&state.sessionToken)refreshNotificationSignals({showSystem:true});};
  window.addEventListener('online',run);window.addEventListener('focus',run);document.addEventListener('visibilitychange',run);
  setTimeout(()=>refreshNotificationSignals({showSystem:false}),500);
  timer=setInterval(run,Number(state.remoteConfig?.notification_poll_ms||C.NOTIFICATION_POLL_MS||60000));
}
