const CACHE='vox-v5';

self.addEventListener('install', e => {
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', e => {
  // Só GET: POSTs de APIs (AssemblyAI /v2, Gladia, etc.) não podem ser cacheados
  // — cache.put(POST) lança erro e derruba a chamada.
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  // Só mesma origem: APIs externas e fontes seguem direto pra rede.
  if (!url.startsWith(self.location.origin)) return;
  // HTML sempre vai para a rede (nunca cachear o app — updates instantâneos).
  if (e.request.headers.get('accept')?.includes('text/html') || url.endsWith('/')) return;
  // Demais recursos same-origin (ícones, manifest): cache-first.
  e.respondWith(caches.open(CACHE).then(c =>
    c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; }))
  ));
});
