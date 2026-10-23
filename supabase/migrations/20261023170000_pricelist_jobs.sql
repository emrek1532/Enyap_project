-- Fiyat listesi yükleme işleri: sunucuda (uygulama kapalıyken de) işlenir; durum ve sonuç burada tutulur
create table if not exists public.pricelist_jobs (
  file_name text primary key,
  status text not null default 'kuyrukta',
  info text,
  state jsonb,
  result jsonb,
  error text,
  user_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pricelist_jobs enable row level security;
create policy pricelist_jobs_select on public.pricelist_jobs for select to authenticated using ((select public.can('suppliers', 'view')));
create policy pricelist_jobs_insert on public.pricelist_jobs for insert to authenticated with check ((select public.can('suppliers', 'edit')));
create policy pricelist_jobs_update on public.pricelist_jobs for update to authenticated using ((select public.can('suppliers', 'edit'))) with check ((select public.can('suppliers', 'edit')));
