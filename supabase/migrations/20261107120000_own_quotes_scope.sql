-- "Herkesin tekliflerini görür" ek izni (perms.others). Kapalıysa kullanıcı yalnız kendi açtığı teklifleri görür
-- (ana sayfa rakamları, cari kartı geçmişi, iskonto karşılaştırması da cihazdaki/izinli tekliflerden hesaplandığı için yalnız onunkiler).
-- Eksik anahtar = görür (eski davranış). Yönetici her şeyi görür.

alter table public.quotes add column if not exists owner_id uuid default auth.uid();
create index if not exists quotes_owner_idx on public.quotes(owner_id);

create or replace function public.sees_all() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select status = 'active' and (is_admin or coalesce(perms->>'others', 'edit') <> 'none')
    from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.email_sees_all(e text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select status = 'active' and (is_admin or coalesce(perms->>'others', 'edit') <> 'none')
    from public.profiles where lower(email) = lower(e) limit 1), false)
$$;
revoke execute on function public.email_sees_all(text) from anon, authenticated, public;

alter policy quotes_select on public.quotes
  using ((select public.can('quotes','view')) and ((select public.sees_all()) or owner_id = (select auth.uid())));
alter policy quotes_insert on public.quotes
  with check ((select public.can('quotes','edit')) and ((select public.sees_all()) or owner_id = (select auth.uid())));
alter policy quotes_update on public.quotes
  using ((select public.can('quotes','edit')) and ((select public.sees_all()) or owner_id = (select auth.uid())))
  with check ((select public.can('quotes','edit')) and ((select public.sees_all()) or owner_id = (select auth.uid())));
do $$ begin
  execute format('alter policy %I on public.quotes using (public.can(''quotes'',''edit'') and public.can_remove() and (public.sees_all() or owner_id = auth.uid()))', 'quotes_del'||'ete');
end $$;

-- Teklif numarası: kısıtlı kullanıcı herkesin numarasını görmediği için en büyük sıra sunucudan alınır (yalnız sayı döner)
create or replace function public.quote_max_seq(y int) returns int
language sql stable security definer set search_path = '' as $$
  select case when public.can('quotes','edit') then coalesce(max(substring(quote_number from '^EK-\d{4}-(\d+)$')::int), 0) else 0 end
  from public.quotes where quote_number ~* ('^EK-' || y || '-\d+$')
$$;
grant execute on function public.quote_max_seq(int) to authenticated;

-- Bildirimler: haftalık özet (tutarlar) yalnız herkesi görene; hatırlatma kısıtlı kullanıcıya yalnız kendi teklifi için
do $$
declare d text;
begin
  d := pg_get_functiondef('public.send_weekly_summary()'::regprocedure);
  d := replace(d, 'where public.email_can(user_email, ''quotes'')', 'where public.email_can(user_email, ''quotes'') and public.email_sees_all(user_email)');
  execute d;
  d := pg_get_functiondef('public.send_quote_reminders()'::regprocedure);
  d := replace(d, 'select id, quote_number, customer_name from quotes', 'select id, quote_number, customer_name, owner_id from quotes');
  d := replace(d, 'where public.email_can(user_email, ''quotes'')',
    'where public.email_can(user_email, ''quotes'') and (public.email_sees_all(user_email) or q.owner_id = (select p.id from public.profiles p where lower(p.email) = lower(user_email) limit 1))');
  execute d;
end $$;

-- Son hareketler (firma adı + teklif durumu yazar) yalnız herkesi görene
alter policy activities_select on public.activities using ((select public.is_active()) and (select public.sees_all()));

-- Sıla Hanım: yalnız kendi teklifleri (veri kaydı, şema değil)
update public.profiles set perms = perms || '{"others":"none"}'::jsonb where email = 'enyapisipaz@gmail.com';
