const SUPABASE_URL='https://rdaxqknbtbimkzbydknl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_R26J9-8_tJV00doT2Bwajg_yeGz8bW2';
const db=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const CASHIER_TOKEN_KEY='wff-cashier-token';
const CASHIER_NAME_KEY='wff-cashier-name';
const CONTEXT_KEY='wff-cashier-context';
const standSlug=new URLSearchParams(location.search).get('stand')||'drinks';
const deviceId=window.WFFOffline?.getDeviceId();

let activeStand=null;
let sessionContext=null;
const cart=new Map();
let discountActive=false;
let checkoutBusy=false;
let startedAt=null;
let currentOrderId=null;
let lastReceipt=null;
let syncing=false;

const euro=value=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(value||0));
const idFor=value=>String(value).toLowerCase().replace(/[^a-z0-9äöüß]+/gi,'-').replace(/^-|-$/g,'');
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

const productGroups=document.getElementById('productGroups');
const categoryTabs=document.getElementById('categoryTabs');
const cartItems=document.getElementById('cartItems');
const productSubtotalEl=document.getElementById('productSubtotal');
const depositSubtotalEl=document.getElementById('depositSubtotal');
const discountRow=document.getElementById('discountRow');
const discountValue=document.getElementById('discountValue');
const totalEl=document.getElementById('total');
const mobileTotal=document.getElementById('mobileTotal');
const mobileCount=document.getElementById('mobileCount');
const mobileItemLabel=document.getElementById('mobileItemLabel');
const studentDiscount=document.getElementById('studentDiscount');
const cartPanel=document.querySelector('.cart-panel');
const checkoutBackdrop=document.getElementById('checkoutBackdrop');
const checkoutClose=document.getElementById('checkoutClose');
const mobileCartButton=document.getElementById('mobileCartButton');
const cancelOrderButton=document.getElementById('cancelOrder');
const payCashButton=document.getElementById('payCash');
const payCardButton=document.getElementById('payCard');
const standTitle=document.getElementById('standTitle');
const activeCashierName=document.getElementById('activeCashierName');
const activeDeviceName=document.getElementById('activeDeviceName');
const posConnectionBar=document.getElementById('posConnectionBar');
const posConnectionText=document.getElementById('posConnectionText');
const posSyncNow=document.getElementById('posSyncNow');
const checkoutNetworkNote=document.getElementById('checkoutNetworkNote');
const cashButtonHint=document.getElementById('cashButtonHint');
const cardButtonHint=document.getElementById('cardButtonHint');
const receiptModal=document.getElementById('receiptModal');
const receiptOrderSummary=document.getElementById('receiptOrderSummary');
const receiptEmail=document.getElementById('receiptEmail');
const receiptSms=document.getElementById('receiptSms');
const receiptOpen=document.getElementById('receiptOpen');
const receiptDone=document.getElementById('receiptDone');
const receiptShareActions=document.getElementById('receiptShareActions');
const receiptHint=document.getElementById('receiptHint');
const receiptStatusLabel=document.getElementById('receiptStatusLabel');
const receiptModalTitle=document.getElementById('receiptModalTitle');
const receiptSuccessIcon=document.getElementById('receiptSuccessIcon');

function getClientSession(){
  const key='wff-pos-session';
  try{
    let value=localStorage.getItem(key);
    if(!value){value=WFFOffline.uuid();localStorage.setItem(key,value)}
    return value;
  }catch{return WFFOffline.uuid()}
}
const clientSession=getClientSession();
function cashierToken(){return localStorage.getItem(CASHIER_TOKEN_KEY)||''}
function cachedContext(){try{return JSON.parse(localStorage.getItem(CONTEXT_KEY)||'null')}catch{return null}}
function saveContext(context){sessionContext=context;localStorage.setItem(CONTEXT_KEY,JSON.stringify(context));localStorage.setItem(CASHIER_NAME_KEY,context?.name||'Kasse')}
function contextUsableOffline(context){return Boolean(context?.name&&context?.expires_at&&new Date(context.expires_at)>new Date())}
function networkError(error){return !navigator.onLine||/fetch|network|load failed|connection/i.test(String(error?.message||error||''))}

