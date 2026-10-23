-- RAG eşleştirme: veritabanı her firma kalemi için en benzer malzemeleri bulur (pg_trgm),
-- yapay zekâ (Worker /api/ai/match) bunlardan aynı ürünü seçer ya da "yok" der.
alter table public.supplier_items add column if not exists ai_checked boolean not null default false;

-- Elle bağlanmamış ve yapay zekâya henüz sorulmamış kalemler + adayları
create or replace function public.supplier_ai_batch(p_list text, lim integer default 20)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  brand text;
  brand_re text;
  has_brand boolean := false;
  res jsonb := '[]';
  r record;
  cands jsonb;
begin
  if not public.can('suppliers', 'edit') then raise exception 'Yetkiniz yok'; end if;
  select supplier_fold(split_part(regexp_replace(name, '^[0-9]+\s*', ''), ' ', 1)) into brand from supplier_lists where id = p_list;
  if length(coalesce(brand, '')) >= 3 then
    brand_re := '(^|[^a-z])' || brand || '([^a-z]|$)';
    has_brand := exists(select 1 from materials where name_fold ~ brand_re);
    if not has_brand and length(brand) > 3 then
      brand_re := '(^|[^a-z])' || left(brand, 3) || '([^a-z]|$)';
      has_brand := exists(select 1 from materials where name_fold ~ brand_re);
    end if;
  end if;
  perform set_limit(0.2);
  for r in
    select id, code, name, our_code, supplier_fold(name) f, supplier_dn(name) dn
    from supplier_items
    where list_id = p_list and not match_manual and not ai_checked
    order by id limit lim
  loop
    select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name)), '[]') into cands from (
      select m.code, m.name from materials m where m.code = r.our_code
      union
      -- en benzer 60 malzemeden aynı ölçüdekiler öne alınır
      (select x.code, x.name from (
        select m.code, m.name, similarity(m.name_fold, r.f) s from materials m
        where m.name_fold % r.f and (not has_brand or m.name_fold ~ brand_re)
        order by 3 desc limit 60
      ) x
      order by (r.dn is not null and supplier_dn(x.name) = r.dn) desc, x.s desc limit 10)
    ) c;
    res := res || jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'current', r.our_code, 'candidates', cands);
  end loop;
  return res;
end $$;

-- Yapay zekânın seçimlerini yazar ([{id, code|null}]); elle bağlananlara dokunmaz
create or replace function public.supplier_ai_apply(p jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  if not public.can('suppliers', 'edit') then raise exception 'Yetkiniz yok'; end if;
  update supplier_items i set our_code = nullif(x->>'code', ''), ai_checked = true, match_tried = true
  from jsonb_array_elements(p) x
  where i.id = (x->>'id')::bigint and not i.match_manual;
  get diagnostics n = row_count;
  return n;
end $$;
