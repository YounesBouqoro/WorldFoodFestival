const SUPABASE_URL='https://rdaxqknbtbimkzbydknl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_R26J9-8_tJV00doT2Bwajg_yeGz8bW2';
const db=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const ADMIN_TOKEN_KEY='wff-admin-token';
let state={cashiers:[],devices:[],stands:[],products:[],settings:{},transactions:[],product_analysis:[]};

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const euro=value=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(value||0));
const fmt=value=>value?new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'–';
const adminToken=()=>sessionStorage.getItem(ADMIN_TOKEN_KEY)||'';

function toast(message){const el=$('adminToast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),1900)}
function loginMessage(text='',error=false){const el=$('adminLoginMessage');el.textContent=text;el.classList.toggle('error',error)}
function rpc(name,args={}){return db.rpc(name,{p_token:adminToken(),...args})}
function showLogin(){$('adminLogin').classList.remove('hidden');$('adminApp').classList.add('hidden');$('adminLogout').classList.add('hidden');setTimeout(()=>$('adminSecret').focus(),50)}
function showApp(){$('adminLogin').classList.add('hidden');$('adminApp').classList.remove('hidden');$('adminLogout').classList.remove('hidden')}

async function validateAdmin(){
  const token=adminToken();if(!db||!token)return false;
  const {data,error}=await db.rpc('admin_session_info',{p_token:token});
  if(error||!data){sessionStorage.removeItem(ADMIN_TOKEN_KEY);return false}
  showApp();await loadState();return true;
}

$('adminLoginForm').addEventListener('submit',async event=>{
  event.preventDefault();const secret=$('adminSecret').value.trim();if(!secret)return;
  const button=event.currentTarget.querySelector('button');button.disabled=true;loginMessage('Wird geprüft …');
  const {data,error}=await db.rpc('admin_login',{p_secret:secret});button.disabled=false;
  if(error||!data?.token){$('adminSecret').select();loginMessage('Admin-Schlüssel nicht erkannt.',true);return}
  sessionStorage.setItem(ADMIN_TOKEN_KEY,data.token);$('adminSecret').value='';loginMessage('');showApp();await loadState();
});
$('adminLogout').addEventListener('click',async()=>{const token=adminToken();if(token)await db.rpc('admin_logout',{p_token:token});sessionStorage.removeItem(ADMIN_TOKEN_KEY);showLogin()});
$('refreshAdmin').addEventListener('click',loadState);

async function loadState(){
  const {data,error}=await rpc('admin_list_state_v2');
  if(error||!data){console.error(error);toast('Admin-Daten konnten nicht geladen werden');return}
  state={cashiers:[],devices:[],stands:[],products:[],settings:{},transactions:[],product_analysis:[],...data};
  renderAll();
}
function renderAll(){renderCashiers();renderDevices();renderStands();renderProducts();renderSettings();renderAnalysis();renderSales();fillStandSelect()}

function standName(slug){return state.stands.find(s=>s.slug===slug)?.name||slug}
function renderCashiers(){
  const list=$('cashierList');
  list.innerHTML=(state.cashiers||[]).map(c=>{
    const access=(c.assigned_stands||[]).map(slug=>'<span class="mini-tag">'+esc(standName(slug))+'</span>').join('')||'<span class="mini-tag off">kein Stand</span>';
    return '<div class="admin-row '+(c.active?'':'inactive')+'"><div><div class="admin-row-title"><strong>'+esc(c.name)+'</strong><span class="status-pill '+(c.active?'':'off')+'">'+(c.active?'AKTIV':'INAKTIV')+'</span></div><div class="tag-row">'+access+'</div><small>Letzter Login: '+esc(fmt(c.last_login_at))+'</small></div><button type="button" data-edit-cashier="'+c.id+'">Bearbeiten</button></div>';
  }).join('')||'<p>Noch keine Benutzer.</p>';
  list.querySelectorAll('[data-edit-cashier]').forEach(button=>button.addEventListener('click',()=>editCashier(button.dataset.editCashier)));
}
function renderStandChecks(selected=[]){
  const set=new Set(selected||[]);
  $('cashierStandChecks').innerHTML=(state.stands||[]).map(s=>'<label class="stand-access-option '+(s.active?'':'inactive')+'"><input type="checkbox" value="'+esc(s.slug)+'" '+(set.has(s.slug)?'checked':'')+' /><span>'+esc(s.icon||'🍽️')+' '+esc(s.name)+'</span></label>').join('')||'<small>Erst einen Stand anlegen.</small>';
}
function editCashier(id=null){
  const c=id?state.cashiers.find(x=>x.id===id):null;
  $('cashierId').value=c?.id||'';$('cashierEditName').value=c?.name||'';$('cashierEditPin').value='';$('cashierActive').checked=c?.active??true;$('pinHint').textContent=c?'· leer lassen = unverändert':'';
  renderStandChecks(c?.assigned_stands||[]);
  $('cashierForm').classList.remove('hidden');$('cashierEditName').focus();
}
$('newCashier').addEventListener('click',()=>editCashier());
$('cancelCashierEdit').addEventListener('click',()=>$('cashierForm').classList.add('hidden'));
$('cashierEditPin').addEventListener('input',event=>event.target.value=event.target.value.replace(/\D/g,'').slice(0,4));
$('cashierForm').addEventListener('submit',async event=>{
  event.preventDefault();const id=$('cashierId').value||null;const pin=$('cashierEditPin').value.trim();
  if(!id&&pin.length!==4)return toast('Neuer Benutzer braucht einen 4-stelligen Code');
  const stands=[...$('cashierStandChecks').querySelectorAll('input:checked')].map(input=>input.value);
  if(!stands.length&&!window.confirm('Dieser Benutzer bekommt keinen Stand und kann damit nicht kassieren. Trotzdem speichern?'))return;
  const {error}=await rpc('admin_save_cashier_access',{p_id:id,p_name:$('cashierEditName').value,p_pin:pin||null,p_active:$('cashierActive').checked,p_stands:stands});
  if(error){console.error(error);return toast(error.message||'Speichern fehlgeschlagen')}
  $('cashierForm').classList.add('hidden');toast('Kassenbenutzer gespeichert');await loadState();
});

function renderDevices(){
  const list=$('deviceList');
  list.innerHTML=(state.devices||[]).map(d=>'<div class="admin-row '+(d.active?'':'inactive')+'"><div><div class="admin-row-title"><strong>'+esc(d.name)+'</strong><span class="status-pill '+(d.active?'':'off')+'">'+(d.active?'AKTIV':'GESPERRT')+'</span></div><small>Zuletzt: '+esc(fmt(d.last_seen_at))+' · Benutzer: '+esc(d.last_cashier||'–')+'</small><small class="mono">'+esc(d.id)+'</small></div><button type="button" data-edit-device="'+d.id+'">Bearbeiten</button></div>').join('')||'<p>Noch kein Kassengerät registriert.</p>';
  list.querySelectorAll('[data-edit-device]').forEach(button=>button.addEventListener('click',()=>editDevice(button.dataset.editDevice)));
}
function editDevice(id){
  const d=state.devices.find(x=>x.id===id);if(!d)return;
  $('deviceId').value=d.id;$('deviceName').value=d.name;$('deviceActive').checked=d.active;$('deviceForm').classList.remove('hidden');$('deviceName').focus();
}
$('cancelDeviceEdit').addEventListener('click',()=>$('deviceForm').classList.add('hidden'));
$('deviceForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const {error}=await rpc('admin_save_device',{p_id:$('deviceId').value,p_name:$('deviceName').value,p_active:$('deviceActive').checked});
  if(error){console.error(error);return toast(error.message||'Gerät konnte nicht gespeichert werden')}
  $('deviceForm').classList.add('hidden');toast('Gerät gespeichert');await loadState();
});

function renderStands(){
  $('standList').innerHTML=(state.stands||[]).map(s=>'<button type="button" class="stand-chip '+(s.active?'':'off')+'" data-edit-stand="'+esc(s.slug)+'">'+esc(s.icon||'🍽️')+' '+esc(s.name)+'</button>').join('');
  $('standList').querySelectorAll('[data-edit-stand]').forEach(button=>button.addEventListener('click',()=>editStand(button.dataset.editStand)));
}
function slugifyStand(value){return String(value||'').toLowerCase().trim().replace(/[ä]/g,'ae').replace(/[ö]/g,'oe').replace(/[ü]/g,'ue').replace(/[ß]/g,'ss').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)}
let standSlugManuallyEdited=false;
function editStand(slug=null){
  const s=slug?state.stands.find(item=>item.slug===slug):null;
  standSlugManuallyEdited=Boolean(s);
  $('standSlug').value=s?.slug||'';
  $('standSlug').readOnly=Boolean(s);
  $('standName').value=s?.name||'';
  $('standIcon').value=s?.icon||'';
  $('standSort').value=s?.sort_order??0;
  $('standActive').checked=s?.active??true;
  $('standForm').classList.remove('hidden');
  $('productForm').classList.add('hidden');
  $('standName').focus();
}
$('newStand').addEventListener('click',()=>editStand());
$('standName').addEventListener('input',()=>{
  if(!$('standSlug').readOnly&&!standSlugManuallyEdited)$('standSlug').value=slugifyStand($('standName').value);
});
$('standSlug').addEventListener('input',()=>{
  if(!$('standSlug').readOnly)standSlugManuallyEdited=true;
});
$('cancelStandEdit').addEventListener('click',()=>$('standForm').classList.add('hidden'));
$('standForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const {error}=await rpc('admin_save_stand',{p_slug:$('standSlug').value,p_name:$('standName').value,p_icon:$('standIcon').value,p_active:$('standActive').checked,p_sort_order:Number($('standSort').value||0)});
  if(error){console.error(error);return toast(error.message||'Stand konnte nicht gespeichert werden')}
  $('standForm').classList.add('hidden');toast('Stand gespeichert · jetzt Benutzer zuweisen oder Produkte anlegen');await loadState();
});

