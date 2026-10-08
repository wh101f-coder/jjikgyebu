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
    const due=t.dueDate||assumed;if(!due.startsWith(target))continue;
    const key=t.cardId||`${t.issuer} ${t.cardLast4}`,g=groups.get(key)||{total:0,count:0,estimated:false,label:cardLabel(t)+(t.cardLast4?' · '+t.cardLast4:'')};
    g.total+=(t.billedAmount??(t.amount-t.discount))+((t.billedIncludesFee&&t.billedAmount!==null)?0:(t.fee||0));g.count++;
    g.estimated ||= !t.dueConfirmed||t.billedAmount===null||t.discountKnown===false;
    groups.set(key,g);
  }
  $('#billingSummary').innerHTML=`<p><b>${target} 결제 예정</b></p>`+(groups.size?Array.from(groups).map(([key,g])=>`<div class="billing-row"><span>${escapeHtml(g.label)}<small>${g.count}건 · ${g.estimated?'예상':'지정한 청구월 기준'}</small></span><b>${fmt(g.total)}</b></div>`).join(''):'<p class="muted">이 기간의 엑셀 내역이 없습니다.</p>');
}
renderBilling();
