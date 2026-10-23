-- Fiyat listesi eşleştirmesine iki kural:
-- 1) Fiyat: kuruşlu tedarikçi fiyatı bizim kayıtlı fiyatla birebir aynı + ölçü aynı + tür aynı ve tek aday → bağla.
-- 2) Elle bağlamadan öğrenme: bir kalem elle bağlanınca, listede aynı adlı (ölçüsü farklı) bağsız kalemler
--    aynı kod ailesinin (ör. SKM…) aynı ölçülü koduna bağlanır.

create index if not exists materials_price_idx on public.materials (price) where price > 0;

-- Ölçü anahtarı: DN/inç tekse DN, birden çok inç varsa (redüksiyon) inçlerin listesi
create or replace function public.supplier_size_key(t text) returns text
language sql immutable set search_path to 'public' as $$
  select coalesce(supplier_dn(t)::text, nullif(array_to_string(supplier_inch_all(t), 'x'), ''))
$$;

-- Ölçüsüz ad kalıbı: "Siyah Kalın Manşon 1 1/2"" → "siyah kalin manson"
create or replace function public.supplier_shape(t text) returns text
language sql immutable set search_path to 'public' as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(supplier_fold(t),
    '\([^)]*\)', ' ', 'g'),
    '(dn|q|ø)?\s*-?\s*\d+([.,/ ]\d+)*\s*("|''|”|“|mm|cm|lu|lik|luk)?', ' ', 'g'),
    '[^a-z]+', ' ', 'g'))
$$;

-- Fiyat eşleşmesinde tür denetimi: tür sözlüğü + parmak izi aynı; tür bilinmiyorsa ad kalıpları benzer olmalı
-- (aynı fiyatlı "Q 80 flanş adaptörü" ≠ "borulu buhar flanşı DN80", "1 1/2" selenoid vana" ≠ "kalorifer flanşı DN40")
create or replace function public.supplier_price_pair(a text, b text) returns boolean
language sql immutable set search_path to 'public', 'extensions' as $$
  select supplier_same_kind(a, b)
    and coalesce(part_fp(a), '') = coalesce(part_fp(b), '')
    and (cardinality(supplier_types(a)) > 0 or similarity(supplier_shape(a), supplier_shape(b)) >= 0.35)
$$;

create or replace function public.supplier_match_core(p_list text, lim integer DEFAULT 150)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  brand text;
  has_brand boolean := false;
  brand_re text;
  brand_tok text;
  r record;
  hit text;
  model text;
  best record;
  second_s real;
  pref text;
  fp text;
  pns int[];
  skey text;
begin
  select supplier_fold(split_part(regexp_replace(name, '^[0-9]+\s*', ''), ' ', 1)) into brand from supplier_lists where id = p_list;
  if length(coalesce(brand, '')) >= 3 then
    brand_re := '(^|[^a-z])' || brand || '([^a-z]|$)'; brand_tok := brand;
    has_brand := exists(select 1 from materials where name_fold ~ brand_re);
    if not has_brand and length(brand) > 3 then
      brand_re := '(^|[^a-z])' || left(brand, 3) || '([^a-z]|$)';
      brand_tok := left(brand, 3);
      has_brand := exists(select 1 from materials where name_fold ~ brand_re);
    end if;
  end if;
  -- Listenin baskın kod öneki: bağlı kalemlerin en az yarısı aynı 3 harfle başlıyorsa
  select p into pref from (
    select left(our_code, 3) p, count(*) c, sum(count(*)) over () tot
    from supplier_items where list_id = p_list and our_code is not null group by 1
  ) x where c >= 0.5 * tot order by c desc limit 1;
  perform set_limit(0.25);
  for r in
    select id, code, name, price, coalesce(currency, 'TRY') cur, supplier_fold(name) f,
           trim(regexp_replace(supplier_fold(name), '\([^)]*\)', ' ', 'g')) f2, supplier_dn(name) dn
    from supplier_items
    where list_id = p_list and our_code is null and not match_tried
    order by id limit lim
  loop
    hit := null;
    -- 1) standart parça parmak izi
    fp := part_fp(r.name);
    if fp is not null then
      pns := part_pns(r.name);
      select min(m.code) into hit from materials m
      where m.fp = fp
        and (cardinality(pns) = 0 or cardinality(part_pns(m.name)) = 0 or pns && part_pns(m.name))
        and (case when pref is not null then left(m.code, 3) = pref
                  when has_brand then m.name_fold ~ brand_re
                  else true end)
      having count(*) = 1;
    end if;
    -- 2) fiyat birebir aynı + ölçü aynı + tür aynı, tek aday. Yalnız kuruşlu fiyatlarda:
    --    yuvarlak fiyatlar (52,00) farklı ürünlerde tesadüfen çakışıyor
    if hit is null and r.price > 0 and r.price <> round(r.price) then
      skey := supplier_size_key(r.name);
      if skey is not null then
        select min(m.code) into hit from materials m
        where m.price > 0
          and m.price between r.price - greatest(0.011, r.price * 0.001) and r.price + greatest(0.011, r.price * 0.001)
          and coalesce(m.currency, 'TRY') = r.cur
          and supplier_size_key(m.name) = skey
          and supplier_price_pair(m.name, r.name)
        having count(*) = 1;
      end if;
    end if;
    if hit is null and has_brand and length(regexp_replace(coalesce(r.code, ''), '[^0-9A-Za-z]', '', 'g')) >= 3 then
      select m.code, greatest(similarity(m.name_fold, r.f), similarity(m.name_fold, r.f2)) s, count(*) over () n into best
      from materials m where m.name_fold ~ supplier_code_re(brand_tok, r.code)
      order by 2 desc limit 1;
      if best.code is not null then
        if best.n = 1 then hit := best.code;
        else
          select greatest(similarity(m.name_fold, r.f), similarity(m.name_fold, r.f2)) into second_s
          from materials m where m.name_fold ~ supplier_code_re(brand_tok, r.code)
          order by 1 desc offset 1 limit 1;
          if best.s - coalesce(second_s, 0) >= 0.05 then hit := best.code; end if;
        end if;
      end if;
    end if;
    model := (regexp_match(coalesce(r.code, ''), '(\d{3,5})'))[1];
    if hit is null and has_brand and model is not null and r.dn is not null then
      select c.code into hit from (
        select m.code, similarity(m.name_fold, r.f) s
        from materials m
        where m.name_fold ~ brand_re
          and m.name_fold ~ ('(^|[^0-9])' || model || '([^0-9]|$)')
          and supplier_dn(m.name) = r.dn
          and supplier_kw(m.name) = supplier_kw(r.name)
          and supplier_same_kind(m.name, r.name)
      ) c order by c.s desc limit 1;
    end if;
    if hit is null and length(r.code) >= 4 then
      select min(m.code) into hit from materials m
      where m.code_fold like '%' || supplier_fold(r.code)
        and (not has_brand or m.name_fold ~ brand_re)
        and supplier_same_spec(m.name, r.name)
      having count(*) = 1;
    end if;
    -- standart parçada parmak izi tutmadıysa benzerlikle bağlanmaz (yanlış ölçü/tür riski)
    if hit is null and fp is null then
      select c.code into hit from (
        select m.code, m.name, greatest(similarity(m.name_fold, r.f), similarity(m.name_fold, r.f2)) s
        from materials m
        where (m.name_fold % r.f or m.name_fold % r.f2)
          and (not has_brand or m.name_fold ~ brand_re)
        order by 3 desc
        limit 40
      ) c
      -- tip yazmayan adlarda benzerlik daha yüksek olmalı ("asma rezervuar" ≠ "basmalı rezervuar iç takımı")
      where c.s >= case when cardinality(supplier_types(c.name)) = 0 and cardinality(supplier_types(r.name)) = 0 then 0.45 else 0.3 end
        and supplier_same_spec(c.name, r.name)
      order by c.s desc limit 1;
    end if;
    update supplier_items set our_code = hit, match_tried = true where id = r.id;
  end loop;
  return (select count(*) from supplier_items where list_id = p_list and our_code is null and not match_tried);
