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

/** Aylık sütun grafiği: iki seri, tek eksen; genişliğe göre çizilir, üzerine gelince değer çıkar */
const MonthlyChart: React.FC<{
  data: { label: string; a: number; b: number }[];
  series: [{ label: string; cls: string; dot: string }, { label: string; cls: string; dot: string }];
  fmt?: (v: number) => string;
}> = ({ data, series, fmt = v => v.toLocaleString('tr-TR') }) => {
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
  const max = Math.max(1, ...data.map(d => Math.max(d.a, d.b)));
  const mag = 10 ** Math.floor(Math.log10(max / 4));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => max / s <= 4) || mag * 10;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const H = 160, L = 40, B = 22, T = 8;
  const plotW = W - L - 4, plotH = H - B - T;
  const slot = plotW / data.length;
  const bw = Math.min(20, slot / 3.2);
  const y = (v: number) => T + plotH - (v / top) * plotH;
  const axis = (v: number) => (top >= 1e4 ? short(v) : String(v));
  return (
    <div className="relative" ref={box}>
      <div className="flex items-center gap-4 text-[11px] text-slate-500 mb-1">
        {series.map(s => <span key={s.label} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${s.dot}`} />{s.label}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img">
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - 4} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="#94a3b8">{axis(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = L + slot * i + slot / 2;
          const bar = (v: number, x: number, cls: string) => v > 0 && (
            <path className={cls} d={`M${x},${y(0)} V${Math.min(y(v) + 4, y(0))} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${y(0)} Z`} />
          );
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
              <rect x={cx - slot / 2} y={T} width={slot} height={plotH + B} fill={hover === i ? '#f1f5f9' : 'transparent'} />
              {bar(d.a, cx - bw - 1, series[0].cls)}
              {bar(d.b, cx + 1, series[1].cls)}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill="#64748b">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-6 bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          style={{ left: `${Math.min(70, Math.max(2, ((hover + 0.5) / data.length) * 100 - 12))}%` }}>
          <div className="font-bold">{data[hover].label}</div>
          <div>{series[0].label}: {fmt(data[hover].a)}</div>
          <div>{series[1].label}: {fmt(data[hover].b)}</div>
        </div>
      )}
    </div>
  );
};

/** Yatay oran çubuğu (sıralı listeler için) */
const BarRow: React.FC<{ label: string; value: string; pct: number; cls: string; onClick?: () => void }> = ({ label, value, pct, cls, onClick }) => (
  <button type="button" onClick={onClick} className={`w-full text-left py-1.5 ${onClick ? 'hover:bg-slate-50 rounded-lg' : 'cursor-default'}`}>
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="font-semibold text-slate-800 truncate">{label}</span>
      <span className="font-black text-slate-900 tabular-nums whitespace-nowrap">{value}</span>
    </div>
    <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.max(2, pct)}%` }} /></div>
  </button>
);

