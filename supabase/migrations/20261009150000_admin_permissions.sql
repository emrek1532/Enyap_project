-- Admin paneli: personel kaydı + onay, bölüm bazında yetki (none/view/edit), RLS ile zorunlu kılınır.
alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists status text not null default 'pending' check (status in ('pending','active','suspended')),
  add column if not exists perms jsonb not null default
    '{"quotes":"edit","orders":"edit","collections":"none","expenses":"none","calendar":"edit","notes":"edit","materials":"view","suppliers":"view"}'::jsonb,
  add column if not exists last_seen timestamptz;

-- Mevcut hesaplar: sahibi admin, diğerleri aktif ve tam yetkili (kilitlenme olmasın)
update public.profiles set status = 'active',
  perms = '{"quotes":"edit","orders":"edit","collections":"edit","expenses":"edit","calendar":"edit","notes":"edit","materials":"edit","suppliers":"edit"}'::jsonb;
update public.profiles set is_admin = true where email = 'sakiremre153207@gmail.com';

alter table public.activities add column if not exists actor uuid default auth.uid();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin and status = 'active' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select status = 'active' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.can(m text, lvl text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select status = 'active' and (is_admin or
      case when lvl = 'view' then coalesce(perms->>m, 'none') in ('view','edit') else perms->>m = 'edit' end)
    from public.profiles where id = auth.uid()), false)
$$;

-- Bildirim gönderirken: e-postası belli kişinin yetkisi
create or replace function public.email_can(e text, m text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select status = 'active' and (is_admin or coalesce(perms->>m, 'none') in ('view','edit'))
    from public.profiles where lower(email) = lower(e) limit 1), false)
$$;

-- Tablo politikaları
do $$
declare r record;
begin
  for r in select * from (values
    ('quotes','quotes'), ('orders','orders'), ('collections','collections'), ('expenses','expenses'),
    ('events','calendar'), ('notes','notes'), ('materials','materials'),
    ('supplier_items','suppliers'), ('supplier_lists','suppliers')) v(t, m)
  loop
    execute format('alter policy %I on public.%I using (public.can(%L,''view''))', r.t||'_select', r.t, r.m);
    execute format('alter policy %I on public.%I with check (public.can(%L,''edit''))', r.t||'_insert', r.t, r.m);
    execute format('alter policy %I on public.%I using (public.can(%L,''edit'')) with check (public.can(%L,''edit''))', r.t||'_update', r.t, r.m, r.m);
    execute format('alter policy %I on public.%I using (public.can(%L,''edit''))', r.t||'_delete', r.t, r.m);
  end loop;
  for r in select * from (values ('customers','customers'), ('activities','activities')) v(t, p) loop
    execute format('alter policy %I on public.%I using (public.is_active())', r.p||'_select', r.t);
    execute format('alter policy %I on public.%I with check (public.is_active())', r.p||'_insert', r.t);
    execute format('alter policy %I on public.%I using (public.is_active()) with check (public.is_active())', r.p||'_update', r.t);
    execute format('alter policy %I on public.%I using (public.is_active())', r.p||'_delete', r.t);
  end loop;
end $$;

alter policy supplier_raw_select on public.supplier_raw_pages using (public.can('suppliers','view'));
alter policy supplier_raw_insert on public.supplier_raw_pages with check (public.can('suppliers','edit'));
alter policy supplier_raw_update on public.supplier_raw_pages using (public.can('suppliers','edit')) with check (public.can('suppliers','edit'));
alter policy supplier_raw_delete on public.supplier_raw_pages using (public.can('suppliers','edit'));
alter policy push_subs_select on public.push_subscriptions using (public.is_active());
alter policy push_subs_insert on public.push_subscriptions with check (public.is_active());
alter policy push_subs_update on public.push_subscriptions using (public.is_active()) with check (public.is_active());
alter policy push_subs_delete on public.push_subscriptions using (public.is_active());

-- Profiller: herkes kendini, admin herkesi görür; yetkiyi sadece admin değiştirir
alter policy profiles_select_authenticated on public.profiles using (id = (select auth.uid()) or public.is_admin());
alter policy profiles_update_own on public.profiles using (public.is_admin()) with check (public.is_admin());

-- Kendi "son görülme" bilgisini günceller
create or replace function public.touch_profile() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set last_seen = now() where id = auth.uid()
$$;

-- Admin: kullanıcıyı tamamen siler (kendini silemez)
create or replace function public.admin_remove_user(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok'; end if;
  if uid = auth.uid() then raise exception 'Kendinizi silemezsiniz'; end if;
  delete from auth.users where id = uid;
end $$;

revoke execute on function public.admin_remove_user(uuid) from anon, public;
revoke execute on function public.email_can(text, text) from anon, authenticated, public;

-- Bildirimler sadece o bölümü görebilen kişilere gider
do $$
declare d text;
begin
  d := pg_get_functiondef('public.send_quote_reminders()'::regprocedure);
  execute replace(d, 'select * from push_subscriptions loop', 'select * from push_subscriptions where public.email_can(user_email, ''quotes'') loop');
  d := pg_get_functiondef('public.send_note_reminders()'::regprocedure);
  execute replace(d, 'select * from push_subscriptions loop', 'select * from push_subscriptions where public.email_can(user_email, ''notes'') loop');
end $$;
