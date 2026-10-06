-- Arşiv kaldırıldı: arşivdeki teklifler tekrar "Beklemede" (gonderildi) durumuna alınır
update public.quotes set status = 'gonderildi' where status = 'arsiv';
