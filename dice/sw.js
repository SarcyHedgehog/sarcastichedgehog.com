// sw.js - A simple caching service worker

const CACHE_NAME = "poker-dice-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  // Add other static assets here if you want them cached
  // e.g., '/styles.css', '/manifest.json', '/icons/icon-192x192.png'
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }
      // Not in cache - fetch from network
      return fetch(event.request);
    })
  );
});
