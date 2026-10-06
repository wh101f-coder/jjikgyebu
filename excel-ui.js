let excelSession=null;
const excelLabels={date:'이용일자 *',merchant:'업체명 *',amount:'이용금액 (할인 전) *',card:'카드 끝자리',discount:'할인 / 혜택금액',billed:'청구원금 / 청구금액',approval:'승인번호',status:'이용 / 취소 구분',installments:'할부개월',fee:'수수료',due:'결제예정일'};
const excelHistory=()=>JSON.parse(localStorage.getItem('jjig_excel_imports')||'[]');
function loadExternalScript(url){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=url;
    script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('읽기 도구를 불러오지 못했습니다. 인터넷 연결 후 다시 시도해주세요.'));};
    document.head.appendChild(script);
  });
}
function resetExcelReview(){
  state.reviewFilters.clear();
  state.pending=[];$('#reviewPanel').classList.add('hidden');
  if(excelSession)excelSession.ready=false;
}
function selectedRows(){return excelSession?.sheets[Number($('#excelSheet').value)]?.rows||[];}
function configureColumns(auto=true){
  resetExcelReview();
  const rows=selectedRows(),found=auto?ExcelImport.detect(rows):null;
  const header=found?.header??Math.max(0,Number($('#excelHeaderRow').value)-1);
  $('#excelHeaderRow').value=header+1;
  excelSession.start=found?.start??header+1;
  const map=found?.map||ExcelImport.columns(rows[header]||[]);
  excelSession.map=map;
  const width=Math.max(0,...rows.slice(0,Math.min(rows.length,header+3)).map(r=>r.length));
  $('#excelColumns').innerHTML=Object.entries(excelLabels).map(([field,label])=>`<label>${label}<select data-column="${field}"><option value="-1">해당 없음</option>${Array.from({length:width},(_,i)=>`<option value="${i}" ${map[field]===i?'selected':''}>${i+1}열 · ${escapeHtml(String(rows[header]?.[i]||rows[header+1]?.[i]||'제목 없음'))}</option>`).join('')}</select></label>`).join('');
  if(!found){$('#excelMapping').open=true;$('#excelStatus').textContent='열 연결을 확인한 후 내역 읽기를 눌러주세요.';}
  else $('#excelStatus').textContent='날짜·업체·금액 열을 찾았습니다. 카드사와 기준 연도를 확인해주세요.';
}
$('#excelYear').value=localStorage.getItem('jjig_excel_year')||new Date().getFullYear();
$('#excelIssuer').value=localStorage.getItem('jjig_excel_issuer')||'우리카드';
$('#excelInput').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  resetExcelReview();excelSession=null;state.importMode='excel';state.files=[];
  $('#importPanel').classList.add('hidden');$('#excelPanel').classList.remove('hidden');
  $('#excelFileName').textContent=file.name;$('#excelStatus').textContent='엑셀 파일을 읽는 중…';
  $('#analyzeExcel').disabled=true;$('#excelInput').disabled=true;
  try{
    if(!/\.xlsx?$/i.test(file.name))throw new Error('XLS 또는 XLSX 파일을 선택해주세요.');
    if(file.size>20*1024*1024)throw new Error('20MB 이하 파일로 나눠주세요.');
    if(typeof XLSX==='undefined')await loadExternalScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
    const bytes=await file.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const book=XLSX.read(bytes,{type:'array',cellDates:true,sheetRows:10005});
    const sheets=book.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:true,blankrows:true})}));
    if(!sheets.length)throw new Error('읽을 수 있는 시트가 없습니다.');
    if(sheets.some(s=>s.rows.length>10000))throw new Error('한 시트는 10,000행 이하로 나눠주세요.');
    excelSession={fileName:file.name,hash,sheets,ready:false};
    $('#excelSheet').innerHTML=sheets.map((s,i)=>`<option value="${i}">${escapeHtml(s.name)}</option>`).join('');
    $('#excelBillingMonth').value='';$('#excelCard').value='';
    configureColumns();
    if(sheets.length>1)$('#excelStatus').textContent+=' 시트가 여러 개입니다. 선택한 시트만 가져옵니다.';
    $('#analyzeExcel').disabled=false;
  }catch(error){$('#excelStatus').textContent='가져오기 실패: '+error.message;}
  finally{$('#excelInput').disabled=false;e.target.value='';}
};
$('#excelSheet').onchange=()=>configureColumns();
$('#excelRemap').onclick=()=>{if(excelSession)configureColumns(false);};
$('#excelPanel').addEventListener('change',e=>{if(e.target.id!=='excelSheet')resetExcelReview();});
$('#cancelExcel').onclick=()=>{resetExcelReview();excelSession=null;$('#excelPanel').classList.add('hidden');};
$('#analyzeExcel').onclick=()=>{
  if(!excelSession)return;
  resetExcelReview();
  const map=Object.fromEntries($$('#excelColumns select').map(el=>[el.dataset.column,Number(el.value)]));
  const year=Number($('#excelYear').value),issuer=$('#excelIssuer').value;
  const fields=['date','merchant','amount'];
  if(!Number.isInteger(year)||year<2000||year>2100){$('#excelStatus').textContent='기준 연도를 확인해주세요.';return;}
  if(fields.some(f=>map[f]<0)||new Set(fields.map(f=>map[f])).size!==3){$('#excelStatus').textContent='날짜·업체·이용금액은 서로 다른 열을 선택해주세요.';return;}
  const selected=Object.values(map).filter(v=>v>=0);
  if(new Set(selected).size!==selected.length){$('#excelStatus').textContent='같은 열을 두 항목에 연결할 수 없습니다. 할인과 청구원금 열도 확인해주세요.';return;}
  const sheet=excelSession.sheets[Number($('#excelSheet').value)];
  const key=[excelSession.hash,sheet.name,issuer,year].join('|');
  // Stored transaction source keys make repeat detection survive a history-write failure.
  if(excelHistory().includes(key)||state.txs.some(t=>t.importFileKey===key)){
    $('#excelStatus').textContent='이미 등록한 파일·시트입니다. 중복으로 추가하지 않았습니다.';return;
  }
  const billedTitle=String(sheet.rows[Number($('#excelHeaderRow').value)-1]?.[map.billed]||'').replace(/\s/g,'');
  const result=ExcelImport.parse(sheet.rows,{map,start:excelSession.start,year,issuer,defaultCard:$('#excelCard').value,fileName:excelSession.fileName,sheetName:sheet.name,billingMonth:$('#excelBillingMonth').value,billedIncludesFee:/^(청구금액|결제금액)$/.test(billedTitle)});
  if(result.errors.length){$('#excelStatus').textContent=`${result.errors.length}개 항목을 확인해주세요. 아직 저장하지 않았습니다.\n`+result.errors.slice(0,15).join('\n');return;}
  if(!result.txs.length){$('#excelStatus').textContent='거래를 찾지 못했습니다. 시트와 제목 행, 열 연결을 확인해주세요.';return;}
  const yearless=sheet.rows.slice(excelSession.start).map(r=>String(r[map.date]).trim()).filter(s=>/^\d{1,2}[.\-/월]/.test(s));
  if(yearless.some(s=>/^12[.\-/월]/.test(s))&&yearless.some(s=>/^0?1[.\-/월]/.test(s))){$('#excelStatus').textContent='연도 없는 12월·1월이 함께 있습니다. 연도별 파일로 나누거나 이용일을 연도 포함 날짜로 저장해주세요.';return;}
  state.importMode='excel';state.overlapRemoved=0;
  state.pending=ExcelImport.reconcile(result.txs,state.txs).map(t=>({...t,id:crypto.randomUUID(),category:t.category||categoryFor(t.merchant),card:cardNames[t.cardId]||t.card,importFileKey:key}));
  excelSession.key=key;excelSession.ready=true;excelSession.warnings=result.warnings;
  localStorage.setItem('jjig_excel_year',year);localStorage.setItem('jjig_excel_issuer',issuer);
  $('#excelStatus').textContent=`${result.txs.length}건을 읽었습니다. 소계·합계 ${result.summaryRows}행은 제외했습니다.\n`+result.warnings.join('\n');
  renderReview();$('#reviewPanel').classList.remove('hidden');
};
function renderExcelReviewExtras(){
  const enabled=state.importMode==='excel';
  $('#excelReviewSummary').classList.toggle('hidden',!enabled);
  $('#excelConflictTools').classList.toggle('hidden',!enabled||!state.pending.some(t=>t.matchId));
  if(!enabled){$('#merchantGroups').innerHTML='';return;}
  const dates=state.pending.map(t=>t.date).sort();
  const count=action=>state.pending.filter(t=>t.action===action).length;
  const totals=state.pending.reduce((s,t)=>({gross:s.gross+t.amount,discount:s.discount+t.discount}),{gross:0,discount:0});
  $('#excelReviewSummary').textContent=`${dates[0]} ~ ${dates.at(-1)} · 신규 ${count('new')}건 · 기존/제외 ${count('skip')}건 · 갱신 ${count('update')}건 · 확인 필요 ${count('review')}건\n파일 합계 ${fmt(totals.gross)} − 할인 ${fmt(totals.discount)} = ${fmt(totals.gross-totals.discount)}\n겹친 거래의 할인 변경은 ‘기존 거래 갱신’, 별도 결제라면 ‘새 거래로 추가’를 선택하세요.`;
  const names=new Set(state.pending.filter(t=>t.category==='미분류').map(t=>displayMerchant(t.merchant)));
  state.reviewFilters.forEach(name=>names.add(name));
  const groups=Array.from(names).map(name=>[name,state.pending.filter(t=>displayMerchant(t.merchant)===name).length]);
  $('#merchantGroups').innerHTML=groups.map(([name,count],i)=>`<button class="mini-btn merchant-group" aria-pressed="${state.reviewFilters.has(name)}" data-group="${i}">${escapeHtml(name)} ${count}건</button>`).join('');
  $$('.merchant-group').forEach(button=>button.onclick=()=>{collectReview();toggleReviewMerchant(groups[Number(button.dataset.group)][0]);renderReview();});
}
$('#reviewList').addEventListener('change',e=>{if(e.target.matches('.rv-action')){collectReview();renderExcelReviewExtras();}});
$('#skipExcelMatches').onclick=()=>{collectReview();state.pending.forEach(t=>{if(t.action==='review')t.action='skip';});renderReview();};
function commitExcel(){
  if(!excelSession?.ready){toast('파일을 다시 읽어주세요');return;}
  if(state.pending.some(t=>t.action==='review')){toast('겹친 거래의 등록 처리를 선택해주세요');return;}
  const active=state.pending.filter(t=>t.action!=='skip');
  if(active.some(t=>!validTransaction(t))){toast('이용금액과 할인금액을 확인해주세요');return;}
  let next=state.txs.slice();
  for(const row of active){
    const {action,matchId,matchReason,previousDiscount,selected,...t}=row;
    if(action==='update'){
      const old=next.find(x=>x.id===matchId);if(!old){toast('기존 거래가 바뀌었습니다. 다시 읽어주세요');return;}
      next=next.map(x=>x.id===matchId?{...x,...t,id:x.id}:x);
    }else next.push(t);
  }
  try{localStorage.setItem('jjig_txs',JSON.stringify(next));}
  catch(error){toast('저장 공간이 부족합니다. 내역을 저장하지 못했습니다');return;}
  state.txs=next;
  try{localStorage.setItem('jjig_excel_imports',JSON.stringify([...new Set([...excelHistory(),excelSession.key])].slice(-300)));}catch(error){/* per-transaction keys still protect stored rows */}
  const latest=state.pending.map(t=>t.date).sort().at(-1);
  if(latest){state.month=latest.slice(0,7);$('#monthPicker').value=state.month;}
  state.pending=[];excelSession=null;
  $('#reviewPanel').classList.add('hidden');$('#excelPanel').classList.add('hidden');
  if(typeof dashboard!=='undefined'&&latest)dashboard.date=latest;
  render();if(typeof switchTab==='function')switchTab('calendar');toast(`${active.length}건 반영 완료`);
}
function renderBilling(){
  const m=new Date(state.month+'-01T12:00:00');m.setMonth(m.getMonth()+1);
  const target=`${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}`;
  const groups=new Map();
  for(const t of state.txs){
    if(t.sourceType!=='excel')continue;
    const d=new Date(t.date+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()+1);
    const assumed=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-14`;
    const due=t.dueDate||assumed;if(!due.startsWith(target))continue;
    const key=`${t.issuer} ${t.cardLast4}`,g=groups.get(key)||{total:0,count:0,estimated:false,label:cardLabel(t)+' · '+t.cardLast4};
    g.total+=(t.billedAmount??(t.amount-t.discount))+((t.billedIncludesFee&&t.billedAmount!==null)?0:(t.fee||0));g.count++;
    g.estimated ||= !t.dueConfirmed||t.billedAmount===null||t.discountKnown===false;
    groups.set(key,g);
  }
  $('#billingSummary').innerHTML=`<p><b>${target} 결제 예정</b></p>`+(groups.size?Array.from(groups).map(([key,g])=>`<div class="billing-row"><span>${escapeHtml(g.label)}<small>${g.count}건 · ${g.estimated?'예상':'지정한 청구월 기준'}</small></span><b>${fmt(g.total)}</b></div>`).join(''):'<p class="muted">이 기간의 엑셀 내역이 없습니다.</p>');
}
renderBilling();
