import { Quote, QuoteItem, QuoteStatus } from '../types';
import { foldTr, splitSizes } from './materials';
import { dayOf } from './dates';

/**
 * "Tekliflere sor" için soruyu cihazda anlama (yapay zekâsız):
 * tarih aralığı (bu ay, geçen ay, son 3 ay, 2025, mart...), durum (onaylanan, bekleyen, iptal)
 * ve soru türü (kaç teklif, toplam, kaç adet, en son / en ucuz / en pahalı fiyat).
 * Sayı soruları cihazda hesaplanır; yalnız serbest sorular yapay zekâya gider.
 */

export type AskKind = 'count' | 'total' | 'qty' | 'last' | 'min' | 'max' | null;

export type AskFilter = {
  from?: string;   // yyyy-aa-gg (dahil)
  to?: string;     // yyyy-aa-gg (dahil)
  period?: string; // ekranda gösterilen ad: "Ekim 2026", "son 3 ay"
  status?: QuoteStatus;
  kind: AskKind;
  rest: string;    // tarih/durum kelimeleri çıkarılmış soru (ürün/firma araması için)
};

export type AskLine = { quote: Quote; item: QuoteItem };

export type AskResult = {
  filter: AskFilter;
  customer?: string;   // soruda geçen firma (en çok eşleşen)
  quotes: Quote[];     // süzgeçten geçen teklifler (en yeni önce)
  lines: AskLine[];    // ilgili teklif satırları (en ilgili, sonra en yeni önce)
  productSearch: boolean; // soruda ürün/ölçü araması var mı
};

const AYLAR = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const SAYI: Record<string, number> = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, oniki: 12 };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monthRange = (y: number, m: number) => ({ from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) });

