-- Kesir ölçüde önceki kontrol çalışmıyordu (1/2" araması 1 1/2" getiriyordu); tek başına işaretler aramadan çıkarılır.
create or replace function public.search_split(q text, out rest text, out rx text[])
language plpgsql immutable set search_path to '' as $$
declare
  nq text := lower(translate(coalesce(q, ''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'));
  quote_rx constant text := '\s*("|''''|”|″|inc\M|parmak)';
  m text[];
  w text; a text; b text;
begin
  rx := '{}';
  nq := regexp_replace(nq, '(\d)\s*(''''|”|″|inc\M|parmak)', '\1"', 'g');
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
    rx := rx || case
      when a is null then '(^|[^0-9/.,])' || w || '(?![0-9]|[ .-]?[0-9]/)' || quote_rx
      -- önünde tek haneli tam sayı olmamalı (1 1/2", 1-1/2", 21/2"); 20 1/2" (20 mm × 1/2") olur
      when w is null then '(^|[^0-9/., -]|(^|[^0-9])[ .-]|[0-9]{2}[ .-])' || a || '/' || b || quote_rx
      else '(^|[^0-9/.,])' || w || '[ .-]?' || a || '/' || b || quote_rx end;
    nq := overlay(nq placing ' ' from position(m[1] || '"' in nq) for length(m[1]) + 1);
  end loop;
  -- ölçü çıkınca kalan tek başına işaretler (*, x, -) aranmaz
  nq := regexp_replace(nq, '(^|\s)([^a-z0-9\s]+|x)(?=\s|$)', ' ', 'g');
  rest := btrim(regexp_replace(nq, '\s+', ' ', 'g'));
end $$;
