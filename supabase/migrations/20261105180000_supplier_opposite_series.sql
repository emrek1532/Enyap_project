-- Zıt özelliğe iki genel kural:
-- 1) Seri kodu: ölçü çiftinden hemen önceki 2-4 harf (SKY 40-160, SNL-40/160, PC 40-160) iki tarafta varsa aynı olmalı.
-- 2) Pompa ürünlerinde pano / 2'li grup: biri pano (ya da 2'li grup) diğeri değilse bağlanmaz.
create or replace function public.supplier_opposite(a text, b text)
returns boolean language sql immutable set search_path to 'public' as $$
  select exists (select 1 from (values ('tekli', 'ciftli'), ('kisa', 'uzun'), ('erkek', 'disi'), ('ic', 'dis'), ('u kanal', 'l kanal'),
      ('patent', 'kaynakli')) v(x, y),
    lateral (select supplier_fold(a) fa, supplier_fold(b) fb, '(^|[^a-z])' || x || '([^a-z]|$)' rx, '(^|[^a-z])' || y || '([^a-z]|$)' ry) f
    where (fa ~ rx and fa !~ ry and fb ~ ry and fb !~ rx)
       or (fa ~ ry and fa !~ rx and fb ~ rx and fb !~ ry))
  or exists (select 1 from unnest(array['spri?n[gk]|sipr', 'percin', '(^|[^a-z])membrani?([^a-z]|$)',
      '(^|[^a-z])ikiz([^a-z]|$)', '(^|[^a-z])small([^a-z]|$)', '(^|[^a-z])bronz']) re
    where (supplier_fold(a) ~ re) <> (supplier_fold(b) ~ re))
  or exists (select 1 from unnest(array['lt|litre|litrelik', 'bar']) u,
    lateral (select supplier_unit_nums(a, u) na, supplier_unit_nums(b, u) nb) n
    where n.na is not null and n.nb is not null and n.na <> n.nb)
  or exists (select 1 from (select
      (regexp_match(supplier_fold(a), '(^|[^a-z])([a-z]{2,4})[\s-]*\d{2,3}\s*[-/]\s*\d{2,3}'))[2] sa,
      (regexp_match(supplier_fold(b), '(^|[^a-z])([a-z]{2,4})[\s-]*\d{2,3}\s*[-/]\s*\d{2,3}'))[2] sb) s
    where s.sa <> s.sb)
  or (supplier_fold(a) ~ 'pomp' and supplier_fold(b) ~ 'pomp' and exists (
    select 1 from unnest(array['(^|[^a-z])pano', '(^|[^a-z0-9])(2|iki)\s*-?\s*(li|lu)?\s*grup']) re
    where (supplier_fold(a) ~ re) <> (supplier_fold(b) ~ re)))
$$;
