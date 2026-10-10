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
  monthMenuYear=Number(state.month.slice(0,4));
  const years=Array.from({length:Math.max(2100,monthMenuYear)-Math.min(2000,monthMenuYear)+1},(_,i)=>Math.min(2000,monthMenuYear)+i);
  $('#monthMenuYear').innerHTML=years.map(y=>`<option value="${y}" ${y===monthMenuYear?'selected':''}>${y}년</option>`).join('');
  $('#monthMenuGrid').innerHTML=Array.from({length:12},(_,i)=>{
    const month=`${monthMenuYear}-${String(i+1).padStart(2,'0')}`;
    return `<button type="button" data-month="${month}" aria-pressed="${month===state.month}">${i+1}월</button>`;
  }).join('');
  $$('[data-month]').forEach(b=>b.onclick=()=>{state.month=b.dataset.month;$('#monthPicker').value=state.month;render();});
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
  if(tab==='stats'||tab==='compare')renderDashboard();
  window.scrollTo({top:0,behavior:'smooth'});
}
function compactRows(txs){
  return txs.map(t=>`<button class="expense-row" data-transaction="${escapeHtml(t.id)}"><span><b>${escapeHtml(displayMerchant(t.merchant))}</b><small>${t.date.slice(5).replace('-','/')} · ${escapeHtml(t.category)} · ${escapeHtml(cardLabel(t))}</small></span><strong>${fmt(netExpense(t))}<small>${t.discount?'할인 '+fmt(t.discount):'상세 ›'}</small></strong></button>`).join('');
}
function renderDashboard(){
  renderMonthMenu();
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
  renderComparison();
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
  if(typeof renderSavedList==='function')renderSavedList(selected);else $('#statsList').innerHTML=compactRows(selected.slice().sort((a,b)=>b.date.localeCompare(a.date)))||'<p class="muted">해당 내역이 없어요</p>';
  $$('[data-category]').forEach(el=>{
    const toggle=()=>{const names=el.dataset.category.split(',').map(i=>categories[Number(i)][0]);const remove=names.every(name=>dashboard.selected.has(name));names.forEach(name=>{if(remove)dashboard.selected.delete(name);else dashboard.selected.add(name);});renderDashboard();};
    el.onclick=toggle;
    if(el.getAttribute('role')==='button')el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}};
  });
}

