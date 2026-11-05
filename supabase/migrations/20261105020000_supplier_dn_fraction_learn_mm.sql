-- 1) supplier_dn: "DN 15 1/2"" artık 151 değil 15 okunur (DN/Q sayısı kesirle birleşmeden aranır).
-- 2) supplier_learn kalınlık kuralı: elle bağlanan kalemde mm değeri varsa (ör. 3 mm),
--    yalnız aynı mm'li diğer ölçüler bağlanır; aynı ölçünün farklı mm'li kardeşleri
--    (ör. 2 mm) "eşleşmedi" olarak kilitlenir, otomatik eşleştirme onlara kod vermez.
create or replace function public.supplier_dn(t text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  with f as (select lower(translate(coalesce(t,''), 'İIıŞşĞğÜüÖöÇçØø', 'iiissgguuoocc00')) s),
  d as (
    select coalesce(
      (regexp_match(s, 'dn\s*-?\s*(\d{1,4})(?![0-9/])'))[1],
      (regexp_match(s, '(?:^|[^a-z0-9])(?:q|0)\s*(\d{2,4})(?:[^0-9/]|$)'))[1]
    ) v from f
  )
  select coalesce(v::int, (
    select case i when '1/4' then 8 when '3/8' then 10 when '1/2' then 15 when '3/4' then 20 when '1' then 25
      when '11/4' then 32 when '11/2' then 40 when '2' then 50 when '21/2' then 65 when '3' then 80 when '4' then 100
      when '5' then 125 when '6' then 150 when '8' then 200 end
    from (select supplier_inch(t) a) x, lateral (select x.a[1] i) y
    where cardinality(x.a) = 1))
  from d
$function$;

create or replace function public.supplier_learn(p_item bigint)
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
  select name into code_name from materials where code = src.our_code;
  code_shape := supplier_shape(code_name);
  pref := (regexp_match(src.our_code, '^([^0-9]+)[0-9]'))[1];
  if length(coalesce(pref, '')) < 2 then pref := null; end if;

  with fam as (
    select code, supplier_size_key(name) sk, supplier_shape(name) = code_shape same, price > 0 priced
    from materials
    where (pref is not null and left(code, length(pref)) = pref and substr(code, length(pref) + 1, 1) ~ '[0-9]')
       or (length(code_shape) >= 3 and left(code, 2) = left(src.our_code, 2) and supplier_shape(name) = code_shape)
  ), best as (
    select sk, code, rank() over (partition by sk order by same desc, priced desc) rk from fam where sk is not null
  )
  , uniq as (
    select sk, min(code) code from best where rk = 1 group by sk having count(*) = 1
  )
  select array_agg(sk), array_agg(code) into sks, codes from uniq;
  if sks is null then return 0; end if;

  -- aynı kalınlık (ya da kaynakta mm yoksa hepsi) bağlanır
  update supplier_items s set our_code = u.code, match_tried = true, match_manual = true
  from unnest(sks, codes) u(sk, code)
  where s.list_id = src.list_id and s.id <> src.id and not s.match_manual
    and s.our_code is distinct from u.code
    and supplier_shape(s.name) = shape and supplier_size_key(s.name) = u.sk
    and (src_mm is null or supplier_unit_nums(s.name, 'mm') is not distinct from src_mm);
  get diagnostics n = row_count;

  -- farklı kalınlıktaki kardeşler (aynı ad, aynı ölçü ailesi) bağsız kilitlenir
  if src_mm is not null then
    update supplier_items s set our_code = null, match_tried = true, match_manual = true
    where s.list_id = src.list_id and s.id <> src.id and not s.match_manual
      and supplier_shape(s.name) = shape
      and supplier_unit_nums(s.name, 'mm') is distinct from src_mm
      and (supplier_size_key(s.name) = supplier_size_key(src.name)
           or supplier_size_key(s.name) in (select unnest(sks)));
  end if;
  return n;
end $function$;