async function ensureCashier(){
  const token=cashierToken();
  if(!token){location.replace('index.html');return false}
  if(db&&navigator.onLine){
    const {data,error}=await db.rpc('cashier_session_context',{p_token:token,p_device_id:deviceId,p_user_agent:navigator.userAgent});
    if(!error&&data)saveContext(data);
    else if(error&&!networkError(error)){
      localStorage.removeItem(CASHIER_TOKEN_KEY);localStorage.removeItem(CASHIER_NAME_KEY);localStorage.removeItem(CONTEXT_KEY);
      location.replace('index.html');return false;
    }
  }
  if(!sessionContext){
    const cached=cachedContext();
    if(!contextUsableOffline(cached)){location.replace('index.html');return false}
    saveContext(cached);
  }
  if(!(sessionContext.assigned_stands||[]).includes(standSlug)){location.replace('index.html');return false}
  activeCashierName.textContent=sessionContext.name||'Kasse';
  if(activeDeviceName)activeDeviceName.textContent=sessionContext.device?.name||('Gerät '+String(deviceId).slice(-4));
  return true;
}

async function loadCatalog(){
  let catalog=null;
  if(db&&navigator.onLine){
    const {data,error}=await db.rpc('get_cashier_catalog',{p_token:cashierToken()});
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
  activeStand=(catalog||[]).find(item=>item.slug===standSlug);
  if(!activeStand){flash('Stand ist für diesen Benutzer nicht verfügbar');setTimeout(()=>location.replace('index.html'),900);return false}
  document.title=activeStand.name+' – World Food Festival Kasse';
  standTitle.textContent=activeStand.name;
  activeStand.products=(activeStand.products||[]).map(p=>({...p,price:Number(p.price),tax_rate:Number(p.tax_rate),deposit_price:Number(p.deposit_price),deposit_tax_rate:Number(p.deposit_tax_rate)}));
  renderCatalog();return true;
}

function groupedProducts(){
  const groups=new Map();
  for(const product of activeStand?.products||[]){
    if(!groups.has(product.category))groups.set(product.category,[]);
    groups.get(product.category).push(product);
  }
  return [...groups.entries()];
}
function renderCatalog(){
  const groups=groupedProducts();
  categoryTabs.innerHTML=groups.map((entry,index)=>'<button class="category-tab '+(index===0?'active':'')+'" type="button" data-target="'+idFor(entry[0])+'">'+escapeHtml(entry[0])+'</button>').join('');
  productGroups.innerHTML=groups.map(entry=>{
    const category=entry[0],products=entry[1];
    const cards=products.map(product=>'<button class="product-button '+(product.price<0?'refund':'')+'" type="button" data-product-id="'+product.id+'"><span class="product-qty-badge hidden" data-product-badge="'+product.id+'" aria-hidden="true"></span><span class="name">'+escapeHtml(product.name)+'</span><span class="price">'+(product.price<0?'−':'')+euro(Math.abs(product.price))+'</span></button>').join('');
    return '<section class="product-group" id="'+idFor(category)+'"><h2>'+escapeHtml(category)+' <span>'+products.length+'</span></h2><div class="product-grid">'+cards+'</div></section>';
  }).join('');
  productGroups.querySelectorAll('.product-button').forEach(button=>button.addEventListener('click',()=>{if(checkoutBusy)return;addItem(button.dataset.productId);const p=activeStand.products.find(x=>x.id===button.dataset.productId);if(p)flash(p.name+' hinzugefügt')}));
  categoryTabs.querySelectorAll('.category-tab').forEach(tab=>tab.addEventListener('click',()=>{categoryTabs.querySelectorAll('.category-tab').forEach(t=>t.classList.remove('active'));tab.classList.add('active');document.getElementById(tab.dataset.target)?.scrollIntoView({behavior:'smooth',block:'start'})}));
}
function ensureOrderIdentity(){if(!startedAt)startedAt=new Date().toISOString();if(!currentOrderId)currentOrderId=WFFOffline.uuid()}
function addItem(productId){const product=activeStand.products.find(p=>p.id===productId);if(!product)return;ensureOrderIdentity();const existing=cart.get(productId)||{product,qty:0,depositQty:0};existing.qty+=1;if(product.deposit_enabled)existing.depositQty+=1;cart.set(productId,existing);renderCart()}
function changeQty(productId,delta){if(checkoutBusy)return;const item=cart.get(productId);if(!item)return;if(delta>0){ensureOrderIdentity();item.qty+=1;if(item.product.deposit_enabled)item.depositQty+=1}else{item.qty-=1;if(item.product.deposit_enabled)item.depositQty=Math.min(item.depositQty,Math.max(0,item.qty))}if(item.qty<=0)cart.delete(productId);else cart.set(productId,item);if(!cart.size){startedAt=null;currentOrderId=null}renderCart()}
function changeDeposit(productId,delta){if(checkoutBusy)return;const item=cart.get(productId);if(!item?.product.deposit_enabled)return;item.depositQty=Math.max(0,Math.min(item.qty,item.depositQty+delta));cart.set(productId,item);renderCart()}
function calculateTotals(items=[...cart.values()]){const productSubtotal=items.reduce((s,i)=>s+i.product.price*i.qty,0);const depositSubtotal=items.reduce((s,i)=>s+(i.product.deposit_enabled?i.depositQty*i.product.deposit_price:0),0);const discountableSubtotal=items.filter(i=>i.product.discountable).reduce((s,i)=>s+Math.max(i.product.price*i.qty,0),0);const discount=discountActive?discountableSubtotal*.25:0;const total=productSubtotal+depositSubtotal-discount;const count=items.reduce((s,i)=>s+i.qty,0);return{productSubtotal,depositSubtotal,discount,total,count}}
function updateProductBadges(){productGroups.querySelectorAll('[data-product-badge]').forEach(b=>{const qty=cart.get(b.dataset.productBadge)?.qty||0;b.textContent=qty;b.classList.toggle('hidden',qty===0);b.closest('.product-button')?.classList.toggle('selected',qty>0)})}
function renderCart(){
  const items=[...cart.values()];
  if(!items.length)cartItems.innerHTML='<div class="empty-state"><strong>Noch keine Auswahl.</strong><span>Tippe auf ein Produkt.</span></div>';
  else{
    cartItems.innerHTML=items.map(item=>{
      const p=item.product;const dep=p.deposit_enabled?item.depositQty*p.deposit_price:0;const line=p.price*item.qty+dep;
      const depControls=p.deposit_enabled?'<div class="qty-group deposit-row '+(item.depositQty===0?'deposit-off':'')+'"><span>Pfand <small>'+euro(p.deposit_price)+'</small></span><div class="qty-controls deposit-controls"><button type="button" data-deposit-action="minus" data-id="'+p.id+'" '+(item.depositQty===0?'disabled':'')+'>−</button><strong>'+item.depositQty+'</strong><button type="button" data-deposit-action="plus" data-id="'+p.id+'" '+(item.depositQty>=item.qty?'disabled':'')+'>+</button></div></div>':'';
      return '<div class="cart-line"><div class="cart-line-top"><div class="cart-product-title"><div class="line-name">'+escapeHtml(p.name)+'</div><small>'+euro(p.price)+' / Stück</small></div><div class="line-price">'+euro(line)+'</div></div><div class="cart-line-controls"><div class="qty-group"><span>Menge</span><div class="qty-controls"><button type="button" data-action="minus" data-id="'+p.id+'">−</button><strong>'+item.qty+'</strong><button type="button" data-action="plus" data-id="'+p.id+'">+</button></div></div>'+depControls+'</div></div>';
    }).join('');
    cartItems.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>changeQty(b.dataset.id,b.dataset.action==='plus'?1:-1)));
    cartItems.querySelectorAll('[data-deposit-action]').forEach(b=>b.addEventListener('click',()=>changeDeposit(b.dataset.id,b.dataset.depositAction==='plus'?1:-1)));
  }
  const t=calculateTotals(items);productSubtotalEl.textContent=euro(t.productSubtotal);depositSubtotalEl.textContent=euro(t.depositSubtotal);discountValue.textContent='−'+euro(t.discount);discountRow.classList.toggle('hidden',!discountActive);totalEl.textContent=euro(t.total);mobileTotal.textContent=euro(t.total);mobileCount.textContent=t.count;mobileItemLabel.textContent=t.count+' Artikel';
  const empty=!items.length;payCashButton.disabled=empty||checkoutBusy;payCardButton.disabled=empty||checkoutBusy||!navigator.onLine;cancelOrderButton.disabled=empty||checkoutBusy;mobileCartButton.disabled=empty||checkoutBusy;studentDiscount.disabled=empty||checkoutBusy;updateProductBadges();
}
function openCheckout(){if(!cart.size)return flash('Erst ein Produkt auswählen');cartPanel.classList.add('open');checkoutBackdrop.classList.add('open');document.body.classList.add('checkout-open');checkoutClose?.focus({preventScroll:true})}
function closeCheckout(){if(checkoutBusy)return;cartPanel.classList.remove('open');checkoutBackdrop.classList.remove('open');document.body.classList.remove('checkout-open')}
function resetOrder(){cart.clear();discountActive=false;startedAt=null;currentOrderId=null;studentDiscount.classList.remove('active');studentDiscount.setAttribute('aria-pressed','false');closeCheckout();renderCart()}
function setCheckoutBusy(busy){checkoutBusy=busy;document.body.classList.toggle('checkout-busy',busy);renderCart()}
function buildOrderPayload(status,paymentMethod,offline=false){ensureOrderIdentity();return{stand:standSlug,status,payment_method:paymentMethod,student_discount:discountActive,client_session:clientSession,cashier_token:cashierToken(),started_at:startedAt||new Date().toISOString(),client_order_id:currentOrderId,device_id:deviceId,synced_from_offline:offline,items:[...cart.values()].map(i=>({product_id:i.product.id,quantity:i.qty,deposit_qty:i.product.deposit_enabled?i.depositQty:0}))}}
async function storeOfflineOrder(payload,total){await WFFOffline.enqueueOrder(payload,{stand_name:activeStand?.name||standSlug,cashier_name:sessionContext?.name||'',total,status:payload.status,payment_method:payload.payment_method});await updateConnectionStatus()}

