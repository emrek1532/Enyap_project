-- Müşteri talepleri: sahadan talep girilir (fotoğraf / Excel / WhatsApp yazısı), bir kişiye atanır, teklife bağlanır.
-- Atanan kişiye bildirim gider; 4 saat bekleyen talep için talebi girene hatırlatma (iş saatlerinde) gider.
-- Dosyalar Storage 'requests' kovasında (gizli); yalnız talep açılınca indirilir, günlük eşitlemeye girmez.

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  note text,
  raw_text text,
  files jsonb not null default '[]'::jsonb,      -- [{path, name, type, size}]
  lines jsonb,                                    -- okunan satırlar + katalog adayları (bir kez okunur, saklanır)
  status text not null default 'yeni' check (status in ('yeni', 'hazirlaniyor', 'yuklendi', 'iptal')),
  assigned_to uuid references public.profiles(id),
  created_by uuid default auth.uid() references public.profiles(id),
  quote_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reminded_at timestamptz
);
create index if not exists quote_requests_status_idx on public.quote_requests(status, created_at desc);

alter table public.quote_requests enable row level security;
-- Herkesi gören (sees_all) hepsini; diğerleri yalnız kendi girdiği ya da kendine atanan talepleri görür
create policy quote_requests_select on public.quote_requests for select to authenticated
  using ((select public.can('quotes', 'view')) and ((select public.sees_all()) or created_by = (select auth.uid()) or assigned_to = (select auth.uid())));
create policy quote_requests_insert on public.quote_requests for insert to authenticated
  with check ((select public.can('quotes', 'edit')) and created_by = (select auth.uid()));
create policy quote_requests_update on public.quote_requests for update to authenticated
  using ((select public.can('quotes', 'edit')) and ((select public.sees_all()) or created_by = (select auth.uid()) or assigned_to = (select auth.uid())))
  with check ((select public.can('quotes', 'edit')));

create or replace function private.quote_requests_touch() returns trigger
language plpgsql set search_path to '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create or replace trigger quote_requests_touch before update on public.quote_requests
  for each row execute function private.quote_requests_touch();

-- Talebin atanabileceği kişiler (aktif, teklif düzenleyebilen)
create or replace function public.request_assignees() returns table(id uuid, full_name text)
language sql stable security definer set search_path to '' as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email)
  from public.profiles p
  where public.is_active() and p.status = 'active'
    and (p.is_admin or coalesce(p.perms->>'quotes', 'edit') = 'edit')
  order by 2
$$;

-- Bir kişinin tüm cihazlarına bildirim
create or replace function private.push_to_user(uid uuid, p_title text, p_body text, p_url text, p_tag text) returns integer
language plpgsql security definer set search_path to '' as $$
declare
  cfg record;
  s record;
  n int := 0;
begin
  select * into cfg from public.push_config where id = 1;
  if not found then return 0; end if;
  for s in
    select ps.* from public.push_subscriptions ps
    join public.profiles p on lower(p.email) = lower(ps.user_email)
    where p.id = uid and p.status = 'active'
  loop
    perform net.http_post(
      url := 'https://enyap-project.sakiremre153207.workers.dev/api/push/send',
      body := jsonb_build_object(
        'vapid', jsonb_build_object('public', cfg.vapid_public, 'private', cfg.vapid_private_jwk, 'subject', cfg.subject),
        'subscription', jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)),
        'payload', jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url, 'tag', p_tag)),
      headers := '{"content-type":"application/json"}'::jsonb,
      timeout_milliseconds := 10000);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Atanınca atanan kişiye; teklif yüklenince (yönetici olmayan) talebi girene bildirim
create or replace function private.quote_requests_notify() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  who text;
begin
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) and new.status in ('yeni', 'hazirlaniyor') then
    perform private.push_to_user(new.assigned_to, 'Yeni müşteri talebi',
      new.customer_name || ' için yeni talep' || coalesce(' (' || who || ')', '') || coalesce(': ' || left(new.note, 80), ''),
      '/?open-request=' || new.id, 'req-' || new.id);
  end if;
  if tg_op = 'UPDATE' and new.status = 'yuklendi' and old.status <> 'yuklendi'
     and new.created_by is distinct from auth.uid()
     and not coalesce((select is_admin from public.profiles where id = new.created_by), false) then
    perform private.push_to_user(new.created_by, 'Talebin teklifi hazır',
      new.customer_name || ' talebi için teklif sisteme yüklendi' || coalesce(' (' || who || ')', '') || '.',
      '/?open-request=' || new.id, 'req-done-' || new.id);
  end if;
  return new;
exception when others then
  return new; -- bildirim gitmese de kayıt bozulmasın
end $$;
create or replace trigger quote_requests_notify after insert or update on public.quote_requests
  for each row execute function private.quote_requests_notify();

-- 4 saattir "Yeni" duran talep: talebi girene bir kez hatırlatma (08-20 arası)
create or replace function public.send_request_reminders() returns integer
language plpgsql security definer set search_path to '' as $$
declare
  r record;
  n int := 0;
  h int := extract(hour from (now() at time zone 'Europe/Istanbul'))::int;
begin
  if h < 8 or h >= 20 then return 0; end if;
  for r in
    select * from public.quote_requests
    where status = 'yeni' and reminded_at is null and created_at < now() - interval '4 hours'
    limit 20
  loop
    perform private.push_to_user(r.created_by, 'Talep bekliyor',
      r.customer_name || ' talebi 4 saattir hazırlanmadı. Dokunun, otomatik hazırlayın.',
      '/?open-request=' || r.id, 'req-wait-' || r.id);
    update public.quote_requests set reminded_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
select cron.schedule('request-reminders', '*/30 * * * *', 'select public.send_request_reminders()');

-- Dosyalar: gizli kova, en fazla 10 MB
insert into storage.buckets (id, name, public, file_size_limit)
values ('requests', 'requests', false, 10485760)
on conflict (id) do nothing;
create policy requests_files_read on storage.objects for select to authenticated
  using (bucket_id = 'requests' and (select public.can('quotes', 'view')));
create policy requests_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'requests' and (select public.can('quotes', 'edit')));

-- Canlı güncelleme (talep listesi yeni talep gelince kendini yeniler)
alter publication supabase_realtime add table public.quote_requests;
