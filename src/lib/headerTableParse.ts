/**
 * Kod sütunu olmayan tablolar: başlıkta "ÜRÜN" (ÜRÜN/MODEL, ÜRÜN ADI, AÇIKLAMA…) ve sağında bir ya da birkaç fiyat sütunu
 * ("SATIŞ FİYATI", "10 BAR | 16 BAR", "PN16", "USD"…) bulunur.
 * - Ürün adı sütunu, fiyatlı satırlardaki en soldaki yazıların en sık x konumudur; daha soldaki grup etiketleri
 *   ("FREKANS KONTROLLÜ DİŞLİ") ada karışmaz.
 * - Ad ile fiyat aynı satırda ama 1-2 punto kaymış olabilir: fiyat, y'si en yakın (≤4) ada bağlanır.
 * - Ad ile fiyat arasındaki teknik özellikler (25(1''), 180 mm, 80 w) ada eklenir.
 * - Birden çok fiyat sütunu varsa her hücre ayrı kalemdir, sütun başlığı ada eklenir (8 LT TANK 10 BAR / 16 BAR); "-" boş hücredir.
 */
import { Currency } from './money';
import type { ParsedItem } from './priceParse';
import type { PItem } from './tableParse';

const NAME_HDR = /^(ÜRÜN|URUN|ÜRÜN\s*\/\s*MODEL|ÜRÜN\s*ADI|ÜRÜN\s*CİNSİ|MODEL|AÇIKLAMA|TİP|CİNSİ|MALZEME(\s*ADI)?|TANIM)$/i;
const PRICE_HDR = /F[İI]YAT|^\d+([.,]\d+)?\s*BAR$|^PN\s*\d+$|^(TL|USD|EUR|EURO|€|\$|₺)$/i;
const CUR_ONLY = /^(₺|TL|TRY|€|EUR|EURO|\$|USD)\.?$/i;
const NUM_RE = /^(\d{1,3}(?:\.\d{3})+(?:,\d{1,4})?|\d+(?:,\d{1,4})?)$/;
const curOf = (s: string): Currency | undefined => (/\$|USD/i.test(s) ? 'USD' : /€|EUR/i.test(s) ? 'EUR' : /₺|TL|TRY/i.test(s) ? 'TRY' : undefined);
const hasLetter = (s: string) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(s);

/** "$1.100,00" → 1100 · "1.175" → 1175 · "23,10" → 23.1; fiyat değilse null */
function priceOf(s: string): number | null {
  const t = s.replace(/[$€₺]/g, '').replace(/\b(TL|USD|EUR|EURO)\b/gi, '').replace(/\s+/g, '').trim();
  if (!NUM_RE.test(t)) return null;
  const v = Number(t.replace(/\./g, '').replace(',', '.'));
  return v > 0 && v < 10_000_000 ? v : null;
}

export function parseHeaderTable(items: PItem[]): ParsedItem[] {
  const clean = items.map(i => ({ ...i, s: i.s.replace(/\s+/g, ' ').trim() })).filter(i => i.s);
  const headers = clean.filter(i => NAME_HDR.test(i.s)).sort((a, b) => b.y - a.y);
  const out: ParsedItem[] = [];
  for (let h = 0; h < headers.length; h++) {
    const hdr = headers[h];
    const cols = clean.filter(i => Math.abs(i.y - hdr.y) <= 2.5 && i.x > hdr.x + hdr.w && PRICE_HDR.test(i.s))
      .sort((a, b) => a.x - b.x).map(i => ({ x: i.x + i.w / 2, left: i.x, label: i.s }));
    if (!cols.length) continue;
    const nextHdr = headers.slice(h + 1).find(o => cols.length && o.y < hdr.y - 10);
    const stopY = nextHdr ? nextHdr.y + 2 : -Infinity;
    const body = clean.filter(i => i.y < hdr.y - 2 && i.y > stopY);
    const minLeft = Math.min(...cols.map(c => c.left)) - 30;

    // Fiyat hücreleri: fiyat sütunları bölgesinde sayı; en yakın sütuna atanır
    const prices = body.flatMap(i => {
      if (i.x < minLeft) return [];
      const v = priceOf(i.s);
      if (v == null) return [];
      const c = cols.reduce((b, k) => (Math.abs(k.x - (i.x + i.w / 2)) < Math.abs(b.x - (i.x + i.w / 2)) ? k : b), cols[0]);
      return [{ it: i, v, col: c }];
    });
    if (prices.length < 3) continue;

    // Ad sütunu: fiyatlı satırlarda (±4) fiyat bölgesinin solundaki en soldaki yazının en sık x'i
    const texts = body.filter(i => i.x < minLeft && hasLetter(i.s));
    const freq = new Map<number, number>();
    for (const p of prices) {
      const near = texts.filter(t => Math.abs(t.y - p.it.y) <= 4).sort((a, b) => a.x - b.x)[0];
      if (near) freq.set(Math.round(near.x), (freq.get(Math.round(near.x)) || 0) + 1);
    }
    if (!freq.size) continue;
    const nameX = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const anchors = texts.filter(t => Math.abs(t.x - nameX) <= 6);

    // Her fiyatı y'si en yakın ada bağla
    const rows = new Map<PItem, { cells: Map<string, { v: number; dy: number; cur?: Currency }> }>();
    for (const p of prices) {
      let best: PItem | null = null, bd = 4.01;
      for (const a of anchors) { const d = Math.abs(a.y - p.it.y); if (d < bd) { bd = d; best = a; } }
      if (!best) continue;
      const r = rows.get(best) || { cells: new Map() };
      const prev = r.cells.get(p.col.label);
      const rowCur = body.find(i => CUR_ONLY.test(i.s) && Math.abs(i.y - p.it.y) <= 2.5 && i.x >= minLeft);
      if (!prev || bd < prev.dy) r.cells.set(p.col.label, { v: p.v, dy: bd, cur: curOf(p.it.s) || (rowCur ? curOf(rowCur.s) : undefined) });
      rows.set(best, r);
    }

    const multi = cols.length > 1;
    for (const a of [...rows.keys()].sort((x, y) => y.y - x.y)) {
      // Teknik özellikler: adın sağında, fiyat bölgesinin solunda, aynı satırda
      const specs = body.filter(i => i !== a && i.x > nameX + 6 && i.x < minLeft && Math.abs(i.y - a.y) <= 3 && !CUR_ONLY.test(i.s))
        .sort((x, y) => x.x - y.x).map(i => i.s);
      const base = [a.s, ...specs].join(' ').replace(/\s+/g, ' ').trim();
      for (const c of cols) {
        const cell = rows.get(a)!.cells.get(c.label);
        if (!cell) continue;
        const name = (multi ? `${base} ${c.label}` : base).slice(0, 200);
        out.push({ code: '', name, price: Math.round(cell.v * 10000) / 10000, unit: 'Adet', currency: cell.cur });
      }
    }
  }
  return out;
}
