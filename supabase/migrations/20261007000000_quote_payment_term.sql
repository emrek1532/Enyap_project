-- Teklifin ödeme / vade koşulu (PEŞİN, KREDİ KARTI, 60 GÜN, 90 GÜN)
alter table public.quotes add column if not exists payment_term text;
