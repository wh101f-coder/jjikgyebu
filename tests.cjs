const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(__dirname+'/app.js','utf8').split("$('#imageInput').addEventListener")[0];
const storage=new Map();
const context=vm.createContext({localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},crypto:require('node:crypto').webcrypto,console,Intl,Date});
vm.runInContext(code,context);
const run=s=>vm.runInContext(s,context);
const parse=text=>{context.sample=text;return run("parseTransactionsFromOCR({data:{text:sample}},{name:'test',lastModified:new Date('2026-10-04').getTime()},0).transactions")};
test('only explicit payment amounts accepted',()=>{
 for(const text of ['본인 0322','본인 9569','신용 일시불','1,000','할인 150원','총 사용금액 10,000원','1,000원 2,000원']) {context.input=text;assert.equal(run('amountFrom(input)'),null,text);}
 assert.equal(run("amountFrom('1,000원')"),1000);
});
test('cards and discounts belong to their payment, zero prefix retained',()=>{
 const tx=parse('10.03\n우아한형제들 20,000원\n본인 0322 신용 일시불\n할인 3,500원\n지에스차지비 30,000원\n본인 9569\n할인 14,500원');
 assert.equal(tx.length,2);assert.equal(tx[0].cardLast4,'0322');assert.equal(tx[1].cardLast4,'9569');
 assert.equal(tx[0].discount,3500);assert.equal(tx[1].discount,14500);
 assert.equal(tx[0].category,'배달음식');assert.equal(tx[1].category,'전기차 충전');
});
test('small repeated charges and missing metadata remain separate',()=>{
 const tx=parse('플레이타임 1,000원\n본인 0322\n할인 150원\n플레이타임 1,000원\n본인 9569\n할인 325원\n플레이타임 1,000원');
 assert.equal(tx.length,3);assert.equal(tx[2].cardLast4,'');assert.equal(tx[2].discount,0);assert.equal(tx[0].category,'미분류');
 context.shots=[tx,tx];assert.equal(run('dedupeConsecutive([ [shots[0][2]], [shots[0][2]] ]).merged.length'),2);
});
test('coordinate metadata and nested OCR blocks',()=>{
 const line=(text,x0,y0,x1)=>({text,bbox:{x0,y0,x1,y1:y0+20},confidence:92});
 context.ocr={data:{imageSize:{width:945},blocks:[{paragraphs:[{lines:[line('우아한형제들',150,100,500),line('20,000원',750,100,920),line('본인 0322',150,132,400),line('할인 3,500원',730,132,920),line('플레이타임',150,210,500),line('1,000원',750,210,920),line('본인 9569',150,242,400),line('할인 325원',730,242,920)]}]}]}};
 const tx=run("parseTransactionsFromOCR(ocr,{name:'coords'},0).transactions");
 assert.equal(tx.length,2);assert.equal(tx[0].merchant,'우아한형제들');assert.equal(tx[0].discount,3500);assert.equal(tx[1].cardLast4,'9569');
});
test('month totals include legacy transactions with no discount',()=>{
 context.txs=[{date:'2026-10-03',amount:20000,discount:3500},{date:'2026-10-04',amount:1000},{date:'2026-09-01',amount:99999,discount:100}];
 assert.equal(JSON.stringify(run("monthlyTotals(txs,'2026-10')")),JSON.stringify({gross:21000,discount:3500,net:17500}));
});
test('manual mappings persist and override automatic rules',()=>{
 run("rememberCategory('플레이타임','취미')");assert.equal(run("categoryFor('플레이타임')"),'취미');assert.ok(storage.get('jjig_merchant_mappings').includes('플레이타임'));
 run("rememberCategory('(주) 우아한형제들','생활')");assert.equal(run("categoryFor('우아한형제들')"),'생활');
});
test('invalid or ambiguous discounts require review and do not become payments',()=>{
 const tx=parse('업체 1,000원\n할인 3,500원');assert.equal(tx.length,1);assert.equal(tx[0].discount,0);assert.equal(tx[0].discountNeedsReview,true);
 assert.equal(run('validTransaction({amount:1000,discount:1001})'),false);assert.equal(run('validTransaction({amount:1000,discount:-1})'),false);
});
test('version and cache version remain synchronized',()=>{
 const version=run('APP_VERSION');assert.ok(fs.readFileSync(__dirname+'/sw.js','utf8').includes('v'+version));assert.ok(fs.readFileSync(__dirname+'/index.html','utf8').includes('v'+version));
});
