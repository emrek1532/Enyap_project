-- Firma (tedarikçi) fiyat listeleri: bizim malzeme kataloğumuzdan (materials) AYRI tutulur.
-- Her liste bir "klasör"; kalemleri firmanın kendi kodu, adı ve liste fiyatıyla saklanır.
create table if not exists public.supplier_lists (
  id text primary key,                       -- ör. 'kalde-2026-01'
  name text not null,                        -- firma adı: 'Kalde'
  title text not null default '',            -- 'Kalde Ocak 2026 Fiyat Listesi'
  list_date text not null default '',        -- 'Ocak 2026'
  currency text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  discount numeric(5,2) not null default 0,  -- firmanın bize standart iskontosu (%)
  item_count int not null default 0,
  source_file text,
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_items (
  id bigserial primary key,
  list_id text not null references public.supplier_lists(id) on delete cascade,
  code text not null default '',             -- firmanın ürün kodu
  name text not null default '',
  price numeric(14,4) not null default 0,    -- liste fiyatı (iskontosuz)
  currency text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  unit text not null default 'Adet',
  our_code text,                             -- aynı ürün bizim katalogda varsa bizim kod
  search text generated always as (
    lower(translate(code || ' ' || name, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'))
  ) stored
);

create index if not exists supplier_items_list on public.supplier_items (list_id);
create index if not exists supplier_items_search_trgm on public.supplier_items using gin (search extensions.gin_trgm_ops);
create index if not exists supplier_items_our_code on public.supplier_items (our_code) where our_code is not null;

alter table public.supplier_lists enable row level security;
alter table public.supplier_items enable row level security;
create policy "supplier_lists_select" on public.supplier_lists for select to authenticated using (true);
create policy "supplier_lists_insert" on public.supplier_lists for insert to authenticated with check (true);
create policy "supplier_lists_update" on public.supplier_lists for update to authenticated using (true) with check (true);
create policy "supplier_lists_delete" on public.supplier_lists for delete to authenticated using (true);
create policy "supplier_items_select" on public.supplier_items for select to authenticated using (true);
create policy "supplier_items_insert" on public.supplier_items for insert to authenticated with check (true);
create policy "supplier_items_update" on public.supplier_items for update to authenticated using (true) with check (true);
create policy "supplier_items_delete" on public.supplier_items for delete to authenticated using (true);

-- Firma listelerinde arama: her kelime kod ya da adda geçmeli; list_id verilirse sadece o listede.
create or replace function public.search_supplier_items(q text, list text default null, lim int default 30, off int default 0)
returns table (id bigint, list_id text, list_name text, discount numeric, code text, name text, price numeric,
               currency text, unit text, our_code text, total bigint)
language plpgsql stable set search_path = '' as $$
declare
  pats text[];
begin
  select coalesce(array_agg('%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' order by length(t) desc), '{}')
    into pats
    from regexp_split_to_table(lower(translate(coalesce(q, ''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')), '\s+') t where t <> '';

  return query
    select i.id, i.list_id, l.name, l.discount, i.code, i.name, i.price, i.currency, i.unit, i.our_code, count(*) over ()
    from public.supplier_items i
    join public.supplier_lists l on l.id = i.list_id
    where (list is null or i.list_id = list)
      and (array_length(pats, 1) is null or (i.search like pats[1] and i.search like all (pats)))
    order by (i.price > 0) desc, l.name, i.name
    limit greatest(1, least(lim, 200)) offset greatest(off, 0);
end;
$$;
grant execute on function public.search_supplier_items(text, text, int, int) to authenticated;
revoke execute on function public.search_supplier_items(text, text, int, int) from anon, public;
