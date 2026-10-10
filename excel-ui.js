function renderExcelReviewExtras(){
  const enabled=state.importMode==='excel';
  $('#excelReviewSummary').classList.toggle('hidden',!enabled);
  $('#excelConflictTools').classList.toggle('hidden',!enabled||!state.pending.some(t=>t.matchId));
  if(!enabled){$('#merchantGroups').innerHTML='';$('#reviewAttention').innerHTML='';return;}
  renderReviewAttention();
  const dates=state.pending.map(t=>t.date).sort();
  const count=action=>state.pending.filter(t=>t.action===action).length;
  const totals=state.pending.filter(t=>t.action!=='skip').reduce((s,t)=>({gross:s.gross+t.amount,discount:s.discount+t.discount}),{gross:0,discount:0});
  $('#excelReviewSummary').textContent=`${state.pending.some(t=>t.installmentStatements?.length>1)?'월별 명세서에 반복된 같은 할부는 구매 1건으로 합쳤어요. 각 달의 청구금액은 카드 탭에 반영됩니다.\n':''}${dates[0]} ~ ${dates.at(-1)} · 새로 추가 ${count('new')}건 · 추가 안 함 ${count('skip')}건 · 정보 변경 ${count('update')}건 · 확인 필요 ${count('review')}건\n구매 사용금액 ${fmt(totals.gross)} − 할인 ${fmt(totals.discount)} = ${fmt(totals.gross-totals.discount)}\n같은 결제가 여러 파일에 들어 있을 수 있어요. ‘이미 있어요’는 추가하지 않고, ‘같은 결제예요’는 저장된 정보만 바꿉니다.`;
  const names=new Set(bulkReview.names);
  state.reviewFilters.forEach(name=>names.add(name));
  const groups=Array.from(names).map(name=>[name,state.pending.filter(t=>displayMerchant(t.merchant)===name).length]);
  $('#merchantGroups').innerHTML=groups.map(([name,count],i)=>{const categories=[...new Set(state.pending.filter(t=>displayMerchant(t.merchant)===name).map(t=>t.category))];const done=!categories.includes('미분류');return `<button class="mini-btn merchant-group ${done?'classified':''}" aria-pressed="${state.reviewFilters.has(name)}" data-group="${i}">${escapeHtml(name)} ${count}건<small>${done?'✓ '+escapeHtml(categories.join(' · ')):'미분류 포함'}</small></button>`;}).join('');
  $$('.merchant-group').forEach(button=>button.onclick=()=>{collectReview();toggleReviewMerchant(groups[Number(button.dataset.group)][0]);renderReview();});
}
function showReviewProblems(){
 state.reviewFilters.clear();state.pending.forEach(t=>t.selected=false);state.reviewView={needsAttention:true};state.reviewPage=0;renderReview();$('#reviewAttention').scrollIntoView({behavior:'smooth',block:'start'});toast('확인 필요한 항목만 펼쳐 놓았어요');
}
function renderReviewAttention(){
 const issues=state.pending.filter(t=>reviewProblem(t));
 $('#reviewAttention').innerHTML=issues.length?`<div class="review-attention"><b>확인 필요한 항목 ${issues.length}건</b><p>${escapeHtml(reviewProblem(issues[0]))}</p><button class="mini-btn" id="showReviewProblems">확인 필요한 ${issues.length}건만 보기</button></div>`:'';
 if(issues.length)$('#showReviewProblems').onclick=()=>{collectReview();showReviewProblems();};
 if(state.reviewView.needsAttention)$('#reviewAttention').innerHTML+='<button class="text-btn" id="showAllReview">전체 내역 보기</button>';
 if($('#showAllReview'))$('#showAllReview').onclick=()=>{collectReview();state.reviewView={};state.reviewPage=0;renderReview();};
}
$('#reviewList').addEventListener('change',e=>{if(e.target.matches('.rv-action')){collectReview();renderExcelReviewExtras();}});
$('#skipExcelMatches').onclick=()=>{collectReview();state.pending.forEach(t=>{if(t.action==='review')t.action='skip';});renderReview();};
function commitExcel(){
  if(!excelSession?.ready){toast('파일을 다시 읽어주세요');return;}
  if(state.pending.some(t=>reviewProblem(t))){showReviewProblems();return;}
  const active=state.pending.filter(t=>t.action!=='skip');
  if(active.some(t=>!validTransaction(t))){showReviewProblems();return;}
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
  try{localStorage.setItem('jjig_excel_imports',JSON.stringify([...new Set([...excelHistory(),...excelSession.keys])].slice(-300)));}catch(error){/* per-transaction keys still protect stored rows */}
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
    for(const entry of t.installmentStatements||[t]){
    const due=entry.billingMonth?entry.billingMonth+'-01':t.dueDate||assumed;if(!due.startsWith(target))continue;
    const key=t.cardId||`${t.issuer} ${t.cardLast4}`,g=groups.get(key)||{total:0,count:0,estimated:false,label:cardLabel(t)+(t.cardLast4?' · '+t.cardLast4:'')};
    g.total+=(entry.billedAmount??(t.amount-t.discount))+((t.billedIncludesFee&&entry.billedAmount!==null)?0:(entry.fee||0));g.count++;
    g.estimated ||= !entry.billingMonth&&!t.dueConfirmed||entry.billedAmount===null;
    groups.set(key,g);
    }
  }
  $('#billingSummary').innerHTML=`<p><b>${target} 결제 예정</b></p>`+(groups.size?Array.from(groups).map(([key,g])=>`<div class="billing-row"><span>${escapeHtml(g.label)}<small>${g.count}건 · ${g.estimated?'예상':'명세서 청구월 기준'}</small></span><b>${fmt(g.total)}</b></div>`).join(''):'<p class="muted">이 기간의 엑셀 내역이 없습니다.</p>');
}
renderBilling();
