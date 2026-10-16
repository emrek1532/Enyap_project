/**
 * Konuma göre fiyat listesi okuma: PDF'teki yazıların x/y konumlarını kullanır.
 * "KOD … FİYAT" başlıklı her tablo ayrı okunur; iki sütunlu sayfalarda sol ve sağ tablolar karışmaz,
 * koli adedi fiyata yapışmaz, tablonun üstündeki başlık o tablonun grup adı olur.
 */
import { Currency } from './money';
import type { ParsedItem } from './priceParse';

export interface PItem { s: string; x: number; y: number; w: number; h: number }

const CODE_HDR = /^(KOD|KODU|ÜRÜN\s*KODU|STOK\s*KODU|MALZEME\s*KODU|ART\.?\s*NO|REF)$/i;
const PRICE_HDR = /^(F[İI]YAT|F[İI]YATI|L[İI]STE\s*F[İI]YATI|B[İI]R[İI]M\s*F[İI]YAT|F[İI]YAT\s*\(.*\)|TL|EURO?|USD)$/i;
const NAME_HDR = /^(ÜRÜN\s*ADI|ÜRÜN|AÇIKLAMA|CİNSİ|MALZEME|MALZEME\s*ADI|TANIM)$/i;
const QTY_HDR = /^(KOL[İI]|K\.?\s*ADED[İI]|KOL[İI]\s*ADED[İI]|PAKET|PO[ŞS]ET|KUTU|AMBALAJ|ADET|B[İI]R[İI]M|M[İI]N\.?\s*S[İI]PAR[İI][ŞS])$/i;
const PRICE_RE = /^(\d{1,3}(?:\.\d{3})+,\d{2,4}|\d+,\d{2,4})$/;
const CUR_RE = /^(₺|TL|TRY|€|EUR|EURO|\$|USD)\.?$/i;
const trNum = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const curOf = (s: string): Currency | undefined => (/\$|USD/i.test(s) ? 'USD' : /€|EUR/i.test(s) ? 'EUR' : /₺|TL|TRY/i.test(s) ? 'TRY' : undefined);

type Col = { kind: 'code' | 'name' | 'size' | 'qty' | 'price'; x: number };
interface Table { y: number; xL: number; xR: number; cols: Col[]; titleL: number; h: number }

/** Aynı satırdaki parçaları (y farkı küçük) gruplar, yukarıdan aşağıya */
function rowsOf(items: PItem[], tol = 2.5): PItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PItem[][] = [];
  for (const it of sorted) {
    const r = rows[rows.length - 1];
    if (r && Math.abs(r[0].y - it.y) <= tol) r.push(it); else rows.push([it]);
  }
  return rows.map(r => r.sort((a, b) => a.x - b.x));
}

function findTables(items: PItem[]): Table[] {
  const tables: Table[] = [];
  for (const k of items.filter(i => CODE_HDR.test(i.s.trim()))) {
    const line = items.filter(i => Math.abs(i.y - k.y) <= 2 && i.x >= k.x - 2 && i.x <= k.x + 420).sort((a, b) => a.x - b.x);
    const priceIdx = line.findIndex(i => PRICE_HDR.test(i.s.trim()) && i.x > k.x);
    if (priceIdx < 0) continue;
    const hdr = line.slice(0, priceIdx + 1);
    const cols: Col[] = hdr.map(i => {
      const t = i.s.trim();
      const kind: Col['kind'] = CODE_HDR.test(t) ? 'code' : PRICE_HDR.test(t) ? 'price' : NAME_HDR.test(t) ? 'name' : QTY_HDR.test(t) ? 'qty' : 'size';
      return { kind, x: i.x + i.w / 2 };
    });
    const p = hdr[hdr.length - 1];
    tables.push({ y: k.y, xL: k.x - 8, xR: p.x + p.w + 30, cols, titleL: 0, h: k.h });
  }
  // Başlık arama alanı: soldaki tablonun sağ kenarından bu tablonun sağ kenarına kadar
  for (const t of tables) {
    const left = tables.filter(o => o !== t && o.xR <= t.xL + 10 && Math.abs(o.y - t.y) < 400);
    t.titleL = left.length ? Math.max(...left.map(o => o.xR)) - 10 : 0;
  }
  return tables;
}