/** Sorudaki tarih, durum ve soru türünü bulur; bulunan kelimeler sorudan çıkarılır */
export function parseAsk(question: string, now = new Date(), customers: string[] = []): AskFilter {
  // Kesme işaretinden sonraki ek atılır: "Gemfa'ya" → "Gemfa", "2025'te" → "2025"
  let s = ` ${foldTr(question).replace(/([\p{L}\d])['’](\p{L}+)/gu, '$1').replace(/[?!,;:()]/g, ' ')} `;
  const out: AskFilter = { kind: null, rest: '' };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const set = (from: Date | string, to: Date | string, period: string) => {
    out.from = typeof from === 'string' ? from : ymd(from);
    out.to = typeof to === 'string' ? to : ymd(to);
    out.period = period;
  };

  // ---- Tarih ----
  const num = (w: string) => (/^\d+$/.test(w) ? Number(w) : SAYI[w] || 0);
  let m: RegExpMatchArray | null;
  if ((m = s.match(/\s(?:son|gecen|gectigimiz)\s+(\d+|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on|oniki)\s+(gun|hafta|ay|yil|sene)\w*/)) && num(m[1])) {
    const n = num(m[1]), u = m[2];
    const from = u === 'gun' ? addDays(today, -n + 1) : u === 'hafta' ? addDays(today, -7 * n + 1)
      : u === 'ay' ? new Date(today.getFullYear(), today.getMonth() - n, today.getDate() + 1)
      : new Date(today.getFullYear() - n, today.getMonth(), today.getDate() + 1);
    set(from, today, `son ${n} ${u === 'sene' ? 'yıl' : u === 'gun' ? 'gün' : u === 'yil' ? 'yıl' : u}`);
    s = s.replace(m[0], ' ');
  } else if ((m = s.match(/\sbugun\w*/))) {
    set(today, today, 'bugün'); s = s.replace(m[0], ' ');
  } else if ((m = s.match(/\sdun\w*/))) {
    const d = addDays(today, -1); set(d, d, 'dün'); s = s.replace(m[0], ' ');
  } else if ((m = s.match(/\s(bu|gecen|gectigimiz)\s+hafta\w*/))) {
    const mon = addDays(today, -((today.getDay() + 6) % 7));
    if (m[1] === 'bu') set(mon, today, 'bu hafta'); else set(addDays(mon, -7), addDays(mon, -1), 'geçen hafta');
    s = s.replace(m[0], ' ');
  } else if ((m = s.match(/\s(bu|gecen|gectigimiz|onceki)\s+ay(?:i|in|da|ki|inda)?\s/))) {
    const back = m[1] === 'bu' ? 0 : 1;
    const d = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const r = monthRange(d.getFullYear(), d.getMonth());
    set(r.from, back ? r.to : ymd(today), `${AY_AD[d.getMonth()]} ${d.getFullYear()}`);
    s = s.replace(m[0], ' ');
  } else if ((m = s.match(/\s(bu|gecen|gectigimiz|onceki)\s+(yil|sene)\w*/))) {
    const y = today.getFullYear() - (m[1] === 'bu' ? 0 : 1);
    set(`${y}-01-01`, m[1] === 'bu' ? ymd(today) : `${y}-12-31`, String(y));
    s = s.replace(m[0], ' ');
  } else {
    // Ay adı (yıl ile ya da yılsız) ve tek başına yıl: "mart 2025", "martta", "ekim ayinda", "2025"
    const monthRe = new RegExp(`\\s(?:(20\\d\\d)\\s+)?(${AYLAR.join('|')})(?:(da|de|ta|te|in|nin)|\\s+(ayi|ayinda|ayindaki))?(?:\\s+(20\\d\\d)\\w*)?\\s`);
    const yearRe = /\s(20\d\d)(?:\s*(?:yil|sene)\w*|da|de|te|ta)?\s/;
    m = s.match(monthRe);
    // "Kasım" gibi kişi/firma adı olabilen ay adı yalnız yıl, ek ya da "ayı" ile tarih sayılır
    const inName = m && customers.some(c => ` ${foldTr(c)} `.includes(` ${m![2]} `));
    if (m && (!inName || m[1] || m[3] || m[4] || m[5])) {
      const mi = AYLAR.indexOf(m[2]);
      const y = Number(m[1] || m[5]) || (mi > today.getMonth() ? today.getFullYear() - 1 : today.getFullYear());
      const r = monthRange(y, mi);
      set(r.from, r.to, `${AY_AD[mi]} ${y}`);
      s = s.replace(m[0], ' ');
    } else if ((m = s.match(yearRe))) {
      const y = Number(m[1]);
      set(`${y}-01-01`, `${y}-12-31`, String(y));
      s = s.replace(m[0], ' ');
    }
  }

  // ---- Durum ----
  if ((m = s.match(/\sonaylanma(yan|mis|di)\w*/))) { out.status = 'gonderildi'; s = s.replace(m[0], ' '); }
  else if ((m = s.match(/\sonay\w*/))) { out.status = 'onaylandi'; s = s.replace(m[0], ' '); }
  else if ((m = s.match(/\sbekle\w*/))) { out.status = 'gonderildi'; s = s.replace(m[0], ' '); }
  else if ((m = s.match(/\siptal\w*/))) { out.status = 'iptal'; s = s.replace(m[0], ' '); }

  // ---- Soru türü ----
  if (/\skac\s+(?:tane\s+|adet\s+)?teklif|\steklif\s+sayisi|\skac\s+(?:kez|defa|kere)\s/.test(s)) out.kind = 'count';
  else if (/\s(?:toplam|ne\s+kadarlik|tutar\w*|ciro\w*)\s/.test(s)) out.kind = 'total';
  else if (/\skac\s+(?:adet|tane|metre|kg|kilo|takim|paket|set)\s|\smiktar\w*/.test(s)) out.kind = 'qty';
  else if (/\sen\s+(?:ucuz|dusuk|az)\w*/.test(s)) out.kind = 'min';
  else if (/\sen\s+(?:pahali|yuksek|fazla)\w*/.test(s)) out.kind = 'max';
  else if (/\sen\s+son|\sson\s+(?:fiyat|kac|ne)|\skaca\s|\sne\s+fiyat/.test(s)) out.kind = 'last';
  // Tür sözcükleri ürün aramasına karışmasın
  s = s.replace(/\sen\s+(?:ucuz|dusuk|az|pahali|yuksek|fazla)\w*/g, ' ').replace(/\s(?:toplam|ne\s+kadarlik|tutar\w*|ciro\w*|miktar\w*)\s/g, ' ');
  out.rest = s.replace(/\s+/g, ' ').trim();
  return out;
}

