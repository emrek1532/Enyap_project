/**
 * Bizim malzemeleri Mikro'dan alınan Excel ile toplu günceller.
 * Başlık satırı kendiliğinden bulunur (Stok kodu / Stok ismi / Fiyat / Döviz / Birim / KDV / Miktar);
 * dosyada olmayan sütunlar veritabanında olduğu gibi kalır, listede olmayan kalemlere dokunulmaz.
 * Sunucuda 1000'erlik parçalar: materials_import_begin → _chunk → _finish (değişenlerin eski hali saklanır,
 * bitince yöneticiye bildirim gider).
 */
import { supabase } from './supabase';

export type ImportField = 'code' | 'name' | 'price' | 'currency' | 'unit' | 'vat_rate' | 'stock';
export interface ImportRow { code: string; name?: string; price?: number; currency?: string; unit?: string; vat_rate?: number; stock?: number }
export interface ParsedSheet { rows: ImportRow[]; columns: Partial<Record<ImportField, string>>; skipped: number }

export const FIELD_LABEL: Record<ImportField, string> = {
  code: 'Kod', name: 'Malzeme adı', price: 'Fiyat', currency: 'Para birimi', unit: 'Birim', vat_rate: 'KDV', stock: 'Stok',
};

const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/[ıİ]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u')
  .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/\s+/g, ' ').trim();

/** Başlık metninden alan (sıra önemli: "birim fiyat" fiyattır, "para birimi" para birimidir) */
export function fieldOf(header: string): ImportField | null {
  const h = fold(header);
  if (!h) return null;
  if (/doviz|para birim|kur cins|currency/.test(h)) return 'currency';
  if (/kdv|vergi|vat/.test(h)) return 'vat_rate';
  if (/fiyat|satis|tutar|price/.test(h)) return 'price';
  if (/(stok|malzeme|urun|mal) ?(kod|no)|^kod|^kodu|code/.test(h)) return 'code';
  if (/(stok|malzeme|urun|mal) ?(ad|ism)|^ad$|^adi$|^isim|^ismi|aciklama|tanim|name/.test(h)) return 'name';
  if (/miktar|eldeki|stok (miktar|bakiye)|^stok$|^bakiye/.test(h)) return 'stock';
  if (/birim|olcu|unit/.test(h)) return 'unit';
  return null;
}

/** Türkçe ya da Excel sayısı: 1.234,56 · 1234,56 · 1234.56 · 1234 */
export function numOf(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  let s = String(v).replace(/[^\d,.-]/g, '');
  if (!s) return undefined;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function currencyOf(v: unknown): string | undefined {
  const s = fold(String(v ?? ''));
  if (!s) return undefined;
  if (/^(tl|try|ytl|₺|tr|turk)/.test(s)) return 'TRY';
  if (/usd|\$|dolar|us/.test(s)) return 'USD';
  if (/eur|€|avro|euro/.test(s)) return 'EUR';
  return undefined;
}

const UNITS: [RegExp, string][] = [
  [/^(ad|adet|ade|pcs|pc)\.?$/, 'Adet'], [/^(m|mt|mtr|metre)\.?$/, 'Metre'], [/^(tk|tkm|takim)\.?$/, 'Takım'],
  [/^(pk|pkt|paket)\.?$/, 'Paket'], [/^(kg|kilo)\.?$/, 'Kg'], [/^set\.?$/, 'Set'],
];
export function unitOf(v: unknown): string | undefined {
  const s = fold(String(v ?? ''));
  if (!s) return undefined;
  return UNITS.find(([re]) => re.test(s))?.[1] ?? String(v).trim();
}

/** Satırlardan (ilk sayfa) kalemleri çıkarır */
export function parseRows(table: unknown[][]): ParsedSheet {
  // Başlık: ilk 15 satırda kod sütunu ve (ad ya da fiyat) bulunan satır
  let head = -1;
  let map: (ImportField | null)[] = [];
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const m = (table[i] || []).map(c => (c == null ? null : fieldOf(String(c))));
    if (m.includes('code') && (m.includes('name') || m.includes('price'))) { head = i; map = m; break; }
  }
  if (head < 0) throw new Error('Başlık satırı bulunamadı. İlk satırlarda "Stok Kodu" ve "Stok İsmi" ya da "Fiyat" sütunu olmalı.');
  // Aynı alan iki sütunda varsa ilki geçerli
  const idx: Partial<Record<ImportField, number>> = {};
  const columns: ParsedSheet['columns'] = {};
  map.forEach((f, i) => { if (f && idx[f] === undefined) { idx[f] = i; columns[f] = String(table[head][i]); } });
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const r of table.slice(head + 1)) {
    const code = String(r?.[idx.code!] ?? '').trim();
    if (!code) { if ((r || []).some(c => c != null && c !== '')) skipped++; continue; }
    const row: ImportRow = { code };
    if (idx.name !== undefined) { const v = String(r[idx.name] ?? '').trim(); if (v) row.name = v; }
    // 0 ya da boş fiyat "fiyat yok" demektir: sistemdeki fiyatı silmez
    if (idx.price !== undefined) { const v = numOf(r[idx.price]); if (v !== undefined && v > 0) row.price = v; }
    if (idx.currency !== undefined) row.currency = currencyOf(r[idx.currency]);
    if (idx.unit !== undefined) row.unit = unitOf(r[idx.unit]);
    if (idx.vat_rate !== undefined) { const v = numOf(r[idx.vat_rate]); row.vat_rate = v !== undefined && v > 0 && v < 1 ? v * 100 : v; }
    if (idx.stock !== undefined) row.stock = numOf(r[idx.stock]);
    rows.push(row);
  }
  return { rows, columns, skipped };
}

/** .xlsx ya da .csv dosyasını okur */
export async function parseMaterialFile(file: File): Promise<ParsedSheet> {
  if (/\.xls$/i.test(file.name)) throw new Error('Eski .xls biçimi okunamıyor. Excel\'de "Farklı kaydet → Excel Çalışma Kitabı (.xlsx)" ile kaydedip yükleyin.');
  if (/\.(csv|txt)$/i.test(file.name)) {
    const text = await file.text();
    const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    return parseRows(text.split(/\r?\n/).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim())));
  }
  const { readXlsxRows } = await import('./xlsxRead');
  return parseRows(readXlsxRows(await file.arrayBuffer()));
}

export interface ImportResult { total: number; inserted: number; updated: number; unchanged: number; message: string }

/** Sunucuya parça parça yükler; bitince bildirim sunucudan gider */
export async function importMaterials(rows: ImportRow[], fileName: string, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const { data: batch, error } = await supabase.rpc('materials_import_begin', { p_file: fileName });
  if (error) throw error;
  const SIZE = 1000;
  for (let i = 0; i < rows.length; i += SIZE) {
    const { error: e } = await supabase.rpc('materials_import_chunk', { p_batch: batch, p_rows: rows.slice(i, i + SIZE) });
    if (e) throw e;
    onProgress?.(Math.min(i + SIZE, rows.length), rows.length);
  }
  const { data, error: e2 } = await supabase.rpc('materials_import_finish', { p_batch: batch });
  if (e2) throw e2;
  return data as ImportResult;
}

export interface LastImport { at: string; byName: string | null; total: number; inserted: number; updated: number }
export async function fetchLastImport(): Promise<LastImport | null> {
  const { data } = await supabase.from('materials_import_batches').select('at, by_name, total, inserted, updated')
    .eq('done', true).order('at', { ascending: false }).limit(1);
  const r = data?.[0];
  return r ? { at: r.at, byName: r.by_name, total: r.total, inserted: r.inserted, updated: r.updated } : null;
}
