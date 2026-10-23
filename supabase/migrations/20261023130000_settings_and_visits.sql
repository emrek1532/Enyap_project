-- Uygulama ayarları (aylık hedefler vb.) ve müşteri ziyaret kayıtları
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy app_settings_select on public.app_settings for select to authenticated using ((select public.is_active()));
create policy app_settings_insert on public.app_settings for insert to authenticated with check ((select public.can('quotes', 'edit')));
create policy app_settings_update on public.app_settings for update to authenticated using ((select public.can('quotes', 'edit'))) with check ((select public.can('quotes', 'edit')));

create table if not exists public.visits (
  id text primary key,
  customer_name text not null,
  date date not null,
  note text,
  city text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visits_customer_idx on public.visits (lower(customer_name));
alter table public.visits enable row level security;
create policy visits_select on public.visits for select to authenticated using ((select public.is_active()));
create policy visits_insert on public.visits for insert to authenticated with check ((select public.is_active()));
create policy visits_update on public.visits for update to authenticated using ((select public.is_active())) with check ((select public.is_active()));
alter publication supabase_realtime add table public.visits;
