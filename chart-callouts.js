/* Callout geometry is separate from amounts and selection state. */
function chartCallouts(items,width,mode,widths){
  const sideWidths=[0,0];
  items.forEach((s,i)=>{if(s.members)return;const a=(s.start+s.share/2)*Math.PI*2-Math.PI/2;const side=Math.cos(a)>=0?1:0;sideWidths[side]=Math.max(sideWidths[side],widths[i]);});
  const left=Math.max(48,sideWidths[0])+18,right=Math.max(48,sideWidths[1])+18;
  const r=Math.min(78,Math.max(42,(width-left-right)/2)),cx=mode==='donut'?(left+width-right)/2:width/2,cy=150,height=mode==='donut'?300:210,barY=93;
  const rows=items.map((s,i)=>{const angle=(s.start+s.share/2)*Math.PI*2-Math.PI/2;return {s,i,angle,sx:mode==='donut'?cx+Math.cos(angle)*r:12+(s.start+s.share/2)*(width-24),sy:mode==='donut'?cy+Math.sin(angle)*r:32,tw:widths[i]};});
  if(mode==='strip'){
    const count=Math.ceil(rows.length/2);
    [rows.slice(0,count),rows.slice(count)].forEach((side,sideIndex)=>{
      const top=sideIndex===0,gap=(width-12-side.reduce((sum,p)=>sum+p.tw,0))/Math.max(1,side.length-1);
      let x=side.length===1?(width-side[0].tw)/2:6;
      side.forEach(p=>{p.x=x;p.y=top?22:196;p.sy=barY+12;p.target=x+p.tw/2;x+=p.tw+gap;});
      // Ordered endpoints: left-moving routes peel off left to right; right-moving
      // routes peel off right to left. Each bend clears the previous vertical.
      const ordered=[...side.filter(p=>p.target<=p.sx),...side.filter(p=>p.target>p.sx).reverse()];
      ordered.forEach((p,k)=>{
        const bend=top?barY-12-k*17:barY+36+k*17,end=top?p.y+10:p.y-19;
        p.path=`M ${p.sx} ${p.sy} V ${bend} H ${p.target} V ${end}`;
      });
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
  return {rows,cx,cy,r,height,barY};
}
if(typeof module!=='undefined')module.exports={chartCallouts};
