-- 1) "Son değiştiren": teklif, müşteri, tahsilat, harcama, not, malzeme ve talep kayıtlarında
--    updated_by (ad soyad) veritabanında kendiliğinden yazılır. Uygulama göndermez, taklit edilemez.
--    Yalnız içerik gerçekten değiştiyse yazılır (aynı kaydı tekrar kaydetmek ya da synced_at dokunuşu sayılmaz);
--    sistem işleri (oturumsuz: Sheets, hatırlatma) eski değeri korur.
-- 2) Bizim malzemeler Excel'den (Mikro) toplu güncelleme: parça parça yükleme, değişen kalemlerin eski hali
--    saklanır (geri alınabilsin), bitince yöneticilere bildirim + hareketlerde kayıt.
--    Yetki: Malzemeler "düzenler" ya da ek izin "matImport" (Malzeme listesini Excel'den yükler).

alter table public.quotes add column if not exists updated_by text;
alter table public.customers add column if not exists updated_by text;
alter table public.collections add column if not exists updated_by text;
alter table public.expenses add column if not exists updated_by text;
alter table public.notes add column if not exists updated_by text;
alter table public.materials add column if not exists updated_by text;
alter table public.quote_requests add column if not exists updated_by text;

create or replace function public.stamp_updated_by()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  who text;
  skip constant text[] := array['updated_at', 'synced_at', 'updated_by', 'search', 'code_fold', 'name_fold', 'fp', 'reminded_at'];
begin
  if auth.uid() is null then
    if tg_op = 'UPDATE' then new.updated_by := old.updated_by; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - skip) = (to_jsonb(old) - skip) then
    new.updated_by := old.updated_by;
    return new;
  end if;
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  new.updated_by := coalesce(who, new.updated_by);
  return new;
end $$;

create or replace trigger quotes_stamp_updated_by before insert or update on public.quotes for each row execute function public.stamp_updated_by();
create or replace trigger customers_stamp_updated_by before insert or update on public.customers for each row execute function public.stamp_updated_by();
create or replace trigger collections_stamp_updated_by before insert or update on public.collections for each row execute function public.stamp_updated_by();
create or replace trigger expenses_stamp_updated_by before insert or update on public.expenses for each row execute function public.stamp_updated_by();
create or replace trigger notes_stamp_updated_by before insert or update on public.notes for each row execute function public.stamp_updated_by();
create or replace trigger materials_stamp_updated_by before insert or update on public.materials for each row execute function public.stamp_updated_by();
create or replace trigger quote_requests_stamp_updated_by before insert or update on public.quote_requests for each row execute function public.stamp_updated_by();

-- Toplu yüklemeler ve değişen kalemlerin eski hali
create table if not exists public.materials_import_batches (
  id bigserial primary key,
  at timestamptz not null default now(),
  by_id uuid,
  by_name text,
  file_name text,
  total int not null default 0,
  inserted int not null default 0,
  updated int not null default 0,
  unchanged int not null default 0,
  done boolean not null default false
);
create table if not exists public.materials_import_prev (
  batch_id bigint not null references public.materials_import_batches(id),
  code text not null,
  old jsonb,
  primary key (batch_id, code)
);
alter table public.materials_import_batches enable row level security;
alter table public.materials_import_prev enable row level security;
create policy materials_import_batches_select on public.materials_import_batches for select using ((select public.can('materials', 'view')));

create or replace function public.can_import_materials()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select public.can('materials', 'edit') or public.can('matImport', 'edit') $$;

create or replace function public.materials_import_begin(p_file text)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  b bigint;
begin
  if not public.can_import_materials() then raise exception 'Yetkiniz yok'; end if;
  insert into materials_import_batches (by_id, by_name, file_name)
  values (auth.uid(), (select coalesce(nullif(full_name, ''), email) from profiles where id = auth.uid()), left(p_file, 200))
  returning id into b;
  return b;
end $$;

-- Yüklenen satırlar (boş kodlar atılır, aynı kod bir kez)
create or replace function public.materials_import_rows(p_rows jsonb)
 RETURNS TABLE(code text, name text, price numeric, currency text, unit text, vat_rate numeric, stock numeric)
 LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  select distinct on (btrim(x.code)) btrim(x.code), nullif(btrim(x.name), ''), x.price, nullif(upper(btrim(x.currency)), ''),
    nullif(btrim(x.unit), ''), x.vat_rate, x.stock
  from jsonb_to_recordset(p_rows) x(code text, name text, price numeric, currency text, unit text, vat_rate numeric, stock numeric)
  where nullif(btrim(x.code), '') is not null
$$;

