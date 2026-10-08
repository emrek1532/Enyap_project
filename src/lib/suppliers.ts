/**
 * Firma (tedarikçi) fiyat listeleri — bizim malzeme kataloğundan ayrı tablolarda durur.
 */
import { supabase } from './supabase';
import { Currency } from './money';
import { Material } from './materials';

export interface SupplierList {
  id: string;
  name: string;
  title: string;
  listDate: string;
  currency: Currency;
  discount: number;
  itemCount: number;
  sourceFile?: string;
  updatedAt?: string;
}

export interface SupplierItem {
  id: number;
  listId: string;
  listName: string;
  discount: number;
  code: string;
  name: string;
  price: number;
  currency: Currency;
  unit: string;
  ourCode?: string | null;
}

export async function fetchSupplierLists(): Promise<SupplierList[]> {
  const { data, error } = await supabase.from('supplier_lists').select('*').order('name');
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id, name: r.name, title: r.title || '', listDate: r.list_date || '', currency: r.currency || 'TRY',
    discount: Number(r.discount || 0), itemCount: Number(r.item_count || 0), sourceFile: r.source_file || undefined,
    updatedAt: r.updated_at || undefined,
  }));
}

export async function setSupplierDiscount(id: string, discount: number) {
  const { error } = await supabase.from('supplier_lists').update({ discount, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function searchSupplierItems(q: string, opts: { list?: string | null; limit?: number; offset?: number } = {}) {
  const { data, error } = await supabase.rpc('search_supplier_items', {
    q, list: opts.list ?? null, lim: opts.limit ?? 30, off: opts.offset ?? 0,
  });
  if (error) throw error;
  const rows = (data || []) as any[];
  return {
    items: rows.map((r): SupplierItem => ({
      id: Number(r.id), listId: r.list_id, listName: r.list_name, discount: Number(r.discount || 0),
      code: r.code || '', name: r.name || '', price: Number(r.price || 0), currency: (r.currency || 'TRY') as Currency,
      unit: r.unit || 'Adet', ourCode: r.our_code,
    })),
    total: rows.length ? Number(rows[0].total) : 0,
  };
}

/** Teklif kalemine aktarmak için malzeme biçimine çevir */
export const supplierToMaterial = (s: SupplierItem): Material => ({
  code: s.code, name: s.name, price: s.price, currency: s.currency, unit: s.unit, vatRate: 20,
  supplier: s.listName, supplierDiscount: s.discount,
});

/** Firma adına göre sabit bir renk (etiketler için) */
const COLORS = ['#e11d48', '#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706', '#db2777', '#4f46e5', '#0d9488', '#b45309', '#dc2626', '#475569'];
export const supplierColor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};
