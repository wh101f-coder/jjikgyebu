
const APP_VERSION = '1.0.7';
const CATEGORIES = ['미분류','취미','친구모임','코인노래방','인형뽑기','배달음식','전기차 충전','자동차·타이어','장보기','빵·간식','통신','구독','관리비','세금','보험','식비','카페','편의점','교통','쇼핑','생활','의료','교육','기타'];
const merchantMappings = JSON.parse(localStorage.getItem('jjig_merchant_mappings')||'{}');
const cardNames = JSON.parse(localStorage.getItem('jjig_card_names')||'{}');
const merchantKey = name => normalizeMerchant(name).replace(/\s/g,'').toLowerCase();
function rememberCategory(name, category){
  if(category==='미분류' || !name || name==='업체명 확인 필요') return;
  merchantMappings[merchantKey(name)]=category;
  merchantMappings[merchantKey(displayMerchant(name))]=category;
  localStorage.setItem('jjig_merchant_mappings',JSON.stringify(merchantMappings));
}
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
  ocrText: [],
  month: today().slice(0,7),
  overlapRemoved: 0,
  importMode: 'ocr',
  reviewFilters: new Set()
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
  const key=merchantKey(name);
  if(Object.hasOwn(merchantMappings,key)) return merchantMappings[key];
  const brandKey=merchantKey(displayMerchant(name));
  if(Object.hasOwn(merchantMappings,brandKey))return merchantMappings[brandKey];
  const rules=[
    ['코인노래방',/코인노래|코인뮤직|^코노(?:$|[^a-z])/],
    ['인형뽑기',/인형뽑기/],
    ['배달음식',/우아한형제들|배민페이/],
    ['전기차 충전',/전기차충전|지에스차지비/],
    ['자동차·타이어',/넥센타이어/],
    ['장보기',/^(gs|지에스)더프레시/],
    ['빵·간식',/파리바게뜨|한국야쿠르트/],
    ['교통',/쏘카|^교통-(버스|지하철)/],
    ['통신',/^kt통신요금|딜라이브/],
    ['관리비',/^아파트관리비/],
    ['세금',/재산세/],
    ['보험',/^현대해상/],
    ['의료',/약국$/],
    ['구독',/^chatgpt/],
    ['취미',/^짱오락실/],
    ['카페',/커피빈코리아/],
    ['배달음식',/^(우아한형제들|배달의민족|배민|쿠팡이츠|요기요)$/],
    ['전기차 충전',/^(지에스차지비|차지비|gs차지비)$/],
    ['카페',/^(스타벅스|투썸플레이스|메가커피|컴포즈커피|빽다방|이디야)/],
    ['편의점',/^(gs25|씨유|cu(?=$|[^a-z])|세븐일레븐|이마트24)/],
    ['취미',/^(cgv|롯데시네마|메가박스)/]
  ];
  for(const [cat, pattern] of rules) if(pattern.test(key)) return cat;
  return '미분류';
}

