-- Otomatik eşleştirme: ürün tipi, PN ve bağlantı tipi de aynı olmalı
-- (sürgülü ≠ küresel, glob ≠ pislik tutucu, şamandıralı ≠ ters kovalı, lug ≠ wafer, PN40 ≠ PN16, flanşlı ≠ dişli)
-- Ana tip: iki taraftan birinde yazılıysa ortak bir tip olmalı (malzeme adlarındaki kısaltmalar da tanınır)
-- Alt tip: iki tarafta da yazılıysa ortak olmalı
create or replace function public.supplier_types(t text)
returns text[] language sql immutable set search_path to 'public' as $$
  -- "kelebek kollu vana" ve "rekorlu kelebek vana" küresel, "metal körüklü vana" glob vanadır
  with f as (select regexp_replace(regexp_replace(supplier_fold(t),
    '(kelebek\s*kol|rekorlu\s*kelebek)', 'kuresel', 'g'), 'koruklu\s*vana', 'glob', 'g') s)
  select coalesce(array_agg(k order by k), '{}') from f, lateral (values
    ('kuresel', 'k\s?ur[a-z]{0,3}sel|kur\.|kur\s+van|(d\.?\s*gaz|dogalgaz)\s*van'), ('surgu', 'surgu|yukselen\s*mil|bicakli'), ('glob', 'glob|glop'),
    ('pislik', 'pislik|pisl\.|suzgec|strainer|tortu|fili?tre'), ('kondenstop', 'konde[a-z]*top'),
    ('cekvalf', 'cek\s*valf|cekvalf|cek\s*vana'), ('kelebek', 'kelebek'),
    ('emniyet', 'emniyet|emn\.'), ('hidrant', 'hidran(?![a-z]*\s*(dirse|okce))'), ('hdirsek', 'hidran[a-z]*\s*(dirse|okce)'), ('dislikutusu', 'disli\s*kutu(su)?([^a-z]|$)'), ('vakum', 'vakum'), ('piston', 'piston|pistolu'), ('balans', 'balans'),
    ('gozetleme', 'gozetleme'), ('kompansator', 'kompan|kmpans|komp\.|dilat'),
    ('basinc', 'basinc\s*(dus|reg)|regulator|shatof|sahtof'), ('selenoid', 'selenoid|solenoid'),
    ('pompa', 'pomp|poma|hidrofor'), ('manometre', 'manometre|(^|[^a-z])man\.|m\.\s*metre'),
    ('termometre', 'termometre|payrometre'), ('kollektor', 'kolekt|kollekt|(^|[^a-z])kol+e?\.|(^|[^a-z])kolle')
  ) v(k, re) where f.s ~ v.re
$$;

create or replace function public.supplier_subtypes(t text)
returns text[] language sql immutable set search_path to 'public' as $$
  with f as (select supplier_fold(t) s)
  select coalesce(array_agg(k order by k), '{}') from f, lateral (values
    ('samandira', 'samandira'), ('terskova', 'kovali'), ('termodinamik', 'termodinamik|t\.?\s*dinamik'),
    ('termostatik', 'termostatik|bimetal'), ('dual', 'dual|cift\s*klape'), ('disko', 'disk|disco'),
    ('yayli', 'yayli|lift'), ('kumandali', 'kumandali'), ('swing', 'swing|calpara'),
    ('kaucuk', 'kaucuk'), ('koruk', 'koruk')
  ) v(k, re) where f.s ~ v.re
$$;

-- PN değerleri: "PN 10/16", "PN10-16", "PN2-PN5" birden çok değer verir
create or replace function public.supplier_pns(t text)
returns int[] language sql immutable set search_path to 'public' as $$
  select coalesce(array_agg(distinct n::int), '{}') from
    regexp_matches(supplier_fold(t), 'pn[\s-]*(\d{1,3}(?:\s*[/-]\s*(?:pn\s*)?\d{1,3})*)', 'g') m,
    lateral regexp_matches(m[1], '\d{1,3}', 'g') d(x), lateral (select d.x[1]) y(n)
$$;

