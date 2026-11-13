-- Yeni sürüm bildirimi: yayındaki /version.json 5 dakikada bir okunur (Cloudflare statik dosyası, Supabase verisi değil).
-- Sürüm değiştiyse bildirim aboneliği olan tüm etkin kullanıcıların tüm cihazlarına push gider.
-- pg_net istekleri eşzamansız: bu turda önceki turun cevabı okunur, sonra yeni istek atılır.
create table if not exists private.app_release (
  id int primary key default 1 check (id = 1),
  version text,
  req_id bigint,
  notified_at timestamptz
);
insert into private.app_release (id) values (1) on conflict (id) do nothing;

create or replace function public.check_app_release() returns void
language plpgsql security definer set search_path to '' as $$
declare
  r private.app_release;
  res record;
  v text;
  u record;
begin
  select * into r from private.app_release where id = 1 for update;
  if r.req_id is not null then
    select status_code, content into res from net._http_response where id = r.req_id;
    if found and res.status_code = 200 then
      begin v := (res.content::jsonb)->>'version'; exception when others then v := null; end;
      if v is not null and v <> '' and v is distinct from r.version then
        if r.version is not null then
          for u in
            select distinct p.id from public.profiles p
            join public.push_subscriptions ps on lower(ps.user_email) = lower(p.email)
            where p.status = 'active'
          loop
            perform private.push_to_user(u.id, 'Yeni sürüm: v' || v, 'Enyap güncellendi. Açınca yeni sürüm yüklenir.', '/', 'app-update');
          end loop;
          update private.app_release set notified_at = now() where id = 1;
        end if;
        update private.app_release set version = v where id = 1;
      end if;
    end if;
  end if;
  update private.app_release set req_id = net.http_get(
    url := 'https://enyap-project.sakiremre153207.workers.dev/version.json?t=' || extract(epoch from now())::bigint,
    timeout_milliseconds := 10000) where id = 1;
end $$;

revoke execute on function public.check_app_release() from public, anon, authenticated;

select cron.schedule('app-release-push', '*/5 * * * *', 'select public.check_app_release()');
