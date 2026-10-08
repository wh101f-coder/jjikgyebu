(function(root){
 const E=typeof module!=='undefined'?require('./excel-core.js'):root.ExcelImport;
 function issuer(text){const s=String(text).replace(/\s/g,'');return /우리(?:은행|카드)|woori/i.test(s)?'우리카드':/국민|KB카드/i.test(s)?'KB국민카드':/현대|hyundai/i.test(s)?'현대카드':/신한/.test(s)?'신한카드':/삼성/.test(s)?'삼성카드':/롯데/.test(s)?'롯데카드':/하나/.test(s)?'하나카드':/농협|NH카드/.test(s)?'NH농협카드':/BC카드|비씨/.test(s)?'BC카드':'';}
 function parseSheet(sheet,options={}){
  const found=E.detect(sheet.rows);
  if(!found)return {txs:[],errors:[],needsFormat:true,warnings:[]};
  const pre=sheet.rows.slice(0,found.header).flat().join(' '),meta=pre+' '+(options.fileName||'')+' '+sheet.name;
  const range=[...pre.matchAll(/20\d{2}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}/g)].map(m=>E.date(m[0]));
  const years=[...new Set((pre.match(/20\d{2}/g)||[]).map(Number))];
  const start=range[0],end=range[1];
  const year=Number(options.year)|| (years.length===1?years[0]:undefined);
  const fileIssuer=options.issuer||issuer(meta)|| (sheet.rows[found.header].some(v=>String(v).replace(/\s/g,'')==='이용가맹점(은행)명')?'우리카드':'');
  const headerCards=new Set();
  sheet.rows.slice(0,found.header).forEach(row=>row.forEach((cell,i)=>{if(/^카드\s*번호/.test(String(cell))){const number=E.suffix(String(cell).replace(/^카드\s*번호\s*[:：]?/,''))||E.suffix(row[i+1]);if(number)headerCards.add(number);}}));
  const defaultCard=options.defaultCard||(headerCards.size===1?[...headerCards][0]:'');
  const resolveDate=v=>{
   const full=E.date(v);if(full)return full;
   if(start&&end){const candidates=[];for(let y=Number(start.slice(0,4));y<=Number(end.slice(0,4));y++){const d=E.date(v,y);if(d&&d>=start&&d<=end)candidates.push(d);}return candidates.length===1?candidates[0]:null;}
   return E.date(v,year);
  };
  const resolveIssuer=(value,card,last4)=>issuer(value)||issuer(card)||fileIssuer||options.cardHints?.[last4]||'';
  const result=E.parse(sheet.rows,{...found,year,issuer:fileIssuer,resolveDate,resolveIssuer,defaultCard,fileName:options.fileName,sheetName:sheet.name});
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
