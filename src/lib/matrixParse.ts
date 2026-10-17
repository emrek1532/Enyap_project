/**
 * Matris düzenli fiyat listesi okuma: üstte ölçü sütunları (1/2", 3/4"… ya da 3/4"-1/2"…), solda ürün adı,
 * ürün başına bir ya da birkaç çeşit satırı (Siyah / Galvaniz, Beyaz / Krom, PN16 / PN25…) ve her hücrede fiyat.
 * Her fiyat hücresi ayrı kalem olur: "<ürün> <çeşit> <ölçü>". Böylece renk/çeşit ve ölçü bilgisi kaybolmaz.
 */
import type { ParsedItem } from './priceParse';
import type { PItem } from './tableParse';

const PRICE_RE = /^(?:[$€₺]\s*)?(\d{1,3}(?:\.\d{3})+,\d{2,4}|\d+,\d{2,4})(?:\s*(?:₺|TL|€|\$))?$/;
const trNum = (s: string) => Number(s.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'));
// Ölçü başlığı: inç (", ”), kesirli ölçü, DN, Ø, mm, "x" ile çok ölçülü
const SIZE_RE = /["”″“]|^\d+\s?\d?\/\d+$|^DN\s?\d+|^Ø\s?\d+|^\d+\s?mm$|^M\d+$|^\d+(?:[.,]\d+)?\s?bar$/i;
// Çeşit (renk, kaplama, basınç sınıfı) kelimeleri
const VARIANT_RE = /^(siyah|galvaniz|galv\.?|beyaz|krom|kromaj(lı)?|nikel|pirinç|sarı|elektro|boyalı|boyasız|paslanmaz|inox|pn\s?\d+|\d+\s?bar|standart|hızlı|kırmızı|mavi|gri)$/i;
// Başlık / açıklama kelimeleri: ürün adına girmez
const LABEL_RE = /^(ölçü|olcu|cinsi|td|figür|figur|no\.?|stand\.?\s*no\.?|ts\.?\s*\d+|en\s*\d+|ts en \d+.*|ürün|ürün adı|kod|kodu|fiyat|birim|adet|₺\/adet.*)$/i;
// Sayfa altı / üstü açıklamaları
const NOISE_RE = /f[iİı]yat\s*l[iİı]stes|kdv|perakende|haber\s*vermeksizin|sipariş|ts\s*en\s*\d|dizayn|www\.|tel\s*:/i;
const CODE_TOKEN = /^(\d{1,4}[A-Z]{0,4}|[A-Z]{1,3}\d{1,3}[A-Z]?(\/\d+º?)?|\d+[A-Z]*\/\d+º?)$/;

type Row = { y: number; items: PItem[] };

function rowsOf(items: PItem[], tol = 2.5): Row[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const it of sorted) {
    const r = rows[rows.length - 1];
    // Satırın son parçasına göre (eğik yazılmış satırlar da tek satır sayılır)
    if (r && Math.abs(r.items[r.items.length - 1].y - it.y) <= tol) r.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  rows.forEach(r => r.items.sort((a, b) => a.x - b.x));
  return rows;
}

const cx = (i: PItem) => i.x + i.w / 2;

/** "11/4"" → "1 1/4"", "1”-1/2”" → "1"-1/2"" */
export function normSize(s: string): string {
  return s.replace(/[”″“]/g, '"').replace(/\b(\d)(\d\/\d)/g, '$1 $2').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
}

/** Sayfadaki matris tablolarını okur; matris yoksa boş döner. */
export function parseMatrixPage(items: PItem[]): ParsedItem[] {
  const clean = items.map(i => ({ ...i, s: i.s.replace(/\s+/g, ' ').trim() })).filter(i => i.s);
  const rows = rowsOf(clean);
  // Ölçü başlık satırı: en az 3 ölçü, hiç fiyat yok
  const isHeader = (r: Row) => !r.items.some(i => PRICE_RE.test(i.s)) && r.items.filter(i => SIZE_RE.test(i.s)).length
    >= (r.items.some(i => /^(ölçü|olcu|ebat|çap|cap)$/i.test(i.s)) ? 1 : 3);
  type PRow = { row: Row; header: Row; prices: { it: PItem; size: string }[]; variant: string; left: number };
  const priceRows: PRow[] = [];
  let header: Row | null = null;
  for (const r of rows) {
    if (isHeader(r)) { header = r; continue; }
    const prices = r.items.filter(i => PRICE_RE.test(i.s));
    if (!header || !prices.length) continue;
    const cols = header.items.filter(i => SIZE_RE.test(i.s));
    const matched: { it: PItem; size: string }[] = [];
    for (const p of prices) {
      const c = cols.reduce((b, k) => (Math.abs(cx(k) - cx(p)) < Math.abs(cx(b) - cx(p)) ? k : b), cols[0]);
      if (Math.abs(cx(c) - cx(p)) <= Math.max(18, c.w * 0.8)) matched.push({ it: p, size: normSize(c.s) });
    }
    if (!matched.length || matched.length < prices.length * 0.7) continue;
    const firstX = Math.min(...matched.map(m => m.it.x));
    // Çeşit: fiyatların hemen solundaki kelime (ör. "Siyah")
    const leftWords = r.items.filter(i => i.x + i.w <= firstX + 2 && !PRICE_RE.test(i.s));
    const v = leftWords.filter(i => VARIANT_RE.test(i.s) && firstX - (i.x + i.w) < 90);
    // Tek fiyatlı satır ancak çeşit adı varsa (ör. "Siyah 1.320,00") matris satırıdır
    if (matched.length < 2 && !v.length) continue;
    priceRows.push({ row: r, header, prices: matched, variant: v.map(i => i.s).join(' '), left: v.length ? Math.min(...v.map(i => i.x)) : firstX });
  }
  if (priceRows.length < 2) return [];
  const cells = priceRows.reduce((a, p) => a + p.prices.length, 0);
  if (cells < 6) return [];

  // Ürün adı adayları: fiyat satırlarının solundaki, çeşit/başlık olmayan yazılar
  const leftEdge = Math.min(...priceRows.map(p => p.left));
  const usedIds = new Set(priceRows.flatMap(p => p.prices.map(m => m.it)));
  const priceH = priceRows[0].prices[0].it.h || 8;
  const labels = clean.filter(i => !usedIds.has(i) && i.x < leftEdge - 2 && i.h <= priceH * 1.6
    && !VARIANT_RE.test(i.s) && !LABEL_RE.test(i.s) && !NOISE_RE.test(i.s) && !PRICE_RE.test(i.s) && !SIZE_RE.test(i.s) && i.s.length < 60);

  // Çeşit sırası tekrar ettiğinde (Siyah, Galvaniz, Siyah…) yeni ürün bloğu başlar
  type Block = { rows: PRow[]; top: number; bot: number; seg: number; name: string; code: string };
  const blocks: Block[] = [];
  for (const p of priceRows) {
    const b = blocks[blocks.length - 1];
    const startNew = !b || p.header !== b.rows[0].header || !p.variant || !b.rows[0].variant || p.variant === b.rows[0].variant || b.bot - p.row.y > 30;
    if (startNew) blocks.push({ rows: [p], top: p.row.y, bot: p.row.y, seg: 0, name: '', code: '' }); else { b.rows.push(p); b.bot = p.row.y; }
  }
  // Ürün bölümü: ölçü başlığı küçük ölçüye geri döndüğünde ya da ölçü parça sayısı değiştiğinde yeni ürün başlar
  // (ör. 3/4"-1/2" … 4"-3" bitti, tekrar 3/4"-1/2" → yeni ürün; 2 parçalı → 3 parçalı ölçü → yeni ürün)
  const sizeVal = (s: string) => {
    const t = s.replace(/^(DN|Ø)\s?/i, '');
    const f = /^(\d+)\/(\d+)/.exec(t);
    if (f) return Number(f[1]) / Number(f[2]);
    const m = /^(\d+)(?:\s+(\d+)\/(\d+))?/.exec(t);
    return m ? Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0) : 0;
  };
  const hdrInfo = (h: Row) => {
    const sz = h.items.filter(i => SIZE_RE.test(i.s)).map(i => normSize(i.s));
    return { first: sizeVal(sz[0]), parts: sz[0].split('-').length };
  };
  let seg = 0;
  for (let k = 1; k < blocks.length; k++) {
    const a = blocks[k - 1].rows[0].header, b = blocks[k].rows[0].header;
    if (a !== b) {
      const ia = hdrInfo(a), ib = hdrInfo(b);
      if (ib.parts !== ia.parts || ib.first < ia.first || a.y - b.y > 200) seg++;
    }
    blocks[k].seg = seg;
  }
  // Etiketler: bloğun kendi satır aralığındaysa o bloğun, değilse bulunduğu bölümün adıdır
  const joinWords = (ws: PItem[]) => {
    const w = [...ws].sort((a, b) => b.y - a.y || a.x - b.x);
    return { code: w.filter(x => CODE_TOKEN.test(x.s)).map(x => x.s).join(' '), name: w.filter(x => !CODE_TOKEN.test(x.s)).map(x => x.s).join(' ') };
  };
  // Bölümdeki birden çok blokta kendi etiketi varsa (her ürün kendi satırında yazılı) blok blok,
  // yoksa (tek ürün adı birkaç ölçü tablosuna yayılmış) bölüm adı kullanılır
  const taken = new Set<PItem>();
  const ownOf = (b: Block) => labels.filter(i => i.y <= b.top + 6 && i.y >= b.bot - 6);
  for (let sg = 0; sg <= seg; sg++) {
    const bs = blocks.filter(b => b.seg === sg);
    const withOwn = bs.filter(b => ownOf(b).some(i => !CODE_TOKEN.test(i.s)));
    if (withOwn.length < 2) continue;
    for (const b of withOwn) { const own = ownOf(b); const j = joinWords(own); b.name = j.name; b.code = j.code; own.forEach(i => taken.add(i)); }
  }
  for (let sg = 0; sg <= seg; sg++) {
    const bs = blocks.filter(b => b.seg === sg);
    // Bölüm aralığı: kendi başlığından bir sonraki bölümün başlığına kadar (ortalanmış ürün adları da yakalanır)
    const nxt = blocks.find(b => b.seg === sg + 1);
    const top = bs[0].rows[0].header.y + 8, bot = nxt ? nxt.rows[0].header.y + 8 : bs[bs.length - 1].bot - 30;
    const rest = labels.filter(i => !taken.has(i) && i.y <= top && i.y > bot);
    const j = joinWords(rest);
    for (const b of bs) if (!b.name) { b.name = j.name; b.code = b.code || j.code; }
  }
  const out: ParsedItem[] = [];
  for (const b of blocks) {
    const { name, code } = b;
    for (const p of b.rows) {
      for (const m of p.prices) {
        const price = trNum(m.it.s);
        if (!(price > 0 && price < 10_000_000)) continue;
        const full = [name, p.variant, m.size].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        if (full.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length < 3) continue;
        out.push({
          code, name: full.slice(0, 200), grp: [name, p.variant].filter(Boolean).join(' ') || undefined,
          price: Math.round(price * 10000) / 10000, unit: 'Adet',
          currency: /\$/.test(m.it.s) ? 'USD' : /€/.test(m.it.s) ? 'EUR' : /₺|TL/.test(m.it.s) ? 'TRY' : undefined,
        });
      }
    }
  }
  return out;
}
