
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const fmt = n => new Intl.NumberFormat('ko-KR').format(Math.round(Number(n)||0)) + '원';
const iso = d => {
  const z = new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return z.toISOString().slice(0,10);
};
const today = () => iso(new Date());

let state = {
  txs: JSON.parse(localStorage.getItem('jjig_txs')||'[]'),
  files: [],
  pending: [],
  editingId: null,
  ocrText: []
};

const issuerKeywords = [
  ['현대카드','현대카드'],['신한카드','신한카드'],['삼성카드','삼성카드'],
  ['KB국민','KB국민카드'],['국민카드','KB국민카드'],['롯데카드','롯데카드'],
  ['우리카드','우리카드'],['하나카드','하나카드'],['NH농협','NH농협카드'],
  ['BC카드','BC카드'],['카카오뱅크','카카오뱅크'],['토스','토스']
];

function save(){ localStorage.setItem('jjig_txs', JSON.stringify(state.txs)); render(); }
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1800);
}

function categoryFor(name=''){
  const s=name.toLowerCase();
  const rules=[
    ['카페',['스타벅스','투썸','메가커피','컴포즈','커피','cafe','카페','빽다방','이디야']],
    ['편의점',['gs25','cu','세븐일레븐','이마트24','편의점']],
    ['식비',['식당','분식','치킨','피자','버거','김밥','국밥','고기','곱창','포차','족발','보쌈','배달','요기요','배민','쿠팡이츠','맥도날드','버거킹','맘스터치']],
    ['교통',['택시','카카오t','버스','지하철','코레일','srt','주유','충전소','하이패스']],
    ['쇼핑',['쿠팡','네이버페이','무신사','올리브영','다이소','마트','백화점','쇼핑']],
    ['취미',['인형뽑기','코인노래방','노래방','pc방','영화','cgv','롯데시네마','메가박스','게임','스팀']],
    ['의료',['병원','약국','의원','치과']],
    ['교육',['학원','교보문고','yes24','알라딘','문고']]
  ];
  for(const [cat, words] of rules) if(words.some(w=>s.includes(w.toLowerCase()))) return cat;
  return '기타';
}

