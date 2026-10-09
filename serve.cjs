const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
http.createServer((req,res)=>{
 if(req.url==='/adaptive-test'||req.url==='/adaptive-error-test'){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const units=[{fileName:'synthetic-hyundai.xls',name:'가상내역',rows:[['이용일','업체명','이용금액'],['2026-01-05','가상카페','1,250.00'],['2026-02-05','가상식당','2,500원'],['카드번호','','****0322'],['카드사: 현대카드']],options:{}}];
  if(req.url==='/adaptive-error-test')units[0].rows[2][0]='2026-02-30';
  else units.push({fileName:'synthetic.xls',name:'분리된 제목',rows:[['카드사','삼성카드'],['카드상품명','가상상품'],['승인','가맹점','이용','청구할인'],['일자','명','금액','금액'],['2026-04-01','우아한형제들',2400,400],['2026-05-01','가상상점',3000,0]],options:{}});
  const fixture='<script>excelSession={units:'+JSON.stringify(units)+',keys:[],ready:false};state.importMode="excel";rebuildBatch();document.querySelector("#excelPanel").classList.remove("hidden");switchTab("import");</script>';
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html.replace('</body>',fixture+'</body>'));
 }
 if(req.url==='/compare-test'){
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const fixture=`<script>state.month='2026-10';state.txs=[['2026-09-01','식비',10000],['2026-10-01','식비',15000],['2026-09-02','취미',20000],['2026-10-02','취미',10000],['2026-10-03','카페',4000]].map(([date,category,amount],i)=>({id:'comparison-'+i,date,category,amount,discount:0,merchant:'가상업체',card:'가상카드'}));render();switchTab('compare');</script>`;
 res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html.replace('</body>',fixture+'</body>'));
 }
 if(req.url==='/chart-test'){

  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const fixture=`<script>state.month='2026-10';state.txs=CATEGORIES.slice(1,20).map((category,i)=>({id:'chart-'+i,date:'2026-10-06',merchant:'가상업체 '+i,amount:Math.round(350000/Math.pow(i+1,1.5)),discount:0,category,card:'가상카드'}));dashboard.date='2026-10-06';render();switchTab('stats');</script>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html.replace('</body>',fixture+'</body>'));
 }
 if(req.url==='/dashboard-test'){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const fixture=`<script>state.month='2026-10';document.querySelector('#monthPicker').value=state.month;state.txs=Array.from({length:18},(_,i)=>({id:'demo-'+i,date:'2026-10-'+String(i<8?6:i+1).padStart(2,'0'),merchant:['씨유 해링턴점','지에스 더프레시 운정점','가상카페','가상놀이'][i%4],amount:[6000,23600,4800,1000][i%4],discount:i%4===1?600:0,category:['편의점','장보기','카페','취미'][i%4],issuer:'우리카드',cardLast4:'0322',card:'우리카드 0322'}));dashboard.date='2026-10-06';render();</script>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html.replace('</body>',fixture+'</body>'));
 }
 if(req.url==='/filter-test'){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const fixture=`<script>
  state.txs=[];state.importMode='excel';state.reviewFilters.clear();
  state.pending=Array.from({length:90},(_,i)=>({id:'filter-'+i,date:'2026-10-01',merchant:i<34?'가상놀이A':i<36?'가상놀이B':i<60?'씨유(CU)테스트점':'지에스 더프레시 테스트점',amount:1000,discount:0,category:i<36?'미분류':'장보기',issuer:i<60?'우리카드':'현대카드',cardLast4:i<34?'0322':i<60?'9569':'1111',card:i<60?'우리카드 '+(i<34?'0322':'9569'):'현대카드 1111',sourceType:'excel',action:'new',status:'이용'}));
  render();renderReview();switchTab('import');document.querySelector('#reviewPanel').classList.remove('hidden');
  </script>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html.replace('</body>',fixture+'</body>'));
 }
 if(req.url==='/review-test'){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const fixture=`<script>
  state.txs=[];
  state.pending=parseTransactionsFromOCR({data:{text:'우아한형제들 20,000원\\n본인 0322\\n할인 3,500원\\n플레이타임 1,000원\\n본인 9569\\n할인 150원\\n플레이타임 1,000원\\n본인 9569\\n할인 325원'}},{name:'test-fixture',lastModified:Date.now()},0).transactions;
  render();renderReview();switchTab('import');document.querySelector('#reviewPanel').classList.remove('hidden');
  </script>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html.replace('</body>',fixture+'</body>'));
 }
 const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 const f=p===root?path.join(root,'index.html'):p;
 fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(f)]||'text/plain');res.end(b);});
}).listen(4173,'127.0.0.1',()=>console.log('http://127.0.0.1:4173'));
