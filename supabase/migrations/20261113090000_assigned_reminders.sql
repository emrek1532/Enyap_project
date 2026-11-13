-- Atanan işler için 30 dakikada bir hatırlatma (ör. Sıla).
-- Kişi başına tek özet bildirim: açık görev notları + atanmış talepler + siparişe alınmamış onaylı teklifler.
-- Mesai içinde (İstanbul 08:00-20:00, pazar hariç) çalışır; aynı etiketle eski bildirimin yerine geçer.

create or replace function public.send_assigned_reminders() returns integer
language plpgsql security definer set search_path to '' as $$
declare
  p record;
  n int := 0;
  t timestamp := now() at time zone 'Europe/Istanbul';
  c_notes int; c_req int; c_ord int;
  parts text[];
  url text;
begin
  if extract(hour from t) < 8 or extract(hour from t) >= 20 or extract(dow from t) = 0 then return 0; end if;
  for p in select pr.* from public.profiles pr where pr.status = 'active' loop
    select count(*) into c_notes from public.notes where assigned_to = p.id and not done;
    select count(*) into c_req from public.quote_requests
      where assigned_to = p.id and status in ('yeni', 'hazirlaniyor') and deleted_at is null;
    c_ord := 0;
    if not p.is_admin and coalesce(p.perms->>'quotes', 'none') = 'edit' then
      select count(*) into c_ord from public.quotes q
      where q.status = 'onaylandi' and q.approved_at is not null and q.processed_at is null
        and (coalesce(p.perms->>'others', 'edit') <> 'none' or q.owner_id = p.id or p.id = any(coalesce(q.shared_with, '{}')));
    end if;
    continue when c_notes + c_req + c_ord = 0;
    parts := '{}';
    if c_ord > 0 then parts := parts || (c_ord || ' sipariş bekleyen teklif'); end if;
    if c_req > 0 then parts := parts || (c_req || ' talep'); end if;
    if c_notes > 0 then parts := parts || (c_notes || ' görev/not'); end if;
    url := '/';
    begin
      perform private.push_to_user(p.id, '⏰ Bekleyen işlerin var',
        array_to_string(parts, ' · ') || '. Bitirince işaretlemeyi unutma.', url, 'assigned-reminder');
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  return n;
end $$;
revoke execute on function public.send_assigned_reminders() from anon, authenticated, public;

select cron.schedule('assigned-reminders', '*/30 * * * *', 'select public.send_assigned_reminders()');
