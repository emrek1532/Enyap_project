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
  /** Firma fiyat listesinden geliyorsa: firma adı ve standart iskontosu (bizim katalogla karışmaz) */
  supplier?: string;
  supplierDiscount?: number;
}

/** Arama hangi alanda: ad+kod birlikte, ya da sadece kod */
export type MaterialField = 'all' | 'name' | 'code';

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

export async function searchMaterials(q: string, opts: { limit?: number; offset?: number; onlyPriced?: boolean; field?: MaterialField } = {}) {
  // İnternet yoksa (ya da sunucuya ulaşılamazsa) cihazdaki katalogdan aranır
  const offline = async () => {
    const { searchOffline } = await import('./offlineCatalog');
    const items = (await searchOffline(q, opts.field ?? 'all', (opts.limit ?? 20) + (opts.offset ?? 0)))
      .filter(m => !opts.onlyPriced || m.price > 0).slice(opts.offset ?? 0);
    return { items, total: items.length };
  };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return offline();
  const { data, error } = await supabase.rpc('search_materials', {
    q,
    lim: opts.limit ?? 20,
    off: opts.offset ?? 0,
    only_priced: opts.onlyPriced ?? false,
    field: opts.field ?? 'all',
  }).then(r => r, e => ({ data: null, error: e }));
  if (error) {
    const off = await offline().catch(() => null);
    if (off?.items.length) return off;
    throw error;
  }
  const rows = (data || []) as any[];
  return { items: rows.map(fromRow), total: rows.length ? Number(rows[0].total) : 0 };
}

export type MaterialSortKey = 'default' | 'code' | 'name' | 'price' | 'stock' | 'updated';
export interface MaterialFilters {
  currency?: Currency | '';
  unit?: string;
  price?: '' | 'priced' | 'unpriced';
  stock?: '' | 'in' | 'zero' | 'negative';
}

