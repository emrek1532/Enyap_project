-- Otomatik eşleştirme: bizim malzeme adında "<MARKA> <firma kodu>" geçiyorsa (ör. "… KÜRESEL VANA TDS 104")
-- ve bu tek bir malzemeyse önce o seçilir. Ölçü yazımı farklı olsa bile (11/4" ↔ 1¼” DN32) eşleşir.
create or replace function public.auto_match_supplier_items(p_list text, lim integer default 150)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  brand text;
  has_brand boolean := false;
  brand_re text;
  brand_tok text;
  r record;
  hit text;
  model text;
  code_re text;
begin
  if not public.can('suppliers','edit') then raise exception 'Yetkiniz yok'; end if;
  select lower(translate(split_part(regexp_replace(name, '^[0-9]+\s*', ''), ' ', 1), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'))
    into brand from supplier_lists where id = p_list;
  if length(coalesce(brand, '')) >= 3 then
    brand_re := brand;
    brand_tok := brand;
    has_brand := exists(select 1 from materials where name_fold ~ brand_re);
    -- Marka adı bizde kısaltılmış olabilir (Aravalf → "ARA")
    if not has_brand and length(brand) > 3 then
      brand_re := '(^|[^a-z])' || left(brand, 3) || '([^a-z]|$)';
      brand_tok := left(brand, 3);
      has_brand := exists(select 1 from materials where name_fold ~ brand_re);
    end if;
  end if;
  perform set_limit(0.25);
  for r in
    select id, code, name, lower(translate(name, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')) f, supplier_dn(name) dn
    from supplier_items
    where list_id = p_list and our_code is null and not match_tried
    order by id limit lim
  loop
    hit := null;
    -- 0) Bizim adda "MARKA KOD" geçiyor (TDS 104, TDS-220): tek malzeme ise kesin eşleşme
    if has_brand and length(coalesce(r.code, '')) >= 3 then
      code_re := '(^|[^a-z0-9])' || brand_tok || '[\s\-]*'
        || regexp_replace(lower(translate(r.code, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')), '([.\-+()])', '\\\1', 'g')
        || '($|[^a-z0-9\-])';
      select min(m.code) into hit from materials m where m.name_fold ~ code_re having count(*) = 1;
    end if;
    -- 1) Firma model numarası (FAF1100 → "FAF 1100") + aynı ölçü
    model := (regexp_match(coalesce(r.code, ''), '(\d{3,5})'))[1];
    if hit is null and has_brand and model is not null and r.dn is not null then
      select c.code into hit from (
        select m.code, similarity(m.name_fold, r.f) s
        from materials m
        where m.name_fold ~ brand_re
          and m.name_fold ~ ('(^|[^0-9])' || model || '([^0-9]|$)')
          and supplier_dn(m.name) = r.dn
          and supplier_kw(m.name) = supplier_kw(r.name)
      ) c order by c.s desc limit 1;
    end if;
    -- 2) Firma kodu bizim kodun içinde geçiyorsa
    if hit is null and length(r.code) >= 4 then
      select min(m.code) into hit from materials m
      where m.code_fold like '%' || lower(translate(r.code, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'))
        and (not has_brand or m.name_fold ~ brand_re)
        and supplier_same_spec(m.name, r.name)
      having count(*) = 1;
    end if;
    -- 3) Ad benzerliği
    if hit is null then
      select c.code into hit from (
        select m.code, m.name, similarity(m.name_fold, r.f) s
        from materials m
        where m.name_fold % r.f
          and (not has_brand or m.name_fold ~ brand_re)
        order by similarity(m.name_fold, r.f) desc
        limit 40
      ) c
      where c.s >= 0.3 and supplier_same_spec(c.name, r.name)
      order by c.s desc limit 1;
    end if;
    update supplier_items set our_code = hit, match_tried = true where id = r.id;
  end loop;
  return (select count(*) from supplier_items where list_id = p_list and our_code is null and not match_tried);
end $function$;
