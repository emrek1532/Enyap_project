# Enyap Isı — Teklif & Satış Takibi

Kullanıcıyla Türkçe, kısa yazış. Değişiklikleri yayına almak için: dalı `origin/main`'den aç, commit, PR oluştur, squash ile birleştir (Cloudflare Worker `enyap-project` main'den otomatik yayınlanır).

## Yapı
- React + Vite + Tailwind v4 (`src/`), Cloudflare Worker (`worker/index.ts`: /api/ai/voice, /api/ai/pdf, /api/ai/pricelist, /api/push/send, /share-target).
- Supabase projesi `aaduhhdwemnyqhnttcat`. Şema değişiklikleri `supabase/migrations/` altında.
- Veri eşitleme: `src/lib/db.ts`. Tam indirme günde bir; arada `synced_at` ile sadece değişenler (`fetchChanges`/`mergeChanges`). Kullanımı artıracak (sık/tam indirme yapan) değişiklik ekleme.
- Fiyat listeleri: `src/lib/pricelistCore.ts` (ayrıştırma + kaydetme, uygulama ve sunucu ortak). PDF yazısı uygulamada okunur, gerisi Supabase Edge Function `pricelist-import`'ta (kaynak `supabase/functions/pricelist-import/src.ts`, derleme `npm run build:fn`, yayın Supabase MCP `deploy_edge_function`). İş durumu `pricelist_jobs` tablosunda.
- Google Sheets eşitleme: tetikleyiciler + Apps Script (`integrations/google-sheets/Code.gs`; gizli anahtar repoda yer tutucu).

## Kurallar
- SQL'de DELETE ve DROP kelimelerini yazma (onay adımı zaman aşımına uğruyor); silme gerekiyorsa SQL'i kullanıcıya ver.
- Carilere (müşteriler) ekleme/çıkarma yapma; değişiklik öncesi yedek al.
- Yeni özellik eklemeden önce veri/istek kullanımına etkisine bak.
- Kaldırılanlar (geri ekleme): öneriler kartı, tedarikçi siparişi, iskonto hafızası, toplu PDF yükleme, fiyat karşılaştır, sipariş/takvim modülleri, aciliyet/proje alanları.
- İptal = sipariş olup sonra iptal; neden sorulmaz. Bekleyen tekliflerde "Neden bekliyor?" (`lost_reason` alanı, "neden · not").
