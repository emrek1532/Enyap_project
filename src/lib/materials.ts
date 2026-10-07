import { supabase } from './supabase';
import { Currency } from './money';

/** Fiyat kataloğundaki bir malzeme (sunucuda tutulur, cihaza toplu indirilmez) */
export interface Material {
  code: string;
  name: string;
  price: number;
  currency: Currency;
  unit: string;
  vatRate: number;
  stock?: number | null;
  updatedAt?: string;
}

export const MATERIAL_UNITS = ['Adet', 'Metre', 'Takım', 'Paket', 'Kg', 'Set'] as const;

const fromRow = (r: any): Material => ({
  code: r.code,
  name: r.name ?? '',
  price: Number(r.price ?? 0),
  currency: (r.currency || 'TRY') as Currency,
  unit: r.unit || 'Adet',
  vatRate: Number(r.vat_rate ?? 20),
  stock: r.stock == null ? null : Number(r.stock),
  updatedAt: r.updated_at ?? undefined,
});

export async function searchMaterials(q: string, opts: { limit?: number; offset?: number; onlyPriced?: boolean } = {}) {
  const { data, error } = await supabase.rpc('search_materials', {
    q,
    lim: opts.limit ?? 20,
    off: opts.offset ?? 0,
    only_priced: opts.onlyPriced ?? false,
  });
  if (error) throw error;
  const rows = (data || []) as any[];
  return { items: rows.map(fromRow), total: rows.length ? Number(rows[0].total) : 0 };
}

export async function saveMaterial(m: Material, previousCode?: string) {
  const row = {
    code: m.code.trim(),
    name: m.name.trim(),
    price: m.price || 0,
    currency: m.currency,
    unit: m.unit || 'Adet',
    vat_rate: m.vatRate ?? 20,
    stock: m.stock ?? null,
    updated_at: new Date().toISOString(),
  };
  if (previousCode && previousCode !== row.code) {
    const { error } = await supabase.from('materials').update(row).eq('code', previousCode);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('materials').upsert(row, { onConflict: 'code' });
  if (error) throw error;
}

export async function deleteMaterial(code: string) {
  const { error } = await supabase.from('materials').delete().eq('code', code);
  if (error) throw error;
}

/** Son seçilen malzemeler: internet yokken de önerebilmek için cihazda tutulur */
const RECENT_KEY = 'enyap_recent_materials_v1';
const RECENT_MAX = 60;

export function getRecentMaterials(): Material[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function rememberMaterial(m: Material) {
  try {
    const list = [m, ...getRecentMaterials().filter(x => x.code !== m.code)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* depolama dolu / kapalı */ }
}

/** Sunucudaki arama metniyle aynı sadeleştirme (İ/ı/ş/ğ/ü/ö/ç) */
export const foldTr = (s: string) =>
  s.replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u')
    .replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c').toLowerCase();

export function searchRecent(q: string, limit = 8): Material[] {
  const toks = foldTr(q).split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  return getRecentMaterials()
    .filter(m => { const s = foldTr(`${m.code} ${m.name}`); return toks.every(t => s.includes(t)); })
    .slice(0, limit);
}

export const formatPrice = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
