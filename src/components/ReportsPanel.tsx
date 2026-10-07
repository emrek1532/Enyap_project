import React, { useMemo, useState } from 'react';
import { BarChart3, FileText, Clock, CheckCircle2, XCircle, Percent, Wallet, Receipt, Scale } from 'lucide-react';
import { Collection, Expense, Quote } from '../types';
import { PENDING_STATUSES } from '../lib/quoteRules';
import { CURRENCY_LABEL, Currency } from '../lib/money';

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
  const H = 220, top = 12, bottom = 28, left = 52, right = 8;
  const groupW = Math.max(44, Math.min(90, 640 / Math.max(1, months.length)));
  const W = left + right + groupW * months.length;
  const max = Math.max(0, ...series.flatMap(s => s.values));
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const y = (v: number) => top + (H - top - bottom) * (1 - v / yMax);
  const barW = Math.min(24, (groupW - 12 - 2 * (series.length - 1)) / series.length);
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
        <div className="relative overflow-x-auto">
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
                  <text x={gx + groupW / 2} y={H - bottom + 16} textAnchor="middle" fontSize={10} fill="#64748b">{monthLabel(m)}</text>
                </g>
              );
            })}
            <line x1={left} x2={W - right} y1={H - bottom} y2={H - bottom} stroke="#cbd5e1" strokeWidth={1} />
          </svg>
          {hover !== null && (
            <div className="absolute top-1 pointer-events-none bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg"
              style={{ left: Math.min(left + hover * groupW + groupW, W - 170) }}>
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

const Tile: React.FC<{ icon: React.ElementType; tone: string; label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }> = ({ icon: Icon, tone, label, value, sub, className = '' }) => (
  <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs min-w-0 ${className}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`p-1.5 rounded-lg ${tone}`}><Icon className="w-4 h-4" /></span>
    </div>
    <div className="mt-2 text-xl font-black text-slate-900 tabular-nums break-words">{value}</div>
    {sub && <div className="text-xs text-slate-500 mt-0.5 tabular-nums">{sub}</div>}
  </div>
);

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
    return {
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
    const map = new Map<string, { total: number; approved: number; approvedAmt: number }>();
    pQuotes.forEach(q => {
      const k = keyOf(q).trim() || 'Belirtilmemiş';
      const g = map.get(k) || { total: 0, approved: 0, approvedAmt: 0 };
      g.total++;
      if (isApproved(q)) { g.approved++; g.approvedAmt += q.totalAmount || 0; }
      map.set(k, g);
    });
    return [...map.entries()].sort((a, b) => b[1].approvedAmt - a[1].approvedAmt || b[1].total - a[1].total);
  };
  const topCustomers = useMemo(() => groupQuotes(q => q.customerName).slice(0, 10), [pQuotes]);
  const topCities = useMemo(() => groupQuotes(q => q.city).slice(0, 8), [pQuotes]);
  const byPreparer = useMemo(() => groupQuotes(q => q.preparedBy || (q.createdBy === 'istanbul' ? 'İstanbul Ofis' : 'Isparta Saha')), [pQuotes]);

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

      {/* Teklif özeti */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile icon={FileText} tone="text-brand-600 bg-brand-50" label="Verilen Teklif" value={stats.total.toLocaleString('tr-TR')} sub={tl(stats.totalAmt)} />
        <Tile icon={Clock} tone="text-purple-600 bg-purple-50" label="Beklemede" value={stats.pending.toLocaleString('tr-TR')} sub={tl(stats.pendingAmt)} />
        <Tile icon={CheckCircle2} tone="text-emerald-600 bg-emerald-50" label="Onaylanan" value={stats.approved.toLocaleString('tr-TR')} sub={tl(stats.approvedAmt)} />
        <Tile icon={XCircle} tone="text-slate-600 bg-slate-100" label="İptal" value={stats.cancelled.toLocaleString('tr-TR')} sub={tl(stats.cancelledAmt)} />
        <Tile className="col-span-2 lg:col-span-1" icon={Percent} tone="text-accent-700 bg-accent-50" label="Satış Oranı (Verim)" value={pct(stats.approved, stats.total)}
          sub={<>Tutar bazında {pct(stats.approvedAmt, stats.totalAmt)} · Ort. teklif {tl(stats.total ? stats.totalAmt / stats.total : 0)}</>} />
      </div>

      {/* Tahsilat / harcama özeti */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile icon={Wallet} tone="text-accent-700 bg-accent-50" label="Yapılan Tahsilat"
          value={multiCurrency(colTotals).map(s => <div key={s}>{s}</div>)} sub={`${pCollections.length} kayıt · onaylanan teklifin ${pct(colTotals.TRY, stats.approvedAmt)}'i (TL)`} />
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
          <p className="text-xs text-slate-500">Tutarlar TL. Excel'den aktarılan tekliflerin tutarı KDV hariçtir.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sm:text-sm tabular-nums">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-left">Ay</th>
                <th className="py-2.5 px-3">Teklif</th>
                <th className="py-2.5 px-3">Teklif Tutarı</th>
                <th className="py-2.5 px-3">Onaylanan</th>
                <th className="py-2.5 px-3">Onay Tutarı</th>
                <th className="py-2.5 px-3">Satış Oranı</th>
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
                  <td className="py-2 px-3 font-bold">{pct(v.apprCount, v.quoteCount)}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(v.col)}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(v.exp)}</td>
                  <td className={`py-2 px-3 whitespace-nowrap font-bold ${v.col - v.exp < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{tl(v.col - v.exp)}</td>
                </tr>
              ))}
              {monthly.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-slate-500">Bu dönemde veri yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sıralamalar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BarList title="En Çok Onay Alan Müşteriler" subtitle="Onaylanan teklif tutarı (TL) · onay / teklif sayısı" color={C_APPROVED}
          rows={topCustomers.filter(([, g]) => g.approvedAmt > 0).map(([label, g]) => ({ label, value: g.approvedAmt, note: `${g.approved}/${g.total}` }))}
          empty="Bu dönemde onaylanan teklif yok." />
        <BarList title="Şehirlere Göre Onaylanan" subtitle="Onaylanan teklif tutarı (TL) · onay / teklif sayısı" color={C_QUOTE}
          rows={topCities.filter(([, g]) => g.approvedAmt > 0).map(([label, g]) => ({ label, value: g.approvedAmt, note: `${g.approved}/${g.total}` }))}
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
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sm:text-sm tabular-nums">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-left">Teklifi Veren</th>
                <th className="py-2.5 px-3">Teklif</th>
                <th className="py-2.5 px-3">Onaylanan</th>
                <th className="py-2.5 px-3">Satış Oranı</th>
                <th className="py-2.5 px-3">Onay Tutarı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byPreparer.map(([name, g]) => (
                <tr key={name} className="hover:bg-slate-50">
                  <td className="py-2 px-3 text-left font-semibold text-slate-800">{name}</td>
                  <td className="py-2 px-3">{g.total}</td>
                  <td className="py-2 px-3">{g.approved}</td>
                  <td className="py-2 px-3 font-bold">{pct(g.approved, g.total)}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{tl(g.approvedAmt)}</td>
                </tr>
              ))}
              {byPreparer.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">Bu dönemde teklif yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
