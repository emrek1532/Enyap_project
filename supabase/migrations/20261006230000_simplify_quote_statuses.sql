-- Sevkiyat takibi kaldırıldı: siparişe dönüştürülmüş teklifler yeniden "Onaylandı"
update public.quotes set status = 'onaylandi', updated_at = now() where status = 'siparis';
-- Ara durumlar (yeni talep / hazırlanıyor / revizyon) "Beklemede" (gonderildi) altında toplanır
update public.quotes set status = 'gonderildi', updated_at = now() where status in ('yeni_talep','hazirlaniyor','revizyon');
