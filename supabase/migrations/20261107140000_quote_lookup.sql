-- Teklif no sistemde var mı (herkesin teklifleri arasında). Yalnız kendi tekliflerini gören kullanıcı da
-- aynı teklifi ikinci kez girmesin diye uyarılır; tutar/kalem dönmez, yalnız firma, tarih ve ekleyen.
create or replace function public.quote_lookup(no text)
returns table(id text, quote_number text, customer_name text, created_at timestamptz, owner_name text)
language sql stable security definer set search_path = '' as $$
  select q.id, q.quote_number, q.customer_name, q.created_at, coalesce(p.full_name, (select a.full_name from public.profiles a where a.is_admin order by a.created_at limit 1), 'yönetici')
  from public.quotes q left join public.profiles p on p.id = q.owner_id
  where public.can('quotes','edit') and length(trim(coalesce(no,''))) > 0
    and upper(trim(q.quote_number)) = upper(trim(no))
  order by q.created_at desc limit 3
$$;
revoke execute on function public.quote_lookup(text) from anon, public;
grant execute on function public.quote_lookup(text) to authenticated;
