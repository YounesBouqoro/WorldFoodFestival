const SUPABASE_URL='https://rdaxqknbtbimkzbydknl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_R26J9-8_tJV00doT2Bwajg_yeGz8bW2';
const db=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const paper=document.getElementById('receiptPaper');
const token=new URLSearchParams(location.search).get('t');
const euro=value=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(value||0));
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const formatDate=value=>value?new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(value)):'–';

function taxParts(items){
  const map=new Map();
  const add=(rate,gross)=>{
    rate=Number(rate||0);gross=Number(gross||0);if(!gross)return;
    const tax=rate>0?gross-gross/(1+rate/100):0;
    const current=map.get(rate)||{gross:0,tax:0};current.gross+=gross;current.tax+=tax;map.set(rate,current);
  };
  items.forEach(item=>{
    const productGross=Number(item.unit_price)*Number(item.quantity)-Number(item.discount_amount||0);
    const depositGross=Number(item.deposit_unit_price||0)*Number(item.deposit_qty||0);
    add(item.tax_rate,productGross);add(item.deposit_tax_rate,depositGross);
  });
  return [...map.entries()].sort((a,b)=>a[0]-b[0]);
}

function render(data){
  const order=data.order||{},business=data.business||{},items=data.items||[];
  const isRefund=data.transaction_type==='refund';
  const sign=isRefund?-1:1;
  const address=[business.address_line1,[business.postal_code,business.city].filter(Boolean).join(' ')].filter(Boolean);
  const taxes=taxParts(items);
  const tseComplete=Boolean(order.system_serial&&order.tse_serial&&order.tse_transaction_number&&order.tse_signature_counter&&order.tse_verification_value);
  const money=value=>euro(sign*Number(value||0));
  const discountLine=Number(order.discount_amount||0)>0
    ?(isRefund
      ?'<div class="receipt-total-row"><span>Rabattkorrektur</span><strong>+'+euro(order.discount_amount)+'</strong></div>'
      :'<div class="receipt-total-row"><span>Studentenrabatt</span><strong>−'+euro(order.discount_amount)+'</strong></div>')
    :'';

  paper.innerHTML=
    '<header class="receipt-head">'+
      '<h1>'+escapeHtml(business.merchant_name||'World Food Festival')+'</h1>'+
      (isRefund?'<p><strong>Rückerstattungsbeleg</strong></p>':'')+
      address.map(line=>'<p>'+escapeHtml(line)+'</p>').join('')+
      (business.vat_id?'<p>USt-IdNr.: '+escapeHtml(business.vat_id)+'</p>':'')+
      (business.tax_number?'<p>Steuernr.: '+escapeHtml(business.tax_number)+'</p>':'')+
    '</header>'+
    '<section class="receipt-meta">'+
      '<div><span>Beleg</span><strong>#'+escapeHtml(order.order_no)+'</strong></div>'+
      (order.original_order_no?'<div><span>Originalbeleg</span><strong>#'+escapeHtml(order.original_order_no)+'</strong></div>':'')+
      '<div><span>Art</span><strong>'+(isRefund?'Rückerstattung':'Verkauf')+'</strong></div>'+
      '<div><span>Zahlung</span><strong>'+(order.payment_method==='cash'?'Bar':'Karte')+'</strong></div>'+
      '<div><span>Vorgang Start</span><strong>'+escapeHtml(formatDate(order.started_at))+'</strong></div>'+
      '<div><span>Vorgang Ende</span><strong>'+escapeHtml(formatDate(order.finished_at))+'</strong></div>'+
      '<div><span>Stand</span><strong>'+escapeHtml(order.stand)+'</strong></div>'+
      '<div><span>Kasse</span><strong>'+escapeHtml(order.cashier||'–')+'</strong></div>'+
      (order.refund_reason?'<div><span>Grund</span><strong>'+escapeHtml(order.refund_reason)+'</strong></div>':'')+
    '</section>'+
    '<section class="receipt-lines">'+
      items.map(item=>'<div class="receipt-line"><div><strong>'+item.quantity+'× '+escapeHtml(item.name)+'</strong><small>'+euro(item.unit_price)+' / Stück'+(Number(item.discount_amount||0)>0?' · Rabatt −'+euro(item.discount_amount):'')+'</small>'+(Number(item.deposit_qty||0)>0?'<small>'+item.deposit_qty+'× Pfand '+euro(item.deposit_unit_price)+'</small>':'')+'</div><div class="receipt-line-price">'+money(item.line_total)+'</div></div>').join('')+
    '</section>'+
    '<section class="receipt-totals">'+
      '<div class="receipt-total-row"><span>Produkte</span><strong>'+money(order.product_subtotal)+'</strong></div>'+
      '<div class="receipt-total-row"><span>Pfand</span><strong>'+money(order.deposit_total)+'</strong></div>'+
      discountLine+
      '<div class="receipt-total-row grand"><span>'+(isRefund?'Erstattung':'Gesamt')+'</span><strong>'+money(order.total_amount)+'</strong></div>'+
    '</section>'+
    '<section class="tax-box">'+
      '<h2>Steuerübersicht</h2>'+
      (taxes.map(entry=>'<div class="tax-row"><span>'+Number(entry[0]).toLocaleString('de-DE')+' % MwSt. aus '+euro(sign*entry[1].gross)+'</span><strong>'+euro(sign*entry[1].tax)+'</strong></div>').join('')||'<div class="tax-row"><span>Keine Steuerdaten</span><strong>–</strong></div>')+
      '<div class="tax-row"><span>Netto gesamt</span><strong>'+money(order.net_total)+'</strong></div>'+
      '<div class="tax-row"><span>Steuer gesamt</span><strong>'+money(order.tax_total)+'</strong></div>'+
    '</section>'+
    '<section class="tse-box">'+
      '<h2>Kassen-/TSE-Daten</h2>'+
      '<div class="tse-row"><span>Seriennr. Aufzeichnungssystem</span><strong>'+escapeHtml(order.system_serial||'nicht hinterlegt')+'</strong></div>'+
      '<div class="tse-row"><span>Seriennr. TSE</span><strong>'+escapeHtml(order.tse_serial||'nicht angebunden')+'</strong></div>'+
      '<div class="tse-row"><span>TSE-Transaktion</span><strong>'+escapeHtml(order.tse_transaction_number||'–')+'</strong></div>'+
      '<div class="tse-row"><span>Signaturzähler</span><strong>'+escapeHtml(order.tse_signature_counter||'–')+'</strong></div>'+
      '<div class="tse-row"><span>Prüfwert</span><strong>'+escapeHtml(order.tse_verification_value||'–')+'</strong></div>'+
      (!tseComplete?'<div class="warning"><strong>Hinweis:</strong> Für einen vollständig KassenSichV-konformen Kassenbeleg muss das Kassensystem an eine zertifizierte TSE angebunden sein und die transaktionsbezogenen TSE-Daten erzeugen. Diese Werte werden hier nicht erfunden.</div>':'')+
    '</section>'+
    '<footer class="receipt-footer">'+escapeHtml(business.receipt_note||'Danke für deinen Besuch!')+'<br><small>Elektronischer Beleg · erstellt im unmittelbaren Zusammenhang mit dem Kassiervorgang.</small></footer>';
}

async function load(){
  if(!db||!token){paper.innerHTML='<div class="receipt-error">Beleg-Link ist ungültig.</div>';return}
  const {data,error}=await db.rpc('get_receipt_v2',{p_token:token});
  if(error||!data){paper.innerHTML='<div class="receipt-error">Beleg konnte nicht geladen werden.</div>';return}
  document.title=(data.transaction_type==='refund'?'Rückerstattung ':'Beleg ')+'#'+(data.order?.order_no||'')+' – World Food Festival';
  render(data);
}
document.getElementById('printReceipt').addEventListener('click',()=>window.print());
load();