import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, FileText, Clock, CheckCircle2, XCircle, Percent, Wallet, Receipt, Scale, Calculator, Award, Building2, HandCoins } from 'lucide-react';
import { Collection, Expense, Quote } from '../types';
import { PENDING_STATUSES } from '../lib/quoteRules';
import { CURRENCY_LABEL, Currency } from '../lib/money';
import { SortHeader, SortState, nextSort, compareText, SortDir, MobileSortSelect } from './SortHeader';

interface ReportsPanelProps {
  quotes: Quote[];
  collections: Collection[];
  expenses: Expense[];
}

type Period = 'month' | '3m' | 'year' | '12m' | 'all' | 'custom';

// Grafik renkleri (kurumsal mavi / yeşil, harcama turuncu) — renk körlüğü testinden geçirildi
const C_QUOTE = '#006ec6';
const C_APPROVED = '#019a82';
const C_COLLECTION = '#019a82';
const C_EXPENSE = '#e8590c';

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const quoteDay = (q: Quote) => ymd(new Date(q.createdAt));
const monthLabel = (ym: string) => `${MONTHS_TR[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

const tl = (v: number) => `${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`;
const money = (v: number, c: Currency) =>
  `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_LABEL[c]}`;
const pct = (a: number, b: number) => (b > 0 ? `%${((a / b) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '-');
/** Eksen için kısa tutar: 1,2 Mn / 350 B */
const compact = (v: number) => {
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} B`;
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
};

const isApproved = (q: Quote) => q.status === 'onaylandi' || q.status === 'siparis';
const isPending = (q: Quote) => PENDING_STATUSES.includes(q.status);

const sumByCurrency = (list: { amount: number; currency: Currency }[]) =>
  list.reduce<Record<Currency, number>>((acc, r) => {
    acc[r.currency || 'TRY'] += r.amount || 0;
    return acc;
  }, { TRY: 0, USD: 0, EUR: 0 });

const multiCurrency = (t: Record<Currency, number>) => {
  const parts = CURRENCIES.filter(c => Math.abs(t[c]) > 0.004).map(c => money(t[c], c));
  return parts.length ? parts : [money(0, 'TRY')];
};

/** Eksen için "yuvarlak" üst sınır ve aralıklar */
const niceTicks = (max: number, count = 4) => {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(v);
  return ticks;
};

// ---------- Gruplu sütun grafiği (aylık) ----------
interface Series { key: string; label: string; color: string; values: number[] }

const ColumnChart: React.FC<{ title: string; subtitle: string; months: string[]; series: Series[] }> = ({ title, subtitle, months, series }) => {
  const [hover, setHover] = useState<number | null>(null);
  // Grafik kutunun genişliğine sığar (telefonda yana kaydırma olmasın)
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth || 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, [months.length]);
  const H = 220, top = 12, bottom = 28, left = 44, right = 4;
  const groupW = Math.max(14, Math.min(90, (boxW - left - right) / Math.max(1, months.length)));
  const W = left + right + groupW * months.length;
  // Dar ekranda ay etiketleri seyreltilir
  const labelEvery = Math.max(1, Math.ceil(40 / groupW));
  const max = Math.max(0, ...series.flatMap(s => s.values));
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const y = (v: number) => top + (H - top - bottom) * (1 - v / yMax);
  const barW = Math.max(3, Math.min(24, (groupW - Math.min(12, groupW * 0.3) - 2 * (series.length - 1)) / series.length));
  const r = 4;

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          {series.map(s => (
            <span key={s.key} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
      </div>
      {months.length === 0 ? (
        <p className="text-xs text-slate-500 py-10 text-center">Bu dönemde veri yok.</p>
      ) : (
        <div ref={boxRef} className="relative overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label={title}>
            {ticks.map(t => (
              <g key={t}>
                <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
                <text x={left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#64748b">{compact(t)}</text>
              </g>
            ))}
            {months.map((m, i) => {
              const gx = left + i * groupW;
              const inner = series.length * barW + (series.length - 1) * 2;
              const x0 = gx + (groupW - inner) / 2;
              return (
                <g key={m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(h => (h === i ? null : i))}>
                  <rect x={gx} y={top} width={groupW} height={H - top - bottom} fill={hover === i ? '#f1f5f9' : 'transparent'} />
                  {series.map((s, si) => {
                    const v = s.values[i] || 0;
                    const yy = y(v), h = (H - bottom) - yy;
                    const x = x0 + si * (barW + 2);
                    if (h <= 0) return null;
                    const rr = Math.min(r, h, barW / 2);
                    return (
                      <path key={s.key} fill={s.color}
                        d={`M${x},${H - bottom} V${yy + rr} Q${x},${yy} ${x + rr},${yy} H${x + barW - rr} Q${x + barW},${yy} ${x + barW},${yy + rr} V${H - bottom} Z`} />
                    );
                  })}
                  {i % labelEvery === 0 && (
                    <text x={gx + groupW / 2} y={H - bottom + 16} textAnchor="middle" fontSize={10} fill="#64748b">{monthLabel(m)}</text>
                  )}
                </g>
              );
            })}
            <line x1={left} x2={W - right} y1={H - bottom} y2={H - bottom} stroke="#cbd5e1" strokeWidth={1} />
          </svg>
          {hover !== null && (
            <div className="absolute top-1 pointer-events-none bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg"
              style={{ left: Math.max(0, Math.min(left + hover * groupW + groupW, W - 180)) }}>
              <div className="font-bold mb-1">{monthLabel(months[hover])}</div>
              {series.map(s => (
                <div key={s.key} className="flex items-center gap-1.5 tabular-nums">
                  <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}: <b>{tl(s.values[hover] || 0)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------- Telefon için tablo yerine kart listesi ----------
interface MobileRow { key: string; title: React.ReactNode; aside?: React.ReactNode; fields: [string, React.ReactNode][] }
const MobileList: React.FC<{ rows: MobileRow[]; empty?: string }> = ({ rows, empty = 'Bu dönemde veri yok.' }) => (
  <div className="md:hidden divide-y divide-slate-100 border-t border-slate-200">
    {rows.length === 0 && <p className="py-6 text-center text-xs text-slate-500">{empty}</p>}
    {rows.map(r => (
      <div key={r.key} className="p-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-bold text-slate-900 text-sm min-w-0">{r.title}</div>
          {r.aside && <div className="font-black text-slate-900 text-sm tabular-nums whitespace-nowrap">{r.aside}</div>}
        </div>
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
          {r.fields.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 min-w-0">
              <dt className="text-slate-500 truncate">{k}</dt>
              <dd className="font-semibold text-slate-800 whitespace-nowrap">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    ))}
  </div>
);

// ---------- Yatay çubuk listesi ----------
const BarList: React.FC<{ title: string; subtitle?: string; rows: { label: string; value: number; note?: string }[]; color: string; empty: string; sort?: boolean }> = ({ title, subtitle, rows, color, empty, sort = true }) => {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs min-w-0">
      <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mb-2">{subtitle}</p>}
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">{empty}</p>
      ) : (
        <div className="space-y-2.5 mt-2">
          {rows.map((r, i) => (
            <div key={r.label + i} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-slate-800 truncate">{sort ? `${i + 1}. ` : ''}{r.label}</span>
                <span className="font-bold text-slate-900 tabular-nums whitespace-nowrap">{tl(r.value)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
                </div>
                {r.note && <span className="text-slate-500 whitespace-nowrap">{r.note}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Tile: React.FC<{ icon: React.ElementType; tone: string; label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string; big?: boolean }> = ({ icon: Icon, tone, label, value, sub, className = '', big }) => (
  <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs min-w-0 ${className}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`p-1.5 rounded-lg ${tone}`}><Icon className="w-4 h-4" /></span>
    </div>
    <div className={`mt-2 font-black text-slate-900 tabular-nums break-words ${big ? 'text-2xl sm:text-3xl' : 'text-xl'}`}>{value}</div>
    {sub && <div className="text-xs text-slate-500 mt-0.5 tabular-nums">{sub}</div>}
  </div>
);

type CustKey = 'name' | 'city' | 'total' | 'totalAmt' | 'approved' | 'approvedAmt' | 'rate' | 'collected';

export const ReportsPanel: React.FC<ReportsPanelProps> = ({ quotes, collections, expenses }) => {
  const [period, setPeriod] = useState<Period>('year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [from, to] = useMemo<[string, string]>(() => {
    const now = new Date();
    const end = ymd(now);
    switch (period) {
      case 'month': return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), end];
      case '3m': return [ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)), end];
      case 'year': return [`${now.getFullYear()}-01-01`, end];
      case '12m': return [ymd(new Date(now.getFullYear(), now.getMonth() - 11, 1)), end];
      case 'custom': return [customFrom || '0000-00-00', customTo || '9999-12-31'];
      default: return ['0000-00-00', '9999-12-31'];
    }
  }, [period, customFrom, customTo]);

  const inRange = (d: string) => d >= from && d <= to;
  const pQuotes = useMemo(() => quotes.filter(q => inRange(quoteDay(q))), [quotes, from, to]);
  const pCollections = useMemo(() => collections.filter(c => inRange(c.date)), [collections, from, to]);
  const pExpenses = useMemo(() => expenses.filter(e => inRange(e.date)), [expenses, from, to]);

  const stats = useMemo(() => {
    const amount = (list: Quote[]) => list.reduce((s, q) => s + (q.totalAmount || 0), 0);
    const approved = pQuotes.filter(isApproved);
    const pending = pQuotes.filter(isPending);
    const cancelled = pQuotes.filter(q => q.status === 'iptal');
    const firms = new Set(pQuotes.map(q => q.customerName.trim().toLocaleLowerCase('tr')));
    const approvedFirms = new Set(approved.map(q => q.customerName.trim().toLocaleLowerCase('tr')));
    return {
      firms: firms.size, approvedFirms: approvedFirms.size,
      total: pQuotes.length, totalAmt: amount(pQuotes),
      approved: approved.length, approvedAmt: amount(approved),
      pending: pending.length, pendingAmt: amount(pending),
      cancelled: cancelled.length, cancelledAmt: amount(cancelled),
    };
  }, [pQuotes]);

  const colTotals = useMemo(() => sumByCurrency(pCollections), [pCollections]);
  const expTotals = useMemo(() => sumByCurrency(pExpenses), [pExpenses]);
  const netTotals = useMemo(() => ({
    TRY: colTotals.TRY - expTotals.TRY, USD: colTotals.USD - expTotals.USD, EUR: colTotals.EUR - expTotals.EUR,
  }), [colTotals, expTotals]);

  // Aylık kırılım
  const monthly = useMemo(() => {
    const map = new Map<string, { quoteCount: number; quoteAmt: number; apprCount: number; apprAmt: number; col: number; exp: number }>();
    const get = (ym: string) => {
      if (!map.has(ym)) map.set(ym, { quoteCount: 0, quoteAmt: 0, apprCount: 0, apprAmt: 0, col: 0, exp: 0 });
      return map.get(ym)!;
    };
    pQuotes.forEach(q => {
      const m = get(quoteDay(q).slice(0, 7));
      m.quoteCount++; m.quoteAmt += q.totalAmount || 0;
      if (isApproved(q)) { m.apprCount++; m.apprAmt += q.totalAmount || 0; }
    });
    pCollections.forEach(c => { const m = get(c.date.slice(0, 7)); if (c.currency === 'TRY') m.col += c.amount; });
    pExpenses.forEach(e => { const m = get(e.date.slice(0, 7)); if (e.currency === 'TRY') m.exp += e.amount; });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pQuotes, pCollections, pExpenses]);
  const months = monthly.map(([m]) => m);

  // En çok onay alan müşteriler / şehirler / teklifi verenler
  const groupQuotes = (keyOf: (q: Quote) => string) => {
    const map = new Map<string, { total: number; totalAmt: number; approved: number; approvedAmt: number; city: string }>();
    pQuotes.forEach(q => {
      const k = keyOf(q).trim() || 'Belirtilmemiş';
      const g = map.get(k) || { total: 0, totalAmt: 0, approved: 0, approvedAmt: 0, city: q.city || '' };
      g.total++; g.totalAmt += q.totalAmount || 0;
      if (isApproved(q)) { g.approved++; g.approvedAmt += q.totalAmount || 0; }
      map.set(k, g);
    });
    return [...map.entries()].sort((a, b) => b[1].approvedAmt - a[1].approvedAmt || b[1].total - a[1].total);
  };
  const byCustomer = useMemo(() => groupQuotes(q => q.customerName), [pQuotes]);
  const topCustomers = useMemo(() => byCustomer.slice(0, 10), [byCustomer]);
  const topCities = useMemo(() => groupQuotes(q => q.city).slice(0, 8), [pQuotes]);
  const byPreparer = useMemo(() => groupQuotes(q => q.preparedBy || (q.createdBy === 'istanbul' ? 'İstanbul Ofis' : 'Isparta Saha')), [pQuotes]);

  // Müşteri performans tablosu (başlığa tıklayarak sıralanır)
  const [custSort, setCustSort] = useState<SortState<CustKey>>({ key: 'approvedAmt', dir: 'desc' });
  const [custLimit, setCustLimit] = useState(20);
  const colByCustomerMap = useMemo(() => {
    const map = new Map<string, number>();
    pCollections.filter(c => c.currency === 'TRY').forEach(c => {
      const k = c.customerName.trim().toLocaleLowerCase('tr');
      map.set(k, (map.get(k) || 0) + c.amount);
    });
    return map;
  }, [pCollections]);
  const customerRows = useMemo(() => {
    const rows = byCustomer.map(([name, g]) => ({
      name, ...g,
      rate: g.totalAmt > 0 ? g.approvedAmt / g.totalAmt : 0,
      collected: colByCustomerMap.get(name.trim().toLocaleLowerCase('tr')) || 0,
    }));
    const val = (r: typeof rows[number]) => {
      switch (custSort.key) {
        case 'name': return 0;
        case 'city': return 0;
        default: return r[custSort.key];
      }
    };
    return rows.sort((a, b) => {
      const r = custSort.key === 'name' ? compareText(a.name, b.name)
        : custSort.key === 'city' ? compareText(a.city, b.city)
        : (val(a) as number) - (val(b) as number);
      return (custSort.dir === 'asc' ? r : -r) || compareText(a.name, b.name);
    });
  }, [byCustomer, colByCustomerMap, custSort]);
  const sortCust = (key: CustKey, first: SortDir) => setCustSort(s => nextSort(s, key, first));

  // Teklif büyüklüğüne göre dağılım
  const sizeBuckets = useMemo(() => {
    const buckets = [
      { label: '0 – 50.000 TL', min: 0, max: 50000 },
      { label: '50.000 – 250.000 TL', min: 50000, max: 250000 },
      { label: '250.000 – 1.000.000 TL', min: 250000, max: 1000000 },
      { label: '1.000.000 TL ve üzeri', min: 1000000, max: Infinity },
    ].map(b => ({ ...b, total: 0, totalAmt: 0, approved: 0, approvedAmt: 0 }));
    pQuotes.filter(q => (q.totalAmount || 0) > 0).forEach(q => {
      const b = buckets.find(x => q.totalAmount >= x.min && q.totalAmount < x.max)!;
      b.total++; b.totalAmt += q.totalAmount;
      if (isApproved(q)) { b.approved++; b.approvedAmt += q.totalAmount; }
    });
    return buckets;
  }, [pQuotes]);

  const monthlyTotals = useMemo(() => monthly.reduce((t, [, v]) => ({
    quoteCount: t.quoteCount + v.quoteCount, quoteAmt: t.quoteAmt + v.quoteAmt,
    apprCount: t.apprCount + v.apprCount, apprAmt: t.apprAmt + v.apprAmt, col: t.col + v.col, exp: t.exp + v.exp,
  }), { quoteCount: 0, quoteAmt: 0, apprCount: 0, apprAmt: 0, col: 0, exp: 0 }), [monthly]);

  const expByCategory = useMemo(() => {
    const map = new Map<string, number>();
    pExpenses.filter(e => e.currency === 'TRY').forEach(e => map.set(e.category || 'Diğer', (map.get(e.category || 'Diğer') || 0) + e.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }, [pExpenses]);
  const expByRegion = useMemo(() => {
    const map = new Map<string, number>();
    pExpenses.filter(e => e.currency === 'TRY').forEach(e => map.set(e.region || 'Belirtilmemiş', (map.get(e.region || 'Belirtilmemiş') || 0) + e.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }, [pExpenses]);
  // Portföy: vadesi gelmemiş çek / senetlerin aylara göre dağılımı (dönemden bağımsız)
  const dueByMonth = useMemo(() => {
    const todayStr = ymd(new Date());
    const map = new Map<string, { value: number; count: number }>();
    collections.filter(c => c.dueDate && c.dueDate >= todayStr && c.currency === 'TRY').forEach(c => {
      const m = c.dueDate!.slice(0, 7);
      const g = map.get(m) || { value: 0, count: 0 };
      g.value += c.amount; g.count++;
      map.set(m, g);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, g]) => ({ label: `${MONTHS_TR[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`, value: g.value, note: `${g.count} adet` }));
  }, [collections]);
  const portfolio = useMemo(() => dueByMonth.reduce((t, r) => ({ value: t.value + r.value, count: t.count + Number(r.note.split(' ')[0]) }), { value: 0, count: 0 }), [dueByMonth]);
  const colByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    pCollections.filter(c => c.currency === 'TRY').forEach(c => map.set(c.customerName || '-', (map.get(c.customerName || '-') || 0) + c.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
  }, [pCollections]);

  const PERIODS: [Period, string][] = [['month', 'Bu Ay'], ['3m', 'Son 3 Ay'], ['year', 'Bu Yıl'], ['12m', 'Son 12 Ay'], ['all', 'Tümü'], ['custom', 'Tarih Seç']];

  return (
    <div className="space-y-4">
      {/* Dönem seçimi */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-2">
        <BarChart3 className="w-5 h-5 text-brand-500" />
        <span className="font-bold text-slate-900 text-sm mr-2">Rapor Dönemi</span>
        {PERIODS.map(([p, label]) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${period === p ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="p-1.5 border border-slate-200 rounded-lg text-sm" />
            <span>-</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="p-1.5 border border-slate-200 rounded-lg text-sm" />
          </div>
        )}
      </div>

      {/* Ana göstergeler (tutar bazlı) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile big icon={FileText} tone="text-brand-600 bg-brand-50" label="Verilen Teklif Tutarı" value={tl(stats.totalAmt)}
          sub={`${stats.total.toLocaleString('tr-TR')} teklif`} />
        <Tile big icon={CheckCircle2} tone="text-emerald-600 bg-emerald-50" label="Onaylanan Teklif Tutarı" value={tl(stats.approvedAmt)}
          sub={`${stats.approved.toLocaleString('tr-TR')} teklif onaylandı`} />
        <Tile big icon={Percent} tone="text-accent-700 bg-accent-50" label="Satış Oranı (Verim)" value={pct(stats.approvedAmt, stats.totalAmt)}
          sub={`Onaylanan tutar ÷ verilen tutar · adet bazında ${pct(stats.approved, stats.total)}`} />
        <Tile big icon={Clock} tone="text-purple-600 bg-purple-50" label="Bekleyen Teklif Tutarı" value={tl(stats.pendingAmt)}
          sub={`${stats.pending.toLocaleString('tr-TR')} teklif karar bekliyor · ${pct(stats.pendingAmt, stats.totalAmt)}`} />
      </div>

      {/* Ek göstergeler */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile icon={XCircle} tone="text-slate-600 bg-slate-100" label="İptal" value={tl(stats.cancelledAmt)} sub={`${stats.cancelled} teklif`} />
        <Tile icon={Calculator} tone="text-brand-600 bg-brand-50" label="Ort. Teklif" value={tl(stats.total ? stats.totalAmt / stats.total : 0)} sub="Teklif başına" />
        <Tile icon={Award} tone="text-emerald-600 bg-emerald-50" label="Ort. Onaylı Teklif" value={tl(stats.approved ? stats.approvedAmt / stats.approved : 0)} sub="Onaylanan teklif başına" />
        <Tile icon={Building2} tone="text-sky-600 bg-sky-50" label="Firma" value={stats.firms.toLocaleString('tr-TR')}
          sub={`${stats.approvedFirms} firmadan onay · ${pct(stats.approvedFirms, stats.firms)}`} />
        <Tile className="col-span-2 lg:col-span-1" icon={HandCoins} tone="text-accent-700 bg-accent-50" label="Portföydeki Çek/Senet" value={tl(portfolio.value)}
          sub={`${portfolio.count} adet · vadesi gelmemiş (dönemden bağımsız)`} />
      </div>

      {/* Tahsilat / harcama özeti */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile icon={Wallet} tone="text-accent-700 bg-accent-50" label="Yapılan Tahsilat"
          value={multiCurrency(colTotals).map(s => <div key={s}>{s}</div>)} sub={`${pCollections.length} kayıt`} />
        <Tile icon={Receipt} tone="text-orange-600 bg-orange-50" label="Yapılan Harcama"
          value={multiCurrency(expTotals).map(s => <div key={s}>{s}</div>)} sub={`${pExpenses.length} kayıt`} />
        <Tile icon={Scale} tone="text-brand-600 bg-brand-50" label="Net (Tahsilat − Harcama)"
          value={multiCurrency(netTotals).map(s => <div key={s} className={s.startsWith('-') ? 'text-rose-600' : ''}>{s}</div>)} />
      </div>

      {/* Aylık grafikler */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <ColumnChart title="Aylık Teklif ve Onay" subtitle="Verilen teklif tutarı ile onaylanan tutar (TL)" months={months}
          series={[
            { key: 'q', label: 'Verilen Teklif', color: C_QUOTE, values: monthly.map(([, v]) => v.quoteAmt) },
            { key: 'a', label: 'Onaylanan', color: C_APPROVED, values: monthly.map(([, v]) => v.apprAmt) },
          ]} />
        <ColumnChart title="Aylık Tahsilat ve Harcama" subtitle="TL cinsinden kayıtlar" months={months}
          series={[
            { key: 'c', label: 'Tahsilat', color: C_COLLECTION, values: monthly.map(([, v]) => v.col) },
            { key: 'e', label: 'Harcama', color: C_EXPENSE, values: monthly.map(([, v]) => v.exp) },
          ]} />
      </div>

      {/* Aylık tablo */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 pb-2">
          <h3 className="font-bold text-slate-900 text-sm">Aylık Özet Tablosu</h3>
          <p className="text-xs text-slate-500">Tutarlar TL. Satış oranı tutar bazlıdır (onaylanan tutar ÷ verilen tutar). Excel'den aktarılan tekliflerin tutarı KDV hariçtir.</p>
        </div>
        <MobileList rows={[
          ...[...monthly].reverse().map(([m, v]) => ({
            key: m, title: monthLabel(m), aside: pct(v.apprAmt, v.quoteAmt),
            fields: [
              ['Teklif', `${v.quoteCount} · ${tl(v.quoteAmt)}`], ['Onay', `${v.apprCount} · ${tl(v.apprAmt)}`],
              ['Tahsilat', tl(v.col)], ['Harcama', tl(v.exp)], ['Net', tl(v.col - v.exp)], ['Adet oranı', pct(v.apprCount, v.quoteCount)],
            ] as [string, React.ReactNode][],
          })),
          ...(monthly.length ? [{
            key: 'toplam', title: 'Toplam', aside: pct(monthlyTotals.apprAmt, monthlyTotals.quoteAmt),
            fields: [
              ['Teklif', tl(monthlyTotals.quoteAmt)], ['Onay', tl(monthlyTotals.apprAmt)],
              ['Tahsilat', tl(monthlyTotals.col)], ['Harcama', tl(monthlyTotals.exp)],
            ] as [string, React.ReactNode][],
          }] : []),
        ]} />
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-right text-xs sm:text-sm tabular-nums">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-left">Ay</th>
                <th className="py-2.5 px-3">Teklif</th>
                <th className="py-2.5 px-3">Teklif Tutarı</th>
                <th className="py-2.5 px-3">Onaylanan</th>
                <th className="py-2.5 px-3">Onay Tutarı</th>
                <th className="py-2.5 px-3">Satış Oranı</th>
                <th className="py-2.5 px-3">Adet Oranı</th>
                <th className="py-2.5 px-3">Tahsilat</th>
                <th className="py-2.5 px-3">Harcama</th>
                <th className="py-2.5 px-3">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...monthly].reverse().map(([m, v]) => (
                <tr key={m} className="hover:bg-slate-50">
                  <td className="py-2 px-3 text-left font-semibold text-slate-800 whitespace-nowrap">{monthLabel(m)}</td>
                  <td className="py-2 px-3">{v.quoteCount}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(v.quoteAmt)}</td>
                  <td className="py-2 px-3">{v.apprCount}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(v.apprAmt)}</td>
                  <td className="py-2 px-3 font-bold">{pct(v.apprAmt, v.quoteAmt)}</td>
                  <td className="py-2 px-3 text-slate-500">{pct(v.apprCount, v.quoteCount)}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(v.col)}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(v.exp)}</td>
                  <td className={`py-2 px-3 whitespace-nowrap font-bold ${v.col - v.exp < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{tl(v.col - v.exp)}</td>
                </tr>
              ))}
              {monthly.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-slate-500">Bu dönemde veri yok.</td></tr>
              )}
            </tbody>
            {monthly.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-black text-slate-900">
                <tr>
                  <td className="py-2.5 px-3 text-left">Toplam</td>
                  <td className="py-2.5 px-3">{monthlyTotals.quoteCount}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{tl(monthlyTotals.quoteAmt)}</td>
                  <td className="py-2.5 px-3">{monthlyTotals.apprCount}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{tl(monthlyTotals.apprAmt)}</td>
                  <td className="py-2.5 px-3">{pct(monthlyTotals.apprAmt, monthlyTotals.quoteAmt)}</td>
                  <td className="py-2.5 px-3 text-slate-500">{pct(monthlyTotals.apprCount, monthlyTotals.quoteCount)}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{tl(monthlyTotals.col)}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{tl(monthlyTotals.exp)}</td>
                  <td className={`py-2.5 px-3 whitespace-nowrap ${monthlyTotals.col - monthlyTotals.exp < 0 ? 'text-rose-600' : ''}`}>{tl(monthlyTotals.col - monthlyTotals.exp)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Sıralamalar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BarList title="En Çok Onay Alan Müşteriler" subtitle="Onaylanan teklif tutarı (TL) · satış oranı · onay / teklif sayısı" color={C_APPROVED}
          rows={topCustomers.filter(([, g]) => g.approvedAmt > 0).map(([label, g]) => ({ label, value: g.approvedAmt, note: `${pct(g.approvedAmt, g.totalAmt)} · ${g.approved}/${g.total}` }))}
          empty="Bu dönemde onaylanan teklif yok." />
        <BarList title="Şehirlere Göre Onaylanan" subtitle="Onaylanan teklif tutarı (TL) · satış oranı · onay / teklif sayısı" color={C_QUOTE}
          rows={topCities.filter(([, g]) => g.approvedAmt > 0).map(([label, g]) => ({ label, value: g.approvedAmt, note: `${pct(g.approvedAmt, g.totalAmt)} · ${g.approved}/${g.total}` }))}
          empty="Bu dönemde onaylanan teklif yok." />
        <BarList title="En Çok Tahsilat Yapılan Müşteriler" subtitle="TL tahsilatlar" color={C_COLLECTION}
          rows={colByCustomer} empty="Bu dönemde tahsilat kaydı yok." />
        <BarList title="Harcamalar (Kategoriye Göre)" subtitle="TL harcamalar" color={C_EXPENSE}
          rows={expByCategory} empty="Bu dönemde harcama kaydı yok." />
        <BarList title="Harcamalar (Bölgeye Göre)" subtitle="TL harcamalar" color={C_EXPENSE}
          rows={expByRegion} empty="Bu dönemde harcama kaydı yok." />
        <BarList title="Çek / Senet Vade Takvimi" subtitle="Vadesi gelmemiş TL çek ve senetler, aylara göre (dönemden bağımsız)" color={C_QUOTE}
          rows={dueByMonth} sort={false} empty="Vadesi gelmemiş çek / senet yok." />
      </div>

      {/* Teklifi verenler */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 pb-2">
          <h3 className="font-bold text-slate-900 text-sm">Teklifi Verene Göre Performans</h3>
        </div>
        <MobileList empty="Bu dönemde teklif yok." rows={byPreparer.map(([name, g]) => ({
          key: name, title: name, aside: pct(g.approvedAmt, g.totalAmt),
          fields: [
            ['Teklif', `${g.total} · ${tl(g.totalAmt)}`], ['Onay', `${g.approved} · ${tl(g.approvedAmt)}`],
            ['Adet oranı', pct(g.approved, g.total)],
          ] as [string, React.ReactNode][],
        }))} />
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-right text-xs sm:text-sm tabular-nums">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-left">Teklifi Veren</th>
                <th className="py-2.5 px-3">Teklif</th>
                <th className="py-2.5 px-3">Teklif Tutarı</th>
                <th className="py-2.5 px-3">Onaylanan</th>
                <th className="py-2.5 px-3">Onay Tutarı</th>
                <th className="py-2.5 px-3">Satış Oranı</th>
                <th className="py-2.5 px-3">Adet Oranı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byPreparer.map(([name, g]) => (
                <tr key={name} className="hover:bg-slate-50">
                  <td className="py-2 px-3 text-left font-semibold text-slate-800">{name}</td>
                  <td className="py-2 px-3">{g.total}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(g.totalAmt)}</td>
                  <td className="py-2 px-3">{g.approved}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(g.approvedAmt)}</td>
                  <td className="py-2 px-3 font-bold">{pct(g.approvedAmt, g.totalAmt)}</td>
                  <td className="py-2 px-3 text-slate-500">{pct(g.approved, g.total)}</td>
                </tr>
              ))}
              {byPreparer.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">Bu dönemde teklif yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Teklif büyüklüğüne göre */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 pb-2">
          <h3 className="font-bold text-slate-900 text-sm">Teklif Büyüklüğüne Göre Dağılım</h3>
          <p className="text-xs text-slate-500">Hangi tutar aralığındaki teklifler ne oranda onaylanıyor</p>
        </div>
        <MobileList rows={sizeBuckets.map(b => ({
          key: b.label, title: b.label, aside: pct(b.approvedAmt, b.totalAmt),
          fields: [
            ['Teklif', `${b.total} · ${tl(b.totalAmt)}`], ['Onay', `${b.approved} · ${tl(b.approvedAmt)}`],
            ['Adet oranı', pct(b.approved, b.total)],
          ] as [string, React.ReactNode][],
        }))} />
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-right text-xs sm:text-sm tabular-nums">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-left">Teklif Tutarı</th>
                <th className="py-2.5 px-3">Teklif</th>
                <th className="py-2.5 px-3">Teklif Tutarı</th>
                <th className="py-2.5 px-3">Onaylanan</th>
                <th className="py-2.5 px-3">Onay Tutarı</th>
                <th className="py-2.5 px-3">Satış Oranı</th>
                <th className="py-2.5 px-3">Adet Oranı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sizeBuckets.map(b => (
                <tr key={b.label} className="hover:bg-slate-50">
                  <td className="py-2 px-3 text-left font-semibold text-slate-800 whitespace-nowrap">{b.label}</td>
                  <td className="py-2 px-3">{b.total}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(b.totalAmt)}</td>
                  <td className="py-2 px-3">{b.approved}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(b.approvedAmt)}</td>
                  <td className="py-2 px-3 font-bold">{pct(b.approvedAmt, b.totalAmt)}</td>
                  <td className="py-2 px-3 text-slate-500">{pct(b.approved, b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Müşteri performansı */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 pb-2">
          <h3 className="font-bold text-slate-900 text-sm">Müşteri Performansı</h3>
          <p className="text-xs text-slate-500"><span className="hidden md:inline">Sütun başlığına tıklayarak sıralayın · </span>{customerRows.length} firma</p>
          <MobileSortSelect className="mt-2 w-full" sort={custSort} onChange={setCustSort} options={[
            { key: 'approvedAmt', dir: 'desc', label: 'Onay tutarı: yüksek' },
            { key: 'totalAmt', dir: 'desc', label: 'Teklif tutarı: yüksek' },
            { key: 'rate', dir: 'desc', label: 'Satış oranı: yüksek' },
            { key: 'rate', dir: 'asc', label: 'Satış oranı: düşük' },
            { key: 'collected', dir: 'desc', label: 'Tahsilat: yüksek' },
            { key: 'total', dir: 'desc', label: 'En çok teklif' },
            { key: 'name', dir: 'asc', label: 'Firma: A → Z' },
          ]} />
        </div>
        <MobileList empty="Bu dönemde teklif yok." rows={customerRows.slice(0, custLimit).map(r => ({
          key: r.name, title: <>{r.name}<span className="block text-[11px] font-normal text-slate-500">{r.city || '-'}</span></>, aside: pct(r.approvedAmt, r.totalAmt),
          fields: [
            ['Teklif', `${r.total} · ${tl(r.totalAmt)}`], ['Onay', `${r.approved} · ${tl(r.approvedAmt)}`],
            ['Tahsilat', r.collected ? tl(r.collected) : '-'],
          ] as [string, React.ReactNode][],
        }))} />
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-right text-xs sm:text-sm tabular-nums">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-y border-slate-200">
              <tr>
                <SortHeader label="Firma" className="text-left" active={custSort.key === 'name'} dir={custSort.dir} onClick={() => sortCust('name', 'asc')} />
                <SortHeader label="Şehir" className="text-left" active={custSort.key === 'city'} dir={custSort.dir} onClick={() => sortCust('city', 'asc')} />
                <SortHeader label="Teklif" align="right" active={custSort.key === 'total'} dir={custSort.dir} onClick={() => sortCust('total', 'desc')} />
                <SortHeader label="Teklif Tutarı" align="right" active={custSort.key === 'totalAmt'} dir={custSort.dir} onClick={() => sortCust('totalAmt', 'desc')} />
                <SortHeader label="Onay" align="right" active={custSort.key === 'approved'} dir={custSort.dir} onClick={() => sortCust('approved', 'desc')} />
                <SortHeader label="Onay Tutarı" align="right" active={custSort.key === 'approvedAmt'} dir={custSort.dir} onClick={() => sortCust('approvedAmt', 'desc')} />
                <SortHeader label="Satış Oranı" align="right" active={custSort.key === 'rate'} dir={custSort.dir} onClick={() => sortCust('rate', 'desc')} />
                <SortHeader label="Tahsilat" align="right" active={custSort.key === 'collected'} dir={custSort.dir} onClick={() => sortCust('collected', 'desc')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customerRows.slice(0, custLimit).map(r => (
                <tr key={r.name} className="hover:bg-slate-50">
                  <td className="py-2 px-3 text-left font-semibold text-slate-800">{r.name}</td>
                  <td className="py-2 px-3 text-left text-slate-600">{r.city || '-'}</td>
                  <td className="py-2 px-3">{r.total}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(r.totalAmt)}</td>
                  <td className="py-2 px-3">{r.approved}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(r.approvedAmt)}</td>
                  <td className="py-2 px-3 font-bold">{pct(r.approvedAmt, r.totalAmt)}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{r.collected ? tl(r.collected) : '-'}</td>
                </tr>
              ))}
              {customerRows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-500">Bu dönemde teklif yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {customerRows.length > custLimit && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{custLimit} / {customerRows.length} firma</span>
            <button onClick={() => setCustLimit(n => n + 20)} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700">Daha fazla göster</button>
          </div>
        )}
      </div>
    </div>
  );
};
