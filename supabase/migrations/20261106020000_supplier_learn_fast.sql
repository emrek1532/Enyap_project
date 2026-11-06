-- supplier_learn hız: katalog ailesi önce ucuz kod süzgeciyle (kod öneki / ilk 2 harf) daraltılır,
-- ağır ad fonksiyonları (supplier_shape, supplier_pn_key, supplier_size_key) yalnız bu adaylarda çalışır.
-- Önceden 34 bin malzemenin hepsinde çalışıp 14 sn sürüyor, 8 sn sınırında zaman aşımına uğruyordu.
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
    select code, supplier_size_key(name) sk, shp = code_shape same, price > 0 priced
    from fam
    where (by_pref or shp = code_shape)
      and supplier_pn_key(name) is not distinct from code_pn
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
    and supplier_shape(s.name) = shape and supplier_size_key(s.name) = u.sk
    and supplier_pn_key(s.name) is not distinct from src_pn
    and (src_mm is null or supplier_unit_nums(s.name, 'mm') is not distinct from src_mm);
  get diagnostics n = row_count;

  if src_mm is not null then
    update supplier_items s set our_code = null, match_tried = true, match_manual = true
    where s.list_id = src.list_id and s.id <> src.id and not s.match_manual
      and supplier_shape(s.name) = shape
      and supplier_pn_key(s.name) is not distinct from src_pn
      and supplier_unit_nums(s.name, 'mm') is distinct from src_mm
      and (supplier_size_key(s.name) = supplier_size_key(src.name)
           or supplier_size_key(s.name) in (select unnest(sks)));
  end if;
  return n;
end $function$;
