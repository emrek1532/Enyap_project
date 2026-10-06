-- Müşteri (firma) listesi
create table public.customers (
  id text primary key default ('cus-' || replace(gen_random_uuid()::text, '-', '')),
  name text not null,
  city text not null default '',
  contact_person text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_name_unique on public.customers (lower(name));
create index customers_city_idx on public.customers (city);

alter table public.customers enable row level security;
create policy "customers_select" on public.customers for select to authenticated using (true);
create policy "customers_insert" on public.customers for insert to authenticated with check (true);
create policy "customers_update" on public.customers for update to authenticated using (true) with check (true);
create policy "customers_delete" on public.customers for delete to authenticated using (true);

alter publication supabase_realtime add table public.customers;
