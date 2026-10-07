-- Yapılan tahsilatları Google Sheet'e ("Yapılan Tahsilatlar") yazar. Teklif senkronuyla aynı
-- Apps Script adresini ve gizli anahtarı kullanır; kind = 'collection'.
-- Eski (Excel'den gelen) satırları bulabilmek için güncellemede/silmede eski değerler de gönderilir.
create or replace function public.collections_sheet_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cfg private.sheet_sync;
  c public.collections;
begin
  select * into cfg from private.sheet_sync where id = 1;
  if cfg is null or not cfg.enabled or coalesce(cfg.url, '') = '' then
    return null;
  end if;
  c := case when tg_op = 'DELETE' then old else new end;

  perform net.http_post(
    url := cfg.url,
    body := jsonb_build_object(
      'secret', cfg.secret,
      'kind', 'collection',
      'action', case when tg_op = 'DELETE' then 'delete' else 'upsert' end,
      'id', c.id,
      'date', c.date,
      'customer', c.customer_name,
      'method', c.method,
      'bank', coalesce(c.bank_name, ''),
      'branch', coalesce(c.bank_branch, ''),
      'checkNo', coalesce(c.check_no, ''),
      'amount', c.amount,
      'currency', c.currency,
      'dueDate', c.due_date,
      'old', case when tg_op = 'INSERT' then null else jsonb_build_object(
        'date', old.date, 'customer', old.customer_name, 'amount', old.amount, 'checkNo', coalesce(old.check_no, '')) end
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
  return null;
end;
$$;
revoke execute on function public.collections_sheet_sync() from public, anon, authenticated;

drop trigger if exists collections_sheet_sync on public.collections;
create trigger collections_sheet_sync after insert or update or delete on public.collections
  for each row execute function public.collections_sheet_sync();
