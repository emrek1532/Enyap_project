-- Aramada inç ölçüsü tam eşleşir: 2" yazınca 1 1/2", 21/2", 1/2" gelmez; 1/2" yazınca 1 1/2" gelmez.
-- search_split: sorgudan ölçüleri ayırır; rest kelime aramasına, rx (regex) ölçü kontrolüne gider.
create or replace function public.search_split(q text, out rest text, out rx text[])
language plpgsql immutable set search_path to '' as $$
declare
  nq text := lower(translate(coalesce(q, ''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'));
  quote_rx constant text := '\s*("|''''|”|″|inc\M|parmak)';
  m text[];
  w text; a text; b text;
begin
  rx := '{}';
  nq := regexp_replace(nq, '(\d)\s*(''''|”|″|inc\M|parmak)', '\1"', 'g');
  loop
    -- tam + kesir (1 1/2", 1-1/2"), kesir (1/2", 21/2" = 2 1/2"), tam (2")
    m := regexp_match(nq, '(?:^|[^0-9/.,])((\d+)[ .-](\d)/(\d+)|(\d+)/(\d+)|(\d+))"');
    exit when m is null;
    if m[2] is not null then w := m[2]; a := m[3]; b := m[4];
    elsif m[5] is not null then
      w := null; a := m[5]; b := m[6];
      if length(a) > 1 and a::int > b::int then w := left(a, -1); a := right(a, 1); end if;
    else w := m[7]; a := null; b := null;
    end if;
    rx := rx || case
      when a is null then '(^|[^0-9/.,])' || w || '(?![0-9]|[ .-]?[0-9]/)' || quote_rx
      when w is null then '(?<!(^|[^0-9])[1-9][ .-])(^|[^0-9/.,])' || a || '/' || b || quote_rx
      else '(^|[^0-9/.,])' || w || '[ .-]?' || a || '/' || b || quote_rx end;
    nq := overlay(nq placing ' ' from position(m[1] || '"' in nq) for length(m[1]) + 1);
  end loop;
  rest := btrim(regexp_replace(nq, '\s+', ' ', 'g'));
end $$;

create or replace function public.search_materials(q text, lim integer default 20, off integer default 0, only_priced boolean default false, field text default 'all'::text)
 returns table(code text, name text, price numeric, currency text, unit text, vat_rate numeric, stock numeric, updated_at timestamp with time zone, total bigint)
 language plpgsql stable security definer set search_path to ''
as $function$
declare
  sp record := public.search_split(q);
  nq text := sp.rest;
  pats text[];
  col text := case field when 'code' then 'code_fold' when 'name' then 'name_fold' else 'search' end;
begin
  if not (public.can('materials','view') or public.can('quotes','edit')) then raise exception 'Yetkiniz yok'; end if;
  select coalesce(array_agg('%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' order by length(t) desc), '{}')
    into pats
    from regexp_split_to_table(nq, '\s+') t where t <> '';

  if array_length(pats, 1) is null and cardinality(sp.rx) = 0 then
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
    where ($1[1] is null or m.%1$I like $1[1]) and m.%1$I like all ($1) and m.%1$I ~ all ($6)
      and (not $2 or m.price > 0)
    order by (%2$L = 'code' and m.code_fold like $3) desc, (m.price > 0) desc,
      case when %2$L = 'code' then m.code else m.name end
    limit greatest(1, least($4, 200)) offset greatest($5, 0)
  $f$, col, field)
  using pats, only_priced, replace(replace(replace(replace(nq, ' ', ''), '\', '\\'), '%', '\%'), '_', '\_') || '%', lim, off, sp.rx;
end;
$function$;

create or replace function public.list_materials(q text default ''::text, field text default 'all'::text, lim integer default 50, off integer default 0, f_currency text default null::text, f_unit text default null::text, f_price text default null::text, f_stock text default null::text, sort_key text default 'default'::text, sort_dir text default 'asc'::text)
 returns table(code text, name text, price numeric, currency text, unit text, vat_rate numeric, stock numeric, updated_at timestamp with time zone, total bigint)
 language sql stable security definer set search_path to ''
as $function$select * from (
  with sp as (select * from public.search_split(q)),
  toks as (
    select '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
    from sp, regexp_split_to_table(sp.rest, '\s+') t
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
  from m, sp
  where not exists (select 1 from toks where m.hay not like toks.pat)
    and m.hay ~ all (sp.rx)
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
  limit greatest(1, least(lim, 200)) offset greatest(off, 0)) _g where (select (public.can('materials','view') or public.can('quotes','edit')))$function$;

create or replace function public.search_supplier_items_v3(q text, list text default null::text, lim integer default 30, off integer default 0)
 returns table(id bigint, list_id text, list_name text, discount numeric, code text, name text, price numeric, currency text, unit text, our_code text, our_name text, grp text, total bigint)
 language plpgsql stable security definer set search_path to ''
as $function$
declare
  sp record := public.search_split(q);
  pats text[];
begin
  if not public.can('suppliers','view') then raise exception 'Yetkiniz yok'; end if;
  select coalesce(array_agg('%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' order by length(t) desc), '{}')
    into pats
    from regexp_split_to_table(sp.rest, '\s+') t where t <> '';
  -- Gruplar PDF'teki sırayla (grubun ilk kalemine göre), grup içinde boy sırasıyla gelir
  return query
    with hit as (
      select i.*, l.name ln, l.discount ld, m.name mn,
             min(i.id) over (partition by i.list_id, i.grp) gfirst
      from public.supplier_items i
      join public.supplier_lists l on l.id = i.list_id
      left join public.materials m on m.code = i.our_code
      where (list is null or i.list_id = list)
        and (array_length(pats, 1) is null
             or (i.search || ' ' || lower(translate(coalesce(i.grp, ''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')) || ' ' || coalesce(m.search, '')) like all (pats))
        -- Ölçü firma kaleminin kendi adında olmalı (grup başlığında ya da bağlı malzemede değil)
        and i.search ~ all (sp.rx)
    )
    select h.id, h.list_id, h.ln, h.ld, h.code, h.name, h.price, h.currency, h.unit, h.our_code, h.mn, h.grp, count(*) over ()
    from hit h
    order by h.ln, h.gfirst, nullif(substring(h.name from '(\d+)\s*cm'), '')::int nulls last, h.id
    limit greatest(1, least(lim, 200)) offset greatest(off, 0);
end;
$function$;
