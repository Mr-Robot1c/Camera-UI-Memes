// Cache only this app's static files, never private hosting login pages or videos.
const CACHE = 'itsgiving-static-v1';
const STATIC = /\.(?:js|css|png|jpe?g|gif|svg|wasm|task|webmanifest)$/;
// Scope root ('/' at the domain root, '/Camera-UI-Memes/' on GitHub Pages).
const BASE = new URL('./', self.location).pathname;
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./icon.svg', './icon-192.png', './manifest.webmanifest']))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('itsgiving-static-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async response => {
      if (response.ok && !response.redirected && new URL(response.url).pathname === BASE && (response.headers.get('content-type') || '').includes('text/html')) {
        const html = await response.clone().text();
        if (html.includes('id="root"') && html.includes('Meme camera')) { const cache = await caches.open(CACHE); await cache.put(BASE, response.clone()); }
      }
      return response;
    }).catch(async () => (await caches.match(BASE)) || new Response('Mở app khi có mạng để tải lần đầu.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
    return;
  }
  if (!STATIC.test(url.pathname) || url.pathname === self.location.pathname) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(request); if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && !response.redirected && !(response.headers.get('content-type') || '').includes('text/html')) await cache.put(request, response.clone());
    return response;
  }));
});
