/**
 * Ücretsiz, cihaz üzerinde çalışan Türkçe komut çözücü.
 * Sesle söylenen cümleden teklif / tahsilat / harcama taslağı çıkarır (yapay zeka API'si gerekmez).
 * Çıktı, yapay zeka cevabıyla aynı yapıdadır (AiResult), böylece formlar aynı şekilde dolar.
 */
import type { AiContext, AiItem, AiResult } from './ai';
import type { Currency } from './money';
import { TURKISH_CITIES } from './cities';

// ---------- yardımcılar ----------
export const fold = (s: string) =>
  s.replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u')
    .replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c').toLowerCase();

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------- sayılar: "iki bin beş yüz", "500 bin", "2.500", "1,5", "bir buçuk" ----------
const ONES: Record<string, number> = {
  sifir: 0, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9,
  on: 10, yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90,
};
const MULT: Record<string, number> = { yuz: 100, bin: 1000, milyon: 1_000_000 };

/** "1.250,50" / "2500" / "1,5" → sayı */
function digitValue(tok: string): number | null {
  if (!/^\d[\d.,§¤]*$/.test(tok)) return null;
  let s = tok.replace(/§/g, '.').replace(/¤/g, ',');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Metindeki sayıları yazıyla ya da rakamla bulup tek tek döndürür.
 * Her sayı için başladığı / bittiği kelime sırası da verilir (yanındaki birimi bulmak için).
 */
export interface NumTok { value: number; start: number; end: number }
export function findNumbers(words: string[]): NumTok[] {
  const out: NumTok[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const d = digitValue(w);
    const isWord = w in ONES || w in MULT;
    if (d === null && !isWord) { i++; continue; }
    const start = i;
    let total = 0;     // tamamlanmış binlik gruplar
    let group = 0;     // içinde bulunulan grup (yüzler + onlar + birler)
    let any = false;
    while (i < words.length) {
      const t = words[i];
      const dv = digitValue(t);
      if (dv !== null) {
        if (any && group !== 0) break; // "5 10" iki ayrı sayı
        group += dv; any = true; i++; continue;
      }
      if (t in ONES) {
        const v = ONES[t];
        // "on beş" gibi: önceki kısım bu basamaktan küçükse yeni sayı başlar
        if (any && group % 100 !== 0 && (v >= 10 ? group % 100 >= 10 : group % 10 !== 0)) break;
        group += v; any = true; i++; continue;
      }
      if (t === 'yuz') { group = (group || 1) * 100; any = true; i++; continue; }
      if (t === 'bin' || t === 'milyon') {
        total += (group || 1) * MULT[t]; group = 0; any = true; i++; continue;
      }
      if (t === 'bucuk' && any) { group += 0.5; i++; continue; }
      break;
    }
    if (any) out.push({ value: total + group, start, end: i - 1 });
    else i++;
  }
  return out;
}

/**
 * Küçük harf + Türkçe harf sadeleştirme; sayı içindeki nokta/virgül korunur (§ = nokta, ¤ = virgül),
 * cümle virgülleri ayrı " , " işareti olarak kalır (kalemleri ayırmak için).
 */
const tokenize = (s: string) =>
  fold(s)
    .replace(/(\d)\.(?=\d)/g, '$1§').replace(/(\d),(?=\d)/g, '$1¤')
    .replace(/[,;]/g, ' , ')
    .replace(/[^\p{L}\p{N}§¤/%", ]+/gu, ' ')
    .split(/\s+/).filter(Boolean);

// ---------- tarih: "bugün", "dün", "31 ocak", "ayın sonu" ----------
const MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
function parseDate(f: string, today: Date, future: boolean): string | null {
  if (/\bevvelsi gun\b|\bonceki gun\b/.test(f)) { const d = new Date(today); d.setDate(d.getDate() - 2); return ymd(d); }
  if (/\bdun\b/.test(f)) { const d = new Date(today); d.setDate(d.getDate() - 1); return ymd(d); }
  if (/\byarin\b/.test(f)) { const d = new Date(today); d.setDate(d.getDate() + 1); return ymd(d); }
  if (/\bbugun\b/.test(f)) return ymd(today);
  const m = f.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS.join('|')})\\w*(?:\\s+(\\d{4}))?`));
  if (m) {
    const day = +m[1], mon = MONTHS.indexOf(m[2]);
    let year = m[3] ? +m[3] : today.getFullYear();
    if (!m[3]) {
      const cand = new Date(year, mon, day);
      if (future && cand < new Date(today.getFullYear(), today.getMonth(), today.getDate())) year++;
      if (!future && cand > today) year--;
    }
    return ymd(new Date(year, mon, day));
  }
  const n = f.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/);
  if (n) { const y = +n[3] < 100 ? 2000 + +n[3] : +n[3]; return ymd(new Date(y, +n[2] - 1, +n[1])); }
  if (/\bay(in)? sonu/.test(f)) return ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  return null;
}

// ---------- para ----------
function currencyOf(f: string): Currency | null {
  if (/\b(dolar|usd)\b/.test(f)) return 'USD';
  if (/\b(euro|avro|yuro|eur)\b/.test(f)) return 'EUR';
  if (/\b(lira|tl|turk lirasi)\b/.test(f)) return 'TRY';
  return null;
}
/** En büyük tutarı (genelde asıl tutar) bulur */
function amountOf(f: string): number | null {
  const nums = findNumbers(f.split(' ')).map(n => n.value).filter(v => v > 0);
  return nums.length ? Math.max(...nums) : null;
}

// ---------- müşteri eşleştirme ----------
const GENERIC = new Set(['enerji', 'mekanik', 'insaat', 'yapi', 'ltd', 'sti', 'muhendislik', 'dogalgaz', 'isi', 'iklimlendirme',
  'ticaret', 'san', 'tic', 'as', 've', 'sistemleri', 'tesisat', 'makina', 'makine', 'kardesler', 'grup', 'group', 'teknik', 'tesisati']);
// Şehir adları müşteri adında geçse de ("Özcan Isı (Isparta)") eşleşme için zayıf sayılır
const CITY_KEYS = new Set(TURKISH_CITIES.map(c => fold(c)));
const cityCase = (folded: string) =>
  TURKISH_CITIES.find(c => fold(c) === folded) || folded.replace(/(^|[\s-])\p{L}/gu, ch => ch.toLocaleUpperCase('tr'));

/** İki kelime arasındaki harf farkı küçük mü (4-6 harfte 1, daha uzunda 2) */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  const max = b.length >= 7 ? 2 : 1;
  if (Math.abs(a.length - b.length) > max) return false;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length] <= max;
}

function matchCustomer(f: string, customers: string[]): { name: string; tokens: string[] } | null {
  const words = f.split(' ').filter(w => w.length >= 4);
  let best: { name: string; score: number; tokens: string[] } | null = null;
  for (const name of customers) {
    const toks = fold(name).split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 3);
    let score = 0, strong = false;
    const hit: string[] = [];
    for (const t of toks) {
      const weak = GENERIC.has(t) || CITY_KEYS.has(t);
      // Ek almış hâlleri de yakala: "enorpaya", "mekanikten"
      if (new RegExp(`\\b${t}`).test(f)) {
        hit.push(t);
        if (weak) score += 0.3; else { score += t.length; strong = true; }
      } else if (!weak && t.length >= 5) {
        // Ses tanıma bir-iki harfi yanlış duyabilir ("Muslu" → "mutlu"); ilk harf aynı olmalı
        const w = words.find(x => x[0] === t[0] && x.length >= t.length && near(x.slice(0, t.length), t));
        if (w) { hit.push(w); score += t.length * 0.8; strong = true; }
      }
    }
    if (strong && (!best || score > best.score)) best = { name, score, tokens: hit };
  }
  return best ? { name: best.name, tokens: best.tokens } : null;
}

// ---------- teklif kalemleri ----------
const UNIT_WORDS: Record<string, string> = {
  adet: 'Adet', tane: 'Adet', metre: 'Metre', mt: 'Metre', takim: 'Takım', paket: 'Paket', kg: 'Kg', kilo: 'Kg', set: 'Set',
};
// "yarım parmak" → 1/2 gibi tesisatçı ölçüleri
const SIZE_PHRASES: [RegExp, string][] = [
  [/\bbir bucuk parmak\b|\bbir bucuk inc\w*\b/g, '1 1/2'],
  [/\biki bucuk parmak\b|\biki bucuk inc\w*\b/g, '2 1/2'],
  [/\bbir ceyrek parmak\b|\bbir ceyrek\b/g, '1 1/4'],
  [/\buc ceyrek parmak\b|\buc ceyrek\b/g, '3/4'],
  [/\byarim parmak\b|\byarim inc\w*\b|\byarim\b/g, '1/2'],
  [/\bbir parmak\b/g, '1'],
  [/\biki parmak\b/g, '2'],
  [/\buc parmak\b/g, '3'],
  [/\bdort parmak\b/g, '4'],
];
const STOP = new Set(['icin', 'olarak', 've', 'ile', 'bir', 'de', 'da', 'teklif', 'hazirla', 'tane', 'adet', 'iskonto', 'iskontolu',
  'yuzde', 'fiyat', 'fiyati', 'lira', 'liradan', 'tl', 'dolar', 'dolardan', 'euro', 'eurodan', 'olsun', 'ekle', 'artı', 'arti']);

function parseItem(seg: string): AiItem | null {
  // "20'lik boru" → "20 boru" (ölçü olarak kalsın)
  let s = seg.replace(/(\d)\s*(?:lik|luk|lük|lık)\b/g, '$1');
  for (const [re, rep] of SIZE_PHRASES) s = s.replace(re, rep);
  const words = s.split(' ').filter(Boolean);
  let discount: number | null = null;
  const dm = s.match(/(?:yuzde|%)\s*([\p{L}\p{N},.]+(?:\s+[\p{L}]+)?)/u);
  if (dm) {
    const n = findNumbers(dm[1].split(' '))[0];
    if (n) discount = n.value;
  }
  // Fiyat: "x liradan", "fiyatı x lira"
  let unitPrice: number | null = null;
  const pm = s.match(/(?:fiyati\s+)?([\p{L}\p{N},.\s]+?)\s+(lira|liradan|tl|dolar|dolardan|euro|eurodan)\b/u);
  if (pm && /fiyat|dan\b|den\b/.test(s)) {
    const n = findNumbers(pm[1].trim().split(' ')).pop();
    if (n) unitPrice = n.value;
  }
  const currency = currencyOf(s);

  // Miktar: ilk sayı (yanında birim kelimesi varsa birim de)
  let quantity: number | null = null;
  let unit: string | null = null;
  const nums = findNumbers(words);
  const sizeIdx = new Set<number>();
  words.forEach((w, i) => { if (/\//.test(w)) sizeIdx.add(i); });
  for (const n of nums) {
    const next = words[n.end + 1];
    if (next && UNIT_WORDS[next]) { quantity = n.value; unit = UNIT_WORDS[next]; break; }
  }
  if (quantity === null && nums.length) {
    const first = nums[0];
    const next = words[first.end + 1];
    // ölçü değilse (ör. "20 lik boru" değil) ilk sayıyı miktar say
    if (!(next && /^(lik|luk|lük|lık)$/.test(next)) && first.start === 0) quantity = first.value;
  }

  // Malzeme sorgusu: sayılar, birim, iskonto, fiyat ve dolgu kelimeleri çıkarılır; ölçüler (1/2) kalır
  const drop = new Set<number>();
  for (const n of nums) {
    const isQty = quantity !== null && n.value === quantity && (n.start === 0 || UNIT_WORDS[words[n.end + 1]]);
    const isDisc = discount !== null && n.value === discount && /yuzde|%/.test(words.slice(Math.max(0, n.start - 2), n.start).join(' '));
    const isPrice = unitPrice !== null && n.value === unitPrice;
    if (isQty || isDisc || isPrice) for (let k = n.start; k <= n.end; k++) drop.add(k);
  }
  const queryWords = words.filter((w, i) => !drop.has(i) && !STOP.has(w) && !UNIT_WORDS[w] && w !== 'parmak' && w !== '%');
  const query = queryWords.join(' ').trim();
  if (!query) return null;
  return { query, code: null, quantity, unit, unitPrice, currency, discount };
}

function parseQuote(f: string, ctx: AiContext): AiResult {
  const cust = matchCustomer(f, ctx.customers);
  let paymentTerm: string | null = null;
  if (/\bpesin\b/.test(f)) paymentTerm = 'PEŞİN';
  else if (/kredi kart/.test(f)) paymentTerm = 'KREDİ KARTI';
  else if (/\b(60|altmis) gun/.test(f)) paymentTerm = '60 GÜN';
  else if (/\b(90|doksan) gun/.test(f)) paymentTerm = '90 GÜN';

  // Müşteri adını, "için teklif" gibi kalıpları ve vade cümlesini çıkar, kalanı kalemlere böl
  let body = f;
  if (cust) for (const t of cust.tokens) body = body.replace(new RegExp(`\\b${t}\\w*`, 'g'), ' ');
  body = body
    .replace(/\b(vade(si)?|odeme(si)?)\b[^,;]*/g, ' ')
    .replace(/\b(pesin|kredi karti ile|kredi kartiyla|(60|90|altmis|doksan) gun(luk)?)\b/g, ' ')
    .replace(/\b(icin|teklif(i)?|hazirla(r misin)?|yaz|olustur|ver)\b/g, ' ');
  const segments = body.split(/\s*(?:,|\bve\b|\barti\b|\bbir de\b|\bayrica\b|\bsonra\b)\s*/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const items: AiItem[] = [];
  let globalDiscount: number | null = null;
  for (const seg of segments) {
    const onlyDiscount = /^(?:hepsine |tumune |toplam |genel )?(?:yuzde|%)\s*[\p{L}\p{N}\s]+(?:iskonto(lu)?)?$/u.test(seg);
    if (onlyDiscount) { const n = findNumbers(seg.split(' '))[0]; if (n) globalDiscount = n.value; continue; }
    const it = parseItem(seg);
    if (it) items.push(it);
  }
  if (globalDiscount !== null) items.forEach(it => { if (it.discount === null) it.discount = globalDiscount; });

  const who = cust?.name || 'müşteri';
  return {
    intent: 'quote',
    reply: items.length
      ? `${who} için ${items.length} kalemli teklif hazırladım, kontrol edip kaydedin.`
      : `${who} için teklif formunu açtım, malzemeleri ekleyin.`,
    quote: { customerName: cust?.name || null, city: null, paymentTerm, notes: null, items },
    collection: null, expense: null,
  };
}

const COLLECTION_METHOD: [RegExp, string][] = [
  [/\bcek\w*/, 'Çek'], [/\bsenet\w*/, 'Senet'], [/\b(havale|eft)\w*/, 'Havale/EFT'], [/kredi kart/, 'Kredi Kartı'], [/\bnakit\w*/, 'Nakit'],
];

function parseCollection(f: string, ctx: AiContext, today: Date): AiResult {
  const cust = matchCustomer(f, ctx.customers);
  const method = COLLECTION_METHOD.find(([re]) => re.test(f))?.[1] || null;
  const bank = ctx.banks.find(b => {
    const k = fold(b).split(' ')[0];
    return k.length >= 3 && new RegExp(`\\b${k}`).test(f);
  }) || null;
  const br = f.match(/\b([\p{L}]+(?:-[\p{L}]+)?)\s+subesi\b/u);
  const bankBranch = br ? `${br[1].split('-').map(cityCase).join('-')} Şubesi` : null;
  const cn = f.match(/\b(?:cek|senet)?\s*(?:no|numara(?:si)?)\s*(\d{3,})/);
  // Vade: "vadesi ..." kısmındaki tarih; tahsilat tarihi: cümlenin geri kalanından
  const vm = f.match(/\bvade\w*\s+(.*)$/);
  const dueDate = vm ? parseDate(vm[1], today, true) : null;
  const date = parseDate(vm ? f.slice(0, vm.index) : f, today, false) || ymd(today);
  // Tutarı vade / çek no kısmındaki sayılardan ayır
  const amountText = f.replace(/\bvade\w*\s+.*$/, ' ').replace(/\b(?:no|numara(?:si)?)\s*\d+/, ' ');
  const amount = amountOf(amountText);
  return {
    intent: 'collection',
    reply: `${cust?.name || 'Müşteri'} için ${amount ? amount.toLocaleString('tr-TR') + ' ' : ''}tahsilat formunu hazırladım, kontrol edip kaydedin.`,
    quote: null,
    collection: {
      customerName: cust?.name || null, amount, currency: currencyOf(f), method, date,
      bankName: method === 'Çek' || method === 'Senet' ? bank : null,
      bankBranch: method === 'Çek' || method === 'Senet' ? bankBranch : null,
      checkNo: cn ? cn[1] : null, dueDate, description: null,
    },
    expense: null,
  };
}

// Harcama kategorisi için anahtar kelimeler (kategori adlarının kendisi de aranır)
const CATEGORY_HINTS: [RegExp, string][] = [
  [/\b(yakit|mazot|motorin|benzin|dizel|akaryakit|lpg)\b/, 'Yakıt'],
  [/\b(yemek|ogle yemegi|aksam yemegi|kahvalti|lokanta|restoran)\b/, 'Yemek'],
  [/\b(otel|konaklama|pansiyon)\b/, 'Konaklama'],
  [/\badblue\b|\bad blue\b/, 'AdBlue'],
  [/\b(otopark|park ucreti)\b/, 'Otopark'],
  [/\b(ikram|ikramlik|cay|kahve)\b/, 'İkramlık'],
  [/\b(bakim|servis|lastik|yag degisimi|tamir)\b/, 'Araç Bakım'],
  [/\b(otoyol|kopru|hgs|ogs|bilet|taksi|ucak|otobus)\b/, 'Ulaşım'],
  [/\b(kargo|nakliye)\b/, 'Kargo/Nakliye'],
  [/\b(ceza|trafik cezasi)\b/, 'Trafik Cezası'],
  [/\b(telefon|internet|fatura)\b/, 'Telefon/İnternet'],
  [/\b(malzeme)\b/, 'Malzeme'],
];
const EXPENSE_METHOD: [RegExp, string][] = [
  [/kredi kart/, 'Kredi Kartı'], [/\butts\b/, 'UTTS'], [/\bsahsi\b|\bkendi param/, 'Şahsi'],
  [/\bsirket\b/, 'Şirket'], [/\bnakit\b/, 'Nakit'], [/\b(havale|eft)\b/, 'Havale/EFT'],
];

function parseExpense(f: string, ctx: AiContext, today: Date): AiResult {
  const byName = ctx.expenseCategories.find(c => new RegExp(`\\b${fold(c).split(/[/ ]/)[0]}`).test(f));
  const category = byName || CATEGORY_HINTS.find(([re]) => re.test(f))?.[1] || null;
  const mKey = EXPENSE_METHOD.find(([re]) => re.test(f))?.[1] || null;
  // Listedeki tam adı kullan ("Kredi Kartı **9973" gibi)
  const method = mKey ? (ctx.expenseMethods.find(m => fold(m).startsWith(fold(mKey))) || mKey) : null;
  const region = ctx.regions.find(r => {
    const k = fold(r).split(' ')[0];
    return k.length >= 3 && new RegExp(`\\b${k}\\w*\\s+bolge`).test(f);
  }) || (() => {
    const m = f.match(/\b([\p{L}]+)\s+bolge\w*/u);
    return m ? `${m[1].toLocaleUpperCase('tr')} BÖLGE` : null;
  })();
  const amount = amountOf(f);
  return {
    intent: 'expense',
    reply: `${amount ? amount.toLocaleString('tr-TR') + ' ' : ''}${category ? category.toLocaleLowerCase('tr') + ' ' : ''}harcama formunu hazırladım, kontrol edip kaydedin.`,
    quote: null, collection: null,
    expense: { category, amount, currency: currencyOf(f), method, region, date: parseDate(f, today, false) || ymd(today), description: null },
  };
}

/** Ana giriş: konuşma metni → taslak */
export function parseLocally(text: string, ctx: AiContext, today = new Date()): AiResult {
  const f = tokenize(text).join(' ');
  const r = parseIntent(f, ctx, today);
  // Katalogda bulunamayan kalemler için söylenen kelimeleri Türkçe harfleriyle geri koy
  if (r.quote) {
    const orig = new Map<string, string>();
    for (const w of text.split(/[^\p{L}\p{N}/]+/u)) if (w) orig.set(fold(w), w.toLocaleUpperCase('tr'));
    r.quote.items.forEach(it => { it.label = it.query.split(' ').map(w => orig.get(w) || w.toLocaleUpperCase('tr')).join(' '); });
  }
  return r;
}

function parseIntent(f: string, ctx: AiContext, today: Date): AiResult {
  if (/\bteklif/.test(f)) return parseQuote(f, ctx);
  const cust = matchCustomer(f, ctx.customers);
  const collectionWords = /\b(tahsilat|tahsil|cek|senet|havale|eft)\w*/.test(f);
  if (/\b(harcama|masraf|odedim|harcadim)\b/.test(f) || (!cust && CATEGORY_HINTS.some(([re]) => re.test(f)))) {
    return parseExpense(f, ctx, today);
  }
  if (collectionWords || (cust && /\b(aldim|alindi|odedi|yatirdi|gonderdi)\b/.test(f))) return parseCollection(f, ctx, today);
  if (CATEGORY_HINTS.some(([re]) => re.test(f))) return parseExpense(f, ctx, today);
  if (cust) return parseQuote(f, ctx);
  return {
    intent: 'unknown',
    reply: 'Anlayamadım. Cümleye "teklif", "tahsilat" ya da "harcama" kelimesini ekleyip tekrar söyleyin.',
    quote: null, collection: null, expense: null,
  };
}

// ---------- ses tanıma sonuçlarını birleştirme ----------
const normT = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
/**
 * Ses tanıma sonuçlarını tek metne çevirir. Bir parça öncekinin devamıysa (Android'deki birikimli sonuçlar)
 * öncekinin yerine geçer, zaten içerdiyse atlanır, yeni bir parçaysa eklenir.
 */
export function mergeTranscripts(parts: string[]): string {
  let acc = '';
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    const a = normT(acc), n = normT(t);
    if (!a || n.startsWith(a)) acc = t;
    else if (a.endsWith(n) || a.includes(n)) continue;
    else acc = `${acc} ${t}`;
  }
  return acc;
}

