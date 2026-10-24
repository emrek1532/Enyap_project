# Enyap Isı — Teklif & Satış Takibi

Kullanıcıyla Türkçe, kısa yazış. Değişiklikleri yayına almak için: dalı `origin/main`'den aç, commit, PR oluştur, squash ile birleştir (Cloudflare Worker `enyap-project` main'den otomatik yayınlanır).

Kullanıcı yazılım ve yapay zekâyı öğrenmek istiyor: her işte, yapılan işlemi ve geçen kavramları (RAG, ajan, API, migration vb.) uygulamadan örnekle 2-4 cümleyle sade Türkçe açıkla.

## Yapı
- React + Vite + Tailwind v4 (`src/`), Cloudflare Worker (`worker/index.ts`: /api/ai/voice, /api/ai/pdf, /api/ai/pricelist, /api/ai/match, /api/ai/ask, /api/ai/agent, /api/ai/request, /api/push/send, /share-target).
- Supabase projesi `aaduhhdwemnyqhnttcat`. Şema değişiklikleri `supabase/migrations/` altında.
- Veri eşitleme: `src/lib/db.ts`. Tam indirme günde bir; arada `synced_at` ile sadece değişenler (`fetchChanges`/`mergeChanges`). Kullanımı artıracak (sık/tam indirme yapan) değişiklik ekleme.
- Fiyat listeleri: `src/lib/pricelistCore.ts` (ayrıştırma + kaydetme, uygulama ve sunucu ortak). PDF yazısı uygulamada okunur, gerisi Supabase Edge Function `pricelist-import`'ta (kaynak `supabase/functions/pricelist-import/src.ts`, derleme `npm run build:fn`, yayın Supabase MCP `deploy_edge_function`). İş durumu `pricelist_jobs` tablosunda.
- Fiyat listesi eşleştirme (SQL `supplier_match_core`, her yüklemede): 1) parmak izi `part_fp` (tür|DN|özellik), 2) kuruşlu fiyat birebir + ölçü + tür (`supplier_price_pair`), 3) marka/kod/benzerlik; kalanlar yapay zekâya. Elle bağlanınca `supplier_learn` aynı adlı diğer ölçüleri aynı kod ailesine bağlar.
- RAG (yapay zekâ, vektör yok): eşleştirmede `supplier_ai_batch` pg_trgm ile adayları bulur, `/api/ai/match` seçer, `supplier_ai_apply` yazar (`ai_checked`); "Tekliflere sor" (`AskQuotes.tsx`) ilgili teklif satırlarını cihazda bulup `/api/ai/ask`'e gönderir. "Teklif taslağı hazırla" (`QuoteAgent.tsx`) ajandır: model `/api/ai/agent` üzerinden araç ister, araçlar cihazda çalışır, taslak doğrulanıp teklif formu dolu açılır. Önce `lib/quickDraft.ts` kurallarla dener (firma + o firmaya son verilen fiyat/iskonto, yoksa katalog); kesinse yapay zekâya gidilmez, kota doluysa bulunanlarla taslak açılır.
- Müşteri talebi okuma (`RequestReader.tsx`, `lib/requestRead.ts`): yazı/Excel kurallarla cihazda (`parseRequestText`, yapay zekâsız), fotoğraf `/api/ai/request` (Mistral Small 3.1 görsel, yedek Llama 3.2 Vision) ile satırlara ayrılır; ürün tercihli kural (`app_settings.preferred-products`: kelime → kod öneki) + ölçüyle seçilir, olmazsa kullanıcı seçer.
- Mikro teklif kontrolü (`lib/quoteCheck.ts`): teklif formunda "PDF'ten doldur" sonrası kalemler liste fiyatı ve liste iskontosuyla karşılaştırılır; uyarı verir, kaydı engellemez.
- Google Sheets eşitleme: tetikleyiciler + Apps Script (`integrations/google-sheets/Code.gs`; gizli anahtar repoda yer tutucu).

## Kurallar
- SQL'de DELETE ve DROP kelimelerini yazma (onay adımı zaman aşımına uğruyor); silme gerekiyorsa SQL'i kullanıcıya ver.
- Carilere (müşteriler) ekleme/çıkarma yapma; değişiklik öncesi yedek al.
- Yeni özellik eklemeden önce veri/istek kullanımına etkisine bak.
- Kaldırılanlar (geri ekleme): öneriler kartı, tedarikçi siparişi, iskonto hafızası, toplu PDF yükleme, fiyat karşılaştır, sipariş/takvim modülleri, aciliyet/proje alanları.
- İptal = sipariş olup sonra iptal; neden sorulmaz. Bekleyen tekliflerde "Neden bekliyor?" (`lost_reason` alanı, "neden · not").
