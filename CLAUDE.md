# Enyap Isı — Teklif & Satış Takibi

Kullanıcıyla Türkçe, kısa yazış. Değişiklikleri yayına almak için: dalı `origin/main`'den aç, commit, PR oluştur, squash ile birleştir (Cloudflare Worker `enyap-project` main'den otomatik yayınlanır).

Kullanıcı yazılım ve yapay zekâyı öğrenmek istiyor: her işte, yapılan işlemi ve geçen kavramları (RAG, ajan, API, migration vb.) uygulamadan örnekle 2-4 cümleyle sade Türkçe açıkla.

## Yapı
- React + Vite + Tailwind v4 (`src/`), Cloudflare Worker (`worker/index.ts`: /api/ai/voice, /api/ai/pdf, /api/ai/pricelist, /api/ai/match, /api/ai/ask, /api/ai/agent, /api/ai/request, /api/push/send, /share-target).
- Supabase projesi `aaduhhdwemnyqhnttcat`. Şema değişiklikleri `supabase/migrations/` altında.
- Veri eşitleme: `src/lib/db.ts`. Tam indirme günde bir; arada `synced_at` ile sadece değişenler (`fetchChanges`/`mergeChanges`). Kullanımı artıracak (sık/tam indirme yapan) değişiklik ekleme.
- Google Sheets eşitleme: tetikleyiciler + Apps Script (`integrations/google-sheets/Code.gs`; gizli anahtar repoda yer tutucu).

## Dosya haritası (iş → bakılacak yer)
- Teklif/müşteri/tahsilat/harcama ekranları: `src/components/*Manager|*Panel*.tsx`, ana sayfa `SimpleHome.tsx`, yönlendirme `src/App.tsx`.
- Müşteri talepleri (Talepler, talep gir → ata → oku → teklife dönüştür): `RequestsPanel.tsx`, `lib/requests.ts`, tablo `quote_requests`; ayrıntı `docs/yapay-zeka.md`.
- WhatsApp "Paylaş": her paylaşımda (yazı/fotoğraf/Excel/PDF) "Talep mi, teklif mi?" sorulur (`shareAsk`, `App.tsx`; `public/sw.js`). Talep → Talep gir; Teklif → PDF ise "PDF'ten doldur", değilse Talep gir "Teklif hazırla" kipi (`mode: quote`: kaydet + otomatik hazırla). Sistemdeki teklif no taşıyan PDF sorusuz o teklifi açar. Excel/PDF'te üçüncü seçenek "Mikro cari bakiyeleri" (yetkiliye; dosya adında bakiye/cari/mikro… varsa önerilen) → Müşteriler'de Mikro bakiyesi penceresi dosyayla açılır.
- Notlar/görevler (`QuickNotesPanel`, `NoteComposer`): not "Kime" ile birine atanır (`notes.assigned_to`), atanan işaretleyene kadar açık; yönetici hepsini, diğerleri kendi yazdığı + kendine atananı görür; bildirim/rozet `20261112090000_note_tasks.sql`.
- Teklif onayı: "Onaylandı" yapılınca `quotes.approved_by/approved_at` yazılır, teklifi gören yönetici olmayanlara "Teklif onaylandı · işleme al" bildirimi (`20261112100000_quote_approved_notify.sql`); teklif penceresinde "Onaylayan: …". Teklifler'de "Sipariş bekleyen" şeridi/süzgeci (`isOrderWaiting`, `lib/quoteRules.ts`); teklif penceresinde "Siparişe aldım" düğmesi (RPC `mark_quote_processed`, `processed_by/processed_at`; yöneticiye "Siparişe alındı" bildirimi); ekipte menü/simge sayısına eklenir. Engelleyen pencere kaldırıldı (geri ekleme).
- Yeni sürüm uyarısı: yalnız uygulama açıkken üstte "Yeni sürüm hazır" şeridi (`lib/appUpdate.ts`). Telefona push kapalı (kullanıcı istemedi; cron `app-release-push` kaldırıldı, `20261113220000_app_release_push_off.sql`; geri açma).
- Atanan iş hatırlatması: `send_assigned_reminders` (cron `assigned-reminders`, 30 dk, İstanbul 08-20, pazar hariç) kişi başına tek özet bildirim: açık görev notları + atanmış talepler + sipariş bekleyen onaylı teklifler (`20261113090000_assigned_reminders.sql`).
- Veri, eşitleme, Supabase: `src/lib/db.ts`, `src/lib/supabase.ts`; şema `supabase/migrations/`; Edge Function'lar `supabase/functions/`.
- Yapay zekâ uçları ve bildirimler: `worker/index.ts`.
- Yetkiler: `src/lib/access.ts`. Para/sayı/tarih: `lib/money.ts`, `lib/num.ts`, `lib/dates.ts`. Para her yerde tam ve iki haneli yazılır (`trMoney`: 439.345,15); ana sayfa (`SimpleHome`) kuruşsuz tam tutar; kısaltma (M/B) yalnız grafik eksenlerinde.

