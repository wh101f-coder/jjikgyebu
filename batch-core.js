(function(root){
 const E=typeof module!=='undefined'?require('./excel-core.js'):root.ExcelImport;
 function issuer(text){const s=String(text).replace(/\s/g,'');return /우리(?:은행|카드)|woori/i.test(s)?'우리카드':/국민|KB카드/i.test(s)?'KB국민카드':/현대|hyundai/i.test(s)?'현대카드':/신한/.test(s)?'신한카드':/삼성/.test(s)?'삼성카드':/롯데/.test(s)?'롯데카드':/하나/.test(s)?'하나카드':/농협|NH카드/.test(s)?'NH농협카드':/BC카드|비씨/.test(s)?'BC카드':'';}
 function parseSheet(sheet,options={}){
  const found=E.detect(sheet.rows);
  if(!found)return {txs:[],errors:[],needsFormat:true,warnings:[]};
  const metadataRows=new Set();
  const metadataLabel=/^(?:카드\s*(?:번호|상품명|명|종류|사)|조회\s*(?:기간|연도)|이용\s*기간|대상\s*기간|발급사)\s*[:：]?/;
  sheet.rows.forEach((row,i)=>{const c=E.columns(row);const isHeader=c.date>=0&&c.merchant>=0&&c.amount>=0;if(i<found.header||i>=found.start&&!isHeader&&row.some(v=>metadataLabel.test(String(v)))&&E.money(row[found.map.amount])===null&&!E.date(row[found.map.date]))metadataRows.add(i);});
  const metaRows=[...metadataRows].map(i=>sheet.rows[i]);
  const pre=metaRows.flat().join(' '),meta=pre+' '+(options.fileName||'')+' '+sheet.name;
  const range=[...pre.matchAll(/20\d{2}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}/g)].map(m=>E.date(m[0]));
  const years=[...new Set((pre.match(/(?<!\d)20\d{2}(?!\d)/g)||[]).map(Number))];
  const start=range[0],end=range[1];
  const dataYears=[...new Set(sheet.rows.slice(found.start).map(r=>E.date(r[found.map.date])?.slice(0,4)).filter(Boolean).map(Number))];
  const year=Number(options.year)|| (years.length===1?years[0]:years.length===0&&dataYears.length===1?dataYears[0]:undefined);
  const fileIssuer=options.issuer||issuer(meta)|| (sheet.rows[found.header].some(v=>String(v).replace(/\s/g,'')==='이용가맹점(은행)명')?'우리카드':'');
  const headerCards=new Set();
  const products=new Set();
  metaRows.forEach(row=>row.forEach((cell,i)=>{
   const text=String(cell).trim();
   if(/^카드\s*번호/.test(text)){const number=E.suffix(text.replace(/^카드\s*번호\s*[:：]?/,''))||E.suffix(row.slice(i+1).find(v=>String(v??'').trim()));if(number)headerCards.add(number);}
   if(/^카드\s*(?:상품명|명|종류)\s*[:：]?/.test(text)){const product=text.replace(/^카드\s*(?:상품명|명|종류)\s*[:：]?\s*/,'')||String(row.slice(i+1).find(v=>String(v??'').trim())||'');if(product)products.add(product);}
  }));
  const defaultCard=options.defaultCard||(headerCards.size===1?[...headerCards][0]:'');
  const resolveDate=v=>{
   const full=E.date(v);if(full)return full;
   if(start&&end){const candidates=[];for(let y=Number(start.slice(0,4));y<=Number(end.slice(0,4));y++){const d=E.date(v,y);if(d&&d>=start&&d<=end)candidates.push(d);}return candidates.length===1?candidates[0]:null;}
   return E.date(v,year);
  };
  const resolveIssuer=(value,card,last4)=>issuer(value)||issuer(card)||fileIssuer||options.cardHints?.[last4]||'';
  // Some statements list voided authorizations but omit them from monetary totals.
  // Only exclude these when both source totals independently reconcile.
  let sourceTotals;
  for(const row of sheet.rows.slice(0,found.header)){
   const label=row.findIndex(v=>/정상.*취소.*금액/.test(String(v).replace(/\s/g,'')));
   if(label>=0){const pair=row.slice(label+1).map(v=>String(v).match(/^\s*([\d,]+)\s*\/\s*([\d,]+)\s*$/)).find(Boolean);if(pair)sourceTotals=pair.slice(1).map(E.money);}
  }
  const sums=[0,0];let hasVoid=false;
  if(found.map.status>=0)for(const row of sheet.rows.slice(found.start)){
   const value=E.money(row[found.map.amount]);if(value===null||!resolveDate(row[found.map.date]))continue;
   const status=String(row[found.map.status]);if(/승인취소/.test(status)){hasVoid=true;continue;}
   sums[/취소|환불/.test(status)||value<0?1:0]+=Math.abs(value);
  }
  const excludeApprovalVoids=hasVoid&&sourceTotals&&sourceTotals.every((n,i)=>n===sums[i]);
  const result=E.parse(sheet.rows,{...found,year,issuer:fileIssuer,resolveDate,resolveIssuer,defaultCard,defaultProduct:products.size===1?[...products][0]:'',metadataRows,excludeApprovalVoids,fileName:options.fileName,sheetName:sheet.name});
  if(found.inferred)result.warnings.push('열 이름과 실제 셀 값의 패턴을 함께 분석했습니다. 등록 전 날짜·업체·금액을 확인해주세요.');
  if(hasVoid&&!excludeApprovalVoids)result.errors.push('승인취소 내역의 포함 여부를 파일 합계로 확인할 수 없습니다. 지출이 이중 차감되지 않도록 확인이 필요합니다.');
  result.warnings=result.warnings.filter(w=>!w.startsWith('연도가 없는'));
  return {...result,found};
 }
 function view(entries,filter={}){
  const counts=new Map();entries.forEach(({t})=>counts.set(t.merchant,(counts.get(t.merchant)||0)+1));
  const result=entries.filter(({t})=>(!filter.month||t.date.startsWith(filter.month))&&(!filter.category||t.category===filter.category)&&(!filter.card||(t.cardId||t.card)===filter.card)&&(!filter.query||t.merchant.toLowerCase().includes(filter.query.toLowerCase()))&&(!filter.status||t.action===filter.status)&&(!filter.min||t.amount-(t.discount||0)>=Number(filter.min))&&(!filter.max||t.amount-(t.discount||0)<=Number(filter.max)));
  result.sort((a,b)=>{const x=a.t,y=b.t;switch(filter.sort){case 'oldest':return x.date.localeCompare(y.date)||a.i-b.i;case 'high':return (y.amount-(y.discount||0))-(x.amount-(x.discount||0))||a.i-b.i;case 'low':return (x.amount-(x.discount||0))-(y.amount-(y.discount||0))||a.i-b.i;case 'frequent':return counts.get(y.merchant)-counts.get(x.merchant)||x.merchant.localeCompare(y.merchant)||a.i-b.i;default:return y.date.localeCompare(x.date)||a.i-b.i;}});return result;
 }
 function reconcileSheets(groups,existing){
  const all=[],pool=existing.slice();
  for(const group of groups){
   const rows=E.reconcile(group,pool);all.push(...rows);
   rows.filter(t=>t.action==='new').forEach(t=>pool.push(t));
  }
  return all;
 }
 const api={issuer,parseSheet,view,reconcileSheets};if(typeof module!=='undefined')module.exports=api;else root.BatchImport=api;
})(typeof window!=='undefined'?window:this);
