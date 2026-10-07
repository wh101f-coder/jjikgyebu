const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {pullRefreshDistance}=require('./refresh.js');
test('pull requires top-of-page downward intent and sufficient travel',()=>{
 const start={x:100,y:100};
 assert.equal(pullRefreshDistance(start,{clientX:100,clientY:230},0),65);
 assert.equal(pullRefreshDistance(start,{clientX:100,clientY:230},10),0);
 assert.equal(pullRefreshDistance(start,{clientX:220,clientY:230},0),0);
 assert.equal(pullRefreshDistance(start,{clientX:100,clientY:80},0),0);
 assert.ok(pullRefreshDistance(start,{clientX:100,clientY:180},0)<64);
});
function page({offline=false,pending=[],dialog=false,html='v1.1.0'}={}){
 const button={setAttribute(){}},indicator={setAttribute(){},classList:{add(){},remove(){},toggle(){}}},listeners={},calls=[],messages=[];
 const context={URL,AbortSignal,Date,APP_VERSION:'1.1.0',state:{pending},navigator:{},location:{href:'https://example.com/jjikgyebu/',replace:url=>calls.push(url)},toast:m=>messages.push(m),window:{scrollY:0,addEventListener(){}},document:{hidden:false,createElement:()=>indicator,body:{append(){}},querySelector:s=>s==='#appVersion'?button:dialog?{}:null,addEventListener:(type,fn)=>listeners[type]=fn},fetch:async url=>{if(offline)throw Error('offline');return {ok:true,json:async()=>({version:'1.1.0'}),text:async()=>html};}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/refresh.js','utf8'),context);
 return {button,calls,messages,listeners};
}
test('refresh navigates to an uncached URL only after verifying matching online release',async()=>{
 const p=page();await p.button.onclick();assert.equal(p.calls.length,1);assert.match(p.calls[0],/index.html\?refresh=\d+/);
 for(const options of [{offline:true},{html:'v1.0.7'},{pending:[{}]},{dialog:true}]){
  const p=page(options);await p.button.onclick();assert.equal(p.calls.length,0);assert.equal(p.messages.length,1);
 }
});
test('cancelled and short gestures do not reload',()=>{
 const p=page(),target={closest:()=>null};
 p.listeners.touchstart({target,touches:[{clientX:0,clientY:0}]});
 p.listeners.touchmove({touches:[{clientX:0,clientY:50}],cancelable:true,preventDefault(){}});
 p.listeners.touchend();assert.equal(p.calls.length,0);
 p.listeners.touchstart({target,touches:[{clientX:0,clientY:0}]});
 p.listeners.touchmove({touches:[{clientX:0,clientY:200}],cancelable:true,preventDefault(){}});
 p.listeners.touchcancel();p.listeners.touchend();assert.equal(p.calls.length,0);
});
test('a completed pull reloads once and ignores interactive starts',async()=>{
 const p=page();p.listeners.touchstart({target:{closest:()=>null},touches:[{clientX:0,clientY:0}]});
 p.listeners.touchmove({touches:[{clientX:0,clientY:160}],cancelable:true,preventDefault(){}});
 p.listeners.touchend();await new Promise(resolve=>setImmediate(resolve));assert.equal(p.calls.length,1);
 const q=page();q.listeners.touchstart({target:{closest:()=>({})},touches:[{clientX:0,clientY:0}]});
 q.listeners.touchmove({touches:[{clientX:0,clientY:160}],cancelable:true,preventDefault(){}});
 q.listeners.touchend();await new Promise(resolve=>setImmediate(resolve));assert.equal(q.calls.length,0);
});
test('HTML and worker assets carry the release version',()=>{
 const version=JSON.parse(fs.readFileSync(__dirname+'/release.json','utf8')).version;
 const html=fs.readFileSync(__dirname+'/index.html','utf8'),worker=fs.readFileSync(__dirname+'/sw.js','utf8');
 for(const match of html.matchAll(/(?:src|href)="\.\/([^"?]+\.(?:js|css))\?v=([^"]+)"/g)){
  assert.equal(match[2],version);assert.ok(worker.includes(match[1]+'?v='+version));
 }
 assert.ok(html.includes('refresh.js?v='+version));assert.ok(html.includes('v'+version));
});
