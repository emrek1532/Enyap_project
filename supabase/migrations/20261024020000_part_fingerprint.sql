-- Standart parça parmak izi (veritabanına önceden uygulandı; repoda kayıt için)
-- Standart parça parmak izi: tür + ölçüler (DN'e çevrilmiş) + özellikler. Standart parça değilse null.
create or replace function public.part_fp(p_name text) returns text
language plpgsql immutable set search_path to '' as $$
declare
  n text := ' ' || regexp_replace(lower(translate(coalesce(p_name, ''), 'İIıŞşĞğÜüÖöÇç’”″', 'iiissgguuoocc''""')), '\s+', ' ', 'g') || ' ';
  inch2dn constant jsonb := '{"1/4":8,"3/8":10,"1/2":15,"3/4":20,"1":25,"11/4":32,"11/2":40,"2":50,"21/2":65,"3":80,"4":100,"5":125,"6":150,"8":200,"10":250,"12":300,"14":350,"16":400,"18":450,"20":500,"24":600}';
  od2dn constant jsonb := '{"21":15,"26":20,"27":20,"33":25,"34":25,"42":32,"48":40,"51":40,"60":50,"76":65,"88":80,"89":80,"101":90,"108":100,"114":100,"133":125,"139":125,"159":150,"168":150,"219":200,"273":250,"323":300,"355":350,"406":400,"457":450,"508":500,"609":600,"610":600}';
  t text[] := '{}'; f text[] := '{}'; sz text[] := '{}';
  s text; x text[]; v text;
begin
  -- standart parça olmayanlar
  if n ~ 'vana|valf|pompa|kompans|filtre|pislik|sayac|metre|kollekt|kazan|tank|esanj|seper|ayirici|sprink|hortum|flex|termostat|radyator|kombi|brulor|boyler|cekvalf|aktuator|motor|kondens|separat|seperat|dusuru|goster|tahliye|bosaltma|hareketli|kollektor|flansli|izole|mafsal|rakor' then return null; end if;
  -- tür
  if n ~ 'flans|flanj' then t := t || 'flans'::text; end if;
  if n ~ 'dirsek' then t := t || 'dirsek'::text; end if;
  if n ~ '[^a-z](te|tee)[^a-z]' then t := t || 'te'::text; end if;
  if n ~ 'kruva|kuruva' then t := t || 'kruva'::text; end if;
  if n ~ 'redu|redik|radik|konsantrik|eksantrik' then t := t || 'red'::text; end if;
  if n ~ '[^a-z](kep|cap)[^a-z]' then t := t || 'kep'::text; end if;
  if n ~ 'manson|manshon' then t := t || 'manson'::text; end if;
  if n ~ 'nipel' then t := t || 'nipel'::text; end if;
  if cardinality(t) = 0 then return null; end if;
  if n ~ ' boru ' and n !~ 'atlama|borulu' then return null; end if;
  -- özellikler
  if n ~ 'galv' then f := f || 'galv'::text; end if;
  -- plastik (PPR/PE) parçalar: boru çapı da ölçüye girer (50x1 1/2" ≠ 63x1 1/2")
  if 'flans' <> all(t) then
    x := regexp_match(n, '(?:^|[^0-9.,/])(?:q|ø|o)? ?(\d{2,3}) ?[x*]');
    if n ~ 'ppr?[^a-z]|pp-?r|pvc|plastik|pe-?x|pe ?100|polietilen' or x is not null then
      f := f || 'plastik'::text;
      if x is not null then sz := sz || ('d' || x[1]); end if;
    end if;
  end if;
  if n ~ 'paslanmaz|pslz|inox|304|316' then f := f || 'pas'::text; end if;
  if n ~ 'pirinc|[^a-z]sari[^a-z]' then f := f || 'pirinc'::text; end if;
  if n ~ 'sch ?-?40' then f := f || 'sch40'::text; elsif n ~ 'sch ?-?80' then f := f || 'sch80'::text; elsif n ~ 'sch ?-?20' then f := f || 'sch20'::text; elsif n ~ 'sch ?-?10[^0-9]' then f := f || 'sch10'::text; end if;
  if n ~ 'dikissiz|celik patent|din ?2605|(^|[^a-z])ansi' then f := f || 'dikissiz'::text; elsif n ~ 'dikisli' then f := f || 'dikisli'::text; end if;
  if n !~ 'sch' and n ~ 'patent|10253|kaynakli|orjinal|orijinal' and 'flans' <> all(t) then f := f || 'patent'::text; end if;
  if n ~ '[^0-9]45 ?(\^|c|°|o|derece|[^0-9,.])' then f := f || '45'::text; end if;
  if n ~ '180 ?(c|°|derece)' then f := f || '180'::text; end if;
  if n ~ 'kuyruk' then f := f || 'kuyruk'::text; end if;
  if n ~ 'eksantrik' then f := f || 'eks'::text; end if;
  if n ~ 'parca' then f := f || 'parcali'::text; end if;
  if n ~ 'atlama' then f := f || 'atlama'::text; end if;
  if n ~ 'erkek|[^a-z]dis[^a-z]|dis disli' then f := f || 'erkek'::text; end if;
  if n ~ 'disi|[^a-z]ic[^a-z]|ic disli' then f := f || 'disi'::text; end if;
  if n ~ 'kalin|agir' then f := f || 'kalin'::text; end if;
  if n ~ 'ince|hafif' then f := f || 'ince'::text; end if;
  if n ~ 'uzun' then f := f || 'uzun'::text; end if;
  if n ~ 'yivli' then f := f || 'yivli'::text; end if;
  if 'flans' = any(t) then
    if n ~ 'kalorifer' then f := f || 'kalorifer'::text; end if;
    if n ~ 'buhar' then f := f || 'buhar'::text; end if;
    if n ~ 'kaynak ?boy|welding|w\.? ?neck|boyunlu' then f := f || 'kb'::text;
    elsif n ~ 'slip|slp' then f := f || 'slip'::text;
    elsif n ~ 'pe ?-?100|hdpe' then f := f || 'pe'::text;
    elsif n ~ 'disli' then f := f || 'disli'::text;
    elsif n ~ 'doner|serbest|yaka' then f := f || 'doner'::text;
    else
      if n ~ '[^a-z]kor' then f := f || 'kor'::text; end if;
      if n ~ 'borulu' then f := f || 'borulu'::text; end if;
      if n ~ 'duz' then f := f || 'duz'::text; end if;
    end if;
    if n ~ '150 ?lb' then f := f || 'lb150'::text; elsif n ~ '300 ?lb' then f := f || 'lb300'::text; end if;
    -- flanş ölçüsü: DN / Q / Ø
    for x in select regexp_matches(n, '(?:dn|q|ø|o) ?(\d{2,4})(?![0-9,.])', 'g') loop sz := sz || x[1]; end loop;
  else
    -- inç ölçüleri (1 1/2" = 11/2), standart numaraları ve mm/et kalınlığı atılarak
    s := regexp_replace(n, '\([^)]*seri[^)]*\)|ts ?en ?[0-9-]+|en ?[0-9]{3,}(-[0-9])?|din ?[0-9]+|ansi ?b?[0-9.]+|ts ?[0-9]+/[0-9]+|sch ?-?[0-9]+|pn ?-?[0-9]+|[0-9]+([.,][0-9]+)? ?mm|koli ?[0-9.]+|[0-9]+ ?ad|q ?[0-9]+ ?[x*]', ' ', 'g');
    for x in select regexp_matches(s, '(?:^|[^0-9.,/])(\d{1,2}(?: \d/\d|/\d)?|\d/\d)(?![0-9.,/])\s*("|'''')?', 'g') loop
      v := replace(x[1], ' ', '');
      -- 10 ve üstü tam sayılar ancak inç işaretiyle ölçü sayılır (PPR 20 ≠ 20")
      if inch2dn ? v and (x[2] is not null or v !~ '^\d{2}$') then sz := sz || (inch2dn ->> v); end if;
    end loop;
    if not exists (select 1 from unnest(sz) e where e !~ '^d') then
      for x in select regexp_matches(n, 'dn ?(\d{2,3})', 'g') loop sz := sz || x[1]; end loop;
    end if;
    if not exists (select 1 from unnest(sz) e where e !~ '^d') then
      x := regexp_match(n, '^ ?(\d{2,3})[.,]\d');
      if x is not null and od2dn ? x[1] then sz := sz || (od2dn ->> x[1]); end if;
    end if;
  end if;
  if cardinality(sz) = 0 then return null; end if;
  select array_agg(distinct e order by e) into t from unnest(t) e;
  select array_agg(distinct e order by e) into f from unnest(f) e;
  select array_agg(e order by length(e), e) into sz from unnest(sz) e;
  return array_to_string(t, '+') || '|' || array_to_string(sz, ',') || '|' || coalesce(array_to_string(f, ','), '');
end $$;

-- Flanş basınç sınıfları: PN10-16 → {10,16}
create or replace function public.part_pns(p_name text) returns int[]
language sql immutable set search_path to '' as $$
  select coalesce(array_agg(distinct v), '{}') from (
    select x[1]::int v from regexp_matches(lower(coalesce(p_name, '')), '(?:pn|nd) ?-?(\d{1,3})', 'g') x
    union all select 16 where lower(coalesce(p_name, '')) ~ '(pn|nd) ?-?10 ?[-/] ?16'
  ) s $$;

alter table public.materials add column if not exists fp text generated always as (public.part_fp(name)) stored;
create index if not exists materials_fp_idx on public.materials (fp) where fp is not null;
