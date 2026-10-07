-- Malzeme aramasına alan seçimi: 'all' (kod + ad), 'name' (sadece ad), 'code' (sadece kod).
-- Kod aramasında kodu yazılan ifadeyle başlayanlar önce gelir. (Eski 4 parametreli sürüm, açık kalmış eski istemciler için duruyor.)

create or replace function public.search_materials(
  q text, lim int default 20, off int default 0, only_priced boolean default false, field text default 'all')
returns table (code text, name text, price numeric, currency text, unit text, vat_rate numeric, stock numeric, updated_at timestamptz, total bigint)
language sql stable set search_path = '' as $$
  with norm as (
    select lower(translate(coalesce(q, ''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')) as nq
  ),
  toks as (
    select '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
    from norm, regexp_split_to_table(norm.nq, '\s+') t
    where t <> ''
  ),
  m as (
    select m.*,
      lower(translate(m.code, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')) as fcode,
      case field
        when 'code' then lower(translate(m.code, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'))
        when 'name' then lower(translate(m.name, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'))
        else m.search end as hay
    from public.materials m
  )
  select m.code, m.name, m.price, m.currency, m.unit, m.vat_rate, m.stock, m.updated_at, count(*) over () as total
  from m, norm
  where not exists (select 1 from toks where m.hay not like toks.pat)
    and (not only_priced or m.price > 0)
  order by
    (field = 'code' and norm.nq <> '' and m.fcode like replace(norm.nq, ' ', '') || '%') desc,
    (m.price > 0) desc,
    case when field = 'code' then m.code else m.name end
  limit greatest(1, least(lim, 200)) offset greatest(off, 0);
$$;
grant execute on function public.search_materials(text, int, int, boolean, text) to authenticated;
revoke execute on function public.search_materials(text, int, int, boolean, text) from anon, public;
