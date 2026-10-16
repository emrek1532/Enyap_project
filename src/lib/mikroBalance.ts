/**
 * Mikro "cari bakiye" listesini (PDF veya Excel) okur.
 * Satır: cari kodu · ünvan (iki satıra taşabilir) · bakiye (+ borçlu / − alacaklı).
 */
import { Customer } from '../types';
import { readXlsxRows } from './xlsxRead';
import { matchCustomer } from './pdfQuote';
import { foldName } from './customerInsights';

export interface MikroRow { code: string; title: string; balance: number }

const NUM = /^-?\d{1,3}(\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/;
const CODE = /^\d{3,10}$/;
const trNum = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'));

export async function readMikroPdf(data: ArrayBuffer): Promise<MikroRow[]> {
  const pdfjs = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/',
  }).promise;
  const rows: MikroRow[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const items = ((await page.getTextContent()).items as any[])
        .map(it => ({ s: String(it.str ?? '').trim(), x: it.transform[4] as number, y: it.transform[5] as number }))
        .filter(it => it.s);
      rows.push(...rowsFromItems(items));
      page.cleanup();
    }
  } finally {
    doc.destroy();
  }
  return rows;
}

/** Konumlu yazı parçalarından satırları kurar (test edilebilir olsun diye ayrı) */
export function rowsFromItems(items: { s: string; x: number; y: number }[]): MikroRow[] {
  const minX = Math.min(...items.map(i => i.x));
  const codes = items.filter(i => CODE.test(i.s) && i.x <= minX + 15).sort((a, b) => b.y - a.y);
  if (!codes.length) return [];
  const codeRight = Math.max(...codes.map(c => c.x)) + 20;
  const nums = items.filter(i => NUM.test(i.s) && i.x > codeRight);
  const numLeft = nums.length ? Math.min(...nums.map(n => n.x)) - 5 : Infinity;
  const names = items.filter(i => i.x > codeRight - 5 && i.x < numLeft && !NUM.test(i.s));
  return codes.map((c, k) => {
    const next = codes[k + 1]?.y ?? -Infinity;
    const title = names.filter(n => n.y <= c.y + 2 && n.y > next + 2).sort((a, b) => b.y - a.y || a.x - b.x).map(n => n.s).join(' ');
    const num = nums.filter(n => Math.abs(n.y - c.y) < 4).sort((a, b) => b.x - a.x)[0];
    return { code: c.s, title: title.replace(/\s+/g, ' ').trim(), balance: num ? trNum(num.s) : NaN };
  }).filter(r => r.title && Number.isFinite(r.balance));
}

export function readMikroXlsx(buf: ArrayBuffer): MikroRow[] {
  const rows = readXlsxRows(buf).map(r => r.map(c => (c == null ? '' : String(c).trim())));
  const head = rows.findIndex(r => r.some(c => /ünvan|unvan/i.test(c)) && r.some(c => /bakiye/i.test(c)));
  const h = head >= 0 ? rows[head].map(c => foldName(c)) : [];
  const col = (re: RegExp, fb: number) => { const i = h.findIndex(c => re.test(c)); return i >= 0 ? i : fb; };
  const ci = col(/kod/, 0), ni = col(/unvan/, 1), bi = col(/bakiye/, 2);
  const num = (v: string) => (/,\d{1,2}$/.test(v) ? trNum(v) : Number(v.replace(/\s/g, '')));
  return rows.slice(head + 1)
    .map(r => ({ code: r[ci], title: r[ni], balance: num(r[bi] || '') }))
    .filter(r => r.code && r.title && Number.isFinite(r.balance));
}

export async function readMikroFile(file: File): Promise<MikroRow[]> {
  const buf = await file.arrayBuffer();
  return /\.pdf$/i.test(file.name) ? readMikroPdf(buf) : readMikroXlsx(buf);
}

/** Mikro satırını sistemdeki müşteriyle eşleştirir: önce daha önce kaydedilen cari kodu, sonra ünvan benzerliği */
export function matchMikro(row: MikroRow, customers: Customer[]): Customer | undefined {
  const byCode = customers.find(c => c.mikroCode === row.code);
  if (byCode) return byCode;
  const name = matchCustomer(row.title, customers.filter(c => !c.mikroCode).map(c => c.name));
  return name ? customers.find(c => c.name === name) : undefined;
}

/** Bakiye tarihinden sonra sisteme girilen tahsilatlar düşülerek güncel tahmini bakiye */
export function estimatedBalance(c: Customer, collections: { customerName: string; date: string; amount: number; currency: string }[]) {
  if (c.mikroBalance == null || !c.mikroBalanceDate) return null;
  const k = foldName(c.name);
  const after = collections.filter(x => foldName(x.customerName) === k && (x.currency || 'TRY') === 'TRY' && x.date > c.mikroBalanceDate!)
    .reduce((s, x) => s + (x.amount || 0), 0);
  return { balance: c.mikroBalance, date: c.mikroBalanceDate, collectedAfter: after, estimate: c.mikroBalance - after };
}