## Detay dosyaları (yalnız ilgili işe başlarken oku; hepsini okuma)
- `docs/fiyat-listesi.md`: fiyat listesi yükleme (PDF/Excel), SQL eşleştirme kuralları, öğrenme, Excel şablonu. `suppliers.ts`, `pricelistCore.ts`, `pricelist-import`.
- `docs/yapay-zeka.md`: Tekliflere sor (RAG), Teklif hazırla ajanı, hızlı araçlar (Ara/Sor/Sesle), müşteri talebi okuma.
- `docs/arayuz.md`: yerleşim (menü, bantlar, ana sayfa), liste sayfaları, pencere stili, hız kuralları, deneme sayfaları (`/preview3/...`).
- `docs/mikro-kontrol.md`: "PDF'ten doldur" sonrası teklif kontrolü (`quoteCheck.ts`).
- `docs/yonetim-izinler.md`: Kişi Ekle, `profiles.perms`, modüller/bayraklar, teklif sahipliği ve paylaşım.

## Kurallar
- Sürüm: her güncellemede (her PR) `package.json` "version" bir artırılır (1.1.0 → 1.1.1 …; büyük özellikte ikinci hane: 1.2.0). Uygulamanın sağ üstünde `v…` olarak görünür (`__APP_VERSION__`).
- Token tasarrufu: SQL/araç sonuçlarını özet döndür (sayı + 5-10 örnek, `count`/`limit`); tüm listeyi ekrana dökme, toplu işi veritabanında yap. Kullanıcıya her yeni iş için yeni oturum öner.
- SQL'de DELETE ve DROP kelimelerini yazma (onay adımı zaman aşımına uğruyor); silme gerekiyorsa SQL'i kullanıcıya ver.
- Carilere (müşteriler) ekleme/çıkarma yapma; değişiklik öncesi yedek al.
- Yeni özellik eklemeden önce veri/istek kullanımına etkisine bak.
- Kaldırılanlar (geri ekleme): öneriler kartı, tedarikçi siparişi, iskonto hafızası, toplu PDF yükleme, fiyat karşılaştır, sipariş/takvim modülleri, aciliyet/proje alanları, teklif etiketi ve "şifreli" alanı, eski ziyaret planı (`visits` tablosu), sabit hızlı not düğmesi, sol menüdeki "Raporları Gör" kartı, ana sayfadaki Türkiye haritası, müşterilerde "Uğradım"/ziyaret sekmeleri, "Bugünün Rotası" ve A/B/C sınıf rozeti/süzgeci, "Tekrar görüş" rozeti/süzgeci, müşteri listesindeki göz/kalem/⋯ simgeleri (her işlem müşteri kartından), çevrimdışı malzeme kataloğu ("Cihaza indir / yenile") (tablolar `orders`, `events`, `visits` arşivde durur).
- Yedek "EMRE GÜNCEL": eski ana sayfa (v1.15.3) GitHub'da `EMRE-GUNCEL` dalında (commit `b715e76`). Kullanıcı "EMRE GÜNCEL yükle" derse: `origin/main`'den dal aç, `git checkout origin/EMRE-GUNCEL -- src/components/SimpleHome.tsx src/components/Sidebar.tsx src/App.tsx preview3/app.tsx preview3/lists.tsx` ile ana sayfayı ve menüyü geri getir (arada eklenen başka işleri koru), sürümü artır, PR ile yayına al.
- İptal = sipariş olup sonra iptal; neden sorulmaz. Bekleyen tekliflerde "Neden bekliyor?" (`lost_reason` alanı, "neden · not"). "Müşteri düşünüyor" dışında bir neden seçilen teklif **Pasif** sayılır (kayıtta durum `gonderildi` kalır; `isPassive`/`isPendingQuote` `lib/quoteRules.ts`): bekleyenlerde, takipte ve tahminde sayılmaz.
