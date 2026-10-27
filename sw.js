/* GRIM/OS service worker: makes the site installable + quick repeat loads.
   HTML: network-first (offline fallback to cache). Static assets: cache-first, keyed by full URL, so the
   pre-commit ?v=<stamp> cache-bust still works (new URL = new entry). Audio/media is never cached here
   (range requests stream straight from the network). VERSION comes from the registration URL (sw.js?v=...). */
const VERSION = new URL(self.location).searchParams.get('v') || '0';
const CACHE = 'grimos-' + VERSION;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/assets/icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('grimos-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (/\.(mp3|wav|m4a|ogg|mp4)$/i.test(u.pathname) || r.headers.has('range')) return; // audio: network only
  if (r.mode === 'navigate' || (r.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); return res; }).catch(() => caches.match(r).then(m => m || caches.match('/'))));
    return;
  }
  if (/\.(css|js|png|jpg|jpeg|svg|ico|woff2?|ttf|webmanifest)$/i.test(u.pathname) && u.pathname !== '/sw.js' && !u.pathname.endsWith('tracks.json')) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); } return res; })));
  }
});
