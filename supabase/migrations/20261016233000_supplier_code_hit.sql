-- "MARKA KOD" eşleşmesi tek fonksiyonda: kodun ilk kelimesi alınır, başındaki marka atılır (FAF5061 → 5061);
-- aynı koddan birden çok malzeme varsa önce aynı ölçü (DN) olanlar, sonra ad benzerliği belirgin olan seçilir.
create or replace function public.supplier_code_hit(p_brand text, p_code text, p_name text)
 returns text language plpgsql stable set search_path to 'public', 'extensions'
as $function$
declare
  c text;
  re text;
  f text := supplier_fold(p_name);
  f2 text := trim(regexp_replace(supplier_fold(p_name), '\([^)]*\)', ' ', 'g'));
  dn int := supplier_dn(p_name);
  best record;
  second_s real;
begin
  if p_brand is null then return null; end if;
  c := supplier_fold(split_part(trim(coalesce(p_code, '')), ' ', 1));
  c := regexp_replace(c, '^' || p_brand || '[\s\-]*', '');
  if length(regexp_replace(c, '[^0-9a-z]', '', 'g')) < 3 or c !~ '[0-9]' then return null; end if;
  re := supplier_code_re(p_brand, c);
  with cand as (
    select m.code, m.name, greatest(similarity(m.name_fold, f), similarity(m.name_fold, f2)) s,
           (dn is not null and supplier_dn(m.name) = dn) same_dn
    from materials m where m.name_fold ~ re
  ), pool as (
    -- aynı DN varsa sadece onlar; DN biliniyor ama adaylarda farklı DN'ler varsa hiçbiri (yanlış ölçü bağlanmasın)
    select * from cand where same_dn
       or (not exists (select 1 from cand where same_dn)
           and (dn is null or not exists (select 1 from cand x where supplier_dn(x.name) is not null)))
  )
  select p.code, p.s, count(*) over () n into best from pool p order by p.s desc limit 1;
  if best.code is null then return null; end if;
  if best.n = 1 then return best.code; end if;
  with cand as (
    select m.name, greatest(similarity(m.name_fold, f), similarity(m.name_fold, f2)) s,
           (dn is not null and supplier_dn(m.name) = dn) same_dn
    from materials m where m.name_fold ~ re
  )
  select s into second_s from cand where same_dn
       or (not exists (select 1 from cand where same_dn)
           and (dn is null or not exists (select 1 from cand x where supplier_dn(x.name) is not null)))
  order by s desc offset 1 limit 1;
  return case when best.s - coalesce(second_s, 0) >= 0.05 then best.code end;
end $function$;
