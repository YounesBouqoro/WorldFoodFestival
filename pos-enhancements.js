(() => {
  const STYLE_ID='wff-pos-enhancements-style';
  const QUICK_ID='wffQuickTools';
  const FAVORITE_NAMES=['Aperol Spritz','San Miguel','Anheuser-Busch','Fritz Kola Zero','Fritz Bio-Apfelschorle'];

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .wff-quick-tools{margin:10px 0 16px;display:grid;gap:10px}
      .wff-deposit-return{display:grid;grid-template-columns:minmax(150px,1.2fr) repeat(4,minmax(62px,.45fr));gap:7px;align-items:stretch;border:2px solid #161616;border-radius:14px;background:#e8eee8;padding:8px;box-shadow:2px 2px 0 #161616}
      .wff-deposit-copy{display:flex;flex-direction:column;justify-content:center;padding:4px 6px;min-width:0}.wff-deposit-copy strong{font-size:15px;line-height:1.05}.wff-deposit-copy span{font-size:10px;font-weight:750;opacity:.62;margin-top:3px}
      .wff-deposit-choice{border:2px solid #161616;border-radius:10px;background:#fff;color:#161616;min-height:48px;padding:5px 6px;font-weight:950;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}.wff-deposit-choice strong{font-size:15px}.wff-deposit-choice span{font-size:9px;margin-top:4px;opacity:.62}.wff-deposit-choice:active{transform:translate(1px,1px)}
      .wff-favorites{border:2px solid #161616;border-radius:14px;background:rgba(255,255,255,.28);padding:8px}.wff-favorites-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 7px}.wff-favorites-head strong{font-size:14px}.wff-favorites-head span{font-size:9px;font-weight:800;opacity:.58}
      .wff-favorite-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.wff-favorite-card{display:grid;grid-template-rows:1fr auto;border:2px solid #161616;border-radius:11px;overflow:hidden;background:#f7f4ec;min-width:0}.wff-favorite-main{border:0;background:transparent;color:#161616;text-align:left;padding:9px;min-height:61px;font-weight:900;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;gap:6px}.wff-favorite-main span:first-child{font-size:12px;line-height:1.1}.wff-favorite-main span:last-child{font-size:15px;font-weight:1000}.wff-favorite-qty{display:grid;grid-template-columns:1fr 1fr;border-top:1.5px solid #161616}.wff-favorite-qty button{border:0;background:rgba(255,255,255,.62);min-height:30px;font-size:11px;font-weight:950;cursor:pointer;color:#161616}.wff-favorite-qty button+button{border-left:1.5px solid #161616}
      .product-button.wff-cat-bier{background:#fff0c7!important}.product-button.wff-cat-softdrinks{background:#e8f4ff!important}.product-button.wff-cat-wein{background:#f8e7ef!important}.product-button.wff-cat-red-bull{background:#ffe5e1!important}.product-button.wff-cat-aperitif{background:#ffe8d2!important}.product-button.wff-cat-longdrinks{background:#eee8ff!important}.product-button.wff-cat-pfand-rueckgabe{background:#e5eee7!important}
      .wff-favorite-card.wff-cat-bier{background:#fff0c7}.wff-favorite-card.wff-cat-softdrinks{background:#e8f4ff}.wff-favorite-card.wff-cat-wein{background:#f8e7ef}.wff-favorite-card.wff-cat-red-bull{background:#ffe5e1}.wff-favorite-card.wff-cat-aperitif{background:#ffe8d2}.wff-favorite-card.wff-cat-longdrinks{background:#eee8ff}
      @media(max-width:900px){.wff-favorite-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.wff-deposit-return{grid-template-columns:1fr repeat(4,minmax(55px,.42fr))}}
      @media(max-width:520px){.wff-quick-tools{margin-top:7px}.wff-deposit-return{grid-template-columns:1fr 1fr 1fr;padding:7px}.wff-deposit-copy{grid-column:1/-1;padding:2px 3px}.wff-deposit-choice{min-height:43px}.wff-deposit-choice:last-child{grid-column:auto}.wff-favorite-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wff-favorites{padding:7px}.wff-favorite-main{min-height:58px;padding:8px}.wff-favorites-head span{display:none}}
    `;
    document.head.appendChild(style);
  }

  function plainName(value){
    return String(value||'').replace(/\p{Extended_Pictographic}|\uFE0F/gu,'').replace(/\s+/g,' ').trim();
  }

  function categoryClass(category){
    return 'wff-cat-'+String(category||'sonstiges').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  }

  function addMany(productId,count){
    if(typeof addItem!=='function'||checkoutBusy)return;
    const product=activeStand?.products?.find(p=>p.id===productId);if(!product)return;
    for(let i=0;i<count;i++)addItem(productId);
    if(typeof flash==='function')flash(count+'× '+plainName(product.name)+' hinzugefügt');
  }

  function setDepositReturnQty(productId,count){
    if(checkoutBusy)return;
    const product=activeStand?.products?.find(p=>p.id===productId);if(!product)return;
    if(typeof cartHasRegularItems==='function'&&cartHasRegularItems()){
      if(typeof openCheckout==='function')openCheckout();
      if(typeof flash==='function')flash('Offene Bestellung zuerst abschließen oder stornieren');
      return;
    }
    if(typeof ensureOrderIdentity==='function')ensureOrderIdentity();
    cart.clear();
    cart.set(productId,{product,qty:count,depositQty:0});
    if(typeof renderCart==='function')renderCart();
    if(typeof openCheckout==='function')openCheckout();
    if(typeof flash==='function')flash(count+'× Pfand = '+euro(Math.abs(product.price)*count)+' bar auszahlen');
  }

  function decorateCategoryTabs(){
    const icons={
      'Bier':'🍺','Softdrinks':'🥤','Wein':'🍷','Red Bull':'⚡','Aperitif':'🍊','Longdrinks':'🍸','Pfand Rückgabe':'♻️'
    };
    document.querySelectorAll('#categoryTabs .category-tab').forEach(tab=>{
      if(tab.dataset.wffIconed)return;
      const raw=tab.textContent.trim();
      const icon=icons[raw];
      if(icon)tab.textContent=icon+' '+raw;
      tab.dataset.wffIconed='1';
    });
  }

  function decorateProductButtons(){
    document.querySelectorAll('#productGroups .product-button[data-product-id]').forEach(button=>{
      const product=activeStand?.products?.find(p=>p.id===button.dataset.productId);if(!product)return;
      [...button.classList].filter(c=>c.startsWith('wff-cat-')).forEach(c=>button.classList.remove(c));
      button.classList.add(categoryClass(product.category));
    });
  }

  function buildQuickTools(){
    if(document.getElementById(QUICK_ID)||!activeStand?.products?.length)return;
    const host=document.getElementById('productGroups');if(!host)return;
    const depositProduct=activeStand.products.find(p=>typeof isDepositReturnProduct==='function'&&isDepositReturnProduct(p));
    const favorites=FAVORITE_NAMES.map(name=>activeStand.products.find(p=>plainName(p.name).includes(name))).filter(Boolean);
    if(!depositProduct&&!favorites.length)return;

    const tools=document.createElement('div');tools.id=QUICK_ID;tools.className='wff-quick-tools';

    if(depositProduct){
      const deposit=document.createElement('section');deposit.className='wff-deposit-return';
      deposit.innerHTML='<div class="wff-deposit-copy"><strong>♻️ Pfand zurück</strong><span>Schnell ausbuchen · Auszahlung immer bar</span></div>'+
        [1,2,3,4].map(q=>'<button class="wff-deposit-choice" type="button" data-pfand-qty="'+q+'"><strong>'+q+'×</strong><span>'+euro(Math.abs(depositProduct.price)*q)+'</span></button>').join('');
      deposit.querySelectorAll('[data-pfand-qty]').forEach(button=>button.addEventListener('click',()=>setDepositReturnQty(depositProduct.id,Number(button.dataset.pfandQty))));
      tools.appendChild(deposit);
    }

    if(favorites.length){
      const section=document.createElement('section');section.className='wff-favorites';
      section.innerHTML='<div class="wff-favorites-head"><strong>⭐ Favoriten</strong><span>1× antippen · 2×/3× direkt wählen</span></div><div class="wff-favorite-grid"></div>';
      const grid=section.querySelector('.wff-favorite-grid');
      favorites.forEach(product=>{
        const card=document.createElement('div');card.className='wff-favorite-card '+categoryClass(product.category);
        card.innerHTML='<button class="wff-favorite-main" type="button"><span>'+escapeHtml(product.name)+'</span><span>'+euro(product.price)+'</span></button><div class="wff-favorite-qty"><button type="button" data-count="2">2×</button><button type="button" data-count="3">3×</button></div>';
        card.querySelector('.wff-favorite-main').addEventListener('click',()=>addMany(product.id,1));
        card.querySelectorAll('[data-count]').forEach(button=>button.addEventListener('click',()=>addMany(product.id,Number(button.dataset.count))));
        grid.appendChild(card);
      });
      tools.appendChild(section);
    }
    host.prepend(tools);
  }

  function enhance(){
    if(!document.getElementById('productGroups')||!activeStand?.products?.length)return false;
    injectStyles();decorateCategoryTabs();decorateProductButtons();buildQuickTools();return true;
  }

  const observer=new MutationObserver(()=>{if(enhance())decorateProductButtons()});
  const target=document.getElementById('productGroups');if(target)observer.observe(target,{childList:true,subtree:true});
  let tries=0;const timer=setInterval(()=>{tries++;if(enhance()||tries>40)clearInterval(timer)},100);
})();