// sw.js
const CACHE = 'mvd-v7-B';
const PRECACHE_URLS = [
  './',
  './index.html',
  './weekly.html',
  './style.css',
  './main.js',
  './weekly.js',
  './db.js',
  './manifest.json'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});
