-- Apps Script'teki tek seferlik teklifTahsilatEsitle() için: verilen tarihten beri değişen teklif ve tahsilatlar.
-- Yalnızca senkron gizli anahtarıyla çağrılabilir. Alanlar teklif/tahsilat tetikleyicilerinin gönderdiğiyle aynıdır.
create or replace function public.sheet_sync_export(p_token text, p_since date) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token <> (select secret from private.sheet_sync where id = 1) then
    raise exception 'forbidden';
  end if;
  return json_build_object(
    'quotes', (select coalesce(json_agg(json_build_object(
        'quoteNumber', trim(q.quote_number),
        'date', to_char(q.created_at at time zone 'Europe/Istanbul', 'YYYY-MM-DD'),
        'status', case when q.status in ('onaylandi','siparis') then 'Onaylandı' when q.status = 'iptal' then 'İptal' else 'Beklemede' end,
        'customer', q.customer_name, 'preparedBy', coalesce(q.prepared_by, ''),
        'usd', case when coalesce(q.amount_usd,0)=0 and coalesce(q.amount_eur,0)=0 and coalesce(q.amount_try,0)=0 and q.currency='USD' then q.total_amount else coalesce(q.amount_usd,0) end,
        'eur', case when coalesce(q.amount_usd,0)=0 and coalesce(q.amount_eur,0)=0 and coalesce(q.amount_try,0)=0 and q.currency='EUR' then q.total_amount else coalesce(q.amount_eur,0) end,
        'try', case when coalesce(q.amount_usd,0)=0 and coalesce(q.amount_eur,0)=0 and coalesce(q.amount_try,0)=0 and coalesce(q.currency,'TRY') not in ('USD','EUR') then coalesce(q.total_amount,0) else coalesce(q.amount_try,0) end,
        'notes', coalesce(q.notes, '')) order by q.created_at), '[]'::json)
      from public.quotes q where q.updated_at >= p_since and coalesce(trim(q.quote_number), '') not in ('', '-')),
    'collections', (select coalesce(json_agg(json_build_object(
        'id', c.id, 'date', c.date, 'customer', c.customer_name, 'method', c.method,
        'bank', coalesce(c.bank_name,''), 'branch', coalesce(c.bank_branch,''), 'checkNo', coalesce(c.check_no,''),
        'amount', c.amount, 'currency', c.currency, 'dueDate', c.due_date) order by c.date, c.created_at), '[]'::json)
      from public.collections c where c.updated_at >= p_since)
  );
end $$;
revoke execute on function public.sheet_sync_export(text, date) from public;
grant execute on function public.sheet_sync_export(text, date) to anon, authenticated;
