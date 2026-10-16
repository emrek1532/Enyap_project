alter table public.customers add column if not exists mikro_code text;
alter table public.customers add column if not exists mikro_title text;
alter table public.customers add column if not exists mikro_balance numeric;
alter table public.customers add column if not exists mikro_balance_date date;
alter table public.quotes add column if not exists lost_reason text;
