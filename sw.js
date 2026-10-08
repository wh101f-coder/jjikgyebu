const CACHE='jjig-ledger-v1.1.4';
const APP=['./','./index.html','./styles.css?v=1.1.4','./app.js?v=1.1.4','./dashboard.js?v=1.1.4','./chart-callouts.js?v=1.1.4','./excel-core.js?v=1.1.4','./excel-ui.js?v=1.1.4','./batch-core.js?v=1.1.4','./batch-ui.js?v=1.1.4','./refresh.js?v=1.1.4','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('jjig-ledger-') && k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET' || new URL(e.request.url).origin!==location.origin) return;
  if(new URL(e.request.url).pathname.endsWith('/release.json')){e.respondWith(fetch(e.request,{cache:'no-store'}));return;}
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(resp=>{
    if(resp.ok){const copy=resp.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request.mode==='navigate'?'./index.html':e.request,copy)));}
    return resp;
  }).catch(()=>caches.match(e.request).then(cached=>cached || (e.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