const comparison={base:null,selected:new Set(),picker:null,year:2026};
function previousMonth(month){const [y,m]=month.split('-').map(Number);return m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`;}
function comparisonData(txs,base,target,selected=new Set()){
 const before=txs.filter(t=>t.date.startsWith(base)),after=txs.filter(t=>t.date.startsWith(target));
 const a=new Map(categoryTotals(before)),b=new Map(categoryTotals(after));
 const rows=[...new Set([...a.keys(),...b.keys()])].map(name=>({name,before:a.get(name)||0,after:b.get(name)||0})).sort((x,y)=>Math.abs(y.after-y.before)-Math.abs(x.after-x.before));
 const filtered=rows.filter(r=>!selected.size||selected.has(r.name));
 return {rows,filtered,before:filtered.reduce((s,r)=>s+r.before,0),after:filtered.reduce((s,r)=>s+r.after,0),hasBefore:before.length>0,hasAfter:after.length>0};
}
function changeText(before,after){
 const delta=after-before;
 if(!delta)return '변화 없음';
 if(before<=0)return before===0&&after>0?'새 지출':'환불 반영 · 금액 비교';
 return `${delta>0?'↑':'↓'} ${Number((Math.abs(delta)/before*100).toFixed(1))}% ${delta>0?'증가':'감소'}`;
}
function chooseComparisonMonth(role,month){
 if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))return;
 if(role==='base')comparison.base=month;
 else {comparison.base??=previousMonth(state.month);state.month=month;$('#monthPicker').value=month;}
 comparison.picker=null;
}
function renderComparisonMonthMenu(){
 const base=comparison.base||previousMonth(state.month),target=state.month;
 for(const [role,month] of [['base',base],['target',target]]){
  const button=$('#compare'+(role==='base'?'Base':'Target')+'Toggle');
  button.textContent=month.slice(0,4)+'년 '+Number(month.slice(5))+'월 ⌄';
  button.setAttribute('aria-label',(role==='base'?'기준 월':'비교 월')+' 선택, '+button.textContent.replace(' ⌄',''));
  button.setAttribute('aria-expanded',String(comparison.picker===role));
 }
 $('#compareMonthMenu').hidden=!comparison.picker;if(!comparison.picker)return;
 $('#compareMonthTitle').textContent=comparison.picker==='base'?'기준 월 선택':'비교 월 선택';
 const y=comparison.year;$('#compareYear').innerHTML=Array.from({length:Math.max(2100,y)-Math.min(2000,y)+1},(_,i)=>Math.min(2000,y)+i).map(v=>`<option value="${v}" ${v===y?'selected':''}>${v}년</option>`).join('');
 const selected=comparison.picker==='base'?base:target;
 $('#compareMonthGrid').innerHTML=Array.from({length:12},(_,i)=>{const month=`${y}-${String(i+1).padStart(2,'0')}`;return `<button type="button" data-compare-month="${month}" aria-pressed="${month===selected}">${i+1}월</button>`;}).join('');
 $$('[data-compare-month]').forEach(b=>b.onclick=()=>{const role=comparison.picker;chooseComparisonMonth(role,b.dataset.compareMonth);render();$('#compare'+(role==='base'?'Base':'Target')+'Toggle').focus();});
}
function openComparisonMonth(role){
 const month=role==='base'?(comparison.base||previousMonth(state.month)):state.month;
 comparison.picker=comparison.picker===role?null:role;comparison.year=Number(month.slice(0,4));renderComparisonMonthMenu();
}
function renderComparison(){
 renderComparisonMonthMenu();
 const base=comparison.base||previousMonth(state.month),target=state.month;
 const available=comparisonData(state.txs,base,target);
 const names=new Set(available.rows.map(r=>r.name));comparison.selected.forEach(n=>{if(!names.has(n))comparison.selected.delete(n);});
 const data=comparisonData(state.txs,base,target,comparison.selected);
 $('#compareBase').value=base;$('#compareTarget').value=target;
 const moneyDelta=n=>`${n>0?'+':n<0?'−':''}${fmt(Math.abs(n))}`;
 const valid=data.hasBefore&&data.hasAfter;
 $('#compareSummary').innerHTML=`<div class="compare-total-label">${comparison.selected.size?comparison.selected.size+'개 업종 합계':'전체 업종 합계'}</div><div class="compare-totals"><div><small>${base.replace('-','년 ')}월</small><b>${data.hasBefore?fmt(data.before):'등록 내역 없음'}</b></div><div><small>${target.replace('-','년 ')}월</small><b>${data.hasAfter?fmt(data.after):'등록 내역 없음'}</b></div></div><div class="compare-change ${valid?(data.after>data.before?'increase':data.after<data.before?'decrease':''):''}">${valid?changeText(data.before,data.after)+' · '+moneyDelta(data.after-data.before):'두 달의 내역을 등록하면 증감을 볼 수 있어요'}</div>`;
 $('#clearCompare').hidden=!comparison.selected.size;
 $('#compareCategories').innerHTML=data.rows.map((r,i)=>`<button type="button" data-compare-category="${i}" aria-pressed="${comparison.selected.has(r.name)}">${escapeHtml(r.name)}</button>`).join('');
 const scale=Math.max(1,...data.filtered.flatMap(r=>[Math.abs(r.before),Math.abs(r.after)]));
 $('#compareRows').innerHTML=data.filtered.map(r=>`<div class="compare-row"><div class="compare-row-head"><b>${escapeHtml(r.name)}</b><span class="${valid?(r.after>r.before?'increase':r.after<r.before?'decrease':''):''}">${valid?changeText(r.before,r.after):'비교 내역 부족'}</span></div>${[['기준',r.before,data.hasBefore],['비교',r.after,data.hasAfter]].map(([label,value,exists],i)=>`<div class="compare-bar-row"><small>${label}</small><div class="compare-track"><span class="compare-bar ${i?'current':''}" style="width:${Math.abs(value)/scale*100}%"></span></div><span>${exists?fmt(value):'내역 없음'}</span></div>`).join('')}<small class="compare-difference">${valid?moneyDelta(r.after-r.before):'월 내역을 확인해 주세요'}${r.before<0||r.after<0?' · 음수는 순환불 금액':''}</small></div>`).join('')||'<p class="muted">비교할 업종 내역이 없어요</p>';
 $$('[data-compare-category]').forEach(b=>b.onclick=()=>{const name=data.rows[Number(b.dataset.compareCategory)].name;comparison.selected.has(name)?comparison.selected.delete(name):comparison.selected.add(name);renderComparison();});
}

$$('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
$('#donutMode').onclick=()=>{dashboard.mode='donut';updateChartMode();};
$('#stripMode').onclick=()=>{dashboard.mode='strip';updateChartMode();};
function updateChartMode(){['donut','strip'].forEach(mode=>$('#'+mode+'Mode').setAttribute('aria-pressed',String(dashboard.mode===mode)));renderDashboard();}
$('#clearStats').onclick=()=>{dashboard.selected.clear();renderDashboard();};
function selectYear(year){state.month=String(Math.min(9999,Math.max(1000,year))).padStart(4,'0')+state.month.slice(4);$('#monthPicker').value=state.month;render();}
$('#previousYear').onclick=()=>selectYear(monthMenuYear-1);
$('#nextYear').onclick=()=>selectYear(monthMenuYear+1);
$('#monthMenuYear').onchange=e=>selectYear(Number(e.target.value));
$('#compareBaseToggle').onclick=()=>openComparisonMonth('base');
$('#compareTargetToggle').onclick=()=>openComparisonMonth('target');
$('#closeCompareMonth').onclick=()=>{comparison.picker=null;renderComparisonMonthMenu();};
$('#comparePreviousYear').onclick=()=>{comparison.year=Math.max(2000,comparison.year-1);renderComparisonMonthMenu();};
$('#compareNextYear').onclick=()=>{comparison.year=Math.min(2100,comparison.year+1);renderComparisonMonthMenu();};
$('#compareYear').onchange=e=>{comparison.year=Number(e.target.value);renderComparisonMonthMenu();};
$('#compareBase').onchange=e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){comparison.base=e.target.value;renderComparison();}};
$('#compareTarget').onchange=e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){state.month=e.target.value;$('#monthPicker').value=state.month;render();}};
$('#clearCompare').onclick=()=>{comparison.selected.clear();renderComparison();};
$('#monthDelta').onclick=()=>{comparison.base=previousMonth(state.month);comparison.selected.clear();switchTab('compare');};
render();
