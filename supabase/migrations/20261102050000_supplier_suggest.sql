-- Teklif kontrolü: hiçbir fiyat listesine bağlı olmayan ürün için "şu firmanın listesinde var gibi" önerisi.
-- Girdi [{code, name}] (bizim kod ve ürün adı); her ürün için bağsız firma kalemlerinden en benzer 2'si döner.
-- Eşleştirmedeki kural süzgeçleri burada da geçerli: ölçü, marka, zıt özellik. Ad içinde liste markası geçerse öne alınır.
create or replace function public.supplier_suggest(p jsonb)
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  res jsonb := '[]';
  r record;
  f text;
  hits jsonb;
begin
  if not public.can('suppliers', 'view') then raise exception 'Yetkiniz yok'; end if;
  perform set_limit(0.3);
  for r in select x->>'code' code, x->>'name' name from jsonb_array_elements(p) x limit 30 loop
    f := supplier_fold(r.name);
    if length(f) < 4 then continue; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'list', y.ln, 'name', y.name, 'price', y.price,
             'currency', y.currency, 'discount', y.ld, 'score', round(y.s::numeric, 2))), '[]') into hits
    from (
      select z.* from (
        select i.id, i.list_id, i.name, i.price, i.currency, l.name ln, l.discount ld,
               similarity(i.search, f)
                 + case when exists (select 1 from unnest(supplier_list_words(i.list_id)) w
                                     where f ~ ('(^|[^a-z])' || w || '([^a-z]|$)')) then 0.2 else 0 end s
        from supplier_items i join supplier_lists l on l.id = i.list_id
        where i.search % f and i.our_code is null
        order by similarity(i.search, f) desc limit 40
      ) z
      where supplier_size_ok(z.name, r.name)
        and (r.code is null or supplier_brand_ok(supplier_list_words(z.list_id), z.name, r.code, r.name))
        and not supplier_opposite(z.name, r.name)
      order by z.s desc limit 2
    ) y;
    if hits <> '[]'::jsonb then
      res := res || jsonb_build_object('code', r.code, 'name', r.name, 'items', hits);
    end if;
  end loop;
  return res;
end $function$;

revoke execute on function public.supplier_suggest(jsonb) from public, anon;
grant execute on function public.supplier_suggest(jsonb) to authenticated;
