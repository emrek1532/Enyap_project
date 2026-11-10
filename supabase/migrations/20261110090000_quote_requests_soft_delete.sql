-- Talep silme (yumuşak): silinen talebe tarih yazılır, listelerde görünmez. Kayıt ve dosyalar durur (geri alınabilir).
-- Silinen talep ayrıca "iptal" yapılır; böylece 4 saat hatırlatması da gitmez.
alter table public.quote_requests add column if not exists deleted_at timestamptz;
