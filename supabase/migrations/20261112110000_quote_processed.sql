-- Onaylanan teklifi ekip "Siparişe aldım" diye onaylar: processed_at / processed_by.
-- Uygulama, onaylanmış ama siparişe alınmamış teklif varken yönetici olmayan kişide kapatılamayan bir pencere gösterir.
-- Teklif yeniden onaylanırsa ya da Beklemede'ye dönerse işaret sıfırlanır.

alter table public.quotes add column if not exists processed_at timestamptz;
alter table public.quotes add column if not exists processed_by text;

create or replace function private.quote_approved_stamp() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.status = 'onaylandi' and (tg_op = 'INSERT' or old.status is distinct from 'onaylandi') then
    if auth.uid() is not null then
      new.approved_at := now();
      new.approved_by := (select coalesce(nullif(full_name, ''), email) from public.profiles where id = auth.uid());
    end if;
    new.processed_at := null; new.processed_by := null;  -- yeniden siparişe alınmalı
  elsif tg_op = 'UPDATE' then
    if new.status = 'gonderildi' then
      new.approved_at := null; new.approved_by := null;
      new.processed_at := null; new.processed_by := null;
    else
      new.approved_at := old.approved_at; new.approved_by := old.approved_by;
      -- siparişe alındı bilgisi yalnız mark_quote_processed ile yazılır
      if current_setting('enyap.processing', true) is distinct from '1' then
        new.processed_at := old.processed_at; new.processed_by := old.processed_by;
      end if;
    end if;
  end if;
  return new;
end $$;

-- "Siparişe aldım": sunucu kim/ne zaman yazar, yöneticilere bildirim gider
create or replace function public.mark_quote_processed(p_id text) returns boolean
language plpgsql security definer set search_path to '' as $$
declare
  q record;
  who text;
  a record;
begin
  if not public.can('quotes', 'edit') then return false; end if;
  select * into q from public.quotes
  where id = p_id and status = 'onaylandi' and processed_at is null
    and (public.sees_all() or owner_id = auth.uid() or auth.uid() = any(coalesce(shared_with, '{}')));
  if not found then return false; end if;
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  perform set_config('enyap.processing', '1', true);
  update public.quotes set processed_at = now(), processed_by = who where id = p_id;
  perform set_config('enyap.processing', '', true);
  begin
    for a in select id from public.profiles where is_admin and status = 'active' and id is distinct from auth.uid() loop
      perform private.push_to_user(a.id, '📦 Siparişe alındı' || coalesce(' · ' || who, ''),
        q.quote_number || ' nolu ' || q.customer_name || ' teklifi siparişe alındı.', '/?open-quote=' || q.id, 'processed-' || q.id);
    end loop;
  exception when others then null;
  end;
  return true;
end $$;
revoke execute on function public.mark_quote_processed(text) from anon, public;
grant execute on function public.mark_quote_processed(text) to authenticated;
