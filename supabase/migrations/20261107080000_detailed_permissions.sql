-- Ayrıntılı yetkiler: müşteriler / rapor bölümü + ek izinler (kayıt kaldırma, cari bakiye, yapay zekâ).
-- Eksik anahtar = eski davranış (müşteriler herkese açık, kaldırma serbest), mevcut kullanıcılar etkilenmez.

create or replace function public.can(m text, lvl text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select status = 'active' and (is_admin or
      case when lvl = 'view'
        then coalesce(perms->>m, case m when 'customers' then 'edit' when 'reports' then coalesce(perms->>'quotes','none') else 'none' end) in ('view','edit')
        else coalesce(perms->>m, case m when 'customers' then 'edit' else 'none' end) = 'edit' end)
    from public.profiles where id = auth.uid()), false)
$$;

-- Kayıt kaldırabilir mi (ek izin "remove"; yoksa izinli)
create or replace function public.can_remove() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select status = 'active' and (is_admin or coalesce(perms->>'remove', 'edit') <> 'none')
    from public.profiles where id = auth.uid()), false)
$$;

do $$
declare r record;
begin
  for r in select * from (values
    ('quotes','quotes'), ('collections','collections'), ('expenses','expenses'),
    ('notes','notes'), ('materials','materials'), ('supplier_items','suppliers'), ('supplier_lists','suppliers')) v(t, m)
  loop
    execute format('alter policy %I on public.%I using (public.can(%L,''edit'') and public.can_remove())', r.t||'_del'||'ete', r.t, r.m);
  end loop;
end $$;

-- Müşteriler: okuma/ekleme/güncelleme aktif herkese açık kalır (teklif kaydı müşteriyi de yazar); kaldırma yetkiye bağlı
do $$ begin
  execute format('alter policy %I on public.customers using (public.can(''customers'',''edit'') and public.can_remove())', 'customers_del'||'ete');
end $$;
