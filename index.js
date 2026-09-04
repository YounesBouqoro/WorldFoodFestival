const SUPABASE_URL='https://rdaxqknbtbimkzbydknl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_R26J9-8_tJV00doT2Bwajg_yeGz8bW2';
const db=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const TOKEN_KEY='wff-cashier-token';
const NAME_KEY='wff-cashier-name';
const CONTEXT_KEY='wff-cashier-context';
const deviceId=window.WFFOffline?.getDeviceId();

const loginCard=document.getElementById('cashierLoginCard');
const posHome=document.getElementById('posHome');
const loginForm=document.getElementById('cashierLoginForm');
const pinInput=document.getElementById('cashierPin');
const loginMessage=document.getElementById('loginMessage');
const standGrid=document.getElementById('standGrid');
const cashierLogout=document.getElementById('cashierLogout');
const cashierName=document.getElementById('cashierName');
const homeHeadline=document.getElementById('homeHeadline');
const connectionBar=document.getElementById('connectionBar');
const connectionText=document.getElementById('connectionText');
const syncNow=document.getElementById('syncNow');

let sessionContext=null;
let syncing=false;

function setMessage(text='',error=false){loginMessage.textContent=text;loginMessage.classList.toggle('error',error)}
function getToken(){return localStorage.getItem(TOKEN_KEY)||''}
function getCachedContext(){try{return JSON.parse(localStorage.getItem(CONTEXT_KEY)||'null')}catch{return null}}
function saveContext(context){sessionContext=context;localStorage.setItem(CONTEXT_KEY,JSON.stringify(context));localStorage.setItem(NAME_KEY,context?.name||'Kasse')}
function clearSession(){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(NAME_KEY);localStorage.removeItem(CONTEXT_KEY);sessionContext=null}
function contextUsableOffline(context){return Boolean(context?.name&&context?.expires_at&&new Date(context.expires_at)>new Date())}

async function updateConnectionStatus(){
  let pending=0;
  try{pending=await WFFOffline.pendingCount()}catch{}
  const offline=!navigator.onLine;
  connectionBar.classList.toggle('offline',offline);
  connectionBar.classList.toggle('pending',pending>0);
  if(offline) connectionText.textContent=pending?'Offline · '+pending+' Bestellung'+(pending===1?'':'en')+' sicher gespeichert':'Offline · Kassieren mit Bar bleibt möglich';
  else if(pending) connectionText.textContent='Online · '+pending+' Bestellung'+(pending===1?'':'en')+' wartet auf Synchronisierung';
  else connectionText.textContent='Online · alles synchronisiert';
  syncNow.classList.toggle('hidden',offline||pending===0);
}

async function syncPendingOrders(){
  if(syncing||!navigator.onLine||!db)return;
  syncing=true;syncNow.disabled=true;
  try{
    const results=await WFFOffline.syncPending(async payload=>{
      const {data,error}=await db.rpc('submit_order_v2',{payload:{...payload,synced_from_offline:true}});
      return {data,error};
    });
    const failed=results.filter(r=>!r.ok);
    if(failed.length) setMessage('Ein Offline-Vorgang konnte noch nicht synchronisiert werden. Daten bleiben sicher gespeichert.',true);
  }catch(error){console.warn('Offline sync failed',error)}
  finally{syncing=false;syncNow.disabled=false;await updateConnectionStatus()}
}

async function validateSession(){
  const token=getToken();
  if(!token)return false;

  if(db&&navigator.onLine){
    const {data,error}=await db.rpc('cashier_session_context',{p_token:token,p_device_id:deviceId,p_user_agent:navigator.userAgent});
    if(!error&&data){saveContext(data);showHome(data.name||'Kasse');return true}
    if(error&&!/fetch|network/i.test(String(error.message||''))){clearSession();return false}
  }

  const cached=getCachedContext();
  if(contextUsableOffline(cached)){
    saveContext(cached);
    showHome(cached.name||'Kasse');
    return true;
  }
  return false;
}

