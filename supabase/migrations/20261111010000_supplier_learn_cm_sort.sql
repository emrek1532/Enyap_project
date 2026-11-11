-- 1) "Diğer ölçülere uygula" boyu (cm) farklı kardeşleri de bağlar.
--    Örn. Akel "26 mm Kromlu 1/2 Uzatma 1.5 cm" → AKLU1512. Önceden yalnız inç ölçüsüne (1/2" → 15) bakıldığı için
--    katalogdaki tüm uzatmalar aynı ölçüde sayılıyor, hiçbiri tek seçilemiyordu ("bağlanacak ölçü bulunamadı").
--    Artık kaynak kalemin adında cm varsa ölçü anahtarına cm de girer; kaynakta inç ölçüsü yoksa inç yok sayılır.
--    cm'li ailede kalınlığı (mm) farklı katalog kalemleri (25 MM) aday olmaz.
-- 2) Liste sırası: "1.5 cm" önceden "5 cm" diye okunuyordu (4 cm'den sonra çıkıyordu); ondalık doğru okunur.
create or replace function public.supplier_variant_key(t text, use_sk boolean, use_cm boolean)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  select nullif(
    case when use_sk then coalesce(supplier_size_key(t), '') else '' end || '#' ||
    case when use_cm then coalesce(supplier_unit_nums(t, 'cm')::text, '') else '' end, '#')
$$;

create or replace function public.supplier_learn_core(p_item bigint, p_force boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  src record;
  code_name text;
  pref text;
  shape text;
  code_shape text;
  code_pn text;
  src_pn text;
  src_mm numeric[];
  use_sk boolean;
  use_cm boolean;
  src_key text;
  sks text[];
  codes text[];
  n int := 0;
begin
  if not public.can('suppliers','edit') then raise exception 'Yetkiniz yok'; end if;
  select id, list_id, name, our_code into src from supplier_items where id = p_item;
  if src.our_code is null then return 0; end if;
  shape := supplier_shape(src.name);
  if length(shape) < 3 then return 0; end if;
  src_mm := supplier_unit_nums(src.name, 'mm');
  src_pn := supplier_pn_key(src.name);
  use_sk := supplier_size_key(src.name) is not null;
  use_cm := supplier_unit_nums(src.name, 'cm') is not null;
  src_key := supplier_variant_key(src.name, use_sk, use_cm);
  if src_key is null then return 0; end if;
  select name into code_name from materials where code = src.our_code;
  code_shape := supplier_shape(code_name);
  code_pn := supplier_pn_key(code_name);
  pref := (regexp_match(src.our_code, '^([^0-9]+)[0-9]'))[1];
  if length(coalesce(pref, '')) < 2 then pref := null; end if;

  with cand as materialized (
    select code, name, price,
      (pref is not null and left(code, length(pref)) = pref and substr(code, length(pref) + 1, 1) ~ '[0-9]') by_pref
    from materials
    where (pref is not null and left(code, length(pref)) = pref)
       or (length(code_shape) >= 3 and left(code, 2) = left(src.our_code, 2))
  ), fam as materialized (
    select code, name, price, by_pref, supplier_shape(name) shp from cand
  ), fam2 as (
    select code, supplier_variant_key(name, use_sk, use_cm) sk, shp = code_shape same, price > 0 priced
    from fam
    where (by_pref or shp = code_shape)
      and supplier_pn_key(name) is not distinct from code_pn
      and (not use_cm or src_mm is null or supplier_unit_nums(name, 'mm') is null or supplier_unit_nums(name, 'mm') = src_mm)
  ), best as (
    select sk, code, rank() over (partition by sk order by same desc, priced desc) rk from fam2 where sk is not null
  ), uniq as (
    select sk, min(code) code from best where rk = 1 group by sk having count(*) = 1
  )
  select array_agg(sk), array_agg(code) into sks, codes from uniq;
  if sks is null then return 0; end if;

  update supplier_items s set our_code = u.code, match_tried = true, match_manual = true
  from unnest(sks, codes) u(sk, code)
  where s.list_id = src.list_id and s.id <> src.id and (not s.match_manual or (p_force and s.our_code is null))
    and s.our_code is distinct from u.code
    and supplier_shape(s.name) = shape and supplier_variant_key(s.name, use_sk, use_cm) = u.sk
    and supplier_pn_key(s.name) is not distinct from src_pn
    and (src_mm is null or supplier_unit_nums(s.name, 'mm') is not distinct from src_mm);
  get diagnostics n = row_count;

  if src_mm is not null then
    update supplier_items s set our_code = null, match_tried = true, match_manual = true
    where s.list_id = src.list_id and s.id <> src.id and not s.match_manual
      and supplier_shape(s.name) = shape
      and supplier_pn_key(s.name) is not distinct from src_pn
      and supplier_unit_nums(s.name, 'mm') is distinct from src_mm
      and (supplier_variant_key(s.name, use_sk, use_cm) = src_key
           or supplier_variant_key(s.name, use_sk, use_cm) in (select unnest(sks)));
  end if;
  return n;
end $function$;

revoke execute on function public.supplier_learn_core(bigint, boolean) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_supplier_items_v3(q text, list text DEFAULT NULL::text, lim integer DEFAULT 30, off integer DEFAULT 0)
 RETURNS TABLE(id bigint, list_id text, list_name text, discount numeric, code text, name text, price numeric, currency text, unit text, our_code text, our_name text, grp text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sp record := public.search_split(q);
  pats text[];
begin
  if not public.can('suppliers','view') then raise exception 'Yetkiniz yok'; end if;
  select coalesce(array_agg('%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' order by length(t) desc), '{}')
    into pats
    from regexp_split_to_table(sp.rest, '\s+') t where t <> '';
  -- Gruplar PDF'teki sırayla (grubun ilk kalemine göre), grup içinde boy sırasıyla (1, 1.5, 2, 2.5 … cm) gelir
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
    order by h.ln, h.gfirst,
      replace(substring(h.name from '(?i)(\d+(?:[.,]\d+)?)\s*cm(?![a-zçğıöşü])'), ',', '.')::numeric nulls last, h.id
    limit greatest(1, least(lim, 200)) offset greatest(off, 0);
end;
$function$;
