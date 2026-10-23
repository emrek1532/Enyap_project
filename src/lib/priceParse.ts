/**
 * Firma fiyat listesi PDF yazısını kalemlere ayırır (kod, ürün adı, fiyat).
 * Firma firma ayrı kural yazmadan çalışan genel kurallar: fiyat satırın sonundaki ondalıklı sayıdır,
 * kod ürün adından önce/sonra gelen rakamlı kısa kelimedir. Yapay zeka ya da dış servis gerekmez.
 */
import { Currency } from './money';

export interface ParsedItem { code: string; name: string; price: number; unit: string; grp?: string; currency?: Currency }

// 1.234,56 · 1234,56 · 1,234.56 · 1234.56 (en az 2 ondalık hane)
const PRICE = /(\d{1,3}(?:[.\s]\d{3})+,\d{2,4}|\d+,\d{2,4}|\d{1,3}(?:,\d{3})+\.\d{2,4}|\d+\.\d{2,4})/g;
const CUR_TOKEN = /\s*(?:€|\$|₺|TL|TRY|EUR|EURO|USD)\b\.?/gi;
const MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const HEADER = /(fiyat\s*listesi|liste\s*fiyat|birim\s*fiyat|ürün\s*kodu|stok\s*kodu|açıklama|sayfa\s*\d|www\.|tel\s*:|fax|e-?posta|@)/i;

