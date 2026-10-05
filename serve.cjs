const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
http.createServer((req,res)=>{
 if(req.url==='/filter-test'){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const fixture=`<script>
  state.txs=[];state.importMode='excel';state.reviewFilters.clear();
  state.pending=Array.from({length:90},(_,i)=>({id:'filter-'+i,date:'2026-10-01',merchant:i<34?'가상놀이A':i<36?'가상놀이B':i<60?'씨유(CU)테스트점':'지에스 더프레시 테스트점',amount:1000,discount:0,category:i<36?'미분류':'장보기',issuer:i<60?'우리카드':'현대카드',cardLast4:i<34?'0322':i<60?'9569':'1111',card:i<60?'우리카드 '+(i<34?'0322':'9569'):'현대카드 1111',sourceType:'excel',action:'new',status:'이용'}));
  render();renderReview();document.querySelector('#reviewPanel').classList.remove('hidden');
  </script>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html.replace('</body>',fixture+'</body>'));
 }
 if(req.url==='/review-test'){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const fixture=`<script>
  state.txs=[];
  state.pending=parseTransactionsFromOCR({data:{text:'우아한형제들 20,000원\\n본인 0322\\n할인 3,500원\\n플레이타임 1,000원\\n본인 9569\\n할인 150원\\n플레이타임 1,000원\\n본인 9569\\n할인 325원'}},{name:'test-fixture',lastModified:Date.now()},0).transactions;
  render();renderReview();document.querySelector('#reviewPanel').classList.remove('hidden');
  </script>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html.replace('</body>',fixture+'</body>'));
 }
 const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 const f=p===root?path.join(root,'index.html'):p;
 fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(f)]||'text/plain');res.end(b);});
}).listen(4173,'127.0.0.1',()=>console.log('http://127.0.0.1:4173'));