export const HomePage: React.FC<HomePageProps> = ({
  quotes, customers, collections, expenses, notes, activities = [], onOpen, allowed, canAdd, onOpenQuote, onOpenCustomer, onNewQuote, onNewCollection, onNewExpense,
}) => {
  const now = new Date();
  const today = ymd(now);
  const rates = useRates(quotes);
  const [chart, setChart] = useState<'quotes' | 'money'>('quotes');

  const s = useMemo(() => {
    const month = today.slice(0, 7);
    const year = today.slice(0, 4);
    const won = (q: Quote) => q.status === 'onaylandi' || q.status === 'siparis';
    const pending = quotes.filter(q => PENDING_STATUSES.includes(q.status));
    const yearQuotes = quotes.filter(q => (q.createdAt || '').startsWith(year));
    const monthQuotes = quotes.filter(q => (q.createdAt || '').startsWith(month));
    const qSum = (list: Quote[]) => list.reduce((t, q) => t + quoteTry(q, rates), 0);
    const tr = (v: number, c: string) => v * (c === 'USD' ? rates.USD : c === 'EUR' ? rates.EUR : 1);
    const mSum = (list: { amount: number; currency: string }[]) => list.reduce((t, x) => t + tr(x.amount, x.currency), 0);
    const yearAmt = qSum(yearQuotes);
    // Son 6 ay
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const list = quotes.filter(q => (q.createdAt || '').startsWith(key));
      return {
        label: MONTHS[d.getMonth()],
        q: { a: list.length, b: list.filter(won).length },
        m: { a: mSum(collections.filter(c => c.date.startsWith(key))), b: mSum(expenses.filter(e => e.date.startsWith(key))) },
      };
    });
    // Takip: takip başlangıcından sonra girilen bekleyenler (acil önce, sonra en eski)
    const recent = pending.filter(q => new Date(q.createdAt).getTime() >= FOLLOW_UP_START);
    const follow = [...(recent.length ? recent : pending)].sort((a, b) =>
      (a.urgency === 'acil' ? 0 : 1) - (b.urgency === 'acil' ? 0 : 1) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const in30 = ymd(new Date(now.getTime() + 30 * 86400e3));
    const dues = collections.filter(c => c.dueDate && c.dueDate >= today && c.dueDate <= in30).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const portfolio = collections.filter(c => c.dueDate && c.dueDate >= today);
    const reminders = notes.filter(n => !n.done && n.remindAt).sort((a, b) => (a.remindAt || '').localeCompare(b.remindAt || ''));
    // Bu yıl en çok onaylanan firmalar
    const firmMap = new Map<string, { name: string; amt: number; n: number }>();
    yearQuotes.filter(won).forEach(q => {
      const k = q.customerName.trim().toLocaleLowerCase('tr');
      const f = firmMap.get(k) || { name: q.customerName.trim(), amt: 0, n: 0 };
      f.amt += quoteTry(q, rates); f.n++;
      firmMap.set(k, f);
    });
    const topFirms = [...firmMap.values()].sort((a, b) => b.amt - a.amt).slice(0, 5);
    // Bu ay harcama dağılımı
    const catMap = new Map<string, number>();
    expenses.filter(e => e.date.startsWith(month)).forEach(e => catMap.set(e.category || 'Diğer', (catMap.get(e.category || 'Diğer') || 0) + tr(e.amount, e.currency)));
    const cats = [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    // Bu ay ilk kez teklif verilen firmalar
    const firstQuote = new Map<string, string>();
    quotes.forEach(q => {
      const k = q.customerName.trim().toLocaleLowerCase('tr');
      const d = q.createdAt || '';
      if (!firstQuote.has(k) || d < firstQuote.get(k)!) firstQuote.set(k, d);
    });
    const newCustomers = [...firstQuote.values()].filter(d => d.startsWith(month)).length;
    return {
      year, pending: pending.length, pendingAmt: qSum(pending),
      monthCount: monthQuotes.length, monthAmt: qSum(monthQuotes),
      monthWon: monthQuotes.filter(won).length, monthWonAmt: qSum(monthQuotes.filter(won)),
      rate: yearAmt > 0 ? qSum(yearQuotes.filter(won)) / yearAmt : 0,
      colMonth: mSum(collections.filter(c => c.date.startsWith(month))),
      colCount: collections.filter(c => c.date.startsWith(month)).length,
      expMonth: mSum(expenses.filter(e => e.date.startsWith(month))),
      portfolio: portfolio.length, portfolioAmt: mSum(portfolio),
      months, follow, dues, dueSum: mSum(dues), reminders, topFirms, cats,
      customers: customers.length, newCustomers,
    };
  }, [quotes, customers, collections, expenses, notes, today, rates]);

  // Malzeme kataloğu ve firma fiyat listeleri (sunucuda; sadece sayılar)
  const [mat, setMat] = useState<{ count: number | null; lists: number | null; latest: string }>({ count: null, lists: null, latest: '' });
  useEffect(() => {
    let alive = true;
    if (allowed('materials')) {
      supabase.from('materials').select('code', { count: 'exact', head: true })
        .then(({ count }) => { if (alive) setMat(m => ({ ...m, count: count ?? null })); });
      supabase.from('supplier_lists').select('name,list_date,updated_at').order('updated_at', { ascending: false })
        .then(({ data }) => { if (alive && data) setMat(m => ({ ...m, lists: data.length, latest: data[0] ? `${data[0].name} ${data[0].list_date || ''}`.trim() : '' })); });
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seeQuotes = allowed('quotes');
  const seeMoney = allowed('collections');
  const seeExp = allowed('expenses');
  const kpis = [
    seeQuotes && { label: 'Bekleyen teklif', value: s.pending.toLocaleString('tr-TR'), sub: tl(s.pendingAmt), tab: 'quotes' as const, tone: 'text-purple-700' },
    seeQuotes && { label: 'Bu ay onaylanan', value: tl(s.monthWonAmt), sub: `${s.monthWon} / ${s.monthCount} teklif`, tab: 'quotes' as const, tone: 'text-accent-700' },
    seeMoney && { label: 'Bu ay tahsilat', value: tl(s.colMonth), sub: `${s.colCount} kayıt`, tab: 'collections' as const, tone: 'text-brand-700' },
    seeExp && { label: 'Bu ay harcama', value: tl(s.expMonth), sub: s.cats[0] ? `en çok ${s.cats[0][0]}` : 'kayıt yok', tab: 'expenses' as const, tone: 'text-orange-700' },
    seeMoney && { label: 'Portföy çek/senet', value: tl(s.portfolioAmt), sub: `${s.portfolio} adet vadesi gelmemiş`, tab: 'collections' as const, tone: 'text-slate-900' },
    { label: 'Müşteriler', value: s.customers.toLocaleString('tr-TR'), sub: s.newCustomers ? `bu ay ${s.newCustomers} firmaya ilk teklif` : 'kayıtlı firma', tab: 'customers' as const, tone: 'text-sky-700' },
    allowed('materials') && { label: 'Malzeme kataloğu', value: mat.count == null ? '—' : mat.count.toLocaleString('tr-TR'), sub: mat.lists == null ? 'kalem' : `${mat.lists} firma fiyat listesi`, tab: 'materials' as const, tone: 'text-teal-700' },
    seeQuotes && { label: `${s.year} satış oranı`, value: `%${(s.rate * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`, sub: 'onaylanan / verilen tutar', tab: 'reports' as const, tone: 'text-indigo-700' },
  ].filter(Boolean) as { label: string; value: string; sub: string; tab: Exclude<ActiveTab, 'home'>; tone: string }[];

  const dateText = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const more = (tab: Exclude<ActiveTab, 'home'>) => (
    <button onClick={() => onOpen(tab)} className="text-xs font-bold text-brand-600 hover:text-brand-800 inline-flex items-center">
      Tümü <ChevronRight className="w-3.5 h-3.5" />
    </button>
  );
  const empty = (t: string) => <p className="py-6 text-center text-xs text-slate-400">{t}</p>;
  const ago = (iso: string) => {
    const m = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
    return m < 60 ? `${Math.max(1, m)} dk önce` : m < 1440 ? `${Math.round(m / 60)} sa önce` : shortDate(iso);
  };
  const feed = activities.filter(a => !/tanı\)/.test(a.action)).slice(0, 7);
  const chartTab = (k: 'quotes' | 'money', label: string) => (
    <button onClick={() => setChart(k)} className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold ${chart === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>
  );

  return (
    <div className="space-y-4">
      {/* Karşılama + hızlı işlemler */}
      <section className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white px-5 py-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-brand-100 text-xs">{greeting()} · <span className="capitalize">{dateText}</span></p>
          <h1 className="text-lg sm:text-xl font-black tracking-tight">Enyap Isı Teklif & Takip</h1>
        </div>
        <div className="grid grid-cols-3 md:flex gap-2">
          {[
            { label: 'Yeni Teklif', onClick: onNewQuote, ok: canAdd.quote },
            { label: 'Tahsilat Ekle', onClick: onNewCollection, ok: canAdd.collection },
            { label: 'Harcama Ekle', onClick: onNewExpense, ok: canAdd.expense },
          ].filter(a => a.ok).map(a => (
            <button key={a.label} onClick={a.onClick}
              className="inline-flex items-center justify-center gap-1 md:gap-1.5 px-2 md:px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[11px] sm:text-sm font-bold whitespace-nowrap">
              <Plus className="w-4 h-4" /> {a.label}
            </button>
          ))}
        </div>
      </section>

      {/* Özet rakamlar: tüm bölümlerden */}
      {/* Telefonda yana kaydırılır, bilgisayarda 4 sütun */}
      <div className="-mx-3 px-3 md:mx-0 md:px-0 flex md:grid md:grid-cols-4 gap-2.5 sm:gap-3 overflow-x-auto md:overflow-visible snap-x snap-mandatory scroll-px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {kpis.map(k => (
          <button key={k.label} onClick={() => onOpen(k.tab)}
            className="snap-start shrink-0 w-[44%] md:w-auto text-left bg-white rounded-2xl border border-slate-200 shadow-xs px-3.5 py-3 min-w-0 hover:border-brand-300 transition-colors">
            <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-slate-500 truncate">{k.label}</div>
            <div className={`mt-0.5 text-lg sm:text-xl font-black tabular-nums truncate ${k.tone}`}>{k.value}</div>
            <div className="text-[11px] text-slate-500 tabular-nums truncate">{k.sub}</div>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-3 items-stretch">
        <div className="lg:col-span-2 flex flex-col gap-3 min-w-0">
          {(seeQuotes || seeMoney) && (
            <Panel title="Son 6 ay" action={
              seeQuotes && (seeMoney || seeExp)
                ? <div className="flex gap-0.5 p-0.5 rounded-lg bg-slate-100">{chartTab('quotes', 'Teklif')}{chartTab('money', 'Tahsilat / Harcama')}</div>
                : more('reports')}>
              {chart === 'quotes' && seeQuotes
                ? <MonthlyChart data={s.months.map(m => ({ label: m.label, ...m.q }))}
                    series={[{ label: 'Verilen teklif', cls: 'fill-brand-400', dot: 'bg-brand-400' }, { label: 'Onaylanan', cls: 'fill-accent-600', dot: 'bg-accent-600' }]} />
                : <MonthlyChart data={s.months.map(m => ({ label: m.label, ...m.m }))} fmt={tl}
                    series={[{ label: 'Tahsilat', cls: 'fill-accent-600', dot: 'bg-accent-600' }, { label: 'Harcama', cls: 'fill-orange-400', dot: 'bg-orange-400' }]} />}
            </Panel>
          )}
          {seeQuotes && (
            <Panel title={`Takip edilecek teklifler · ${s.follow.length}`} action={more('quotes')} className="flex-1">
              {s.follow.length === 0 ? empty('Bekleyen teklif yok.') : (
                <ul className="divide-y divide-slate-100 -mx-1">
                  {s.follow.slice(0, 5).map(q => {
                    const age = Math.floor((now.getTime() - new Date(q.createdAt).getTime()) / 86400e3);
                    return (
                      <li key={q.id}>
                        <button onClick={() => onOpenQuote(q)} className="w-full flex items-center gap-3 px-1 py-2 text-left hover:bg-slate-50 rounded-lg">
                          <span className={`w-1.5 self-stretch rounded-full ${q.urgency === 'acil' ? 'bg-rose-500' : age >= 3 ? 'bg-amber-400' : 'bg-slate-200'}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold text-slate-900 truncate">{q.customerName}</span>
                            <span className="block text-[11px] text-slate-500 truncate">{q.quoteNumber} · {age === 0 ? 'bugün' : `${age} gündür bekliyor`}{q.urgency === 'acil' ? ' · ACİL' : ''}</span>
                          </span>
                          <span className="text-sm font-black text-slate-800 tabular-nums whitespace-nowrap">{tl(quoteTry(q, rates))}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          {seeMoney && (
            <Panel title="Yaklaşan vadeler · 30 gün" action={more('collections')}>
              {s.dues.length === 0 ? empty('30 gün içinde vadesi gelen çek/senet yok.') : (
                <>
                  <div className="text-[11px] text-slate-500 mb-1">Toplam <b className="text-slate-800 tabular-nums">{tl(s.dueSum)}</b></div>
                  <ul className="divide-y divide-slate-100">
                    {s.dues.slice(0, 5).map(c => (
                      <li key={c.id} className="flex items-center gap-2 py-2">
                        <span className="w-12 shrink-0 text-[11px] font-bold text-accent-700 tabular-nums">{shortDate(c.dueDate!)}</span>
                        <span className="min-w-0 flex-1 text-xs font-semibold text-slate-800 truncate">{c.customerName}</span>
                        <span className="text-xs font-black text-slate-800 tabular-nums whitespace-nowrap">{fmtAmt(c.amount, c.currency)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          )}
          {allowed('notes') && (
            <Panel title="Hatırlatmalar" action={more('notes')} className="flex-1">
              {s.reminders.length === 0 ? empty('Hatırlatmalı not yok.') : (
                <ul className="divide-y divide-slate-100">
                  {s.reminders.slice(0, 4).map(n => {
                    const late = new Date(n.remindAt!).getTime() < now.getTime();
                    return (
                      <li key={n.id} className="py-2">
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

      {/* Firmalar, harcamalar, son hareketler */}
      <div className="-mx-3 px-3 md:mx-0 md:px-0 flex md:grid md:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch overflow-x-auto md:overflow-visible snap-x snap-mandatory scroll-px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:snap-start [&>*]:shrink-0 [&>*]:w-[86%] md:[&>*]:w-auto">
        {seeQuotes && (
          <Panel title={`${s.year} en çok çalışılan firmalar`} action={more('customers')}>
            {s.topFirms.length === 0 ? empty('Bu yıl onaylanan teklif yok.') : s.topFirms.map(f => (
              <BarRow key={f.name} label={`${f.name} · ${f.n} sipariş`} value={tl(f.amt)} pct={(f.amt / s.topFirms[0].amt) * 100}
                cls="bg-accent-500" onClick={onOpenCustomer ? () => onOpenCustomer(f.name) : undefined} />
            ))}
          </Panel>
        )}
        {seeExp && (
          <Panel title="Bu ay harcamalar" action={more('expenses')}>
            {s.cats.length === 0 ? empty('Bu ay harcama kaydı yok.') : s.cats.map(([c, v]) => (
              <BarRow key={c} label={c} value={tl(v)} pct={(v / s.cats[0][1]) * 100} cls="bg-orange-400" />
            ))}
          </Panel>
        )}
        <Panel title="Son hareketler" action={allowed('notes') ? more('notes') : undefined} className="md:col-span-2 lg:col-span-1">
          {feed.length === 0 ? empty('Henüz hareket yok.') : (
            <ul className="divide-y divide-slate-100">
              {feed.map(a => (
                <li key={a.id} className="py-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 truncate">{a.action}</span>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">{ago(a.timestamp)}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{a.description}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
};

const HomeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" />
  </svg>
);

export const SECTION_META: Record<Exclude<ActiveTab, 'home'>, { title: string; icon: React.ElementType; tone: string }> = {
  quotes: { title: 'Teklifler', icon: FileText, tone: 'bg-brand-50 text-brand-600' },
  customers: { title: 'Müşteriler', icon: Users, tone: 'bg-sky-50 text-sky-600' },
  collections: { title: 'Yapılan Tahsilatlar', icon: Wallet, tone: 'bg-accent-50 text-accent-700' },
  expenses: { title: 'Yapılan Harcamalar', icon: Receipt, tone: 'bg-orange-50 text-orange-600' },
  materials: { title: 'Malzemeler', icon: Package, tone: 'bg-teal-50 text-teal-600' },
  reports: { title: 'Rapor', icon: BarChart3, tone: 'bg-indigo-50 text-indigo-600' },
  notes: { title: 'Notlar', icon: StickyNote, tone: 'bg-amber-50 text-amber-600' },
  admin: { title: 'Yönetim', icon: ShieldCheck, tone: 'bg-slate-100 text-slate-700' },
};
/** Bölüm sayfalarının üstündeki başlık: geri, başlık, ana sayfa */
export const PageHeader: React.FC<{
  title: string;
  icon: React.ElementType;
  tone: string;
  onBack: () => void;
  onHome: () => void;
}> = ({ title, icon: Icon, tone, onBack, onHome }) => (
  <div className="flex items-center justify-between gap-2 mb-4">
    <button
      onClick={onBack}
      className="flex items-center gap-1 pl-2 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold shadow-xs hover:bg-slate-50 active:bg-slate-100"
    >
      <ChevronRight className="w-4 h-4 rotate-180" /> Geri
    </button>
    <h1 className="flex items-center gap-2 font-black text-slate-900 text-base sm:text-xl min-w-0">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-4 h-4" /></span>
      <span className="truncate">{title}</span>
    </h1>
    <button
      onClick={onHome}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold shadow-xs"
      aria-label="Ana Sayfa"
    >
      <HomeIcon className="w-4 h-4" /> <span className="hidden sm:inline">Ana Sayfa</span>
    </button>
  </div>
);

