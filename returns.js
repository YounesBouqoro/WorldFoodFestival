(() => {
  const pos=window.WFFPOS;
  const trigger=document.getElementById('refundTrigger');
  const modal=document.getElementById('refundModal');
  const close=document.getElementById('refundClose');
  const list=document.getElementById('refundSalesList');
  const form=document.getElementById('refundForm');
  const orderNo=document.getElementById('refundOrderNo');
  const selected=document.getElementById('refundSelected');
  const reason=document.getElementById('refundReason');
  const back=document.getElementById('refundBack');
  if(!pos||!trigger||!modal)return;

  let selectedSale=null;

  function hide(){modal.classList.add('hidden');document.body.classList.remove('refund-open');selectedSale=null}
  function showList(){form.classList.add('hidden');list.classList.remove('hidden');selectedSale=null}
  function fmt(value){return new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}

  async function open(){
    if(!navigator.onLine){pos.flash('Rückerstattungen brauchen eine Internetverbindung.');return}
    if(pos.hasOpenOrder()){pos.openCheckout();pos.flash('Offene Bestellung zuerst abschließen oder stornieren.');return}
    modal.classList.remove('hidden');document.body.classList.add('refund-open');showList();
    list.innerHTML='<div class="refund-loading">Letzte Käufe werden geladen …</div>';
    const {data,error}=await pos.db.rpc('cashier_recent_sales',{p_token:pos.cashierToken(),p_device_id:pos.deviceId,p_limit:20});
    if(error||!Array.isArray(data)){list.innerHTML='<div class="refund-empty">Käufe konnten nicht geladen werden.</div>';return}
    if(!data.length){list.innerHTML='<div class="refund-empty">Keine offenen Käufe für eine Rückerstattung.</div>';return}

    list.innerHTML=data.map(sale=>{
      const split=sale.payment_method==='card'&&Number(sale.deposit_total)>0?'Karte '+pos.euro(sale.product_payment_amount)+' · Pfand '+pos.euro(sale.deposit_total)+' bar':(sale.payment_method==='cash'?'Bar':'Karte');
      return '<button type="button" class="refund-sale" data-order-no="'+sale.order_no+'"><span><strong>#'+sale.order_no+' · '+pos.escapeHtml(sale.stand)+'</strong><small>'+fmt(sale.created_at)+' · '+split+'</small></span><strong>'+pos.euro(sale.total_amount)+'</strong></button>';
    }).join('');
    list.querySelectorAll('[data-order-no]').forEach(button=>button.addEventListener('click',()=>{
      selectedSale=data.find(s=>String(s.order_no)===String(button.dataset.orderNo));
      if(!selectedSale)return;
      orderNo.value=selectedSale.order_no;
      const split=selectedSale.payment_method==='card'&&Number(selectedSale.deposit_total)>0?'Karte '+pos.euro(selectedSale.product_payment_amount)+' · Pfand '+pos.euro(selectedSale.deposit_total)+' bar':(selectedSale.payment_method==='cash'?'Bar':'Karte');
      selected.innerHTML='<strong>Bestellung #'+selectedSale.order_no+'</strong><span>'+pos.euro(selectedSale.total_amount)+' · '+split+'</span>';
      list.classList.add('hidden');form.classList.remove('hidden');reason.focus();
    }));
  }

  trigger.addEventListener('click',open);
  close.addEventListener('click',hide);
  back.addEventListener('click',showList);

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!selectedSale||pos.isBusy())return;

    let cardConfirmed=false;
    if(selectedSale.payment_method==='card'){
      const productAmount=Number(selectedSale.product_payment_amount||0);
      const depositAmount=Number(selectedSale.deposit_total||0);
      const message='Am Kartenterminal nur '+pos.euro(productAmount)+' erstatten.'+(depositAmount>0?'\nZusätzlich '+pos.euro(depositAmount)+' Pfand BAR auszahlen.':'')+'\n\nNur fortfahren, wenn '+(depositAmount>0?'beide Schritte':'die Kartenerstattung')+' erledigt sind.';
      cardConfirmed=window.confirm(message);
      if(!cardConfirmed)return;
    }else{
      if(!window.confirm('Barbetrag '+pos.euro(selectedSale.total_amount)+' wirklich zurückzahlen?'))return;
    }

    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    const {data,error}=await pos.db.rpc('create_full_refund',{
      p_cashier_token:pos.cashierToken(),
      p_order_no:Number(selectedSale.order_no),
      p_reason:reason.value,
      p_device_id:pos.deviceId,
      p_client_refund_id:WFFOffline.uuid(),
      p_card_refund_confirmed:cardConfirmed
    });
    submit.disabled=false;
    if(error){console.error(error);pos.flash(error.message||'Rückerstattung konnte nicht protokolliert werden');return}

    hide();
    pos.showCompletion({
      refund:true,
      refundNo:'R'+(data?.refund_no||''),
      orderNo:data?.order_no||'',
      total:Number(data?.amount||0),
      paymentMethod:data?.payment_method,
      productPayment:Number(selectedSale.product_payment_amount||0),
      depositCash:Number(selectedSale.deposit_total||0),
      receiptToken:data?.receipt_token
    });
  });

  window.addEventListener('offline',()=>{if(!modal.classList.contains('hidden'))hide()});
})();