async function finishOrder(action){
  if(checkoutBusy||!cart.size)return;
  const cancelled=action==='cancel';const status=cancelled?'cancelled':'completed';const payment=action==='cash'?'cash':action==='card'?'card':null;const totals=calculateTotals();
  if(action==='card'&&!navigator.onLine){flash('Kartenzahlung ist offline gesperrt. Barzahlung bleibt sicher möglich.');return}
  const payload=buildOrderPayload(status,payment,!navigator.onLine);
  if(!navigator.onLine){
    setCheckoutBusy(true);
    try{await storeOfflineOrder(payload,totals.total);setCheckoutBusy(false);resetOrder();showCompletion({offline:true,cancelled,total:totals.total,paymentMethod:payment})}
    catch(error){setCheckoutBusy(false);console.error(error);flash('Lokales Speichern fehlgeschlagen – Bestellung bleibt offen')}
    return;
  }
  setCheckoutBusy(true);
  const {data,error}=await db.rpc('submit_order_v2',{payload});
  if(error){
    console.error(error);
    if(networkError(error)&&action!=='card'){
      try{await storeOfflineOrder({...payload,synced_from_offline:true},totals.total);setCheckoutBusy(false);resetOrder();showCompletion({offline:true,cancelled,total:totals.total,paymentMethod:payment});return}catch(e){console.error(e)}
    }
    setCheckoutBusy(false);
    if(/session/i.test(String(error.message||''))){flash('Kassen-Anmeldung abgelaufen');setTimeout(()=>location.replace('index.html'),900);return}
    if(/device/i.test(String(error.message||''))){flash('Dieses Kassengerät wurde deaktiviert');return}
    if(/stand/i.test(String(error.message||''))){flash('Stand-Freigabe wurde geändert. Admin prüfen.');return}
    flash(action==='card'?'Kartenvorgang nicht gespeichert – Bestellung bleibt offen':'Speichern fehlgeschlagen – Bestellung bleibt offen');return;
  }
  setCheckoutBusy(false);
  if(cancelled){resetOrder();showCompletion({cancelled:true,orderNo:data?.order_no||'',total:Number(data?.total_amount||0)});return}
  resetOrder();showCompletion({orderNo:data?.order_no||'',total:Number(data?.total_amount||0),paymentMethod:payment,receiptToken:data?.receipt_token});
}
function requestCancel(){if(!cart.size||checkoutBusy)return;if(window.confirm('Bestellung wirklich stornieren?\n\nSie wird als Storno gespeichert und zählt nicht zum Umsatz.'))finishOrder('cancel')}

