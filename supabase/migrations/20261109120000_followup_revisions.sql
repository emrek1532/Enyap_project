-- Teklif takip tarihi (hatırlatıcı) ve revizyon geçmişi.
-- Uygulandı (Supabase MCP: followup_revisions).

-- 1) Takip tarihi: "bu gün müşteriyi ara". O sabah 09:05'te (TR) bildirim gider.
alter table public.quotes add column if not exists follow_up_at date;

-- Hangi teklif için hangi takip gününde bildirim gitti (aynı gün iki kez gitmesin; tarih değişince tekrar gider)
create table if not exists public.quote_followup_sent (
  quote_id text not null,
  day date not null,
  primary key (quote_id, day)
);
alter table public.quote_followup_sent enable row level security;

create or replace function public.send_followup_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg record; q record; s record; n int := 0;
  today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  select * into cfg from push_config where id = 1;
  for q in
    select id, quote_number, customer_name, owner_id, follow_up_at from quotes
    where status = 'gonderildi'
      and follow_up_at is not null and follow_up_at <= today and follow_up_at >= today - 7
      and not exists (select 1 from quote_followup_sent f where f.quote_id = quotes.id and f.day = quotes.follow_up_at)
    order by follow_up_at limit 30
  loop
    for s in select * from push_subscriptions where public.email_can(user_email, 'quotes') and (public.email_sees_all(user_email) or q.owner_id = (select p.id from public.profiles p where lower(p.email) = lower(user_email) limit 1)) loop
      perform net.http_post(
        url := 'https://enyap-project.sakiremre153207.workers.dev/api/push/send',
        body := jsonb_build_object(
          'vapid', jsonb_build_object('public', cfg.vapid_public, 'private', cfg.vapid_private_jwk, 'subject', cfg.subject),
          'subscription', jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)),
          'payload', jsonb_build_object(
            'title', 'Bugün ara · ' || coalesce(q.quote_number, ''),
            'body', coalesce(q.customer_name, '') || ' — takip günü geldi. Müşteriyi arayın.',
            'url', '/?open-quote=' || q.id,
            'tag', 'followup-' || q.id)),
        headers := '{"content-type":"application/json"}'::jsonb,
        timeout_milliseconds := 10000);
    end loop;
    insert into quote_followup_sent(quote_id, day) values (q.id, q.follow_up_at) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $function$;
revoke execute on function public.send_followup_reminders() from public, anon, authenticated;

select cron.schedule('followup-reminders', '5 6 * * *', 'select public.send_followup_reminders()');

-- 2) Revizyon geçmişi: teklifin kalemleri/tutarı değişince eski hâli saklanır (R1, R2, …).
-- Eşitlemeye girmez; yalnız teklif detayında "Revizyonlar" açılınca o teklifinkiler okunur.
create table if not exists public.quote_revisions (
  id bigint generated always as identity primary key,
  quote_id text not null,
  rev int not null,
  items jsonb not null default '[]'::jsonb,
  total_amount numeric,
  currency text,
  valid_until date,
  notes text,
  quote_updated_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists quote_revisions_quote_idx on public.quote_revisions (quote_id, rev);
alter table public.quote_revisions enable row level security;
-- Teklifi görebilen revizyonlarını da görür (quotes tablosunun kendi kuralı uygulanır)
create policy quote_revisions_select on public.quote_revisions for select to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_revisions.quote_id));

create or replace function private.quote_revision_snapshot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (old.items is distinct from new.items or old.total_amount is distinct from new.total_amount)
     and (coalesce(jsonb_array_length(case when jsonb_typeof(old.items) = 'array' then old.items end), 0) > 0 or coalesce(old.total_amount, 0) <> 0) then
    insert into public.quote_revisions(quote_id, rev, items, total_amount, currency, valid_until, notes, quote_updated_at)
    values (old.id, coalesce((select max(r.rev) from public.quote_revisions r where r.quote_id = old.id), 0) + 1,
            coalesce(old.items, '[]'::jsonb), old.total_amount, old.currency, old.valid_until, old.notes, old.updated_at);
  end if;
  return null;
end $function$;

create trigger quotes_revision_snapshot after update on public.quotes
  for each row execute function private.quote_revision_snapshot();