function fillStandSelect(){const select=$('productStand');const current=select.value;select.innerHTML=(state.stands||[]).map(s=>'<option value="'+esc(s.slug)+'">'+esc(s.name)+'</option>').join('');if([...select.options].some(o=>o.value===current))select.value=current}
function renderProducts(){
  $('productList').innerHTML=(state.products||[]).map(p=>'<div class="admin-row '+(p.active?'':'inactive')+'"><div><div class="admin-row-title"><strong>'+esc(p.name)+'</strong><span class="price-tag">'+euro(p.price)+'</span></div><small>'+esc(standName(p.stand_slug))+' · '+esc(p.category)+' · '+Number(p.tax_rate).toLocaleString('de-DE')+' % MwSt.'+(p.deposit_enabled?' · Pfand '+euro(p.deposit_price):'')+'</small></div><button type="button" data-edit-product="'+p.id+'">Bearbeiten</button></div>').join('')||'<p>Noch keine Produkte.</p>';
  $('productList').querySelectorAll('[data-edit-product]').forEach(button=>button.addEventListener('click',()=>editProduct(button.dataset.editProduct)));
}
function editProduct(id=null){
  fillStandSelect();const p=id?state.products.find(item=>item.id===id):null;
  $('productId').value=p?.id||'';$('productStand').value=p?.stand_slug||state.stands?.[0]?.slug||'';$('productCategory').value=p?.category||'';$('productName').value=p?.name||'';$('productPrice').value=p?.price??'';$('productTax').value=p?.tax_rate??19;$('productSort').value=p?.sort_order??0;$('productDeposit').checked=p?.deposit_enabled??false;$('productDepositPrice').value=p?.deposit_price??2;$('productDepositTax').value=p?.deposit_tax_rate??19;$('productDiscountable').checked=p?.discountable??true;$('productActive').checked=p?.active??true;$('productForm').classList.remove('hidden');$('standForm').classList.add('hidden');toggleDepositFields();$('productName').focus();
}
function toggleDepositFields(){const enabled=$('productDeposit').checked;$('productDepositPrice').disabled=!enabled;$('productDepositTax').disabled=!enabled}
$('productDeposit').addEventListener('change',toggleDepositFields);
$('newProduct').addEventListener('click',()=>editProduct());
$('cancelProductEdit').addEventListener('click',()=>$('productForm').classList.add('hidden'));
$('productForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const args={p_id:$('productId').value||null,p_stand_slug:$('productStand').value,p_category:$('productCategory').value,p_name:$('productName').value,p_price:Number($('productPrice').value),p_tax_rate:Number($('productTax').value),p_deposit_enabled:$('productDeposit').checked,p_deposit_price:Number($('productDepositPrice').value||0),p_deposit_tax_rate:Number($('productDepositTax').value||0),p_discountable:$('productDiscountable').checked,p_active:$('productActive').checked,p_sort_order:Number($('productSort').value||0)};
  const {error}=await rpc('admin_save_product',args);if(error){console.error(error);return toast(error.message||'Produkt konnte nicht gespeichert werden')}
  $('productForm').classList.add('hidden');toast('Produkt gespeichert');await loadState();
});

