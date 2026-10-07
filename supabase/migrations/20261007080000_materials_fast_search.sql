-- Teklif hazırlarken malzeme aramasını hızlandırma:
-- kod ve ad için Türkçe harfleri sadeleştirilmiş, saklanan sütunlar + trigram dizinleri.
-- Arama en uzun kelimeyi dizinle bulur, diğer kelimeleri onun üstünde süzer.
alter table public.materials
  add column if not exists code_fold text generated always as (lower(translate(code, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'))) stored,
  add column if not exists name_fold text generated always as (lower(translate(name, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'))) stored;

create index if not exists materials_code_fold_trgm on public.materials using gin (code_fold extensions.gin_trgm_ops);
create index if not exists materials_name_fold_trgm on public.materials using gin (name_fold extensions.gin_trgm_ops);
create index if not exists materials_code_fold_prefix on public.materials (code_fold text_pattern_ops);

create or replace function public.search_materials(
  q text, lim int default 20, off int default 0, only_priced boolean default false, field text default 'all')
returns table (code text, name text, price numeric, currency text, unit text, vat_rate numeric, stock numeric, updated_at timestamptz, total bigint)
language plpgsql stable set search_path = '' as $$
declare
  nq text := lower(translate(coalesce(q, ''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'));
  pats text[];
  col text := case field when 'code' then 'code_fold' when 'name' then 'name_fold' else 'search' end;
begin
  -- Kelimeler, en uzunu başta (dizin en seçici kelimeyle çalışsın)
  select coalesce(array_agg('%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' order by length(t) desc), '{}')
    into pats
    from regexp_split_to_table(nq, '\s+') t where t <> '';

  if array_length(pats, 1) is null then
    return query
      select m.code, m.name, m.price, m.currency, m.unit, m.vat_rate, m.stock, m.updated_at, count(*) over ()
      from public.materials m
      where (not only_priced or m.price > 0)
      order by (m.price > 0) desc, m.name
      limit greatest(1, least(lim, 200)) offset greatest(off, 0);
    return;
  end if;

  return query execute format($f$
    select m.code, m.name, m.price, m.currency, m.unit, m.vat_rate, m.stock, m.updated_at, count(*) over ()
    from public.materials m
    where m.%1$I like $1[1] and m.%1$I like all ($1)
      and (not $2 or m.price > 0)
    order by (%2$L = 'code' and m.code_fold like $3) desc, (m.price > 0) desc,
      case when %2$L = 'code' then m.code else m.name end
    limit greatest(1, least($4, 200)) offset greatest($5, 0)
  $f$, col, field)
  using pats, only_priced, replace(replace(replace(replace(nq, ' ', ''), '\', '\\'), '%', '\%'), '_', '\_') || '%', lim, off;
end;
$$;
grant execute on function public.search_materials(text, int, int, boolean, text) to authenticated;
revoke execute on function public.search_materials(text, int, int, boolean, text) from anon, public;
