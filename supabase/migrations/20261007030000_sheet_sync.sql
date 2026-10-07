-- Teklifleri Google Sheet'e ("Verilen Teklifler") arka planda yazar.
-- Sheet'teki Apps Script web uygulamasına pg_net ile POST atılır; adres ve gizli anahtar
-- dışarıya açık olmayan private şemasında tutulur. Adres girilmediyse tetikleyici hiçbir şey yapmaz.
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.sheet_sync (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  url text,
  secret text
);
insert into private.sheet_sync (id) values (1) on conflict do nothing;

create or replace function public.quotes_sheet_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cfg private.sheet_sync;
  q public.quotes;
  usd numeric; eur numeric; try_ numeric;
begin
  select * into cfg from private.sheet_sync where id = 1;
  if cfg is null or not cfg.enabled or coalesce(cfg.url, '') = '' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    q := old;
  else
    q := new;
    -- Sadece sheet'te görünen alanlar değiştiyse gönder
    if tg_op = 'UPDATE' and
       (old.quote_number, old.status, old.customer_name, old.city, old.prepared_by, old.notes,
        old.amount_usd, old.amount_eur, old.amount_try, old.total_amount, old.currency, old.created_at)
       is not distinct from
       (new.quote_number, new.status, new.customer_name, new.city, new.prepared_by, new.notes,
        new.amount_usd, new.amount_eur, new.amount_try, new.total_amount, new.currency, new.created_at) then
      return null;
    end if;
  end if;

  if coalesce(trim(q.quote_number), '') in ('', '-') then
    return null;
  end if;

  usd := coalesce(q.amount_usd, 0);
  eur := coalesce(q.amount_eur, 0);
  try_ := coalesce(q.amount_try, 0);
  if usd = 0 and eur = 0 and try_ = 0 and coalesce(q.total_amount, 0) <> 0 then
    case q.currency
      when 'USD' then usd := q.total_amount;
      when 'EUR' then eur := q.total_amount;
      else try_ := q.total_amount;
    end case;
  end if;

  perform net.http_post(
    url := cfg.url,
    body := jsonb_build_object(
      'secret', cfg.secret,
      'action', case when tg_op = 'DELETE' then 'delete' else 'upsert' end,
      'quoteNumber', trim(q.quote_number),
      'oldQuoteNumber', case when tg_op = 'UPDATE' then trim(old.quote_number) end,
      'date', to_char(q.created_at at time zone 'Europe/Istanbul', 'YYYY-MM-DD'),
      'status', case
        when q.status in ('onaylandi', 'siparis') then 'Onaylandı'
        when q.status = 'iptal' then 'İptal'
        else 'Beklemede' end,
      'customer', q.customer_name,
      'preparedBy', coalesce(q.prepared_by, ''),
      'usd', usd, 'eur', eur, 'try', try_,
      'notes', coalesce(q.notes, '')
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
  return null;
end;
$$;
revoke execute on function public.quotes_sheet_sync() from public, anon, authenticated;

drop trigger if exists quotes_sheet_sync on public.quotes;
create trigger quotes_sheet_sync after insert or update or delete on public.quotes
  for each row execute function public.quotes_sheet_sync();
