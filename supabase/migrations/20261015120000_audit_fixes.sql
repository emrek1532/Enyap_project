-- Sistem kontrolü (15.10.2026):
-- * Siparişlerin tutarı, KDV dahile çevrilen tekliflerle eşitlendi (yedek: private.orders_amount_backup_20261015)
-- * Teklifte olup müşteri listesinde olmayan "Martek Mekanik" müşteri olarak eklendi
-- * Tetikleyici fonksiyonu API'den çağrılamaz
revoke execute on function public.quote_items_autocode() from authenticated, anon, public;
