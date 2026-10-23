-- Artımlı eşitleme: her kayıt değişince sunucu saatiyle synced_at güncellenir; uygulama sadece son eşitlemeden sonra değişenleri indirir
create or replace function private.touch_synced_at() returns trigger language plpgsql as $$
begin
  new.synced_at := now();
  return new;
end $$;

alter table public.customers add column if not exists synced_at timestamptz not null default now();
create index if not exists customers_synced_at_idx on public.customers (synced_at);
create or replace trigger customers_touch_synced_at before insert or update on public.customers for each row execute function private.touch_synced_at();

alter table public.quotes add column if not exists synced_at timestamptz not null default now();
create index if not exists quotes_synced_at_idx on public.quotes (synced_at);
create or replace trigger quotes_touch_synced_at before insert or update on public.quotes for each row execute function private.touch_synced_at();

alter table public.notes add column if not exists synced_at timestamptz not null default now();
create index if not exists notes_synced_at_idx on public.notes (synced_at);
create or replace trigger notes_touch_synced_at before insert or update on public.notes for each row execute function private.touch_synced_at();

alter table public.collections add column if not exists synced_at timestamptz not null default now();
create index if not exists collections_synced_at_idx on public.collections (synced_at);
create or replace trigger collections_touch_synced_at before insert or update on public.collections for each row execute function private.touch_synced_at();

alter table public.expenses add column if not exists synced_at timestamptz not null default now();
create index if not exists expenses_synced_at_idx on public.expenses (synced_at);
create or replace trigger expenses_touch_synced_at before insert or update on public.expenses for each row execute function private.touch_synced_at();

alter table public.visits add column if not exists synced_at timestamptz not null default now();
create index if not exists visits_synced_at_idx on public.visits (synced_at);
create or replace trigger visits_touch_synced_at before insert or update on public.visits for each row execute function private.touch_synced_at();

-- Not hatırlatmaları her dakika yerine 5 dakikada bir kontrol edilir
select cron.alter_job((select jobid from cron.job where jobname = 'note-reminders'), schedule := '*/5 * * * *');
