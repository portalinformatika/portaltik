/* Service Worker — Portal Informatika
 * - Berkas statis: stale-while-revalidate (buka instan, diperbarui diam-diam)
 * - Pustaka CDN (Chart.js, SheetJS, jsPDF, ikon, font): cache pertama, aman karena versi dipatok
 * - Permintaan ke Google Apps Script TIDAK PERNAH di-cache (data selalu segar)
 * Naikkan VERSI setiap kali berkas frontend diubah agar pengguna menerima pembaruan. */
const VERSI = 'pj-pro-5.0.0';
const STATIS = VERSI + '-static', CDN = VERSI + '-cdn';
const INTI = ['./', './index.html', './css/style.css', './js/config.js', './js/api.js', './js/app.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
const HOST_CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(STATIS).then(c => c.addAll(INTI)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf(VERSI) !== 0).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname.indexOf('google.com') > -1 && url.pathname.indexOf('/macros/') === 0) return;   // API: langsung ke jaringan
  if (url.hostname.indexOf('googleusercontent.com') > -1) return;
  if (HOST_CDN.indexOf(url.hostname) > -1) {   // cache pertama
    e.respondWith(caches.open(CDN).then(c => c.match(req).then(hit => hit || fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }))));
    return;
  }
  if (url.origin === location.origin) {   // stale-while-revalidate
    e.respondWith(caches.open(STATIS).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
      return hit || net.then(r => r || (req.mode === 'navigate' ? c.match('./index.html') : Response.error()));
    })));
  }
});
