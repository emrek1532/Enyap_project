-- "Kuralla eşleştir": yapay zekâ olmadan, listedeki bağsız kalemlerin hepsini tek seferde bizim kodlara bağlar.
-- Aday katalog: listedeki bağlı kalemlerin kod önekleri (AKL…) ya da adında firma adı (AKEL) geçen malzemeler
-- (liste adındaki kelime kalemlerin %30'undan fazlasında geçiyorsa — "pompa" — firma adı sayılmaz; firmaya ait 100'den az ürün varsa liste adındaki tüm kelimeler kullanılır).
-- Kural (hepsi birlikte):
--   * ölçü çelişmez: inç (işaretsiz kesirler dahil: 3/4), cm (bir tarafta cm varsa öbüründe de olmalı), mm, DN, PN aynı; bağlantı türü (dişli/flanşlı) aynı; model numarası (25/80) aynı; zıt özellik (erkek/dişi, tekli/çiftli…) yok;
--     katalog fiyatı varsa liste fiyatının yarısı ile iki katı arasında
--   * ad uyuşur (kelime kökleri, ilk 4 harf) ve şu üçünden biri:
--     A) fiyat kuruşu kuruşuna aynı (±%0,5) + ortak kelime (ölçü aynı, 2+ kelime ya da iki adın kelimeleri birebir)
--     B) en az 2 ortak kelime ve katalog adının tüm kelimeleri kalemde (katalogda fazladan "çift çıkışlı" gibi kelime varsa olmaz); ya da en az 3 ortak kelime ve iki adın da %75'i ortak
--     C) tüm kelimeler aynı + ölçü aynı (tek kelimelik ürünler: "Sarı Nipel 1/2"")
--   * kalem için en iyi aday tek olmalı (eşitlik varsa bağlanmaz); bir kod birden çok kaleme çıkarsa en yüksek puanlı alır.
-- Bağlı ve elle bağlanan kodlara dokunmaz. p_apply=false: yalnız ne bağlanacağını gösterir.
-- Parça parça çalışır (8 sn sınırı): p_after'dan sonraki p_lim bağsız kalem; dönen 'next' bir sonraki p_after (null: bitti).
create or replace function public.supplier_rule_match_part(p_list text, p_apply boolean default true, p_after bigint default 0, p_lim integer default 400)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  picks jsonb;
  n int := 0;
  last_id bigint;
begin
  if not public.can('suppliers', case when p_apply then 'edit' else 'view' end) then raise exception 'Yetkiniz yok'; end if;

  with lst as (
    select l.id, l.currency, supplier_list_words(l.id) lw,
      -- firma adı sayılan kelimeler: kalemlerin %30'undan azında geçenler ("pompa" gibi ürün adları sayılmaz)
      array(select w from unnest(supplier_list_words(l.id)) w
        where (select count(*) from supplier_items i where i.list_id = l.id and supplier_fold(i.name) ~ ('(^|[^a-z])' || w))
            < 0.3 * (select count(*) from supplier_items i where i.list_id = l.id)) bw
    from supplier_lists l where l.id = p_list
  ),
  pre as (select coalesce(array_agg(distinct left(i.our_code, 3)), '{}') p from supplier_items i, lst
    where i.list_id = lst.id and i.our_code ~ '^[A-ZÇĞİÖŞÜ]{3}'),
  cat1 as materialized (
    select m.code, m.name, m.price, m.currency from materials m, lst, pre
    where left(m.code, 3) = any(pre.p)
       or exists (select 1 from unnest(lst.bw) w where supplier_fold(m.name) ~ ('(^|[^a-z])' || w || '([^a-z]|$)'))
  ), cat0 as (
    select * from cat1
    union
    -- firmaya ait ürün azsa ("Emek Conta" gibi) liste adındaki tüm kelimelere göre de aday alınır
    select m.code, m.name, m.price, m.currency from materials m, lst
    where (select count(*) from cat1) < 100
      and exists (select 1 from unnest(lst.lw) w where supplier_fold(m.name) ~ ('(^|[^a-z])' || w || '([^a-z]|$)'))
  ), catr as materialized (
    select m.code, m.name, m.price, m.currency, supplier_kind_words(m.name, lst.lw) kw0, supplier_inch_all(m.name) inch,
      supplier_types(m.name) ty, supplier_subtypes(m.name) st, supplier_pns(m.name) pns, supplier_colors(m.name) col, supplier_bars(m.name) bar, supplier_dims(m.name) dim, supplier_conn(m.name) conn, supplier_fold(m.name) fo,
      supplier_unit_nums(m.name, 'cm') cm, supplier_unit_nums(m.name, 'mm') mm, supplier_dn(m.name) dn, supplier_pn_key(m.name) pn,
      (select array_agg(distinct (f[1] || '/' || f[2]) order by (f[1] || '/' || f[2])) from regexp_matches(regexp_replace(m.name, 'pn\s*-?\s*\d+\s*[-/]\s*\d+', ' ', 'gi'), '(?<![0-9])(\d{2,3})\s*/\s*(\d{2,3})(?![0-9])', 'g') f) mp,
      (select array_agg(distinct f[1] order by f[1]) from regexp_matches(m.name, '(\d/\d{1,2})(?![0-9])', 'g') f) fr
    from cat0 m, lst
  ), stop as (
    -- adayların dörtte birinden fazlasında geçen kelimeler ("pompa" gibi) ayırt etmez, sayılmaz
    select coalesce(array_agg(w), '{}') sw from (
      select w from (select unnest(kw0) w from catr) x
      group by w having count(*) > greatest(20, 0.25 * (select count(*) from catr))) y
  ), cat as materialized (
    select c.*, array(select unnest(c.kw0) except select unnest(stop.sw)) kw from catr c, stop
  ), its as materialized (
    select i.id, i.name, i.price, coalesce(i.currency, lst.currency) cur,
      array(select unnest(supplier_kind_words(i.name, lst.lw)) except select unnest(stop.sw)) kw, supplier_inch_all(i.name) inch,
      supplier_types(i.name) ty, supplier_subtypes(i.name) st, supplier_pns(i.name) pns, supplier_colors(i.name) col, supplier_bars(i.name) bar, supplier_dims(i.name) dim, supplier_conn(i.name) conn, supplier_fold(i.name) fo,
      supplier_unit_nums(i.name, 'cm') cm, supplier_unit_nums(i.name, 'mm') mm, supplier_dn(i.name) dn, supplier_pn_key(i.name) pn,
      (select array_agg(distinct (f[1] || '/' || f[2]) order by (f[1] || '/' || f[2])) from regexp_matches(regexp_replace(i.name, 'pn\s*-?\s*\d+\s*[-/]\s*\d+', ' ', 'gi'), '(?<![0-9])(\d{2,3})\s*/\s*(\d{2,3})(?![0-9])', 'g') f) mp,
      (select array_agg(distinct f[1] order by f[1]) from regexp_matches(i.name, '(\d/\d{1,2})(?![0-9])', 'g') f) fr
    from supplier_items i, lst, stop where i.list_id = lst.id and i.our_code is null and i.id > p_after
    order by i.id limit greatest(1, least(p_lim, 1000))
  ), hits as materialized (
    -- ortak kelime sayısı kelime kelime birleştirerek (hızlı)
    select iw.id, cw.code, count(*)::int common
    from (select id, unnest(kw) w from its) iw
    join (select code, unnest(kw) w from cat) cw on cw.w = iw.w
    group by iw.id, cw.code
  ), pair as materialized (
    select i.id, i.name iname, c.code, c.name cname, h.common, cardinality(i.kw) iw, cardinality(c.kw) mw,
      (c.price > 0 and c.currency = i.cur and i.price > 0 and abs(c.price - i.price) <= 0.005 * i.price) peq,
      ((cardinality(i.inch) > 0 and i.inch = c.inch) or (i.dn is not null and i.dn = c.dn) or (i.cm is not null and i.cm = c.cm)) szeq,
      (cardinality(i.inch) = 0 and cardinality(c.inch) = 0 and i.dn is null and c.dn is null and i.cm is null and c.cm is null) nosz,
      -- supplier_same_kind ile aynı kontrol, ürün başına bir kez hesaplanan değerlerle (hızlı)
      (((cardinality(i.ty) = 0 and cardinality(c.ty) = 0) or i.ty && c.ty)
        and (cardinality(i.st) = 0 or cardinality(c.st) = 0 or i.st && c.st)
        and (cardinality(i.pns) = 0 or cardinality(c.pns) = 0 or i.pns && c.pns)
        and (cardinality(i.col) = 0 or cardinality(c.col) = 0 or i.col && c.col)
        and (cardinality(i.bar) = 0 or cardinality(c.bar) = 0 or i.bar && c.bar)
        and (cardinality(i.dim) = 0 or cardinality(c.dim) = 0 or i.dim && c.dim)
        and not (i.fo ~ '(^|[^a-z])lug([^a-z]|$)' and c.fo ~ 'wafer') and not (c.fo ~ '(^|[^a-z])lug([^a-z]|$)' and i.fo ~ 'wafer')
        and (i.conn is null or c.conn is null or i.conn = c.conn)) kind_ok
    from hits h join its i on i.id = h.id join cat c on c.code = h.code
    where not (cardinality(i.inch) > 0 and cardinality(c.inch) > 0 and i.inch <> c.inch)
      and not (i.fr is not null and c.fr is not null and i.fr <> c.fr)
      -- model numarası (25/80, 40/160) bir tarafta varsa iki tarafta aynı olmalı
      and i.mp is not distinct from c.mp
      and (i.cm is null) = (c.cm is null) and not (i.cm is not null and i.cm <> c.cm)
      and not (i.mm is not null and c.mm is not null and i.mm <> c.mm)
      and not (i.dn is not null and c.dn is not null and i.dn <> c.dn)
      and not (i.pn is not null and c.pn is not null and i.pn <> c.pn)
      and not (c.price > 0 and c.currency = i.cur and i.price > 0 and (c.price / i.price > 2 or c.price / i.price < 0.5))
  ), ok0 as materialized (
    select *, common * 10 + peq::int * 15 + szeq::int * 5 - abs(iw - mw) - (not szeq and not nosz)::int * 3 score from pair
    where kind_ok and ((peq and common >= 1 and (szeq or common >= 2 or (common = iw and common = mw)))
       or (common >= 2 and common = mw)
       or (common >= 3 and common::numeric / greatest(iw, 1) >= 0.75 and common::numeric / greatest(mw, 1) >= 0.75)
       or (common >= 1 and common = iw and common = mw and szeq))
  ), top3 as materialized (
    -- zıt özellik kontrolü yalnız her kalemin en iyi 3 adayında çalışır
    -- en üst puanda 3'ten fazla eşit aday varsa kalem belirsizdir, atlanır
    select * from (select *, row_number() over (partition by id order by score desc) r0,
        count(*) over (partition by id, score) tie0, max(score) over (partition by id) top from ok0) t
    where r0 <= 3 and not (score = top and tie0 > 3)
  ), ok as (
    select * from top3 where not supplier_opposite(iname, cname)
  ), ranked as (
    select *, rank() over (partition by id order by score desc) rk, count(*) over (partition by id, score) ties from ok
  ), best as (
    select * from ranked where rk = 1 and ties = 1
  ), per_code as (
    select *, rank() over (partition by code order by score desc) crk, count(*) over (partition by code, score) cties from best b
    -- listede başka kaleme zaten bağlı kod verilmez (parçalar arası çakışma olmasın)
    where not exists (select 1 from supplier_items x where x.list_id = p_list and x.our_code = b.code)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'iname', iname, 'cname', cname, 'peq', peq) order by id), '[]')
    into picks from per_code where crk = 1 and cties = 1;

  select max(id) into last_id from (select id from supplier_items where list_id = p_list and our_code is null and id > p_after order by id limit greatest(1, least(p_lim, 1000))) z;

  if p_apply then
    update supplier_items s set our_code = r.code, match_tried = true, match_manual = true
    from jsonb_to_recordset(picks) r(id bigint, code text)
    where s.id = r.id and s.our_code is null;
    get diagnostics n = row_count;
  else
    n := jsonb_array_length(picks);
  end if;

  return jsonb_build_object('linked', n, 'next', last_id,
    'examples', coalesce((select jsonb_agg(e.x) from (
      select (p->>'iname') || ' → ' || (p->>'code') || ' (' || (p->>'cname') || ')' || case when (p->>'peq')::boolean then ' · fiyat aynı' else '' end x
      from jsonb_array_elements(picks) p limit 200) e), '[]'::jsonb));
end $function$;

revoke execute on function public.supplier_rule_match_part(text, boolean, bigint, integer) from public, anon;
grant execute on function public.supplier_rule_match_part(text, boolean, bigint, integer) to authenticated;
