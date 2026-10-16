alter table public.customers add column if not exists status text not null default 'aktif';
alter table public.customers add column if not exists status_note text;
alter table public.customers add constraint customers_status_check check (status in ('aktif','pasif','kara_liste'));
