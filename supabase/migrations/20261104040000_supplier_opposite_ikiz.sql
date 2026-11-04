-- Zıt özellik: ikiz pompa ile tekli, "small" model ile normal, bronz ile bronz olmayan birbirine bağlanmaz
-- (SMART POMPA: "SPM 40/12-250 İNV" ikiz koda, "SPM 40/10 220 F inv" SMALL koda bağlanmıştı; fiyat farkı 2 katın altında).
create or replace function public.supplier_opposite(a text, b text) returns boolean
language sql immutable set search_path to 'public' as $$
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
$$;
