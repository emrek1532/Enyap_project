/**
 * Çevrimdışı katalog: malzeme kataloğu (kod, ad, fiyat) cihazda IndexedDB'de tutulur;
 * internet yokken malzeme ve fiyat araması buradan yapılır. Günde bir kez arka planda yenilenir.
 */
import { supabase } from './supabase';
import { textMatcher, type Material } from './materials';

type Row = [code: string, name: string, price: number, currency: string, unit: string, vat: number, stock: number | null];

const DB = 'enyap-offline', STORE = 'kv', KEY = 'catalog';
const DAY = 864e5;
let mem: { at: number; ver?: string; rows: Row[]; folded: string[] } | null = null;

const fold = (s: string) =>
  s.replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u')
    .replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c').toLowerCase();

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result as T);
    req.onerror = () => rej(req.error);
  });
}

async function load() {
  if (mem) return mem;
  const v = await idb<{ at: number; ver?: string; rows: Row[] } | undefined>('readonly', s => s.get(KEY)).catch(() => undefined);
  if (!v) return null;
  mem = { ...v, folded: v.rows.map(r => fold(`${r[0]} ${r[1]}`)) };
  return mem;
}

/** Katalog cihazda ne zaman güncellendi (yoksa null) */
export async function offlineCatalogInfo(): Promise<{ at: number; count: number } | null> {
  const c = await load();
  return c ? { at: c.at, count: c.rows.length } : null;
}

/** Kataloğun sürümü: kalem sayısı + son güncelleme (tek küçük sorgu; katalog değişmediyse indirme yapılmaz) */
async function catalogVersion(): Promise<string> {
  const { data, count, error } = await supabase.from('materials').select('updated_at', { count: 'exact' }).order('updated_at', { ascending: false, nullsFirst: false }).limit(1);
  if (error) throw error;
  return `${count ?? 0}|${data?.[0]?.updated_at ?? ''}`;
}

/** Kataloğu cihaza kaydeder: günde en fazla bir kez kontrol eder, sadece katalog değiştiyse indirir */
export async function syncOfflineCatalog(force = false): Promise<void> {
  if (!navigator.onLine) return;
  const cur = await load();
  if (!force && cur && Date.now() - cur.at < DAY) return;
  const ver = await catalogVersion();
  if (!force && cur && cur.ver === ver) {
    const v = { at: Date.now(), ver, rows: cur.rows };
    await idb('readwrite', s => s.put(v, KEY));
    mem = { ...v, folded: cur.folded };
    return;
  }
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('materials').select('code,name,price,currency,unit,vat_rate,stock').order('code').range(from, from + 999);
    if (error) throw error;
    (data || []).forEach((r: any) => rows.push([r.code, r.name || '', Number(r.price || 0), r.currency || 'TRY', r.unit || 'Adet', Number(r.vat_rate ?? 20), r.stock == null ? null : Number(r.stock)]));
    if (!data || data.length < 1000) break;
  }
  if (!rows.length) return;
  const v = { at: Date.now(), ver, rows };
  await idb('readwrite', s => s.put(v, KEY));
  mem = { ...v, folded: rows.map(r => fold(`${r[0]} ${r[1]}`)) };
}

/** Cihazdaki katalogda arama (kod başı eşleşmeleri önce) */
export async function searchOffline(q: string, field: 'all' | 'code' | 'name' = 'all', limit = 20): Promise<Material[]> {
  const c = await load();
  const match = textMatcher(q);
  if (!c) return [];
  const toMat = (r: Row): Material => ({ code: r[0], name: r[1], price: r[2], currency: r[3] as Material['currency'], unit: r[4], vatRate: r[5], stock: r[6] });
  if (!match) return c.rows.slice(0, limit).map(toMat);
  const hits: { r: Row; score: number }[] = [];
  for (let i = 0; i < c.rows.length; i++) {
    const r = c.rows[i];
    const s = field === 'code' ? fold(r[0]) : field === 'name' ? fold(r[1]) : c.folded[i];
    if (!match(s, true)) continue;
    hits.push({ r, score: fold(r[0]).startsWith(fold(q.trim()).split(/\s+/)[0]) ? 0 : 1 });
    if (hits.length > limit * 20) break;
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, limit).map(({ r }) => toMat(r));
}
