-- Teklif "Onaylandı" yapılınca: kim/ne zaman onayladı teklife yazılır ve
-- teklifi gören, düzenleyebilen yönetici olmayan kişilere (ör. Sıla) "Teklif onaylandı · işleme al" bildirimi gider.
-- Excel aktarımları ve giriş yapmamış (sunucu) işlemler bildirim göndermez.

alter table public.quotes add column if not exists approved_at timestamptz;
alter table public.quotes add column if not exists approved_by text;

create or replace function private.quote_approved_stamp() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.status = 'onaylandi' and (tg_op = 'INSERT' or old.status is distinct from 'onaylandi') then
    if auth.uid() is not null then
      new.approved_at := now();
      new.approved_by := (select coalesce(nullif(full_name, ''), email) from public.profiles where id = auth.uid());
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'gonderildi' then
      new.approved_at := null; new.approved_by := null;   -- geri alındı
    else
      new.approved_at := old.approved_at; new.approved_by := old.approved_by; -- iptal vb.: kayıt kalır
    end if;
  end if;
  return new;
end $$;
create or replace trigger quotes_approved_stamp before insert or update on public.quotes
  for each row execute function private.quote_approved_stamp();

create or replace function private.quote_approved_notify() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  who text;
  p record;
begin
  if auth.uid() is null or coalesce(new.imported, false) or new.status <> 'onaylandi'
     or (tg_op = 'UPDATE' and old.status = 'onaylandi') then
    return new;
  end if;
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  for p in
    select pr.id from public.profiles pr
    where pr.status = 'active' and not pr.is_admin and pr.id is distinct from auth.uid()
      and coalesce(pr.perms->>'quotes', 'none') = 'edit'
      and (coalesce(pr.perms->>'others', 'edit') <> 'none' or pr.id = new.owner_id or pr.id = any(coalesce(new.shared_with, '{}')))
  loop
    perform private.push_to_user(p.id, '✅ Teklif onaylandı · işleme al',
      new.quote_number || ' nolu ' || new.customer_name || ' teklifi' || coalesce(' ' || who || ' tarafından', '') || ' onaylandı.',
      '/?open-quote=' || new.id, 'approved-' || new.id);
  end loop;
  return new;
exception when others then
  return new; -- bildirim gitmese de kayıt bozulmasın
end $$;
create or replace trigger quotes_approved_notify after insert or update on public.quotes
  for each row execute function private.quote_approved_notify();
