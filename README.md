# Enyap Isı – Saha ve Ofis Takip Portalı

Isparta saha satış ekibi ile İstanbul merkez ofisin teklif, sipariş/sevkiyat, ortak takvim ve notlarını
tek yerden takip ettiği web uygulaması. Telefon, tablet ve bilgisayarda çalışır; telefona
"Ana Ekrana Ekle" ile uygulama gibi kurulabilir (PWA).

## Mimari

- **Arayüz:** React 19 + Vite + Tailwind CSS (statik site, herhangi bir statik barındırmada çalışır)
- **Veritabanı / Giriş:** Supabase (Postgres + Auth + Realtime)
  - Proje: `business development` (`aaduhhdwemnyqhnttcat`)
  - Tablolar: `quotes`, `orders`, `events`, `notes`, `activities`, `profiles`
  - Şema: `supabase/migrations/`
  - Güvenlik: RLS açık; verilere yalnızca giriş yapmış kullanıcılar erişebilir
- **Canlı eşitleme:** Bir cihazda yapılan değişiklik diğer cihazlara anında yansır (Supabase Realtime).
- **Çevrimdışı çalışma:** İnternet yokken yapılan değişiklikler cihazda kuyruğa alınır, bağlantı
  gelince otomatik olarak Supabase'e gönderilir.

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:3000
```

Üretim derlemesi:

```bash
npm run build      # çıktı: dist/
npm run preview    # derlenmiş sürümü yerelde dener
```

Supabase bağlantı bilgileri `src/lib/supabase.ts` içinde varsayılan olarak tanımlıdır. Farklı bir
proje kullanmak için `.env.example` dosyasını `.env` olarak kopyalayıp değerleri değiştirin.

## Yayınlama (web + mobil)

`dist/` klasörü statik olduğu için Vercel, Netlify, Cloudflare Pages veya GitHub Pages'e doğrudan
yüklenebilir:

- **Build komutu:** `npm run build`
- **Çıktı klasörü:** `dist`
- (İsteğe bağlı) Ortam değişkenleri: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

Yayınladıktan sonra Supabase Dashboard → **Authentication → URL Configuration** bölümünde
**Site URL** alanına sitenin adresini yazın (e-posta doğrulama bağlantıları bu adrese yönlenir).

Telefona kurulum: siteyi telefonda açın → Safari'de *Paylaş → Ana Ekrana Ekle*, Android Chrome'da
*⋮ → Uygulamayı yükle*.

## İlk kullanım

1. Uygulamayı açın, **Kayıt Ol** sekmesinden hesap oluşturun (Isparta / İstanbul seçerek).
2. E-postanıza gelen doğrulama bağlantısına tıklayın, ardından giriş yapın.
3. Örnek verilerle denemek için: *Aktarım* sekmesi → paneli açın → **Örnek Verileri Yükle**
   (dikkat: buluttaki tüm verileri siler ve örnek verilerle değiştirir).
4. Ekipteki herkes hesabını açtıktan sonra, yabancıların kayıt olmasını engellemek için
   Supabase Dashboard → **Authentication → Sign In / Providers → Email** altında
   **Allow new users to sign up** seçeneğini kapatın.