create or replace function public.supplier_conn(t text)
returns text language sql immutable set search_path to 'public' as $$
  -- "dişli kutulu/kutusu" bağlantı tipi değildir
  select case when s ~ 'flan|fls' then 'flansli' when s ~ 'disli' then 'disli' end
  from (select regexp_replace(supplier_fold(t), 'disli\s*kut[a-z.]*', ' ', 'g') s) x
$$;

create or replace function public.supplier_same_kind(a text, b text)
returns boolean language sql immutable set search_path to 'public' as $$
  select ((cardinality(supplier_types(a)) = 0 and cardinality(supplier_types(b)) = 0) or supplier_types(a) && supplier_types(b))
    and (cardinality(supplier_subtypes(a)) = 0 or cardinality(supplier_subtypes(b)) = 0 or supplier_subtypes(a) && supplier_subtypes(b))
    and (cardinality(supplier_pns(a)) = 0 or cardinality(supplier_pns(b)) = 0 or supplier_pns(a) && supplier_pns(b))
    -- lug kelebek ≠ wafer kelebek
    and not (supplier_fold(a) ~ '(^|[^a-z])lug([^a-z]|$)' and supplier_fold(b) ~ 'wafer')
    and not (supplier_fold(b) ~ '(^|[^a-z])lug([^a-z]|$)' and supplier_fold(a) ~ 'wafer')
    and (supplier_conn(a) is null or supplier_conn(b) is null or supplier_conn(a) = supplier_conn(b))
$$;

create or replace function public.supplier_same_spec(a text, b text)
returns boolean language sql immutable set search_path to 'public' as $$
  select supplier_same_kind(a, b) and case
    when supplier_dn(a) is not null and supplier_dn(b) is not null then
      supplier_dn(a) = supplier_dn(b) and supplier_kw(a) = supplier_kw(b)
      and coalesce(supplier_cm(a), '') = coalesce(supplier_cm(b), '')
    else
      supplier_kw(a) = supplier_kw(b)
      and coalesce(supplier_cm(a), '') = coalesce(supplier_cm(b), '')
      -- inç ölçüleri adet adet aynı olmalı (8"x4"x8" ≠ 4"; 1"x3/4"x3/4" ≠ 1"x1"x3/4")
      and supplier_inch_all(a) = supplier_inch_all(b)
      and (supplier_cm(a) is not null or cardinality(supplier_inch_all(a)) > 0 or supplier_nums(a) = supplier_nums(b))
  end
$$;

create or replace function public.supplier_match_core(p_list text, lim integer default 150)
returns integer language plpgsql security definer set search_path to 'public', 'extensions' as $function$
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
  perform set_limit(0.25);
  for r in
    select id, code, name, supplier_fold(name) f,
           trim(regexp_replace(supplier_fold(name), '\([^)]*\)', ' ', 'g')) f2, supplier_dn(name) dn
    from supplier_items
    where list_id = p_list and our_code is null and not match_tried
    order by id limit lim
  loop
    hit := null;
    if has_brand and length(regexp_replace(coalesce(r.code, ''), '[^0-9A-Za-z]', '', 'g')) >= 3 then
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
    if hit is null then
      select c.code into hit from (
        select m.code, m.name, greatest(similarity(m.name_fold, r.f), similarity(m.name_fold, r.f2)) s
        from materials m
        where (m.name_fold % r.f or m.name_fold % r.f2)
          and (not has_brand or m.name_fold ~ brand_re)
        order by 3 desc
        limit 40
      ) c
      where c.s >= 0.3 and supplier_same_spec(c.name, r.name)
      order by c.s desc limit 1;
    end if;
    update supplier_items set our_code = hit, match_tried = true where id = r.id;
  end loop;
  return (select count(*) from supplier_items where list_id = p_list and our_code is null and not match_tried);
end $function$;

-- Hiç eşleştirilmemiş kalemleri arka planda dakikada bir parça eşleştirir; bitince kendini kapatır
create or replace function private.supplier_match_backlog()
returns void language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare l text;
begin
  select list_id into l from supplier_items where our_code is null and not match_tried limit 1;
  if l is null then
    perform cron.unschedule('supplier-match-backlog');
    return;
  end if;
  perform public.supplier_match_core(l, 300);
end $$;

select cron.schedule('supplier-match-backlog', '* * * * *', 'select private.supplier_match_backlog()');
