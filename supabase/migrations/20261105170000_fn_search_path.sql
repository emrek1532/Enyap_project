-- Güvenlik denetimi: search_path ayarı eksik fonksiyonlara boş search_path.
-- Gövdelerde tablo/fonksiyon adları şema adıyla (public./private./net.) yazılı;
-- yerleşik fonksiyonlar (round, format, count…) pg_catalog'dan her zaman bulunur.
alter function public.short_tl(numeric) set search_path = '';
alter function public.quote_term_class(text) set search_path = '';
alter function private.touch_synced_at() set search_path = '';
alter function private.push_expense_batch(integer, integer) set search_path = '';
alter function private.expense_push_step(integer) set search_path = '';
