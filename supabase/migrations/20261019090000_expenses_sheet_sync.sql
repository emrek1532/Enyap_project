-- Yapılan harcamaları Google Sheet'e ("Harcamalar") yazar. Teklif/tahsilat senkronuyla aynı
-- Apps Script adresini ve gizli anahtarı kullanır; kind = 'expense'.
create or replace function public.expenses_sheet_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cfg private.sheet_sync;
  e public.expenses;
begin
  select * into cfg from private.sheet_sync where id = 1;
  if cfg is null or not cfg.enabled or coalesce(cfg.url, '') = '' then
    return null;
  end if;
  e := case when tg_op in ('INSERT', 'UPDATE') then new else old end;

  perform net.http_post(
    url := cfg.url,
    body := jsonb_build_object(
      'secret', cfg.secret,
      'kind', 'expense',
      'action', case when tg_op in ('INSERT', 'UPDATE') then 'upsert' else lower(tg_op) end,
      'id', e.id,
      'date', e.date,
      'category', e.category,
      'method', e.method,
      'amount', e.amount,
      'currency', e.currency,
      'description', coalesce(e.description, ''),
      'old', case when tg_op = 'INSERT' then null else jsonb_build_object(
        'date', old.date, 'category', old.category, 'amount', old.amount) end
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
  return null;
end;
$$;
revoke execute on function public.expenses_sheet_sync() from public, anon, authenticated;

create or replace trigger expenses_sheet_sync after insert or update or delete on public.expenses
  for each row execute function public.expenses_sheet_sync();
