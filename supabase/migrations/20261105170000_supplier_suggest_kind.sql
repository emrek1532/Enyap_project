-- Teklif ekranı önerisi (supplier_suggest) daha az yanıltsın:
-- 1) "fiyat birebir" yalnız kuruşu kuruşuna (≤ 0,01) eşitse; eskiden %0,5 tolerans vardı (69,30 ≈ 69,00 "birebir" sayılıyordu).
-- 2) Tür uyuşmazsa aday elenir: supplier_types (vana/dirsek/manşon...) ya da part_fp türü (flanş/te/kep/red...) iki tarafta
--    da var ve farklıysa. Ortak "ürün kelimesi" yoksa (malzeme/ölçü/birim/marka kelimeleri sayılmaz: galvaniz, paslanmaz,
--    cm, dn...) ancak ad benzerliği yüksekse (≥ 0,5) kalır ve fiyat puanı almaz. Örnek: "GALVANİZ ROT M-8x200 CM" artık
--    "İNCE SOMUN Galvaniz" önermez (ortak kelime yalnız "galvaniz").

-- Ürün kelimeleri: harf kelimelerinin ilk 4 harfi (Türkçe ekler: dirsek/dirsekli aynı), malzeme/ölçü/birim/marka kelimeleri hariç
create or replace function public.supplier_kind_words(t text, skip text[] default '{}')
 returns text[]
 language sql immutable
 set search_path to 'public'
as $function$
  select coalesce(array_agg(distinct left(w, 4)), '{}')
  from unnest(regexp_split_to_array(supplier_fold(t), '[^a-z]+')) w
  where length(w) >= 2
    and w <> all(skip)
    and w !~ '^(galv|pasl|inox|aisi|siyah|beyaz|kirmizi|mavi|pirinc|bronz|celik|krom|dokum|demir|bakir|alumin|plastik|kalin|agir|hafif|uzun|kisa|takim|standart|seri|disli|erkek|disi|flans|kaynak|patent|orji?nal|orijinal|metre|litre|derece)'
    and w !~ '^(sari|ince|ppr?|pvc|pe|hdpe|adet|ad|set|tip|model|std|dis|ic|cm|mm|mt|lb|bsp|npt|pn|dn|nd|sch|kg|gr|bar|lt|m|q|x|ve|ile|li|lik|luk|lu|tl|usd|eur|no|nolu)$'
$function$;

create or replace function public.supplier_suggest(p jsonb)
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  res jsonb := '[]';
  r record;
  f text;
  rt text[];
  rfp text;
  hits jsonb;
begin
  if not public.can('suppliers', 'view') then raise exception 'Yetkiniz yok'; end if;
  perform set_limit(0.3);
  for r in select x->>'code' code, x->>'name' name, nullif(x->>'price', '')::numeric price,
                  coalesce(nullif(x->>'currency', ''), 'TRY') cur
           from jsonb_array_elements(p) x limit 30 loop
    f := supplier_fold(r.name);
    if length(f) < 4 then continue; end if;
    rt := supplier_types(r.name);
    rfp := coalesce(split_part(part_fp(r.name), '|', 1), '');
    select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'list', y.ln, 'name', y.name, 'price', y.price,
             'currency', y.currency, 'discount', y.ld, 'score', round(y.s::numeric, 2), 'price_hit', y.ph and y.kind)), '[]') into hits
    from (
      select z.*, z.sim
               + case when z.ph and z.kind then 0.5 else 0 end
               + case when exists (select 1 from unnest(z.lw) w
                                   where f ~ ('(^|[^a-z])' || w || '([^a-z]|$)')) then 0.2 else 0 end s
      from (
        select k.*,
               -- aynı tür: ortak tür etiketi, aynı parmak izi türü ya da ortak ürün kelimesi (marka hariç)
               (k.it && rt or (k.ifp <> '' and k.ifp = rfp)
                or supplier_kind_words(k.name, k.lw) && supplier_kind_words(r.name, k.lw)) kind
        from (
          select c.*, similarity(c.search, f) sim, supplier_list_words(c.list_id) lw,
                 supplier_types(c.name) it, coalesce(split_part(part_fp(c.name), '|', 1), '') ifp,
                 (r.price > 0 and c.currency = r.cur and abs(c.price - r.price) <= 0.01) ph
          from (
            (select i.id, i.list_id, i.name, i.search, i.price, i.currency, l.name ln, l.discount ld
             from supplier_items i join supplier_lists l on l.id = i.list_id
             where i.search % f and i.our_code is null
             order by similarity(i.search, f) desc limit 40)
            union
            (select i.id, i.list_id, i.name, i.search, i.price, i.currency, l.name ln, l.discount ld
             from supplier_items i join supplier_lists l on l.id = i.list_id
             where r.price > 0 and i.currency = r.cur and i.our_code is null
               and i.price between r.price - 0.01 and r.price + 0.01
               and similarity(i.search, f) >= 0.15)
          ) c
        ) k
        -- tür etiketleri / parmak izi türleri iki tarafta da var ve farklıysa elenir
        where not (cardinality(k.it) > 0 and cardinality(rt) > 0 and not k.it && rt)
          and not (k.ifp <> '' and rfp <> '' and k.ifp <> rfp)
      ) z
      where (z.kind or z.sim >= 0.5)
        and supplier_size_ok(z.name, r.name)
        and (r.code is null or supplier_brand_ok(z.lw, z.name, r.code, r.name))
        and not supplier_opposite(z.name, r.name)
      order by s desc limit 5
    ) y;
    if hits <> '[]'::jsonb then
      res := res || jsonb_build_object('code', r.code, 'name', r.name, 'items', hits);
    end if;
  end loop;
  return res;
end $function$;