function normalizeMerchant(s=''){
  return s
    .replace(/\s+/g,' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu,'')
    .replace(/\(주\)|주식회사|유한회사/gi,'')
    .trim();
}

function parseDate(text, fallbackDate){
  const y = new Date(fallbackDate||Date.now()).getFullYear();
  let m;
  if((m=text.match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/))) {
    return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  }
  if((m=text.match(/(?:^|\s)(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?(?:\s|$)/))) {
    return `${y}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  }
  return iso(new Date(fallbackDate||Date.now()));
}

function amountFrom(text){
  const clean=text.replace(/[₩￦]/g,'').replace(/\s+/g,' ');
  const matches=[...clean.matchAll(/(?:^|[^\d])(\d{1,3}(?:,\d{3})+|\d{3,7})\s*원?(?!\d)/g)];
  if(!matches.length) return null;
  const vals=matches.map(m=>Number(m[1].replace(/,/g,''))).filter(v=>v>0 && v<100000000);
  if(!vals.length) return null;
  // Card rows usually have the payment amount as the last amount-like token.
  return vals[vals.length-1];
}

function isNoise(line=''){
  const s=line.trim();
  if(!s) return true;
  const noise=['승인','일시불','할부','이용내역','결제예정','결제일','검색','전체','국내','해외','승인내역','카드이용','원'];
  if(noise.some(n=>s===n)) return true;
  if(/^\d{1,2}:\d{2}$/.test(s)) return true;
  return false;
}

function inferCard(text){
  for(const [k,v] of issuerKeywords) if(text.includes(k)) return v;
  return '';
}

function parseTransactionsFromOCR(result, file, shotIndex){
  const rawText=result?.data?.text||'';
  const card=inferCard(rawText);
  const lines=(result?.data?.lines||[])
    .map(l=>({text:(l.text||'').trim(), bbox:l.bbox||null, conf:l.confidence||0}))
    .filter(l=>l.text);

  // Tesseract v5 can omit data.lines in some builds; fallback to plain lines.
  const usable=lines.length ? lines : rawText.split(/\n+/).map((text,i)=>({text:text.trim(),bbox:null,conf:50,i})).filter(x=>x.text);
  const out=[];
  let currentDate=parseDate('', file.lastModified||Date.now());

  for(let i=0;i<usable.length;i++){
    const line=usable[i];
    const d=parseDate(line.text, file.lastModified||Date.now());
    if(/\d{1,2}[.\-/월]\s*\d{1,2}/.test(line.text) || /20\d{2}/.test(line.text)) currentDate=d;

    const amount=amountFrom(line.text);
    if(!amount) continue;

    // Find the closest plausible merchant line above; if same line contains text, use it first.
    let same=line.text
      .replace(/[₩￦]?\s*\d{1,3}(?:,\d{3})+\s*원?/g,' ')
      .replace(/[₩￦]?\s*\d{3,7}\s*원/g,' ')
      .replace(/20\d{2}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}일?/g,' ')
      .replace(/\d{1,2}[.\-/월]\s*\d{1,2}일?/g,' ')
      .trim();

    let merchant=normalizeMerchant(same);
    if(merchant.length<2 || isNoise(merchant)){
      merchant='';
      for(let j=i-1;j>=Math.max(0,i-4);j--){
        const t=normalizeMerchant(usable[j].text);
        if(!t || isNoise(t)) continue;
        if(amountFrom(t)) continue;
        if(/^\d{1,2}[.\-/]\d{1,2}/.test(t)) continue;
        if(/승인|일시불|할부|카드|결제|이용/.test(t) && t.length<12) continue;
        merchant=t; break;
      }
    }
    if(!merchant) merchant='업체명 확인 필요';

    out.push({
      id: crypto.randomUUID(),
      date: currentDate,
      merchant,
      amount,
      category: categoryFor(merchant),
      card,
      shotIndex,
      y: line.bbox ? (line.bbox.y0 + line.bbox.y1)/2 : i,
      confidence: Math.round(line.conf||50),
      sourceName:file.name
    });
  }
  return {transactions:out, rawText, card};
}

function signature(t){
  return `${t.date}|${t.merchant.replace(/\s/g,'').toLowerCase()}|${t.amount}`;
}

// Conservative overlap de-duplication:
// only consecutive screenshots, only suffix-prefix pattern, and only when the matched
// window contains at least two distinct signatures. This protects repeated 1,000-won charges.
function dedupeConsecutive(shots){
  let merged=[];
  let removed=0;
  shots.forEach((arr,idx)=>{
    if(idx===0){ merged.push(...arr); return; }
    const prev=shots[idx-1];
    let best=0;
    const max=Math.min(12,prev.length,arr.length);
    for(let k=max;k>=1;k--){
      const a=prev.slice(prev.length-k).map(signature);
      const b=arr.slice(0,k).map(signature);
      if(a.every((x,i)=>x===b[i])){
        const distinct=new Set(a).size;
        // one exact repeated row is too risky; identical-run overlaps are too risky.
        if((k>=2 && distinct>=2) || (k>=3 && distinct>=2)){ best=k; break; }
      }
    }
    if(best){ removed+=best; merged.push(...arr.slice(best)); }
    else merged.push(...arr);
  });
  return {merged,removed};
}

async function runOCR(){
  if(!state.files.length) return;
  $('#analyzeBtn').disabled=true;
  $('#ocrPreview').textContent='';
  $('#progressBar').style.width='2%';
  $('#progressText').textContent='OCR 엔진 준비 중…';

  let worker;
  try{
    worker=await Tesseract.createWorker(['kor','eng'], 1, {
      logger:m=>{
        if(m.status==='recognizing text'){
          const p=Math.round((m.progress||0)*100);
          $('#progressText').textContent=`문자 읽는 중… ${p}%`;
        }
      }
    });
    const shots=[];
    state.ocrText=[];
    for(let i=0;i<state.files.length;i++){
      const file=state.files[i];
      $('#progressText').textContent=`${i+1}/${state.files.length}장 분석 중 · ${file.name}`;
      const r=await worker.recognize(file);
      const parsed=parseTransactionsFromOCR(r,file,i);
      shots.push(parsed.transactions);
      state.ocrText.push(parsed.rawText);
      $('#ocrPreview').textContent += `\n\n━━ ${i+1}번째 스샷 ━━\n${parsed.rawText.slice(0,1800)}`;
      $('#progressBar').style.width=`${Math.round(((i+1)/state.files.length)*100)}%`;
    }
    await worker.terminate();

    const d=dedupeConsecutive(shots);
    state.pending=d.merged;
    renderReview(d.removed);
    $('#reviewPanel').classList.remove('hidden');
    $('#progressText').textContent=`완료 · ${state.pending.length}건 발견`;
    toast(`신규 후보 ${state.pending.length}건`);
  }catch(err){
    console.error(err);
    $('#progressText').textContent='분석에 실패했습니다';
    toast('OCR 분석 실패 · 인터넷 연결을 확인해주세요');
    try{ if(worker) await worker.terminate(); }catch(e){}
  }finally{
    $('#analyzeBtn').disabled=false;
  }
}

function renderReview(removed=0){
  $('#reviewCount').textContent=`${state.pending.length}건`;
  const total=state.pending.reduce((s,t)=>s+t.amount,0);
  $('#reviewStats').innerHTML=`
    <div class="stat"><strong>${state.pending.length}</strong><span>발견 거래</span></div>
    <div class="stat"><strong>${removed}</strong><span>겹침 제외</span></div>
    <div class="stat"><strong>${fmt(total)}</strong><span>합계</span></div>
  `;
  $('#reviewList').innerHTML=state.pending.map((t,i)=>`
    <div class="review-item" data-i="${i}">
      <div>
        <input class="rv-merchant" value="${escapeHtml(t.merchant)}" />
        <div class="review-meta">
          <span class="chip">${t.date}</span>
          <span class="chip">${escapeHtml(t.card||'카드 미확인')}</span>
          <span class="chip">OCR ${t.confidence}%</span>
        </div>
      </div>
      <div style="text-align:right">
        <input class="rv-amount" type="number" value="${t.amount}" style="text-align:right;font-weight:850;max-width:120px" />
        <select class="rv-category" style="border:0;background:#f0f0ec;border-radius:8px;padding:4px;margin-top:4px">
          ${['식비','카페','편의점','교통','쇼핑','취미','생활','의료','교육','기타'].map(c=>`<option ${c===t.category?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
  `).join('');
}

function collectReview(){
  $$('.review-item').forEach(el=>{
    const i=Number(el.dataset.i);
    state.pending[i].merchant=el.querySelector('.rv-merchant').value.trim()||'업체명 확인 필요';
    state.pending[i].amount=Number(el.querySelector('.rv-amount').value)||0;
    state.pending[i].category=el.querySelector('.rv-category').value;
  });
}

function groupCurrentMonth(){
  const now=new Date();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const txs=state.txs.filter(t=>t.date.startsWith(ym)).sort((a,b)=>b.date.localeCompare(a.date));
  const days={};
  txs.forEach(t=>{
    days[t.date]??=[];
    days[t.date].push(t);
  });
  return days;
}

function render(){
  const now=new Date();
  $('#monthLabel').textContent=`${now.getFullYear()}년 ${now.getMonth()+1}월 지출`;
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
  const pym=`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;

  const cur=state.txs.filter(t=>t.date.startsWith(ym)).reduce((s,t)=>s+t.amount,0);
  const pre=state.txs.filter(t=>t.date.startsWith(pym)).reduce((s,t)=>s+t.amount,0);
  $('#monthTotal').textContent='₩'+new Intl.NumberFormat('ko-KR').format(cur);
  if(pre>0){
    const diff=cur-pre, pct=Math.round(Math.abs(diff)/pre*100);
    $('#monthDelta').textContent=`지난달보다 ${pct}% ${diff>=0?'↑':'↓'}`;
  }else $('#monthDelta').textContent='지난달 비교 준비중';

  const days=groupCurrentMonth();
  const has=Object.keys(days).length>0;
  $('#emptyState').style.display=has?'none':'flex';
  $('#groupedList').innerHTML=Object.entries(days).map(([date,txs])=>{
    const groups={};
    txs.forEach(t=>{
      const k=`${t.merchant}|${t.category}`;
      groups[k]??=[]; groups[k].push(t);
    });
    const dayTotal=txs.reduce((s,t)=>s+t.amount,0);
    return `<div class="day-block">
      <div class="day-head"><span>${date.slice(5).replace('-','/')}</span><span>${fmt(dayTotal)}</span></div>
      ${Object.values(groups).map(g=>{
        const total=g.reduce((s,t)=>s+t.amount,0), first=g[0];
        return `<div class="tx-row" data-ids="${g.map(x=>x.id).join(',')}">
          <div>
            <div class="tx-title">${escapeHtml(first.merchant)}</div>
            <div class="tx-sub">${first.category}${first.card?' · '+escapeHtml(first.card):''}</div>
          </div>
          <div>
            <div class="tx-amount">${fmt(total)}</div>
            ${g.length>1?`<div class="tx-count">${g.length}건 묶음 ›</div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  $$('.tx-row').forEach(row=>row.addEventListener('click',()=>openDetails(row.dataset.ids.split(','))));
  renderCoach(cur,pre,ym);
}

function renderCoach(cur,pre,ym){
  const monthly=state.txs.filter(t=>t.date.startsWith(ym));
  const cat={}; monthly.forEach(t=>cat[t.category]=(cat[t.category]||0)+t.amount);
  const top=Object.entries(cat).sort((a,b)=>b[1]-a[1])[0];
  let msg='스크린샷을 몇 번만 등록하면 소비 패턴을 비교해드릴게요.';
  if(monthly.length>=3 && top){
    msg=`이번 달은 <b>${top[0]}</b> 지출이 가장 커요. ${fmt(top[1])}을 사용했습니다.`;
    if(pre>0 && cur>pre) msg+=` 현재 지난달 총지출보다 ${fmt(cur-pre)} 많습니다.`;
  }
  $('#coachCard').innerHTML=`
    <strong>${monthly.length ? '지출 흐름을 보고 있어요' : '데이터가 쌓이면 바로 분석해요'}</strong>
    <p>${msg}</p>
    <div class="coach-grid">
      <div class="coach-mini"><span>이번 달 거래</span><b>${monthly.length}건</b></div>
      <div class="coach-mini"><span>가장 큰 카테고리</span><b>${top?top[0]:'-'}</b></div>
    </div>
  `;
}

function openDetails(ids){
  const arr=ids.map(id=>state.txs.find(t=>t.id===id)).filter(Boolean);
  if(!arr.length){ $('#detailsDialog').close(); return; }
  const total=arr.reduce((s,t)=>s+t.amount,0);
  $('#detailsTitle').textContent=`${arr[0].merchant} · ${fmt(total)}`;
  $('#detailsList').innerHTML=arr.map(t=>`
    <div class="detail-row">
      <div>
        <b>${fmt(t.amount)}</b>
        <div class="tx-sub">${t.date} · ${t.category}${t.card?' · '+escapeHtml(t.card):''}</div>
      </div>
      <div class="detail-actions">
        <button class="mini-btn edit-one" data-id="${t.id}">수정</button>
        <button class="mini-btn danger delete-one" data-id="${t.id}">삭제</button>
      </div>
    </div>
  `).join('');
  if(!$('#detailsDialog').open) $('#detailsDialog').showModal();
  $$('.edit-one').forEach(b=>b.onclick=()=>{ $('#detailsDialog').close(); openEdit(b.dataset.id); });
  $$('.delete-one').forEach(b=>b.onclick=()=>{
    state.txs=state.txs.filter(t=>t.id!==b.dataset.id); save(); openDetails(ids.filter(x=>x!==b.dataset.id)); toast('삭제했어요');
  });
}

function openEdit(id=null){
  state.editingId=id;
  const t=id?state.txs.find(x=>x.id===id):null;
  $('#dialogTitle').textContent=t?'지출 수정':'직접 등록';
  $('#editDate').value=t?.date||today();
  $('#editMerchant').value=t?.merchant||'';
  $('#editAmount').value=t?.amount||'';
  $('#editCategory').value=t?.category||'기타';
  $('#editCard').value=t?.card||'';
  $('#editDialog').showModal();
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

$('#imageInput').addEventListener('change', e=>{
  state.files=Array.from(e.target.files||[]).sort((a,b)=>(a.lastModified||0)-(b.lastModified||0));
  if(!state.files.length) return;
  $('#importPanel').classList.remove('hidden');
  $('#reviewPanel').classList.add('hidden');
  $('#fileSummary').textContent=`${state.files.length}장 선택됨 · 촬영시간 순서로 분석`;
  $('#ocrPreview').textContent='';
  $('#progressBar').style.width='0%';
  $('#progressText').textContent='분석 준비 완료';
});

$('#analyzeBtn').onclick=runOCR;
$('#cancelImportBtn').onclick=()=>{
  state.files=[]; state.pending=[];
  $('#imageInput').value='';
  $('#importPanel').classList.add('hidden');
  $('#reviewPanel').classList.add('hidden');
};
$('#saveReviewedBtn').onclick=()=>{
  collectReview();
  const clean=state.pending.filter(t=>t.amount>0);
  state.txs.push(...clean);
  save();
  state.pending=[]; state.files=[];
  $('#imageInput').value='';
  $('#importPanel').classList.add('hidden');
  $('#reviewPanel').classList.add('hidden');
  toast(`${clean.length}건 등록 완료`);
};
$('#manualAddBtn').onclick=()=>openEdit();
$('#saveEditBtn').onclick=()=>{
  if(!$('#editForm').reportValidity()) return;
  if(Number($('#editAmount').value)<=0){ toast('금액은 0원보다 커야 합니다'); return; }
  const t={
    id:state.editingId||crypto.randomUUID(),
    date:$('#editDate').value||today(),
    merchant:$('#editMerchant').value.trim()||'미입력',
    amount:Number($('#editAmount').value)||0,
    category:$('#editCategory').value,
    card:$('#editCard').value.trim(),
    sourceName:'manual',confidence:100
  };
  if(state.editingId){
    state.txs=state.txs.map(x=>x.id===state.editingId?t:x);
  }else state.txs.push(t);
  $('#editDialog').close(); save(); toast('저장했어요');
};
$('#detailsClose').onclick=()=>$('#detailsDialog').close();

$('#settingsBtn').onclick=()=>{
  const ok=confirm('프로토타입 데이터 전체를 삭제할까요?\n\n취소를 누르면 아무것도 지워지지 않습니다.');
  if(ok){ state.txs=[]; save(); toast('전체 삭제 완료'); }
};

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
}
render();
