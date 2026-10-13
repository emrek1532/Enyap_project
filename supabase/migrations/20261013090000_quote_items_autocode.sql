-- Teklif kaydedilirken kodu boş kalemlere, ürün adı malzeme listesinde birebir eşleşiyorsa kod yazılır
-- (toplu PDF yükleme dahil tüm kayıt yolları). Aynı adlı birden fazla kartta önce birim fiyatı tutan,
-- sonra fiyatı dolu olan seçilir. Hata olursa kayıt engellenmez.
create index if not exists materials_name_norm_idx on public.materials ((regexp_replace(name_fold, '\s+', ' ', 'g')));

create or replace function public.quote_items_autocode()
returns trigger language plpgsql security definer set search_path = '' as $$
declare out_items jsonb := '[]'::jsonb; it jsonb; f text; c text; changed boolean := false;
begin
  if new.items is null or jsonb_typeof(new.items) <> 'array' then return new; end if;
  if tg_op = 'UPDATE' and new.items is not distinct from old.items then return new; end if;
  for it in select value from jsonb_array_elements(new.items) loop
    if coalesce(it->>'code','') = '' and coalesce(it->>'productName','') <> '' then
      f := trim(regexp_replace(lower(translate(it->>'productName','İIıÇŞĞÜÖçşğüöÂâ','iiicsguocsguoaa')),'\s+',' ','g'));
      c := null;
      select m.code into c from public.materials m
       where regexp_replace(m.name_fold, '\s+', ' ', 'g') = f
       order by (m.price = nullif(it->>'unitPrice','')::numeric) desc nulls last, (m.price > 0) desc, m.code
       limit 1;
      if c is not null then it := it || jsonb_build_object('code', c); changed := true; end if;
    end if;
    out_items := out_items || jsonb_build_array(it);
  end loop;
  if changed then new.items := out_items; end if;
  return new;
exception when others then
  return new;
end $$;

revoke execute on function public.quote_items_autocode() from public, anon;

create or replace trigger quotes_items_autocode before insert or update of items on public.quotes
for each row execute function public.quote_items_autocode();
