import { isIade } from './constants';
import { Collection, Customer, CustomerStatus, Quote } from '../types';
import { isPendingQuote } from './quoteRules';
import { Rates, quoteTry } from './rates';

/** Firma adı eşleştirme: büyük/küçük harf ve Türkçe karakter farkı gözetmez */
export const foldName = (s: string) =>
  s.trim().toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

export const CUSTOMER_STATUS: Record<CustomerStatus, { label: string; cls: string }> = {
  aktif: { label: 'Aktif', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pasif: { label: 'Pasif', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
  kara_liste: { label: 'Kara liste', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const statusOf = (c?: Customer): CustomerStatus => c?.status || 'aktif';

const isWon = (q: Quote) => q.status === 'onaylandi';
const DAY = 864e5;
const daysSince = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));

export interface Evaluation {
  quoteCount: number;
  quoteTotal: number;
  wonCount: number;
  wonTotal: number;
  /** Tutar bazında onay oranı (0-1), sonuçlanmış teklifler üzerinden */
  winRate: number;
  decidedCount: number;
  pendingCount: number;
  pendingTotal: number;
  /** En büyük bekleyen teklif */
  bigPending?: { quote: Quote; value: number; days: number };
  lastQuoteDays: number | null;
  firstQuoteDays: number | null;
  last12Count: number;
  collected: number;
}

/** Bir firmanın tekliflerine, siparişlerine ve tahsilatlarına göre değerlendirmesi */
export function evaluate(quotes: Quote[], collections: Collection[], rates: Rates, maxWon: number, now = Date.now()): Evaluation {
  const live = quotes.filter(q => q.status !== 'iptal');
  const won = live.filter(isWon);
  const pending = live.filter(q => isPendingQuote(q));
  const v = (q: Quote) => quoteTry(q, rates);
  const quoteTotal = live.reduce((s, q) => s + v(q), 0);
  const wonTotal = won.reduce((s, q) => s + v(q), 0);
  const dates = live.map(q => q.createdAt).filter(Boolean).sort();
  const lastQuoteDays = dates.length ? daysSince(dates[dates.length - 1], now) : null;
  const firstQuoteDays = dates.length ? daysSince(dates[0], now) : null;
  const last12Count = live.filter(q => q.createdAt && daysSince(q.createdAt, now) <= 365).length;
  const big = pending.map(q => ({ quote: q, value: v(q), days: daysSince(q.createdAt, now) })).sort((a, b) => b.value - a.value)[0];
  // Onay oranı yalnızca sonuçlanmış tekliflerden: onaylanan + iptal + 90 günden eski bekleyen
  const decided = [...won, ...quotes.filter(q => q.status === 'iptal'), ...pending.filter(q => daysSince(q.createdAt, now) > 90)];
  const decidedTotal = decided.reduce((s, q) => s + v(q), 0);
  const winRate = decidedTotal ? wonTotal / decidedTotal : 0;

  return {
    quoteCount: live.length, quoteTotal, wonCount: won.length, wonTotal, winRate, decidedCount: decided.length,
    pendingCount: pending.length, pendingTotal: pending.reduce((s, q) => s + v(q), 0),
    bigPending: big && big.value > 0 ? big : undefined,
    lastQuoteDays, firstQuoteDays, last12Count,
    collected: collections.filter(c => (c.currency || 'TRY') === 'TRY' && !isIade(c)).reduce((s, c) => s + (c.amount || 0), 0),
  };
}


/** Müşteri sınıfı (ABC): son 12 ayda onaylanan tutara göre; ciroların ilk %80'i A, sonraki %15 B, kalanı C */
export type AbcClass = 'A' | 'B' | 'C';
export const ABC_STYLE: Record<AbcClass, { cls: string; hint: string }> = {
  A: { cls: 'bg-[#EAF5FC] text-[#006DBB] border-[#006DBB]/25', hint: 'A: son 12 ayda cironun ilk %80\'ini yapan firmalar' },
  B: { cls: 'bg-[#E6F7F4] text-[#008F79] border-[#00B49A]/25', hint: 'B: cironun sonraki %15\'i' },
  C: { cls: 'bg-slate-50 text-slate-600 border-slate-200', hint: 'C: kalan küçük alımlar' },
};
/** Firma adı (foldName) → sınıf; son 12 ayda onayı olmayan firma sınıfsız */
export function abcClasses(quotes: Quote[], rates: Rates, now = Date.now()): Map<string, AbcClass> {
  const since = now - 365 * DAY;
  const won = new Map<string, number>();
  quotes.forEach(q => {
    if (!isWon(q) || !q.createdAt || Date.parse(q.createdAt) < since) return;
    const k = foldName(q.customerName);
    won.set(k, (won.get(k) || 0) + quoteTry(q, rates));
  });
  const rows = [...won.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const out = new Map<string, AbcClass>();
  let cum = 0;
  rows.forEach(([k, v]) => {
    // Firmanın başladığı noktaya göre: ilk %80'e giren (sınırı aşan ilk firma dahil) A
    out.set(k, cum < 0.8 * total ? 'A' : cum < 0.95 * total ? 'B' : 'C');
    cum += v;
  });
  return out;
}
/** Önemli (A/B) ama bu kadar gündür teklif istemeyen müşteri "sessizleşen" sayılır */
export const QUIET_DAYS = 60;
