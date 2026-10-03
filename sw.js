
const CACHE='jjikgyebu-v2';
const APP=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('jjikgyebu-') && k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  if(new URL(e.request.url).origin!==location.origin) return;
  e.respondWith(
    fetch(e.request).then(resp=>{
      if(resp.ok){
        const copy=resp.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return resp;
    }).catch(async()=>{
      const cached=await caches.match(e.request);
      if(cached) return cached;
      if(e.request.mode==='navigate') return caches.match('./index.html');
      return Response.error();
    })
  );
});
