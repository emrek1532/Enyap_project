-- Enyap Isı Portalı - Supabase şeması
-- Tablolar: profiles, quotes, orders, events, notes, activities
-- Erişim: yalnızca oturum açmış ekip üyeleri (RLS), canlı eşitleme için Realtime.

-- Profiles (one per auth user)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'isparta' check (role in ('isparta','istanbul')),
  created_at timestamptz not null default now()
);

create table public.quotes (
  id text primary key,
  quote_number text not null,
  customer_name text not null,
  customer_contact text,
  customer_phone text not null default '',
  city text not null default '',
  project_location text,
  request_channel text not null default 'whatsapp' check (request_channel in ('whatsapp','telefon','ziyaret','email')),
  urgency text not null default 'normal' check (urgency in ('acil','yuksek','normal','dusuk')),
  status text not null default 'yeni_talep' check (status in ('yeni_talep','hazirlaniyor','gonderildi','onaylandi','revizyon','iptal')),
  raw_whatsapp_text text,
  items jsonb not null default '[]'::jsonb,
  total_amount numeric(14,2) not null default 0,
  currency text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  valid_until date,
  created_by text not null default 'isparta' check (created_by in ('isparta','istanbul')),
  assigned_to text not null default 'istanbul' check (assigned_to in ('isparta','istanbul')),
  notes text,
  is_encrypted boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id text primary key,
  order_number text not null,
  quote_id text references public.quotes(id) on delete set null,
  quote_number text,
  customer_name text not null,
  customer_contact text,
  customer_phone text not null default '',
  delivery_address text not null default '',
  city text not null default '',
  items_summary text not null default '',
  total_amount numeric(14,2) not null default 0,
  currency text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  order_date date,
  target_shipping_date date,
  actual_shipping_date date,
  carrier_company text not null default '',
  tracking_number text,
  driver_contact text,
  status text not null default 'hazirlaniyor' check (status in ('hazirlaniyor','depoda_hazir','sevk_edildi','teslim_edildi','gecikmeli')),
  status_notes text,
  created_by text not null default 'istanbul' check (created_by in ('isparta','istanbul')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_quote_id_idx on public.orders(quote_id);
create index orders_target_shipping_date_idx on public.orders(target_shipping_date);

create table public.events (
  id text primary key,
  title text not null,
  date date not null,
  time text,
  category text not null default 'genel' check (category in ('saha_ziyaret','musteri_takip','sevkiyat','odeme','kritik','genel')),
  related_entity jsonb,
  location text,
  assigned_user text not null default 'all' check (assigned_user in ('all','isparta','istanbul')),
  completed boolean not null default false,
  notes text,
  reminder boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_date_idx on public.events(date);

create table public.notes (
  id text primary key,
  content text not null,
  author text not null default 'isparta' check (author in ('isparta','istanbul')),
  color text not null default 'amber' check (color in ('amber','sky','emerald','rose','purple')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activities (
  id text primary key,
  action text not null,
  description text not null default '',
  author text not null default '',
  "timestamp" timestamptz not null default now(),
  badge_color text
);
create index activities_timestamp_idx on public.activities("timestamp" desc);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when new.raw_user_meta_data->>'role' = 'istanbul' then 'istanbul' else 'isparta' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: only signed-in team members can access data
alter table public.profiles enable row level security;
alter table public.quotes enable row level security;
alter table public.orders enable row level security;
alter table public.events enable row level security;
alter table public.notes enable row level security;
alter table public.activities enable row level security;

create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

do $$
declare t text;
begin
  foreach t in array array['quotes','orders','events','notes','activities'] loop
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (true)', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (true)', t);
  end loop;
end $$;

-- Realtime for live sync between Isparta & Istanbul devices
alter publication supabase_realtime add table public.quotes, public.orders, public.events, public.notes, public.activities;
