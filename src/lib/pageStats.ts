import { trNum } from './num';
import { AppData, Collection, Expense, Quote } from '../types';
import { dayOf } from './dates';
import { PENDING_STATUSES, needsFollowUp } from './quoteRules';
import { Rates, quoteTry } from './rates';

/** Sayfa başlığındaki (koyu bant) özet rakam */
export type PageStat = { label: string; value: string; sub?: string };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lira = (v: number) => `₺ ${trNum(Math.round(v))}`;
const n = (v: number) => trNum(v);
const sumTry = (l: (Collection | Expense)[]) => l.filter(x => (x.currency || 'TRY') === 'TRY').reduce((t, x) => t + (x.amount || 0), 0);

/**
 * Her bölümün başlık bandındaki 3-4 rakam; cihazdaki veriden hesaplanır (sunucuya istek yok).
 * Malzemeler, Notlar, Rapor ve Yönetim'de rakam yok (kendi sayfalarında zaten özet var ya da gereksiz).
 */
export function pageStats(tab: string, d: AppData, rates: Rates, now = new Date()): PageStat[] {
  const t = ymd(now);
  const mFrom = `${t.slice(0, 7)}-01`;
  const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pFrom = ymd(pm), pTo = ymd(new Date(now.getFullYear(), now.getMonth(), 0));
  const yFrom = `${now.getFullYear()}-01-01`;
  const inR = (x: string | undefined, a: string, b = t) => { const v = x ? dayOf(x) : ''; return !!v && v >= a && v <= b; };
  const qv = (q: Quote) => quoteTry(q, rates);
  const quotes = d.quotes || [];

  if (tab === 'quotes') {
    const month = quotes.filter(q => inR(q.createdAt, mFrom) && q.status !== 'iptal');
    const won = month.filter(q => q.status === 'onaylandi');
    const pend = quotes.filter(q => PENDING_STATUSES.includes(q.status));
    const follow = quotes.filter(needsFollowUp).length;
    const mv = month.reduce((a, q) => a + qv(q), 0), wv = won.reduce((a, q) => a + qv(q), 0);
    return [
      { label: 'Bu ay verilen', value: lira(mv), sub: `${n(month.length)} teklif` },
      { label: 'Bu ay onaylanan', value: lira(wv), sub: `${n(won.length)} teklif · %${mv ? Math.round((wv / mv) * 100) : 0} dönüşüm` },
      { label: 'Bekleyen', value: lira(pend.reduce((a, q) => a + qv(q), 0)), sub: `${n(pend.length)} teklif` },
      { label: 'Takip edilecek', value: n(follow), sub: '3 günden uzun cevapsız' },
    ];
  }
  if (tab === 'customers') {
    const custs = d.customers || [];
    const key = (s: string) => s.trim().toLocaleUpperCase('tr-TR');
    const month = new Set(quotes.filter(q => inR(q.createdAt, mFrom)).map(q => key(q.customerName || '')));
    const pend = new Set(quotes.filter(q => PENDING_STATUSES.includes(q.status)).map(q => key(q.customerName || '')));
    const six = ymd(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()));
    const active = new Set(quotes.filter(q => q.status === 'onaylandi' && inR(q.createdAt, six)).map(q => key(q.customerName || '')));
    return [
      { label: 'Kayıtlı müşteri', value: n(custs.length) },
      { label: 'Bu ay teklif verilen', value: n(month.size), sub: 'firma' },
      { label: 'Bekleyen teklifi olan', value: n(pend.size), sub: 'firma' },
      { label: 'Son 6 ayda satış', value: n(active.size), sub: 'firma' },
    ];
  }
  if (tab === 'collections') {
    const c = d.collections || [];
    const month = c.filter(x => inR(x.date, mFrom)), prev = c.filter(x => inR(x.date, pFrom, pTo)), year = c.filter(x => inR(x.date, yFrom));
    const in30 = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
    const due = c.filter(x => x.dueDate && x.dueDate >= t && x.dueDate <= in30 && /çek|senet/i.test(x.method || ''));
    return [
      { label: 'Bu ay', value: lira(sumTry(month)), sub: `${n(month.length)} kayıt` },
      { label: 'Geçen ay', value: lira(sumTry(prev)), sub: `${n(prev.length)} kayıt` },
      { label: 'Bu yıl', value: lira(sumTry(year)), sub: `${n(year.length)} kayıt` },
      { label: '30 günde vadesi gelen', value: lira(sumTry(due)), sub: `${n(due.length)} çek/senet` },
    ];
  }
  if (tab === 'expenses') {
    const e = d.expenses || [];
    const month = e.filter(x => inR(x.date, mFrom)), prev = e.filter(x => inR(x.date, pFrom, pTo)), year = e.filter(x => inR(x.date, yFrom));
    return [
      { label: 'Bu ay', value: lira(sumTry(month)), sub: `${n(month.length)} kayıt` },
      { label: 'Geçen ay', value: lira(sumTry(prev)), sub: `${n(prev.length)} kayıt` },
      { label: 'Bu yıl', value: lira(sumTry(year)), sub: `${n(year.length)} kayıt` },
    ];
  }
  return [];
}
