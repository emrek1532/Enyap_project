-- Apps Script'teki tek seferlik harcamalariEsitle() için: harcamaları ve Sheet'teki eski anahtarlarını döndürür.
-- Yalnızca senkron gizli anahtarıyla çağrılabilir.
create table if not exists private.expense_sheet_keys (id text primary key, date date, sheet_category text, amount numeric, in_sheet boolean);

create or replace function public.expense_sheet_export(p_token text) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token <> (select secret from private.sheet_sync where id = 1) then
    raise exception 'forbidden';
  end if;
  return (select json_agg(json_build_array(e.id, e.date, e.category, e.method, e.amount, coalesce(e.description,''),
      case when k.in_sheet then k.date end, case when k.in_sheet then k.sheet_category end, case when k.in_sheet then k.amount end)
    order by e.date, e.created_at)
    from public.expenses e left join private.expense_sheet_keys k on k.id = e.id);
end $$;
revoke execute on function public.expense_sheet_export(text) from public;
grant execute on function public.expense_sheet_export(text) to anon, authenticated;
