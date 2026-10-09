let excelSession=null,excelBusy=false;
const excelHistory=()=>JSON.parse(localStorage.getItem('jjig_excel_imports')||'[]');
function loadExternalScript(url){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=()=>reject(Error('읽기 도구를 불러오지 못했어요. 인터넷 연결을 확인해주세요.'));document.head.append(script);});}
state.reviewView={};state.reviewPage=0;
function resetReviewView(){state.reviewView={};state.reviewPage=0;state.reviewFilters.clear();}
function resetExcelReview(){state.pending=[];resetReviewView();$('#reviewPanel').classList.add('hidden');}
function cardHints(){const groups={};for(const t of state.txs){if(t.issuer&&t.cardLast4)(groups[t.cardLast4]??=new Set()).add(t.issuer);}return Object.fromEntries(Object.entries(groups).filter(([,v])=>v.size===1).map(([k,v])=>[k,[...v][0]]));}
async function acceptExcelFiles(files){
 if(excelBusy)return;
 if(state.pending.length){toast('먼저 검토 중인 내역을 등록하거나 닫아주세요');return;}
 excelBusy=true;state.importMode='excel';resetExcelReview();
 excelSession={units:[],keys:[],ready:false};$('#excelPanel').classList.remove('hidden');$('#importPanel').classList.add('hidden');
 $('#excelInput').disabled=true;$('#cancelExcel').disabled=true;
 try{
  if(typeof XLSX==='undefined')await loadExternalScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
  const seen=new Set();
  for(const [index,file] of [...files].entries()){
   $('#excelStatus').textContent=`${index+1}/${files.length} · ${file.name} 읽는 중…`;
   try{
    if(!/\.xlsx?$/i.test(file.name))throw Error('XLS 또는 XLSX 파일을 올려주세요');
    if(file.size>20*1024*1024)throw Error('이 파일은 20MB를 넘습니다. 나눠서 올려주세요');
    const bytes=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(seen.has(hash))continue;seen.add(hash);
    // Preserve HTML-disguised XLS text and Excel numeric cells until their column
    // meaning is known. Automatic date coercion can otherwise alter non-date cells.
    const book=XLSX.read(bytes,{type:'array',cellDates:false,raw:true});
    for(const name of book.SheetNames){
     const rows=ExcelImport.expandHeadingMerges(XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:true,blankrows:true}),book.Sheets[name]['!merges']||[]);
     if(!rows.some(r=>r.some(v=>String(v).trim())))continue;
     excelSession.units.push({fileName:file.name,hash,name,rows,date1904:!!book.Workbook?.WBProps?.date1904,options:{}});
    }
   }catch(error){excelSession.units.push({fileName:file.name,name:'',failure:error.message});}
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  rebuildBatch();
 }catch(error){$('#excelStatus').textContent=error.message;}
 finally{excelBusy=false;$('#excelInput').disabled=false;$('#cancelExcel').disabled=false;$('#excelInput').value='';}
}
function rebuildBatch(){
 resetExcelReview();const groups=[],issues=[],messages=[],keys=[];
 excelSession.units.forEach((u,index)=>{
  if(u.excluded)return;
  const key=u.hash+'|'+u.name;
  if(u.hash&&(excelHistory().some(k=>k===key||k.startsWith(key+'|'))||state.txs.some(t=>t.importFileKey===key||t.importFileKey?.startsWith(key+'|')))){messages.push(u.fileName+' · 이미 등록됨');return;}
  const result=u.failure?{errors:[u.failure]}:BatchImport.parseSheet(u,{...u.options,fileName:u.fileName,cardHints:cardHints()});
  u.result=result;
  if(result.needsFormat||result.errors.length){issues.push({u,index,message:result.needsFormat?'날짜·업체명·금액 열을 찾지 못했어요. 이 형식은 확인이 필요합니다.':result.errors.slice(0,3).join(' / ')});return;}
  if(!result.txs.length){messages.push(u.fileName+' · '+u.name+' 거래 없음');return;}
  keys.push(key);groups.push(result.txs.map(t=>({...t,id:crypto.randomUUID(),importFileKey:key,category:categoryFor(t.merchant)})));
 });
 state.pending=BatchImport.reconcileSheets(groups,state.txs).map(t=>({...t,category:t.category&&t.category!=='미분류'?t.category:categoryFor(t.merchant),card:cardNames[t.cardId]||t.card}));
 excelSession.keys=keys;excelSession.ready=issues.length===0;
 const notices=[...new Set(excelSession.units.filter(u=>!u.excluded).flatMap(u=>u.result?.warnings||[]))];
 $('#excelStatus').textContent=`${excelSession.units.length}개 시트 확인 · ${state.pending.length}건 읽음 · 확인 필요 ${issues.length}개\n`+[...messages,...notices].join('\n');
 $('#excelIssues').innerHTML=issues.map(({u,index,message})=>`<div class="import-issue"><b>${escapeHtml(u.fileName)} · ${escapeHtml(u.name)}</b><p>${escapeHtml(message)}</p>${u.failure||u.result.needsFormat?'':`<div class="excel-fields"><label>카드사<select data-issuer="${index}"><option value="">파일에서 자동 확인</option>${['우리카드','KB국민카드','현대카드','신한카드','삼성카드','롯데카드','하나카드','NH농협카드','BC카드','기타카드'].map(s=>`<option ${u.options.issuer===s?'selected':''}>${s}</option>`).join('')}</select></label><label>연도가 없을 때만<input data-year="${index}" type="number" placeholder="예: 2026" value="${u.options.year||''}"></label><label>카드번호가 없을 때만<input data-card="${index}" maxlength="4" placeholder="끝 4자리" value="${escapeHtml(u.options.defaultCard||'')}"></label></div><button data-retry="${index}" class="mini-btn">이 정보로 다시 읽기</button>`}<button data-exclude="${index}" class="text-btn">이 시트 제외</button></div>`).join('');
 issues.forEach(({u,index})=>{
  const needs={issuer:u.result?.errors?.some(e=>e.includes('카드사를')),year:u.result?.errors?.some(e=>e.includes('연도')),card:u.result?.errors?.some(e=>e.includes('카드번호 또는'))};
  for(const field of ['issuer','year','card']){const input=$(`[data-${field}="${index}"]`);if(input)input.closest('label').hidden=!needs[field];}
  const retry=$(`[data-retry="${index}"]`);if(retry)retry.hidden=!Object.values(needs).some(Boolean);
 });
 $$('[data-retry]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.retry);excelSession.units[i].options={issuer:$(`[data-issuer="${i}"]`).value,year:$(`[data-year="${i}"]`).value,defaultCard:$(`[data-card="${i}"]`).value};rebuildBatch();});
 $$('[data-exclude]').forEach(b=>b.onclick=()=>{excelSession.units[Number(b.dataset.exclude)].excluded=true;rebuildBatch();});
 $('#saveReviewedBtn').disabled=!excelSession.ready;
 if(state.pending.length&&excelSession.ready){$('#reviewPanel').classList.remove('hidden');renderReview();}
}
$('#excelInput').onchange=e=>acceptExcelFiles(e.target.files);
$('#cancelExcel').onclick=()=>{resetExcelReview();excelSession=null;$('#excelPanel').classList.add('hidden');$('#saveReviewedBtn').disabled=false;};
const drop=$('#excelDrop');
['dragenter','dragover'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('dragging');}));
drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');acceptExcelFiles(e.dataTransfer.files);});
function reviewPageEntries(entries){
 const filtered=BatchImport.view(entries,state.reviewView),pages=Math.max(1,Math.ceil(filtered.length/12));
 state.reviewPage=Math.min(state.reviewPage,pages-1);
 $('#reviewPager').innerHTML=`<button class="mini-btn" id="reviewPrev" ${state.reviewPage?'':'disabled'}>이전</button><span>${state.reviewPage+1} / ${pages} · ${filtered.length}건</span><button class="mini-btn" id="reviewNext" ${state.reviewPage+1<pages?'':'disabled'}>다음</button>`;
 for(const [id,delta] of [['reviewPrev',-1],['reviewNext',1]])$('#'+id).onclick=()=>{collectReview();state.reviewPage+=delta;renderReview();$('#reviewTools').scrollIntoView({block:'start'});};
 return {entries:filtered.slice(state.reviewPage*12,state.reviewPage*12+12),total:filtered.length};
}
function renderReviewTools(){
 const opts=(field,values,label)=>`<label>${label}<select data-review-field="${field}"><option value="">전체</option>${[...new Set(values)].sort().map(v=>`<option value="${escapeHtml(v)}" ${state.reviewView[field]===v?'selected':''}>${escapeHtml(field==='status'?({new:'새 거래',skip:'제외',review:'겹침 확인 필요',update:'기존 거래 갱신'}[v]||v):v)}</option>`).join('')}</select></label>`;
 $('#reviewTools').innerHTML=`<details><summary>필터 · 정렬</summary><div class="excel-fields">${opts('month',state.pending.map(t=>t.date.slice(0,7)),'월')}${opts('category',state.pending.map(t=>t.category),'업종')}${opts('card',state.pending.map(t=>t.cardId||t.card),'카드')}<label>업체 검색<input data-review-field="query" value="${escapeHtml(state.reviewView.query||'')}"></label><label>최소 금액<input type="number" data-review-field="min" value="${state.reviewView.min||''}"></label><label>최대 금액<input type="number" data-review-field="max" value="${state.reviewView.max||''}"></label><label>정렬<select data-review-field="sort">${[['newest','최신순'],['oldest','오래된순'],['high','높은 금액순'],['low','낮은 금액순'],['frequent','자주 이용한 업체순']].map(([v,label])=>`<option value="${v}" ${(state.reviewView.sort||'newest')===v?'selected':''}>${label}</option>`).join('')}</select></label>${opts('status',state.pending.map(t=>t.action||'').filter(Boolean),'등록 처리')}</div><button id="resetView" class="mini-btn">필터 초기화</button></details><div class="month-chips">${[...new Set(state.pending.map(t=>t.date.slice(0,7)))].sort().map(m=>{const rows=state.pending.filter(t=>t.date.startsWith(m));return `<button class="mini-btn" data-review-month="${m}" aria-pressed="${state.reviewView.month===m}">${m} · ${rows.length}건<br>${fmt(rows.reduce((s,t)=>s+t.amount-t.discount,0))}</button>`;}).join('')}</div>`;
 $$('[data-review-field]').forEach(el=>el.onchange=()=>{collectReview();state.reviewView[el.dataset.reviewField]=el.value;state.reviewPage=0;renderReview();$('#reviewTools details').open=true;});
 $$('[data-review-month]').forEach(b=>b.onclick=()=>{collectReview();state.reviewView.month=state.reviewView.month===b.dataset.reviewMonth?'':b.dataset.reviewMonth;state.reviewPage=0;renderReview();});
 $('#resetView').onclick=()=>{collectReview();resetReviewView();renderReview();};
}
const savedView={sort:'newest',page:0};
function renderSavedList(txs){
 const rows=BatchImport.view(txs.map((t,i)=>({t,i})),savedView),pages=Math.max(1,Math.ceil(rows.length/12));savedView.page=Math.min(savedView.page,pages-1);
 $('#statsList').innerHTML=`<details><summary>내역 필터 · 정렬</summary><div class="excel-fields"><label>정렬<select id="savedSort">${[['newest','최신순'],['oldest','오래된순'],['high','높은 금액순'],['low','낮은 금액순'],['frequent','자주 이용한 업체순']].map(([v,n])=>`<option value="${v}" ${savedView.sort===v?'selected':''}>${n}</option>`).join('')}</select></label><label>업체 검색<input id="savedQuery" value="${escapeHtml(savedView.query||'')}"></label><label>최소 금액<input id="savedMin" type="number" value="${savedView.min||''}"></label><label>최대 금액<input id="savedMax" type="number" value="${savedView.max||''}"></label></div><button id="savedReset" class="mini-btn">조건 초기화</button></details><div class="review-pager"><button id="savedPrev" class="mini-btn" ${savedView.page?'':'disabled'}>이전</button><span>${savedView.page+1}/${pages} · ${rows.length}건</span><button id="savedNext" class="mini-btn" ${savedView.page+1<pages?'':'disabled'}>다음</button></div>`+(compactRows(rows.slice(savedView.page*12,savedView.page*12+12).map(r=>r.t))||'<p class="muted">조건에 맞는 내역이 없어요</p>');
 for(const [id,key] of [['savedSort','sort'],['savedQuery','query'],['savedMin','min'],['savedMax','max']])$('#'+id).onchange=e=>{savedView[key]=e.target.value;savedView.page=0;renderDashboard();$('#statsList details').open=true;};
 $('#savedReset').onclick=()=>{Object.assign(savedView,{sort:'newest',page:0,query:'',min:'',max:''});renderDashboard();};
 for(const [id,delta] of [['savedPrev',-1],['savedNext',1]])$('#'+id).onclick=()=>{savedView.page+=delta;renderDashboard();$('#statsList').scrollIntoView({block:'start'});};
}
