// Enyap Isı Portalı service worker: uygulama kabuğunu önbelleğe alır,
// böylece portal mobilde çevrimdışıyken de açılır. Supabase istekleri önbelleğe alınmaz.
const CACHE = 'enyap-shell-v5';
// WhatsApp vb. uygulamalardan "Paylaş" ile gelen PDF burada bekletilir, uygulama açılınca okunur
const SHARE_CACHE = 'enyap-share';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/logo.png', '/icon-192.png', '/icon-512.png', '/logo-splash.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const shareUrl = new URL(req.url);
  // Paylaş menüsünden gelen PDF: sakla, uygulamayı "yeni teklif" ile aç
  if (req.method === 'POST' && shareUrl.origin === self.location.origin && shareUrl.pathname === '/share-target') {
    event.respondWith((async () => {
      try {
        const form = await req.formData();
        const file = form.getAll('file').find((f) => f && typeof f !== 'string');
        if (file) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put('/shared-pdf', new Response(file, {
            headers: { 'content-type': file.type || 'application/pdf', 'x-file-name': encodeURIComponent(file.name || 'teklif.pdf') },
          }));
          return Response.redirect('/?shared-pdf=1', 303);
        }
      } catch (e) { /* paylaşım okunamadı */ }
      return Response.redirect('/?shared-pdf=0', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  // Sürüm kontrolü gibi "önbellek kullanma" denen istekler doğrudan ağa gider
  if (req.cache === 'no-store') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Sayfa gezintisi: önce ağ, olmazsa önbellekteki index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Statik dosyalar: önce önbellek, arka planda güncelle
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