// Soruda arama için anlamı olmayan kelimeler
const STOP = new Set(('ne neler kac kaca kactan hangi hangisi verdik verdim verildi icin mi mu en son ile ve veya bir bu su o gecen yil ' +
  'yili ay ayi hafta kim kime kimden fiyat fiyati fiyatina fiyatlar teklif teklifi teklifler tekliflerde teklifte ver vermis olan olarak gibi daha kadar ' +
  'toplam tum butun hepsi var yok nedir nasil acaba bize biz firmasina firmaya firma para paraya parayla tane adet ' +
  'bugun dun yarin sattik sattim satildi aldi aldik aldilar istedi onaylandi onaylanan iptal bekleyen bekliyor ' +
  'gonderdik gonderdim gonderilen verilen verdigimiz yaptik yaptigimiz hazirladik kesildi kestik cikti sattigimiz satilan ' +
  'musteri musteriye musteriler cari kez defa kere metre takim paket set kilo icinde ucuz pahali dusuk yuksek son gun sene').split(' '));

const lineNet = (it: QuoteItem) => (it.unitPrice || 0) * (1 - (it.discount || 0) / 100);
export const lineTotal = (it: QuoteItem) => (it.quantity || 0) * lineNet(it);
export const lineCur = (l: AskLine) => l.item.currency || l.quote.currency || 'TRY';
export { lineNet };

/** Soruyla ilgili teklifleri ve satırları cihazdaki veriden bulur (internet kullanmaz) */
export function findAsk(question: string, quotes: Quote[], customers: string[], now = new Date()): AskResult {
  const filter = parseAsk(question, now, customers);
  const empty: AskResult = { filter, quotes: [], lines: [], productSearch: false };
  // İnç ölçüleri ayrı ve tam eşleşir (2" ≠ 1 1/2", 1/2"); 2 inç, 2'', 1 1/2 parmak da olur
  const { words: tokens, sizes } = splitSizes(filter.rest);
  // Uzun kelimelerde ek atılır (enerjiye → enerj, dirseği → dirse)
  const words = tokens.map(w => w.replace(/\.+$/, '')).filter(w => !STOP.has(w) && /[a-z]/.test(w) && w.length >= 3)
    .map(w => (/^[a-z]{6,}$/.test(w) ? w.slice(0, 5) : w));
  const scoped = !!(filter.from || filter.status);
  if (!words.length && !sizes.length && !scoped && !filter.kind) return empty;

  // Önce tarih ve durum süzgeci
  let pool = quotes.filter(q => {
    if (filter.status && q.status !== filter.status) return false;
    const d = dayOf(q.createdAt);
    return (!filter.from || d >= filter.from) && (!filter.to || d <= filter.to);
  });

  // Soruda firma adı geçiyorsa yalnızca adı en çok eşleşen firmanın teklifleri
  const nameHits = (name: string) => words.filter(w => foldTr(name).includes(w)).length;
  const best = Math.max(0, ...quotes.map(q => nameHits(q.customerName)));
  // Adı daha iyi eşleşen bir cari varsa ama teklifi yoksa başka firmanın teklifleri gönderilmez
  if (Math.max(0, ...customers.map(nameHits)) > best) return empty;
  let customer: string | undefined;
  if (best) {
    pool = pool.filter(q => nameHits(q.customerName) === best);
    customer = quotes.find(q => nameHits(q.customerName) === best)?.customerName;
  }
  const custWords = best ? words.filter(w => quotes.some(q => nameHits(q.customerName) === best && foldTr(q.customerName).includes(w))) : [];
  const cand = words.filter(w => !custWords.includes(w));
  // Hiçbir üründe geçmeyen kelimeler (zaman, fiil) ürün aramasından çıkarılır
  const itemText = (it: QuoteItem) => foldTr(`${it.productName} ${it.code || ''}`);
  const itemWords = cand.filter(w => pool.some(q => (q.items || []).some(it => itemText(it).includes(w))));
  const productSearch = itemWords.length > 0 || sizes.length > 0;
  // Ürün kelimesi vardı ama hiçbir üründe geçmiyor: fiyat/miktar sorusu ya da süzgeçsiz soru cevaplanamaz
  if (cand.length && !itemWords.length && !sizes.length
    && (filter.kind === 'qty' || filter.kind === 'last' || filter.kind === 'min' || filter.kind === 'max' || (!best && !scoped && !filter.kind))) {
    return { ...empty, customer };
  }

  const scored: { score: number; line: AskLine }[] = [];
  for (const q of pool) {
    for (const it of q.items || []) {
      const name = itemText(it);
      if (!sizes.every(r => r.test(name))) continue;
      const hits = itemWords.filter(w => name.includes(w)).length;
      if (itemWords.length && !hits) continue;
      scored.push({ score: hits, line: { quote: q, item: it } });
    }
  }
  scored.sort((a, b) => b.score - a.score || (b.line.quote.createdAt || '').localeCompare(a.line.quote.createdAt || ''));
  // Ürün aranıyorsa en çok kelimesi tutan satırlar alınır (küresel vana → yalnız "küresel" geçenler değil)
  const top = scored.length ? scored[0].score : 0;
  const lines = scored.filter(x => !itemWords.length || x.score === top).map(x => x.line);
  const ids = new Set(lines.map(l => l.quote.id));
  const qs = (productSearch ? pool.filter(q => ids.has(q.id)) : pool)
    .slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return { filter, customer, quotes: qs, lines, productSearch };
}