async function loadStands(){
  standGrid.innerHTML='<div class="stand-card disabled"><span class="stand-icon">…</span><span><strong>Stände werden geladen</strong></span></div>';
  let catalog=null;

  if(db&&navigator.onLine){
    const {data,error}=await db.rpc('get_cashier_catalog',{p_token:getToken()});
    if(!error&&Array.isArray(data)){
      catalog=data;
      try{await WFFOffline.saveCatalog(catalog)}catch{}
    }
  }

  if(!catalog){
    try{catalog=await WFFOffline.loadCatalog()}catch{}
    const assigned=new Set(sessionContext?.assigned_stands||[]);
    catalog=(catalog||[]).filter(stand=>assigned.has(stand.slug));
  }

  if(!Array.isArray(catalog)||!catalog.length){
    standGrid.innerHTML='<div class="stand-card disabled"><span class="stand-icon">!</span><span><strong>Keine freigegebenen Stände</strong><small>Admin-Zuweisung oder Verbindung prüfen.</small></span></div>';
    return;
  }

  standGrid.innerHTML=catalog.map(stand=>'<a class="stand-card active" href="drinks.html?stand='+encodeURIComponent(stand.slug)+'"><span class="stand-icon">'+(stand.icon||'🍽️')+'</span><span><strong>'+escapeHtml(stand.name)+'</strong><small>'+(stand.products?.length||0)+' Produkte</small></span><span class="cashier-go">→</span></a>').join('');
}

function showHome(name){
  loginCard.classList.add('hidden');
  posHome.classList.remove('hidden');
  cashierLogout.classList.remove('hidden');
  cashierName.textContent=name;
  homeHeadline.textContent='Stand auswählen';
  loadStands();
}

function showLogin(){
  posHome.classList.add('hidden');
  loginCard.classList.remove('hidden');
  cashierLogout.classList.add('hidden');
  homeHeadline.textContent='Anmelden';
  if(!navigator.onLine)setMessage('Offline: Bitte mit einem bereits angemeldeten Benutzer weiterarbeiten.',true);
  setTimeout(()=>pinInput.focus(),50);
}

loginForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!navigator.onLine)return setMessage('Neue Anmeldung braucht kurz eine Internetverbindung.',true);
  if(!db)return setMessage('Datenbankverbindung nicht verfügbar.',true);
  const pin=pinInput.value.replace(/\D/g,'').slice(0,4);
  pinInput.value=pin;
  if(pin.length!==4)return setMessage('Bitte genau 4 Ziffern eingeben.',true);
  const button=loginForm.querySelector('button');
  button.disabled=true;setMessage('Wird geprüft …');
  const {data,error}=await db.rpc('cashier_login_v2',{p_pin:pin,p_device_id:deviceId,p_user_agent:navigator.userAgent});
  button.disabled=false;
  if(error||!data?.token){
    pinInput.select();
    return setMessage(String(error?.message||'').includes('Device disabled')?'Dieses Kassengerät wurde im Adminbereich deaktiviert.':'Code nicht erkannt.',true);
  }
  localStorage.setItem(TOKEN_KEY,data.token);
  saveContext(data);
  pinInput.value='';setMessage('');showHome(data.name||'Kasse');
  await syncPendingOrders();
});

pinInput.addEventListener('input',()=>{pinInput.value=pinInput.value.replace(/\D/g,'').slice(0,4);setMessage('')});

cashierLogout.addEventListener('click',async()=>{
  let pending=0;try{pending=await WFFOffline.pendingCount()}catch{}
  if(pending>0){
    setMessage(pending+' Offline-Bestellung'+(pending===1?'':'en')+' ist noch nicht synchronisiert. Erst online gehen und synchronisieren.',true);
    window.scrollTo({top:0,behavior:'smooth'});
    return;
  }
  const token=getToken();
  if(token&&db&&navigator.onLine)await db.rpc('cashier_logout',{p_token:token});
  clearSession();showLogin();
});

syncNow.addEventListener('click',syncPendingOrders);
window.addEventListener('online',async()=>{await updateConnectionStatus();await syncPendingOrders();if(getToken())await loadStands()});
window.addEventListener('offline',updateConnectionStatus);

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}

(async()=>{
  await WFFOffline?.registerServiceWorker();
  WFFOffline?.requestPersistence();
  await updateConnectionStatus();
  if(!db||!(await validateSession()))showLogin();
  if(navigator.onLine)syncPendingOrders();
})();