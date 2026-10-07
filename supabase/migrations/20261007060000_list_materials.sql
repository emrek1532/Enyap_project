-- Malzemeler sayfası: arama + filtre + sıralama (sunucuda, sayfa sayfa)
create or replace function public.list_materials(
  q text default '', field text default 'all',
  lim int default 50, off int default 0,
  f_currency text default null,      -- 'TRY' | 'USD' | 'EUR'
  f_unit text default null,          -- 'Adet', 'Metre', ...
  f_price text default null,         -- 'priced' | 'unpriced'
  f_stock text default null,         -- 'in' (>0) | 'zero' (=0/boş) | 'negative' (<0)
  sort_key text default 'default',   -- 'code' | 'name' | 'price' | 'stock' | 'updated' | 'default'
  sort_dir text default 'asc')
returns table (code text, name text, price numeric, currency text, unit text, vat_rate numeric, stock numeric, updated_at timestamptz, total bigint)
language sql stable set search_path = '' as $$
  with norm as (
    select lower(translate(coalesce(q, ''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')) as nq
  ),
  toks as (
    select '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
    from norm, regexp_split_to_table(norm.nq, '\s+') t
    where t <> ''
  ),
  m as (
    select m.*,
      case field
        when 'code' then lower(translate(m.code, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'))
        when 'name' then lower(translate(m.name, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'))
        else m.search end as hay
    from public.materials m
  )
  select m.code, m.name, m.price, m.currency, m.unit, m.vat_rate, m.stock, m.updated_at, count(*) over () as total
  from m
  where not exists (select 1 from toks where m.hay not like toks.pat)
    and (f_currency is null or m.currency = f_currency)
    and (f_unit is null or m.unit = f_unit)
    and (f_price is null or (f_price = 'priced' and m.price > 0) or (f_price = 'unpriced' and m.price <= 0))
    and (f_stock is null
         or (f_stock = 'in' and m.stock > 0)
         or (f_stock = 'zero' and coalesce(m.stock, 0) = 0)
         or (f_stock = 'negative' and m.stock < 0))
  order by
    case when sort_key = 'default' then (m.price > 0) end desc,
    case when sort_key = 'code' and sort_dir = 'asc' then m.code end asc,
    case when sort_key = 'code' and sort_dir = 'desc' then m.code end desc,
    case when sort_key = 'name' and sort_dir = 'asc' then m.name end asc,
    case when sort_key = 'name' and sort_dir = 'desc' then m.name end desc,
    case when sort_key = 'price' and sort_dir = 'asc' then m.price end asc,
    case when sort_key = 'price' and sort_dir = 'desc' then m.price end desc,
    case when sort_key = 'stock' and sort_dir = 'asc' then m.stock end asc nulls first,
    case when sort_key = 'stock' and sort_dir = 'desc' then m.stock end desc nulls last,
    case when sort_key = 'updated' and sort_dir = 'asc' then m.updated_at end asc,
    case when sort_key = 'updated' and sort_dir = 'desc' then m.updated_at end desc,
    m.name, m.code
  limit greatest(1, least(lim, 200)) offset greatest(off, 0);
$$;
grant execute on function public.list_materials(text, text, int, int, text, text, text, text, text, text) to authenticated;
revoke execute on function public.list_materials(text, text, int, int, text, text, text, text, text, text) from anon, public;
