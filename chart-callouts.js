/* Callout geometry is separate from amounts and selection state. */
function chartCallouts(items,width,mode,widths){
  const sideWidths=[0,0];
  items.forEach((s,i)=>{if(s.members)return;const a=(s.start+s.share/2)*Math.PI*2-Math.PI/2;const side=Math.cos(a)>=0?1:0;sideWidths[side]=Math.max(sideWidths[side],widths[i]);});
  const left=Math.max(48,sideWidths[0])+18,right=Math.max(48,sideWidths[1])+18;
  const r=Math.min(78,Math.max(42,(width-left-right)/2)),cx=mode==='donut'?(left+width-right)/2:width/2,cy=150,height=mode==='donut'?300:190;
  const rows=items.map((s,i)=>{const angle=(s.start+s.share/2)*Math.PI*2-Math.PI/2;return {s,i,angle,sx:mode==='donut'?cx+Math.cos(angle)*r:12+(s.start+s.share/2)*(width-24),sy:mode==='donut'?cy+Math.sin(angle)*r:32,tw:widths[i]};});
  if(mode==='strip'){
    const count=Math.ceil(rows.length/2),left=rows.slice(0,count),right=rows.slice(count);
    const leftBase=Math.max(0,...left.map(p=>p.tw))+22,rightBase=width-Math.max(0,...right.map(p=>p.tw))-22;
    rows.forEach((p,i)=>{
      const isLeft=i<count,k=isLeft?i:i-count,n=isLeft?left.length:right.length;
      const lane=isLeft?leftBase+k*6:rightBase-(n-1-k)*6;
      const lift=isLeft?62-k*7:48+k*7;
      p.y=86+(isLeft?k:n-1-k)*34;p.x=isLeft?6:width-6-p.tw;
      const end=isLeft?p.x+p.tw+7:p.x-7;
      p.path=`M ${p.sx} ${p.sy} V ${lift} H ${lane} V ${p.y-4} H ${end}`;
    });
  }else{
    for(const right of [false,true]){
      const side=rows.filter(p=>(Math.cos(p.angle)>=0)===right).sort((a,b)=>a.sy-b.sy);
      side.forEach((p,i)=>{p.y=Math.max(45+i*32,p.sy+4);if(p.s.members&&p.sy<cy)p.y=28;});
      for(let i=side.length-1;i>=0;i--)side[i].y=Math.min(side[i].y,278-(side.length-1-i)*32);
      for(let i=1;i<side.length;i++)side[i].y=Math.max(side[i].y,side[i-1].y+32);
      side.forEach(p=>{
        p.x=right?width-p.tw-6:6;
        if(p.s.members&&p.sy<cy){const target=p.x+p.tw/2;p.path=`M ${p.sx} ${p.sy} V ${p.y+18} H ${target} V ${p.y+7}`;}
        else{if(Math.sin(p.angle)>.85)p.y=278;const end=right?p.x-7:p.x+p.tw+7,lane=right?Math.min(p.sx,end-5):Math.max(p.sx,end+5);p.path=`M ${p.sx} ${p.sy} H ${lane} V ${p.y-4} H ${end}`;}
      });
    }
  }
  return {rows,cx,cy,r,height};
}
if(typeof module!=='undefined')module.exports={chartCallouts};
