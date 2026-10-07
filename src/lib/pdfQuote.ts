/**
 * Muhasebe programının "FİYAT TEKLİFİ" PDF'ini okuyup teklife çevirir:
 * firma, teklif no, tarih, vade, teklifi veren, kalemler (miktar / birim / fiyat / iskonto / döviz) ve genel toplamlar.
 */
import { Currency } from './money';
import { QuoteItem } from '../types';
import { foldTr, searchMaterials } from './materials';

export interface PdfQuote {
  fileName: string;
  quoteNumber: string | null;
  customerName: string | null;
  city: string | null;
  date: string | null;          // YYYY-AA-GG
  paymentTerm: string | null;   // "90 GÜN", "PEŞİN"…
  preparedBy: string | null;
  items: QuoteItem[];
  totals: { USD: number; EUR: number; TRY: number } | null;
  warnings: string[];
}

/** "1.234,56" → 1234.56 */
export const trNum = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

const UNIT: Record<string, QuoteItem['unit']> = {
  ADET: 'Adet', AD: 'Adet', MT: 'Metre', METRE: 'Metre', M: 'Metre', KG: 'Kg', TAKIM: 'Takım', TK: 'Takım',
  PAKET: 'Paket', PK: 'Paket', SET: 'Set',
};
const CUR: Record<string, Currency> = { TL: 'TRY', TRY: 'TRY', USD: 'USD', EUR: 'EUR', EURO: 'EUR' };

const NUM = String.raw`\d[\d.]*,\d+`;
// 1 ) ÜRÜN ADI   500,00 ADET   23,00   28 0,00   16,56 TL   8.280,00 TL
const ROW = new RegExp(
  String.raw`^\s*(\d+)\s*\)\s*(.+?)\s+(${NUM})\s+([A-Za-zÇĞİÖŞÜçğıöşü.]+)\s+(${NUM})\s+(\d+(?:,\d+)?)(?:\s+(\d+(?:,\d+)?))?\s+(${NUM})\s+(TL|TRY|USD|EUR|EURO)\s+(${NUM})\s+(TL|TRY|USD|EUR|EURO)\s*$`,
);


/** PDF satırlarından teklifi çıkarır (satırlar soldan sağa birleştirilmiş metinlerdir) */
export function parseQuoteLines(lines: string[], fileName = ''): PdfQuote {
  const warnings: string[] = [];
  const all = lines.join('\n');
  const pick = (re: RegExp) => re.exec(all)?.[1]?.replace(/^[\s:]+/, '').trim() || null;

  const quoteNumber = pick(/Teklif\s*No\s*:?\s*([A-Z0-9-]+)/i);
  const customerName = pick(/Firma\s*:\s*(.+?)\s+Teklif\s*No/) || pick(/Firma\s*:\s*(.+)$/m);
  const cityRaw = pick(/Şehir\s*:\s*(.+?)(?:\s+Vade|\s+Teklif|$)/m);
  const dateRaw = pick(/Teklif\s*Tarihi\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/i);
  const vade = pick(/Vade\s*Tarihi\s*:?\s*(\d+\s*G[üu]n|PE[ŞS][İI]N|KRED[İI]\s*KARTI)/i);

  // Teklifi veren: "Teklif Veren" satırından sonraki ilk dolu satırın baş kısmı
  let preparedBy: string | null = null;
  const tvIdx = lines.findIndex(l => /Teklif\s*Veren/i.test(l));
  if (tvIdx >= 0) {
    for (const l of lines.slice(tvIdx + 1, tvIdx + 4)) {
      const name = l.replace(/(Ara\s*Toplam|Toplam\s*[İI]skonto|KDV|G\.?\s*TOPLAM).*$/i, '').trim();
      if (name && /\p{L}{2,}/u.test(name) && !/\d/.test(name)) { preparedBy = titleTr(name); break; }
    }
  }

  // Genel toplam (son sayfadaki): USD EUR TL
  let totals: PdfQuote['totals'] = null;
  const gt = [...all.matchAll(new RegExp(String.raw`G\.?\s*TOPLAM\s+(${NUM})\s+(${NUM})\s+(${NUM})`, 'gi'))].pop();
  if (gt) totals = { USD: trNum(gt[1]), EUR: trNum(gt[2]), TRY: trNum(gt[3]) };

  const items: QuoteItem[] = [];
  const seen = new Set<number>();
  for (const line of lines) {
    const m = ROW.exec(line.replace(/\s+/g, ' '));
    if (!m) continue;
    const no = Number(m[1]);
    if (seen.has(no)) continue;
    seen.add(no);
    const quantity = trNum(m[3]);
    const unitPrice = trNum(m[5]);
    const netUnit = trNum(m[8]);
    const currency = CUR[m[9].toUpperCase()] || 'TRY';
    // İskonto: iki iskonto sütunu olabilir; en sağlamı net fiyattan hesaplamak
    let discount = unitPrice > 0 ? Math.round((1 - netUnit / unitPrice) * 10000) / 100 : trNum(m[6]);
    if (!(discount >= 0 && discount <= 100)) discount = trNum(m[6]) || 0;
    const net = quantity * unitPrice * (1 - discount / 100);
    items.push({
      id: `it-pdf-${Date.now()}-${no}`,
      productName: m[2].trim(),
      quantity,
      unit: UNIT[m[4].toLocaleUpperCase('tr').replace(/\.$/, '')] || 'Adet',
      unitPrice,
      discount,
      vatRate: 20,
      totalPrice: Math.round(net * 1.2 * 100) / 100,
      currency,
    });
  }
  items.sort((a, b) => Number(a.id.split('-').pop()) - Number(b.id.split('-').pop()));

  // Satır numaralarında boşluk varsa okunamayan satır var demektir
  const maxNo = Math.max(0, ...seen);
  if (maxNo > items.length) warnings.push(`${maxNo - items.length} kalem okunamadı`);
  if (!quoteNumber) warnings.push('Teklif no bulunamadı');
  if (!items.length) warnings.push('Kalem bulunamadı');

  let date: string | null = null;
  if (dateRaw) { const [d, mo, y] = dateRaw.split(/[./]/); date = `${y}-${mo}-${d}`; }
  let paymentTerm: string | null = null;
  if (vade) {
    const v = vade.toLocaleUpperCase('tr').replace(/\s+/g, ' ');
    const g = /(\d+)\s*G[ÜU]N/.exec(v);
    paymentTerm = g ? `${g[1]} GÜN` : v.startsWith('PE') ? 'PEŞİN' : 'KREDİ KARTI';
  }

  return {
    fileName,
    quoteNumber,
    customerName,
    city: cityRaw ? titleTr(cityRaw) : null,
    date,
    paymentTerm,
    preparedBy,
    items,
    totals,
    warnings,
  };
}

