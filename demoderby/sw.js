const CACHE = "demoderby-photon-v10";
const FILES = ["./","index.html","styles.css","fixes.css","config.js","manifest.json","icon.svg","src/main.js","src/constants.js","src/game-model.js","src/photon-room.js","src/practice-room.js","src/arena-view.js","src/audio-engine.js","vendor/photon.min.js",...Array.from({length:8},(_,i)=>`assets/${i+1}car.png`)];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request))) });
