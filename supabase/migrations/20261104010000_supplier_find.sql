-- Teklif ekranındaki "Listede ara": her kelime kalem adında, firma kodunda ya da liste adında kelime BAŞINDA geçmeli
-- ("ak" → AK GRUP listesi, Akel, aktüatör; "makaronlu" içindeki "ak" sayılmaz). Sayılar harfe bitişik de olabilir (200 → DN200).
-- Tam kelime eşleşmesi öne alınır. Yalnız bağsız kalemler; en benzer 10'u.
create or replace function public.supplier_find(q text, lim integer default 10)
 returns table(id bigint, list_name text, name text, price numeric, currency text, discount numeric)
 language plpgsql stable security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  fq text := supplier_fold(replace(replace(coalesce(q, ''), '"', ' '), '''', ' '));
  toks text[];
  rxs text[];
  words text[];
begin
  if not public.can('suppliers', 'view') then raise exception 'Yetkiniz yok'; end if;
  select coalesce(array_agg(t), '{}') into toks from regexp_split_to_table(trim(fq), '\s+') t where t <> '';
  if array_length(toks, 1) is null then return; end if;
  select array_agg(case when t ~ '^[0-9]' then '(^|[^0-9])' else '(^|[^a-z0-9])' end
                   || regexp_replace(t, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'))
    into rxs from unnest(toks) t;
  -- tam kelime eşleşmesi öne ("ak" → AK GRUP, Akel'den önce)
  select array_agg('(^|[^a-z0-9])' || regexp_replace(t, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '([^a-z0-9]|$)')
    into words from unnest(toks) t;
  return query
    select i.id, l.name, i.name, i.price, i.currency, l.discount
    from supplier_items i join supplier_lists l on l.id = i.list_id
    where i.our_code is null
      and (i.search || ' ' || supplier_fold(l.name)) ~ all (rxs)
    order by (select count(*) from unnest(words) w where (i.search || ' ' || supplier_fold(l.name)) ~ w) desc,
             similarity(i.search || ' ' || supplier_fold(l.name), fq) desc, i.id
    limit greatest(1, least(lim, 30));
end $function$;

revoke execute on function public.supplier_find(text, integer) from public, anon;
grant execute on function public.supplier_find(text, integer) to authenticated;
