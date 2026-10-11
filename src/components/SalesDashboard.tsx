import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Users, Wallet, Receipt, BarChart3, StickyNote, Package, ChevronRight, Plus, ShieldCheck } from 'lucide-react';
import { ActivityLog, Collection, Customer, Expense, Quote, QuickNote } from '../types';
import { supabase } from '../lib/supabase';
import { FOLLOW_UP_START, PENDING_STATUSES } from '../lib/quoteRules';
import { formatReminder } from '../lib/noteTime';
import { quoteTry, useRates } from '../lib/rates';
import type { ActiveTab } from './Navigation';

interface HomePageProps {
  quotes: Quote[];
  customers: Customer[];
  collections: Collection[];
  expenses: Expense[];
  notes: QuickNote[];
  activities?: ActivityLog[];
  onOpenCustomer?: (name: string) => void;
  onOpen: (tab: Exclude<ActiveTab, 'home'>) => void;
  allowed: (tab: ActiveTab) => boolean;
  canAdd: { quote: boolean; collection: boolean; expense: boolean };
  onOpenQuote: (q: Quote) => void;
  onNewQuote: () => void;
  onNewCollection: () => void;
  onNewExpense: () => void;
}

const tl = (v: number) => `${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`;
const pad = (n: number) => String(n).padStart(2, '0');

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
};

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shortDate = (s: string) => new Date(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const fmtAmt = (v: number, cur: string) =>
  `${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${cur === 'TRY' ? 'TL' : cur === 'USD' ? '$' : '€'}`;

/** Panel kutusu: başlık + içerik */
const Panel: React.FC<{ title: string; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, action, className, children }) => (
  <section className={`bg-white rounded-2xl border border-slate-200 shadow-xs min-w-0 flex flex-col ${className || ''}`}>
    <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
      <h2 className="text-sm font-black text-slate-900">{title}</h2>
      {action}
    </header>
    <div className="px-4 pb-4 flex-1 min-w-0">{children}</div>
  </section>
);

const short = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn` : v >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('tr-TR')} B` : `${Math.round(v)}`);
const TurkeyMap = React.lazy(() => import('./TurkeyMap'));