/** Malzemeler sayfası: arama + filtre + sıralama sunucuda yapılır */
export async function listMaterials(q: string, opts: {
  field?: MaterialField; limit?: number; offset?: number;
  filters?: MaterialFilters; sortKey?: MaterialSortKey; sortDir?: 'asc' | 'desc';
} = {}) {
  const f = opts.filters || {};
  // İnternet yokken cihazdaki katalogdan (filtresiz, basit arama)
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const { searchOffline } = await import('./offlineCatalog');
    const all = await searchOffline(q, opts.field ?? 'all', (opts.limit ?? 50) + (opts.offset ?? 0));
    const items = all.slice(opts.offset ?? 0);
    return { items, total: items.length };
  }
  const { data, error } = await supabase.rpc('list_materials', {
    q,
    field: opts.field ?? 'all',
    lim: opts.limit ?? 50,
    off: opts.offset ?? 0,
    f_currency: f.currency || null,
    f_unit: f.unit || null,
    f_price: f.price || null,
    f_stock: f.stock || null,
    sort_key: opts.sortKey ?? 'default',
    sort_dir: opts.sortDir ?? 'asc',
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
  // Yeni malzeme: aynı kod varsa üzerine yazılmaz, "bu kodla başka malzeme var" hatası verilir
  const { error } = previousCode
    ? await supabase.from('materials').update(row).eq('code', previousCode)
    : await supabase.from('materials').insert(row);
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

// İnç işareti: ", '', ”, ″, "inç", "parmak"
const INCH = String.raw`\s*("|''|”|″|inc\b|parmak)`;

// İnç → [DN, dış çapın tam kısmı (mm)]: 2" = DN50 = 60,3 mm
const SIZE_EQ: Record<string, [number, number]> = {
  '1/2': [15, 21], '3/4': [20, 26], '1': [25, 33], '1 1/4': [32, 42], '1 1/2': [40, 48], '2': [50, 60], '2 1/2': [65, 76],
  '3': [80, 88], '4': [100, 114], '5': [125, 139], '6': [150, 168], '8': [200, 219],
};
const byDn = (dn: string) => Object.keys(SIZE_EQ).find(k => String(SIZE_EQ[k][0]) === dn);
const byOd = (od: string) => Object.keys(SIZE_EQ).find(k => String(SIZE_EQ[k][1]) === od);

/**
 * Aramayı kelimelere ve inç ölçülerine ayırır (sunucudaki search_split ile aynı kural).
 * Ölçü tam eşleşir: 2" → 1 1/2", 21/2", 1/2" gelmez; 1/2" → 1 1/2", 11/2" gelmez (11/2" = 1 1/2").
 * Eşdeğerler: 2" = DN50 = 60,3 mm = "60'lık"; "patent" = TS EN 10253 / kaynaklı.
 */
export function splitSizes(q: string): { words: string[]; sizes: RegExp[] } {
  let nq = foldTr(q).replace(/(\d)\s*(''|”|″|inc\b|parmak)/g, '$1"')
    // DN50 ve "60'lık" inç ölçüsüne çevrilir (eşdeğerleri birlikte aranır)
    .replace(/\bdn\s*(\d+)\b/g, (all, d) => (byDn(d) ? ` ${byDn(d)}"` : all))
    .replace(/(^|[^0-9,.])(\d{2,3})\s*'?\s*(lik|luk)\b/g, (all, pre, d) => (byOd(d) ? `${pre}${byOd(d)}"` : all));
  const sizes: RegExp[] = [];
  if (/\bpatent\b/.test(nq)) { sizes.push(/(patent|10253|kaynak)/); nq = nq.replace(/\bpatent\b/g, ' '); }
  const re = /(^|[^0-9/.,])((\d+)[ .-](\d)\/(\d+)|(\d+)\/(\d+)|(\d+))"/;
  for (let m = re.exec(nq); m; m = re.exec(nq)) {
    let w: string | undefined = m[3], a: string | undefined = m[4], b: string | undefined = m[5];
    if (m[6]) {
      w = undefined; a = m[6]; b = m[7];
      if (a.length > 1 && Number(a) > Number(b)) { w = a.slice(0, -1); a = a.slice(-1); }
    } else if (m[8]) { w = m[8]; a = b = undefined; }
    let one = !a ? `(^|[^0-9/.,])${w}(?![0-9]|[ .-]?[0-9]/)${INCH}`
      // önünde tek haneli tam sayı olmamalı (1 1/2", 1-1/2", 21/2"); 20 1/2" (20 mm × 1/2") olur
      : !w ? `(^|[^0-9/., -]|(^|[^0-9])[ .-]|[0-9]{2}[ .-])${a}/${b}${INCH}`
      : `(^|[^0-9/.,])${w}[ .-]?${a}/${b}${INCH}`;
    const eq = SIZE_EQ[[w, a && `${a}/${b}`].filter(Boolean).join(' ')];
    if (eq) one = `(${one}|\\bdn ?${eq[0]}(?![0-9])|(^|[^0-9.,])${eq[1]}[,.][0-9])`;
    sizes.push(new RegExp(one));
    nq = nq.slice(0, m.index + m[1].length) + ' ' + nq.slice(m.index + m[0].length);
  }
  // Ölçü çıkınca kalan tek başına işaretler (*, x, -) aranmaz
  const words = nq.split(/\s+/).filter(t => t && t !== 'x' && /[a-z0-9]/.test(t));
  return { words, sizes };
}

/** Arama eşleştirici: tüm kelimeler geçmeli, inç ölçüleri tam tutmalı. Boş aramada null. */
export function textMatcher(q: string): ((text: string, folded?: boolean) => boolean) | null {
  const { words, sizes } = splitSizes(q);
  if (!words.length && !sizes.length) return null;
  return (text, folded) => {
    const t = folded ? text : foldTr(text);
    return words.every(w => t.includes(w)) && sizes.every(r => r.test(t));
  };
}

export function searchRecent(q: string, field: MaterialField = 'all', limit = 8): Material[] {
  const match = textMatcher(q);
  if (!match) return [];
  return getRecentMaterials()
    .filter(m => match(field === 'code' ? m.code : field === 'name' ? m.name : `${m.code} ${m.name}`))
    .slice(0, limit);
}

export const formatPrice = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
