-- Yönetici olmayan biri (ör. Sıla) teklif yüklediğinde: teklif "Kontrol bekliyor" işaretlenir ve yöneticilere bildirim gider.
-- Yönetici kontrol edince (Kontrol ettim / PDF gönder / revize) işaret kalkar. Yalnız yönetici kaldırabilir.
alter table public.quotes add column if not exists review_pending boolean not null default false;

create or replace function private.quote_review_mark() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    -- Uygulamadan (giriş yapmış) yönetici olmayan kişi ekledi; Excel aktarımları hariç
    if auth.uid() is not null and not public.is_admin() and not coalesce(new.imported, false) then
      new.review_pending := true;
    end if;
  elsif not public.is_admin() then
    -- Yönetici olmayan işareti değiştiremez
    new.review_pending := old.review_pending;
  end if;
  return new;
end $$;

create or replace trigger quotes_review_mark before insert or update on public.quotes
  for each row execute function private.quote_review_mark();

create or replace function private.quote_review_notify() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  cfg record;
  s record;
  who text;
begin
  if not new.review_pending then return new; end if;
  select * into cfg from public.push_config where id = 1;
  if not found then return new; end if;
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  for s in
    select ps.* from public.push_subscriptions ps
    join public.profiles p on lower(p.email) = lower(ps.user_email)
    where p.is_admin and p.status = 'active' and p.id is distinct from auth.uid()
  loop
    perform net.http_post(
      url := 'https://enyap-project.sakiremre153207.workers.dev/api/push/send',
      body := jsonb_build_object(
        'vapid', jsonb_build_object('public', cfg.vapid_public, 'private', cfg.vapid_private_jwk, 'subject', cfg.subject),
        'subscription', jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)),
        'payload', jsonb_build_object(
          'title', 'Kontrol bekleyen teklif',
          'body', new.quote_number || ' nolu ' || new.customer_name || ' teklifi sisteme ' || coalesce(who, 'ekip') || ' tarafından yüklendi.',
          'url', '/?open-quote=' || new.id,
          'tag', 'review-' || new.id)),
      headers := '{"content-type":"application/json"}'::jsonb,
      timeout_milliseconds := 10000);
  end loop;
  return new;
exception when others then
  return new; -- bildirim gitmese de teklif kaydı bozulmasın
end $$;

create or replace trigger quotes_review_notify after insert on public.quotes
  for each row execute function private.quote_review_notify();
