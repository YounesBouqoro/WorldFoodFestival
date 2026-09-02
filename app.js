const SUPABASE_URL='https://rdaxqknbtbimkzbydknl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_R26J9-8_tJV00doT2Bwajg_yeGz8bW2';
const db=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const CASHIER_TOKEN_KEY='wff-cashier-token';
const CASHIER_NAME_KEY='wff-cashier-name';
const standSlug=new URLSearchParams(location.search).get('stand')||'drinks';

let activeStand=null;
const cart=new Map();
let discountActive=false;
let checkoutBusy=false;
let startedAt=null;
let lastReceipt=null;

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
const receiptModal=document.getElementById('receiptModal');
const receiptOrderSummary=document.getElementById('receiptOrderSummary');
const receiptEmail=document.getElementById('receiptEmail');
const receiptSms=document.getElementById('receiptSms');
const receiptOpen=document.getElementById('receiptOpen');
const receiptDone=document.getElementById('receiptDone');

function getClientSession(){
  const key='wff-pos-session';
  try{
    let value=localStorage.getItem(key);
    if(!value){value=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;localStorage.setItem(key,value)}
    return value;
  }catch{return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`}
}
const clientSession=getClientSession();
function cashierToken(){return localStorage.getItem(CASHIER_TOKEN_KEY)||''}

async function ensureCashier(){
  const token=cashierToken();
  if(!db||!token){location.replace('index.html');return false}
  const {data,error}=await db.rpc('cashier_session_info',{p_token:token});
  if(error||!data){localStorage.removeItem(CASHIER_TOKEN_KEY);localStorage.removeItem(CASHIER_NAME_KEY);location.replace('index.html');return false}
  localStorage.setItem(CASHIER_NAME_KEY,data.name||'Kasse');
  activeCashierName.textContent=data.name||'Kasse';
  return true;
}

async function loadCatalog(){
  const {data,error}=await db.rpc('get_pos_catalog');
  if(error||!Array.isArray(data)){flash('Produkte konnten nicht geladen werden');return false}
  activeStand=data.find(item=>item.slug===standSlug);
  if(!activeStand){location.replace('index.html');return false}
  document.title=`${activeStand.name} – World Food Festival Kasse`;
  standTitle.textContent=activeStand.name;
  activeStand.products=(activeStand.products||[]).map(p=>({...p,price:Number(p.price),tax_rate:Number(p.tax_rate),deposit_price:Number(p.deposit_price),deposit_tax_rate:Number(p.deposit_tax_rate)}));
  renderCatalog();
  return true;
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
  categoryTabs.innerHTML=groups.map(([category],index)=>`<button class="category-tab ${index===0?'active':''}" type="button" data-target="${idFor(category)}">${escapeHtml(category)}</button>`).join('');
  productGroups.innerHTML=groups.map(([category,products])=>`<section class="product-group" id="${idFor(category)}"><h2>${escapeHtml(category)} <span>${products.length}</span></h2><div class="product-grid">${products.map(product=>`<button class="product-button ${product.price<0?'refund':''}" type="button" data-product-id="${product.id}"><span class="product-qty-badge hidden" data-product-badge="${product.id}" aria-hidden="true"></span><span class="name">${escapeHtml(product.name)}</span><span class="price">${product.price<0?'−':''}${euro(Math.abs(product.price))}</span></button>`).join('')}</div></section>`).join('');

  productGroups.querySelectorAll('.product-button').forEach(button=>button.addEventListener('click',()=>{
    if(checkoutBusy)return;
    addItem(button.dataset.productId);
    const product=activeStand.products.find(p=>p.id===button.dataset.productId);
    if(product)flash(`${product.name} hinzugefügt`);
  }));
  categoryTabs.querySelectorAll('.category-tab').forEach(tab=>tab.addEventListener('click',()=>{
    categoryTabs.querySelectorAll('.category-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.target)?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}

function addItem(productId){
  const product=activeStand.products.find(p=>p.id===productId);
  if(!product)return;
  if(!startedAt)startedAt=new Date().toISOString();
  const existing=cart.get(productId)||{product,qty:0,depositQty:0};
  existing.qty+=1;
  if(product.deposit_enabled)existing.depositQty+=1;
  cart.set(productId,existing);
  renderCart();
}

function changeQty(productId,delta){
  if(checkoutBusy)return;
  const item=cart.get(productId);if(!item)return;
  if(delta>0){item.qty+=1;if(item.product.deposit_enabled)item.depositQty+=1}else{item.qty-=1;if(item.product.deposit_enabled)item.depositQty=Math.min(item.depositQty,Math.max(0,item.qty))}
  if(item.qty<=0)cart.delete(productId);else cart.set(productId,item);
  if(!cart.size)startedAt=null;
  renderCart();
}

function changeDeposit(productId,delta){
  if(checkoutBusy)return;
  const item=cart.get(productId);if(!item?.product.deposit_enabled)return;
  item.depositQty=Math.max(0,Math.min(item.qty,item.depositQty+delta));
  cart.set(productId,item);renderCart();
}

function calculateTotals(items=[...cart.values()]){
  const productSubtotal=items.reduce((sum,item)=>sum+item.product.price*item.qty,0);
  const depositSubtotal=items.reduce((sum,item)=>sum+(item.product.deposit_enabled?item.depositQty*item.product.deposit_price:0),0);
  const discountableSubtotal=items.filter(item=>item.product.discountable).reduce((sum,item)=>sum+Math.max(item.product.price*item.qty,0),0);
  const discount=discountActive?discountableSubtotal*.25:0;
  const total=productSubtotal+depositSubtotal-discount;
  const count=items.reduce((sum,item)=>sum+item.qty,0);
  return{productSubtotal,depositSubtotal,discount,total,count};
}

function updateProductBadges(){
  productGroups.querySelectorAll('[data-product-badge]').forEach(badge=>{
    const qty=cart.get(badge.dataset.productBadge)?.qty||0;
    badge.textContent=qty;badge.classList.toggle('hidden',qty===0);badge.closest('.product-button')?.classList.toggle('selected',qty>0);
  });
}

function renderCart(){
  const items=[...cart.values()];
  if(!items.length){cartItems.innerHTML='<div class="empty-state"><strong>Noch keine Auswahl.</strong><span>Tippe auf ein Produkt.</span></div>'}
  else{
    cartItems.innerHTML=items.map(item=>{
      const p=item.product;const depositTotal=p.deposit_enabled?item.depositQty*p.deposit_price:0;const lineTotal=p.price*item.qty+depositTotal;
      return `<div class="cart-line"><div class="cart-line-top"><div class="cart-product-title"><div class="line-name">${escapeHtml(p.name)}</div><small>${euro(p.price)} / Stück</small></div><div class="line-price">${euro(lineTotal)}</div></div><div class="cart-line-controls"><div class="qty-group"><span>Menge</span><div class="qty-controls"><button type="button" data-action="minus" data-id="${p.id}" aria-label="${escapeHtml(p.name)} verringern">−</button><strong>${item.qty}</strong><button type="button" data-action="plus" data-id="${p.id}" aria-label="${escapeHtml(p.name)} erhöhen">+</button></div></div>${p.deposit_enabled?`<div class="qty-group deposit-row ${item.depositQty===0?'deposit-off':''}"><span>Pfand <small>${euro(p.deposit_price)}</small></span><div class="qty-controls deposit-controls"><button type="button" data-deposit-action="minus" data-id="${p.id}" ${item.depositQty===0?'disabled':''}>−</button><strong>${item.depositQty}</strong><button type="button" data-deposit-action="plus" data-id="${p.id}" ${item.depositQty>=item.qty?'disabled':''}>+</button></div></div>`:''}</div></div>`;
    }).join('');
    cartItems.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>changeQty(button.dataset.id,button.dataset.action==='plus'?1:-1)));
    cartItems.querySelectorAll('[data-deposit-action]').forEach(button=>button.addEventListener('click',()=>changeDeposit(button.dataset.id,button.dataset.depositAction==='plus'?1:-1)));
  }
  const{productSubtotal,depositSubtotal,discount,total,count}=calculateTotals(items);
  productSubtotalEl.textContent=euro(productSubtotal);depositSubtotalEl.textContent=euro(depositSubtotal);discountValue.textContent=`−${euro(discount)}`;discountRow.classList.toggle('hidden',!discountActive);totalEl.textContent=euro(total);mobileTotal.textContent=euro(total);mobileCount.textContent=count;mobileItemLabel.textContent=`${count} Artikel`;
  const empty=!items.length;payCashButton.disabled=empty||checkoutBusy;payCardButton.disabled=empty||checkoutBusy;cancelOrderButton.disabled=empty||checkoutBusy;mobileCartButton.disabled=empty||checkoutBusy;studentDiscount.disabled=empty||checkoutBusy;updateProductBadges();
}

function openCheckout(){if(!cart.size)return flash('Erst ein Produkt auswählen');cartPanel.classList.add('open');checkoutBackdrop.classList.add('open');document.body.classList.add('checkout-open');checkoutClose?.focus({preventScroll:true})}
function closeCheckout(){if(checkoutBusy)return;cartPanel.classList.remove('open');checkoutBackdrop.classList.remove('open');document.body.classList.remove('checkout-open')}
function resetOrder(){cart.clear();discountActive=false;startedAt=null;studentDiscount.classList.remove('active');studentDiscount.setAttribute('aria-pressed','false');closeCheckout();renderCart()}
function setCheckoutBusy(busy){checkoutBusy=busy;document.body.classList.toggle('checkout-busy',busy);renderCart()}

function buildOrderPayload(status,paymentMethod){
  return{stand:standSlug,status,payment_method:paymentMethod,student_discount:discountActive,client_session:clientSession,cashier_token:cashierToken(),started_at:startedAt||new Date().toISOString(),items:[...cart.values()].map(item=>({product_id:item.product.id,quantity:item.qty,deposit_qty:item.product.deposit_enabled?item.depositQty:0}))};
}

async function finishOrder(action){
  if(checkoutBusy||!cart.size)return;
  const isCancelled=action==='cancel';const status=isCancelled?'cancelled':'completed';const paymentMethod=action==='cash'?'cash':action==='card'?'card':null;
  setCheckoutBusy(true);
  const{data,error}=await db.rpc('submit_order',{payload:buildOrderPayload(status,paymentMethod)});
  if(error){console.error(error);setCheckoutBusy(false);if(String(error.message||'').toLowerCase().includes('cashier')){localStorage.removeItem(CASHIER_TOKEN_KEY);flash('Kassen-Anmeldung abgelaufen');setTimeout(()=>location.replace('index.html'),900);return}flash('Speichern fehlgeschlagen – Bestellung bleibt offen');return}
  setCheckoutBusy(false);
  if(isCancelled){resetOrder();flash(`Bestellung #${data?.order_no||''} storniert`);return}
  const context={orderNo:data?.order_no||'',total:Number(data?.total_amount||0),paymentMethod,receiptToken:data?.receipt_token};
  resetOrder();showReceiptModal(context);
}

function requestCancel(){if(!cart.size||checkoutBusy)return;const confirmed=window.confirm('Bestellung wirklich stornieren?\n\nDer Vorgang wird gespeichert und zählt nicht zum Umsatz.');if(confirmed)finishOrder('cancel')}

function showReceiptModal(context){
  lastReceipt=context;
  receiptOrderSummary.textContent=`Bestellung #${context.orderNo} · ${euro(context.total)} · ${context.paymentMethod==='cash'?'Bar':'Karte'}`;
  receiptModal.classList.remove('hidden');document.body.classList.add('receipt-open');receiptDone.focus({preventScroll:true});
}
function hideReceiptModal(){receiptModal.classList.add('hidden');document.body.classList.remove('receipt-open');lastReceipt=null}
function receiptUrl(){if(!lastReceipt?.receiptToken)return null;const url=new URL('receipt.html',location.href);url.searchParams.set('t',lastReceipt.receiptToken);return url.toString()}
function receiptShareText(){const url=receiptUrl();return `World Food Festival – Beleg #${lastReceipt?.orderNo}\nGesamt: ${euro(lastReceipt?.total)}\n${url||''}`}

receiptEmail.addEventListener('click',()=>{if(!lastReceipt)return;location.href=`mailto:?subject=${encodeURIComponent(`Beleg World Food Festival #${lastReceipt.orderNo}`)}&body=${encodeURIComponent(receiptShareText())}`});
receiptSms.addEventListener('click',()=>{if(!lastReceipt)return;const body=encodeURIComponent(receiptShareText());const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);location.href=ios?`sms:&body=${body}`:`sms:?body=${body}`});
receiptOpen.addEventListener('click',()=>{const url=receiptUrl();if(url)window.open(url,'_blank','noopener')});
receiptDone.addEventListener('click',hideReceiptModal);

function flash(message){document.querySelector('.toast')?.remove();const toast=document.createElement('div');toast.className='toast';toast.textContent=message;document.body.appendChild(toast);setTimeout(()=>toast.remove(),1700)}

studentDiscount.addEventListener('click',()=>{if(checkoutBusy||!cart.size)return;discountActive=!discountActive;studentDiscount.classList.toggle('active',discountActive);studentDiscount.setAttribute('aria-pressed',String(discountActive));renderCart()});
mobileCartButton.addEventListener('click',openCheckout);checkoutClose.addEventListener('click',closeCheckout);checkoutBackdrop.addEventListener('click',closeCheckout);payCashButton.addEventListener('click',()=>finishOrder('cash'));payCardButton.addEventListener('click',()=>finishOrder('card'));cancelOrderButton.addEventListener('click',requestCancel);

document.querySelectorAll('.guard-order-exit').forEach(link=>link.addEventListener('click',event=>{if(!cart.size||checkoutBusy)return;event.preventDefault();openCheckout();flash('Offene Bestellung zuerst abschließen oder stornieren')}));
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!receiptModal.classList.contains('hidden'))hideReceiptModal();else closeCheckout()}});

(async()=>{if(!(await ensureCashier()))return;if(!(await loadCatalog()))return;renderCart()})();
