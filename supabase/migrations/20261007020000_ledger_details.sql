-- Tahsilatlarda çek / senet bilgileri, harcamalarda bölge
alter table public.collections
  add column if not exists city text,
  add column if not exists bank_name text,
  add column if not exists bank_branch text,
  add column if not exists check_no text,
  add column if not exists due_date date;
alter table public.expenses add column if not exists region text;
