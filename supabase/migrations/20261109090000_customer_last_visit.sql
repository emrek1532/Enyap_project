-- Müşteriye son uğrama tarihi (Müşteriler listesinde "Uğradım" işareti)
alter table public.customers add column if not exists last_visit date;
