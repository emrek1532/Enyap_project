-- Uygulandı (Supabase MCP): supplier_list_logo, supplier_auto_match, _v2.._v5
-- supplier_lists.logo, supplier_items.match_tried, supplier_kw/cm/inch/nums/same_spec, auto_match_supplier_items(p_list, lim)
alter table supplier_lists add column if not exists logo text;
alter table supplier_items add column if not exists match_tried boolean not null default false;
