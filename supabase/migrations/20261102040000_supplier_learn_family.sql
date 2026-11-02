-- Elle bağlanan kalemden öğrenme genişletildi:
-- 1) Aynı adlı diğer ölçüler daha önce OTOMATİK olarak başka koda bağlandıysa onlar da düzeltilir (elle bağlananlara dokunulmaz).
-- 2) Kod ailesi yalnız kod önekiyle (YVSUTK…) değil, ürün adı kalıbıyla da bulunur (kodunda ölçüden önce rakam olan ürünler: LK340*40).
-- 3) Öğrenilen bağlar elle sayılır: sonraki otomatik eşleştirme bunları değiştirmez.
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
  n int := 0;
begin
  if not public.can('suppliers','edit') then raise exception 'Yetkiniz yok'; end if;
  select id, list_id, name, our_code into src from supplier_items where id = p_item;
  if src.our_code is null then return 0; end if;
  shape := supplier_shape(src.name);
  if length(shape) < 3 then return 0; end if;
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
  ), uniq as (
    select sk, min(code) code from best where rk = 1 group by sk having count(*) = 1
  )
  update supplier_items s set our_code = u.code, match_tried = true, match_manual = true
  from uniq u
  where s.list_id = src.list_id and s.id <> src.id and not s.match_manual
    and s.our_code is distinct from u.code
    and supplier_shape(s.name) = shape and supplier_size_key(s.name) = u.sk;
  get diagnostics n = row_count;
  return n;
end $function$;