/** Yapay zekâya giden satır biçimi */
export const lineText = (l: AskLine, statusLabel: (s: QuoteStatus) => string) => {
  const { quote: q, item: it } = l;
  return `${dayOf(q.createdAt)} | ${q.customerName} | ${q.quoteNumber} | ${statusLabel(q.status)} | ${it.productName} | ` +
    `${it.quantity} ${it.unit} | birim ${it.unitPrice} ${lineCur(l)}${it.discount ? ` | iskonto %${it.discount}` : ''}`;
};

// ---- Cihazda hesaplanan cevaplar (yapay zekâsız) ----

const SYM: Record<string, string> = { TRY: 'TL', USD: '$', EUR: '€' };
export const fmtMoney = (v: number, c = 'TRY') =>
  `${v.toLocaleString('tr-TR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })} ${SYM[c] || c}`;
const fmtDay = (s: string) => dayOf(s).split('-').reverse().join('.');
const sumBy = <T,>(list: T[], key: (x: T) => string, val: (x: T) => number) => {
  const m = new Map<string, number>();
  for (const x of list) m.set(key(x), (m.get(key(x)) || 0) + val(x));
  return [...m].filter(([, v]) => v);
};
const joinMoney = (pairs: [string, number][]) => pairs.map(([c, v]) => fmtMoney(Math.round(v * 100) / 100, c)).join(' + ');
const qtyText = (pairs: [string, number][]) => pairs.map(([u, v]) => `${v.toLocaleString('tr-TR')} ${u}`).join(' + ');

export type Computed = { text: string; lines: AskLine[]; quotes: Quote[] };

/**
 * Sayı sorularını cihazda hesaplar. Hesaplanamayan (serbest) sorularda null döner, soru yapay zekâya gider.
 * toTry: teklif tutarını TL'ye çevirir (döviz kuru ile).
 */
