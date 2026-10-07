const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ctx=vm.createContext({today:()=> '2026-10-06'});
vm.runInContext(fs.readFileSync(__dirname+'/dashboard.js','utf8').split("$$('[data-tab]').forEach(b=>b.onclick")[0],ctx);
const run=s=>vm.runInContext(s,ctx);
const {chartCallouts}=require('./chart-callouts.js');
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