-- Bir parça (en çok 2000 satır): dosyada olmayan sütunlar (null) eski değeriyle kalır; listede olmayan kalemlere dokunulmaz
create or replace function public.materials_import_chunk(p_batch bigint, p_rows jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  ins int := 0;
  upd int := 0;
  tot int := 0;
begin
  if not public.can_import_materials() then raise exception 'Yetkiniz yok'; end if;
  if not exists (select 1 from materials_import_batches where id = p_batch and by_id = auth.uid() and not done) then
    raise exception 'Yükleme bulunamadı';
  end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'Parça çok büyük'; end if;
  select count(*) into tot from materials_import_rows(p_rows);

  -- değişecek kalemlerin eski hali (yeni kalemlerde boş): geri almak için
  insert into materials_import_prev (batch_id, code, old)
  select p_batch, r.code, to_jsonb(m) - array['search', 'code_fold', 'name_fold', 'fp']
  from materials_import_rows(p_rows) r left join materials m on m.code = r.code
  where m.code is null
     or (r.name is not null and r.name is distinct from m.name)
     or (r.price is not null and r.price is distinct from m.price)
     or (r.currency is not null and r.currency is distinct from m.currency)
     or (r.unit is not null and r.unit is distinct from m.unit)
     or (r.vat_rate is not null and r.vat_rate is distinct from m.vat_rate)
     or (r.stock is not null and r.stock is distinct from m.stock)
  on conflict do nothing;

  update materials m set
    name = coalesce(r.name, m.name), price = coalesce(r.price, m.price), currency = coalesce(r.currency, m.currency),
    unit = coalesce(r.unit, m.unit), vat_rate = coalesce(r.vat_rate, m.vat_rate), stock = coalesce(r.stock, m.stock),
    updated_at = now()
  from materials_import_rows(p_rows) r
  where r.code = m.code
    and ((r.name is not null and r.name is distinct from m.name)
     or (r.price is not null and r.price is distinct from m.price)
     or (r.currency is not null and r.currency is distinct from m.currency)
     or (r.unit is not null and r.unit is distinct from m.unit)
     or (r.vat_rate is not null and r.vat_rate is distinct from m.vat_rate)
     or (r.stock is not null and r.stock is distinct from m.stock));
  get diagnostics upd = row_count;

  insert into materials (code, name, price, currency, unit, vat_rate, stock, updated_at)
  select r.code, coalesce(r.name, ''), coalesce(r.price, 0), coalesce(r.currency, 'TRY'), coalesce(r.unit, 'Adet'), coalesce(r.vat_rate, 20), r.stock, now()
  from materials_import_rows(p_rows) r
  where not exists (select 1 from materials m where m.code = r.code);
  get diagnostics ins = row_count;

  update materials_import_batches set total = total + tot, inserted = inserted + ins, updated = updated + upd,
    unchanged = unchanged + (tot - ins - upd)
  where id = p_batch;
  return jsonb_build_object('total', tot, 'inserted', ins, 'updated', upd);
end $$;

-- Bitiş: hareketlere kayıt + yöneticilere (yükleyen hariç) bildirim
create or replace function public.materials_import_finish(p_batch bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  b record;
  msg text;
  a record;
begin
  if not public.can_import_materials() then raise exception 'Yetkiniz yok'; end if;
  update materials_import_batches set done = true where id = p_batch and by_id = auth.uid() and not done returning * into b;
  if b.id is null then raise exception 'Yükleme bulunamadı'; end if;
  msg := 'Bizim kodlar ' || to_char(b.at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') || ' tarihinde '
    || coalesce(b.by_name, 'ekip') || ' tarafından Excel''den güncellendi: '
    || b.updated || ' kalem değişti, ' || b.inserted || ' yeni kalem (' || b.total || ' satır).';
  insert into activities (id, action, description, author, actor, badge_color, timestamp)
  values ('act-matimp-' || b.id, 'Bizim Kodlar Güncellendi', msg, coalesce(b.by_name, ''), auth.uid(), 'emerald', now())
  on conflict do nothing;
  begin
    for a in select id from profiles where is_admin and status = 'active' and id is distinct from auth.uid() loop
      perform private.push_to_user(a.id, 'Bizim kodlar güncellendi', msg, '/', 'matimp-' || b.id);
    end loop;
  exception when others then null;
  end;
  return jsonb_build_object('total', b.total, 'inserted', b.inserted, 'updated', b.updated, 'unchanged', b.unchanged, 'message', msg);
end $$;

revoke execute on function public.materials_import_begin(text) from public, anon;
revoke execute on function public.materials_import_chunk(bigint, jsonb) from public, anon;
revoke execute on function public.materials_import_finish(bigint) from public, anon;
revoke execute on function public.can_import_materials() from public, anon;
revoke execute on function public.materials_import_rows(jsonb) from public, anon;
grant execute on function public.materials_import_begin(text) to authenticated;
grant execute on function public.materials_import_chunk(bigint, jsonb) to authenticated;
grant execute on function public.materials_import_finish(bigint) to authenticated;
grant execute on function public.can_import_materials() to authenticated;
