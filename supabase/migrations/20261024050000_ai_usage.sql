-- Yapay zekâ kullanım kaydı: her Workers AI çağrısı (uç, model, kullanıcı, başarılı mı) — günlük kotayı neyin harcadığını görmek için.
-- Uygulama bu tabloyu indirmez (eşitlemede yok); yalnızca Worker yazar.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  endpoint text not null,
  model text not null,
  user_id uuid default auth.uid(),
  ok boolean not null,
  err text
);
create index if not exists ai_usage_at_idx on public.ai_usage (at);
alter table public.ai_usage enable row level security;

create or replace function public.log_ai_usage(p_endpoint text, p_model text, p_ok boolean, p_err text default null)
returns void language sql security definer set search_path to 'public' as $$
  insert into ai_usage (endpoint, model, ok, err) values (left(p_endpoint, 60), left(p_model, 80), p_ok, left(p_err, 300))
$$;
revoke execute on function public.log_ai_usage(text, text, boolean, text) from public, anon;
grant execute on function public.log_ai_usage(text, text, boolean, text) to authenticated;
