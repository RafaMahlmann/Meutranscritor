self.addEventListener('install', e => e.waitUntil(
  caches.open('vox-v1').then(c => c.addAll(['/']))
));
self.addEventListener('fetch', e => {
  if (e.request.url.includes('localhost:8000/v1/audio')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