end $function$;

-- Elle bağlanan kalemden öğren: aynı listedeki aynı ad kalıplı bağsız kalemleri,
-- bağlanan kodun ailesindeki (aynı harf öneki + rakam) aynı ölçülü koda bağlar. Bağlanan kalem sayısını döner.
create or replace function public.supplier_learn(p_item bigint)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  src record;
  code_name text;
  pref text;
  pref_re text;
  shape text;
  code_shape text;
  n int := 0;
begin
  if not public.can('suppliers','edit') then raise exception 'Yetkiniz yok'; end if;
  select id, list_id, name, our_code into src from supplier_items where id = p_item;
  if src.our_code is null then return 0; end if;
  pref := (regexp_match(src.our_code, '^([^0-9]+)[0-9]'))[1];
  if length(coalesce(pref, '')) < 2 then return 0; end if;
  pref_re := '^' || regexp_replace(pref, '([^A-Za-z0-9ÇĞİÖŞÜçğıöşü])', '\\\1', 'g') || '[0-9]';
  shape := supplier_shape(src.name);
  if length(shape) < 3 then return 0; end if;
  select name into code_name from materials where code = src.our_code;
  code_shape := supplier_shape(code_name);
  -- aile kodlarından her ölçüye tek aday: önce ad kalıbı bağlanan kodla aynı olan, sonra fiyatlı olan
  with fam as (
    select code, supplier_size_key(name) sk, supplier_shape(name) = code_shape same, price > 0 priced
    from materials where code ~ pref_re
  ), best as (
    select sk, code, rank() over (partition by sk order by same desc, priced desc) rk from fam where sk is not null
  ), uniq as (
    select sk, min(code) code from best where rk = 1 group by sk having count(*) = 1
  )
  update supplier_items s set our_code = u.code, match_tried = true
  from uniq u
  where s.list_id = src.list_id and s.id <> src.id and s.our_code is null and not s.match_manual
    and supplier_shape(s.name) = shape and supplier_size_key(s.name) = u.sk;
  get diagnostics n = row_count;
  return n;
end $function$;

grant execute on function public.supplier_learn(bigint) to authenticated;
