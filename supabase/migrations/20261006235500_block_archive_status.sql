-- Arşiv durumu artık kullanılmıyor. Uygulamanın eski bir sürümü açık kalıp
-- teklifleri 'arsiv' olarak yazmaya çalışırsa, durum 'gonderildi' (Beklemede) olarak kaydedilir.
create or replace function public.quotes_no_archive()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'arsiv' then
    new.status := 'gonderildi';
  end if;
  return new;
end;
$$;
revoke execute on function public.quotes_no_archive() from public, anon, authenticated;

drop trigger if exists quotes_no_archive on public.quotes;
create trigger quotes_no_archive before insert or update on public.quotes
  for each row execute function public.quotes_no_archive();

update public.quotes set status = 'gonderildi' where status = 'arsiv';
