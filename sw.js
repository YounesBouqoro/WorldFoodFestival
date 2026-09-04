const CACHE_NAME='wff-pos-shell-v11';
const LOCAL_ASSETS=[
  './','./index.html','./drinks.html','./admin.html','./receipt.html',
  './styles.css','./access.css','./deposit.css','./mobile-pos.css','./receipt-actions.css','./admin.css','./receipt.css','./pwa.css',
  './offline-store.js','./index.js','./app.js','./returns.js','./admin.js','./receipt.js','./pwa.js','./manifest.webmanifest','./app-icon-192.png','./apple-touch-icon.png','./app-icon.svg','./app-icon-maskable.svg'
];
const SUPABASE_CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(LOCAL_ASSETS);
    try{await cache.add(new Request(SUPABASE_CDN,{mode:'no-cors'}));}catch{}
    self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  if(url.hostname.endsWith('.supabase.co'))return;

  if(url.href.startsWith(SUPABASE_CDN)){
    event.respondWith((async()=>{
      const cached=await caches.match(request);
      if(cached)return cached;
      try{
        const response=await fetch(request);
        const cache=await caches.open(CACHE_NAME);
        cache.put(request,response.clone());
        return response;
      }catch{
        return caches.match(SUPABASE_CDN);
      }
    })());
    return;
  }

  if(url.origin!==self.location.origin)return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        const cache=await caches.open(CACHE_NAME);
        cache.put(request,response.clone());
        return response;
      }catch{
        return (await caches.match(request)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(request);
    const network=fetch(request).then(async response=>{
      if(response&&response.ok){
        const cache=await caches.open(CACHE_NAME);
        cache.put(request,response.clone());
      }
      return response;
    }).catch(()=>null);
    return cached || (await network) || new Response('',{status:503,statusText:'Offline'});
  })());
});

async function refreshAppCache(){
  const cache=await caches.open(CACHE_NAME);
  for(const asset of LOCAL_ASSETS){
    try{
      const url=new URL(asset,self.registration.scope).href;
      const response=await fetch(new Request(url,{cache:'reload'}));
      if(response&&response.ok)await cache.put(url,response.clone());
    }catch{}
  }
  try{
    const response=await fetch(new Request(SUPABASE_CDN,{cache:'reload',mode:'no-cors'}));
    if(response)await cache.put(SUPABASE_CDN,response.clone());
  }catch{}
}

self.addEventListener('message',event=>{
  const type=event.data?.type;
  if(type==='SKIP_WAITING'){
    self.skipWaiting();
    return;
  }
  if(type==='REFRESH_APP_CACHE'){
    event.waitUntil((async()=>{
      await refreshAppCache();
      event.ports?.[0]?.postMessage({ok:true,cache:CACHE_NAME});
    })());
  }
});