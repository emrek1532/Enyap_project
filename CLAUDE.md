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
- Veri, eşitleme, Supabase: `src/lib/db.ts`, `src/lib/supabase.ts`; şema `supabase/migrations/`; Edge Function'lar `supabase/functions/`.
- Yapay zekâ uçları ve bildirimler: `worker/index.ts`.
- Yetkiler: `src/lib/access.ts`. Para/sayı/tarih: `lib/money.ts`, `lib/num.ts`, `lib/dates.ts`.

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
- Kaldırılanlar (geri ekleme): öneriler kartı, tedarikçi siparişi, iskonto hafızası, toplu PDF yükleme, fiyat karşılaştır, sipariş/takvim modülleri, aciliyet/proje alanları, eski ziyaret planı (`visits` tablosu), sabit hızlı not düğmesi, sol menüdeki "Raporları Gör" kartı, ana sayfadaki Türkiye haritası (tablolar `orders`, `events`, `visits` arşivde durur).
- İptal = sipariş olup sonra iptal; neden sorulmaz. Bekleyen tekliflerde "Neden bekliyor?" (`lost_reason` alanı, "neden · not"). "Müşteri düşünüyor" dışında bir neden seçilen teklif **Pasif** sayılır (kayıtta durum `gonderildi` kalır; `isPassive`/`isPendingQuote` `lib/quoteRules.ts`): bekleyenlerde, takipte ve tahminde sayılmaz.
