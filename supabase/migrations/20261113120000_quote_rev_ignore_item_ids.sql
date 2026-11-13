-- Revizyon (R1, R2…) yalnız kalemlerin içeriği değişince artar.
-- Aynı PDF yeniden yüklenince kalemlere yeni iç kimlik (id) verildiği için teklif boşuna R1 oluyordu;
-- karşılaştırmada kalemlerin "id" alanı yok sayılır.
-- Uygulandı (Supabase MCP: quote_rev_ignore_item_ids).

create or replace function private.quote_items_key(items jsonb)
returns jsonb
language sql
immutable
set search_path to 'public'
as $function$
  select case when jsonb_typeof(items) = 'array'
    then coalesce((select jsonb_agg(e - 'id' order by o) from jsonb_array_elements(items) with ordinality t(e, o)), '[]'::jsonb)
    else items end
$function$;

create or replace function private.quote_rev_bump()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (private.quote_items_key(old.items) is distinct from private.quote_items_key(new.items)
      or old.total_amount is distinct from new.total_amount)
     and (coalesce(jsonb_array_length(case when jsonb_typeof(old.items) = 'array' then old.items end), 0) > 0 or coalesce(old.total_amount, 0) <> 0) then
    new.rev := coalesce(old.rev, 0) + 1;
  else
    new.rev := coalesce(old.rev, 0);
  end if;
  return new;
end $function$;

create or replace function private.quote_revision_snapshot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (private.quote_items_key(old.items) is distinct from private.quote_items_key(new.items)
      or old.total_amount is distinct from new.total_amount)
     and (coalesce(jsonb_array_length(case when jsonb_typeof(old.items) = 'array' then old.items end), 0) > 0 or coalesce(old.total_amount, 0) <> 0) then
    insert into public.quote_revisions(quote_id, rev, items, total_amount, currency, valid_until, notes, quote_updated_at)
    values (old.id, coalesce((select max(r.rev) from public.quote_revisions r where r.quote_id = old.id), 0) + 1,
            coalesce(old.items, '[]'::jsonb), old.total_amount, old.currency, old.valid_until, old.notes, old.updated_at);
  end if;
  return null;
end $function$;
