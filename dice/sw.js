const CACHE="poker-dice-v2-20260813";
const CORE=["./","./index.html","./styles.css","./config.js","./manifest.json","./src/main.js","./src/photon-room.js","./src/game-model.js","./src/rules.js","./vendor/photon.min.js",...Array.from({length:6},(_,i)=>`./textures/face${i+1}.png`)];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request)));});