function normalizeMerchant(s=''){
  return s
    .replace(/\(주\)|㈜|주식회사|유한회사/gi,'')
    .replace(/\s+/g,' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu,'')
    .replace(/\(주\)|주식회사|유한회사/gi,'')
    .trim();
}

// Presentation only: retain original merchant text and importIdentity for reconciliation.
function displayMerchant(name=''){
  const key=merchantKey(name);
  const brands=[
    [/^(씨유|cu(?=$|[^a-z]))/,'CU편의점'],
    [/^(gs|지에스)더프레시/,'GS더프레시'],
    [/^(gs25|지에스25)/,'GS25편의점'],
    [/^세븐일레븐/,'세븐일레븐'],[/^이마트24/,'이마트24'],
    [/^스타벅스/,'스타벅스'],[/^커피빈(?:코리아)?/,'커피빈'],
    [/^이디야/,'이디야커피'],[/^파리바게뜨/,'파리바게뜨'],
    [/^우아한형제들/,'배달의민족']
  ];
  return brands.find(([pattern])=>pattern.test(key))?.[1]||name;
}
function cardLabel(t){
  const key=t.issuer?`${t.issuer}:${t.cardLast4}`:t.cardLast4;
  const generic=value=>!value||value===`카드 ${t.cardLast4}`||value===`${t.issuer} ${t.cardLast4}`;
  if(cardNames[key]&&!generic(cardNames[key]))return cardNames[key];
  if(t.card&&!generic(t.card))return t.card;
  if(t.issuer==='우리카드'&&t.cardLast4==='0322')return '우리 넥센타이어';
  if(t.issuer==='우리카드'&&t.cardLast4==='9569')return '우리 카드의정석';
  if(t.issuer==='KB국민카드')return 'KB 딜라이브';
  if(t.issuer==='현대카드')return '현대 무신사';
  return t.card||`${t.issuer||'카드'} ${t.cardLast4||''}`.trim();
}
function visibleReviewEntries(){
  return state.pending.map((t,i)=>({t,i})).filter(({t})=>!state.reviewFilters.size||state.reviewFilters.has(displayMerchant(t.merchant)));
}
function toggleReviewMerchant(name){
  if(state.reviewFilters.has(name))state.reviewFilters.delete(name);else state.reviewFilters.add(name);
  state.pending.forEach(t=>t.selected=state.reviewFilters.has(displayMerchant(t.merchant)));
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

// Amounts must end in the actual Korean currency unit. Never accept bare digits.
function amountFrom(text){
  if(/할인|취소|합계|총액|총\s*(이용|사용|결제)|결제예정/.test(text)) return null;
  const matches=[...String(text).matchAll(/(?:^|[^\d,])(\d{1,3}(?:,\d{3})+|\d+)\s*원(?![가-힣])/g)];
  if(matches.length!==1) return null;
  const value=Number(matches[0][1].replace(/,/g,''));
  return Number.isSafeInteger(value) && value>0 && value<100000000 ? value : null;
}

function isNoise(line=''){
  const s=line.trim();
  return !s || /본인|가족|신용|체크|일시불|할부|분할납부|이용내역|결제예정|결제일|최신순|고액순|상세이용|접기/.test(s)
    || /^총\s*\d+건/.test(s) || /^\d{1,2}:\d{2}$/.test(s)
    || /^\d{1,2}월\s*\d{1,2}일$/.test(s) || s==='원';
}

function inferCard(text){
  for(const [k,v] of issuerKeywords) if(text.includes(k)) return v;
  return '';
}

function parseTransactionsFromOCR(result, file, shotIndex, inheritedDate){
  const rawText=result?.data?.text||'';
  const data=result?.data||{};
  const nested=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
  const lines=(data.lines?.length ? data.lines : nested)
    .map(l=>({text:(l.text||'').trim(),bbox:l.bbox||null,conf:l.confidence||0,words:l.words||[]})).filter(l=>l.text);
  const usable=lines.length ? lines : rawText.split(/\n+/).map(text=>({text:text.trim(),bbox:null,conf:50,words:[]})).filter(x=>x.text);
  const width=data.imageSize?.width || Math.max(0,...usable.map(l=>l.bbox?.x1||0));
  const out=[];
  let currentDate=inheritedDate||parseDate('',file.lastModified||Date.now());
  for(let i=0;i<usable.length;i++){
    const line=usable[i];
    // Dates are headings, never merchant digits, card numbers, or payment metadata.
    if(/^(?:20\d{2}[.\-/년]\s*)?\d{1,2}[.\-/월]\s*\d{1,2}(?:일)?\s*$/.test(line.text)) {
      currentDate=parseDate(line.text,file.lastModified||Date.now()); continue;
    }
    if(/할인|취소|합계|총액|결제예정/.test(line.text)) continue;
    if(isNoise(line.text) && !/원/.test(line.text)) continue;
    const paymentText=line.text.replace(/(?:본인|가족)\s*\d{4}/g,'').replace(/신용|체크|일시불|할부/g,'');
    const amount=amountFrom(paymentText);
    if(amount===null) continue;
    const moneyWords=line.words.filter(w=>/원/.test(w.text||''));
    const moneyBox=moneyWords.at(-1)?.bbox || line.bbox;
    if(moneyBox && width && moneyBox.x1<width*0.70) continue;
    let merchant='';
    if(line.words.length && width){
      merchant=line.words.filter(w=>w.bbox && !/원|본인|가족|신용|체크|일시불/.test(w.text) && !/^\d{4}$/.test(w.text) && w.bbox.x0>=width*0.14 && w.bbox.x1<width*0.74)
        .map(w=>w.text).join(' ');
    }else {
      merchant=paymentText.replace(/(?:\d{1,3}(?:,\d{3})+|\d+)\s*원/g,'').trim();
    }
    if(!merchant || isNoise(merchant)){
      merchant='';
      // With coordinates, use only text horizontally aligned with the amount.
      if(line.bbox){
        const cy=(line.bbox.y0+line.bbox.y1)/2;
        const h=line.bbox.y1-line.bbox.y0;
        const peers=usable.filter(l=>l!==line && l.bbox && !isNoise(l.text) && amountFrom(l.text)===null
          && Math.abs((l.bbox.y0+l.bbox.y1)/2-cy)<=Math.max(h, l.bbox.y1-l.bbox.y0)*0.6
          && l.bbox.x0>=width*0.14 && l.bbox.x1<width*0.75);
        merchant=peers.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(l=>l.text).join(' ');
      }else {
        for(let j=i-1;j>=Math.max(0,i-3);j--){
          const prev=usable[j];
          if(/원|할인/.test(prev.text)) break;
          if(!isNoise(prev.text) && !/^\d/.test(prev.text)){merchant=prev.text;break;}
        }
      }
    }
    merchant=normalizeMerchant(merchant);
    if(isNoise(merchant)) merchant='';
    out.push({id:crypto.randomUUID(),date:currentDate,merchant:merchant||'업체명 확인 필요',amount,
      category:categoryFor(merchant),card:'',cardLast4:'',discount:0,shotIndex,lineIndex:i,
      y:moneyBox ? (moneyBox.y0+moneyBox.y1)/2 : i,
      hasCoordinates:!!moneyBox, confidence:Math.round(line.conf||50),sourceName:file.name});
  }
  // Bind metadata only inside this payment's row, never inherit a card across rows.
  for(let n=0;n<out.length;n++){
    const t=out[n], next=out[n+1];
    const row=usable.filter((l,index)=>{
      if(t.hasCoordinates && l.bbox){
        const cy=(l.bbox.y0+l.bbox.y1)/2;
        return cy>=t.y-8 && cy<(next?.hasCoordinates ? next.y-8 : t.y+160);
      }
      return index>=t.lineIndex && index<(next?.lineIndex ?? usable.length);
    });
    const cards=[...new Set(row.flatMap(l=>[...l.text.matchAll(/(?:본인|가족)\s*(\d{4})(?!\d)/g)].map(m=>m[1])))];
    if(cards.length===1){t.cardLast4=cards[0];t.cardId='last4:'+cards[0];t.card=cardNames[cards[0]]||'카드 '+cards[0];}
    const discounts=row.flatMap(l=>[...l.text.matchAll(/할인\s*[:：]?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*원/g)].map(m=>Number(m[1].replace(/,/g,''))));
    if(discounts.length===1 && discounts[0]<=t.amount) t.discount=discounts[0];
    else if(discounts.length) t.discountNeedsReview=true;
  }
  return {transactions:out,rawText,card:'',lastDate:currentDate};
}

function signature(t){
  return `${t.date}|${t.merchant.replace(/\s/g,'').toLowerCase()}|${t.amount}|${t.cardLast4||''}|${t.discount||0}`;
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
    if(typeof Tesseract==='undefined') await loadExternalScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    worker=await Tesseract.createWorker(['kor','eng'], 1, {
      logger:m=>{
        if(m.status==='recognizing text'){
          const p=Math.round((m.progress||0)*100);
          $('#progressText').textContent=`문자 읽는 중… ${p}%`;
        }
      }
    });
    const shots=[];
    let inheritedDate;
    state.ocrText=[];
    for(let i=0;i<state.files.length;i++){
      const file=state.files[i];
      $('#progressText').textContent=`${i+1}/${state.files.length}장 분석 중 · ${file.name}`;
      const r=await worker.recognize(file);
      const parsed=parseTransactionsFromOCR(r,file,i,inheritedDate);
      inheritedDate=parsed.lastDate;
      shots.push(parsed.transactions);
      state.ocrText.push(parsed.rawText);
      $('#ocrPreview').textContent += `\n\n━━ ${i+1}번째 스샷 ━━\n${parsed.rawText.slice(0,1800)}`;
      $('#progressBar').style.width=`${Math.round(((i+1)/state.files.length)*100)}%`;
    }
    await worker.terminate();

    const d=dedupeConsecutive(shots);
    state.overlapRemoved=d.removed;
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

function renderReview(removed=state.overlapRemoved){
  $('#reviewStats').classList.toggle('hidden',state.importMode==='excel');
  $('#reviewCount').textContent=`${state.pending.length}건`;
  const total=state.pending.reduce((s,t)=>s+t.amount,0);
  $('#reviewStats').innerHTML=`
    <div class="stat"><strong>${state.pending.length}</strong><span>발견 거래</span></div>
    <div class="stat"><strong>${removed}</strong><span>겹침 제외</span></div>
    <div class="stat"><strong>${fmt(total)}</strong><span>합계</span></div>
  `;
  const visible=visibleReviewEntries();
  $('#reviewFilterStatus').textContent=`전체 ${state.pending.length}건 중 ${visible.length}건 표시 · ${state.pending.filter(t=>t.selected).length}건 선택`;
  $('#clearReviewFilters').hidden=!state.reviewFilters.size;
  $('#saveReviewedBtn').textContent=state.importMode==='excel'?`전체 ${state.pending.length}건 등록 처리`:`전체 ${state.pending.length}건 등록`;
  $('#reviewList').innerHTML=visible.map(({t,i})=>`
    <div class="review-item" data-i="${i}">
      <label class="review-select"><input type="checkbox" class="rv-selected" ${t.selected?'checked':''} aria-label="${escapeHtml(t.merchant)} 선택" /> 선택</label>
      <div>
        <input class="rv-merchant" aria-label="업체명" value="${escapeHtml(displayMerchant(t.merchant))}" />
        <div class="review-meta">
          <span class="chip">${t.date}</span>
          <span class="chip">${t.cardLast4 ? '끝 '+t.cardLast4 : '카드 확인 필요'}</span>
          <input class="rv-card" aria-label="카드 이름" placeholder="카드 이름 입력" value="${escapeHtml(cardLabel(t))}" style="max-width:150px" />
          <span class="chip">${t.sourceType==='excel'?'엑셀 · '+escapeHtml(t.issuer):'OCR '+t.confidence+'%'}</span>
        </div>
      </div>
      <div style="text-align:right">
        <input class="rv-amount" type="number" value="${t.amount}" style="text-align:right;font-weight:850;max-width:120px" />
        <label class="discount-field">할인 <input class="rv-discount" aria-label="할인금액" type="number" value="${t.discount||0}" />원 ${t.discountNeedsReview?'· 확인 필요':''}${t.discountKnown===false?'· 미확인':''}</label>
        ${t.sourceType==='excel'?`<div class="tx-sub">${t.status}${t.installments>1?' · '+t.installments+'개월 할부':''}</div><label class="decision-label">등록 처리<select class="rv-action" aria-label="등록 처리"><option value="new" ${t.action==='new'?'selected':''}>새 거래로 추가</option><option value="skip" ${t.action==='skip'?'selected':''}>기존 거래 / 제외</option>${t.matchId?`<option value="review" ${t.action==='review'?'selected':''}>겹침 확인 필요</option><option value="update" ${t.action==='update'?'selected':''}>기존 거래 갱신</option>`:''}</select></label>${t.matchId?`<small>${escapeHtml(t.matchReason)} · 기존 할인 ${fmt(t.previousDiscount)}</small>`:''}`:''}
        <select aria-label="업종" class="rv-category" style="border:0;background:#f0f0ec;border-radius:8px;padding:4px;margin-top:4px">
          ${CATEGORIES.map(c=>`<option ${c===t.category?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
  `).join('');
  if(typeof renderExcelReviewExtras==='function')renderExcelReviewExtras();
}

function collectReview(){
  for(const el of $$('.review-item')){
    const t=state.pending[Number(el.dataset.i)];
    const merchantInput=el.querySelector('.rv-merchant');
    if(merchantInput.value!==merchantInput.defaultValue){t.originalMerchant??=t.merchant;t.merchant=merchantInput.value.trim()||'업체명 확인 필요';}
    const nextAmount=Number(el.querySelector('.rv-amount').value);
    if(t.sourceType==='excel'&&(nextAmount!==t.amount||Number(el.querySelector('.rv-discount').value)!==t.discount)){t.billedAmount=null;t.dueConfirmed=false;}
    t.amount=nextAmount;
    const discountInput=el.querySelector('.rv-discount');
    if(discountInput.value!==discountInput.defaultValue)t.discountKnown=true;
    t.discount=Number(discountInput.value);
    if(t.sourceType==='excel')t.action=el.querySelector('.rv-action').value;
    t.selected=el.querySelector('.rv-selected').checked;
    const category=el.querySelector('.rv-category').value;
    if(category!==t.category) rememberCategory(t.merchant,category);
    t.category=category;
    const cardInput=el.querySelector('.rv-card');
    if(cardInput.value!==cardInput.defaultValue){
      t.card=cardInput.value.trim();
      if(t.cardLast4&&t.card)cardNames[t.issuer ? t.issuer+':'+t.cardLast4 : t.cardLast4]=t.card;
    }
  }
  localStorage.setItem('jjig_card_names',JSON.stringify(cardNames));
}
function validTransaction(t){return Number.isSafeInteger(t.amount)&&t.amount!==0&&Number.isSafeInteger(t.discount??0)&&Math.abs(t.discount??0)<=Math.abs(t.amount)&&((t.discount??0)===0||Math.sign(t.discount)===Math.sign(t.amount));}
function monthlyTotals(txs,ym){
  return txs.filter(t=>t.date.startsWith(ym)).reduce((sum,t)=>{
    sum.gross+=Number(t.amount)||0;sum.discount+=Number(t.discount)||0;
    sum.net=sum.gross-sum.discount;return sum;
  },{gross:0,discount:0,net:0});
}

function groupCurrentMonth(){
  const ym=state.month;
  const txs=state.txs.filter(t=>t.date.startsWith(ym)).sort((a,b)=>b.date.localeCompare(a.date));
  const days={};
  txs.forEach(t=>{
    days[t.date]??=[];
    days[t.date].push(t);
  });
  return days;
}

function render(){
  const now=new Date(state.month+'-01T12:00:00');
  $('#monthLabel').textContent=`${now.getFullYear()}년 ${now.getMonth()+1}월 최종지출`;
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
  const pym=`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;

  const totals=monthlyTotals(state.txs,ym);
  const cur=totals.net, pre=monthlyTotals(state.txs,pym).net;
  $('#monthGross').textContent=fmt(totals.gross);
  $('#monthDiscount').textContent=fmt(totals.discount);
  $('#monthTotal').textContent='₩'+new Intl.NumberFormat('ko-KR').format(cur);
  if(state.txs.some(t=>t.date.startsWith(ym)&&t.discountKnown===false))$('#monthLabel').textContent+=' (할인 미확인 포함)';
  if(pre>0){
    const diff=cur-pre, pct=Math.round(Math.abs(diff)/pre*100);
    $('#monthDelta').textContent=`지난달보다 ${pct}% ${diff>=0?'↑':'↓'}`;
  }else $('#monthDelta').textContent='지난달 비교 준비중';

  if(typeof renderDashboard==='function')renderDashboard();
  renderCoach(cur,pre,ym);
  if(typeof renderBilling==='function')renderBilling();
}

function renderCoach(cur,pre,ym){
  const monthly=state.txs.filter(t=>t.date.startsWith(ym));
  const cat={}; monthly.forEach(t=>cat[t.category]=(cat[t.category]||0)+t.amount-(t.discount||0));
  const top=Object.entries(cat).sort((a,b)=>b[1]-a[1])[0];
  let msg='이용내역을 등록하면 소비 패턴을 비교해드릴게요.';
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
  if(!arr.length){$('#detailsDialog').close();return;}
  const total=arr.reduce((s,t)=>s+t.amount,0);
  $('#detailsTitle').textContent=`${displayMerchant(arr[0].merchant)} · ${fmt(total)}`;
  $('#detailsList').innerHTML=arr.map(t=>`
    <div class="detail-row">
      <div>
        <b>${fmt(t.amount)}</b><div class="discount-field">할인 ${fmt(t.discount||0)} · 최종 ${fmt(t.amount-(t.discount||0))}</div>
        <div class="tx-sub">${t.date} · ${escapeHtml(t.category)} · ${escapeHtml(cardLabel(t))}${t.cardLast4?' · '+t.cardLast4:''}</div>
      </div>
      <div class="detail-actions">
        <button class="mini-btn edit-one" data-id="${t.id}">수정</button>
        <button class="mini-btn danger delete-one" data-id="${t.id}">삭제</button>
      </div>
    </div>
  `).join('');
  $('#detailsDialog').showModal();
  $$('.edit-one').forEach(b=>b.onclick=()=>{ $('#detailsDialog').close(); openEdit(b.dataset.id); });
  $$('.delete-one').forEach(b=>b.onclick=()=>{
    state.txs=state.txs.filter(t=>t.id!==b.dataset.id); save(); openDetails(ids.filter(x=>x!==b.dataset.id)); toast('삭제했어요');
  });
}

function openEdit(id=null){
  state.editingId=id;
  const t=id?state.txs.find(x=>x.id===id):null;
  $('#dialogTitle').textContent=t?'지출 수정':'직접 등록';
  $('#editDate').value=t?.date||(typeof dashboard!=='undefined'?dashboard.date:today());
  $('#editMerchant').value=t?.merchant||'';
  $('#editAmount').value=t?.amount||'';
  $('#editDiscount').value=t?.discount||0;
  $('#editCategory').value=t?.category||'미분류';
  $('#editCard').value=t?cardLabel(t):'';
  $('#editDialog').showModal();
}

function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

$('#imageInput').addEventListener('change', e=>{
  state.reviewFilters.clear();
  state.importMode='ocr';state.pending=[];
  $('#excelPanel').classList.add('hidden');
  $('#excelReviewSummary').classList.add('hidden');$('#excelConflictTools').classList.add('hidden');$('#merchantGroups').innerHTML='';
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
  if(state.importMode==='excel'){commitExcel();return;}
  if(state.pending.some(t=>!validTransaction(t))){toast('결제금액과 할인금액을 확인해주세요');return;}
  const clean=state.pending.map(({selected,...t})=>t);
  state.txs.push(...clean);
  const latest=clean.map(t=>t.date).sort().at(-1);
  if(latest){state.month=latest.slice(0,7);$('#monthPicker').value=state.month;if(typeof dashboard!=='undefined')dashboard.date=latest;}
  save();
  state.pending=[]; state.files=[];
  $('#imageInput').value='';
  $('#importPanel').classList.add('hidden');
  $('#reviewPanel').classList.add('hidden');
  if(typeof switchTab==='function')switchTab('calendar');
  toast(`${clean.length}건 등록 완료`);
};
$('#manualAddBtn').onclick=()=>openEdit();
$('#saveEditBtn').onclick=()=>{
  if(!$('#editForm').reportValidity())return;
  const original=state.txs.find(x=>x.id===state.editingId);
  const t={
    ...original,
    discount:Number($('#editDiscount').value),
    id:state.editingId||crypto.randomUUID(),
    date:$('#editDate').value||today(),
    merchant:$('#editMerchant').value.trim()||'미입력',
    amount:Number($('#editAmount').value)||0,
    category:$('#editCategory').value,
    card:$('#editCard').value.trim(),
    sourceName:'manual',confidence:100
  };
  if(t.category==='미분류') t.category=categoryFor(t.merchant);
  if(!validTransaction(t)){toast('결제금액과 할인금액을 확인해주세요');return;}
  if(original?.cardLast4&&t.card!==cardLabel(original)&&t.card){
    cardNames[original.issuer?original.issuer+':'+original.cardLast4:original.cardLast4]=t.card;
    localStorage.setItem('jjig_card_names',JSON.stringify(cardNames));
  }
  rememberCategory(t.merchant,t.category);
  if(state.editingId){
    state.txs=state.txs.map(x=>x.id===state.editingId?t:x);
  }else state.txs.push(t);
  state.month=t.date.slice(0,7);$('#monthPicker').value=state.month;
  if(typeof dashboard!=='undefined')dashboard.date=t.date;
  $('#editDialog').close(); save(); toast('저장했어요');
};
$('#detailsClose').onclick=()=>$('#detailsDialog').close();

$('#closeEditBtn').onclick=$('#cancelEditBtn').onclick=()=>$('#editDialog').close();
$('#editForm').onsubmit=e=>e.preventDefault();

$('#appVersion').textContent='v'+APP_VERSION;
$('#monthPicker').value=state.month;
$('#monthPicker').onchange=e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){state.month=e.target.value;render();}};
$('#editMerchant').onchange=()=>{$('#editCategory').value=categoryFor($('#editMerchant').value);};
$('#editCategory').innerHTML=CATEGORIES.map(c=>'<option>'+c+'</option>').join('');
$('#bulkCategory').innerHTML=CATEGORIES.filter(c=>c!=='미분류').map(c=>'<option>'+c+'</option>').join('');
$('#clearReviewFilters').onclick=()=>{collectReview();state.reviewFilters.clear();state.pending.forEach(t=>t.selected=false);renderReview();};
$('#selectUnclassified').onclick=()=>{collectReview();state.reviewFilters=new Set(state.pending.filter(t=>t.category==='미분류').map(t=>displayMerchant(t.merchant)));state.pending.forEach(t=>t.selected=t.category==='미분류');renderReview();};
$('#applyBulkCategory').onclick=()=>{
  collectReview();const category=$('#bulkCategory').value;
  const selected=state.pending.filter(t=>t.selected);
  if(!selected.length){toast('분류할 항목을 선택해주세요');return;}
  selected.forEach(t=>{t.category=category;rememberCategory(t.merchant,category);t.selected=false;});
  state.pending.filter(t=>t.category==='미분류').forEach(t=>t.category=categoryFor(t.merchant));
  renderReview();toast(selected.length+'건 분류 완료');
};
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
}
render();
