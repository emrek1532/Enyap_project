// Enyap Isı Portalı service worker: uygulama kabuğunu önbelleğe alır,
// böylece portal mobilde çevrimdışıyken de açılır. Supabase istekleri önbelleğe alınmaz.
const CACHE = 'enyap-shell-v9';
// WhatsApp vb. uygulamalardan "Paylaş" ile gelen PDF burada bekletilir, uygulama açılınca okunur
const SHARE_CACHE = 'enyap-share';
const SHELL = ['/', '/index.html', '/icon.svg', '/logo.png', '/icon-192.png', '/icon-512.png', '/logo-splash.png'];

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
        const form = await req.clone().formData();
        // Alan adı ne olursa olsun ilk dosyayı al
        let file = null;
        for (const [, v] of form.entries()) { if (v && typeof v !== 'string' && v.size > 0) { file = v; break; } }
        if (file) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put('/shared-pdf', new Response(file, {
            headers: { 'content-type': file.type || 'application/pdf', 'x-file-name': encodeURIComponent(file.name || 'teklif.pdf') },
          }));
          return Response.redirect('/?shared-pdf=1', 303);
        }
      } catch (e) { /* okunamadı: sunucu denesin */ }
      // Dosya bulunamadı: sunucu da denesin (o da bulamazsa nedenini yazar)
      return fetch(req);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  // Sürüm kontrolü gibi "önbellek kullanma" denen istekler doğrudan ağa gider
  if (req.cache === 'no-store') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Uygulama ayar dosyası (manifest) her zaman sunucudan: telefon güncel paylaşım ayarını alsın
  if (url.pathname === '/manifest.webmanifest') return;

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

// Bildirim (teklif hatırlatma): sunucudan gelir, uygulama kapalıyken de gösterilir
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Enyap', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Enyap', {
    body: d.body || '', tag: d.tag, data: { url: d.url || '/' },
    icon: '/icon-192.png', badge: '/icon-192.png', vibrate: [120, 60, 120],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { await w.navigate(url).catch(() => undefined); return w.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
