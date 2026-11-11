import { Quote } from '../types';
import { dayOf, localDay } from './dates';
import { isPendingQuote } from './quoteRules';

const DAY = 864e5;

/**
 * Bu ay tahmini ciro: onaylanan (kesin) + bekleyen tekliflerden beklenen.
 * Beklenen = son 45 günde verilip hâlâ bekleyen tekliflerin tutarı × geçmiş satış oranı
 * (30–210 gün önce verilen tekliflerde onaylanan tutar / verilen tutar). Cihazdaki veriden; ek sorgu yok.
 */
export function monthForecast(quotes: Quote[], amountOf: (q: Quote) => number, now = new Date()) {
  const ym = localDay(now).slice(0, 7);
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const d = now.getDate();
  const daily = new Array(dim + 1).fill(0);
  let approved = 0, n = 0, histAll = 0, histOk = 0, pendAmt = 0, pendN = 0;
  const t = now.getTime();
  for (const q of quotes) {
    const day = dayOf(q.createdAt);
    const amt = amountOf(q);
    if (q.status === 'onaylandi' && day.startsWith(ym)) { approved += amt; n++; daily[Number(day.slice(8, 10))] += amt; }
    const age = (t - Date.parse(q.createdAt)) / DAY;
    if (age >= 30 && age <= 210) { histAll += amt; if (q.status === 'onaylandi') histOk += amt; }
    if (isPendingQuote(q) && age <= 45) { pendAmt += amt; pendN++; }
  }
  const rate = histAll > 0 ? histOk / histAll : 0;
  const expected = pendAmt * rate;
  const cum: number[] = [];
  let run = 0;
  for (let i = 1; i <= d; i++) { run += daily[i]; cum.push(run); }
  return { dim, d, approved, n, rate, expected, pendAmt, pendN, cum, total: approved + expected };
}
