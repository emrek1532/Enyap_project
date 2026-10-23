-- Eşleştirme: krepin, kauçuk/metal kompansatör, kelepçe türleri (U-bolt, baca, sessiz), ısı/su sayacı
create or replace function public.supplier_types(t text)
returns text[] language sql immutable set search_path to 'public' as $$
  -- "kelebek kollu vana" ve "rekorlu kelebek vana" küresel, "metal körüklü vana" glob vanadır
  with f as (select regexp_replace(regexp_replace(supplier_fold(t),
    '(kelebek\s*kol|rekorlu\s*kelebek)', 'kuresel', 'g'), 'koruklu\s*vana', 'glob', 'g') s)
  select coalesce(array_agg(k order by k), '{}') from f, lateral (values
    ('kuresel', 'k\s?ur[a-z]{0,3}sel|kur\.|kur\s+van|(d\.?\s*gaz|dogalgaz)\s*van'), ('surgu', 'surgu|yukselen\s*mil|bicakli'), ('glob', 'glob|glop'),
    ('pislik', 'pislik|pisl\.|suzgec|strainer|tortu|fili?tre'), ('kondenstop', 'konde[a-z]*top'),
    ('cekvalf', 'cek\s*valf|cekvalf|cek\s*vana'), ('kelebek', 'kelebek'),
    ('emniyet', 'emniyet|emn\.'), ('hidrant', 'hidran(?![a-z]*\s*(dirse|okce))'), ('hdirsek', 'hidran[a-z]*\s*(dirse|okce)'), ('dislikutusu', 'disli\s*kutu(su)?([^a-z]|$)'), ('vakum', 'vakum'), ('piston', 'piston|pistolu'), ('balans', 'balans'),
    ('gozetleme', 'gozetleme'), ('kompansator', 'kompan|kompa\.|kmpans|komp\.|dilat'),
    ('basinc', 'basinc\s*(dus|reg)|regulator|(^|[^a-z])reg\.|shatof|sahtof'), ('selenoid', 'selenoid|solenoid'),
    ('pompa', 'pomp|poma|hidrofor'), ('manometre', 'manometre|(^|[^a-z])man\.|m\.\s*metre'),
    ('termometre', 'termometre|payrometre'), ('kovan', 'kovan|termovil'), ('kollektor', 'kolekt|kollekt|(^|[^a-z])kol+e?\.|(^|[^a-z])kolle'),
    ('dirsek', 'dirse'), ('manson', 'manso?n'), ('rakor', 'r[ae]kor(?!lu|u?\s*haric)'), ('flex', 'flex|fleks'), ('reduksiyon', 'red[iu]ksiyon|(^|[^a-z])red\.'),
    ('kelepce', 'kelepce|u[\s-]?bolt'), ('tapa', 'tapa'), ('sprinkler', 'spr[i]?nk|sipr'), ('vantuz', 'vantuz'), ('krepin', 'krepin'),
    ('sayac', 'sayac|kalorimetre'), ('motor', 'motor')
  ) v(k, re) where f.s ~ v.re
$$;

create or replace function public.supplier_subtypes(t text)
returns text[] language sql immutable set search_path to 'public' as $$
  with f as (select supplier_fold(t) s)
  select coalesce(array_agg(k order by k), '{}') from f, lateral (values
    ('samandira', 'samandira'), ('terskova', 'kovali'), ('termodinamik', 'termodinamik|t\.?\s*dinamik'),
    ('termostatik', 'termostatik|bimetal'), ('dual', 'dual|cift\s*klape'), ('disko', 'disk|disco'),
    ('yayli', 'yayli|lift'), ('kumandali', 'kumandali'), ('swing', 'swing|calpara'),
    ('kaucuk', 'kaucuk'), ('koruk', 'koruk|metal\s*komp'), ('trifon', 'trifon'), ('somun', 'somun'),
    ('ubolt', 'u[\s-]?bolt'), ('baca', 'baca'), ('sessiz', 'sessiz'), ('isi', 'isi\s*sayac|kalorimetre'), ('susayac', 'su\s*sayac')
  ) v(k, re) where f.s ~ v.re
$$;
