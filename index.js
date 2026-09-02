const SUPABASE_URL='https://rdaxqknbtbimkzbydknl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_R26J9-8_tJV00doT2Bwajg_yeGz8bW2';
const db=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const TOKEN_KEY='wff-cashier-token';
const NAME_KEY='wff-cashier-name';

const loginCard=document.getElementById('cashierLoginCard');
const posHome=document.getElementById('posHome');
const loginForm=document.getElementById('cashierLoginForm');
const pinInput=document.getElementById('cashierPin');
const loginMessage=document.getElementById('loginMessage');
const standGrid=document.getElementById('standGrid');
const cashierLogout=document.getElementById('cashierLogout');
const cashierName=document.getElementById('cashierName');
const homeHeadline=document.getElementById('homeHeadline');

function setMessage(text='',error=false){loginMessage.textContent=text;loginMessage.classList.toggle('error',error)}
function getToken(){return localStorage.getItem(TOKEN_KEY)||''}
function clearSession(){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(NAME_KEY)}

async function validateSession(){
  const token=getToken();
  if(!token)return false;
  const {data,error}=await db.rpc('cashier_session_info',{p_token:token});
  if(error||!data){clearSession();return false}
  localStorage.setItem(NAME_KEY,data.name||'Kasse');
  showHome(data.name||'Kasse');
  return true;
}

async function loadStands(){
  standGrid.innerHTML='<div class="stand-card disabled"><span class="stand-icon">…</span><span><strong>Stände werden geladen</strong></span></div>';
  const {data,error}=await db.rpc('get_pos_catalog');
  if(error||!Array.isArray(data)){
    standGrid.innerHTML='<div class="stand-card disabled"><span class="stand-icon">!</span><span><strong>Stände konnten nicht geladen werden</strong><small>Bitte Verbindung prüfen.</small></span></div>';
    return;
  }
  standGrid.innerHTML=data.map(stand=>`<a class="stand-card active" href="drinks.html?stand=${encodeURIComponent(stand.slug)}"><span class="stand-icon">${stand.icon||'🍽️'}</span><span><strong>${escapeHtml(stand.name)}</strong><small>${stand.products?.length||0} Produkte</small></span><span class="cashier-go">→</span></a>`).join('')||'<div class="stand-card disabled"><span><strong>Keine aktiven Stände</strong></span></div>';
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
  setTimeout(()=>pinInput.focus(),50);
}

loginForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!db)return setMessage('Datenbankverbindung nicht verfügbar.',true);
  const pin=pinInput.value.replace(/\D/g,'').slice(0,4);
  pinInput.value=pin;
  if(pin.length!==4)return setMessage('Bitte genau 4 Ziffern eingeben.',true);
  const button=loginForm.querySelector('button');
  button.disabled=true;setMessage('Wird geprüft …');
  const {data,error}=await db.rpc('cashier_login',{p_pin:pin});
  button.disabled=false;
  if(error||!data?.token){pinInput.select();return setMessage('Code nicht erkannt.',true)}
  localStorage.setItem(TOKEN_KEY,data.token);
  localStorage.setItem(NAME_KEY,data.name||'Kasse');
  pinInput.value='';setMessage('');showHome(data.name||'Kasse');
});

pinInput.addEventListener('input',()=>{pinInput.value=pinInput.value.replace(/\D/g,'').slice(0,4);setMessage('')});

cashierLogout.addEventListener('click',async()=>{
  const token=getToken();
  if(token&&db)await db.rpc('cashier_logout',{p_token:token});
  clearSession();showLogin();
});

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}

(async()=>{if(!db||!(await validateSession()))showLogin()})();
