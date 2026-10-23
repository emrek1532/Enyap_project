-- Haftalık özet bildirimi: her pazartesi 09:05 (TR) geçen haftanın teklif/onay/tahsilat özeti ve bu hafta vadesi gelen çekler
create or replace function public.short_tl(v numeric) returns text language sql immutable as $$
  select case when v >= 1000000 then replace(to_char(round(v / 1000000, 1), 'FM9990.0'), '.', ',') || ' Mn'
              when v >= 1000 then round(v / 1000)::text || ' bin'
              else round(v)::text end || ' TL'
$$;

create or replace function public.send_weekly_summary() returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare
  cfg record;
  s record;
  d_to date := (now() at time zone 'Europe/Istanbul')::date;
  d_from date := d_to - 7;
  q_n int; a_n int; a_amt numeric; c_amt numeric; ch_n int; ch_amt numeric; p_n int;
  body text;
  n int := 0;
begin
  select * into cfg from push_config where id = 1;
  select count(*) into q_n from quotes where (created_at at time zone 'Europe/Istanbul')::date >= d_from and (created_at at time zone 'Europe/Istanbul')::date < d_to and status <> 'iptal';
  select count(*), coalesce(sum(coalesce(nullif(amount_try, 0), case when currency = 'TRY' then total_amount else 0 end)), 0) into a_n, a_amt
    from quotes where status = 'onaylandi' and (updated_at at time zone 'Europe/Istanbul')::date >= d_from and (updated_at at time zone 'Europe/Istanbul')::date < d_to;
  select coalesce(sum(amount), 0) into c_amt from collections where currency = 'TRY' and date >= d_from and date < d_to;
  select count(*), coalesce(sum(amount), 0) into ch_n, ch_amt from collections where due_date >= d_to and due_date < d_to + 7;
  select count(*) into p_n from quotes where status = 'gonderildi';
  body := 'Geçen hafta: ' || q_n || ' teklif, ' || a_n || ' onay (' || short_tl(a_amt) || '), ' || short_tl(c_amt) || ' tahsilat.'
    || case when ch_n > 0 then ' Bu hafta vadesi gelen ' || ch_n || ' çek/senet: ' || short_tl(ch_amt) || '.' else '' end
    || ' Bekleyen teklif: ' || p_n || '.';
  for s in select * from push_subscriptions where public.email_can(user_email, 'quotes') loop
    perform net.http_post(
      url := 'https://enyap-project.sakiremre153207.workers.dev/api/push/send',
      body := jsonb_build_object(
        'vapid', jsonb_build_object('public', cfg.vapid_public, 'private', cfg.vapid_private_jwk, 'subject', cfg.subject),
        'subscription', jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)),
        'payload', jsonb_build_object('title', 'Haftalık özet', 'body', body, 'url', '/', 'tag', 'weekly-' || d_to)),
      headers := '{"content-type":"application/json"}'::jsonb,
      timeout_milliseconds := 10000);
    n := n + 1;
  end loop;
  return n;
end $function$;

select cron.schedule('weekly-summary', '5 6 * * 1', 'select send_weekly_summary()');
