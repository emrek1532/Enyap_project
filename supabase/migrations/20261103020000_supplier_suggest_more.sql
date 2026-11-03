-- Teklif ekranı önerisi: 2 yerine 5 aday (fiyatı tutanlar önde); ilk ikisi yanlış olabildiği için kullanıcı diğerlerine de bakabilsin
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
  for r in select x->>'code' code, x->>'name' name, nullif(x->>'price', '')::numeric price,
                  coalesce(nullif(x->>'currency', ''), 'TRY') cur
           from jsonb_array_elements(p) x limit 30 loop
    f := supplier_fold(r.name);
    if length(f) < 4 then continue; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'list', y.ln, 'name', y.name, 'price', y.price,
             'currency', y.currency, 'discount', y.ld, 'score', round(y.s::numeric, 2), 'price_hit', y.ph)), '[]') into hits
    from (
      select z.*, z.sim
               + case when z.ph then 0.5 else 0 end
               + case when exists (select 1 from unnest(supplier_list_words(z.list_id)) w
                                   where f ~ ('(^|[^a-z])' || w || '([^a-z]|$)')) then 0.2 else 0 end s
      from (
        select c.*, similarity(c.search, f) sim,
               (r.price > 0 and c.currency = r.cur and abs(c.price - r.price) <= greatest(0.011, r.price * 0.005)) ph
        from (
          (select i.id, i.list_id, i.name, i.search, i.price, i.currency, l.name ln, l.discount ld
           from supplier_items i join supplier_lists l on l.id = i.list_id
           where i.search % f and i.our_code is null
           order by similarity(i.search, f) desc limit 40)
          union
          (select i.id, i.list_id, i.name, i.search, i.price, i.currency, l.name ln, l.discount ld
           from supplier_items i join supplier_lists l on l.id = i.list_id
           where r.price > 0 and i.currency = r.cur and i.our_code is null
             and i.price between r.price - greatest(0.011, r.price * 0.005) and r.price + greatest(0.011, r.price * 0.005)
             and similarity(i.search, f) >= 0.15)
        ) c
      ) z
      where supplier_size_ok(z.name, r.name)
        and (r.code is null or supplier_brand_ok(supplier_list_words(z.list_id), z.name, r.code, r.name))
        and not supplier_opposite(z.name, r.name)
      order by s desc limit 5
    ) y;
    if hits <> '[]'::jsonb then
      res := res || jsonb_build_object('code', r.code, 'name', r.name, 'items', hits);
    end if;
  end loop;
  return res;
end $function$;

-- fiyatla aday arama için
create index if not exists supplier_items_cur_price on public.supplier_items (currency, price) where our_code is null;
