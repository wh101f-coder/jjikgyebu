const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ctx=vm.createContext({today:()=> '2026-10-06'});
vm.runInContext(fs.readFileSync(__dirname+'/dashboard.js','utf8').split("$$('[data-tab]').forEach(b=>b.onclick")[0],ctx);
const run=s=>vm.runInContext(s,ctx);
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
