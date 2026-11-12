import { trNum } from './num';
import { AppData, Collection, Expense, Quote } from '../types';
import { dayOf } from './dates';
import { isPassive, isPendingQuote, needsFollowUp } from './quoteRules';
import { Rates, quoteTry } from './rates';

/** Sayfa başlığındaki (koyu bant) özet rakam */
export type PageStat = { label: string; value: string; sub?: string; /** geçen ayın aynı günlerine göre % değişim */ trend?: number | null };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lira = (v: number) => `₺\u00A0${trNum(Math.round(v))}`;
const n = (v: number) => trNum(v);
/** Bekleyen + pasif: "8 teklif · 3 pasif" */
const pendSub = (l: Quote[]) => { const p = l.filter(isPassive).length; return `${n(l.length)} teklif${p ? ` · ${n(p)} pasif` : ''}`; };
const sumTry = (l: (Collection | Expense)[]) => l.filter(x => (x.currency || 'TRY') === 'TRY').reduce((t, x) => t + (x.amount || 0), 0);

/**
 * Her bölümün başlık bandındaki 3-4 rakam; cihazdaki veriden hesaplanır (sunucuya istek yok).
 * Malzemeler, Notlar, Rapor ve Yönetim'de rakam yok (kendi sayfalarında zaten özet var ya da gereksiz).
 */
/** Teklifler sayfasında filtre varsa bant rakamları süzülen tekliflerden hesaplanır */
export type QuoteView = { quotes: Quote[]; label: string };

/** Tahsilat/Harcama sayfasında filtre varsa bant rakamları süzülen kayıtlardan */
export type LedgerView = { records: (Collection | Expense)[]; label: string };

export function pageStats(tab: string, d: AppData, rates: Rates, now = new Date(), view?: QuoteView | null, ledger?: LedgerView | null): PageStat[] {
  const t = ymd(now);
  const mFrom = `${t.slice(0, 7)}-01`;
  const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pFrom = ymd(pm), pTo = ymd(new Date(now.getFullYear(), now.getMonth(), 0));
  const yFrom = `${now.getFullYear()}-01-01`;
  const inR = (x: string | undefined, a: string, b = t) => { const v = x ? dayOf(x) : ''; return !!v && v >= a && v <= b; };
  const qv = (q: Quote) => quoteTry(q, rates);
  const quotes = d.quotes || [];

  if (tab === 'quotes' && view) {
    const all = view.quotes.filter(q => q.status !== 'iptal');
    const won = all.filter(q => q.status === 'onaylandi');
    const pend = view.quotes.filter(q => q.status === 'gonderildi');
    const follow = view.quotes.filter(needsFollowUp).length;
    const av = all.reduce((a, q) => a + qv(q), 0), wv = won.reduce((a, q) => a + qv(q), 0);
    return [
      { label: `${view.label} verilen`, value: lira(av), sub: `${n(all.length)} teklif` },
      { label: `${view.label} onaylanan`, value: lira(wv), sub: `${n(won.length)} teklif · %${av ? Math.round((wv / av) * 100) : 0} dönüşüm` },
      { label: `${view.label} bekleyen + pasif`, value: lira(pend.reduce((a, q) => a + qv(q), 0)), sub: pendSub(pend) },
      { label: 'Takip edilecek', value: n(follow), sub: '3 günden uzun cevapsız' },
    ];
  }
  if (tab === 'quotes') {
    const month = quotes.filter(q => inR(q.createdAt, mFrom) && q.status !== 'iptal');
    const won = month.filter(q => q.status === 'onaylandi');
    const pend = month.filter(q => q.status === 'gonderildi');
    const follow = quotes.filter(needsFollowUp).length;
    const mv = month.reduce((a, q) => a + qv(q), 0), wv = won.reduce((a, q) => a + qv(q), 0);
    const pv = pend.reduce((a, q) => a + qv(q), 0);
    // Geçen ayın aynı gün aralığı (1 → bugünün günü; ay kısaysa ay sonu)
    const pSame = ymd(new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate())));
    const prev = quotes.filter(q => inR(q.createdAt, pFrom, pSame) && q.status !== 'iptal');
    const sum = (l: Quote[]) => l.reduce((a, q) => a + qv(q), 0);
    const trend = (cur: number, old: number) => (old > 0 ? Math.round(((cur - old) / old) * 100) : null);
    return [
      { label: 'Bu ay verilen', value: lira(mv), sub: `${n(month.length)} teklif`, trend: trend(mv, sum(prev)) },
      { label: 'Bu ay onaylanan', value: lira(wv), sub: `${n(won.length)} teklif · %${mv ? Math.round((wv / mv) * 100) : 0} dönüşüm`, trend: trend(wv, sum(prev.filter(q => q.status === 'onaylandi'))) },
      { label: 'Bu ay bekleyen + pasif', value: lira(pv), sub: pendSub(pend), trend: trend(pv, sum(prev.filter(q => q.status === 'gonderildi'))) },
      { label: 'Takip edilecek', value: n(follow), sub: '3 günden uzun cevapsız' },
    ];
  }
  if (tab === 'customers') {
    const custs = d.customers || [];
    const key = (s: string) => s.trim().toLocaleUpperCase('tr-TR');
    const month = new Set(quotes.filter(q => inR(q.createdAt, mFrom)).map(q => key(q.customerName || '')));
    const pend = new Set(quotes.filter(q => isPendingQuote(q)).map(q => key(q.customerName || '')));
    const six = ymd(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()));
    const active = new Set(quotes.filter(q => q.status === 'onaylandi' && inR(q.createdAt, six)).map(q => key(q.customerName || '')));
    return [
      { label: 'Toplam Müşteri', value: n(custs.length), sub: 'kayıtlı firma' },
      { label: 'Bu Ay Teklif Verilen', value: n(month.size), sub: 'firma' },
      { label: 'Bekleyen Teklifi Olan', value: n(pend.size), sub: 'firma' },
      { label: 'Son 6 Ayda Satış', value: n(active.size), sub: 'firma' },
    ];
  }
  if (tab === 'collections' && ledger) {
    const r = ledger.records as Collection[];
    const paper = r.filter(x => /çek|senet/i.test(x.method || ''));
    const in30 = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
    const due = paper.filter(x => x.dueDate && x.dueDate >= t && x.dueDate <= in30);
    return [
      { label: ledger.label, value: lira(sumTry(r)), sub: `${n(r.length)} kayıt` },
      { label: 'Çek / senet', value: lira(sumTry(paper)), sub: `${n(paper.length)} kayıt` },
      { label: 'Nakit · havale · kart', value: lira(sumTry(r) - sumTry(paper)), sub: `${n(r.length - paper.length)} kayıt` },
      { label: '30 günde vadesi gelen', value: lira(sumTry(due)), sub: `${n(due.length)} çek/senet` },
    ];
  }
  if (tab === 'expenses' && ledger) {
    const r = ledger.records as Expense[];
    const byCat = new Map<string, number>();
    r.forEach(x => { if ((x.currency || 'TRY') === 'TRY') byCat.set(x.category || '—', (byCat.get(x.category || '—') || 0) + (x.amount || 0)); });
    const top = [...byCat].sort((a, b) => b[1] - a[1])[0];
    return [
      { label: ledger.label, value: lira(sumTry(r)), sub: `${n(r.length)} kayıt` },
      { label: 'Kayıt başına', value: lira(r.length ? sumTry(r) / r.length : 0), sub: 'ortalama' },
      { label: 'En büyük kalem', value: top ? lira(top[1]) : '–', sub: top ? top[0] : undefined },
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