export function computeAsk(r: AskResult, statusLabel: (s: QuoteStatus) => string, toTry: (q: Quote) => number): Computed | null {
  const { filter: f, quotes, lines, productSearch } = r;
  const scope = [f.period, r.customer, f.status && statusLabel(f.status).toLocaleLowerCase('tr')].filter(Boolean).join(' · ');
  const head = scope ? `${scope}: ` : '';
  const recent = lines.slice().sort((a, b) => (b.quote.createdAt || '').localeCompare(a.quote.createdAt || ''));

  if (f.kind === 'count' || (f.kind === 'total' && !productSearch)) {
    if (!quotes.length) return { text: `${head}kayıtlarda teklif yok.`, lines: [], quotes: [] };
    const byStatus = sumBy(quotes, q => q.status, () => 1).map(([s, n]) => `${n} ${statusLabel(s as QuoteStatus).toLocaleLowerCase('tr')}`);
    const tl = quotes.reduce((t, q) => t + toTry(q), 0);
    const foreign = quotes.some(q => (q.currency || 'TRY') !== 'TRY' || q.amountUsd || q.amountEur);
    const what = productSearch ? `bu ürünün geçtiği ${quotes.length} teklif` : `${quotes.length} teklif`;
    let text = `${head}${what}${f.status ? '' : ` (${byStatus.join(', ')})`}, toplam ${foreign ? '≈ ' : ''}${fmtMoney(Math.round(tl))}.`;
    if (productSearch) {
      const t = sumBy(lines, lineCur, l => lineTotal(l.item));
      if (t.length) text += `\nBu kalemlerin tutarı (iskontolu, KDV hariç): ${joinMoney(t)}.`;
    }
    return { text, lines: [], quotes };
  }

  if (!productSearch || !lines.length) return null;

  // Aynı adlı ürünler gruplanır (en yeni önce, en çok 5 ürün)
  const groups = new Map<string, AskLine[]>();
  for (const l of recent) {
    const k = foldTr(l.item.productName).replace(/\s+/g, ' ').trim();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(l);
  }
  const list = [...groups.values()];
  const shown = list.slice(0, 5);
  const more = list.length > 5 ? `\n…ve ${list.length - 5} ürün daha.` : '';
  const many = list.length > 1;
  const who = (l: AskLine) => `${fmtDay(l.quote.createdAt)} · ${l.quote.customerName} · ${l.quote.quoteNumber}`;
  const price = (l: AskLine) => `${fmtMoney(l.item.unitPrice, lineCur(l))}${l.item.discount ? ` (iskonto %${l.item.discount} → net ${fmtMoney(Math.round(lineNet(l.item) * 100) / 100, lineCur(l))})` : ''}`;

  if (f.kind === 'total' || f.kind === 'qty') {
    const rows = shown.map(g => {
      const q = qtyText(sumBy(g, l => l.item.unit, l => l.item.quantity || 0));
      const t = joinMoney(sumBy(g, lineCur, l => lineTotal(l.item)));
      const n = new Set(g.map(l => l.quote.id)).size;
      return `${many ? `• ${g[0].item.productName}: ` : ''}${q}${t ? `, ${t}` : ''} (${n} teklif)`;
    });
    const all = many ? `\nToplam: ${qtyText(sumBy(lines, l => l.item.unit, l => l.item.quantity || 0))}, ${joinMoney(sumBy(lines, lineCur, l => lineTotal(l.item)))}` : '';
    return { text: `${head}${many ? '\n' : ''}${rows.join('\n')}${all}${more}`, lines: recent, quotes: [] };
  }

  // Fiyat soruları: en son, en düşük, en yüksek (net fiyata göre; para birimi en son satırınki)
  const kind = f.kind || 'last';
  const used: AskLine[] = [];
  const rows = shown.map(g => {
    const last = g[0];
    const same = g.filter(l => lineCur(l) === lineCur(last));
    const lo = same.reduce((a, b) => (lineNet(b.item) < lineNet(a.item) ? b : a));
    const hi = same.reduce((a, b) => (lineNet(b.item) > lineNet(a.item) ? b : a));
    const pick = kind === 'min' ? lo : kind === 'max' ? hi : last;
    used.push(pick);
    const label = kind === 'min' ? 'En düşük' : kind === 'max' ? 'En yüksek' : 'En son';
    const range = same.length > 1 && lineNet(lo.item) !== lineNet(hi.item)
      ? ` · ${g.length} teklifte aralık ${fmtMoney(Math.round(lineNet(lo.item) * 100) / 100, lineCur(lo))} – ${fmtMoney(Math.round(lineNet(hi.item) * 100) / 100, lineCur(hi))}` : '';
    return `${many ? `• ${last.item.productName}\n  ` : ''}${label}: ${price(pick)} — ${who(pick)}${range}`;
  });
  // Seçilen satırlar önde, gerisi en yeni önce
  const rest = recent.filter(l => !used.includes(l));
  return { text: `${head}${many ? '\n' : ''}${rows.join('\n')}${more}`, lines: [...used, ...rest], quotes: [] };
}