function renderAnalysis(){
  const rows=state.product_analysis||[];
  const qty=rows.reduce((s,r)=>s+Number(r.net_qty||0),0);
  const refunded=rows.reduce((s,r)=>s+Number(r.refunded_qty||0),0);
  const revenue=rows.reduce((s,r)=>s+Number(r.product_revenue||0),0);
  $('analysisSummary').innerHTML='<div class="summary-card"><span>NETTO STÜCK</span><strong>'+qty+'</strong></div><div class="summary-card"><span>ERSTATTET</span><strong>'+refunded+'</strong></div><div class="summary-card"><span>PRODUKTUMSATZ</span><strong>'+euro(revenue)+'</strong></div>';
  $('analysisRows').innerHTML=rows.map(r=>'<tr><td>'+esc(r.product_name)+'</td><td>'+esc(r.stand_name||r.stand_slug)+'</td><td>'+esc(r.category)+'</td><td>'+Number(r.sold_qty||0)+'</td><td>'+Number(r.refunded_qty||0)+'</td><td><strong>'+Number(r.net_qty||0)+'</strong></td><td>'+euro(r.product_revenue)+'</td></tr>').join('')||'<tr><td colspan="7">Noch keine Verkäufe.</td></tr>';
}

function renderSettings(){const s=state.settings||{};$('merchantName').value=s.merchant_name||'';$('addressLine1').value=s.address_line1||'';$('postalCode').value=s.postal_code||'';$('city').value=s.city||'';$('vatId').value=s.vat_id||'';$('taxNumber').value=s.tax_number||'';$('receiptNote').value=s.receipt_note||'';$('systemSerial').value=s.system_serial||'';$('tseSerial').value=s.tse_serial||''}
$('settingsForm').addEventListener('submit',async event=>{event.preventDefault();const p_settings={merchant_name:$('merchantName').value,address_line1:$('addressLine1').value,postal_code:$('postalCode').value,city:$('city').value,vat_id:$('vatId').value,tax_number:$('taxNumber').value,receipt_note:$('receiptNote').value,system_serial:$('systemSerial').value,tse_serial:$('tseSerial').value};const {error}=await rpc('admin_save_settings',{p_settings});if(error){console.error(error);return toast('Belegdaten konnten nicht gespeichert werden')}toast('Belegdaten gespeichert');await loadState()});
$('secretForm').addEventListener('submit',async event=>{event.preventDefault();const secret=$('newAdminSecret').value;if(secret.length<12)return toast('Mindestens 12 Zeichen verwenden');const {error}=await rpc('admin_change_secret',{p_new_secret:secret});if(error){console.error(error);return toast(error.message||'Schlüssel konnte nicht geändert werden')}$('newAdminSecret').value='';toast('Admin-Schlüssel geändert')});

