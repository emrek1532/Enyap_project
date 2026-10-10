import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Users, Wallet, Receipt, BarChart3, StickyNote, Package, ChevronRight, Plus, ShieldCheck } from 'lucide-react';
import { Collection, Customer, Expense, Quote, QuickNote } from '../types';
import { FOLLOW_UP_START, PENDING_STATUSES } from '../lib/quoteRules';
import { formatReminder } from '../lib/noteTime';
import { supabase } from '../lib/supabase';
import type { ActiveTab } from './Navigation';

interface HomePageProps {
  quotes: Quote[];
  customers: Customer[];
  collections: Collection[];
  expenses: Expense[];
  notes: QuickNote[];
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

/** Son 6 ay: verilen ve onaylanan teklif sayısı (tek eksen, iki seri) */
const MonthlyChart: React.FC<{ data: { label: string; total: number; won: number }[] }> = ({ data }) => {
  const [hover, setHover] = useState<number | null>(null);
  // Gerçek genişlikte çizilir: yazılar her ekranda aynı boyda kalır
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = Math.max(1, ...data.map(d => d.total));
  const step = max <= 5 ? 1 : Math.ceil(max / 4 / 5) * 5;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const H = 170, L = 30, B = 22, T = 8;
  const plotW = W - L - 4, plotH = H - B - T;
  const slot = plotW / data.length;
  const bw = Math.min(22, slot / 3.2);
  const y = (v: number) => T + plotH - (v / top) * plotH;
  return (
    <div className="relative" ref={box}>
      <div className="flex items-center gap-4 text-[11px] text-slate-500 mb-1">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-400" />Verilen teklif</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent-600" />Onaylanan</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Son 6 ay verilen ve onaylanan teklif sayısı">
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - 4} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="#94a3b8">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = L + slot * i + slot / 2;
          const bar = (v: number, x: number, cls: string) => v > 0 && (
            <path className={cls} d={`M${x},${y(0)} V${y(v) + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${y(0)} Z`} />
          );
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
              <rect x={cx - slot / 2} y={T} width={slot} height={plotH + B} fill={hover === i ? '#f1f5f9' : 'transparent'} />
              {bar(d.total, cx - bw - 1, 'fill-brand-400')}
              {bar(d.won, cx + 1, 'fill-accent-600')}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill="#64748b">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-6 bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-lg"
          style={{ left: `${Math.min(80, Math.max(2, ((hover + 0.5) / data.length) * 100 - 10))}%` }}>
          <div className="font-bold">{data[hover].label}</div>
          <div>{data[hover].total} teklif · {data[hover].won} onay</div>
        </div>
      )}
    </div>
  );
};