/** Tek serili sütun grafiği; her sütunun üstünde değeri yazar (Power BI'daki gibi), genişliğe göre çizilir */
const ColumnChart: React.FC<{ data: { label: string; sub?: string; value: number; extra?: string }[]; barCls: string }> = ({ data, barCls }) => {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = Math.max(1, ...data.map(d => d.value));
  const H = W < 500 ? 180 : 250, B = 30, T = 18;
  const plotH = H - B - T;
  const slot = W / data.length;
  const bw = Math.min(34, slot * 0.62);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const small = slot < 40;
  return (
    <div className="relative" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img">
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeWidth={1} />
        {data.map((d, i) => {
          const cx = slot * i + slot / 2;
          const top = Math.min(y(d.value), y(0) - 2);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
              <rect x={cx - slot / 2} y={0} width={slot} height={H} fill={hover === i ? '#f1f5f9' : 'transparent'} />
              {d.value > 0 && <path className={barCls} d={`M${cx - bw / 2},${y(0)} V${top + 3} q0,-3 3,-3 h${bw - 6} q3,0 3,3 V${y(0)} Z`} />}
              {d.value > 0 && !small && <text x={cx} y={top - 5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#334155">{short(d.value)}</text>}
              <text x={cx} y={H - 15} textAnchor="middle" fontSize={small ? 9 : 11} fill="#64748b">{d.label}</text>
              {d.sub && <text x={cx} y={H - 3} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.sub}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          style={{ left: `${Math.min(68, Math.max(0, ((hover + 0.5) / data.length) * 100 - 14))}%` }}>
          <div className="font-bold">{data[hover].label} {data[hover].sub || ''}</div>
          <div>{tl(data[hover].value)}</div>
          {data[hover].extra && <div className="text-slate-300">{data[hover].extra}</div>}
        </div>
      )}
    </div>
  );
};

/** Yatay oran çubuğu (sıralı listeler için) */
const BarRow: React.FC<{ label: string; value: string; sub?: string; pct: number; cls: string; onClick?: () => void }> = ({ label, value, sub, pct, cls, onClick }) => (
  <button type="button" onClick={onClick} className={`w-full text-left py-1.5 ${onClick ? 'hover:bg-slate-50 rounded-lg' : 'cursor-default'}`}>
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="font-semibold text-slate-800 truncate">{label}{sub && <span className="font-normal text-slate-400"> · {sub}</span>}</span>
      <span className="font-black text-slate-900 tabular-nums whitespace-nowrap">{value}</span>
    </div>
    <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.max(2, pct)}%` }} /></div>
  </button>
);

type Period = 'month' | 'year' | '12m' | 'all';
const PERIODS: { k: Period; label: string }[] = [{ k: 'month', label: 'Bu ay' }, { k: 'year', label: 'Bu yıl' }, { k: '12m', label: 'Son 12 ay' }, { k: 'all', label: 'Tümü' }];

export const SalesDashboard: React.FC<HomePageProps> = ({
  quotes, customers, collections, expenses, notes, onOpen, allowed, canAdd, onOpenQuote, onNewQuote, onNewCollection, onNewExpense,
}) => {
  const now = new Date();
  const today = ymd(now);
  const rates = useRates(quotes);
  const [period, setPeriod] = useState<Period>(() => {
    try { return (localStorage.getItem('enyap-home-period') as Period) || 'year'; } catch { return 'year'; }
  });
  const choosePeriod = (p: Period) => { setPeriod(p); try { localStorage.setItem('enyap-home-period', p); } catch { /* */ } };

  const s = useMemo(() => {
    const won = (q: Quote) => q.status === 'onaylandi' || q.status === 'siparis';
    const from = period === 'month' ? today.slice(0, 7) : period === 'year' ? today.slice(0, 4)
      : period === '12m' ? ymd(new Date(now.getFullYear(), now.getMonth() - 11, 1)) : '';
    const inP = (d: string) => !from || (period === '12m' ? d >= from : d.startsWith(from));
    const pq = quotes.filter(q => q.status !== 'arsiv' && inP((q.createdAt || '').slice(0, 10)));
    const qv = (q: Quote) => quoteTry(q, rates);
    const sum = (l: Quote[]) => l.reduce((t, q) => t + qv(q), 0);
    const tr = (v: number, c: string) => v * (c === 'USD' ? rates.USD : c === 'EUR' ? rates.EUR : 1);
    const wonQ = pq.filter(won);
    const givenAmt = sum(pq), wonAmt = sum(wonQ);
    const pending = quotes.filter(q => PENDING_STATUSES.includes(q.status));
    // Aylık satış (son 12 ay, onaylanan tutar)
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const list = quotes.filter(q => (q.createdAt || '').startsWith(key));
      const w = list.filter(won);
      return { label: MONTHS[d.getMonth()], sub: d.getMonth() === 0 || i === 0 ? String(d.getFullYear()) : undefined, value: sum(w), extra: `${w.length} sipariş · ${list.length} teklif` };
    });
    // Şehir ve firma kırılımı (seçilen dönem, onaylanan)
    const group = (key: (q: Quote) => string) => {
      const m = new Map<string, { name: string; amt: number; n: number; given: number; givenN: number }>();
      pq.forEach(q => {
        const name = key(q) || '—';
        const k = name.toLocaleLowerCase('tr');
        const g = m.get(k) || { name, amt: 0, n: 0, given: 0, givenN: 0 };
        g.given += qv(q); g.givenN++;
        if (won(q)) { g.amt += qv(q); g.n++; }
        m.set(k, g);
      });
      return [...m.values()].sort((a, b) => b.amt - a.amt || b.given - a.given);
    };
    const cities = group(q => (q.city || '').trim());
    const firms = group(q => q.customerName.trim());
    const reps = group(q => (q.preparedBy || '').trim()).filter(r => r.name !== '—');
    // Takip / vade / hatırlatma
    const recent = pending.filter(q => new Date(q.createdAt).getTime() >= FOLLOW_UP_START);
    const follow = [...(recent.length ? recent : pending)].sort((a, b) =>
      (a.urgency === 'acil' ? 0 : 1) - (b.urgency === 'acil' ? 0 : 1) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const in30 = ymd(new Date(now.getTime() + 30 * 86400e3));
    const dues = collections.filter(c => c.dueDate && c.dueDate >= today && c.dueDate <= in30).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const portfolio = collections.filter(c => c.dueDate && c.dueDate >= today);
    const pc = collections.filter(c => inP(c.date));
    const reminders = notes.filter(n => !n.done && n.remindAt).sort((a, b) => (a.remindAt || '').localeCompare(b.remindAt || ''));
    return {
      givenAmt, givenN: pq.length, wonAmt, wonN: wonQ.length,
      rate: givenAmt > 0 ? wonAmt / givenAmt : 0,
      pendingN: pending.length, pendingAmt: sum(pending),
      colAmt: pc.reduce((t, c) => t + tr(c.amount, c.currency), 0), colN: pc.length,
      portfolioAmt: portfolio.reduce((t, c) => t + tr(c.amount, c.currency), 0), portfolioN: portfolio.length,
      expAmt: expenses.filter(e => inP(e.date)).reduce((t, e) => t + tr(e.amount, e.currency), 0),
      months, cities, firms, reps, follow, dues, dueSum: dues.reduce((t, c) => t + tr(c.amount, c.currency), 0), reminders,
      activeFirms: firms.filter(f => f.n > 0).length,
      status: [
        { label: 'Sipariş', cls: 'bg-accent-500', list: wonQ },
        { label: 'Beklemede', cls: 'bg-purple-400', list: pq.filter(q => PENDING_STATUSES.includes(q.status)) },
        { label: 'İptal', cls: 'bg-slate-300', list: pq.filter(q => q.status === 'iptal') },
      ].map(x => ({ label: x.label, cls: x.cls, n: x.list.length, amt: sum(x.list) })),
    };
  }, [quotes, collections, expenses, notes, today, rates, period]);

  const mapValues = useMemo(() => new Map(s.cities.filter(c => c.amt > 0 || c.given > 0)
    .map(c => [c.name, { value: c.amt, label: `${tl(c.amt)} sipariş · ${c.givenN} teklif` }])), [s.cities]);

  const seeQuotes = allowed('quotes');
  const seeMoney = allowed('collections');
  const periodLabel = PERIODS.find(p => p.k === period)!.label.toLocaleLowerCase('tr');
  const kpis = [
    seeQuotes && { label: 'Verilen teklifler', value: tl(s.givenAmt), sub: `${s.givenN} teklif · ${periodLabel}`, tab: 'quotes' as const, tone: 'text-slate-900', bar: 'bg-brand-500' },
    seeQuotes && { label: 'Siparişler', value: tl(s.wonAmt), sub: `${s.wonN} sipariş · ${s.activeFirms} firma`, tab: 'quotes' as const, tone: 'text-accent-700', bar: 'bg-accent-500' },
    seeQuotes && { label: 'Satış oranı', value: `%${(s.rate * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`, sub: 'sipariş / verilen tutar', tab: 'reports' as const, tone: 'text-indigo-700', bar: 'bg-indigo-500', pct: s.rate },
    seeQuotes && { label: 'Bekleyen teklifler', value: tl(s.pendingAmt), sub: `${s.pendingN} teklif (tüm zamanlar)`, tab: 'quotes' as const, tone: 'text-purple-700', bar: 'bg-purple-500' },
    seeMoney && { label: 'Tahsilat', value: tl(s.colAmt), sub: `${s.colN} kayıt · ${periodLabel}`, tab: 'collections' as const, tone: 'text-brand-700', bar: 'bg-brand-700' },
    seeMoney && { label: 'Portföy çek/senet', value: tl(s.portfolioAmt), sub: `${s.portfolioN} adet vadesi gelmemiş`, tab: 'collections' as const, tone: 'text-slate-900', bar: 'bg-slate-500' },
  ].filter(Boolean) as { label: string; value: string; sub: string; tab: Exclude<ActiveTab, 'home'>; tone: string; bar: string; pct?: number }[];

  const dateText = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const more = (tab: Exclude<ActiveTab, 'home'>) => (
    <button onClick={() => onOpen(tab)} className="text-xs font-bold text-brand-600 hover:text-brand-800 inline-flex items-center">
      Tümü <ChevronRight className="w-3.5 h-3.5" />
    </button>
  );
  const empty = (t: string) => <p className="py-6 text-center text-xs text-slate-400">{t}</p>;
  const topCities = s.cities.filter(c => c.amt > 0).slice(0, 8);
  const topFirms = s.firms.filter(f => f.amt > 0).slice(0, 8);
  const reps = s.reps.slice(0, 6);
  const swipe = '-mx-3 px-3 md:mx-0 md:px-0 flex md:grid gap-3 overflow-x-auto md:overflow-visible snap-x snap-mandatory scroll-px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Başlık bandı: rapor adı, dönem seçimi, hızlı işlemler */}
      <section className="rounded-2xl bg-gradient-to-r from-brand-700 to-brand-500 text-white px-4 sm:px-5 py-3.5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-brand-100 text-[11px]">{greeting()} · <span className="capitalize">{dateText}</span></p>
            <h1 className="text-base sm:text-xl font-black tracking-tight uppercase">Enyap Isı Sistemleri // Satış Raporu</h1>
          </div>
          {seeQuotes && (
            <div className="flex gap-1 p-1 rounded-xl bg-white/10 w-fit">
              {PERIODS.map(p => (
                <button key={p.k} onClick={() => choosePeriod(p.k)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-extrabold whitespace-nowrap ${period === p.k ? 'bg-white text-brand-700' : 'text-white/85 hover:bg-white/10'}`}>{p.label}</button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            {[
              { label: 'Teklif', onClick: onNewQuote, ok: canAdd.quote },
              { label: 'Tahsilat', onClick: onNewCollection, ok: canAdd.collection },
              { label: 'Harcama', onClick: onNewExpense, ok: canAdd.expense },
            ].filter(a => a.ok).map(a => (
              <button key={a.label} onClick={a.onClick}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] sm:text-xs font-bold whitespace-nowrap">
                <Plus className="w-3.5 h-3.5" /> {a.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Toplam kartları */}
      {kpis.length > 0 && (
        <div className={`${swipe} md:grid-cols-3 xl:grid-cols-6`}>
          {kpis.map(k => (
            <button key={k.label} onClick={() => onOpen(k.tab)}
              className="snap-start shrink-0 w-[46%] md:w-auto text-left bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden hover:border-brand-300 transition-colors flex flex-col">
              <div className={`h-1 ${k.bar}`} />
              <div className="px-3.5 py-2.5 flex-1">
                <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wide text-slate-500 truncate">{k.label}</div>
                <div className={`mt-0.5 text-base sm:text-lg xl:text-xl font-black tabular-nums truncate ${k.tone}`}>{k.value}</div>
                <div className="text-[11px] text-slate-500 truncate">{k.sub}</div>
                {k.pct !== undefined && <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, k.pct * 100)}%` }} /></div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {seeQuotes && (
        <>
          {/* Aylık satış + şehir bazlı satış */}
          <div className="grid lg:grid-cols-5 gap-3 items-stretch">
            <Panel title="Aylık satış grafiği" action={<span className="text-[11px] text-slate-400">son 12 ay · sipariş tutarı</span>} className="lg:col-span-3">
              <ColumnChart data={s.months} barCls="fill-brand-500" />
            </Panel>
            <Panel title="Şehir bazlı satış" action={<span className="text-[11px] text-slate-400">{periodLabel}</span>} className="lg:col-span-2">
              {topCities.length === 0 ? empty('Bu dönemde sipariş yok.') : topCities.map(c => (
                <BarRow key={c.name} label={c.name} sub={`${c.n} sipariş`} value={tl(c.amt)} pct={(c.amt / topCities[0].amt) * 100} cls="bg-brand-500" />
              ))}
            </Panel>
          </div>

          {/* Harita + satış temsilcileri */}
          <div className="grid lg:grid-cols-5 gap-3 items-stretch">
            <Panel title="Ülke geneli satış yapılan şehirler" action={<span className="text-[11px] text-slate-400">{periodLabel} · {s.cities.filter(c => c.amt > 0).length} il</span>} className="lg:col-span-3">
              <React.Suspense fallback={<div className="h-48 flex items-center justify-center text-xs text-slate-400">harita yükleniyor…</div>}>
                <TurkeyMap values={mapValues} />
              </React.Suspense>
            </Panel>
            <Panel title="Satış temsilcileri" action={<span className="text-[11px] text-slate-400">{periodLabel}</span>} className="lg:col-span-2">
              {reps.length === 0 ? empty('Teklifi veren bilgisi yok.') : (
                <div className="divide-y divide-slate-100">
                  {reps.map(r => {
                    const rate = r.given > 0 ? r.amt / r.given : 0;
                    return (
                      <div key={r.name} className="py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900 truncate">{r.name}</span>
                          <span className="text-sm font-black text-accent-700 tabular-nums whitespace-nowrap">{tl(r.amt)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-accent-500 rounded-full" style={{ width: `${Math.min(100, rate * 100)}%` }} /></div>
                          <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{r.givenN} teklif · {r.n} sipariş · %{Math.round(rate * 100)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1.5">Teklif durumları · {periodLabel}</div>
                <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                  {s.status.map(x => x.n > 0 && <div key={x.label} className={x.cls} style={{ width: `${(x.n / Math.max(1, s.givenN)) * 100}%` }} title={`${x.label}: ${x.n}`} />)}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {s.status.map(x => (
                    <div key={x.label} className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className={`w-2 h-2 rounded-sm ${x.cls}`} />{x.label}</div>
                      <div className="text-sm font-black text-slate-900 tabular-nums">{x.n.toLocaleString('tr-TR')}</div>
                      <div className="text-[10px] text-slate-400 tabular-nums truncate">{short(x.amt)} TL</div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
        </>
      )}

      {/* Firmalar, takip, vadeler, hatırlatmalar */}
      <div className={`${swipe} md:grid-cols-2 xl:grid-cols-4 items-stretch [&>*]:snap-start [&>*]:shrink-0 [&>*]:w-[86%] md:[&>*]:w-auto`}>
        {seeQuotes && (
          <Panel title="En çok sipariş veren firmalar" action={more('customers')}>
            {topFirms.length === 0 ? empty('Bu dönemde sipariş yok.') : topFirms.map(f => (
              <BarRow key={f.name} label={f.name} sub={`${f.n}`} value={short(f.amt)} pct={(f.amt / topFirms[0].amt) * 100} cls="bg-accent-500" />
            ))}
          </Panel>
        )}
        {seeQuotes && (
          <Panel title={`Takip edilecek · ${s.follow.length}`} action={more('quotes')}>
            {s.follow.length === 0 ? empty('Bekleyen teklif yok.') : (
              <ul className="divide-y divide-slate-100 -mx-1">
                {s.follow.slice(0, 6).map(q => {
                  const age = Math.floor((now.getTime() - new Date(q.createdAt).getTime()) / 86400e3);
                  return (
                    <li key={q.id}>
                      <button onClick={() => onOpenQuote(q)} className="w-full flex items-center gap-2 px-1 py-1.5 text-left hover:bg-slate-50 rounded-lg">
                        <span className={`w-1 self-stretch rounded-full ${q.urgency === 'acil' ? 'bg-rose-500' : age >= 3 ? 'bg-amber-400' : 'bg-slate-200'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-slate-900 truncate">{q.customerName}</span>
                          <span className="block text-[10px] text-slate-500 truncate">{q.quoteNumber} · {age === 0 ? 'bugün' : `${age} gün`}</span>
                        </span>
                        <span className="text-xs font-black text-slate-800 tabular-nums whitespace-nowrap">{short(quoteTry(q, rates))}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        )}
        {seeMoney && (
          <Panel title="Yaklaşan vadeler · 30 gün" action={more('collections')}>
            {s.dues.length === 0 ? empty('30 gün içinde vade yok.') : (
              <>
                <div className="text-[11px] text-slate-500 mb-1">Toplam <b className="text-slate-800 tabular-nums">{tl(s.dueSum)}</b></div>
                <ul className="divide-y divide-slate-100">
                  {s.dues.slice(0, 5).map(c => (
                    <li key={c.id} className="flex items-center gap-2 py-1.5">
                      <span className="w-11 shrink-0 text-[11px] font-bold text-accent-700 tabular-nums">{shortDate(c.dueDate!)}</span>
                      <span className="min-w-0 flex-1 text-xs font-semibold text-slate-800 truncate">{c.customerName}</span>
                      <span className="text-xs font-black text-slate-800 tabular-nums whitespace-nowrap">{short(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        )}
        {allowed('notes') && (
          <Panel title="Hatırlatmalar" action={more('notes')}>
            {s.reminders.length === 0 ? empty('Hatırlatmalı not yok.') : (
              <ul className="divide-y divide-slate-100">
                {s.reminders.slice(0, 5).map(n => {
                  const late = new Date(n.remindAt!).getTime() < now.getTime();
                  return (
                    <li key={n.id} className="py-1.5">
                      <button onClick={() => onOpen('notes')} className="w-full text-left">
                        <span className={`text-[11px] font-bold ${late ? 'text-rose-600' : 'text-amber-700'}`}>{formatReminder(n.remindAt!)}{late ? ' · geçti' : ''}</span>
                        <span className="block text-xs text-slate-700 line-clamp-2">{n.content}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
};

