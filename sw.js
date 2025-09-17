// sw.js
const CACHE = 'mvd-v5-2025-09-17'; // ← 每次部署改一個新字串
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./','./index.html','./style.css','./main.js','./manifest.json']))
  );
  self.skipWaiting();
});
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});
