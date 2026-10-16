import React, { useMemo } from 'react';
import { FilePlus2, Wallet, Receipt, StickyNote, ChevronRight, CalendarClock, BellRing, TrendingUp, TrendingDown } from 'lucide-react';
import { Collection, Customer, Expense, Quote, QuickNote } from '../types';
import { PENDING_STATUSES } from '../lib/quoteRules';
import { quoteTry, useRates } from '../lib/rates';
import { STATUS_LABEL } from './CustomerAccount';
import type { ActiveTab } from './Navigation';

type Tab = Exclude<ActiveTab, 'home'>;

const tl = (v: number) => `${Math.round(v).toLocaleString('tr-TR')} TL`;
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const trDay = (s: string) => s.slice(0, 10).split('-').reverse().join('.');
const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
};
const sumTry = (list: { amount: number; currency: string }[]) => list.filter(x => (x.currency || 'TRY') === 'TRY').reduce((t, x) => t + (x.amount || 0), 0);

/**
 * Sade ana sayfa: hızlı işlemler, bölümler (tek dokunuşla, yanında kısa bilgi), son teklifler ve yaklaşan vadeler.
 */
export const SimpleHome: React.FC<{
  quotes: Quote[];
  customers: Customer[];
  collections: Collection[];
  expenses: Expense[];
  notes: QuickNote[];
  sections: Tab[];
  onOpen: (tab: Tab) => void;
  onOpenQuote: (q: Quote) => void;
  canAdd: { quote: boolean; collection: boolean; expense: boolean };
  onNewQuote: () => void;
  onNewCollection: () => void;
  onNewExpense: () => void;
  onNewNote: () => void;
}> = ({ quotes, customers, collections, expenses, notes, sections, onOpen, onOpenQuote, canAdd, onNewQuote, onNewCollection, onNewExpense, onNewNote }) => {
  const rates = useRates(quotes);
  const t = today();
  const month = t.slice(0, 7);
  const canMoney = sections.includes('collections');
  const canExp = sections.includes('expenses');
  const canQuotes = sections.includes('quotes');
  const stats = useMemo(() => {
    const now = new Date();
    const keys = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    });
    // upTo: geçen ayı bugünün gününe kadar sayarak adil karşılaştırma
    const calc = (key: string, upTo?: string) => {
      const inM = (s?: string) => !!s && s.startsWith(key) && (!upTo || s.slice(0, 10) <= upTo);
      const qs = quotes.filter(q => inM(q.createdAt) && q.status !== 'iptal');
      const won = qs.filter(q => q.status === 'onaylandi' || q.status === 'siparis');
      return {
        key,
        teklif: qs.reduce((t, q) => t + quoteTry(q, rates), 0),
        adet: qs.length,
        onay: won.reduce((t, q) => t + quoteTry(q, rates), 0),
        onayAdet: won.length,
        tahsilat: sumTry(collections.filter(c => inM(c.date))),
        harcama: sumTry(expenses.filter(e => inM(e.date))),
      };
    };
    const months = keys.map(key => calc(key));
    const day = Math.min(now.getDate(), new Date(Number(keys[4].slice(0, 4)), Number(keys[4].slice(5)), 0).getDate());
    const pending = quotes.filter(q => PENDING_STATUSES.includes(q.status));
    return { months, cur: months[5], prev: months[4], prevSame: calc(keys[4], `${keys[4]}-${pad(day)}`), pendingCount: pending.length, pendingAmt: pending.reduce((t, q) => t + quoteTry(q, rates), 0) };
  }, [quotes, collections, expenses, rates]);
  const reminders = useMemo(() => {
    const end = `${t}T23:59:59`;
    return notes.filter(n => !n.done && n.remindAt && n.remindAt <= end).sort((a, b) => a.remindAt!.localeCompare(b.remindAt!)).slice(0, 4);
  }, [notes, t]);

  const recent = useMemo(() => [...quotes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5), [quotes]);
  const dues = useMemo(() => {
    const limit = new Date(); limit.setDate(limit.getDate() + 14);
    const l = `${limit.getFullYear()}-${pad(limit.getMonth() + 1)}-${pad(limit.getDate())}`;
    return collections.filter(c => c.dueDate && c.dueDate >= t && c.dueDate <= l)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).slice(0, 5);
  }, [collections, t]);

  const actions = [
    canAdd.quote && { label: 'Yeni Teklif', icon: FilePlus2, cls: 'bg-brand-600 text-white', on: onNewQuote },
    canAdd.collection && { label: 'Tahsilat Ekle', icon: Wallet, cls: 'bg-accent-500 text-white', on: onNewCollection },
    canAdd.expense && { label: 'Harcama Ekle', icon: Receipt, cls: 'bg-brand-900 text-white', on: onNewExpense },
    { label: 'Not Al', icon: StickyNote, cls: 'bg-white text-brand-700 border border-brand-200', on: onNewNote },
  ].filter(Boolean) as { label: string; icon: React.ElementType; cls: string; on: () => void }[];

  return (
    <div className="space-y-5 pb-4">
      <div>
        <p className="text-sm text-slate-500">{greeting()} 👋</p>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900">Ne yapmak istersiniz?</h1>
      </div>

      {/* Hızlı işlemler */}
      <div className={`grid gap-2.5 ${actions.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {actions.map(a => (
          <button key={a.label} onClick={a.on}
            className={`flex items-center gap-2.5 px-3.5 py-3.5 rounded-2xl font-bold text-sm shadow-sm active:scale-[0.98] transition ${a.cls}`}>
            <a.icon className="w-5 h-5 shrink-0" /> <span className="text-left leading-tight">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Bu ay: özet ve son 6 ay grafiği */}
      {(canQuotes || canMoney) && <MonthPanel stats={stats} canQuotes={canQuotes} canMoney={canMoney} canExp={canExp} onOpen={onOpen} />}

      {/* Bugünün hatırlatmaları */}
      {reminders.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs">
          <header className="flex items-center justify-between px-4 pt-3.5 pb-1">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5"><BellRing className="w-4 h-4 text-cyan-600" /> Bugünün hatırlatmaları</h2>
            <button onClick={() => onOpen('notes')} className="text-xs font-bold text-brand-700 flex items-center">Notlar <ChevronRight className="w-3.5 h-3.5" /></button>
          </header>
          <div className="divide-y divide-slate-100">
            {reminders.map(n => (
              <button key={n.id} onClick={() => onOpen('notes')} className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <span className={`w-14 shrink-0 text-xs font-black tabular-nums ${n.remindAt!.slice(0, 10) < t ? 'text-rose-600' : 'text-cyan-700'}`}>
                  {n.remindAt!.slice(0, 10) < t ? trDay(n.remindAt!).slice(0, 5) : new Date(n.remindAt!).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="min-w-0 flex-1 text-sm text-slate-800 line-clamp-2">{n.content}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Son teklifler */}
        {sections.includes('quotes') && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-xs">
            <header className="flex items-center justify-between px-4 pt-3.5 pb-1">
              <h2 className="text-sm font-black text-slate-900">Son teklifler</h2>
              <button onClick={() => onOpen('quotes')} className="text-xs font-bold text-brand-700 flex items-center">Tümü <ChevronRight className="w-3.5 h-3.5" /></button>
            </header>
            <div className="divide-y divide-slate-100">
              {recent.map(q => {
                const st = STATUS_LABEL[q.status];
                return (
                  <button key={q.id} onClick={() => onOpenQuote(q)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900 truncate">{q.customerName}</span>
                      <span className="block text-[11px] text-slate-500">{q.quoteNumber} · {trDay(q.createdAt)}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-sm font-black text-slate-900 tabular-nums">{tl(quoteTry(q, rates))}</span>
                      {st && <span className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${st.cls}`}>{st.label}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Yaklaşan vadeler */}
        {sections.includes('collections') && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-xs">
            <header className="flex items-center justify-between px-4 pt-3.5 pb-1">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-brand-600" /> Yaklaşan çek / senet vadeleri</h2>
              <button onClick={() => onOpen('collections')} className="text-xs font-bold text-brand-700 flex items-center">Tümü <ChevronRight className="w-3.5 h-3.5" /></button>
            </header>
            {dues.length === 0 ? <p className="px-4 pb-4 pt-2 text-sm text-slate-400">Önümüzdeki 14 günde vade yok.</p> : (
              <div className="divide-y divide-slate-100">
                {dues.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-14 shrink-0 text-xs font-black text-brand-700 tabular-nums">{trDay(c.dueDate!).slice(0, 5)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900 truncate">{c.customerName}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{[c.method, c.bankName].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-sm font-black text-slate-900 tabular-nums">{c.amount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} {c.currency === 'TRY' ? 'TL' : c.currency}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const AY_UZUN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const short = (v: number) => v >= 1e6 ? `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn` : v >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('tr-TR')} B` : `${Math.round(v)}`;

type Month = { key: string; teklif: number; adet: number; onay: number; onayAdet: number; tahsilat: number; harcama: number };

/** Geçen aya göre değişim rozeti */
const Change: React.FC<{ cur: number; prev: number }> = ({ cur, prev }) => {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? 'text-emerald-300' : 'text-rose-300'}`}><Icon className="w-3 h-3" />%{Math.abs(pct)}</span>;
};

const MonthPanel: React.FC<{
  stats: { months: Month[]; cur: Month; prev: Month; prevSame: Month; pendingCount: number; pendingAmt: number };
  canQuotes: boolean; canMoney: boolean; canExp: boolean;
  onOpen: (tab: Tab) => void;
}> = ({ stats, canQuotes, canMoney, canExp, onOpen }) => {
  const [mode, setMode] = React.useState<'teklif' | 'tahsilat'>(canQuotes ? 'teklif' : 'tahsilat');
  const { months, cur, prev, prevSame } = stats;
  const m = Number(cur.key.slice(5)) - 1;
  const val = (x: Month) => mode === 'teklif' ? x.teklif : x.tahsilat;
  const max = Math.max(1, ...months.map(x => Math.max(val(x), mode === 'teklif' ? x.onay : 0)));
  const rate = cur.teklif ? Math.round((cur.onay / cur.teklif) * 100) : 0;
  const tiles = [
    canQuotes && { label: 'Verilen teklif', value: tl(cur.teklif), sub: `${cur.adet} teklif`, change: <Change cur={cur.teklif} prev={prevSame.teklif} />, tab: 'quotes' as Tab },
    canQuotes && { label: 'Onaylanan', value: tl(cur.onay), sub: `${cur.onayAdet} teklif · %${rate}`, change: <Change cur={cur.onay} prev={prevSame.onay} />, tab: 'quotes' as Tab },
    canMoney && { label: 'Tahsilat', value: tl(cur.tahsilat), sub: `geçen ay ${short(prev.tahsilat)} TL`, change: <Change cur={cur.tahsilat} prev={prevSame.tahsilat} />, tab: 'collections' as Tab },
    canExp ? { label: 'Harcama', value: tl(cur.harcama), sub: `geçen ay ${short(prev.harcama)} TL`, change: null, tab: 'expenses' as Tab }
      : canQuotes && { label: 'Bekleyen', value: tl(stats.pendingAmt), sub: `${stats.pendingCount} teklif`, change: null, tab: 'quotes' as Tab },
  ].filter(Boolean) as { label: string; value: string; sub: string; change: React.ReactNode; tab: Tab }[];

  return (
    <section className="rounded-3xl p-4 sm:p-5 text-white shadow-md bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 overflow-hidden relative">
      <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-accent-500/20 blur-2xl pointer-events-none" />
      <div className="relative flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-200">{AY_UZUN[m]} {cur.key.slice(0, 4)}</p>
          <h2 className="text-lg font-black leading-tight">Bu ay nasıl gidiyor?</h2>
        </div>
        {canQuotes && canMoney && (
          <div className="flex bg-white/10 rounded-full p-0.5 text-[11px] font-bold">
            {(['teklif', 'tahsilat'] as const).map(k => (
              <button key={k} onClick={() => setMode(k)} className={`px-2.5 py-1 rounded-full transition ${mode === k ? 'bg-white text-brand-800' : 'text-white/80'}`}>{k === 'teklif' ? 'Teklif' : 'Tahsilat'}</button>
            ))}
          </div>
        )}
      </div>

      <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
        {tiles.map(k => (
          <button key={k.label} onClick={() => onOpen(k.tab)} className="text-left rounded-2xl bg-white/10 hover:bg-white/15 px-3 py-2.5 min-w-0 transition">
            <span className="flex items-center justify-between gap-1 text-[11px] text-brand-100 font-semibold">{k.label} {k.change}</span>
            <span className="block text-base sm:text-lg font-black tabular-nums truncate">{k.value}</span>
            <span className="block text-[10px] text-brand-200 truncate">{k.sub}</span>
          </button>
        ))}
      </div>

      {/* Son 6 ay */}
      <div className="relative mt-4">
        <div className="flex items-end gap-2 h-28">
          {months.map((x, i) => {
            const v = val(x);
            const last = i === months.length - 1;
            return (
              <div key={x.key} className="flex-1 h-full flex flex-col justify-end items-center gap-1 min-w-0">
                <span className={`text-[9px] tabular-nums ${last ? 'text-white font-bold' : 'text-brand-200'}`}>{v ? short(v) : ''}</span>
                <div className="w-full flex items-end justify-center gap-0.5 flex-1">
                  <div className={`w-full max-w-7 rounded-t-md transition-all ${last ? 'bg-accent-400' : 'bg-white/35'}`} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
                  {mode === 'teklif' && <div className={`w-full max-w-7 rounded-t-md ${last ? 'bg-emerald-200' : 'bg-accent-300/50'}`} style={{ height: `${Math.max(2, (x.onay / max) * 100)}%` }} />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-1 border-t border-white/15 pt-1">
          {months.map(x => <span key={x.key} className="flex-1 text-center text-[10px] text-brand-200">{AY[Number(x.key.slice(5)) - 1]}</span>)}
        </div>
        {mode === 'teklif' && (
          <div className="flex gap-3 mt-2 text-[10px] text-brand-100">
            <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-white/35" /> Verilen</span>
            <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-accent-300/60" /> Onaylanan</span>
          </div>
        )}
      </div>
    </section>
  );
};
