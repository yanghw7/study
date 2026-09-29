const CACHE='study-pwa-v11.07';
const CORE=['./','./index.html','./study.html','./lecture.html','./sleep.html','./record.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];

self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){ if('focus' in c) return c.focus(); }
    if(self.clients.openWindow) return self.clients.openWindow('./index.html');
  }));
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;

  let url;
  try{ url = new URL(e.request.url); }catch(_){ return; }

  // API/외부 리소스는 SW 캐시에 넣지 않는다. Supabase, GitHub, CDN, 폰트 등의
  // 불필요한 CacheStorage 증가와 오래된 외부 응답 재사용을 막는다.
  if(url.origin !== self.location.origin || url.hostname.includes('supabase.co')) return;

  e.respondWith(
    fetch(e.request)
      .then(r=>{
        if(r && r.ok){
          const copy=r.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
        }
        return r;
      })
      .catch(()=>caches.match(e.request).then(r=>r||new Response('',{status:504,statusText:'Offline'})))
  );
});