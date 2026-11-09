-- Teklifin revizyon sayısı: kalemleri/tutarı değişince 1 artar (uygulamada numara "69349-R2" diye görünür).
-- Uygulandı (Supabase MCP: quote_rev_counter). Uygulama bu alanı yazmaz; yalnız bu tetikleyici artırır.
alter table public.quotes add column if not exists rev int not null default 0;
-- Şimdiye kadar saklanan revizyonlar sayıya işlenir
update public.quotes q set rev = r.n
from (select quote_id, count(*)::int n from public.quote_revisions group by quote_id) r
where r.quote_id = q.id and q.rev <> r.n;

create or replace function private.quote_rev_bump()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (old.items is distinct from new.items or old.total_amount is distinct from new.total_amount)
     and (coalesce(jsonb_array_length(case when jsonb_typeof(old.items) = 'array' then old.items end), 0) > 0 or coalesce(old.total_amount, 0) <> 0) then
    new.rev := coalesce(old.rev, 0) + 1;
  else
    new.rev := coalesce(old.rev, 0);
  end if;
  return new;
end $function$;

create trigger quotes_rev_bump before update on public.quotes
  for each row execute function private.quote_rev_bump();
