import React, { useMemo } from 'react';
import { FilePlus2, Wallet, Receipt, StickyNote, ChevronRight, CalendarClock, BellRing, TrendingUp, TrendingDown, Sparkles, UserRoundCheck, Trophy, CircleDollarSign, AlertTriangle, Target } from 'lucide-react';
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
  const tips = useMemo(() => buildTips({ quotes, collections, rates, t, canQuotes, canMoney }), [quotes, collections, rates, t, canQuotes, canMoney]);
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

      {/* Öneriler */}
      {tips.length > 0 && (
        <section>
          <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5 mb-2 px-1"><Sparkles className="w-4 h-4 text-brand-600" /> Öneriler</h2>
          <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 [scrollbar-width:none]">
            {tips.map(tip => (
              <button key={tip.id} onClick={() => tip.quote ? onOpenQuote(tip.quote) : onOpen(tip.tab)}
                className="snap-start shrink-0 w-[78%] sm:w-72 text-left bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 hover:border-brand-300 active:bg-slate-50 transition flex gap-3">
                <span className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center ${tip.tone}`}><tip.icon className="w-4.5 h-4.5" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-slate-900 leading-snug">{tip.title}</span>
                  <span className="block text-xs text-slate-500 mt-0.5 leading-snug">{tip.text}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

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

type Tip = { id: string; icon: React.ElementType; tone: string; title: string; text: string; tab: Tab; quote?: Quote };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5);

/** Verilerden kısa, işe yarar öneriler üretir (en fazla 6) */
function buildTips({ quotes, collections, rates, t, canQuotes, canMoney }: {
  quotes: Quote[]; collections: Collection[]; rates: ReturnType<typeof useRates>; t: string; canQuotes: boolean; canMoney: boolean;
}): Tip[] {
  const tips: Tip[] = [];
  const won = (q: Quote) => q.status === 'onaylandi' || q.status === 'siparis';

  if (canMoney) {
    // Vadesi geçmiş ama hâlâ portföyde görünen çek/senetler (son 30 gün)
    const past = collections.filter(c => c.dueDate && c.dueDate < t && daysBetween(c.dueDate, t) <= 30);
    if (past.length) tips.push({ id: 'due-past', icon: AlertTriangle, tone: 'bg-rose-50 text-rose-600', tab: 'collections',
      title: `${past.length} çek/senedin vadesi geçti`, text: `Toplam ${tl(sumTry(past))}. Bankaya verildi mi, kontrol edin.` });
    // Bu hafta vadesi gelenler
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const l7 = `${in7.getFullYear()}-${pad(in7.getMonth() + 1)}-${pad(in7.getDate())}`;
    const week = collections.filter(c => c.dueDate && c.dueDate >= t && c.dueDate <= l7);
    if (week.length) tips.push({ id: 'due-week', icon: CircleDollarSign, tone: 'bg-accent-50 text-accent-700', tab: 'collections',
      title: `Bu hafta ${tl(sumTry(week))} vade`, text: `${week.length} çek/senet 7 gün içinde tahsile dönüyor.` });
  }

  if (canQuotes) {
    // Son 60 günün en büyük bekleyen teklifi
    const big = quotes.filter(q => PENDING_STATUSES.includes(q.status) && daysBetween(q.createdAt, t) <= 60)
      .map(q => ({ q, v: quoteTry(q, rates) })).sort((a, b) => b.v - a.v)[0];
    if (big && big.v > 0) tips.push({ id: 'big', icon: Target, tone: 'bg-brand-50 text-brand-700', tab: 'quotes', quote: big.q,
      title: `En büyük fırsat: ${big.q.customerName}`, text: `${tl(big.v)} teklif ${daysBetween(big.q.createdAt, t)} gündür kararda.` });

    // Daha önce iş yapılmış ama 120+ gündür teklif verilmeyen firmalar
    const last = new Map<string, { at: string; won: number; name: string }>();
    for (const q of quotes) {
      const k = q.customerName.trim().toLocaleLowerCase('tr');
      const r = last.get(k) || { at: '', won: 0, name: q.customerName };
      if ((q.createdAt || '') > r.at) r.at = q.createdAt || '';
      if (won(q)) r.won += quoteTry(q, rates);
      last.set(k, r);
    }
    const sleeping = [...last.values()].filter(r => r.won > 0 && r.at && daysBetween(r.at, t) >= 120).sort((a, b) => b.won - a.won);
    if (sleeping.length) tips.push({ id: 'sleep', icon: UserRoundCheck, tone: 'bg-sky-50 text-sky-700', tab: 'customers',
      title: `${sleeping[0].name} uzun süredir sessiz`, text: `${Math.floor(daysBetween(sleeping[0].at, t) / 30)} aydır teklif yok; geçmişte ${tl(sleeping[0].won)} iş yapıldı.${sleeping.length > 1 ? ` (+${sleeping.length - 1} firma daha)` : ''}` });

    // Son 12 ayın en iyi müşterisi
    const y = new Date(); y.setFullYear(y.getFullYear() - 1);
    const ys = y.toISOString().slice(0, 10);
    const by = new Map<string, number>();
    for (const q of quotes) if (won(q) && (q.createdAt || '') >= ys) by.set(q.customerName, (by.get(q.customerName) || 0) + quoteTry(q, rates));
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) tips.push({ id: 'top', icon: Trophy, tone: 'bg-violet-50 text-violet-600', tab: 'customers',
      title: `Yılın müşterisi: ${top[0]}`, text: `Son 12 ayda ${tl(top[1])} onaylı iş.` });

    // Onay oranı: son 90 gün vs önceki 90 gün
    const rateOf = (from: number, to: number) => {
      const qs = quotes.filter(q => { const d = daysBetween(q.createdAt, t); return d >= from && d < to && q.status !== 'iptal'; });
      const tot = qs.reduce((s, q) => s + quoteTry(q, rates), 0);
      return tot ? qs.filter(won).reduce((s, q) => s + quoteTry(q, rates), 0) / tot : null;
    };
    const r1 = rateOf(0, 90), r0 = rateOf(90, 180);
    if (r1 != null && r0 != null && Math.abs(r1 - r0) >= 0.03) {
      const up = r1 > r0;
      tips.push({ id: 'rate', icon: up ? TrendingUp : TrendingDown, tone: up ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600', tab: 'reports',
        title: `Onay oranı %${Math.round(r1 * 100)} (${up ? 'yükseliyor' : 'düşüyor'})`, text: `Son 3 ay, önceki 3 aya göre (%${Math.round(r0 * 100)}).` });
    }
  }
  return tips.slice(0, 6);
}
