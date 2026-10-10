-- Elle yapılan bağlama / bağ kaldırma işaretlenir; otomatik eşleştirme ve listeyi yeniden yükleme bunları korur.
alter table public.supplier_items add column if not exists match_manual boolean not null default false;
