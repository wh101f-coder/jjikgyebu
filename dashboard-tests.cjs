const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ctx=vm.createContext({today:()=> '2026-10-06'});
vm.runInContext(fs.readFileSync(__dirname+'/dashboard.js','utf8').split("$$('[data-tab]').forEach(b=>b.onclick")[0],ctx);
const run=s=>vm.runInContext(s,ctx);
const {chartCallouts}=require('./chart-callouts.js');
test('strip leaders never cross each other or labels, including skewed shares',()=>{
 let seed=8;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 const samples=[[24,19,14,10,6,27],[46,16,9,6,4,19],...Array.from({length:600},(_,i)=>Array.from({length:i%6+1},()=>1+random()*100))];
 for(const weights of samples)for(const width of [280,320,390]){
  let start=0;const total=weights.reduce((a,b)=>a+b,0),items=weights.map(value=>{const s={start,share:value/total};start+=s.share;return s;});
  const {rows}=chartCallouts(items,width,'strip',items.map((_,i)=>[72,60,84,60,60,98][i]));
  const segments=rows.map(row=>{let x=0,y=0;return row.path.match(/[MHV][^MHV]+/g).flatMap(part=>{const a=part.slice(1).trim().split(/\s+/).map(Number);if(part[0]==='M'){[x,y]=a;return [];}const nx=part[0]==='H'?a[0]:x,ny=part[0]==='V'?a[0]:y;const s=[Math.min(x,nx),Math.min(y,ny),Math.max(x,nx),Math.max(y,ny)];x=nx;y=ny;return [s];});});
  const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
  rows.forEach((row,i)=>{
   assert.ok(row.x>=0&&row.x+row.tw<=width);
   for(const line of segments[i]){
    rows.forEach(label=>assert.ok(!intersects(line,[label.x,label.y-12,label.x+label.tw,label.y+2]),'leader crosses text'));
    for(let j=i+1;j<rows.length;j++)for(const other of segments[j])assert.ok(!intersects(line,other),`crossing ${i}/${j} at ${width}, shares ${weights}`);
   }
  });
 }
});
test('callouts avoid labels at phone widths and retain original segment identity',()=>{
 let start=0;const items=[.24,.19,.14,.10,.06,.27].map((share,i)=>{const s={i,start,share,members:i===5?[{}]:undefined};start+=share;return s;});
 for(const width of [280,320,390])for(const mode of ['donut','strip']){
  const {rows}=chartCallouts(items,width,mode,[72,60,84,60,60,98]);
  assert.equal(rows.length,6);
  for(const row of rows){
   assert.equal(row.s,items[row.i]);assert.ok(row.x>=0&&row.x+row.tw<=width);
   let x=0,y=0;
   for(const part of row.path.match(/[MHV][^MHV]+/g)){
    const a=part.slice(1).trim().split(/\s+/).map(Number);
    if(part[0]==='M'){[x,y]=a;continue;}
    const nx=part[0]==='H'?a[0]:x,ny=part[0]==='V'?a[0]:y;
    for(const label of rows)assert.ok(!(Math.max(x,nx)>=label.x&&Math.min(x,nx)<=label.x+label.tw&&Math.max(y,ny)>=label.y-12&&Math.min(y,ny)<=label.y+2),`${mode} ${width}: ${row.i} crossed label ${label.i}`);
    x=nx;y=ny;
   }
  }
 }
});
test('calendar preserves leap days, weekday offset and full weeks',()=>{
 assert.equal(run("calendarCells('2024-02').filter(Boolean).length"),29);
 assert.equal(run("calendarCells('2025-02').filter(Boolean).length"),28);
 assert.equal(run("calendarCells('2026-10')[4]"),'2026-10-01');
 assert.equal(run("calendarCells('2026-08').length"),42);
 assert.equal(run("calendarCells('2026-12').filter(Boolean).at(-1)"),'2026-12-31');
});
test('category totals subtract discounts and retain signed refunds',()=>{
 ctx.txs=[{category:'식비',amount:10000,discount:1000},{category:'식비',amount:-3000,discount:-300},{category:'취미',amount:2000},{category:'환불',amount:-5000}];
 assert.equal(run("categoryTotals(txs).find(([c])=>c==='식비')[1]"),6300);
 assert.equal(run("categoryTotals(txs).find(([c])=>c==='환불')[1]"),-5000);
 assert.equal(run("selectedTransactions(txs,new Set(['식비','취미'])).reduce((s,t)=>s+netExpense(t),0)"),8300);
 assert.equal(run('selectedTransactions(txs,new Set()).length'),4);
 assert.equal(ctx.txs.length,4);
});
test('month comparison includes both months, discounts, refunds and multi-selection',()=>{
 ctx.rows=[{date:'2026-01-01',category:'식비',amount:10000,discount:1000},{date:'2026-02-01',category:'식비',amount:18000},{date:'2026-01-03',category:'취미',amount:3000},{date:'2026-02-03',category:'카페',amount:2000},{date:'2026-02-04',category:'환불',amount:-5000}];
 assert.equal(run("comparisonData(rows,'2026-01','2026-02').rows.length"),4);
 assert.equal(run("comparisonData(rows,'2026-01','2026-02').before"),12000);
 assert.equal(run("comparisonData(rows,'2026-01','2026-02').after"),15000);
 assert.equal(run("comparisonData(rows,'2026-01','2026-02',new Set(['식비','카페'])).after"),20000);
 assert.equal(run("comparisonData(rows,'2026-01','2026-01').before===comparisonData(rows,'2026-01','2026-01').after"),true);
 assert.equal(run("comparisonData(rows,'2025-12','2026-02').hasBefore"),false);
 assert.equal(run("previousMonth('2026-01')"),'2025-12');
 assert.equal(run('changeText(10000,15000)'),'↑ 50% 증가');
 assert.equal(run('changeText(10000,0)'),'↓ 100% 감소');
 assert.equal(run('changeText(0,15000)'),'새 지출');
 assert.equal(run('changeText(-1000,15000)'),'환불 반영 · 금액 비교');
 assert.equal(run('changeText(0,0)'),'변화 없음');
 assert.equal(ctx.rows.length,5);
});
test('comparison month selection changes only intended month and freezes default baseline',()=>{
 ctx.state={month:'2026-10'};ctx.$=()=>({value:''});
 run("comparison.base=null;chooseComparisonMonth('target','2026-08')");assert.equal(ctx.state.month,'2026-08');assert.equal(run('comparison.base'),'2026-09');
 run("chooseComparisonMonth('base','2025-12')");assert.equal(ctx.state.month,'2026-08');assert.equal(run('comparison.base'),'2025-12');
 run("chooseComparisonMonth('target','2026-13')");assert.equal(ctx.state.month,'2026-08');
});
