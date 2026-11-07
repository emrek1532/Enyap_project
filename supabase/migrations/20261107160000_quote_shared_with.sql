-- Aynı teklif tek kayıt: kısıtlı kullanıcı sistemde olan bir teklif no'yu kaydederse yeni kayıt açılmaz,
-- mevcut teklif ona da açılır (shared_with) ve onun girdiğiyle güncellenir. Diğer teklifler yine kapalı.
alter table public.quotes add column if not exists shared_with uuid[] not null default '{}';

alter policy quotes_select on public.quotes
  using ((select public.can('quotes','view')) and ((select public.sees_all()) or owner_id = (select auth.uid()) or (select auth.uid()) = any(shared_with)));
alter policy quotes_update on public.quotes
  using ((select public.can('quotes','edit')) and ((select public.sees_all()) or owner_id = (select auth.uid()) or (select auth.uid()) = any(shared_with)))
  with check ((select public.can('quotes','edit')) and ((select public.sees_all()) or owner_id = (select auth.uid()) or (select auth.uid()) = any(shared_with)));

-- Teklifi bana da aç (yalnız teklif düzenleyebilen; aynı numarayı kaydederken çağrılır)
create or replace function public.quote_share_me(qid text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can('quotes','edit') or auth.uid() is null then return false; end if;
  update public.quotes set shared_with = array_append(shared_with, auth.uid())
    where id = qid and not (auth.uid() = any(shared_with)) and owner_id is distinct from auth.uid();
  return exists (select 1 from public.quotes where id = qid);
end $$;
revoke execute on function public.quote_share_me(text) from anon, public;
grant execute on function public.quote_share_me(text) to authenticated;
