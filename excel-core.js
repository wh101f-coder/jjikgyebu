/* Pure spreadsheet normalization and conservative, occurrence-aware reconciliation. */
(function(root){
  const compact=v=>String(v??'').replace(/\s/g,'');
  const headerKey=v=>compact(v).replace(/[()（）\[\]·_]/g,'').replace(/원$/,'').toLowerCase();
  const aliases={
    date:['이용일자','이용일','승인일자','승인일','거래일자','거래일','매출일자','이용일시','승인일시','거래일시','사용일자','사용일','date'],
    merchant:['이용가맹점(은행)명','이용가맹점명','가맹점명','이용하신곳','이용하신가맹점','사용처','가맹점','업체명','상호명','merchant'],
    amount:['이용금액(해외현지/체크카드)','이용금액','승인금액','사용금액','거래금액','이용금액(원)','승인금액(원)'],
    card:['이용카드','카드번호','카드번호(끝4자리)','카드끝자리'],
    discount:['혜택금액','할인금액','청구할인금액','할인액'],
    billed:['원금','결제원금','청구원금','청구금액','결제금액'],
    approval:['승인번호'],status:['매출구분','거래구분','이용구분','승인상태','상태'],
    installments:['할부개월','할부기간'],fee:['수수료'],due:['결제일','결제예정일'],issuer:['카드사','카드사명','발급사'],cancel:['취소금액','누적취소금액'],cardProduct:['카드상품명','이용카드명','카드명'],foreign:['해외이용금액($)','외화금액','현지통화금액']
  };
  function semanticScore(field,h){
    switch(field){
      case 'date':return /청구|결제|예정|취소|만기/.test(h)?0:/(이용|승인|거래|사용|매출).*(일|날짜|date)|^(날짜|거래일시|transactiondate|date)$/.test(h)?8:0;
      case 'merchant':return /번호|정보|주소|고객|이름|사업자|전화/.test(h)?0:/가맹점|이용.*곳|이용처|사용처|사용장소|상호|업체|상점|merchant|store/.test(h)?8:0;
      case 'amount':return /할인|혜택|취소|환불|청구|결제|원금|수수료|포인트|적립|환율|잔액|횟수|소계|합계|총계/.test(h)||(/해외|외화|usd|달러|\$/.test(h)&&!h.includes('원'))?0:/금액|amount/.test(h)?(h.includes('원')?9:8):0;
      case 'card':return /카드.*(번호|끝자리)|cardnumber/.test(h)?8:0;
      case 'cardProduct':return /카드사/.test(h)?0:/카드.*(상품|명|종류)|cardname/.test(h)?8:0;
      case 'issuer':return /카드사|발급사|발행사|issuer/.test(h)?8:0;
      case 'discount':return /포인트|율|적립/.test(h)?0:/(할인|혜택).*(금액|액)|discount/.test(h)?8:0;
      case 'cancel':return /(취소|환불).*금액/.test(h)?8:0;
      case 'billed':return /할인|취소|혜택|포인트|예상/.test(h)?0:/청구.*금액|결제.*금액|청구.*원금/.test(h)?8:0;
      case 'approval':return /승인.*번호|approval/.test(h)?8:0;
      case 'due':return /결제.*(일|날짜)|paymentdate/.test(h)?8:0;
      case 'status':return /상태|정상.*취소|처리결과|거래구분|status/.test(h)?8:0;
      case 'foreign':return /해외|외화|usd|달러|\$/.test(h)&&!/원/.test(h)&&/금액|amount|통화/.test(h)?8:0;
      default:return 0;
    }
  }
  function columns(row,sample=[]){
    const headers=row.map(headerKey),map={};
    for(const [field,names] of Object.entries(aliases)){
      const scores=headers.map((h,i)=>{
        let score=names.map(headerKey).includes(h)?12:semanticScore(field,compact(row[i]).toLowerCase());
        if(!score)return 0;
        const values=sample.map(r=>r[i]).filter(v=>String(v??'').trim());
        if(values.length&&['date','merchant','amount','card'].includes(field)){
          const good=values.filter(v=>field==='date'?!!date(v,2024):field==='amount'?money(v)!==null:field==='card'?!!suffix(v):typeof v==='string'&&/[^\d\s.,/:-]/.test(v)).length/values.length;
          if(good<.5)return 0;score+=good*3;
        }
        return score;
      });
      const best=Math.max(0,...scores),candidates=scores.map((score,i)=>({score,i})).filter(v=>v.score===best&&best>0);
      map[field]=candidates.length===1?candidates[0].i:-1;
    }
    if(map.foreign===map.amount)map.foreign=-1;
    return map;
  }
  function detect(rows){
    for(let i=0;i<Math.min(150,rows.length);i++){
      const map=columns(rows[i],rows.slice(i+1,i+13));
      if(map.date>=0&&map.merchant>=0&&map.amount>=0){
        let start=i+1;
        const sub=columns(rows[i+1]||[]);
        if(sub.billed>=0&&sub.date<0&&sub.merchant<0){
          for(const key of ['billed','discount','fee']) if(sub[key]>=0)map[key]=sub[key];
          start++;
        }
        return {header:i,start,map};
      }
    }
    return null;
  }
  function money(value){
    if(typeof value==='number')return Number.isSafeInteger(value)?value:null;
    let s=String(value??'').trim();
    if(!s||s==='-')return null;
    s=s.replace(/[,\s₩원]/g,'').replace(/^\((\d+)\)$/,'-$1');
    return /^-?\d+$/.test(s)&&Number.isSafeInteger(Number(s))?Number(s):null;
  }
  function date(value,year){
    if(value instanceof Date && !isNaN(value))return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
    const s=String(value??'').trim();
    let m=s.match(/^(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?(?:\s.*)?$/);
    if(!m&&/^20\d{6}$/.test(s))m=[s,s.slice(0,4),s.slice(4,6),s.slice(6,8)];
    if(!m){const p=s.match(/^(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?(?:\s.*)?$/);if(p)m=[s,year,p[1],p[2]];}
    if(!m)return null;
    const [y,mo,d]=m.slice(1).map(Number),check=new Date(Date.UTC(y,mo-1,d));
    if(y<2000||y>2100||check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d)return null;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function suffix(value){
    const s=String(value??'').trim();
    if(/^\d{1,4}$/.test(s))return s.padStart(4,'0');
    return s.match(/(\d{4})\s*$/)?.[1]||'';
  }
  const merchantKey=s=>compact(s).replace(/\(주\)|㈜|주식회사|유한회사/g,'').toLowerCase();
  const cardKey=t=>t.cardLast4||('상품:'+compact(t.cardProduct||''));
  const identity=t=>t.importIdentity||[t.issuer||'',t.cardLast4|| (t.cardProduct?'상품:'+compact(t.cardProduct):''),t.date,merchantKey(t.merchant),t.amount].join('|');
  function parse(rows,options){
    const {map,start,year,issuer,defaultCard='',fileName='',sheetName='',billingMonth='',billedIncludesFee=false}=options;
    const txs=[],errors=[],warnings=[];let summaryRows=0,yearless=false,voidRows=0;
    const read=(r,k)=>map[k]>=0?r[map[k]]:'';
    for(let i=start;i<rows.length;i++){
      const r=rows[i]; if(!r.some(v=>String(v??'').trim()))continue;
      const repeated=columns(r);if(repeated.date>=0&&repeated.merchant>=0&&repeated.amount>=0)continue;
      const status=String(read(r,'status')),merchant=String(read(r,'merchant')).trim();
      if(/소계|합계|총계/.test(status)||/^(소계|합계|총계|청구합계)/.test(merchant)){summaryRows++;continue;}
      const rawDate=read(r,'date');
      // Footnotes and empty headings are not transactions, but transaction-like invalid rows are surfaced.
      if(!String(rawDate??'').trim()&&!merchant)continue;
      const day=options.resolveDate?options.resolveDate(rawDate):date(rawDate,year),amountValue=money(read(r,'amount'));
      if(!day||!merchant||amountValue===null){errors.push(`${i+1}행: 날짜·업체명·이용금액 확인 필요`);continue;}
      if(/승인취소/.test(status)&&options.excludeApprovalVoids){voidRows++;continue;}
      const foreignValue=String(read(r,'foreign')).replace(/[,\s$]/g,'');
      if(map.foreign>=0&&foreignValue&&foreignValue!=='-'&&Number(foreignValue)!==0){errors.push(`${i+1}행: 외화 거래는 원화 환산금액 확인이 필요합니다`);continue;}
      if(/^\d{1,2}[.\-/월]/.test(String(rawDate).trim()))yearless=true;
      const cardLast4=suffix(read(r,'card'))||suffix(defaultCard);
      const cardProduct=String(read(r,'cardProduct')||'').trim();
      if(!cardLast4&&!cardProduct){errors.push(`${i+1}행: 카드번호 또는 카드상품명을 확인해주세요`);continue;}
      const cancelled=/취소|환불/.test(status)||amountValue<0;
      const amount=cancelled?-Math.abs(amountValue):amountValue;
      let discount=money(read(r,'discount')),billedAmount=money(read(r,'billed'));
      const discountKnown=discount!==null;
      discount=discount??0;
      if(cancelled){discount=-Math.abs(discount);if(billedAmount!==null)billedAmount=-Math.abs(billedAmount);}
      const fee=money(read(r,'fee'))||0;
      const installments=money(read(r,'installments'))||0;
      if(Math.abs(discount)>Math.abs(amount)||(!cancelled&&discount<0))errors.push(`${i+1}행: 할인금액이 이용금액과 맞지 않습니다`);
      if(discountKnown&&billedAmount!==null&&installments<=1&&amount-discount+(billedIncludesFee?fee:0)!==billedAmount)errors.push(`${i+1}행: 이용금액·혜택금액과 청구금액이 다릅니다. 열 선택을 확인해주세요`);
      let dueDate= date(read(r,'due'),year);
      if(!dueDate&&billingMonth)dueDate=billingMonth+'-14';
      const rowIssuer=options.resolveIssuer?options.resolveIssuer(read(r,'issuer'),read(r,'card')+' '+cardProduct,cardLast4):issuer;
      if(!rowIssuer){errors.push(`${i+1}행: 카드사를 확인해주세요`);continue;}
      const t={date:day,merchant,amount,discount,discountKnown,billedAmount,billedIncludesFee,fee,installments,issuer:rowIssuer,cardLast4,cardProduct,
        cardId:rowIssuer+':'+(cardLast4||'상품:'+compact(cardProduct)),card:cardProduct||rowIssuer+' '+cardLast4,approvalNumber:String(read(r,'approval')??'').trim(),
        status:cancelled?'취소':'이용',sourceType:'excel',sourceName:fileName,sourceSheet:sheetName,sourceRow:i+1,
        dueDate,dueConfirmed:!!dueDate};
      t.importIdentity=identity(t);txs.push(t);
      const cancelAmount=money(read(r,'cancel'))||0;
      if(!cancelled&&cancelAmount){
        if(cancelAmount<0||cancelAmount>amount){errors.push(`${i+1}행: 취소금액 확인 필요`);continue;}
        const refund={...t,amount:-cancelAmount,discount:0,discountKnown:false,billedAmount:null,status:'취소',cancelOfSourceRow:i+1};
        delete refund.importIdentity;refund.importIdentity=identity(refund);txs.push(refund);
      }
    }
    if(yearless)warnings.push(`연도가 없는 날짜는 ${year}년으로 적용했습니다. 연말·연초가 섞이면 연도별 파일로 나눠주세요.`);
    if(txs.some(t=>!t.discountKnown))warnings.push('할인 정보가 없는 거래는 할인 미확인으로 표시합니다. 최종지출은 잠정 합계입니다.');
    if(txs.some(t=>t.installments>1))warnings.push('할부는 이용일에 전체 이용금액을 표시하고, 청구금액은 별도로 표시합니다.');
    if(txs.some(t=>!t.cardLast4&&t.cardProduct))warnings.push('카드번호가 없는 내역은 파일에 적힌 카드상품명으로 구분했습니다.');
    if(voidRows)warnings.push(`승인취소 ${voidRows}건은 파일 합계와 대조해 지출에서 제외했습니다. 매입 후 취소는 환불로 반영합니다.`);
    return {txs,errors,warnings,summaryRows,voidRows};
  }
  function reconcile(incoming,existing){
    const used=new Set();
    return incoming.map(t=>{
      let matches=existing.filter(x=>!used.has(x.id)&&t.approvalNumber&&x.approvalNumber===t.approvalNumber&&x.issuer===t.issuer&&cardKey(x)===cardKey(t)&&x.date===t.date&&Math.sign(x.amount)===Math.sign(t.amount));
      const strong=matches.length===1;
      if(!strong)matches=existing.filter(x=>!used.has(x.id)&&identity(x)===identity(t));
      if(!matches.length&&t.approvalNumber){
        matches=existing.filter(x=>!used.has(x.id)&&x.issuer===t.issuer&&!!x.cardLast4!==!!t.cardLast4&&x.approvalNumber===t.approvalNumber&&x.date===t.date&&x.amount===t.amount&&merchantKey(x.merchant)===merchantKey(t.merchant));
      }
      if(!matches.length){
        // Older OCR records have no issuer; ask instead of silently duplicating them.
        matches=existing.filter(x=>!used.has(x.id)&&!x.issuer&&t.cardLast4&&x.cardLast4===t.cardLast4&&x.date===t.date&&merchantKey(x.merchant)===merchantKey(t.merchant)&&x.amount===t.amount);
      }
      if(!matches.length)return {...t,action:'new',matchId:null};
      const old=matches[0];used.add(old.id);
      // An interim usage export must not erase an already confirmed benefit.
      if(t.discountKnown===false&&old.discountKnown!==false){t={...t,discount:old.discount||0,discountKnown:true};}
      const unchanged=old.amount===t.amount&&old.discount===t.discount&&old.billedAmount===t.billedAmount;
      return {...t,matchId:old.id,previousDiscount:old.discount||0,action:strong&&unchanged?'skip':'review',matchReason:strong?'승인번호 일치':'같은 날짜·카드·업체·금액',category:old.category};
    });
  }
  const api={aliases,columns,detect,money,date,suffix,parse,reconcile,identity};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ExcelImport=api;
})(typeof window!=='undefined'?window:this);