/** Ara başlık, tablo başlığıyla aynı kelimelerle başlıyorsa tekrar eden kısım atılır */
function stripPrefix(sub: string, title: string): string {
  const up = (x: string) => x.toLocaleUpperCase('tr');
  // Ara başlık tablo başlığıyla başlıyorsa (ör. "NİPEL" → "NİPEL - NİKEL") sadece farklı kısım kalır
  if (title && up(sub).startsWith(up(title))) return sub.slice(title.length).replace(/^[\s\-–—]+/, '');
  // Tablo başlığının ilk 2+ kelimesi ara başlıkta geçiyorsa o kelimeler atılır ("1” TERMOSTATİK AYARLI KOLLEKTÖR" → "1”")
  const tw = up(title).split(' ');
  for (let n = tw.length; n >= 2; n--) {
    const seq = tw.slice(0, n).join(' ');
    const at = up(sub).indexOf(seq);
    if (at >= 0) return (sub.slice(0, at) + sub.slice(at + seq.length)).replace(/\s+/g, ' ').trim();
  }
  return sub;
}

const nearestCol = (cols: Col[], x: number) => cols.reduce((b, c) => (Math.abs(c.x - x) < Math.abs(b.x - x) ? c : b), cols[0]);

/** Bir sayfanın konumlu yazısından kalemleri çıkarır. Tablo bulunamazsa boş döner. */
export function parsePositionedPage(items: PItem[]): ParsedItem[] {
  const clean = items.map(i => ({ ...i, s: i.s.replace(/\s+/g, ' ').trim() })).filter(i => i.s);
  const tables = findTables(clean);
  if (!tables.length) return [];
  const used = new Set<PItem>();
  // Tablo başlık satırlarındaki parçalar kalem sayılmaz
  for (const t of tables) clean.filter(i => Math.abs(i.y - t.y) <= 2 && i.x >= t.xL && i.x <= t.xR).forEach(i => used.add(i));
  const out: ParsedItem[] = [];

  for (const t of tables) {
    const inZone = (i: PItem) => i.x >= t.xL && i.x < t.xR;
    // Alttaki ilk tablo (aynı bölgede) bu tablonun bittiği yer
    const below = tables.filter(o => o !== t && o.y < t.y && o.xL < t.xR && o.xR > t.xL).map(o => o.y);
    const stopY = below.length ? Math.max(...below) : -Infinity;

    // --- Başlık: tablonun üstünde, aynı sütundaki yazılar (aradaki boşluk büyük değilse)
    const above = rowsOf(clean.filter(i => i.y > t.y + 2 && i.y < t.y + 90 && i.x >= t.titleL && i.x < t.xR && !used.has(i)));
    const titleRows: PItem[][] = [];
    let lastY = t.y;
    for (const r of [...above].reverse()) { // aşağıdan yukarı
      if (r[0].y - lastY > (titleRows.length ? 22 : 48)) break;
      if (r.some(i => PRICE_RE.test(i.s))) break; // başka tablonun kalemi
      titleRows.unshift(r);
      lastY = r[0].y;
    }
    // Aynı başlığın kısa ve uzun hali (ör. "DÜZ RAKOR" + "DÜZ RAKOR - SARI") tek yazılır
    const tLines = titleRows.map(r => r.map(i => i.s).join(' ').replace(/\s+/g, ' ').trim());
    const title = tLines.filter((l, k) => !tLines.some((o, j) => j !== k && o.length > l.length && o.toLocaleUpperCase('tr').startsWith(l.toLocaleUpperCase('tr')))).join(' ');

    // --- Satırlar
    const body = clean.filter(i => i.y < t.y - 2 && i.y > stopY + 2 && inZone(i) && !used.has(i));
    const rows = rowsOf(body);
    let sub = '';
    const hasQty = t.cols.some(c => c.kind === 'qty');
    let lastRowY = t.y;
    let pendingPrice: PItem | null = null;
    type Row = { code: string; parts: string[]; price?: number; cur?: Currency; y: number };
    const tRows: Row[] = [];
    for (const r of rows) {
      if (lastRowY - r[0].y > 40) break; // tablo bitti
      const code = r[0];
      const first = code.s.split(' ')[0];
      // Kod: KOD sütununda, rakam içeren, ölçü işareti (”, ") olmayan kısa kelime; ara başlıklar daha büyük yazılır
      const hasCode = Math.abs(code.x + code.w / 2 - t.cols[0].x) < 25 && /\d/.test(first) && !/["”'’]/.test(first)
        && !PRICE_RE.test(code.s) && first.length <= 24 && !(t.h && code.h > t.h + 1.5);
      const priceIt = r.find(i => PRICE_RE.test(i.s) && nearestCol(t.cols, i.x + i.w / 2).kind === 'price');
      if (!hasCode && !priceIt) {
        // Fiyatsız ve kodsuz satır: ara başlık (ör. "1” - 16 x 2”") ya da bir önceki satırın devamı
        const text = r.map(i => i.s).join(' ');
        if (/[A-Za-zÇĞİÖŞÜçğıöşü0-9]/.test(text)) {
          if (t.cols.some(c => c.kind === 'name') && tRows.length && lastRowY - r[0].y < 14) tRows[tRows.length - 1].parts.push(text);
          else sub = text;
        }
        lastRowY = r[0].y;
        continue;
      }
      if (!hasCode && priceIt) { pendingPrice = priceIt; lastRowY = r[0].y; continue; } // fiyat bir üst satıra kaymış
      const row: Row = { code: code.s.split(' ')[0], parts: [], y: r[0].y };
      const extra = code.s.split(' ').slice(1).join(' ');
      if (extra) row.parts.push(extra);
      for (const i of r.slice(1)) {
        const col = nearestCol(t.cols, i.x + i.w / 2);
        if (CUR_RE.test(i.s)) { row.cur = row.cur || curOf(i.s); continue; }
        if (col.kind === 'price' && PRICE_RE.test(i.s)) { row.price = trNum(i.s); row.cur = row.cur || curOf(i.s); continue; }
        if (col.kind === 'price' && /\d+,\d{2}/.test(i.s)) { // "1.234,50 ₺" tek parça
          const m = /(\d{1,3}(?:\.\d{3})+,\d{2,4}|\d+,\d{2,4})/.exec(i.s);
          if (m) { row.price = trNum(m[1]); row.cur = row.cur || curOf(i.s); continue; }
        }
        if (col.kind === 'qty') continue;
        if (hasQty && /^\d+$/.test(i.s) && col.kind !== 'name') continue; // koli adedi (sütun kayması)
        if (col.kind === 'code') { row.parts.unshift(i.s); continue; }
        row.parts.push(i.s);
      }
      if (row.price == null && pendingPrice && Math.abs(pendingPrice.y - row.y) < 10) row.price = trNum(pendingPrice.s);
      pendingPrice = null;
      if (row.price == null) {
        // Fiyat bir alt satıra kaymış olabilir
        const nxt = body.find(i => PRICE_RE.test(i.s) && i.y < row.y && row.y - i.y < 10 && nearestCol(t.cols, i.x + i.w / 2).kind === 'price');
        if (nxt) { row.price = trNum(nxt.s); used.add(nxt); }
      }
      // Koli adedi ölçüyle aynı parçaya yapışmışsa (ör. "1/2”-20 mm 60") sondaki sayı atılır
      if (hasQty && !r.some(i => nearestCol(t.cols, i.x + i.w / 2).kind === 'qty') && row.parts.length) {
        row.parts[row.parts.length - 1] = row.parts[row.parts.length - 1].replace(/\s+\d+$/, '');
      }
      if (sub) {
        const s2 = stripPrefix(sub, title);
        if (s2) row.parts.unshift(s2);
      }
      tRows.push(row);
      lastRowY = r[0].y;
    }
    for (const r of tRows) {
      if (!(r.price && r.price > 0 && r.price < 10_000_000)) continue;
      const detail = r.parts.filter((p, k) => p !== r.parts[k - 1]).join(' ').replace(/\s+/g, ' ').trim();
      const name = [title, detail].filter(Boolean).join(' ').trim();
      if (name.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length < 3) continue;
      out.push({ code: r.code, name: name.slice(0, 200), grp: title || undefined, price: Math.round(r.price * 10000) / 10000, unit: 'Adet', currency: r.cur });
    }
  }
  return out;
}
