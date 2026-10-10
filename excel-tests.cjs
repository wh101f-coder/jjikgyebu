const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('./excel-core.js');
const rows=[
 ['이용대금명세서 상세 내역'],
 ['이용\n일자','카드구분','이용카드','매출구분','이용가맹점(은행)명','이용금액\n(해외현지/\n체크카드)','할부개월','당월결제하실금액','','','',''],
 ['','','','','','','','회차','원금','혜택금액','환율','수수료'],
 ['09.07','신용/본인','0322','국내일시불','타이어',13500,0,0,10000,3500,0,0],
 ['09.25','신용/본인','0322','국내일시불','테스트상점',1000,0,0,1000,0,0,0],
 ['09.25','신용/본인','0322','국내일시불','테스트상점',1000,0,0,1000,0,0,0],
 ['','신용/본인','0322','카드소계','소계',0,0,0,12000,3500,0,0]
];
const parse=(r=rows,extra={})=>{const detected=E.detect(r);return E.parse(r,{...detected,year:2026,issuer:'우리카드',...extra});};
test('two-row Woori header: gross, discount, billed, totals excluded',()=>{
 const r=parse();assert.equal(r.errors.length,0);assert.equal(r.txs.length,3);assert.equal(r.summaryRows,1);
 assert.equal(r.txs[0].cardLast4,'0322');assert.equal(r.txs[0].discount,3500);assert.equal(r.txs[0].billedAmount,10000);
 assert.equal(r.txs.reduce((s,t)=>s+t.amount-t.discount,0),12000);
});
test('weekly cross-month data kept by use date; explicit dates override year',()=>{
 const r=parse([['이용일자','가맹점명','이용금액','카드번호'],['2025.12.31','가게',1000,322],['2026.01.03','가게',2000,9569]]);
 assert.deepEqual(r.txs.map(t=>t.date),['2025-12-31','2026-01-03']);assert.equal(r.txs[0].cardLast4,'0322');
});
test('KB-style header aliases and missing discount is unknown',()=>{
 const r=parse([['승인일','이용하신곳','승인금액(원)','카드번호','승인번호'],['2026/09/02','가게',1000,'****9569','000123']],{issuer:'KB국민카드'});
 assert.equal(r.errors.length,0);assert.equal(r.txs[0].discountKnown,false);assert.equal(r.txs[0].approvalNumber,'000123');
});
test('unrecognized schema requires mapping, bad rows are not silently dropped',()=>{
 assert.equal(E.detect([['x','y','z']]),null);
 const r=parse([...rows,['09.31','신용/본인','0322','국내일시불','가게','???']]);assert.equal(r.errors.length,1);
});
test('partial overlap preserves repeat multiplicity and requests confirmation',()=>{
 const txs=parse().txs;const old=txs.slice(0,2).map((t,i)=>({...t,id:'old'+i}));
 assert.deepEqual(E.reconcile(txs,old).map(t=>t.action),['review','review','new']);
 assert.deepEqual(E.reconcile(txs,[]).map(t=>t.action),['new','new','new']);
});
test('same suffix at different issuers is not a duplicate',()=>{
 const t=parse().txs[0];assert.equal(E.reconcile([{...t,issuer:'KB국민카드',importIdentity:undefined}],[{...t,id:'1'}])[0].action,'new');
});
test('approval duplicate skips, updated benefit needs confirmation',()=>{
 const t={...parse().txs[0],approvalNumber:'123'};const old={...t,id:'1'};
 assert.equal(E.reconcile([t],[old])[0].action,'skip');
 const change=E.reconcile([{...t,discount:4000,billedAmount:9500}],[old])[0];assert.equal(change.action,'review');assert.equal(change.matchId,'1');
});
test('refund stays separate from original charge and reverses signed benefit',()=>{
 const r=parse([rows[1],rows[2],['09.07','신용/본인','0322','취소','타이어',13500,0,0,10000,3500,0,0]]);
 assert.equal(r.errors.length,0);assert.equal(r.txs[0].amount,-13500);assert.equal(r.txs[0].discount,-3500);assert.equal(r.txs[0].billedAmount,-10000);
 assert.equal(E.reconcile(r.txs,[{...parse().txs[0],id:'1'}])[0].action,'new');
});
test('amount mismatch surfaces; installment principal is separate',()=>{
 const data=rows.map(r=>r.slice());data[3][8]=9000;assert.equal(parse(data).errors.length,1);
 data[3][6]=3;assert.equal(parse(data).errors.length,0);
});
test('date boundaries, currency strings, masked suffixes',()=>{
 assert.equal(E.date('02.29',2025),null);assert.equal(E.date('02.29',2024),'2024-02-29');
 assert.equal(E.date('20260930',2025),'2026-09-30');assert.equal(E.suffix('1234-****-****-0322'),'0322');
 assert.equal(E.money('(1,000)'),-1000);assert.equal(E.money('10달러'),null);
});
test('manual map supports unknown format and explicit billing month',()=>{
 const r=E.parse([['custom'],['가게',2000,'09.02']],{start:1,map:{merchant:0,amount:1,date:2},year:2026,issuer:'KB국민카드',defaultCard:'9569',billingMonth:'2026-10'});
 assert.equal(r.txs[0].dueDate,'2026-10-14');assert.equal(r.txs[0].dueConfirmed,true);
});
test('unknown new discount does not overwrite confirmed old benefit',()=>{
 const t=parse().txs[0],old={...t,id:'old'};
 const merged=E.reconcile([{...t,discount:0,discountKnown:false,billedAmount:null}],[old])[0];assert.equal(merged.discount,3500);
});
test('bill total with fee does not fail principal reconciliation',()=>{
 const r=parse([['이용일자','가맹점명','이용금액','카드번호','할인금액','청구금액','수수료'],['09.01','가게',1000,'0322',100,950,50]],{billedIncludesFee:true});
 assert.equal(r.errors.length,0);assert.equal(r.txs[0].billedIncludesFee,true);assert.equal(r.txs[0].billedAmount,950);
});
test('reconciliation keeps manual categories but does not overwrite new classification with unknown',()=>{
 const t={...parse().txs[0],category:'카페',approvalNumber:'category-test'};
 assert.equal(E.reconcile([t],[{...t,id:'existing',category:'미분류'}])[0].category,'카페');
 assert.equal(E.reconcile([t],[{...t,id:'existing',category:'친구모임'}])[0].category,'친구모임');
});
test('won decorations and accounting signs are accepted without joining separate values',()=>{
 for(const input of ['\\1,250',"'1,250",'1,250 (원)','1,250 (KRW)','1&nbsp;250','&#8361;1,250'])assert.equal(E.money(input),1250,input);
 for(const input of ['1,250-','(1,250원)','-₩1,250'])assert.equal(E.money(input),-1250,input);
 for(const input of ['1,000 2,000','12,34','USD 1,250','1,250 / 100','1,250.50','(-1250)','1,250\n2,000'])assert.equal(E.money(input),null,input);
});
test('merged headings expand only header cells and prefer actual numeric amount column',()=>{
 const input=[['현대카드'],['이용일','가맹점명','이용금액','','카드번호'],['2026-01-01','가상','KRW','1,250','1234'],['2026-01-02','가상','KRW','2,500','1234']];
 const normalized=E.expandHeadingMerges(input,[{s:{r:1,c:2},e:{r:1,c:3}},{s:{r:2,c:1},e:{r:2,c:2}}]);
 assert.equal(input[1][3],'');assert.equal(normalized[1][3],'이용금액');assert.equal(normalized[2][2],'KRW');
 const found=E.detect(normalized);assert.equal(found.map.amount,3);const r=E.parse(normalized,{...found,issuer:'현대카드'});assert.equal(r.errors.length,0);assert.deepEqual(r.txs.map(t=>t.amount),[1250,2500]);
});
test('failure diagnostics contain the actual offending cell safely without complete long identifiers',()=>{
 const r=parse([['이용일','가맹점명','이용금액','카드번호'],['2026-01-01','가상',1000,'1234'],['2026-01-02','가상','금액???','1234']]);
 assert.match(r.errors[0],/C3/);assert.match(r.errors[0],/금액\?\?\?/);
});
test('HTML spreadsheet closing tag whitespace is repaired before decoding and binary input preserved',()=>{
 const html='<html><meta charset="utf-8"><table><tr><td>가상업체</td   ><td>1,000</td></tr></table></html>';
 const prepared=E.prepareWorkbookInput(new TextEncoder().encode(html));assert.equal(prepared.type,'string');assert.ok(prepared.data.includes('가상업체</td><td>1,000'));
 const binary=new Uint8Array([0xd0,0xcf,0x11,0xe0]);assert.equal(E.prepareWorkbookInput(binary).data,binary);assert.equal(E.prepareWorkbookInput(binary).type,'array');
});
test('named 이용카드, spaced section subtotals, and installment rounds preserve statement data',()=>{
 const data=[['현대카드'],['이용일','이용카드','이용가맹점','이용금액','할부/회차','예상적립/할인','결제원금','수수료(이자)'],['2026년 08월 04일','본인 가상 현대카드','가상카페','1,000','',99,'1,000',0],['-','','일 시 불 소계 1 건',0,'',0,1000,0],['2026년 02월 16일','본인 가상 현대카드','가상상점','240,000','24/7',0,'10,000','500'],['-','','할 부 소계 1 건',0,'',0,10000,500],['-','','총 합계 2 건',0,'',0,11000,500]];
 const r=E.parse(data,{...E.detect(data),issuer:'현대카드'});assert.deepEqual(r.errors,[]);assert.equal(r.txs.length,2);assert.equal(r.summaryRows,3);assert.equal(r.txs[0].cardProduct,'가상 현대카드');assert.equal(r.txs[0].discountKnown,false);assert.equal(r.txs[1].installments,24);assert.equal(r.txs[1].installmentRound,7);assert.equal(r.txs[1].fee,500);assert.equal(r.txs[1].amount,240000);assert.equal(r.txs[1].billedAmount,10000);
});
