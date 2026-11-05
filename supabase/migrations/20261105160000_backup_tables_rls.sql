-- Elle açılan yedek tablolarda RLS kapalıydı (herkese açık anahtarla okunup yazılabiliyordu); kilit açıldı, politika yok = yalnız sunucu erişir.
alter table public.supplier_items_backup_duzeltme_20261104 enable row level security;
alter table public.supplier_lists_backup_duzeltme_20261104 enable row level security;
alter table public.supplier_items_backup_ayvaz_20261104 enable row level security;
alter table public.supplier_items_backup_kardesler_20261104 enable row level security;
alter table public.backup_supplier_items_emek_20261105 enable row level security;
