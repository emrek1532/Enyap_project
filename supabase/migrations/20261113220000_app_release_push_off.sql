-- Yeni sürüm push bildirimi kapatıldı (kullanıcı isteği): yalnız uygulama açıkken üstteki "Yeni sürüm hazır" şeridi görünür.
-- check_app_release fonksiyonu ve private.app_release tablosu duruyor; yeniden açmak için:
--   select cron.schedule('app-release-push', '*/5 * * * *', 'select public.check_app_release()');
select cron.unschedule('app-release-push');
