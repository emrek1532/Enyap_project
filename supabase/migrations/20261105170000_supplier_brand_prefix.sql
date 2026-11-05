-- Marka süzgeci yalnız ürün adında marka geçen kataloğa bakıyordu. Katalogda çoğu ürünün adında marka yok,
-- markayı kod öneki taşıyor (STD = Standart Pompa, AK1/TRK = Tork, ONT = Ontrol). Süzgeç artık:
-- adda marka geçer YA DA kod öneki markaya ait (supplier_brand_cache.owners, katalogdan kendiliğinden).
-- Ayrıca "100/250" pompa ölçüsü inç kesri sanılıyordu ("100-250" ile eşit görülmüyordu): kesir yalnız
-- payda 2/3/4/8/16/32/64 ise korunur, gerisi iki ayrı sayı.

create or replace function public.supplier_brand_prefixes(p_brand text)
returns text[] language sql stable set search_path to 'public' as $$
  select coalesce(array_agg(o.k), '{}') from supplier_brand_cache c, jsonb_each_text(c.owners) o(k, v)
  where c.id = 1 and length(coalesce(p_brand, '')) >= 3 and o.v = p_brand
$$;

create or replace function public.supplier_nums(t text)
returns text language sql immutable set search_path to 'public' as $$
  select coalesce(string_agg(n, ' ' order by n), '')
  from (select distinct n
        from regexp_matches(regexp_replace(lower(coalesce(t,'')), '(\d) (\d/\d)', '\1\2', 'g'), '(\d+(?:/\d+)?)', 'g') m,
             unnest(case when m[1] ~ '/' and split_part(m[1], '/', 2) not in ('2','3','4','8','16','32','64')
                         then string_to_array(m[1], '/') else array[m[1]] end) n
        where not (n ~ '^\d+$' and (n::bigint >= 1000 or n = '316'))) s
$$;

create or replace function public.supplier_match_core(p_list text, lim integer default 150)
returns integer language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  brand text;
  has_brand boolean := false;
  brand_re text;
  brand_tok text;
  bp text[];
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
  bp := supplier_brand_prefixes(brand);
  if cardinality(bp) > 0 then has_brand := true; end if;
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
    v_fp := part_fp(r.name);
    if v_fp is not null then
      pns := part_pns(r.name);
      select min(m.code) into hit from materials m
      where m.fp = v_fp
        and (cardinality(pns) = 0 or cardinality(part_pns(m.name)) = 0 or pns && part_pns(m.name))
        and (case when pref is not null then left(m.code, 3) = pref
                  when has_brand then coalesce(m.name_fold ~ brand_re, false) or left(m.code, 3) = any(bp)
                  else true end)
      having count(*) = 1;
    end if;
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
    if hit is null and has_brand and brand_tok is not null and length(regexp_replace(coalesce(r.code, ''), '[^0-9A-Za-z]', '', 'g')) >= 3 then
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
        where (coalesce(m.name_fold ~ brand_re, false) or left(m.code, 3) = any(bp))
          and m.name_fold ~ ('(^|[^0-9])' || model || '([^0-9]|$)')
          and supplier_dn(m.name) = r.dn
          and supplier_kw(m.name) = supplier_kw(r.name)
          and supplier_same_kind(m.name, r.name)
      ) c order by c.s desc limit 1;
    end if;
    if hit is null and length(r.code) >= 4 then
      select min(m.code) into hit from materials m
      where m.code_fold like '%' || supplier_fold(r.code)
        and (not has_brand or coalesce(m.name_fold ~ brand_re, false) or left(m.code, 3) = any(bp))
        and supplier_same_spec(m.name, r.name)
      having count(*) = 1;
    end if;
    if hit is null and v_fp is null then
      select c.code into hit from (
        select m.code, m.name, greatest(similarity(m.name_fold, r.f), similarity(m.name_fold, r.f2)) s
        from materials m
        where (m.name_fold % r.f or m.name_fold % r.f2)
          and (not has_brand or coalesce(m.name_fold ~ brand_re, false) or left(m.code, 3) = any(bp))
        order by 3 desc
        limit 40
      ) c
      where c.s >= case when cardinality(supplier_types(c.name)) = 0 and cardinality(supplier_types(r.name)) = 0 then 0.45 else 0.3 end
        and supplier_same_spec(c.name, r.name)
        and supplier_brand_ok(lw, r.name, c.code, c.name) and not supplier_opposite(r.name, c.name) and not supplier_price_bad(r.price, r.cur, c.code)
      order by c.s desc limit 1;
    end if;
    if hit is not null and (not supplier_brand_ok(lw, r.name, hit, (select name from materials where code = hit))
                            or supplier_opposite(r.name, (select name from materials where code = hit)) or supplier_price_bad(r.price, r.cur, hit)) then
      hit := null;
    end if;
    update supplier_items set our_code = hit, match_tried = true where id = r.id;
  end loop;
  return (select count(*) from supplier_items where list_id = p_list and our_code is null and not match_tried);
end $$;

create or replace function public.supplier_ai_batch(p_list text, lim integer default 20)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  brand text;
  brand_re text;
  has_brand boolean := false;
  bp text[];
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
  bp := supplier_brand_prefixes(brand);
  if cardinality(bp) > 0 then has_brand := true; end if;
  lw := supplier_list_words(p_list);
  perform set_limit(0.2);
  for k in 1..20 loop
  seen := 0;
  for r in
    select id, code, name, price, currency, supplier_fold(name) f
    from supplier_items
    where list_id = p_list and not match_manual and not ai_checked and our_code is null
    order by id limit lim
  loop
    seen := seen + 1;
    select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name)), '[]') into cands from (
      select y.code, y.name from (
        select m.code, m.name, similarity(m.name_fold, r.f) s from materials m
        where m.name_fold % r.f and (not has_brand or coalesce(m.name_fold ~ brand_re, false) or left(m.code, 3) = any(bp))
        order by 3 desc limit 60
      ) y
      where supplier_size_ok(r.name, y.name) and supplier_brand_ok(lw, r.name, y.code, y.name)
        and not supplier_opposite(r.name, y.name) and not supplier_price_bad(r.price, r.currency, y.code)
      order by y.s desc limit 10
    ) x;
    if cands = '[]'::jsonb then
      update supplier_items set ai_checked = true, match_tried = true where id = r.id;
    else
      res := res || jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'current', null, 'candidates', cands);
    end if;
  end loop;
  exit when res <> '[]'::jsonb or seen = 0;
  end loop;
  return res;
end $$;

revoke execute on function public.supplier_brand_prefixes(text) from public, anon;
grant execute on function public.supplier_brand_prefixes(text) to authenticated;
