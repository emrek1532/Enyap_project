-- Eşleştirme v2:
--  * "Çelik Kollu" (vana kolu) ürün özelliği "çelik" sayılmaz
--  * Bizim adda "MARKA KOD" (TDS 864, TDS-215, TDS 118 AV, TDS 155 K) aranır; birden çok malzeme çıkarsa
--    adı en çok benzeyen seçilir (fark belirginse)
--  * Ad benzerliği parantez içi açıklamalar atılarak da ölçülür
--  * Asıl iş supplier_match_core'da; yetki kontrolü dışarıdaki fonksiyonda
create or replace function public.supplier_kw(t text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  with f as (
    select regexp_replace(regexp_replace(regexp_replace(regexp_replace(
             lower(translate(coalesce(t,''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')),
             'celik\s*kol(lu)?', 'kollu', 'g'),
             '(^|[^a-z])mak(ar)?(\.|\s|$)', '\1makaron ', 'g'),
             'fan[\s\-]?[ck]oil', 'fancoil', 'g'),
             'burulor', 'brulor', 'g') s
  )
  select coalesce(string_agg(k, ' ' order by k), '')
  from f, unnest(array['makaron','paslanmaz','izole','ciplak','delikli','celik','krom','nipel','fancoil','brulor','kompan','onden','yandan','dikisli','ayarl','agirlik']) k
  where f.s like '%' || k || '%'
$function$;

create or replace function public.supplier_fold(t text)
 returns text language sql immutable set search_path to 'public'
as $$ select lower(translate(coalesce(t,''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')) $$;

-- Firma kodundan esnek arama deseni: tire / harf-rakam geçişlerinde boşluk veya tire olabilir (118AV ↔ "118 AV")
create or replace function public.supplier_code_re(brand text, code text)
 returns text language sql immutable set search_path to 'public'
as $$
  select '(^|[^a-z0-9])' || brand || '[\s\-]*' ||
    regexp_replace(regexp_replace(regexp_replace(
      regexp_replace(supplier_fold(code), '[^a-z0-9]+', '-', 'g'),
      '([0-9])([a-z])', '\1-\2', 'g'), '([a-z])([0-9])', '\1-\2', 'g'),
      '-', '[\s\-./]*', 'g')
    || '($|[^a-z0-9\-])'
$$;

create or replace function public.supplier_match_core(p_list text, lim integer default 150)
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
  best record;
  second_s real;
begin
  select supplier_fold(split_part(regexp_replace(name, '^[0-9]+\s*', ''), ' ', 1)) into brand from supplier_lists where id = p_list;
  if length(coalesce(brand, '')) >= 3 then
    brand_re := brand; brand_tok := brand;
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
    -- 0) Bizim adda "MARKA KOD" geçiyor
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
    -- 1) Firma model numarası + aynı ölçü
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
    -- 2) Firma kodu bizim kodun içinde
    if hit is null and length(r.code) >= 4 then
      select min(m.code) into hit from materials m
      where m.code_fold like '%' || supplier_fold(r.code)
        and (not has_brand or m.name_fold ~ brand_re)
        and supplier_same_spec(m.name, r.name)
      having count(*) = 1;
    end if;
    -- 3) Ad benzerliği (parantez içi açıklamalar atılarak da)
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

revoke all on function public.supplier_match_core(text, integer) from public, anon, authenticated;

create or replace function public.auto_match_supplier_items(p_list text, lim integer default 150)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
begin
  if not public.can('suppliers','edit') then raise exception 'Yetkiniz yok'; end if;
  return public.supplier_match_core(p_list, lim);
end $function$;
