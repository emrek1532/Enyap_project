-- Notlar → görevler: bir not bir kişiye atanabilir; atanan "tamamlandı" işaretleyene kadar açık kalır.
--   created_by : notu yazan (kendiliğinden), assigned_to : görevin verildiği kişi
--   done_at/done_by : kim, ne zaman tamamladı (veritabanı yazar)
-- Görünürlük: yönetici tüm notları görür; diğerleri yalnız kendi yazdıklarını ve kendisine atananları.
-- Bildirim: atanınca atanana "Yeni görev"; atanan tamamlayınca yazana "Görev tamamlandı".

alter table public.notes add column if not exists created_by uuid default auth.uid();
alter table public.notes add column if not exists assigned_to uuid;
alter table public.notes add column if not exists done_at timestamptz;
alter table public.notes add column if not exists done_by text;
create index if not exists notes_assigned_to_idx on public.notes(assigned_to) where not done;

-- Eski notlar yöneticinin (bugüne kadar notları yalnız yönetici kullandı)
update public.notes set created_by = (select id from public.profiles where is_admin and status = 'active' order by created_at limit 1)
where created_by is null;

alter policy notes_select on public.notes using (
  (select public.can('notes', 'view')) and ((select public.is_admin()) or created_by = (select auth.uid()) or assigned_to = (select auth.uid())));
alter policy notes_update on public.notes
  using ((select public.can('notes', 'edit')) and ((select public.is_admin()) or created_by = (select auth.uid()) or assigned_to = (select auth.uid())))
  with check ((select public.can('notes', 'edit')) and ((select public.is_admin()) or created_by = (select auth.uid()) or assigned_to = (select auth.uid())));

-- Yazan değiştirilemez; tamamlanınca kim/ne zaman damgalanır
create or replace function private.notes_task_stamp() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
    new.done_by := (select coalesce(nullif(full_name, ''), email) from public.profiles where id = auth.uid());
  elsif not new.done then
    new.done_at := null; new.done_by := null;
  elsif tg_op = 'UPDATE' then
    new.done_at := old.done_at; new.done_by := old.done_by;
  end if;
  return new;
end $$;
create or replace trigger notes_task_stamp before insert or update on public.notes
  for each row execute function private.notes_task_stamp();

create or replace function private.notes_task_notify() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  who text;
begin
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() and not new.done
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform private.push_to_user(new.assigned_to, 'Yeni görev' || coalesce(' · ' || who, ''),
      left(new.content, 180), '/?open-note=' || new.id, 'note-task-' || new.id);
  end if;
  if tg_op = 'UPDATE' and new.done and not old.done and new.assigned_to is not null
     and new.created_by is not null and new.created_by is distinct from auth.uid() then
    perform private.push_to_user(new.created_by, 'Görev tamamlandı' || coalesce(' · ' || who, ''),
      left(new.content, 180), '/?open-note=' || new.id, 'note-done-' || new.id);
  end if;
  return new;
exception when others then
  return new; -- bildirim gitmese de kayıt bozulmasın
end $$;
create or replace trigger notes_task_notify after insert or update on public.notes
  for each row execute function private.notes_task_notify();

-- Görev verilebilecek kişiler (aktif, notları düzenleyebilen)
create or replace function public.note_assignees() returns table(id uuid, full_name text)
language sql stable security definer set search_path to '' as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email)
  from public.profiles p
  where public.is_active() and p.status = 'active'
    and (p.is_admin or coalesce(p.perms->>'notes', 'none') = 'edit')
  order by 2
$$;

-- Simgedeki sayıya açık görevler de eklenir
create or replace function private.badge_for(uid uuid) returns integer
language sql stable security definer set search_path to '' as $$
  select (select count(*) from public.quote_requests r where r.assigned_to = uid and r.status in ('yeni', 'hazirlaniyor'))::int
       + (select count(*) from public.notes n where n.assigned_to = uid and not n.done)::int
       + case when coalesce((select is_admin from public.profiles where id = uid), false)
              then (select count(*) from public.quotes q where q.review_pending)::int else 0 end
$$;

-- Hatırlatma: görevse atanana, değilse yazana (eskiden notları görebilen herkese gidiyordu)
create or replace function public.send_note_reminders() returns integer
language plpgsql security definer set search_path to '' as $$
declare
  nt record; n int := 0;
begin
  for nt in
    select id, content, coalesce(assigned_to, created_by) as uid from public.notes
    where remind_at is not null and remind_at <= now() and reminded_at is null and not done
    order by remind_at limit 30
  loop
    if nt.uid is not null then
      perform private.push_to_user(nt.uid, '📝 Not hatırlatma', left(nt.content, 180), '/?open-note=' || nt.id, 'note-' || nt.id);
    end if;
    update public.notes set reminded_at = now() where id = nt.id;
    n := n + 1;
  end loop;
  return n;
end $$;
