// Calendar and charts use the same signed, discount-adjusted expense amount.
const dashboard={date:today(),selected:new Set(),mode:'donut',tab:'calendar'};
const netExpense=t=>Number(t.amount)-(Number(t.discount)||0);
function calendarCells(month){
  const [year,m]=month.split('-').map(Number), offset=new Date(year,m-1,1).getDay();
  const count=new Date(year,m,0).getDate();
  return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>i<offset||i>=offset+count?null:`${month}-${String(i-offset+1).padStart(2,'0')}`);
}
function categoryTotals(txs){
  const totals=new Map();
  txs.forEach(t=>totals.set(t.category||'미분류',(totals.get(t.category||'미분류')||0)+netExpense(t)));
  return [...totals].sort((a,b)=>b[1]-a[1]);
}
function selectedTransactions(txs,selected){return txs.filter(t=>!selected.size||selected.has(t.category||'미분류'));}
function switchTab(tab){
  dashboard.tab=tab;
  $$('.tab-pane').forEach(p=>p.classList.toggle('hidden',p.id!==tab+'Pane'));
  $$('[data-tab]').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  window.scrollTo({top:0,behavior:'smooth'});
}
function compactRows(txs){
  return txs.map(t=>`<button class="expense-row" data-transaction="${escapeHtml(t.id)}"><span><b>${escapeHtml(displayMerchant(t.merchant))}</b><small>${t.date.slice(5).replace('-','/')} · ${escapeHtml(t.category)} · ${escapeHtml(cardLabel(t))}</small></span><strong>${fmt(netExpense(t))}<small>${t.discount?'할인 '+fmt(t.discount):'상세 ›'}</small></strong></button>`).join('');
}
function renderDashboard(){
  const txs=state.txs.filter(t=>t.date.startsWith(state.month));
  if(!dashboard.date.startsWith(state.month))dashboard.date=txs.map(t=>t.date).sort().at(-1)||state.month+'-01';
  const totals=new Map();txs.forEach(t=>totals.set(t.date,(totals.get(t.date)||0)+netExpense(t)));
  const short=n=>Math.abs(n)>=1000000?`약 ${Number((n/10000).toFixed(1))}만`:new Intl.NumberFormat('ko-KR').format(n);
  $('#calendarGrid').innerHTML=calendarCells(state.month).map(date=>date?`<button class="calendar-day ${date===today()?'today':''}" data-date="${date}" aria-pressed="${date===dashboard.date}" aria-label="${date}, 지출 ${fmt(totals.get(date)||0)}"><span>${Number(date.slice(-2))}</span><small>${totals.has(date)?short(totals.get(date)):'&nbsp;'}</small></button>`:'<span></span>').join('');
  $$('[data-date]').forEach(b=>b.onclick=()=>{dashboard.date=b.dataset.date;renderDashboard();});
  const day=txs.filter(t=>t.date===dashboard.date);
  $('#dayTitle').textContent=dashboard.date.slice(5).replace('-','월 ')+'일';
  $('#daySummary').textContent=`${day.length}건 · 최종지출 ${fmt(day.reduce((s,t)=>s+netExpense(t),0))}`;
  $('#groupedList').innerHTML=compactRows(day);
  $('#emptyState').style.display=day.length?'none':'flex';
  renderStats(txs);
  $$('[data-transaction]').forEach(b=>b.onclick=()=>openDetails([b.dataset.transaction]));
}
function renderStats(txs){
  const categories=categoryTotals(txs), names=new Set(categories.map(([name])=>name));
  dashboard.selected.forEach(name=>{if(!names.has(name))dashboard.selected.delete(name);});
  const colors=['#ef9c79','#bc9cdd','#76bfc4','#e98eaf','#a2c690','#e8bf71','#90aade','#c5a396'];
  const positive=categories.reduce((s,[,v])=>s+Math.max(0,v),0);
  let offset=0;
  const segments=categories.map(([name,value],i)=>{
    const share=positive?Math.max(0,value)/positive:0,start=offset;offset+=share;
    return {name,value,i,share,start,color:colors[i%colors.length],active:!dashboard.selected.size||dashboard.selected.has(name)};
  });
  const selected=selectedTransactions(txs,dashboard.selected),sum=selected.reduce((s,t)=>s+netExpense(t),0);
  const label=dashboard.selected.size?`${dashboard.selected.size}개 업종 선택`:'전체 최종지출';
  const control=s=>`data-category="${s.i}" aria-label="${escapeHtml(s.name)}, ${fmt(s.value)}" aria-pressed="${dashboard.selected.has(s.name)}"`;
  if(dashboard.mode==='donut'){
    $('#expenseChart').innerHTML=`<div class="donut-wrap"><svg viewBox="0 0 240 240" aria-label="업종별 지출 원그래프"><circle cx="120" cy="120" r="88" fill="none" stroke="#f0edf5" stroke-width="28"/>${segments.filter(s=>s.share>0).map(s=>`<circle ${control(s)} role="button" tabindex="0" cx="120" cy="120" r="88" pathLength="100" fill="none" stroke="${s.color}" stroke-width="${dashboard.selected.has(s.name)?34:28}" stroke-dasharray="${s.share*100} ${100-s.share*100}" stroke-dashoffset="${-s.start*100}" transform="rotate(-90 120 120)" opacity="${s.active?1:.22}"/>`).join('')}</svg><div class="donut-center"><small>${label}</small><b>${fmt(sum)}</b></div></div>`;
  }else{
    $('#expenseChart').innerHTML=`<div class="strip-total"><small>${label}</small><b>${fmt(sum)}</b></div><div class="strip-chart">${segments.filter(s=>s.share>0).map(s=>`<button ${control(s)} style="flex:${s.share};background:${s.color};opacity:${s.active?1:.22}"></button>`).join('')}</div>`;
  }
  const selectedShare=segments.filter(s=>!dashboard.selected.size||dashboard.selected.has(s.name)).reduce((sum,s)=>sum+s.share,0);
  $('#selectionSummary').textContent=positive?`${selected.length}건 · ${Math.round(selectedShare*100)}% · 할인 반영${categories.some(([,v])=>v<0)?' · 환불이 더 큰 업종은 그래프에서 제외하고 금액에 반영':''}`:'표시할 양수 지출이 없어요 · 환불은 합계에 반영됩니다';
  $('#clearStats').hidden=!dashboard.selected.size;
  $('#categoryLegend').innerHTML=segments.map(s=>`<button class="category-row" ${control(s)}><span class="color-dot" style="background:${s.color}"></span><b>${escapeHtml(s.name)}</b><small>${Math.round(s.share*100)}%</small><strong>${fmt(s.value)}</strong></button>`).join('')||'<p class="muted">내역을 등록하면 통계가 보여요</p>';
  $('#statsList').innerHTML=compactRows(selected.slice().sort((a,b)=>b.date.localeCompare(a.date)))||'<p class="muted">해당 내역이 없어요</p>';
  $$('[data-category]').forEach(el=>{
    const toggle=()=>{const name=categories[Number(el.dataset.category)][0];if(dashboard.selected.has(name))dashboard.selected.delete(name);else dashboard.selected.add(name);renderDashboard();};
    el.onclick=toggle;
    if(el.tagName.toLowerCase()==='circle')el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}};
  });
}
$$('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
$('#donutMode').onclick=()=>{dashboard.mode='donut';updateChartMode();};
$('#stripMode').onclick=()=>{dashboard.mode='strip';updateChartMode();};
function updateChartMode(){['donut','strip'].forEach(mode=>$('#'+mode+'Mode').setAttribute('aria-pressed',String(dashboard.mode===mode)));renderDashboard();}
$('#clearStats').onclick=()=>{dashboard.selected.clear();renderDashboard();};
render();
