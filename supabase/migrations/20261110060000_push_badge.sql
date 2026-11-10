-- Uygulama simgesindeki sayı (WhatsApp'taki gibi): kişinin bekleyen işleri
--   = kendisine atanan açık talepler + (yöneticiyse) kontrol bekleyen teklifler.
-- Her bildirim bu sayıyı 'badge' olarak taşır; service worker simgeye yazar (uygulama kapalıyken de).
create or replace function private.badge_for(uid uuid) returns integer
language sql stable security definer set search_path to '' as $$
  select (select count(*) from public.quote_requests r where r.assigned_to = uid and r.status in ('yeni', 'hazirlaniyor'))::int
       + case when coalesce((select is_admin from public.profiles where id = uid), false)
              then (select count(*) from public.quotes q where q.review_pending)::int else 0 end
$$;

create or replace function private.push_to_user(uid uuid, p_title text, p_body text, p_url text, p_tag text) returns integer
language plpgsql security definer set search_path to '' as $$
declare
  cfg record;
  s record;
  n int := 0;
  b int := private.badge_for(uid);
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
        'payload', jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url, 'tag', p_tag, 'badge', b)),
      headers := '{"content-type":"application/json"}'::jsonb,
      timeout_milliseconds := 10000);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Kontrol bekleyen teklif bildirimi de ortak gönderimi kullanır (simge sayısı dahil)
create or replace function private.quote_review_notify() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  who text;
  a record;
begin
  if not new.review_pending then return new; end if;
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  for a in select id from public.profiles where is_admin and status = 'active' and id is distinct from auth.uid() loop
    perform private.push_to_user(a.id, 'Kontrol bekleyen teklif',
      new.quote_number || ' nolu ' || new.customer_name || ' teklifi sisteme ' || coalesce(who, 'ekip') || ' tarafından yüklendi.',
      '/?open-quote=' || new.id, 'review-' || new.id);
  end loop;
  return new;
exception when others then
  return new;
end $$;
