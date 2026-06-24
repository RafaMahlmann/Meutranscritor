const CACHE='vox-v3';
const SKIP=['/', '/index.html'];

self.addEventListener('install', e => {
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = e.request.url;
  // nunca intercepta API
  if (url.includes('/v1/')) return;
  // HTML sempre vai para a rede (sem cache)
  if (SKIP.some(p => url.endsWith(p)) || e.request.headers.get('accept')?.includes('text/html')) return;
  // demais recursos: cache-first
  e.respondWith(caches.open(CACHE).then(c =>
    c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; }))
  ));
});
