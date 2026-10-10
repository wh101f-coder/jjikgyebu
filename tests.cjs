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
test('merchant labels shorten known brands only and preserve source',()=>{
 assert.equal(run("displayMerchant('씨유(CU)운정해링턴점')"),'CU편의점');
 assert.equal(run("displayMerchant('지에스 더프레시 운정점')"),'GS더프레시');
 assert.equal(run("displayMerchant('GS더프레시 운정물향기점')"),'GS더프레시');
 assert.equal(run("displayMerchant('알수없는상점 강남점')"),'알수없는상점 강남점');
 run("state.pending=[{merchant:'씨유(CU)테스트점',amount:1000}];displayMerchant(state.pending[0].merchant)");
 assert.equal(run('state.pending[0].merchant'),'씨유(CU)테스트점');
});
test('review filters union and deselect to full list without losing rows',()=>{
 run("state.pending=[{merchant:'A',amount:1},{merchant:'A',amount:2},{merchant:'B',amount:3},{merchant:'C',amount:4}];state.reviewFilters.clear();toggleReviewMerchant('A')");
 assert.equal(run('visibleReviewEntries().length'),2);
 run("toggleReviewMerchant('B')");assert.equal(run('visibleReviewEntries().length'),3);
 assert.equal(run('visibleReviewEntries()[2].i'),2);
 run("toggleReviewMerchant('A')");assert.equal(run('visibleReviewEntries().length'),1);
 assert.equal(run('state.pending[0].selected'),false);
 run("toggleReviewMerchant('B')");assert.equal(run('visibleReviewEntries().length'),4);
 assert.equal(run('state.pending.reduce((sum,t)=>sum+t.amount,0)'),10);
});
test('card names use issuer plus suffix and respect user overrides',()=>{
 assert.equal(run("cardLabel({issuer:'우리카드',cardLast4:'0322',card:'우리카드 0322'})"),'우리 넥센타이어');
 assert.equal(run("cardLabel({issuer:'우리카드',cardLast4:'9569',card:'카드 9569'})"),'우리 카드의정석');
 assert.equal(run("cardLabel({issuer:'KB국민카드',cardLast4:'0322'})"),'KB 딜라이브');
 assert.equal(run("cardLabel({issuer:'현대카드',cardLast4:'0322'})"),'현대 무신사');
 assert.equal(run("cardLabel({issuer:'우리카드',cardLast4:'9535'})"),'우리카드 9535');
 run("cardNames['우리카드:0322']='내 카드'");assert.equal(run("cardLabel({issuer:'우리카드',cardLast4:'0322'})"),'내 카드');
});
test('hobby and social categories, shared brand manual classification',()=>{
 assert.equal(run("CATEGORIES.includes('취미')&&CATEGORIES.includes('친구모임')&&CATEGORIES.includes('코인노래방')"),true);
 assert.equal(run("categoryFor('코인노래방 테스트점')"),'코인노래방');
 run("rememberCategory('씨유(CU)첫번째점','친구모임')");
 assert.equal(run("categoryFor('씨유(CU)두번째점')"),'친구모임');
});
test('issuer merchant suffixes classify while ambiguous payment platforms stay unknown',()=>{
 const c=vm.createContext({localStorage:{getItem:()=>null,setItem(){}},crypto:require('node:crypto').webcrypto,Intl,Date});vm.runInContext(code,c);
 for(const [name,category] of [['컴포즈커피_1','카페'],['(주) 메가 MGC 커피 테스트점','카페'],['씨유(CU) 테스트점_2','편의점'],['후불하이패스1건','교통'],['테스트약국_3','의료'],['테스트국밥집','식비'],['다이소 테스트점','생활'],['카페24','미분류'],['네이버페이','미분류'],['플레이타임','미분류'],['알수없는법인','미분류']]){
  c.name=name;assert.equal(vm.runInContext('categoryFor(name)',c),category,name);
 }
 vm.runInContext("rememberCategory('컴포즈커피 첫지점','친구모임')",c);assert.equal(vm.runInContext("categoryFor('컴포즈커피_1')",c),'친구모임');
});
test('saved unknown categories are repaired without changing manual categories or transaction identity',()=>{
 const data=new Map();const c=vm.createContext({localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},crypto:require('node:crypto').webcrypto,Intl,Date});vm.runInContext(code,c);
 vm.runInContext("state.txs=[{id:'a',merchant:'컴포즈커피_1',amount:2300,category:'미분류',importIdentity:'original'},{id:'b',merchant:'컴포즈커피_2',amount:4000,category:'친구모임'},{id:'c',merchant:'모르는상호',amount:5000,category:'미분류'}]",c);
 assert.equal(vm.runInContext('reclassifyUnclassified()',c),1);
 const saved=JSON.parse(data.get('jjig_txs'));assert.deepEqual(saved.map(t=>t.category),['카페','친구모임','미분류']);assert.equal(saved[0].merchant,'컴포즈커피_1');assert.equal(saved[0].importIdentity,'original');assert.equal(saved[0].amount,2300);assert.equal(vm.runInContext('reclassifyUnclassified()',c),0);
});
test('bulk classification clears filters and protects unrelated rows; undo restores mapping',()=>{
 run("state.pending=[{merchant:'테스트업체A',category:'미분류',selected:true},{merchant:'테스트업체B',category:'미분류',selected:false},{merchant:'테스트업체A',category:'미분류',selected:false}];state.reviewFilters=new Set(['테스트업체A']);state.reviewView={category:'미분류'}");
 assert.equal(run("applyReviewCategory('카페')"),1);
 assert.equal(run('state.reviewFilters.size'),0);assert.equal(run('state.pending.some(t=>t.selected)'),false);
 assert.equal(run('state.pending[2].category'),'미분류');
 run("toggleReviewMerchant('테스트업체B');applyReviewCategory('배달음식')");
 assert.equal(run('state.pending[0].category'),'카페');assert.equal(run('state.pending[1].category'),'배달음식');
 assert.equal(run('undoReviewCategory()'),1);assert.equal(run('state.pending[1].category'),'미분류');
 assert.equal(run("categoryFor('테스트업체B')"),'미분류');assert.equal(run('state.pending[0].category'),'카페');
 run('reselectReviewCategory()');assert.equal(run('state.pending[1].selected'),true);assert.equal(run('state.pending[0].selected'),false);
 assert.equal(run("bulkReview.names.has('테스트업체A')"),true);
 run('state.pending=[];syncBulkReview()');assert.equal(run('bulkReview.last.length'),0);assert.equal(run('bulkReview.undo'),null);
});
test('review gives specific reasons and accepts only explicitly validated zero-amount statement discounts',()=>{
 assert.match(run("reviewProblem({amount:0,discount:0})"),/0원/);
 assert.match(run("reviewProblem({amount:1000,discount:2000})"),/보다 커/);
 assert.match(run("reviewProblem({amount:1000,discount:0,action:'review'})"),/중복/);
 assert.equal(run("validTransaction({sourceType:'excel',adjustmentKind:'statementDiscount',amount:0,discount:1500,billedAmount:-1500})"),true);
 assert.equal(run("validTransaction({amount:0,discount:1500})"),false);
 assert.equal(run("reviewProblem({action:'skip',amount:0})"),'');
});
