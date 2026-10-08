/* Refresh only the app shell; never clear saved ledger data. */
function pullRefreshDistance(start,touch,scrollTop){
  if(!start||!touch||scrollTop>0)return 0;
  const dy=touch.clientY-start.y,dx=Math.abs(touch.clientX-start.x);
  return dy>dx*1.5?Math.max(0,Math.min(100,dy*.5)):0;
}
if(typeof module!=='undefined')module.exports={pullRefreshDistance};
if(typeof document!=='undefined'){
  const indicator=document.createElement('div');
  indicator.className='refresh-indicator';indicator.setAttribute('role','status');
  document.body.append(indicator);
  let start=null,distance=0,busy=false,checking=false,lastCheck=0;
  const versionButton=document.querySelector('#appVersion');
  const blocked=()=>!!document.querySelector('dialog[open]')||state.pending.length>0||(typeof excelBusy!=='undefined'&&excelBusy);
  function reset(){start=null;distance=0;indicator.classList.remove('visible');}
  async function latest(){
    const response=await fetch('./release.json?check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('offline');
    const release=await response.json();
    if(!/^\d+\.\d+\.\d+$/.test(release.version))throw Error('invalid version');
    return release.version;
  }
  async function refresh(){
    if(busy)return;
    if(blocked()){reset();toast('입력·가져오기 작업을 마친 뒤 새로고침해 주세요');return;}
    busy=true;indicator.textContent='최신 버전 확인 중…';indicator.classList.add('visible');
    try{
      const version=await latest(),url=new URL('./index.html',location.href);
      url.searchParams.set('refresh',Date.now());
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok||!(await response.text()).includes('v'+version))throw Error('not ready');
      if(blocked()){toast('입력 중인 작업을 마친 뒤 다시 당겨주세요');return;}
      indicator.textContent='새로고침 중…';
      // A unique navigation URL also bypasses the previously installed worker's cache.
      location.replace(url.href);
    }catch(error){toast('새로고침하지 못했어요. 인터넷 연결을 확인하고 다시 당겨주세요');}
    finally{busy=false;reset();}
  }
  versionButton.setAttribute('aria-label','현재 버전 '+APP_VERSION+', 최신 버전 확인');
  versionButton.onclick=refresh;
  document.addEventListener('touchstart',e=>{
    reset();
    if(busy||blocked()||window.scrollY>0||e.touches.length!==1||e.target.closest('button,input,select,textarea,a,summary,[role="button"]'))return;
    start={x:e.touches[0].clientX,y:e.touches[0].clientY};
  },{passive:true});
  document.addEventListener('touchmove',e=>{
    if(!start||busy)return;
    if(e.touches.length!==1){reset();return;}
    distance=pullRefreshDistance(start,e.touches[0],window.scrollY);
    if(distance<=0){reset();return;}
    if(e.cancelable)e.preventDefault();
    indicator.textContent=distance>=64?'놓으면 새로고침':'아래로 당겨 새로고침';
    indicator.classList.toggle('visible',distance>8);
  },{passive:false});
  document.addEventListener('touchend',()=>{const ready=distance>=64;reset();if(ready)refresh();},{passive:true});
  document.addEventListener('touchcancel',reset,{passive:true});
  async function checkUpdate(){
    if(checking||busy||document.hidden||Date.now()-lastCheck<60000)return;
    checking=true;lastCheck=Date.now();
    try{const version=await latest();if(version!==APP_VERSION){versionButton.textContent='v'+APP_VERSION+' · 업데이트';versionButton.setAttribute('aria-label','v'+version+' 업데이트, 눌러 새로고침');}}
    catch(error){/* Offline use remains available. */}finally{checking=false;}
  }
  window.addEventListener('pageshow',checkUpdate);
  document.addEventListener('visibilitychange',checkUpdate);
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}));
}
