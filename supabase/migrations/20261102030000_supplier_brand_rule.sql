-- Marka kuralı: tedarikçi kalemi başka bir markanın ürününe bağlanmaz.
-- Bayi listeleri (ör. AK GRUP: BeZe, ECO, Katotix…) birçok marka satar; benzer adlı başka marka ürününe
-- (BeZe şiber vana → Kalde kodu) bağlanmamalı.
-- 1) Kod sahibi: bizim kod öneki (ilk 3 harf) bağlantıların %70+'sıyla tek bir firmanın listesinden geliyorsa
--    (BYC → Beyco, KLD → Kalde, NRM → Norm) o önekli ürün başka firmanın kalemine, kalem adında o marka yazmıyorsa bağlanmaz.
-- 2) Ad markası: bizim ürün adında bir marka geçiyorsa (… EVS, … BEYCO) kalem adında da geçmeli ya da liste o markanın olmalı.

create table if not exists public.supplier_brand_cache (
  id int primary key default 1 check (id = 1),
  owners jsonb not null default '{}',
  words text[] not null default '{}',
  at timestamptz not null default now()
);
alter table public.supplier_brand_cache enable row level security;

-- Listenin marka kelimeleri: liste adındaki 3+ harfli kelimeler ("VALFTEK BONETTİ" → valftek, bonetti)
create or replace function public.supplier_list_words(p_list text) returns text[]
language sql stable set search_path to 'public' as $$
  select coalesce(array_agg(distinct w), '{}') from supplier_lists l,
    unnest(regexp_split_to_array(supplier_fold(regexp_replace(l.name, '^[0-9]+\s*', '')), '[^a-z0-9]+')) w
  where l.id = p_list and length(w) >= 3
$$;

create or replace function public.supplier_refresh_brands() returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into supplier_brand_cache (id, owners, words, at)
  select 1,
    coalesce((select jsonb_object_agg(p, b) from (
      select p, b from (
        select left(s.our_code, 3) p,
               supplier_fold(split_part(regexp_replace(l.name, '^[0-9]+\s*', ''), ' ', 1)) b,
               count(*) n, sum(count(*)) over (partition by left(s.our_code, 3)) tot
        from supplier_items s join supplier_lists l on l.id = s.list_id
        where s.our_code is not null group by 1, 2) x
      where length(b) >= 3 and n >= 5 and n >= 0.7 * tot) y), '{}'),
    (select array_agg(distinct w) from (
      select supplier_fold(split_part(regexp_replace(name, '^[0-9]+\s*', ''), ' ', 1)) w from supplier_lists
      union select unnest(array['evs','infit','beze','katotix','karbosan','asens','selsil','magmaweld','bonetti'])) z
     where length(w) >= 3),
    now()
  on conflict (id) do update set owners = excluded.owners, words = excluded.words, at = excluded.at;
end $$;

-- p_words: listenin marka kelimeleri (supplier_list_words)
create or replace function public.supplier_brand_ok(p_words text[], item_name text, our_code text, our_name text) returns boolean
language sql stable set search_path to 'public' as $$
  with c as (select owners, words from supplier_brand_cache where id = 1),
  v as (select supplier_fold(item_name) f, supplier_fold(our_name) m, c.owners ->> left(our_code, 3) ob, c.words from c)
  select coalesce((select
    (ob is null or ob = any(p_words) or f ~ ('(^|[^a-z])' || ob || '([^a-z]|$)'))
    and not exists (select 1 from unnest(words) w
      -- "TERMO.KOMPAKT" kısaltmadır, marka değil: noktayla devam eden kelime sayılmaz
      where m ~ ('(^|[^a-z])' || w || '([^a-z.]|$)') and not (w = any(p_words)) and f !~ ('(^|[^a-z])' || w || '([^a-z]|$)'))
  from v), true)
$$;

revoke execute on function public.supplier_refresh_brands() from public, anon;
select public.supplier_refresh_brands();

-- Çelişen özellik: biri "tekli" öbürü "çiftli" (kısa/uzun, erkek/dişi) ise aynı ürün değildir
create or replace function public.supplier_opposite(a text, b text) returns boolean
language sql immutable set search_path to 'public' as $$
  select exists (select 1 from (values ('tekli', 'ciftli'), ('kisa', 'uzun'), ('erkek', 'disi'), ('ic', 'dis')) v(x, y),
    lateral (select supplier_fold(a) fa, supplier_fold(b) fb) f
    where (fa ~ ('(^|[^a-z])' || x || '([^a-z]|$)') and fb ~ ('(^|[^a-z])' || y || '([^a-z]|$)') and fb !~ ('(^|[^a-z])' || x || '([^a-z]|$)'))
       or (fa ~ ('(^|[^a-z])' || y || '([^a-z]|$)') and fb ~ ('(^|[^a-z])' || x || '([^a-z]|$)') and fb !~ ('(^|[^a-z])' || y || '([^a-z]|$)')))
$$;

-- Kural; otomatik eşleştirmede (kurallar + yapay zekâ) uygulanır. Elle bağlantılar etkilenmez.
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
  v_fp text;
  pns int[];
  skey text;
  lw text[];
