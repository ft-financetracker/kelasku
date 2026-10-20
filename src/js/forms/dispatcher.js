import {api} from '../core/api.js?v=6741forms1';

export async function dispatchPublic({legacy=()=>import('../screens/publicLinks.js?v=6741forms1'),forms=async(alias,target)=>{const {startForms}=await import('./live.js?v=6741forms1');document.body.innerHTML='<div id="kelasku-public-form" class="kkf"></div>';document.body.style.margin='0';await startForms({root:document.getElementById('kelasku-public-form'),alias,target});},resolve=alias=>api('getPublicRoute',{alias},{auth:false}),locationObject=location}={}){
 const path=locationObject.pathname.replace(/^\/+|\/+$/g,''),params=new URLSearchParams(locationObject.search),alias=(params.get('c')||(!['','links.html','index.html'].includes(path)?path:'')).trim().toLowerCase();
 if(!window.KELASKU_FORMS_CONFIG?.ENABLED)return legacy();
 // Underscores remain valid in older class links; Forms aliases never use them.
 if(alias.includes('_')){await legacy();return 'CLASS';}
 const box=document.getElementById('public-links-content');
 const status=message=>{if(box){box.replaceChildren();const p=document.createElement('p');p.setAttribute('role','status');p.textContent=message;box.append(p);}};
 if(!/^[a-z0-9_-]{3,40}$/.test(alias)){status('Tautan belum ditemukan. Periksa kode yang diberikan pengelola.');return 'NOT_FOUND';}
 status('Membuka tautan KelasKu…');
 try{const route=await resolve(alias);
  if(route.status==='LEGACY'||(route.status==='ACTIVE'&&route.target_type==='CLASS_HUB')){await legacy();return 'CLASS';}
  if(route.status==='ACTIVE'&&['FORM_SESSION','FORM_CATEGORY'].includes(route.target_type)){
   history.replaceState({},'','/'+encodeURIComponent(alias));const canonical=document.querySelector('link[rel="canonical"]');if(canonical)canonical.href=locationObject.origin+'/'+alias;
   await forms(alias,route.target_type==='FORM_CATEGORY'?'category':'session');return route.target_type==='FORM_CATEGORY'?'CATEGORY':'FORM';}
  status(route.status==='PENDING'?'Tautan sedang disiapkan. Silakan coba kembali sebentar lagi.':route.status==='DISABLED'?'Tugas ini sedang tidak tersedia. Hubungi pengelola.':'Tautan belum ditemukan. Periksa kode yang diberikan pengelola.');return route.status;
 }catch(e){status('Tautan belum dapat dibuka. Periksa koneksi lalu muat ulang halaman.');return 'ERROR';}
}
if(typeof document!=='undefined'&&document.getElementById('public-links-content'))dispatchPublic();