export function parseNumber(s: string): number {
  const t = s.replace(/\s/g, '');
  // Türkçe binlik ayraçlı tam sayı: "1.250" → 1250, "12.500.000" → 12500000
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  const n = lastComma > lastDot
    ? Number(t.replace(/\./g, '').replace(',', '.'))
    : Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Rakam içeren, harf/rakam/-./ dan oluşan kısa kelime: ürün kodu adayı (1/2" gibi ölçüler hariç) */
const isCode = (w: string) =>
  /^[A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜa-zçğıöşü0-9.\-/_]{3,24}$/.test(w) && /\d/.test(w) && /[A-ZÇĞİÖŞÜa-zçğıöşü]|\d{4,}|-/.test(w)
  && !/^\d+\/\d+$/.test(w) && !/["”]/.test(w) && !/^\d+(cm|mm|m|lt|kg|w|kw|bar)$/i.test(w);

/** Bir parça metinden (fiyatı çıkarılmış) kod ve adı ayırır */
function splitCodeName(text: string): { code: string; name: string } | null {
  const words = text.replace(CUR_TOKEN, ' ').replace(/\s+/g, ' ').trim().split(' ')
    .filter(w => w && /[A-Za-zÇĞİÖŞÜçğıöşü0-9"”]/.test(w));
  // Sondaki birim kelimeleri (Adet, Mt, Takım…) addan atılır
  while (words.length > 1 && /^(adet|ad\.?|mt|metre|m|takım|tk|pk|paket|kutu|koli|set)$/i.test(words[words.length - 1])) words.pop();
  let code = '';
  if (words.length > 1 && isCode(words[0])) code = words.shift()!;
  else if (words.length > 1 && isCode(words[words.length - 1])) code = words.pop()!;
  // Adın sonundaki tek başına sayılar (koli adedi vb.) ve işaretler atılır
  while (words.length > 1 && /^(\d+|[*&©#%+\-–—])$/.test(words[words.length - 1]) && !/^[x*×]$/i.test(words[words.length - 2] || '')) words.pop();
  const name = words.join(' ').replace(/^[\s\-–—:.,;*]+|[\s\-–—:.,;*]+$/g, '');
  if (name.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length < 3) return null;
  return { code, name: name.slice(0, 200) };
}

function parseFreeLines(lines: string[]): ParsedItem[] {
  const out: ParsedItem[] = [];
  const seen = new Set<string>();
  // Bölüm başlığı (ör. "OCAK FLEXLERİ"): fiyatsız, kısa, büyük harfli satır; altındaki kalemlerin adına eklenir
  let heading = '';
  for (const raw of lines) {
    const line = raw.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (line.length < 6 || !/[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(line) || HEADER.test(line)) continue;
    const prices = [...line.matchAll(PRICE)];
    if (!prices.length) {
      const letters = line.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
      if (letters.length >= 5 && line.split(' ').length <= 6 && letters === letters.toLocaleUpperCase('tr') && !/\d{3,}/.test(line)) heading = line;
      continue;
    }
    const unit = /\b(mt|metre|m\/tül|mtül)\b/i.test(line) ? 'Metre' : 'Adet';
    // Satır fiyatlardan bölünür: her fiyatın önündeki metin bir kalemdir. İki fiyat arasında yazı yoksa
    // ikinci fiyat aynı kalemin başka sütunudur (iskontolu/KDV'li) ve atlanır. İki sütunlu listeler de böyle okunur.
    let from = 0;
    for (const pm of prices) {
      const seg = line.slice(from, pm.index);
      from = (pm.index || 0) + pm[1].length;
      const cn = splitCodeName(seg);
      if (!cn) continue;
      const price = parseNumber(pm[1]);
      if (!(price > 0) || price > 10_000_000) continue;
      const key = `${cn.code}|${cn.name}|${price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Fiyatın hemen yanındaki para birimi işareti (aynı listede $, €, TL karışık olabilir)
      const after = line.slice((pm.index || 0) + pm[1].length, (pm.index || 0) + pm[1].length + 6);
      const before = line.slice(Math.max(0, (pm.index || 0) - 3), pm.index);
      const sym = `${before} ${after}`;
      const currency: Currency | undefined = /\$|USD/i.test(sym) ? 'USD' : /€|EUR/i.test(sym) ? 'EUR' : /₺|TL|TRY/i.test(sym) ? 'TRY' : undefined;
      out.push({ ...cn, grp: heading || undefined, price: Math.round(price * 10000) / 10000, unit, currency });
    }
  }
  return out;
}

/**
 * "KOD · ÖLÇÜ · K.ADEDİ · FİYAT" başlıklı tablo düzeni (ör. Adasan): kalem satırında ürün adı yazmaz, ürün adı
 * tablonun üstündeki grup başlığıdır. Kalem adı = grup başlığı + ölçü (+ özellik). Koli adedi atlanır.
 */
// Başlıkta ürün adı sütunu (Ürün / Açıklama / Adı) olan tablolar genel kurallarla okunur
const KOD_HEADER = /^KOD\b(?!.*(ÜRÜN|ürün|Ürün|AÇIKLAMA|Açıklama|açıklama|ADI|Adı|CİNSİ|Cinsi|MALZEME|Malzeme)).*\bF[İIi]YAT/i;
export function parseKodTables(lines: string[]): ParsedItem[] {
  const out: ParsedItem[] = [];
  let group = '', pendingGroup = '', inTable = false, hasQty = false;
  for (const raw of lines) {
    const line = raw.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (KOD_HEADER.test(line)) {
      inTable = true;
      hasQty = /AD(ED[İI]|ET)/i.test(line);
      if (pendingGroup) group = pendingGroup;
      pendingGroup = '';
      continue;
    }
    const toks = line.replace(CUR_TOKEN, ' ').trim().split(' ');
    const priceTok = toks[toks.length - 1] || '';
    const isItem = toks.length >= 2 && /^\d{3,6}[A-Z]?$/.test(toks[0]) && /^(\d{1,3}(\.\d{3})*|\d+),\d{2}$/.test(priceTok);
    if (inTable && isItem) {
      const mid = toks.slice(1, -1);
      if (hasQty && mid.length > 1 && /^(\d+|-)$/.test(mid[mid.length - 1])) mid.pop();
      const size = mid.join(' ');
      const price = parseNumber(priceTok);
      if (!(price > 0)) continue;
      const name = [group, size].filter(Boolean).join(' ').trim();
      if (name.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length < 3) continue;
      out.push({ code: toks[0], name: name.slice(0, 200), grp: group || undefined, price, unit: 'Adet', currency: /\$|USD/.test(line) ? 'USD' : /€|EUR/.test(line) ? 'EUR' : /₺|TL/.test(line) ? 'TRY' : undefined });
      continue;
    }
    // Fiyatsız, harfli satır: bir sonraki tablonun grup başlığı
    if (!/\d+,\d{2}/.test(line) && /[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(line) && line.length <= 80) {
      pendingGroup = pendingGroup && !inTable ? `${pendingGroup} ${line}` : line;
      inTable = false;
    }
  }
  return out;
}

export function parsePriceLines(lines: string[]): ParsedItem[] {
  // "KOD … FİYAT" başlıklı tablolar varsa önce o düzen denenir
  if (lines.filter(l => KOD_HEADER.test(l.trim())).length >= 2) {
    const t = parseKodTables(lines);
    if (t.length >= 3) return t;
  }
  return parseFreeLines(lines);
}

/** Yazıda en çok geçen para birimi */
export function detectCurrency(text: string): Currency {
  const c = (re: RegExp) => (text.match(re) || []).length;
  const eur = c(/€|\bEUR(O)?\b/gi), usd = c(/\$|\bUSD\b/gi), tl = c(/₺|\bTL\b|\bTRY\b/gi);
  if (eur > usd && eur > tl) return 'EUR';
  if (usd > eur && usd > tl) return 'USD';
  return 'TRY';
}

/** Dosya adından firma adı ve liste tarihi: "FAF NİSAN 2026 FİYAT LİSTESİ.pdf" → FAF · Nisan 2026 */
export function guessListInfo(fileName: string): { name: string; listDate: string } {
  // "Şubat2026" gibi bitişik yazılan ay ve yıl ayrılır
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-]+/g, ' ').replace(/([A-Za-zÇĞİÖŞÜçğıöşü])(20\d\d)/g, '$1 $2').replace(/\s+/g, ' ').trim();
  const low = base.toLocaleLowerCase('tr');
  const fold = (s: string) => s.replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
  // Tarih yazılmışsa (01.01.2026): ay ve yıl oradan, kelime olarak ay adı varsa o öncelikli
  const dm = /\b(\d{1,2})[./](\d{1,2})[./](20\d\d)\b/.exec(base);
  const year = /\b(20\d\d)\b/.exec(base)?.[1] || dm?.[3] || '';
  const words = fold(low).split(' ');
  let mi = MONTHS.findIndex(m => words.includes(fold(m)));
  if (mi < 0 && dm && Number(dm[2]) >= 1 && Number(dm[2]) <= 12) mi = Number(dm[2]) - 1;
  const month = mi >= 0 ? MONTHS[mi][0].toLocaleUpperCase('tr') + MONTHS[mi].slice(1) : '';
  const name = base
    .split(' ')
    .filter(w => {
      const f = fold(w.toLocaleLowerCase('tr'));
      return f && !/^20\d\d$/.test(w) && !/^\d{1,2}[./]\d{1,2}[./]20\d\d$/.test(w) && !MONTHS.some(m => fold(m) === f)
        && !['fiyat', 'fiyatlari', 'liste', 'listesi', 'price', 'list', 'guncel', 'yeni', 'v', 'tl', 'euro', 'eur', 'usd', 'iskontolu'].includes(f);
    })
    .join(' ')
    .trim() || base;
  return { name: name.slice(0, 40), listDate: [month, year].filter(Boolean).join(' ') };
}

/** Liste kimliği: firma adı + tarih (aynı firmanın eski ve yeni listesi ayrı durur, aynı liste tekrar yüklenince üzerine yazılır) */
export function listIdFor(name: string, listDate: string): string {
  const slug = (s: string) => s.toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [slug(name), slug(listDate)].filter(Boolean).join('-') || `liste-${Date.now()}`;
}
