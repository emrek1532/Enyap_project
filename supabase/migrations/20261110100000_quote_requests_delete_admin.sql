-- Talep silme (deleted_at) yalnız yönetici: diğerleri silinme tarihini değiştiremez.
create or replace function private.quote_requests_guard_delete() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.deleted_at is distinct from old.deleted_at and not public.is_admin() then
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end $$;
create or replace trigger quote_requests_guard_delete before update on public.quote_requests
  for each row execute function private.quote_requests_guard_delete();
