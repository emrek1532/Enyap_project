-- Yüklenen firma fiyat listesi PDF'lerinin ham yazısı (sayfa sayfa). Kalemlere ayrıştırma bundan yapılır.
create table if not exists public.supplier_raw_pages (
  file_name text not null,
  page int not null,
  content text not null default '',
  uploaded_at timestamptz not null default now(),
  primary key (file_name, page)
);
alter table public.supplier_raw_pages enable row level security;
create policy "supplier_raw_select" on public.supplier_raw_pages for select to authenticated using (true);
create policy "supplier_raw_insert" on public.supplier_raw_pages for insert to authenticated with check (true);
create policy "supplier_raw_update" on public.supplier_raw_pages for update to authenticated using (true) with check (true);
create policy "supplier_raw_delete" on public.supplier_raw_pages for delete to authenticated using (true);
