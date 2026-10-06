-- Yapılan tahsilatlar ve yapılan harcamalar
create table if not exists public.collections (
  id text primary key,
  date date not null,
  customer_name text not null default '',
  amount numeric(14,2) not null default 0,
  currency text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  method text not null default '',
  description text,
  created_by text not null default 'isparta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id text primary key,
  date date not null,
  category text not null default '',
  amount numeric(14,2) not null default 0,
  currency text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  method text not null default '',
  description text,
  created_by text not null default 'isparta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collections_date_idx on public.collections (date desc);
create index if not exists expenses_date_idx on public.expenses (date desc);

alter table public.collections enable row level security;
alter table public.expenses enable row level security;

do $$
declare t text;
begin
  foreach t in array array['collections','expenses'] loop
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (true)', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (true)', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.collections, public.expenses;
