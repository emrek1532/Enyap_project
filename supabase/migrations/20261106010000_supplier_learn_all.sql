-- "Diğer ölçülere uygula" düğmesi: elle bağlanan kalemden aynı adlı diğer ölçüleri bağlar.
-- supplier_learn (bağlayınca kendiliğinden) yalnız otomatik/bağsız kalemlere dokunur;
-- supplier_learn_all (düğme) "eşleşmedi" diye kilitlenmiş kalemleri de bağlar.
-- Elle verilmiş kodlara ikisi de dokunmaz.
-- PN değeri (PN6 / PN16 / PN10-16) adda varsa aynı olmalı: harf iskeleti rakamları sildiği için
-- "PN6 … Vana" ile "PN10-16 … Vana" aynı sayılıyordu; artık ne kalem ne katalog ailesi karışır.
create or replace function public.supplier_pn_key(t text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  select string_agg(regexp_replace(m[1], '\s', '', 'g'), ',')
  from regexp_matches(supplier_fold(t), 'pn\s*-?\s*(\d+(?:\s*[-/]\s*\d+)?)', 'g') m
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
    where supplier_pn_key(name) is not distinct from supplier_pn_key(code_name)
      and ((pref is not null and left(code, length(pref)) = pref and substr(code, length(pref) + 1, 1) ~ '[0-9]')
       or (length(code_shape) >= 3 and left(code, 2) = left(src.our_code, 2) and supplier_shape(name) = code_shape))
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
  where s.list_id = src.list_id and s.id <> src.id and (not s.match_manual or (p_force and s.our_code is null))
    and s.our_code is distinct from u.code
    and supplier_shape(s.name) = shape and supplier_size_key(s.name) = u.sk
    and supplier_pn_key(s.name) is not distinct from supplier_pn_key(src.name)
    and (src_mm is null or supplier_unit_nums(s.name, 'mm') is not distinct from src_mm);
  get diagnostics n = row_count;

  -- farklı kalınlıktaki kardeşler (aynı ad, aynı ölçü ailesi) bağsız kilitlenir
  if src_mm is not null then
    update supplier_items s set our_code = null, match_tried = true, match_manual = true
    where s.list_id = src.list_id and s.id <> src.id and not s.match_manual
      and supplier_shape(s.name) = shape
      and supplier_pn_key(s.name) is not distinct from supplier_pn_key(src.name)
      and supplier_unit_nums(s.name, 'mm') is distinct from src_mm
      and (supplier_size_key(s.name) = supplier_size_key(src.name)
           or supplier_size_key(s.name) in (select unnest(sks)));
  end if;
  return n;
end $function$;

create or replace function public.supplier_learn(p_item bigint)
 RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ select public.supplier_learn_core(p_item, false) $$;

create or replace function public.supplier_learn_all(p_item bigint)
 RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ select public.supplier_learn_core(p_item, true) $$;

revoke execute on function public.supplier_learn_core(bigint, boolean) from public, anon, authenticated;
revoke execute on function public.supplier_learn(bigint) from public, anon;
revoke execute on function public.supplier_learn_all(bigint) from public, anon;
grant execute on function public.supplier_learn(bigint) to authenticated;
grant execute on function public.supplier_learn_all(bigint) to authenticated;
