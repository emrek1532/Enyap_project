-- Teklif kontrolü: marka iskontosu vadeye göre ayrı karşılaştırılır (peşin iskonto vadeliden yüksek olur).
-- Vade sınıfı: PEŞİN / KREDİ KARTI = 'cash', GÜN'lü ya da boş = 'term' (eski tekliflerin çoğunda vade yok, çoğu vadeli).
-- p_term null ise eski davranış (tüm teklifler). Eski 3 parametreli quote_brand_ref artık kullanılmıyor.
create or replace function public.quote_term_class(p text)
 returns text language sql immutable
as $$ select case when coalesce(p, '') ~* '^\s*(pe|kred)' then 'cash' else 'term' end $$;

create or replace function public.quote_brand_ref(p_customer text, p_lists text[], p_exclude text, p_term text)
 returns jsonb
 language sql stable
 set search_path to 'public'
as $function$
  with ck as (select supplier_fold(split_part(trim(coalesce(p_customer, '')), ' ', 1)) k),
  it as (
    select q.quote_number qn, q.customer_name cn, q.created_at t, x->>'code' code, coalesce((x->>'discount')::numeric, 0) d
    from quotes q, jsonb_array_elements(q.items) x
    where q.created_at > now() - interval '18 months' and q.quote_number is distinct from p_exclude
      and coalesce(x->>'code', '') <> ''
      and (p_term is null or quote_term_class(q.payment_term) = p_term)
  ),
  li as (
    select distinct it.qn, it.cn, it.t, it.code, it.d, s.list_id
    from it join supplier_items s on s.our_code = it.code and s.list_id = any(p_lists)
  ),
  qd as (
    select list_id, qn, cn, t, mode() within group (order by d) d
    from li group by 1, 2, 3, 4
  ),
  own as (
    select distinct on (list_id) list_id, qn, t, d from qd, ck
    where length(ck.k) >= 3 and supplier_fold(split_part(trim(qd.cn), ' ', 1)) = ck.k
    order by list_id, t desc
  ),
  rng as (
    select list_id, count(*) n, min(d) lo, max(d) hi,
           percentile_disc(0.25) within group (order by d) p25, percentile_disc(0.75) within group (order by d) p75
    from qd where t > now() - interval '6 months' group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'list', l.id,
    'own', case when o.list_id is null then null else jsonb_build_object('quote', o.qn, 'date', o.t, 'discount', o.d) end,
    'range', case when r.list_id is null then null else jsonb_build_object('n', r.n, 'lo', r.lo, 'hi', r.hi, 'p25', r.p25, 'p75', r.p75) end
  )), '[]')
  from unnest(p_lists) l(id)
  left join own o on o.list_id = l.id
  left join rng r on r.list_id = l.id
$function$;

revoke execute on function public.quote_brand_ref(text, text[], text, text) from public, anon;
grant execute on function public.quote_brand_ref(text, text[], text, text) to authenticated;
