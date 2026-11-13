-- Talep "Hazırlanıyor" yapılınca talebi giren kişiye (yönetici dahil) bildirim: "Sıla talebi hazırlıyor".
-- Kendi talebini kendisi hazırlanıyor yaparsa bildirim gitmez.
create or replace function private.quote_requests_notify() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  who text;
begin
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) and new.status in ('yeni', 'hazirlaniyor') then
    perform private.push_to_user(new.assigned_to, 'Yeni müşteri talebi',
      new.customer_name || ' için yeni talep' || coalesce(' (' || who || ')', '') || coalesce(': ' || left(new.note, 80), ''),
      '/?open-request=' || new.id, 'req-' || new.id);
  end if;
  if tg_op = 'UPDATE' and new.status = 'hazirlaniyor' and old.status is distinct from 'hazirlaniyor'
     and new.created_by is not null and new.created_by is distinct from auth.uid() then
    perform private.push_to_user(new.created_by, '🛠 Talep hazırlanıyor',
      coalesce(who, 'Ekip') || ', ' || new.customer_name || ' talebinin teklifini hazırlamaya başladı.',
      '/?open-request=' || new.id, 'req-prep-' || new.id);
  end if;
  if tg_op = 'UPDATE' and new.status = 'yuklendi' and old.status <> 'yuklendi'
     and new.created_by is distinct from auth.uid()
     and not coalesce((select is_admin from public.profiles where id = new.created_by), false) then
    perform private.push_to_user(new.created_by, 'Talebin teklifi hazır',
      new.customer_name || ' talebi için teklif sisteme yüklendi' || coalesce(' (' || who || ')', '') || '.',
      '/?open-request=' || new.id, 'req-done-' || new.id);
  end if;
  return new;
exception when others then
  return new;
end $$;
