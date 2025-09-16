self.addEventListener('install', evt => {
  evt.waitUntil(caches.open('mvd-v2').then(c => c.addAll(['./','./index.html','./style.css','./main.js','./manifest.json'])));
  self.skipWaiting();
});
self.addEventListener('activate', evt => { self.clients.claim(); });
self.addEventListener('fetch', evt => {
  evt.respondWith(caches.match(evt.request).then(r => r || fetch(evt.request)));
});
