(() => {
  const STYLE_ID='wff-admin-enhancements-style';
  const HOST_ID='wffEnhancedCloseout';
  const STORAGE_PREFIX='wff-closeout-v1:';

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;
    style.textContent=`
      .wff-closeout{margin:16px 0 22px;display:grid;gap:14px}.wff-closeout-card{border:2px solid #161616;border-radius:16px;background:#f7f4ec;padding:14px;box-shadow:3px 3px 0 #161616}.wff-closeout-card h3{margin:0 0 4px;font-size:18px}.wff-closeout-card>p{margin:0 0 12px;font-size:12px;font-weight:700;opacity:.65;line-height:1.35}
      .wff-closeout-inputs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.wff-closeout-inputs label{display:flex;flex-direction:column;gap:5px;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.04em}.wff-closeout-inputs input{width:100%;min-height:44px;border:2px solid #161616;border-radius:10px;background:white;padding:8px 10px;font:inherit;font-weight:850;color:#161616}
      .wff-reconcile-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-top:12px}.wff-reconcile-box{border:2px solid #161616;border-radius:12px;padding:10px;background:white;min-width:0}.wff-reconcile-box span{display:block;font-size:9px;font-weight:950;letter-spacing:.04em;text-transform:uppercase;opacity:.62}.wff-reconcile-box strong{display:block;margin-top:5px;font-size:19px;line-height:1}.wff-reconcile-box.good{background:#dff0e3}.wff-reconcile-box.bad{background:#ffd9d4}.wff-reconcile-box.neutral{background:#fff0b8}
      .wff-stand-table-wrap{overflow:auto;border:2px solid #161616;border-radius:13px}.wff-stand-table{width:100%;border-collapse:collapse;min-width:860px;background:white}.wff-stand-table th,.wff-stand-table td{padding:9px 10px;border-bottom:1px solid rgba(22,22,22,.16);text-align:right;font-size:11px;white-space:nowrap}.wff-stand-table th{background:#e6d634;font-size:9px;text-transform:uppercase;letter-spacing:.04em}.wff-stand-table th:first-child,.wff-stand-table td:first-child{text-align:left;font-weight:900}.wff-stand-table tr:last-child td{border-bottom:0}.wff-closeout-note{margin-top:8px;font-size:10px;font-weight:750;opacity:.62}
      @media(max-width:900px){.wff-closeout-inputs{grid-template-columns:1fr 1fr}.wff-reconcile-summary{grid-template-columns:1fr 1fr}.wff-reconcile-box:last-child{grid-column:1/-1}}
      @media(max-width:520px){.wff-closeout-inputs{grid-template-columns:1fr}.wff-reconcile-summary{grid-template-columns:1fr 1fr}.wff-closeout-card{padding:11px}}
    `;
    document.head.appendChild(style);
  }

  function numeric(value){const n=Number(String(value??'').replace(',','.'));return Number.isFinite(n)?n:0}
  function closeoutKey(){
    const from=document.getElementById('cashReportFrom')?.value||'';
    const to=document.getElementById('cashReportTo')?.value||'';
    const stand=document.getElementById('cashReportStand')?.value||'all';
    return STORAGE_PREFIX+[from,to,stand].join('|');
  }
  function loadSaved(){try{return JSON.parse(localStorage.getItem(closeoutKey())||'{}')}catch{return {}}}
  function saveCurrent(){
    const host=document.getElementById(HOST_ID);if(!host)return;
    const data={};host.querySelectorAll('[data-closeout-input]').forEach(input=>data[input.dataset.closeoutInput]=input.value);
    try{localStorage.setItem(closeoutKey(),JSON.stringify(data))}catch{}
  }
  function formatDiff(value){const n=Number(value||0);return (n>0?'+':'')+euro(n)}
  function diffClass(value){const n=Math.abs(Number(value||0));if(n<0.01)return 'good';if(n<=5)return 'neutral';return 'bad'}

  function standLabel(slug){
    try{return typeof standName==='function'?standName(slug):slug}catch{return slug}
  }

  function buildHost(){
    let host=document.getElementById(HOST_ID);if(host)return host;
    const summary=document.getElementById('cashReportSummary');if(!summary)return null;
    host=document.createElement('div');host.id=HOST_ID;host.className='wff-closeout';
    host.innerHTML=`
      <section class="wff-closeout-card">
        <h3>Ist-Abgleich</h3>
        <p>Hier trägst du die tatsächlich gezählten Werte ein. So siehst du sofort, ob Bar- und Kartenumsatz zum System passen.</p>
        <div class="wff-closeout-inputs">
          <label>Start-/Wechselgeld €<input inputmode="decimal" data-closeout-input="startCash" placeholder="0,00"></label>
          <label>Entnommenes Bargeld €<input inputmode="decimal" data-closeout-input="removedCash" placeholder="0,00"></label>
          <label>Bargeld noch in Kasse €<input inputmode="decimal" data-closeout-input="remainingCash" placeholder="0,00"></label>
          <label>SumUp Kartenumsatz €<input inputmode="decimal" data-closeout-input="actualCard" placeholder="0,00"></label>
        </div>
        <div class="wff-reconcile-summary" id="wffReconcileSummary"></div>
        <div class="wff-closeout-note">Tatsächliche Bargeldeinnahme = entnommenes Bargeld + Restbestand − Start-/Wechselgeld. Pfand ist im Soll-Bargeld bereits korrekt berücksichtigt.</div>
      </section>
      <section class="wff-closeout-card">
        <h3>Auswertung nach Stand</h3>
        <p>Warenumsatz, Zahlungsarten und Pfand werden je Stand getrennt dargestellt. Der Standfilter oben grenzt die Auswertung zusätzlich ein.</p>
        <div id="wffStandBreakdown"></div>
      </section>`;
    summary.insertAdjacentElement('afterend',host);
    host.querySelectorAll('[data-closeout-input]').forEach(input=>input.addEventListener('input',()=>{saveCurrent();renderReconciliation()}));
    return host;
  }

  function restoreInputs(){
    const host=document.getElementById(HOST_ID);if(!host)return;
    const saved=loadSaved();
    host.querySelectorAll('[data-closeout-input]').forEach(input=>{input.value=saved[input.dataset.closeoutInput]??''});
  }

  function renderReconciliation(){
    const host=document.getElementById(HOST_ID);const target=document.getElementById('wffReconcileSummary');if(!host||!target)return;
    if(!cashReport){target.innerHTML='<div class="wff-reconcile-box"><span>Status</span><strong>Keine Daten</strong></div>';return}
    const values={};host.querySelectorAll('[data-closeout-input]').forEach(input=>values[input.dataset.closeoutInput]=numeric(input.value));
    const actualCash=values.removedCash+values.remainingCash-values.startCash;
    const expectedCash=numeric(cashReport.cash_drawer_movement);
    const expectedCard=numeric(cashReport.card_merchandise);
    const cashDiff=actualCash-expectedCash;
    const cardEntered=String(host.querySelector('[data-closeout-input="actualCard"]')?.value||'').trim()!=='';
    const cashEntered=['startCash','removedCash','remainingCash'].some(key=>String(host.querySelector('[data-closeout-input="'+key+'"]')?.value||'').trim()!=='');
    const cardDiff=values.actualCard-expectedCard;
    const totalDiff=(cashEntered?cashDiff:0)+(cardEntered?cardDiff:0);
    target.innerHTML=
      '<div class="wff-reconcile-box"><span>Soll Bargeld</span><strong>'+euro(expectedCash)+'</strong></div>'+
      '<div class="wff-reconcile-box"><span>Ist Bargeldeinnahme</span><strong>'+(cashEntered?euro(actualCash):'–')+'</strong></div>'+
      '<div class="wff-reconcile-box '+(cashEntered?diffClass(cashDiff):'')+'"><span>Bar-Differenz</span><strong>'+(cashEntered?formatDiff(cashDiff):'–')+'</strong></div>'+
      '<div class="wff-reconcile-box '+(cardEntered?diffClass(cardDiff):'')+'"><span>Karten-Differenz</span><strong>'+(cardEntered?formatDiff(cardDiff):'–')+'</strong></div>'+
      '<div class="wff-reconcile-box '+((cashEntered||cardEntered)?diffClass(totalDiff):'')+'"><span>Gesamtdifferenz</span><strong>'+((cashEntered||cardEntered)?formatDiff(totalDiff):'–')+'</strong></div>';
  }

  function renderStandBreakdown(){
    const target=document.getElementById('wffStandBreakdown');if(!target)return;
    const rows=Array.isArray(cashReport?.by_stand)?cashReport.by_stand:[];
    if(!rows.length){target.innerHTML='<p class="panel-intro">Für den gewählten Zeitraum liegen keine Standdaten vor.</p>';return}
    target.innerHTML='<div class="wff-stand-table-wrap"><table class="wff-stand-table"><thead><tr><th>Stand</th><th>Best.</th><th>Warenumsatz</th><th>Ware Bar</th><th>Ware Karte</th><th>Pfand rein</th><th>Pfand raus</th><th>Pfandbestand</th><th>Soll Bargeld</th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+esc(standLabel(row.stand))+'</td><td>'+Number(row.order_count||0)+'</td><td>'+euro(row.merchandise_total)+'</td><td>'+euro(row.cash_merchandise)+'</td><td>'+euro(row.card_merchandise)+'</td><td>'+euro(row.deposit_collected)+'</td><td>'+euro(row.deposit_paid_out)+'</td><td>'+euro(row.deposit_balance)+'</td><td><strong>'+euro(row.cash_drawer_movement)+'</strong></td></tr>').join('')+'</tbody></table></div>';
  }

  function renderEnhanced(){buildHost();restoreInputs();renderReconciliation();renderStandBreakdown()}

  injectStyles();buildHost();
  if(typeof renderCashReport==='function'){
    const baseRender=renderCashReport;
    renderCashReport=function(){baseRender();renderEnhanced()};
  }
  document.getElementById('cashReportStand')?.addEventListener('change',()=>setTimeout(()=>{restoreInputs();renderReconciliation()},0));
  document.getElementById('cashReportFrom')?.addEventListener('change',()=>setTimeout(()=>{restoreInputs();renderReconciliation()},0));
  document.getElementById('cashReportTo')?.addEventListener('change',()=>setTimeout(()=>{restoreInputs();renderReconciliation()},0));
  renderEnhanced();
})();