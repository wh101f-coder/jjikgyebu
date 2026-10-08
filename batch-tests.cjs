const {test}=require('node:test'),assert=require('node:assert/strict'),B=require('./batch-core.js');
const sheet=(rows,name='내역')=>({rows,name});
test('semantic headers and cell profiles distinguish money, points, customer and currency',()=>{
 const rows=[['조회기간','2026-01-01 ~ 2026-09-30'],['국내 사용 금액 (원)','이용 고객명','사용 카드 상품','가맹점 상호','거래 발생 날짜','적립 예상 포인트','해외 이용 금액 ($)','청구 할인 금액'],[2300,'가상고객','KB국민 테스트카드','가상카페','2026-09-30',500,0,100]];
 const r=B.parseSheet(sheet(rows));assert.deepEqual(r.errors,[]);assert.equal(r.txs[0].amount,2300);assert.equal(r.txs[0].discount,100);assert.equal(r.txs[0].merchant,'가상카페');assert.equal(r.txs[0].cardLast4,'');assert.equal(r.txs[0].cardProduct,'KB국민 테스트카드');
 const shuffled=rows.map((row,i)=>i===0?row:[4,3,1,6,7,0,2,5].map(n=>row[n]));assert.deepEqual(B.parseSheet(sheet(shuffled)).txs.map(t=>[t.date,t.merchant,t.amount,t.cardId]),r.txs.map(t=>[t.date,t.merchant,t.amount,t.cardId]));
 rows[2][6]='-';assert.equal(B.parseSheet(sheet(rows)).errors.length,0);
 rows[2][6]=20;assert.match(B.parseSheet(sheet(rows)).errors.join(),/외화/);
});
test('ambiguous amount columns and numeric merchant cells are not guessed',()=>{
 assert.equal(B.parseSheet(sheet([['거래 날짜','가맹점 상호','원화 사용 금액','국내 거래 금액(원)'],['2026-01-01','가상',1000,2000]])).needsFormat,true);
 assert.equal(B.parseSheet(sheet([['거래 날짜','가맹점 상호','사용 금액'],['2026-01-01',123456,1000]])).needsFormat,true);
});
test('void authorizations are excluded only when independently matching source totals',()=>{
 const rows=[['정상/취소 (금액)','국내','5,000 / 1,000'],['이용일','이용카드명','이용하신곳','국내이용금액(원)','상태'],['2026-01-01','KB국민 가상카드','가상',5000,'전표매입'],['2026-01-02','KB국민 가상카드','가상',1000,'취소전표매입'],['2026-01-03','KB국민 가상카드','가상',2000,'승인취소']];
 const r=B.parseSheet(sheet(rows));assert.deepEqual(r.errors,[]);assert.equal(r.voidRows,1);assert.equal(r.txs.reduce((n,t)=>n+t.amount,0),4000);
 rows[0][2]='6,000 / 1,000';assert.match(B.parseSheet(sheet(rows)).errors.join(),/승인취소/);
});
test('named cards retain separate identities and numbered exports request overlap review',()=>{
 const E=require('./excel-core.js'),t={issuer:'KB국민카드',cardLast4:'',cardProduct:'가상 A',date:'2026-01-01',merchant:'가상',amount:1000,discount:0,billedAmount:null,approvalNumber:'X'};
 assert.equal(E.reconcile([t],[{...t,id:'old',cardProduct:'가상 B'}])[0].action,'new');
 assert.equal(E.reconcile([t],[{...t,id:'old',cardLast4:'1234'}])[0].action,'review');
});
test('each file detects its own columns, issuer and date context',()=>{
 const a=B.parseSheet(sheet([['조회 2025.12.01 ~ 2026.01.31'],['이용일','이용가맹점(은행)명','이용금액(원)','이용카드','취소금액(원)'],['12.31 19:00:00','가상 A',1000,'0322',0],['이용일','이용가맹점(은행)명','이용금액(원)','이용카드','취소금액(원)'],['01.01 10:00:00','가상 B',2000,'0322',1000]]));
 assert.deepEqual(a.errors,[]);assert.deepEqual(a.txs.map(t=>t.date),['2025-12-31','2026-01-01','2026-01-01']);assert.equal(a.txs.reduce((s,t)=>s+t.amount,0),2000);assert.equal(a.txs[0].issuer,'우리카드');
 const b=B.parseSheet(sheet([['업체명','카드사','카드번호','승인금액','거래일시'],['가상 C','국민카드','****1234',800,'2026-08-10 09:00:00']]));
 assert.equal(b.txs[0].issuer,'KB국민카드');assert.equal(b.txs[0].date,'2026-08-10');assert.equal(b.errors.length,0);
 const c=B.parseSheet(sheet([['현대카드'],['승인일','가맹점명','승인금액','카드번호'],[new Date(2026,3,1),'가상 D',900,'8888']]));assert.equal(c.txs[0].issuer,'현대카드');
 const d=B.parseSheet(sheet([['신한카드'],['카드번호','****-****-****-0678'],['승인일','가맹점명','승인금액'],['2026-07-02','가상 E',900]]));assert.equal(d.txs[0].cardLast4,'0678');assert.equal(d.errors.length,0);
});
test('missing year/issuer and unknown layouts are surfaced instead of guessed',()=>{
 const a=B.parseSheet(sheet([['이용일','가맹점명','이용금액','카드번호'],['01.01','가상',1000,'1234']]));assert.equal(a.txs.length,0);assert.ok(a.errors.length);
 const b=B.parseSheet(sheet([['이용일','가맹점명','이용금액','카드번호'],['2026-01-01','가상',1000,'1234']]));assert.ok(b.errors.length);
 assert.equal(B.parseSheet(sheet([['모르는','형식'],['내용',42]])).needsFormat,true);
});
test('batch overlap preserves multiplicity and detects approval duplicates across sheets',()=>{
 const base={date:'2026-01-01',issuer:'우리카드',cardLast4:'0322',merchant:'가상',amount:1000,discount:0,billedAmount:null};
 const groups=[[{...base,id:'a',approvalNumber:'111'},{...base,id:'b',approvalNumber:'222'}],[{...base,id:'c',approvalNumber:'111'},{...base,id:'d',approvalNumber:'222'}]];
 assert.deepEqual(B.reconcileSheets(groups,[]).map(t=>t.action),['new','new','skip','skip']);
 const weak=B.reconcileSheets([[{...base,id:'a'},{...base,id:'b'}],[{...base,id:'c'}]],[]);assert.deepEqual(weak.map(t=>t.action),['new','new','review']);
});
test('filter and sort preserve source indices and hidden rows',()=>{
 const entries=Array.from({length:30},(_,i)=>({i,t:{date:i<15?'2026-01-01':'2026-08-01',merchant:i%2?'A':'B',category:i%2?'취미':'식비',cardId:'우리카드:0322',amount:i*100,discount:0}}));
 const result=B.view(entries,{month:'2026-08',category:'취미',sort:'high',min:2000});assert.deepEqual(result.map(r=>r.i),[29,27,25,23,21]);assert.equal(entries.length,30);assert.equal(entries[0].i,0);
});
test('batch commit stores every month and sheet atomically in isolated memory',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),src=fs.readFileSync(__dirname+'/excel-ui.js','utf8');
 const store=new Map(),messages=[];const pending=[1,2,3,4].map(m=>({id:'test'+m,date:`2025-0${m}-05`,merchant:'가상',amount:1000,discount:0,action:'new',importFileKey:'sheet'+m}));
 const context={state:{txs:[{id:'existing',date:'2024-01-01'}],pending,month:'2025-01'},excelSession:{ready:true,keys:['sheet1','sheet2','sheet3','sheet4']},validTransaction:()=>true,localStorage:{setItem:(k,v)=>store.set(k,v)},excelHistory:()=>[],toast:m=>messages.push(m),$:()=>({classList:{add(){}}}),render(){}};
 vm.createContext(context);vm.runInContext(src.slice(src.indexOf('function commitExcel'),src.indexOf('function renderBilling')),context);vm.runInContext('commitExcel()',context);
 const saved=JSON.parse(store.get('jjig_txs'));assert.equal(saved.length,5);assert.deepEqual(saved.slice(1).map(t=>t.date.slice(0,7)),['2025-01','2025-02','2025-03','2025-04']);assert.equal(context.state.month,'2025-04');assert.equal(JSON.parse(store.get('jjig_excel_imports')).length,4);
 context.state.pending=pending;context.excelSession={ready:true,keys:[]};context.localStorage.setItem=()=>{throw Error('quota');};const before=context.state.txs;vm.runInContext('commitExcel()',context);assert.equal(context.state.txs,before);assert.equal(context.state.pending.length,4);
});