/** PDF dosyasını satırlara ayırır (aynı yükseklikteki metinler soldan sağa birleştirilir) */
export async function pdfLines(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
    for (const it of content.items as any[]) {
      const s = String(it.str ?? '');
      if (!s.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find(r => Math.abs(r.y - y) < 2.5);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, s });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) out.push(r.parts.sort((a, b) => a.x - b.x).map(p => p.s.trim()).join('  '));
  }
  return out;
}

export async function readQuotePdf(file: File): Promise<PdfQuote> {
  return parseQuoteLines(await pdfLines(await file.arrayBuffer()), file.name);
}

const GENERIC = new Set(['ltd', 'sti', 'san', 'tic', 'ins', 'insaat', 'taah', 'muh', 've', 'as', 'sirketi', 'limited', 'sanayi', 'ticaret',
  'imalat', 'tes', 'sihhi', 'muhendislik', 'enerji', 'yapi', 'mekanik', 'isi', 'dogal', 'gaz', 'dogalgaz']);
const toks = (s: string) => foldTr(s).split(/[^a-z0-9]+/).filter(t => t.length >= 3);

/** PDF'teki resmi unvanı ("MURAT DOĞAL GAZ SIHHİ TES…") sistemdeki kısa müşteri adına ("Murat Doğalgaz") eşler */
export function matchCustomer(pdfName: string, names: string[]): string | null {
  const flat = (s: string) => foldTr(s).replace(/[^a-z0-9]/g, '');
  const pf = flat(pdfName);
  const pt = toks(pdfName);
  let best: string | null = null, bestScore = 0;
  for (const n of names) {
    const nf = flat(n);
    let sc = 0;
    if (nf.length >= 5 && pf.startsWith(nf)) sc = 100 + nf.length;
    else {
      const nt = toks(n);
      const key = nt.filter(t => !GENERIC.has(t));
      if (!key.length) continue;
      // Ayırt edici kelimelerin hepsi unvanda geçmeli ("Tavsan Makine" ↔ "TAVSAN MAKİNE İMALAT…")
      const hit = (t: string) => pt.some(p => p.slice(0, 4) === t.slice(0, 4));
      if (!key.every(hit)) continue;
      sc = key.reduce((a, t) => a + t.length, 0) + nt.filter(hit).length;
      if (!hit(nt[0])) sc -= 5; // ilk kelime tutmuyorsa zayıf
    }
    if (sc > bestScore) { bestScore = sc; best = n; }
  }
  return bestScore >= 5 ? best : null;
}

export const titleTr = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/(^|[\s(/-])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('tr'));


/** Katalogda adı birebir aynı olan malzemenin kodunu bulur (yanlış kod yazmamak için sadece tam eşleşme) */
export async function catalogCode(name: string): Promise<string | undefined> {
  const norm = (s: string) => foldTr(s).replace(/\s+/g, ' ').trim();
  const target = norm(name);
  const words = target.split(' ').filter(w => w.length >= 3).sort((a, b) => b.length - a.length).slice(0, 3);
  if (!words.length) return undefined;
  try {
    const r = await searchMaterials(words.join(' '), { limit: 30, field: 'name' });
    return r.items.find(m => norm(m.name) === target)?.code;
  } catch {
    return undefined;
  }
}