function showCompletion(context){
  lastReceipt=context;const offline=Boolean(context.offline),cancelled=Boolean(context.cancelled);
  receiptSuccessIcon.textContent=cancelled?'×':'✓';receiptStatusLabel.textContent=cancelled?'BESTELLUNG STORNIERT':offline?'OFFLINE SICHER GESPEICHERT':'BESTELLUNG ABGESCHLOSSEN';receiptModalTitle.textContent=cancelled?'Storno gespeichert':offline?'Kein Datenverlust':'Beleg anbieten';
  if(cancelled)receiptOrderSummary.textContent=context.orderNo?'Bestellung #'+context.orderNo+' · Storno':'Storno lokal gespeichert';
  else receiptOrderSummary.textContent=(context.orderNo?'Bestellung #'+context.orderNo+' · ':'')+euro(context.total)+(context.paymentMethod?' · '+(context.paymentMethod==='cash'?'Bar':'Karte'):'');
  const share=Boolean(context.receiptToken&&!offline&&!cancelled);receiptShareActions.classList.toggle('hidden',!share);
  receiptHint.textContent=offline?'Die Bestellung liegt sicher auf diesem Gerät und wird automatisch synchronisiert, sobald das Netz zurück ist.':cancelled?'Der Storno ist protokolliert und zählt nicht zum Umsatz.':'Elektronischen Beleg nur mit Zustimmung des Gastes versenden.';
  receiptModal.classList.remove('hidden');document.body.classList.add('receipt-open');receiptDone.focus({preventScroll:true});
}
function hideReceiptModal(){receiptModal.classList.add('hidden');document.body.classList.remove('receipt-open');lastReceipt=null}
function receiptUrl(){if(!lastReceipt?.receiptToken)return null;const url=new URL('receipt.html',location.href);url.searchParams.set('t',lastReceipt.receiptToken);return url.toString()}
function receiptShareText(){const url=receiptUrl();return 'World Food Festival – Beleg #'+(lastReceipt?.orderNo||'')+'\nGesamt: '+euro(lastReceipt?.total)+'\n'+(url||'')}
receiptEmail.addEventListener('click',()=>{if(lastReceipt)location.href='mailto:?subject='+encodeURIComponent('Beleg World Food Festival #'+(lastReceipt.orderNo||''))+'&body='+encodeURIComponent(receiptShareText())});
receiptSms.addEventListener('click',()=>{if(!lastReceipt)return;const body=encodeURIComponent(receiptShareText());location.href=/iPad|iPhone|iPod/.test(navigator.userAgent)?'sms:&body='+body:'sms:?body='+body});
receiptOpen.addEventListener('click',()=>{const url=receiptUrl();if(url)window.open(url,'_blank','noopener')});
receiptDone.addEventListener('click',hideReceiptModal);

