const CACHE='vox-v7';
const PRECACHE=[
  './media/vox-intro.mp4'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
// ── Web Share Target (Android) ──
// O site é estático (GitHub Pages/afins): um POST de verdade pra "./share-target"
// bateria 404/405 no servidor. É o Service Worker quem intercepta a requisição
// ANTES dela sair pra rede, tira o arquivo de dentro do multipart/form-data, guarda
// no mesmo IndexedDB (vox_db/kv) que o app já usa, e manda o navegador pro app com
// ?compartilhado=1 — quem lê e processa o arquivo é o handleShareTarget() no index.html.
const SHARE_DB='vox_db', SHARE_STORE='kv', SHARE_KEY='share_target_pending';
function _openShareDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(SHARE_STORE)) req.result.createObjectStore(SHARE_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
self.addEventListener('fetch', e => {
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const formData = await e.request.formData();
        const file = formData.get('audio');
        if (file && file.size > 0) {
          const db = await _openShareDB();
          await new Promise((resolve, reject) => {
            const tx = db.transaction(SHARE_STORE, 'readwrite');
            tx.objectStore(SHARE_STORE).put(file, SHARE_KEY);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
        }
      } catch (err) { /* sem arquivo válido — o app avisa sozinho que não recebeu nada */ }
      return Response.redirect('./?compartilhado=1', 303);
    })());
    return;
  }
  // Só GET: POSTs de APIs (AssemblyAI /v2, Gladia, etc.) não podem ser cacheados
  // — cache.put(POST) lança erro e derruba a chamada.
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  // Só mesma origem: APIs externas e fontes seguem direto pra rede.
  if (!url.startsWith(self.location.origin)) return;
  // HTML sempre vai para a rede (nunca cachear o app — updates instantâneos).
  if (e.request.headers.get('accept')?.includes('text/html') || url.endsWith('/')) return;
  // Demais recursos same-origin (ícones, manifest, vídeo): cache-first.
  e.respondWith(caches.open(CACHE).then(c =>
    c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; }))
  ));
});