export const HomePage: React.FC<HomePageProps> = ({
  quotes, customers, collections, expenses, notes, onOpen, allowed, canAdd, onOpenQuote, onNewQuote, onNewCollection, onNewExpense,
}) => {
  const now = new Date();
  const today = ymd(now);
  const s = useMemo(() => {
    const month = today.slice(0, 7);
    const year = today.slice(0, 4);
    const pending = quotes.filter(q => PENDING_STATUSES.includes(q.status));
    const won = (q: Quote) => q.status === 'onaylandi' || q.status === 'siparis';
    const yearQuotes = quotes.filter(q => (q.createdAt || '').startsWith(year));
    const sum = (list: { totalAmount?: number; amount?: number }[]) => list.reduce((t, x) => t + (x.totalAmount ?? x.amount ?? 0), 0);
    const tryOnly = <T extends { currency: string }>(list: T[]) => list.filter(x => x.currency === 'TRY');
    const yearAmt = sum(yearQuotes);
    const monthQuotes = quotes.filter(q => (q.createdAt || '').startsWith(month));
    // Son 6 ay
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const list = quotes.filter(q => (q.createdAt || '').startsWith(key));
      return { label: MONTHS[d.getMonth()], total: list.length, won: list.filter(won).length };
    });
    // Takip: en eski bekleyenler önce (acil olanlar en üstte)
    const recent = pending.filter(q => new Date(q.createdAt).getTime() >= FOLLOW_UP_START);
    const follow = [...(recent.length ? recent : pending)].sort((a, b) =>
      (a.urgency === 'acil' ? 0 : 1) - (b.urgency === 'acil' ? 0 : 1) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const in30 = ymd(new Date(now.getTime() + 30 * 86400e3));
    const dues = collections.filter(c => c.dueDate && c.dueDate >= today && c.dueDate <= in30)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const reminders = notes.filter(n => !n.done && n.remindAt).sort((a, b) => (a.remindAt || '').localeCompare(b.remindAt || ''));
    return {
      pending: pending.length, pendingAmt: sum(tryOnly(pending)),
      monthCount: monthQuotes.length, monthAmt: sum(tryOnly(monthQuotes)),
      rate: yearAmt > 0 ? sum(yearQuotes.filter(won)) / yearAmt : 0,
      wonYear: yearQuotes.filter(won).length,
      colMonth: sum(tryOnly(collections.filter(c => c.date.startsWith(month)))),
      expMonth: sum(tryOnly(expenses.filter(e => e.date.startsWith(month)))),
      months, follow, dues, dueSum: sum(tryOnly(dues)), reminders, year,
      customers: customers.length, notes: notes.filter(n => !n.done).length,
    };
  }, [quotes, customers, collections, expenses, notes, today]);

  // Katalog sunucuda; sadece toplam sayıyı soruyoruz
  const [materialCount, setMaterialCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.from('materials').select('code', { count: 'exact', head: true })
      .then(({ count }) => { if (alive && count != null) setMaterialCount(count); });
    return () => { alive = false; };
  }, []);

  const seeQuotes = allowed('quotes');
  const seeMoney = allowed('collections');
  const kpis = [
    seeQuotes && { label: 'Bekleyen teklif', value: s.pending.toLocaleString('tr-TR'), sub: tl(s.pendingAmt), tab: 'quotes' as const, tone: 'text-purple-700' },
    seeQuotes && { label: 'Bu ay verilen', value: s.monthCount.toLocaleString('tr-TR'), sub: tl(s.monthAmt), tab: 'quotes' as const, tone: 'text-brand-700' },
    seeQuotes && { label: `${s.year} satış oranı`, value: `%${(s.rate * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`, sub: `${s.wonYear} teklif onaylandı`, tab: 'reports' as const, tone: 'text-accent-700' },
    seeMoney && { label: 'Bu ay tahsilat', value: tl(s.colMonth), sub: allowed('expenses') ? `harcama ${tl(s.expMonth)}` : '', tab: 'collections' as const, tone: 'text-slate-900' },
  ].filter(Boolean) as { label: string; value: string; sub: string; tab: Exclude<ActiveTab, 'home'>; tone: string }[];

  const shortcuts = ([
    { tab: 'quotes', title: 'Teklifler', Icon: FileText, tone: 'bg-brand-50 text-brand-600', stat: `${s.pending} bekleyen` },
    { tab: 'materials', title: 'Malzemeler', Icon: Package, tone: 'bg-teal-50 text-teal-600', stat: materialCount == null ? 'katalog' : `${materialCount.toLocaleString('tr-TR')} kalem` },
    { tab: 'customers', title: 'Müşteriler', Icon: Users, tone: 'bg-sky-50 text-sky-600', stat: `${s.customers.toLocaleString('tr-TR')} firma` },
    { tab: 'collections', title: 'Tahsilat', Icon: Wallet, tone: 'bg-accent-50 text-accent-700', stat: `${s.dues.length} yaklaşan vade` },
    { tab: 'expenses', title: 'Harcama', Icon: Receipt, tone: 'bg-orange-50 text-orange-600', stat: `bu ay ${tl(s.expMonth)}` },
    { tab: 'notes', title: 'Notlar', Icon: StickyNote, tone: 'bg-amber-50 text-amber-600', stat: `${s.notes} açık not` },
    { tab: 'reports', title: 'Rapor', Icon: BarChart3, tone: 'bg-indigo-50 text-indigo-600', stat: 'aylık özet' },
    { tab: 'admin', title: 'Yönetim', Icon: ShieldCheck, tone: 'bg-slate-100 text-slate-700', stat: 'personel, yetki' },
  ] as { tab: Exclude<ActiveTab, 'home'>; title: string; Icon: React.ElementType; tone: string; stat: string }[]).filter(t => allowed(t.tab));

  const dateText = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const more = (tab: Exclude<ActiveTab, 'home'>) => (
    <button onClick={() => onOpen(tab)} className="text-xs font-bold text-brand-600 hover:text-brand-800 inline-flex items-center">
      Tümü <ChevronRight className="w-3.5 h-3.5" />
    </button>
  );
  const empty = (t: string) => <p className="py-6 text-center text-xs text-slate-400">{t}</p>;

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

      {/* Bölümler */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {shortcuts.map(t => (
          <button key={t.tab} onClick={() => onOpen(t.tab)}
            className="group flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-3 py-2.5 text-left min-w-0 hover:border-brand-300 hover:shadow-sm transition-all">
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${t.tone}`}><t.Icon className="w-4.5 h-4.5" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-slate-900 truncate">{t.title}</span>
              <span className="block text-[11px] text-slate-500 truncate">{t.stat}</span>
            </span>
          </button>
        ))}
      </div>
      {/* Özet rakamlar */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(k => (
            <button key={k.label} onClick={() => onOpen(k.tab)}
              className="text-left bg-white rounded-2xl border border-slate-200 shadow-xs px-4 py-3 min-w-0 hover:border-brand-300 transition-colors">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 truncate">{k.label}</div>
              <div className={`mt-1 text-xl sm:text-2xl font-black tabular-nums break-words ${k.tone}`}>{k.value}</div>
              {k.sub && <div className="text-[11px] text-slate-500 tabular-nums truncate">{k.sub}</div>}
            </button>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-3 items-start">
        {seeQuotes && (
          <div className="lg:col-span-2 grid gap-3 min-w-0">
            <Panel title="Son 6 ay" action={more('reports')}>
              <MonthlyChart data={s.months} />
            </Panel>
            <Panel title={`Takip edilecek teklifler · ${s.follow.length}`} action={more('quotes')}>
              {s.follow.length === 0 ? empty('Bekleyen teklif yok.') : (
                <ul className="divide-y divide-slate-100 -mx-1">
                  {s.follow.slice(0, 6).map(q => {
                    const age = Math.floor((now.getTime() - new Date(q.createdAt).getTime()) / 86400e3);
                    return (
                      <li key={q.id}>
                        <button onClick={() => onOpenQuote(q)} className="w-full flex items-center gap-3 px-1 py-2 text-left hover:bg-slate-50 rounded-lg">
                          <span className={`w-1.5 self-stretch rounded-full ${q.urgency === 'acil' ? 'bg-rose-500' : age >= 3 ? 'bg-amber-400' : 'bg-slate-200'}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold text-slate-900 truncate">{q.customerName}</span>
                            <span className="block text-[11px] text-slate-500 truncate">
                              {q.quoteNumber} · {age === 0 ? 'bugün' : `${age} gündür bekliyor`}{q.urgency === 'acil' ? ' · ACİL' : ''}
                            </span>
                          </span>
                          <span className="text-sm font-black text-slate-800 tabular-nums whitespace-nowrap">{fmtAmt(q.totalAmount, q.currency)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        )}

        <div className={`grid gap-3 min-w-0 ${seeQuotes ? '' : 'lg:col-span-3 md:grid-cols-2'}`}>
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
            <Panel title="Hatırlatmalar" action={more('notes')}>
              {s.reminders.length === 0 ? empty('Hatırlatmalı not yok.') : (
                <ul className="divide-y divide-slate-100">
                  {s.reminders.slice(0, 5).map(n => {
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

