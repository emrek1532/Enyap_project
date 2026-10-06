-- Excel'den aktarılan teklifler için alanlar + "Siparişe Dönüştü" durumu
alter table public.quotes
  add column prepared_by text,
  add column amount_usd numeric(14,2) not null default 0,
  add column amount_eur numeric(14,2) not null default 0,
  add column amount_try numeric(14,2) not null default 0,
  add column total_usd numeric(14,2) not null default 0,
  add column imported boolean not null default false;

alter table public.quotes drop constraint quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('yeni_talep','hazirlaniyor','gonderildi','onaylandi','revizyon','iptal','siparis'));

-- Siparişe çevrilmiş teklifler artık teklif listesinde bekleyen iş olarak görünmesin
update public.quotes q set status = 'siparis', updated_at = now()
where exists (select 1 from public.orders o where o.quote_id = q.id) and q.status <> 'siparis';

create index quotes_created_at_idx on public.quotes (created_at desc);
create index quotes_status_idx on public.quotes (status);
