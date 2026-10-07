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
let monthMenuYear=0;
function renderMonthMenu(){
  $('#monthMenuYear').textContent=monthMenuYear+'년';
  $('#monthMenuGrid').innerHTML=Array.from({length:12},(_,i)=>{
    const month=`${monthMenuYear}-${String(i+1).padStart(2,'0')}`;
    return `<button type="button" data-month="${month}" aria-pressed="${month===state.month}">${i+1}월</button>`;
  }).join('');
  $$('[data-month]').forEach(b=>b.onclick=()=>{state.month=b.dataset.month;$('#monthPicker').value=state.month;$('#monthMenu').hidden=true;$('#monthMenuToggle').setAttribute('aria-expanded','false');render();});
}
function labeledChart(segments,control,mode){
  const positive=segments.filter(s=>s.share>0),width=Math.max(280,$('#expenseChart').clientWidth||340);
  const labels=positive.map(s=>`${s.name} ${s.share<.01?'1% 미만':Math.round(s.share*100)+'%'}`);
  const measure=document.createElement('canvas').getContext('2d');
  measure.font='600 11.5px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const layout=chartCallouts(positive,width,mode,labels.map(text=>measure.measureText(text).width));
  const {rows,cx,cy,r,height,barY}=layout;
  const defs=`<defs><filter id="callout-outline" filterUnits="userSpaceOnUse" x="-5" y="-5" width="${width+10}" height="${height+10}" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="expanded"/><feFlood flood-color="white" result="white"/><feComposite in="white" in2="expanded" operator="in" result="outline"/><feMerge><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  let shapes=mode==='donut'?`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f3eef8" stroke-width="24"/>`:'';
  shapes+=rows.map(({s})=>{
    if(mode==='strip')return `<rect ${control(s)} role="button" tabindex="0" x="${12+s.start*(width-24)}" y="${barY}" width="${Math.max(.6,s.share*(width-24)-2)}" height="24" rx="${Math.min(7,s.share*60)}" fill="${s.color}" opacity="${s.active?1:.22}"/>`;
    const gap=Math.min(.7,s.share*15);
    return `<circle ${control(s)} role="button" tabindex="0" cx="${cx}" cy="${cy}" r="${r}" pathLength="100" fill="none" stroke="${s.color}" stroke-width="24" stroke-dasharray="${Math.max(.01,s.share*100-gap)} ${100-s.share*100+gap}" stroke-dashoffset="${-s.start*100-gap/2}" transform="rotate(-90 ${cx} ${cy})" opacity="${s.active?1:.22}"/>`;
  }).join('');
  const callouts=rows.map(p=>`<g opacity="${p.s.active?1:.35}"><g class="callout-line" filter="url(#callout-outline)"><path d="${p.path}" fill="none" stroke="${p.s.color}" stroke-width="1.5"/><circle cx="${p.sx}" cy="${p.sy}" r="2.6" fill="${p.s.color}"/></g><g ${control(p.s)} role="button" tabindex="0" class="callout-label"><rect x="${p.x-3}" y="${p.y-19}" width="${p.tw+6}" height="30" fill="transparent"/><text x="${p.x}" y="${p.y}" class="callout-text">${escapeHtml(p.s.name)} <tspan fill="${p.s.color}">${p.s.share<.01?'1% 미만':Math.round(p.s.share*100)+'%'}</tspan></text></g></g>`).join('');
  const share=positive.reduce((sum,s)=>sum+(s.members?s.members.filter(m=>m.active).reduce((n,m)=>n+m.share,0):s.active?s.share:0),0);
  const center=mode==='donut'?`<text x="${cx}" y="${cy-8}" text-anchor="middle" class="chart-center-label">${dashboard.selected.size?'선택한 비중':'지출 비중'}</text><text x="${cx}" y="${cy+23}" text-anchor="middle" class="chart-center-value">${Math.round(share*100)}%</text>`:'';
  return `<svg class="labeled-chart" viewBox="0 0 ${width} ${height}" aria-label="업종별 지출 ${mode==='donut'?'원':'띠'}그래프">${defs}${shapes}${callouts}${center}</svg>`;
}
function switchTab(tab){
  dashboard.tab=tab;
  $$('.tab-pane').forEach(p=>p.classList.toggle('hidden',p.id!==tab+'Pane'));
  $$('[data-tab]').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(tab==='stats')renderDashboard();
  window.scrollTo({top:0,behavior:'smooth'});
}
function compactRows(txs){
  return txs.map(t=>`<button class="expense-row" data-transaction="${escapeHtml(t.id)}"><span><b>${escapeHtml(displayMerchant(t.merchant))}</b><small>${t.date.slice(5).replace('-','/')} · ${escapeHtml(t.category)} · ${escapeHtml(cardLabel(t))}</small></span><strong>${fmt(netExpense(t))}<small>${t.discount?'할인 '+fmt(t.discount):'상세 ›'}</small></strong></button>`).join('');
}
function renderDashboard(){
  $('#monthMenuToggle').textContent=state.month.slice(0,4)+'년 '+Number(state.month.slice(5))+'월 ⌄';
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
  const colors=['#b4a4c9','#b69bd7','#e99cb9','#dda0cf','#cda078','#efac84','#7bbec3','#a7a7d0','#a9c695','#e8c17e','#86b7c7','#a7a2db','#eaa182','#b8bc82','#97add6','#edb491','#be9bc4','#92bfa7','#e6a0ab','#c5a285','#b2c1dd','#93b9b1','#b0a3c8','#c7b5a1'];
  const positive=categories.reduce((s,[,v])=>s+Math.max(0,v),0);
  let offset=0;
  const segments=categories.map(([name,value],i)=>{
    const share=positive?Math.max(0,value)/positive:0,start=offset;offset+=share;
    return {name,value,i,share,start,color:colors[Math.max(0,CATEGORIES.indexOf(name))%colors.length],active:!dashboard.selected.size||dashboard.selected.has(name)};
  });
  const selected=selectedTransactions(txs,dashboard.selected),sum=selected.reduce((s,t)=>s+netExpense(t),0);
  const label=dashboard.selected.size?`${dashboard.selected.size}개 업종 선택`:'전체 최종지출';
  const control=s=>`data-category="${s.i}" aria-label="${escapeHtml(s.name)}, ${fmt(s.value)}" aria-pressed="${s.members?s.members.every(m=>dashboard.selected.has(m.name)):dashboard.selected.has(s.name)}"`;
  const chartSegments=segments.filter(s=>s.share>0);
  if(chartSegments.length>6){
    const rest=chartSegments.splice(5);
    chartSegments.push({name:`그 외 ${rest.length}개`,i:rest.map(s=>s.i).join(','),value:rest.reduce((sum,s)=>sum+s.value,0),share:rest.reduce((sum,s)=>sum+s.share,0),start:rest[0].start,color:'#c7bfd5',active:rest.some(s=>s.active),members:rest});
  }
  $('#expenseChart').innerHTML=`<div class="chart-caption"><small>${label}</small><b>${fmt(sum)}</b></div>${labeledChart(chartSegments,control,dashboard.mode)}${segments.length>6?'<p class="chart-hint">작은 비중은 묶어 표시해요 · 아래에서 모든 업종을 선택할 수 있어요</p>':''}`;
  const selectedShare=segments.filter(s=>!dashboard.selected.size||dashboard.selected.has(s.name)).reduce((sum,s)=>sum+s.share,0);
  $('#selectionSummary').textContent=positive?`${selected.length}건 · ${Math.round(selectedShare*100)}% · 할인 반영${categories.some(([,v])=>v<0)?' · 환불이 더 큰 업종은 그래프에서 제외하고 금액에 반영':''}`:'표시할 양수 지출이 없어요 · 환불은 합계에 반영됩니다';
  $('#clearStats').hidden=!dashboard.selected.size;
  $('#categoryLegend').innerHTML=segments.map(s=>`<button class="category-row" ${control(s)}><span class="color-dot" style="background:${s.color}"></span><b>${escapeHtml(s.name)}</b><small>${Math.round(s.share*100)}%</small><strong>${fmt(s.value)}</strong></button>`).join('')||'<p class="muted">내역을 등록하면 통계가 보여요</p>';
  $('#statsList').innerHTML=compactRows(selected.slice().sort((a,b)=>b.date.localeCompare(a.date)))||'<p class="muted">해당 내역이 없어요</p>';
  $$('[data-category]').forEach(el=>{
    const toggle=()=>{const names=el.dataset.category.split(',').map(i=>categories[Number(i)][0]);const remove=names.every(name=>dashboard.selected.has(name));names.forEach(name=>{if(remove)dashboard.selected.delete(name);else dashboard.selected.add(name);});renderDashboard();};
    el.onclick=toggle;
    if(el.getAttribute('role')==='button')el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}};
  });
}
$$('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
$('#donutMode').onclick=()=>{dashboard.mode='donut';updateChartMode();};
$('#stripMode').onclick=()=>{dashboard.mode='strip';updateChartMode();};
function updateChartMode(){['donut','strip'].forEach(mode=>$('#'+mode+'Mode').setAttribute('aria-pressed',String(dashboard.mode===mode)));renderDashboard();}
$('#clearStats').onclick=()=>{dashboard.selected.clear();renderDashboard();};
$('#monthMenuToggle').onclick=()=>{const menu=$('#monthMenu');menu.hidden=!menu.hidden;$('#monthMenuToggle').setAttribute('aria-expanded',String(!menu.hidden));monthMenuYear=Number(state.month.slice(0,4));renderMonthMenu();};
$('#previousYear').onclick=()=>{monthMenuYear--;renderMonthMenu();};
$('#nextYear').onclick=()=>{monthMenuYear++;renderMonthMenu();};
render();