function renderSales(){
  const tx=state.transactions||[];
  const revenue=tx.reduce((s,t)=>s+Number(t.amount||0),0);
  const cash=tx.filter(t=>t.payment_method==='cash').reduce((s,t)=>s+Number(t.amount||0),0);
  const card=tx.filter(t=>t.payment_method==='card').reduce((s,t)=>s+Number(t.amount||0),0);
  $('salesSummary').innerHTML='<div class="summary-card"><span>NETTO UMSATZ</span><strong>'+euro(revenue)+'</strong></div><div class="summary-card"><span>BAR</span><strong>'+euro(cash)+'</strong></div><div class="summary-card"><span>KARTE</span><strong>'+euro(card)+'</strong></div>';
  $('salesRows').innerHTML=tx.map(t=>{
    const kind=t.kind==='refund'?'Rückerstattung':t.status==='cancelled'?'Storno':'Verkauf';
    const pay=t.payment_method==='cash'?'Bar':t.payment_method==='card'?'Karte':'–';
    const status=t.status==='completed'?'Abgeschlossen':t.status==='refunded'?'Erstattet':'Storniert';
    return '<tr><td>'+esc(fmt(t.created_at))+'</td><td>'+esc(t.reference)+'</td><td>'+kind+'</td><td>'+esc(t.cashier||'–')+'</td><td>'+esc(t.device||'–')+'</td><td>'+esc(t.stand||'–')+'</td><td>'+pay+'</td><td>'+status+(t.synced_from_offline?' · offline sync':'')+'</td><td>'+euro(t.amount)+'</td></tr>';
  }).join('')||'<tr><td colspan="9">Noch keine Vorgänge.</td></tr>';
}

document.querySelectorAll('.admin-tabs button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.admin-tabs button').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('.admin-panel').forEach(panel=>panel.classList.toggle('active',panel.dataset.panel===button.dataset.tab))}));

(async()=>{if(!(await validateAdmin()))showLogin()})();