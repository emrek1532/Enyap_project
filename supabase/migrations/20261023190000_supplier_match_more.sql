-- Otomatik eşleştirme: bağlantı parçası türleri, kelepçe türü, renk, bar ve ebat (15x15) da aynı olmalı
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
    ('gozetleme', 'gozetleme'), ('kompansator', 'kompan|kompa\.|kmpans|komp\.|dilat'),
    ('basinc', 'basinc\s*(dus|reg)|regulator|(^|[^a-z])reg\.|shatof|sahtof'), ('selenoid', 'selenoid|solenoid'),
    ('pompa', 'pomp|poma|hidrofor'), ('manometre', 'manometre|(^|[^a-z])man\.|m\.\s*metre'),
    ('termometre', 'termometre|payrometre'), ('kovan', 'kovan|termovil'), ('kollektor', 'kolekt|kollekt|(^|[^a-z])kol+e?\.|(^|[^a-z])kolle'),
    ('dirsek', 'dirse'), ('manson', 'manso?n'), ('rakor', 'r[ae]kor(?!lu|u?\s*haric)'), ('flex', 'flex|fleks'), ('reduksiyon', 'red[iu]ksiyon|(^|[^a-z])red\.'),
    ('kelepce', 'kelepce|u[\s-]?bolt'), ('tapa', 'tapa'), ('sprinkler', 'spr[i]?nk|sipr'), ('vantuz', 'vantuz'),
    ('sayac', 'sayac|kalorimetre'), ('motor', 'motor')
  ) v(k, re) where f.s ~ v.re
$$;

create or replace function public.supplier_subtypes(t text)
returns text[] language sql immutable set search_path to 'public' as $$
  with f as (select supplier_fold(t) s)
  select coalesce(array_agg(k order by k), '{}') from f, lateral (values
    ('samandira', 'samandira'), ('terskova', 'kovali'), ('termodinamik', 'termodinamik|t\.?\s*dinamik'),
    ('termostatik', 'termostatik|bimetal'), ('dual', 'dual|cift\s*klape'), ('disko', 'disk|disco'),
    ('yayli', 'yayli|lift'), ('kumandali', 'kumandali'), ('swing', 'swing|calpara'),
    ('kaucuk', 'kaucuk'), ('koruk', 'koruk'), ('trifon', 'trifon'), ('somun', 'somun')
  ) v(k, re) where f.s ~ v.re
$$;

create or replace function public.supplier_colors(t text)
returns text[] language sql immutable set search_path to 'public' as $$
  select coalesce(array_agg(k order by k), '{}') from (select supplier_fold(t) s) f, lateral (values
    ('beyaz'), ('gri'), ('siyah'), ('kirmizi'), ('mavi'), ('sari'), ('yesil'), ('krom'), ('nikel'), ('antrasit')
  ) v(k) where f.s ~ ('(^|[^a-z])' || v.k || '([^a-z]|$)')
$$;

-- "0-2,5 bar", "16 BAR" → üst değer
create or replace function public.supplier_bars(t text)
returns numeric[] language sql immutable set search_path to 'public' as $$
  select coalesce(array_agg(distinct replace(m[1], ',', '.')::numeric), '{}')
  from regexp_matches(supplier_fold(t), '(\d+(?:[.,]\d+)?)\s*bar', 'g') m
$$;

-- "15x15", "500*250" gibi ebatlar (inç ölçüleri hariç)
create or replace function public.supplier_dims(t text)
returns text[] language sql immutable set search_path to 'public' as $$
  select coalesce(array_agg(distinct m[1] || 'x' || m[2]), '{}')
  from regexp_matches(supplier_fold(t), '(\d{2,4})\s*[x*]\s*(\d{2,4})(?![0-9"/])', 'g') m
$$;

create or replace function public.supplier_same_kind(a text, b text)
returns boolean language sql immutable set search_path to 'public' as $$
  select ((cardinality(supplier_types(a)) = 0 and cardinality(supplier_types(b)) = 0) or supplier_types(a) && supplier_types(b))
    and (cardinality(supplier_subtypes(a)) = 0 or cardinality(supplier_subtypes(b)) = 0 or supplier_subtypes(a) && supplier_subtypes(b))
    and (cardinality(supplier_pns(a)) = 0 or cardinality(supplier_pns(b)) = 0 or supplier_pns(a) && supplier_pns(b))
    and (cardinality(supplier_colors(a)) = 0 or cardinality(supplier_colors(b)) = 0 or supplier_colors(a) && supplier_colors(b))
    and (cardinality(supplier_bars(a)) = 0 or cardinality(supplier_bars(b)) = 0 or supplier_bars(a) && supplier_bars(b))
    and (cardinality(supplier_dims(a)) = 0 or cardinality(supplier_dims(b)) = 0 or supplier_dims(a) && supplier_dims(b))
    -- lug kelebek ≠ wafer kelebek
    and not (supplier_fold(a) ~ '(^|[^a-z])lug([^a-z]|$)' and supplier_fold(b) ~ 'wafer')
    and not (supplier_fold(b) ~ '(^|[^a-z])lug([^a-z]|$)' and supplier_fold(a) ~ 'wafer')
    and (supplier_conn(a) is null or supplier_conn(b) is null or supplier_conn(a) = supplier_conn(b))
$$;

-- Benzerlik araması: tip yazmayan adlarda eşik 0,45
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
      -- tip yazmayan adlarda benzerlik daha yüksek olmalı ("asma rezervuar" ≠ "basmalı rezervuar iç takımı")
      where c.s >= case when cardinality(supplier_types(c.name)) = 0 and cardinality(supplier_types(r.name)) = 0 then 0.45 else 0.3 end
        and supplier_same_spec(c.name, r.name)
      order by c.s desc limit 1;
    end if;
    update supplier_items set our_code = hit, match_tried = true where id = r.id;
  end loop;
  return (select count(*) from supplier_items where list_id = p_list and our_code is null and not match_tried);
end $function$;

select cron.schedule('supplier-match-backlog', '* * * * *', 'select private.supplier_match_backlog()');
