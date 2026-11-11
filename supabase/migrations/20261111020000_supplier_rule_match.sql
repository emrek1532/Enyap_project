-- "Kuralla eşleştir": yapay zekâ olmadan, listedeki bağsız kalemlerin hepsini tek seferde bizim kodlara bağlar.
-- Aday katalog: listedeki bağlı kalemlerin kod önekleri (AKL…) ya da adında firma adı (AKEL) geçen malzemeler.
-- Kural (hepsi birlikte):
--   * ölçü çelişmez: inç, cm, mm, DN, PN iki tarafta varsa aynı; zıt özellik (erkek/dişi, tekli/çiftli…) yok;
--     katalog fiyatı varsa liste fiyatının yarısı ile iki katı arasında
--   * ad uyuşur (kelime kökleri, ilk 4 harf) ve şu üçünden biri:
--     A) fiyat kuruşu kuruşuna aynı (±%0,5) + en az 1 ortak kelime
--     B) en az 2 ortak kelime, kalem adının %60'ı ve katalog adının %50'si ortak
--     C) tüm kelimeler aynı + ölçü aynı (tek kelimelik ürünler: "Sarı Nipel 1/2"")
--   * kalem için en iyi aday tek olmalı (eşitlik varsa bağlanmaz); bir kod birden çok kaleme çıkarsa en yüksek puanlı alır.
-- Bağlı ve elle bağlanan kodlara dokunmaz. p_apply=false: yalnız ne bağlanacağını gösterir.
create or replace function public.supplier_rule_match(p_list text, p_apply boolean default true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  picks jsonb;
  n int := 0;
begin
  if not public.can('suppliers', case when p_apply then 'edit' else 'view' end) then raise exception 'Yetkiniz yok'; end if;

  with lst as (select id, currency, supplier_list_words(id) lw from supplier_lists where id = p_list),
  pre as (select coalesce(array_agg(distinct left(i.our_code, 3)), '{}') p from supplier_items i, lst
    where i.list_id = lst.id and i.our_code ~ '^[A-ZÇĞİÖŞÜ]{3}'),
  cat as materialized (
    select m.code, m.name, m.price, m.currency, supplier_kind_words(m.name, lst.lw) kw, supplier_inch_all(m.name) inch,
      supplier_unit_nums(m.name, 'cm') cm, supplier_unit_nums(m.name, 'mm') mm, supplier_dn(m.name) dn, supplier_pn_key(m.name) pn
    from materials m, lst, pre
    where left(m.code, 3) = any(pre.p)
       or exists (select 1 from unnest(lst.lw) w where supplier_fold(m.name) ~ ('(^|[^a-z])' || w || '([^a-z]|$)'))
  ), its as materialized (
    select i.id, i.name, i.price, coalesce(i.currency, lst.currency) cur, supplier_kind_words(i.name, lst.lw) kw, supplier_inch_all(i.name) inch,
      supplier_unit_nums(i.name, 'cm') cm, supplier_unit_nums(i.name, 'mm') mm, supplier_dn(i.name) dn, supplier_pn_key(i.name) pn
    from supplier_items i, lst where i.list_id = lst.id and i.our_code is null
  ), pair as (
    select i.id, i.name iname, c.code, c.name cname,
      (select count(*) from unnest(i.kw) w where w = any(c.kw))::int common, cardinality(i.kw) iw, cardinality(c.kw) mw,
      (c.price > 0 and c.currency = i.cur and i.price > 0 and abs(c.price - i.price) <= 0.005 * i.price) peq,
      ((cardinality(i.inch) > 0 and i.inch = c.inch) or (i.dn is not null and i.dn = c.dn) or (i.cm is not null and i.cm = c.cm)) szeq,
      (cardinality(i.inch) = 0 and cardinality(c.inch) = 0 and i.dn is null and c.dn is null and i.cm is null and c.cm is null) nosz
    from its i join cat c on i.kw && c.kw
    where not (cardinality(i.inch) > 0 and cardinality(c.inch) > 0 and i.inch <> c.inch)
      and not (i.cm is not null and c.cm is not null and i.cm <> c.cm)
      and not (i.mm is not null and c.mm is not null and i.mm <> c.mm)
      and not (i.dn is not null and c.dn is not null and i.dn <> c.dn)
      and not (i.pn is not null and c.pn is not null and i.pn <> c.pn)
      and not (c.price > 0 and c.currency = i.cur and i.price > 0 and (c.price / i.price > 2 or c.price / i.price < 0.5))
  ), ok as (
    select *, common * 10 + peq::int * 15 + szeq::int * 5 - abs(iw - mw) - (not szeq and not nosz)::int * 3 score from pair
    where not supplier_opposite(iname, cname)
      and ((peq and common >= 1)
        or (common >= 2 and common::numeric / greatest(iw, 1) >= 0.6 and common::numeric / greatest(mw, 1) >= 0.5)
        or (common >= 1 and common = iw and common = mw and szeq))
  ), ranked as (
    select *, rank() over (partition by id order by score desc) rk, count(*) over (partition by id, score) ties from ok
  ), best as (
    select * from ranked where rk = 1 and ties = 1
  ), per_code as (
    select *, rank() over (partition by code order by score desc) crk, count(*) over (partition by code, score) cties from best
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'iname', iname, 'cname', cname, 'peq', peq) order by id), '[]')
    into picks from per_code where crk = 1 and cties = 1;

  if p_apply then
    update supplier_items s set our_code = r.code, match_tried = true, match_manual = true
    from jsonb_to_recordset(picks) r(id bigint, code text)
    where s.id = r.id and s.our_code is null;
    get diagnostics n = row_count;
  else
    n := jsonb_array_length(picks);
  end if;

  return jsonb_build_object('linked', n,
    'examples', coalesce((select jsonb_agg(e.x) from (
      select (p->>'iname') || ' → ' || (p->>'code') || ' (' || (p->>'cname') || ')' || case when (p->>'peq')::boolean then ' · fiyat aynı' else '' end x
      from jsonb_array_elements(picks) p limit 10) e), '[]'::jsonb));
end $function$;

revoke execute on function public.supplier_rule_match(text, boolean) from public, anon;
grant execute on function public.supplier_rule_match(text, boolean) to authenticated;
