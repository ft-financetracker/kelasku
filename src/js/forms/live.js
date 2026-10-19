import {createFormsClient} from './client.js?v=6740forms3';
import {emptyWorkspace,createWorkspaceService} from './workspace.js?v=6740forms3';
import {mountWorkspace} from './view.js?v=6740forms3';
import {api} from '../core/api.js?v=6740forms3';
import {state} from '../core/state.js?v=6740forms3';
import {go} from '../core/router.js?v=6740forms3';
import {appShell,bindAppShell} from '../core/appShell.js?v=6740forms3';

let active=null;
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function style(){if(document.getElementById('kelasku-forms-style'))return;const l=document.createElement('link');l.id='kelasku-forms-style';l.rel='stylesheet';l.href='/src/css/forms.css?v=6740forms3';document.head.append(l);}
export async function startForms({root,alias='',owner=false}={}){
 if(active){active.dispose();active=null;}style();root.classList.add('kkf');
 const config=window.KELASKU_FORMS_CONFIG||{};
 if(!config.ENABLED||!config.SUPABASE_URL||!config.PUBLISHABLE_KEY){root.innerHTML='<div class="kkf-empty"><h2>Tugas Global belum diaktifkan.</h2><p>Konfigurasi modul perlu dilengkapi oleh pengelola KelasKu.</p><a class="kkf-btn" href="/dashboard">Kembali ke KelasKu</a></div>';return;}
 if(owner&&!state.sessionToken){go('auth');return;}
 let service,view,observer,closed=false;const session=state.sessionToken;
 const stop=()=>{if(closed)return;closed=true;observer?.disconnect();window.removeEventListener('kelasku-session-cleared',exit);window.removeEventListener('storage',storage);view?.dispose();if(!view)service?.dispose();if(active?.root===root)active=null;};
 const exit=()=>{stop();if(root.isConnected)root.innerHTML='<div class="kkf-empty"><h2>Akses pengelola ditutup.</h2><a class="kkf-btn" href="/login">Masuk kembali</a></div>';};
 const storage=e=>{if(owner&&['kelasku_session_token','kelasku_forms_v1_logout'].includes(e.key))exit();};
 try{
  const client=createFormsClient(config,{timeoutMs:25000});service=createWorkspaceService(client,{api,store:emptyWorkspace(),alias});
  observer=new MutationObserver(()=>{if(!root.isConnected)stop();});observer.observe(document.body,{childList:true,subtree:true});
  active={root,dispose:stop};
  if(owner){
   window.addEventListener('kelasku-session-cleared',exit);window.addEventListener('storage',storage);
   // Paint the real workspace immediately; only its data region waits.
   view=mountWorkspace(root,{remote:service,initialMode:'owner',embedded:true,initialLoading:true,onExit:()=>{stop();go('tasks');}});
   await service.refreshOwner();
   if(closed||!root.isConnected||state.sessionToken!==session){stop();return;}
   view.setLoadState();
  }else{
   root.innerHTML='<div class="kkf-empty" role="status"><h2>Membuka tugas…</h2><p>Menyiapkan informasi sesi.</p></div>';
   await service.publicSession();
   if(closed||!root.isConnected){stop();return;}
   view=mountWorkspace(root,{remote:service,initialMode:'student'});
  }
  return active;
 }catch(e){
  if(closed||!root.isConnected)return;
  if(owner&&view){view.setLoadState({error:e.message||'Data belum dapat dimuat.'});return active;}
  stop();root.innerHTML='<div class="kkf-empty"><h2>Tugas belum dapat dibuka.</h2><p>'+escape(e.message)+'</p><button class="kkf-btn" id="kkf-retry-start">Coba lagi</button><a class="kkf-btn" href="/dashboard">Kembali ke KelasKu</a></div>';root.querySelector('#kkf-retry-start').onclick=()=>startForms({root,alias,owner});
 }
}
export function renderFormsOwner(){const app=document.getElementById('app');app.innerHTML=appShell({active:'forms',hideSearch:true,content:'<div id="kelasku-forms-root" class="kkf forms-workspace"></div>'});bindAppShell({onRefresh:()=>document.querySelector('#kelasku-forms-root [data-action="refresh-live"]')?.click()});return startForms({root:document.getElementById('kelasku-forms-root'),owner:true});}