async function updateConnectionStatus(){
  let pending=0;try{pending=await WFFOffline.pendingCount()}catch{}
  const offline=!navigator.onLine;posConnectionBar.classList.toggle('offline',offline);posConnectionBar.classList.toggle('pending',pending>0);
  if(offline)posConnectionText.textContent=pending?'Offline · '+pending+' Vorgang'+(pending===1?'':'e')+' sicher gespeichert':'Offline · Barzahlung bleibt möglich';
  else if(pending)posConnectionText.textContent='Online · '+pending+' Vorgang'+(pending===1?'':'e')+' wartet auf Synchronisierung';
  else posConnectionText.textContent='Online · alles synchronisiert';
  posSyncNow.classList.toggle('hidden',offline||pending===0);checkoutNetworkNote.textContent=offline?'Offline: Bar wird lokal gesichert. Karte ist gesperrt.':'Zahlungsart wählen und abschließen.';cashButtonHint.textContent=offline?'offline sicher speichern':'sofort abschließen';cardButtonHint.textContent=offline?'offline nicht möglich':'Kartenzahlung';renderCart();
}
async function syncPendingOrders(){if(syncing||!navigator.onLine||!db)return;syncing=true;posSyncNow.disabled=true;try{await WFFOffline.syncPending(async payload=>{const {data,error}=await db.rpc('submit_order_v2',{payload:{...payload,synced_from_offline:true}});return{data,error}})}catch(error){console.warn(error)}finally{syncing=false;posSyncNow.disabled=false;await updateConnectionStatus()}}
function flash(message){document.querySelector('.toast')?.remove();const toast=document.createElement('div');toast.className='toast';toast.textContent=message;document.body.appendChild(toast);setTimeout(()=>toast.remove(),1900)}

