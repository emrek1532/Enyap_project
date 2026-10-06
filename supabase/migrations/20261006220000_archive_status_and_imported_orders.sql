alter table public.quotes drop constraint quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('yeni_talep','hazirlaniyor','gonderildi','onaylandi','revizyon','iptal','siparis','arsiv'));

-- Excel'de "Onaylandı" olan teklifler: Sevkiyat'a "Sevk Edildi" siparişi olarak geçer
insert into public.orders (id, order_number, quote_id, quote_number, customer_name, customer_phone, delivery_address, city,
  items_summary, total_amount, currency, order_date, target_shipping_date, actual_shipping_date, carrier_company,
  status, status_notes, created_by, created_at, updated_at)
select 'ord-' || q.id,
       'SP-' || coalesce(nullif(q.quote_number, '-'), upper(q.id)),
       q.id, q.quote_number, q.customer_name, '', q.city, q.city,
       coalesce(q.notes, case when q.quote_number <> '-' then q.quote_number || ' no.lu teklif kapsamındaki malzemeler' else 'Teklif kapsamındaki malzemeler' end),
       q.total_amount, 'TRY',
       (q.created_at at time zone 'Europe/Istanbul')::date,
       (q.created_at at time zone 'Europe/Istanbul')::date,
       (q.created_at at time zone 'Europe/Istanbul')::date,
       '', 'sevk_edildi', 'Excel teklif listesinden aktarıldı', 'istanbul', q.created_at, now()
from public.quotes q
where q.imported and q.status = 'onaylandi'
on conflict (id) do nothing;

update public.quotes set status = 'siparis', updated_at = now()
where imported and status = 'onaylandi';

-- Beklemede (gönderildi) olup 7 günü aşan teklifler arşive
update public.quotes set status = 'arsiv', updated_at = now()
where status = 'gonderildi' and created_at < now() - interval '7 days';
