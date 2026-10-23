/**
 * Fiş / fatura fotoğrafından harcama: cihazda yazı tanıma (tesseract) + kurallarla
 * toplam tutar, tarih, harcama türü ve işletme adı çıkarılır. İnternet gerekmez (dil dosyası ilk seferde iner).
 */
import { TURKISH_CITIES } from './cities';

export interface ReceiptDraft { amount: number; date?: string; category?: string; description?: string; method?: string; region?: string; text: string }

const fold = (s: string) =>
  s.replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u')
    .replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c').toLowerCase();

/** "1.234,56" / "1234.56" / "1 234,56" → sayı */
const num = (s: string) => {
  const t = s.replace(/[\s*]/g, '');
  const m = /^(\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m) return NaN;
  return Number(m[1].replace(/[.,]/g, '') + (m[2] ? '.' + m[2] : ''));
};

const CATS: [string, RegExp][] = [
  ['Adblue', /adblue|ad blue/],
  ['Yakıt', /motorin|benzin|akaryakit|euro ?diesel|diesel|lpg|opet|shell|petrol ofisi|aytemiz|total ?energies|\bbp\b|\bpo\b|kursun?suz|v\/max|ultra ?force/],
  ['Konaklama', /otel|hotel|konaklama|pansiyon|apart/],
  ['Yemek', /restoran|restaurant|lokanta|kebap|kebab|pide|doner|corba|cafe|kafe|yemek|ocakbasi|kofte|burger|pizza|tantuni|etli ekmek/],
  ['İkramlık', /market|bufe|cay|kahve|su |simit|pasta|tatli|kuruyemis|migros|bim|a101|sok market|carrefour/],
];

export function parseReceipt(text: string, methods: string[] = []): ReceiptDraft {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const f = fold(text);

  // Toplam: "TOPLAM", "GENEL TOPLAM", "TUTAR", "ÖDENECEK" satırındaki en büyük sayı; yoksa fişteki en büyük * işaretli tutar
  let amount = 0;
  const money = /\*?\s?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})\b/g;
  for (const l of lines) {
    const fl = fold(l);
    if (!/toplam|tutar|odenecek|total|nakit|kredi kart/.test(fl) || /kdv|topkdv|ara ?toplam|indirim/.test(fl)) continue;
    for (const m of l.matchAll(money)) { const v = num(m[1]); if (v > amount && v < 1e7) amount = v; }
  }
  if (!amount) {
    for (const l of lines) for (const m of l.matchAll(/\*\s?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/g)) { const v = num(m[1]); if (v > amount && v < 1e7) amount = v; }
  }

  // Tarih: 23.10.2026 / 23-10-2026 / 23/10/26
  let date: string | undefined;
  const dm = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/.exec(text);
  if (dm) {
    const y = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]);
    const mo = Number(dm[2]), d = Number(dm[1]);
    if (y >= 2020 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const category = CATS.find(([, re]) => re.test(f))?.[0] || undefined;

  // İşletme adı: ilk anlamlı satır (harf ağırlıklı, 4+ karakter)
  const merchant = lines.find(l => /[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(l) && !/fis|fiş|tarih|saat|vergi|v\.d|vkn|tckn|no:/i.test(l) && l.length >= 4)?.slice(0, 60);

  // Ödeme şekli: UTTS / taşıt tanıma ya da kartın son 4 hanesi
  let method: string | undefined;
  if (/utts|tasit tanima/.test(f)) method = methods.find(m => /utts/i.test(m));
  if (!method) {
    const last4 = /\*{2,}\s?(\d{4})\b/.exec(text)?.[1];
    if (last4) method = methods.find(m => m.includes(last4));
  }

  // Şehir: fişte geçen il adı
  const region = TURKISH_CITIES.find(c => new RegExp(`\\b${fold(c)}\\b`).test(f));

  return { amount, date, category, description: merchant, method, region, text };
}

/** Fotoğraftaki yazıyı okur (tesseract, Türkçe) */
export async function readReceiptImage(file: File, onInfo?: (s: string) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  onInfo?.('yazı tanıma hazırlanıyor…');
  const worker = await createWorker('tur');
  try {
    onInfo?.('fiş okunuyor…');
    const { data } = await worker.recognize(file);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}
