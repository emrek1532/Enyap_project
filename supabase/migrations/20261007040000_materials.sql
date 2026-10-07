-- Malzeme / fiyat kataloğu (~34 bin kalem). Cihaza indirilmez; teklif hazırlarken sunucuda aranır.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.materials (
  code text primary key,
  name text not null default '',
  price numeric(14,2) not null default 0,
  currency text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  unit text not null default 'Adet',
  vat_rate numeric(5,2) not null default 20,
  stock numeric(14,2),
  -- Türkçe harfleri sadeleştirilmiş arama metni (istemci de aynı dönüşümü yapar)
  search text generated always as (
    lower(translate(code || ' ' || name, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'))
  ) stored,
  updated_at timestamptz not null default now()
);

create index if not exists materials_search_trgm on public.materials using gin (search extensions.gin_trgm_ops);
create index if not exists materials_name_idx on public.materials (name);

alter table public.materials enable row level security;
create policy "materials_select" on public.materials for select to authenticated using (true);
create policy "materials_insert" on public.materials for insert to authenticated with check (true);
create policy "materials_update" on public.materials for update to authenticated using (true) with check (true);
create policy "materials_delete" on public.materials for delete to authenticated using (true);

-- Kelime kelime arama: her kelime kod ya da adda geçmeli. Fiyatlı kalemler önce gelir.
create or replace function public.search_materials(q text, lim int default 20, off int default 0, only_priced boolean default false)
returns table (code text, name text, price numeric, currency text, unit text, vat_rate numeric, stock numeric, updated_at timestamptz, total bigint)
language sql stable set search_path = '' as $$
  with toks as (
    select '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
    from regexp_split_to_table(lower(translate(coalesce(q, ''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')), '\s+') t
    where t <> ''
  )
  select m.code, m.name, m.price, m.currency, m.unit, m.vat_rate, m.stock, m.updated_at, count(*) over () as total
  from public.materials m
  where not exists (select 1 from toks where m.search not like toks.pat)
    and (not only_priced or m.price > 0)
  order by (m.price > 0) desc, m.name
  limit greatest(1, least(lim, 200)) offset greatest(off, 0);
$$;
grant execute on function public.search_materials(text, int, int, boolean) to authenticated;
revoke execute on function public.search_materials(text, int, int, boolean) from anon, public;