begin
  -- marka önbelleği 10 dakikadan eskiyse yenilenir
  if coalesce((select at from supplier_brand_cache where id = 1), '-infinity') < now() - interval '10 minutes' then
    perform supplier_refresh_brands();
  end if;
  lw := supplier_list_words(p_list);
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
    v_fp := part_fp(r.name);
    if v_fp is not null then
      pns := part_pns(r.name);
      select min(m.code) into hit from materials m
      where m.fp = v_fp
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
    if hit is null and v_fp is null then
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
        and supplier_brand_ok(lw, r.name, c.code, c.name) and not supplier_opposite(r.name, c.name)
      order by c.s desc limit 1;
    end if;
    -- marka kuralı: başka markanın ürününe bağlanmaz
    if hit is not null and (not supplier_brand_ok(lw, r.name, hit, (select name from materials where code = hit))
                            or supplier_opposite(r.name, (select name from materials where code = hit))) then
      hit := null;
    end if;
    update supplier_items set our_code = hit, match_tried = true where id = r.id;
  end loop;
  return (select count(*) from supplier_items where list_id = p_list and our_code is null and not match_tried);
end $function$;

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
  lw text[];
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
  lw := supplier_list_words(p_list);
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
      where supplier_size_ok(r.name, y.name) and supplier_brand_ok(lw, r.name, y.code, y.name)
        and not supplier_opposite(r.name, y.name)
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
      when not supplier_brand_ok(supplier_list_words(i.list_id), i.name, m.code, m.name) then null
      when supplier_opposite(i.name, m.name) then null
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

-- Marka sözlüğü katalogdan da çıkarılır: kod önekinin harfleri sırasıyla kelimede geçiyor ve o kelimeli ürünlerin
-- çoğu o önekle başlıyorsa marka sayılır (MKR → makro, FRT → firat, HKN → hakan, VSM → visam).
create or replace function public.supplier_refresh_brands() returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into supplier_brand_cache (id, owners, words, at)
  select 1,
    coalesce((select jsonb_object_agg(p, b) from (
      select p, b from (
        select left(s.our_code, 3) p,
               supplier_fold(split_part(regexp_replace(l.name, '^[0-9]+\s*', ''), ' ', 1)) b,
               count(*) n, sum(count(*)) over (partition by left(s.our_code, 3)) tot
        from supplier_items s join supplier_lists l on l.id = s.list_id
        where s.our_code is not null group by 1, 2) x
      where length(b) >= 3 and n >= 5 and n >= 0.7 * tot) y), '{}'),
    (select array_agg(distinct w) from (
      select supplier_fold(split_part(regexp_replace(name, '^[0-9]+\s*', ''), ' ', 1)) w from supplier_lists
      union select unnest(array['evs','infit','beze','katotix','karbosan','asens','selsil','magmaweld','bonetti','agis','formul'])
      union select w from (
        select w, p, count(*) n, sum(count(*)) over (partition by w) tot from (
          select distinct m.code, supplier_fold(left(m.code, 3)) p, w from materials m,
            unnest(regexp_split_to_array(m.name_fold, '[^a-z]+')) w where length(w) >= 3) t
        group by w, p) c
      where n >= 3 and n >= 0.6 * tot and p ~ '^[a-z]{3}$' and left(w, 1) = left(p, 1)
        and w ~ (substr(p, 1, 1) || '[a-z]*' || substr(p, 2, 1) || '[a-z]*' || substr(p, 3, 1))
        and w not in ('set', 'seri', 'sabit', 'sicak', 'soguk', 'tek', 'tip', 'pirinc', 'paslanmaz', 'flansli', 'disli', 'kollu',
                      'debimetre', 'element', 'general', 'klasik', 'locking', 'notrilizasyon', 'elostomer', 'alemunyum', 'tridolet',
                      'veldolet', 'stream', 'force', 'arti', 'tum', 'hay', 'soy', 'kal', 'pak', 'cikas', 'momentum')
    ) z where length(w) >= 3),
    now()
  on conflict (id) do update set owners = excluded.owners, words = excluded.words, at = excluded.at;
end $$;
revoke execute on function public.supplier_refresh_brands() from public, anon;
select public.supplier_refresh_brands();

-- U kanal ≠ L kanal
create or replace function public.supplier_opposite(a text, b text) returns boolean
language sql immutable set search_path to 'public' as $$
  select exists (select 1 from (values ('tekli', 'ciftli'), ('kisa', 'uzun'), ('erkek', 'disi'), ('ic', 'dis'), ('u kanal', 'l kanal')) v(x, y),
    lateral (select supplier_fold(a) fa, supplier_fold(b) fb, '(^|[^a-z])' || x || '([^a-z]|$)' rx, '(^|[^a-z])' || y || '([^a-z]|$)' ry) f
    where (fa ~ rx and fa !~ ry and fb ~ ry and fb !~ rx)
       or (fa ~ ry and fa !~ rx and fb ~ rx and fb !~ ry))
$$;

