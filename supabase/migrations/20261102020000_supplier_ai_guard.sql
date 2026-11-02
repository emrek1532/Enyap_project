-- Yapay zekâ eşleştirmesine sınır:
-- 1) Yalnızca bağsız kalemlere bakar; kuralların bağladığı kalemi değiştirmez ya da bağını silmez.
-- 2) Adaylar ölçüsü kalemle çelişmeyenlerle sınırlıdır; yapay zekâ yanlış ölçüyü seçemez.
-- 3) Yazarken de ölçü denetlenir: ölçüsü tutmayan seçim yazılmaz.

-- Ölçü uyumu: bizim üründe tedarikçi kaleminde olmayan bir inç ölçüsü varsa uyumsuz
-- ("1/2"-1/2" flex" ≠ "3/4"N*1/2"R flex"). Adların ölçü yazımı tutarsız olabildiği için (10" ↔ DN250,
-- "3"-11/2-3-11/2") yalnızca açık çelişki reddedilir; ölçüsü okunamayan ad uyumlu sayılır.
create or replace function public.supplier_size_ok(supplier_name text, our_name text) returns boolean
language sql immutable set search_path to 'public' as $$
  -- önündeki sayıya yapışık okunan ölçüler ("B16.9 1/2"" → 91/2) sonundan karşılaştırılır
  select cardinality(supplier_inch_all(supplier_name)) = 0 or cardinality(supplier_inch_all(our_name)) = 0
      or not exists (
        select 1 from unnest(supplier_inch_all(our_name)) o
        where not exists (select 1 from unnest(supplier_inch_all(supplier_name)) s where s = o or s like '%' || o))
$$;
create or replace function public.supplier_ai_batch(p_list text, lim integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  brand text;
  brand_re text;
  has_brand boolean := false;
  res jsonb := '[]';
  r record;
  cands jsonb;
  seen integer;
begin
  if not public.can('suppliers', 'edit') then raise exception 'Yetkiniz yok'; end if;
  select supplier_fold(split_part(regexp_replace(name, '^[0-9]+\s*', ''), ' ', 1)) into brand from supplier_lists where id = p_list;
  if length(coalesce(brand, '')) >= 3 then
    brand_re := '(^|[^a-z])' || brand || '([^a-z]|$)';
    has_brand := exists(select 1 from materials where name_fold ~ brand_re);
    if not has_brand and length(brand) > 3 then
      brand_re := '(^|[^a-z])' || left(brand, 3) || '([^a-z]|$)';
      has_brand := exists(select 1 from materials where name_fold ~ brand_re);
    end if;
  end if;
  perform set_limit(0.2);
  -- adaysız kalemler sorulmadan geçildiği için paket boş dönebilir; sorulacak kalem bulunana ya da kalem bitene kadar sürer
  for k in 1..20 loop
  seen := 0;
  for r in
    select id, code, name, supplier_fold(name) f
    from supplier_items
    where list_id = p_list and not match_manual and not ai_checked and our_code is null
    order by id limit lim
  loop
    seen := seen + 1;
    select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name)), '[]') into cands from (
      select y.code, y.name from (
        select m.code, m.name, similarity(m.name_fold, r.f) s from materials m
        where m.name_fold % r.f and (not has_brand or m.name_fold ~ brand_re)
        order by 3 desc limit 60
      ) y
      where supplier_size_ok(r.name, y.name)
      order by y.s desc limit 10
    ) x;
    if cands = '[]'::jsonb then
      -- aynı ölçüde aday yok: yapay zekâya sormadan geç
      update supplier_items set ai_checked = true, match_tried = true where id = r.id;
    else
      res := res || jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'current', null, 'candidates', cands);
    end if;
  end loop;
  exit when res <> '[]'::jsonb or seen = 0;
  end loop;
  return res;
end $function$;

-- Dönüş: bağlanan kalem sayısı
create or replace function public.supplier_ai_apply(p jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if not public.can('suppliers', 'edit') then raise exception 'Yetkiniz yok'; end if;
  update supplier_items i set
    our_code = case
      when i.our_code is not null then i.our_code
      when m.code is null then null
      when not supplier_size_ok(i.name, m.name) then null
      else m.code end,
    ai_checked = true, match_tried = true
  from jsonb_array_elements(p) x
  left join materials m on m.code = nullif(x->>'code', '')
  where i.id = (x->>'id')::bigint and not i.match_manual;
  -- bağlanan kalem sayısı (ölçü denetiminden geçenler)
  select count(*) into n from supplier_items i, jsonb_array_elements(p) x
  where i.id = (x->>'id')::bigint and i.our_code is not null and i.our_code = x->>'code';
  return n;
end $function$;
