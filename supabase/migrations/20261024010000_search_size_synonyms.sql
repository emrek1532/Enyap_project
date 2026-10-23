-- Arama: ölçü eşdeğerleri (2" = DN50 = 60,3 mm = "60'lık") ve eş anlamlı kelimeler (patent = TS EN 10253 = kaynaklı)
create or replace function public.search_split(q text, out rest text, out rx text[])
language plpgsql immutable set search_path to '' as $$
declare
  nq text := lower(translate(coalesce(q, ''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'));
  quote_rx constant text := '\s*("|''''|”|″|inc\M|parmak)';
  -- inç → [DN, dış çapın tam kısmı (mm)]
  eq constant jsonb := '{"1/2":[15,21],"3/4":[20,26],"1":[25,33],"1 1/4":[32,42],"1 1/2":[40,48],"2":[50,60],"2 1/2":[65,76],"3":[80,88],"4":[100,114],"5":[125,139],"6":[150,168],"8":[200,219]}';
  m text[];
  w text; a text; b text; k text; one text; e jsonb; hit text;
begin
  rx := '{}';
  nq := regexp_replace(nq, '(\d)\s*(''''|”|″|inc\M|parmak)', '\1"', 'g');
  -- DN50 ve "60'lık" yazımları inç ölçüsüne çevrilir (eşdeğerleri aşağıda birlikte aranır)
  loop
    m := regexp_match(nq, '\mdn\s*(\d+)\M');
    exit when m is null;
    select key into hit from jsonb_each(eq) where value->>0 = m[1];
    nq := regexp_replace(nq, '\mdn\s*' || m[1] || '\M', coalesce(hit || '"', ' dn_' || m[1]));
  end loop;
  nq := replace(nq, 'dn_', 'dn');
  loop
    m := regexp_match(nq, '(^|[^0-9,.])(\d{2,3})\s*''?\s*(lik|luk)\M');
    exit when m is null;
    select key into hit from jsonb_each(eq) where value->>1 = m[2];
    nq := regexp_replace(nq, '(^|[^0-9,.])' || m[2] || '\s*''?\s*(lik|luk)\M', '\1' || coalesce(hit || '"', m[2]));
  end loop;
  -- Eş anlamlılar
  if nq ~ '\mpatent\M' then
    rx := rx || '(patent|10253|kaynak)'::text;
    nq := regexp_replace(nq, '\mpatent\M', ' ', 'g');
  end if;
  loop
    -- tam + kesir (1 1/2", 1-1/2"), kesir (1/2", 21/2" = 2 1/2"), tam (2")
    m := regexp_match(nq, '(?:^|[^0-9/.,])((\d+)[ .-](\d)/(\d+)|(\d+)/(\d+)|(\d+))"');
    exit when m is null;
    if m[2] is not null then w := m[2]; a := m[3]; b := m[4];
    elsif m[5] is not null then
      w := null; a := m[5]; b := m[6];
      if length(a) > 1 and a::int > b::int then w := left(a, -1); a := right(a, 1); end if;
    else w := m[7]; a := null; b := null;
    end if;
    one := case
      when a is null then '(^|[^0-9/.,])' || w || '(?![0-9]|[ .-]?[0-9]/)' || quote_rx
      -- önünde tek haneli tam sayı olmamalı (1 1/2", 1-1/2", 21/2"); 20 1/2" (20 mm × 1/2") olur
      when w is null then '(^|[^0-9/., -]|(^|[^0-9])[ .-]|[0-9]{2}[ .-])' || a || '/' || b || quote_rx
      else '(^|[^0-9/.,])' || w || '[ .-]?' || a || '/' || b || quote_rx end;
    k := concat_ws(' ', w, case when a is not null then a || '/' || b end);
    e := eq -> k;
    if e is not null then
      one := '(' || one || '|\mdn ?' || (e->>0) || '(?![0-9])|(^|[^0-9.,])' || (e->>1) || '[,.][0-9])';
    end if;
    rx := rx || one;
    nq := overlay(nq placing ' ' from position(m[1] || '"' in nq) for length(m[1]) + 1);
  end loop;
  -- ölçü çıkınca kalan tek başına işaretler (*, x, -) aranmaz
  nq := regexp_replace(nq, '(^|\s)([^a-z0-9\s]+|x)(?=\s|$)', ' ', 'g');
  rest := btrim(regexp_replace(nq, '\s+', ' ', 'g'));
end $$;