studentDiscount.addEventListener('click',()=>{if(checkoutBusy||!cart.size)return;discountActive=!discountActive;studentDiscount.classList.toggle('active',discountActive);studentDiscount.setAttribute('aria-pressed',String(discountActive));renderCart()});
mobileCartButton.addEventListener('click',openCheckout);checkoutClose.addEventListener('click',closeCheckout);checkoutBackdrop.addEventListener('click',closeCheckout);payCashButton.addEventListener('click',()=>finishOrder('cash'));payCardButton.addEventListener('click',()=>finishOrder('card'));cancelOrderButton.addEventListener('click',requestCancel);posSyncNow.addEventListener('click',syncPendingOrders);
document.querySelectorAll('.guard-order-exit').forEach(link=>link.addEventListener('click',event=>{if(!cart.size||checkoutBusy)return;event.preventDefault();openCheckout();flash('Offene Bestellung zuerst abschließen oder stornieren')}));
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!receiptModal.classList.contains('hidden'))hideReceiptModal();else closeCheckout()}});
window.addEventListener('online',async()=>{await updateConnectionStatus();await syncPendingOrders();await loadCatalog()});window.addEventListener('offline',updateConnectionStatus);

window.WFFPOS={db,deviceId,cashierToken,euro,escapeHtml,flash,showCompletion,isBusy:()=>checkoutBusy,hasOpenOrder:()=>cart.size>0,openCheckout};

(async()=>{await WFFOffline?.registerServiceWorker();WFFOffline?.requestPersistence();if(!(await ensureCashier()))return;if(!(await loadCatalog()))return;await updateConnectionStatus();renderCart();if(navigator.onLine)syncPendingOrders()})();