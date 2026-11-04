-- Eşleştirmede fiyat ve hacim/basınç kuralı (WATES: 100 LT → 2000 LT, 10 BAR → 16 BAR, tank → membran bağlanıyordu).
-- 1) Fiyat: bizim katalog fiyatı ile firma liste fiyatı (aynı para birimi) 2 kattan fazla farklıysa bağlanmaz.
--    Elle bağlanmış (doğru kabul edilen) 2645 bağın %99,2'si 0,5–2 aralığında; otomatik bağların %8,4'ü dışında.
-- 2) İsimde litre (LT) ya da bar değeri iki tarafta da varsa aynı olmalı; membran (yedek parça) tanka bağlanmaz.
-- Her eşleştirme adımına (supplier_match_core, yapay zekâ adayları ve yazımı, öneri, denetim) eklenir.

create or replace function public.supplier_price_bad(p_price numeric, p_cur text, p_code text) returns boolean
language sql stable set search_path to 'public' as $$
  select exists (select 1 from materials m
    where m.code = p_code and m.price > 0 and coalesce(p_price, 0) > 0 and m.currency = coalesce(p_cur, 'TRY')
      and (m.price / p_price > 2 or m.price / p_price < 0.5))
$$;

-- "100 LT", "24lt", "16 BAR" → sayılar
create or replace function public.supplier_unit_nums(t text, unit_re text) returns numeric[]
language sql immutable set search_path to 'public' as $$
  select array_agg(distinct replace(x[1], ',', '.')::numeric order by replace(x[1], ',', '.')::numeric)
  from regexp_matches(supplier_fold(t), '(\d+(?:[.,]\d+)?)\s*(?:' || unit_re || ')(?![a-z])', 'g') x
$$;

create or replace function public.supplier_opposite(a text, b text) returns boolean
language sql immutable set search_path to 'public' as $$
  select exists (select 1 from (values ('tekli', 'ciftli'), ('kisa', 'uzun'), ('erkek', 'disi'), ('ic', 'dis'), ('u kanal', 'l kanal'),
      ('patent', 'kaynakli')) v(x, y),
    lateral (select supplier_fold(a) fa, supplier_fold(b) fb, '(^|[^a-z])' || x || '([^a-z]|$)' rx, '(^|[^a-z])' || y || '([^a-z]|$)' ry) f
    where (fa ~ rx and fa !~ ry and fb ~ ry and fb !~ rx)
       or (fa ~ ry and fa !~ rx and fb ~ rx and fb !~ ry))
  or exists (select 1 from unnest(array['spri?n[gk]|sipr', 'percin', '(^|[^a-z])membrani?([^a-z]|$)']) re
    where (supplier_fold(a) ~ re) <> (supplier_fold(b) ~ re))
  or exists (select 1 from unnest(array['lt|litre|litrelik', 'bar']) u,
    lateral (select supplier_unit_nums(a, u) na, supplier_unit_nums(b, u) nb) n
    where n.na is not null and n.nb is not null and n.na <> n.nb)
$$;

-- Fiyat kuralını eşleştirme fonksiyonlarına ekle (tanımlar yerinde güncellenir)
do $$
declare src text;
begin
  src := pg_get_functiondef('public.supplier_match_core(text,integer)'::regprocedure);
  if position('supplier_price_bad' in src) = 0 then
    src := replace(src, 'and not supplier_opposite(r.name, c.name)', 'and not supplier_opposite(r.name, c.name) and not supplier_price_bad(r.price, r.cur, c.code)');
    src := replace(src, 'or supplier_opposite(r.name, (select name from materials where code = hit))', 'or supplier_opposite(r.name, (select name from materials where code = hit)) or supplier_price_bad(r.price, r.cur, hit)');
    execute src;
  end if;

  src := pg_get_functiondef('public.supplier_ai_apply(jsonb)'::regprocedure);
  if position('supplier_price_bad' in src) = 0 then
    src := replace(src, 'when supplier_opposite(i.name, m.name) then null', 'when supplier_opposite(i.name, m.name) then null
      when supplier_price_bad(i.price, i.currency, m.code) then null');
    execute src;
  end if;

  src := pg_get_functiondef('public.supplier_ai_batch(text,integer)'::regprocedure);
  if position('supplier_price_bad' in src) = 0 then
    src := replace(src, 'select id, code, name, supplier_fold(name) f', 'select id, code, name, price, currency, supplier_fold(name) f');
    src := replace(src, 'and not supplier_opposite(r.name, y.name)', 'and not supplier_opposite(r.name, y.name) and not supplier_price_bad(r.price, r.currency, y.code)');
    execute src;
  end if;

  src := pg_get_functiondef('public.supplier_suggest(jsonb)'::regprocedure);
  if position('supplier_price_bad' in src) = 0 then
    src := replace(src, 'and not supplier_opposite(z.name, r.name)', 'and not supplier_opposite(z.name, r.name)
        and (r.code is null or not supplier_price_bad(z.price, z.currency, r.code))');
    execute src;
  end if;

  src := pg_get_functiondef('public.supplier_match_audit(text)'::regprocedure);
  if position('supplier_price_bad' in src) = 0 then
    src := replace(src, 'when supplier_opposite(s.name, m.name) then ''zıt özellik''', 'when supplier_opposite(s.name, m.name) then ''zıt özellik''
           when supplier_price_bad(s.price, s.currency, m.code) then ''fiyat farkı''');
    execute src;
  end if;
end $$;