-- "PASL." = paslanmaz; "Springler" = sprinkler
create or replace function public.supplier_kw(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  with f as (
    select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
             lower(translate(coalesce(t,''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')),
             'celik\s*kol(lu)?', 'kollu', 'g'),
             '(^|[^a-z])mak(ar)?(\.|\s|$)', '\1makaron ', 'g'),
             'fan[\s\-]?[ck]oil', 'fancoil', 'g'),
             'burulor', 'brulor', 'g'),
             '(^|[^a-z])pasl(\.|\s|$)', '\1paslanmaz ', 'g') s
  )
  select coalesce(string_agg(k, ' ' order by k), '')
  from f, unnest(array['makaron','paslanmaz','izole','ciplak','delikli','celik','krom','nipel','fancoil','brulor','kompan','onden','yandan','dikisli','ayarl','agirlik']) k
  where f.s like '%' || k || '%'
$function$;

create or replace function public.supplier_types(t text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
    ('kelepce', 'kelepce|u[\s-]?bolt'), ('tapa', 'tapa'), ('sprinkler', 'spr[i]?n[gk]|sipr'), ('vantuz', 'vantuz'), ('krepin', 'krepin'),
    ('sayac', 'sayac|kalorimetre'), ('motor', 'motor')
  ) v(k, re) where f.s ~ v.re
$function$;

-- Kural denetimi: her listede kurallara uymayan bağlantılar. Elle bağlantılar "doğru cevap" sayılır:
-- kural bunları reddediyorsa kural fazla sıkıdır (gözden geçir); otomatik bağlantıları reddediyorsa bağlantı yanlıştır.
create or replace function public.supplier_match_audit(p_list text default null)
returns table (list text, linked bigint, auto_bad bigint, manual_bad bigint, examples text[])
language sql stable security definer set search_path to 'public' as $$
  with w as (select id, name, supplier_list_words(id) words from supplier_lists where p_list is null or id = p_list),
  x as (
    select w.name list, s.match_manual man, s.name sn, m.name mn,
      case when not supplier_brand_ok(w.words, s.name, s.our_code, m.name) then 'marka'
           when supplier_opposite(s.name, m.name) then 'zıt özellik'
           when not supplier_size_ok(s.name, m.name) then 'ölçü'
           when not supplier_same_kind(s.name, m.name) then 'tür'
           when supplier_kw(s.name) <> supplier_kw(m.name) then 'özellik' end why
    from supplier_items s join w on w.id = s.list_id join materials m on m.code = s.our_code)
  select list, count(*), count(*) filter (where why is not null and not man), count(*) filter (where why is not null and man),
    (array_agg(why || ': ' || left(sn, 40) || ' → ' || left(mn, 40)) filter (where why is not null))[1:5]
  from x group by list order by 3 desc, 4 desc
$$;
revoke execute on function public.supplier_match_audit(text) from public, anon;

-- Tek tarafta geçen ayırt edici özellik de çelişkidir (sprinkler, perçin); patent ≠ kaynaklı
create or replace function public.supplier_opposite(a text, b text) returns boolean
language sql immutable set search_path to 'public' as $$
  select exists (select 1 from (values ('tekli', 'ciftli'), ('kisa', 'uzun'), ('erkek', 'disi'), ('ic', 'dis'), ('u kanal', 'l kanal'),
      ('patent', 'kaynakli')) v(x, y),
    lateral (select supplier_fold(a) fa, supplier_fold(b) fb, '(^|[^a-z])' || x || '([^a-z]|$)' rx, '(^|[^a-z])' || y || '([^a-z]|$)' ry) f
    where (fa ~ rx and fa !~ ry and fb ~ ry and fb !~ rx)
       or (fa ~ ry and fa !~ rx and fb ~ rx and fb !~ ry))
  or exists (select 1 from unnest(array['spri?n[gk]|sipr', 'percin']) re
    where (supplier_fold(a) ~ re) <> (supplier_fold(b) ~ re))
$$;

-- Hızlı sürüm (kelime kümesi karşılaştırması). Kod listenin markasına aitse uygun; kısaltma ("yvz" ⊂ "yavuz") uygun;
-- noktalı kısaltmalar ("termo.kompakt") marka sayılmaz.
create or replace function public.supplier_brand_ok(p_words text[], item_name text, our_code text, our_name text) returns boolean
language sql stable set search_path to 'public' as $$
  with c as (select owners, words from supplier_brand_cache where id = 1),
  v as (select regexp_split_to_array(supplier_fold(item_name), '[^a-z]+') ft,
               array(select t from unnest(regexp_split_to_array(supplier_fold(our_name), '[^a-z.]+')) t where t !~ '\.') mt,
               c.owners ->> left(our_code, 3) ob, c.words from c)
  select coalesce((select
    coalesce(ob = any(p_words), false) or (
      (ob is null or ob = any(ft))
      and not exists (select 1 from unnest(mt) w where w = any(words) and not (w = any(p_words)) and not (w = any(ft))
        and not exists (select 1 from unnest(p_words) pw where pw ~ ('^' || regexp_replace(w, '(.)', '\1[a-z]*', 'g')))))
  from v), true)
$$;
