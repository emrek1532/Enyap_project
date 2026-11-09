import { trNum } from '../lib/num';
import React, { useMemo, useState } from 'react';
import { dayOf } from '../lib/dates';
import { ArrowRight, CalendarDays, Check, ChevronDown, MapPin, MapPinCheck, MessageCircle, ChevronLeft, ChevronRight, Clock, FileText, ListChecks, Building2, Phone, Receipt, Search, Wallet, X, BarChart3, FilePlus2, TrendingDown, TrendingUp, Target } from 'lucide-react';
import { Collection, Customer, Expense, Quote, SyncStatus } from '../types';
import { PENDING_STATUSES, needsFollowUp, quoteAgeInDays } from '../lib/quoteRules';
import { quoteTry, useRates } from '../lib/rates';
import type { ActiveTab } from './Sections';
import type { ToolInfo, ToolMode } from './QuickTools';
import { Targets, useSetting } from '../lib/settings';

type Tab = Exclude<ActiveTab, 'home'>;
/** Teklifler sayfasını süzülmüş açar: durum (all, aktif, takip, onaylandi, iptal) ve tarih aralığı */
export type QuoteView = { status: string; from?: string; to?: string };

const foldKey = (s: string) => s.trim().toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
/** Türkiye numarasını wa.me biçimine çevirir (0532… → 90532…) */
const waPhone = (p?: string) => {
  let d = (p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d.length >= 11 ? d : '';
};
const tl = (v: number) => `${trNum(Math.round(v))} TL`;
const lira = (v: number) => `₺ ${trNum(Math.round(v))}`;
const short = (v: number) => v >= 1e6 ? `${trNum((v / 1e6), { maximumFractionDigits: 1 })}M` : v >= 1e3 ? `${trNum(Math.round(v / 1e3))}B` : `${Math.round(v)}`;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const AY_UZUN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const sumTry = (list: { amount: number; currency: string }[]) => list.filter(x => (x.currency || 'TRY') === 'TRY').reduce((t, x) => t + (x.amount || 0), 0);
const dimOf = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const mkey = (y: number, m: number) => { const d = new Date(y, m, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

/** Seçili dönem: ay (y, m: 0-11) ya da yıl (y) */
type Period = { kind: 'month' | 'year'; y: number; m: number };
type Month = { key: string; teklif: number; adet: number; onay: number; onayAdet: number; tahsilat: number; harcama: number };
type Chart = '6m' | 'year' | 'all';

/** Bir tarih aralığının rakamları (iptal edilenler teklif toplamına girmez) */
function calcRange(quotes: Quote[], collections: Collection[], expenses: Expense[], qv: (q: Quote) => number, key: string, from: string, to: string): Month {
  const inR = (x?: string) => { if (!x) return false; const d = dayOf(x); return d >= from && d <= to; };
  const qs = quotes.filter(q => inR(q.createdAt) && q.status !== 'iptal');
  const won = qs.filter(q => q.status === 'onaylandi');
  return {
    key, adet: qs.length, onayAdet: won.length,
    teklif: qs.reduce((a, q) => a + qv(q), 0),
    onay: won.reduce((a, q) => a + qv(q), 0),
    tahsilat: sumTry(collections.filter(c => inR(c.date))),
    harcama: sumTry(expenses.filter(e => inR(e.date))),
  };
}

/**
 * Ana sayfa panosu: karşılama (dönem, bildirim, hızlı işlemler, kısayollar), rakam kartları, satış performansı,
 * satış dağılımı (Türkiye haritası), son teklifler, tahsilat durumu, yaklaşan ödemeler. Kartlara dokununca ilgili liste açılır.
 */
export const SimpleHome: React.FC<{
  quotes: Quote[];
  customers: Customer[];
  collections: Collection[];
  expenses: Expense[];
  sections: Tab[];
  onOpen: (tab: Tab) => void;
  onOpenQuotes?: (v: QuoteView) => void;
  onOpenQuote: (q: Quote) => void;
  canAdd: { quote: boolean; collection: boolean; expense: boolean };
  onNewQuote: () => void;
  onNewCollection: () => void;
  onNewExpense: () => void;
  onOpenCustomer?: (name: string) => void;
  userName: string;
  tools: ToolInfo[];
  onOpenTool: (m: ToolMode) => void;
  /** Takip bekleyen teklif sayısı (zil) */
  followCount?: number;
  syncStatus?: SyncStatus;
  onSync?: () => void;
  onSignOut?: () => void;
  userEmail?: string;
  /** "Uğradım" işareti (müşteri kaydı) */
  onSaveCustomer?: (c: Customer) => void;
}> = ({ quotes, customers, onSaveCustomer, collections, expenses, sections, onOpen, onOpenQuotes, onOpenQuote, canAdd, onNewQuote, onNewCollection, onNewExpense, onOpenCustomer, userName, tools, onOpenTool, syncStatus, onSync, onSignOut, userEmail }) => {
  const rates = useRates(quotes);
  const now = new Date();
  const t = ymd(now);
  const canMoney = sections.includes('collections');
  const canExp = sections.includes('expenses');
  const canQuotes = sections.includes('quotes');
  const openQuotes = (v: QuoteView) => (onOpenQuotes ? onOpenQuotes(v) : onOpen('quotes'));
  const [period, setPeriod] = useState<Period>(() => ({ kind: 'month', y: now.getFullYear(), m: now.getMonth() }));
  const [chart, setChart] = useState<Chart>('6m');
  const isYear = period.kind === 'year';
  const isCurrent = period.y === now.getFullYear() && (isYear || period.m === now.getMonth());

  const s = useMemo(() => {
    const qv = (q: Quote) => quoteTry(q, rates);
    const calc = (key: string, from: string, to: string) => calcRange(quotes, collections, expenses, qv, key, from, to);
    const monthCalc = (key: string) => calc(key, `${key}-01`, `${key}-31`);
    // Seçili dönem ve önceki dönem (bu dönemse önceki dönemin aynı günlerine kadar: adil karşılaştırma)
    let from: string, to: string, prevFrom: string, prevSameTo: string, dim: number;
    if (isYear) {
      from = `${period.y}-01-01`; to = `${period.y}-12-31`; dim = 12;
      prevFrom = `${period.y - 1}-01-01`;
      prevSameTo = isCurrent ? `${period.y - 1}-${pad(now.getMonth() + 1)}-${pad(Math.min(now.getDate(), dimOf(period.y - 1, now.getMonth())))}` : `${period.y - 1}-12-31`;
    } else {
      const key = mkey(period.y, period.m), pk = mkey(period.y, period.m - 1);
      const pd = new Date(period.y, period.m - 1, 1);
      dim = dimOf(period.y, period.m);
      from = `${key}-01`; to = `${key}-${pad(dim)}`;
      prevFrom = `${pk}-01`;
      prevSameTo = isCurrent ? `${pk}-${pad(Math.min(now.getDate(), dimOf(pd.getFullYear(), pd.getMonth())))}` : `${pk}-${pad(dimOf(pd.getFullYear(), pd.getMonth()))}`;
    }
    const cur = calc(from.slice(0, 7), from, to);
    const prevSame = calc(prevFrom.slice(0, 7), prevFrom, prevSameTo);
    // Kartlardaki çizgi: son 6 ay (yılda 12 ay)
    const sparkKeys = isYear ? Array.from({ length: 12 }, (_, k) => mkey(period.y, k)) : Array.from({ length: 6 }, (_, k) => mkey(period.y, period.m - 5 + k));
    const spark = sparkKeys.map(monthCalc);
    const mq = quotes.filter(q => { const d = dayOf(q.createdAt); return d >= from && d <= to; });
    const st = (pred: (q: Quote) => boolean) => { const l = mq.filter(pred); return { count: l.length, value: l.reduce((a, q) => a + qv(q), 0) }; };
    // İllere göre (dönemin iptal dışı teklifleri)
    // Firmalara göre (dönemin iptal dışı teklifleri): onaylanan tutar, toplam teklif, adet
    const fm = new Map<string, { name: string; onay: number; teklif: number; adet: number }>();
    for (const q of mq) {
      if (q.status === 'iptal' || !q.customerName) continue;
      const k = q.customerName.trim().toLocaleUpperCase('tr-TR');
      const f = fm.get(k) || { name: q.customerName.trim(), onay: 0, teklif: 0, adet: 0 };
      const v = qv(q);
      f.teklif += v; f.adet++; if (q.status === 'onaylandi') f.onay += v;
      fm.set(k, f);
    }
    const firms = [...fm.values()].sort((a, b) => b.onay - a.onay || b.teklif - a.teklif).slice(0, 5);
    return {
      cur, prevSame, from, to, dim, spark, firms,
      status: { onay: st(q => q.status === 'onaylandi'), bekleyen: st(q => PENDING_STATUSES.includes(q.status)), iptal: st(q => q.status === 'iptal') },
    };
  }, [quotes, collections, expenses, rates, t, period.kind, period.y, period.m]); // eslint-disable-line react-hooks/exhaustive-deps

  // Satış performansı grafiği: son 6 ay (seçili aya kadar), seçili yılın 12 ayı ya da tüm yıllar
  const bars = useMemo(() => {
    const qv = (q: Quote) => quoteTry(q, rates);
    if (chart === 'all') {
      const first = quotes.reduce((m, q) => (q.createdAt && q.createdAt < m ? q.createdAt : m), `${now.getFullYear()}`);
      const y0 = Math.max(Number(first.slice(0, 4)) || now.getFullYear(), now.getFullYear() - 7);
      return Array.from({ length: now.getFullYear() - y0 + 1 }, (_, i) => {
        const y = y0 + i;
        return { ...calcRange(quotes, collections, expenses, qv, String(y), `${y}-01-01`, `${y}-12-31`), label: String(y), shortLabel: String(y), from: `${y}-01-01`, to: `${y}-12-31` };
      });
    }
    const keys = chart === 'year' ? Array.from({ length: 12 }, (_, k) => mkey(period.y, k)) : Array.from({ length: 6 }, (_, k) => mkey(period.y, period.m - 5 + k));
    return keys.map(key => ({ ...calcRange(quotes, collections, expenses, qv, key, `${key}-01`, `${key}-31`), label: (chart === 'year' ? AY : AY_UZUN)[Number(key.slice(5)) - 1], shortLabel: AY[Number(key.slice(5)) - 1], from: `${key}-01`, to: `${key}-31` }));
  }, [quotes, collections, expenses, rates, chart, period.y, period.m]); // eslint-disable-line react-hooks/exhaustive-deps
  const hiKey = chart === 'all' ? String(period.y) : isYear && chart === '6m' ? mkey(period.y, now.getFullYear() === period.y ? now.getMonth() : 11) : isYear ? '' : mkey(period.y, period.m);

  const monthFrom = s.from, monthTo = s.to;
  const title = isYear ? `${period.y}` : `${AY_UZUN[period.m]} ${period.y}`;
  const vsName = isYear ? 'Geçen Yıla Göre' : 'Geçen Aya Göre';
  const firstName = userName.split(/\s+/)[0] || userName;

  // Son teklifler (en yeni 5) ve yaklaşan ödemeler
  const recent = useMemo(() => [...quotes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 8), [quotes]);
  // Yalnız çek ve senet (vadeli tahsilatlar); bugün ve sonrası, en yakın vade önce
  // Zil: tekrar görüşülmesi gereken (3 günü geçmiş bekleyen) teklifler, en eskisi önce
  const follow = useMemo(() => quotes.filter(needsFollowUp).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')), [quotes]);
  // Uğranacaklar: son 12 ayda onaylı işi olan, aktif, 3 aydır (ya da hiç) uğranmamış firmalar; en çok ciro önce
  const visits = useMemo(() => {
    const y1 = new Date(now); y1.setFullYear(y1.getFullYear() - 1);
    const m3 = new Date(now); m3.setMonth(m3.getMonth() - 3);
    const from = ymd(y1), stale = ymd(m3);
    const won = new Map<string, number>();
    for (const q of quotes) {
      if (q.status !== 'onaylandi' || !q.customerName || dayOf(q.createdAt) < from) continue;
      const k = foldKey(q.customerName);
      won.set(k, (won.get(k) || 0) + quoteTry(q, rates));
    }
    return customers
      .filter(c => (c.status || 'aktif') === 'aktif' && (!c.lastVisit || c.lastVisit < stale) && won.has(foldKey(c.name)))
      .map(c => ({ c, won: won.get(foldKey(c.name)) || 0 }))
      .sort((a, b) => b.won - a.won);
  }, [customers, quotes, rates, t]); // eslint-disable-line react-hooks/exhaustive-deps
  // Telefonda grafik / hedef / firmalar kapalı başlar (seçim cihazda hatırlanır)
  const [more, setMore] = useState(() => { try { return localStorage.getItem('home-more') === '1'; } catch { return false; } });
  const toggleMore = () => setMore(v => { try { localStorage.setItem('home-more', v ? '0' : '1'); } catch { /* yok */ } return !v; });
  const moreCls = more ? '' : 'max-lg:hidden';
  const dues = useMemo(() => collections.filter(c => c.dueDate && c.dueDate >= t && /çek|senet/i.test(c.method || '')).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')), [collections, t]);

  // Ay / Yıl düğmesi: ay seçiliyken Yıl'a basınca o ayın yılı, Yıl'dayken Ay'a basınca o yılın (bu yılsa bu ayın) Aralık'ı
  const setKind = (k: 'month' | 'year') => {
    if (k === period.kind) return;
    if (k === 'year') { setPeriod({ kind: 'year', y: period.y, m: 0 }); setChart('year'); }
    else { setPeriod({ kind: 'month', y: period.y, m: period.y === now.getFullYear() ? now.getMonth() : 11 }); if (chart === 'year') setChart('6m'); }
  };

  // Oklar: önceki / sonraki ay (yıl seçiliyse yıl); gelecek döneme gidilmez
  const stepPeriod = (d: number) => setPeriod(p => {
    if (p.kind === 'year') return { ...p, y: p.y + d };
    const x = new Date(p.y, p.m + d, 1);
    return { kind: 'month', y: x.getFullYear(), m: x.getMonth() };
  });

  const actions = [
    canAdd.quote && { label: 'Yeni Teklif', icon: FilePlus2, on: onNewQuote, primary: true },
    canAdd.collection && { label: 'Tahsilat', icon: Wallet, on: onNewCollection },
    canAdd.expense && { label: 'Harcama', icon: Receipt, on: onNewExpense },
  ].filter(Boolean) as { label: string; icon: React.ElementType; on: () => void; primary?: boolean }[];

  const kpis = [
    canQuotes && { label: 'Verilen teklif', value: s.cur.teklif, sub: `${s.cur.adet} teklif`, prev: s.prevSame.teklif, on: () => openQuotes({ status: 'all', from: monthFrom, to: monthTo }) },
    canQuotes && { label: 'Satış (onaylanan)', value: s.cur.onay, sub: `${s.cur.onayAdet} teklif`, prev: s.prevSame.onay, on: () => openQuotes({ status: 'onaylandi', from: monthFrom, to: monthTo }) },
    canMoney && { label: 'Tahsilat', value: s.cur.tahsilat, prev: s.prevSame.tahsilat, on: () => onOpen('collections') },
    canExp && { label: 'Harcama', value: s.cur.harcama, prev: s.prevSame.harcama, on: () => onOpen('expenses'), lowerIsBetter: true },
  ].filter(Boolean) as { label: string; value: number; sub?: string; prev: number; on: () => void; lowerIsBetter?: boolean }[];

  const today = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  const hello = now.getHours() < 12 ? 'Günaydın' : now.getHours() < 18 ? 'İyi günler' : 'İyi akşamlar';
  const conv = s.cur.teklif ? Math.round((s.cur.onay / s.cur.teklif) * 100) : 0;
  const glass = 'bg-white/10 hover:bg-white/15 border border-white/15 text-white';

  return (
    <div className="pb-4 space-y-4 sm:space-y-5">
      {/* Üst bant: selam, dönem, tek arama çubuğu, hızlı işlemler ve dönemin rakamları */}
      <section className="relative overflow-hidden rounded-3xl bg-[#0b2a4c] text-white px-4 pt-4 pb-3 sm:px-7 sm:pt-6 sm:pb-5">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 w-96 h-96 rounded-full bg-brand-500/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-20 bottom-0 w-72 h-72 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-sky-200/80"><span className="capitalize">{today}</span><span className="ml-2 text-[11px] text-sky-200/50 tabular-nums" title={`Sürüm ${__APP_VERSION__}`}>v{__APP_VERSION__}</span></p>
            <h1 className="text-xl sm:text-[26px] font-black tracking-tight leading-tight truncate">{hello}, {firstName}</h1>
          </div>
          <div className="flex items-center gap-2 lg:shrink-0">
            {(canQuotes || canMoney) && (
              <div className="flex flex-1 sm:flex-none items-center gap-1">
                <button onClick={() => stepPeriod(-1)} className={`w-9 h-9 rounded-xl flex items-center justify-center ${glass}`} aria-label={isYear ? 'Önceki yıl' : 'Önceki ay'} title={isYear ? 'Önceki yıl' : 'Önceki ay'}>
                  <ChevronLeft className="w-4.5 h-4.5" />
                </button>
                <span className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-sm font-bold ${glass} hover:bg-white/10`}>
                  <CalendarDays className="hidden sm:block w-4 h-4 text-sky-300" />
                  <span className="whitespace-nowrap">{title}</span>
                </span>
                <button onClick={() => stepPeriod(1)} disabled={isCurrent} className={`w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none ${glass}`} aria-label={isYear ? 'Sonraki yıl' : 'Sonraki ay'} title={isYear ? 'Sonraki yıl' : 'Sonraki ay'}>
                  <ChevronRight className="w-4.5 h-4.5" />
                </button>
                <div className="flex h-9 p-0.5 rounded-xl bg-white/10 border border-white/15 ml-1" role="tablist" aria-label="Dönem türü">
                  {([['month', 'Ay'], ['year', 'Yıl']] as const).map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={period.kind === k} onClick={() => setKind(k)}
                      className={`px-3 rounded-[10px] text-[13px] font-bold transition ${period.kind === k ? 'bg-white text-[#0b2a4c]' : 'text-sky-100 hover:text-white'}`}>{l}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bilgisayarda: tek arama kutusu (içinde diğer kısayollar) + hızlı işlemler */}
        <div className="relative mt-5 hidden md:flex gap-2.5 items-center">
          <div className="flex-1 min-w-0 flex items-center h-12 px-4 rounded-2xl bg-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]">
            <button onClick={() => onOpenTool('search')} className="flex-1 min-w-0 h-full flex items-center gap-3 text-left text-slate-500">
              <Search className="w-5 h-5 text-brand-600 shrink-0" />
              <span className="truncate text-[15px]">Ara, tekliflere sor, teklif hazırla ya da sesle kaydet…</span>
            </button>
          </div>
          {actions.map(a => (
            <button key={a.label} onClick={a.on}
              className={`flex items-center gap-2 h-12 px-4 rounded-2xl text-sm font-bold whitespace-nowrap shrink-0 ${a.primary ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-[0_10px_24px_-10px_rgba(14,140,240,0.9)]' : glass}`}>
              <a.icon className="w-4.5 h-4.5" /><span className={a.primary ? '' : 'hidden lg:inline'}>{a.label}</span>
            </button>
          ))}
        </div>

        {/* Telefonda: işlemler 3'lü (arama, sor, hazırla, sesle üst çubuktaki arama kutusundan açılır) */}
        <div className="relative mt-4 md:hidden space-y-2">
          {actions.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {actions.map(a => (
                <button key={a.label} onClick={a.on}
                  className={`flex items-center justify-center gap-1.5 h-11 rounded-2xl text-[13px] font-bold ${a.primary ? 'bg-brand-500 text-white' : 'bg-white text-[#0b2a4c]'}`}>
                  <a.icon className="w-4 h-4" />{a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dönemin rakamları */}
        {kpis.length > 0 && (
          <div className="relative mt-4 sm:mt-6 grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden bg-white/10">
            {kpis.map(k => (
              <button key={k.label} onClick={k.on} className="text-left bg-[#0b2a4c] hover:bg-[#0f335c] px-3 py-3 sm:px-4 sm:py-3.5 min-w-0">
                <span className="block text-[11px] sm:text-xs text-sky-200/80 font-semibold truncate">{k.label}</span>
                <span className="block mt-0.5 text-lg sm:text-2xl font-black tabular-nums truncate">{lira(k.value)}</span>
                <span className="mt-1 flex items-center gap-1.5 text-[11px] sm:text-xs text-sky-100/70 min-w-0">
                  <Change cur={k.value} prev={k.prev} lowerIsBetter={k.lowerIsBetter} dark />
                  <span className="truncate">{k.sub && <span className="hidden sm:inline">{k.sub} · </span>}{isYear ? 'geçen yıla göre' : 'geçen aya göre'}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Telefonda sıra: yapılacaklar, son teklifler, (açılır) grafik + hedef + firmalar; bilgisayarda solda grafik + son teklifler, sağda diğerleri */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:[grid-template-areas:'chart_todo'_'recent_side']">
        {(canQuotes || canMoney) && (
          <div className="lg:[grid-area:todo] min-w-0 flex flex-col max-lg:order-1">
            <TodoCard follow={canQuotes ? follow : []} dues={canMoney ? dues : []} visits={sections.includes('customers') ? visits : []} today={t} rates={rates}
              onOpenQuote={onOpenQuote} onAllFollow={() => openQuotes({ status: 'takip' })} onAllDues={() => onOpen('collections')}
              onOpenCustomer={onOpenCustomer} onAllVisits={() => onOpen('customers')}
              onVisited={onSaveCustomer ? c => onSaveCustomer({ ...c, lastVisit: t, updatedAt: new Date().toISOString() }) : undefined} />
          </div>
        )}
        {canQuotes && (
          <Card className={`lg:[grid-area:chart] max-lg:order-4 ${moreCls}`} title="Satış Performansı" icon={BarChart3}
            right={<Tabs value={chart} onChange={k => setChart(k as Chart)} items={[['6m', 'Son 6 Ay'], ['year', 'Yıl'], ['all', 'Tümü']]} />}>
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 sm:px-5 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-sky-300" />Verilen teklif</span>
              <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Onaylanan</span>
            </div>
            <BarsChart bars={bars} hi={hiKey}
              onPick={b => chart === 'all'
                ? (setPeriod({ kind: 'year', y: Number(b.key), m: 0 }), setChart('year'))
                : openQuotes({ status: 'all', from: b.from, to: b.to })} />
            <StatusSplit st={s.status} conv={conv} title={title} onPick={status => openQuotes({ status, from: monthFrom, to: monthTo })} />
          </Card>
        )}
        {canQuotes && (
          <Card className="lg:[grid-area:recent] max-lg:order-2" title="Son Teklifler" icon={FileText} right={<SeeAll onClick={() => openQuotes({ status: 'all' })} />}>
            <RecentQuotes quotes={recent} rates={rates} onOpen={onOpenQuote} />
          </Card>
        )}
        {canQuotes && (
          <button type="button" onClick={toggleMore} aria-expanded={more}
            className="lg:hidden max-lg:order-3 h-11 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-[#0b2a4c] flex items-center justify-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-500" />{more ? 'Grafik, hedef ve firmaları gizle' : 'Grafik, hedef ve firmaları göster'}
            <ChevronDown className={`w-4 h-4 transition-transform ${more ? 'rotate-180' : ''}`} />
          </button>
        )}
        <div className={`lg:[grid-area:side] min-w-0 flex flex-col gap-4 sm:gap-5 max-lg:order-5 ${moreCls}`}>
          {(canQuotes || canMoney) && !isYear && (
            <Card title={canMoney ? 'Aylık Hedef' : 'Satış Hedefi'} icon={Target} right={<span className="text-xs font-bold text-slate-500">{isCurrent ? 'Bu Ay' : AY_UZUN[period.m]}</span>}>
              <TargetCard cur={s.cur} canQuotes={canQuotes} canMoney={canMoney} day={isCurrent ? now.getDate() : s.dim} dim={s.dim} />
            </Card>
          )}
          {canQuotes && (
            <Card className="flex-1" title="En Çok İş Yapılan Firmalar" icon={Building2} right={<span className="text-xs font-bold text-slate-500">{title}</span>}>
              <FirmsCard firms={s.firms} onOpen={onOpenCustomer} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

const money = (v: number, cur: string) => cur === 'USD' ? `$${trNum(v, { maximumFractionDigits: 2 })}` : cur === 'EUR' ? `€${trNum(v, { maximumFractionDigits: 2 })}` : `${trNum(v, { maximumFractionDigits: 2 })} ₺`;

/** Bugün yapılacaklar: sekmeli tek liste — takip bekleyen teklifler (ara / WhatsApp), yaklaşan çek/senet vadeleri, uğranacak firmalar */
const TodoCard: React.FC<{
  follow: Quote[]; dues: Collection[]; visits: { c: Customer; won: number }[]; today: string; rates: ReturnType<typeof useRates>;
  onOpenQuote: (q: Quote) => void; onAllFollow: () => void; onAllDues: () => void;
  onOpenCustomer?: (name: string) => void; onAllVisits: () => void; onVisited?: (c: Customer) => void;
}> = ({ follow, dues, visits, today, rates, onOpenQuote, onAllFollow, onAllDues, onOpenCustomer, onAllVisits, onVisited }) => {
  const plus = (n: number) => { const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
  const week = dues.filter(c => (c.dueDate || '') <= plus(7));
  type K = 'follow' | 'dues' | 'visits';
  const tabs = ([['follow', 'Takip', follow.length], ['dues', 'Vade', week.length], ['visits', 'Uğra', visits.length]] as [K, string, number][])
    .filter(([k]) => (k === 'follow' ? follow.length : k === 'dues' ? dues.length : visits.length) > 0);
  const [pick, setPick] = useState<K | null>(null);
  const tab: K | undefined = tabs.find(x => x[0] === pick)?.[0] || tabs[0]?.[0];
  const [done, setDone] = useState<Set<string>>(new Set());
  const SHOW = 5;
  const iconBtn = 'w-9 h-9 rounded-xl flex items-center justify-center shrink-0';
  const all = tab === 'follow' ? onAllFollow : tab === 'dues' ? onAllDues : onAllVisits;
  const total = tab === 'follow' ? follow.length : tab === 'dues' ? dues.length : visits.length;
  return (
    <section className="flex-1 bg-white rounded-3xl border border-white shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)] min-w-0 overflow-hidden">
      <header className="px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-black text-[#0b2a4c] flex items-center gap-2"><ListChecks className="w-5 h-5 text-brand-500" />Bugün yapılacaklar</h2>
        {tab && total > SHOW && <button onClick={all} className="text-xs font-bold text-brand-600 shrink-0">Tümü ({total})</button>}
      </header>
      {tabs.length === 0 && <p className="px-5 py-4 text-sm text-slate-500">Bekleyen iş yok. 🎉</p>}
      {tabs.length > 0 && (
        <div className="px-4 sm:px-5 pb-1 flex gap-1.5" role="tablist" aria-label="Yapılacaklar">
          {tabs.map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setPick(k)}
              className={`flex-1 h-9 rounded-xl text-xs font-bold border ${tab === k ? 'bg-[#0b2a4c] border-[#0b2a4c] text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
              {label} <span className={`tabular-nums ${tab === k ? 'text-sky-200' : 'text-slate-500'}`}>{n}</span>
            </button>
          ))}
        </div>
      )}
      <div className="px-2 sm:px-3 pb-2 pt-1">
        {tab === 'follow' && follow.slice(0, SHOW).map(q => {
          const wa = waPhone(q.customerPhone);
          return (
            <div key={q.id} className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-slate-50">
              <button onClick={() => onOpenQuote(q)} className="flex-1 min-w-0 text-left">
                <span className="block text-[13px] font-semibold text-slate-800 truncate">{q.customerName}</span>
                <span className="block text-[11px] text-slate-500 truncate">{quoteAgeInDays(q)} gündür cevap yok · {lira(quoteTry(q, rates))}</span>
              </button>
              {wa && (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={`${iconBtn} bg-green-50 text-green-700 hover:bg-green-100`} aria-label={`${q.customerName} WhatsApp`}>
                  <MessageCircle className="w-4 h-4" />
                </a>
              )}
              {q.customerPhone && (
                <a href={`tel:${q.customerPhone.replace(/[^\d+]/g, '')}`} className={`${iconBtn} bg-emerald-50 text-emerald-600 hover:bg-emerald-100`} aria-label={`${q.customerName} ara`} title={q.customerPhone}>
                  <Phone className="w-4 h-4" />
                </a>
              )}
            </div>
          );
        })}
        {tab === 'dues' && (<>
          <p className="px-2 pt-1 text-[11px] font-bold text-brand-700">7 gün içinde {lira(sumTry(week))}</p>
          {dues.slice(0, SHOW).map(c => {
            const d = new Date(`${c.dueDate}T00:00:00`);
            const days = Math.round((d.getTime() - new Date(`${today}T00:00:00`).getTime()) / 864e5);
            return (
              <button key={c.id} onClick={onAllDues} className="w-full flex items-center gap-3 px-2 py-2 text-left rounded-xl hover:bg-slate-50">
                <span className="w-10 h-10 rounded-xl bg-sky-50 text-brand-700 flex flex-col items-center justify-center leading-none shrink-0">
                  <b className="text-sm font-black">{d.getDate()}</b><span className="text-[10px] font-bold mt-0.5">{AY[d.getMonth()]}</span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-800 truncate">{c.customerName}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{days === 0 ? 'Bugün' : days === 1 ? 'Yarın' : `${days} gün sonra`} · {[c.method, c.bankName].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="text-[13px] font-bold text-slate-900 tabular-nums shrink-0">{money(c.amount, c.currency)}</span>
              </button>
            );
          })}
        </>)}
        {tab === 'visits' && (<>
          <p className="px-2 pt-1 text-[11px] text-slate-500">Son 12 ayda iş yapılan, 3 aydır uğranmayan firmalar</p>
          {visits.slice(0, SHOW).map(({ c, won }) => {
            const ok = done.has(c.id);
            return (
              <div key={c.id} className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-slate-50">
                <button onClick={() => onOpenCustomer?.(c.name)} className="flex-1 min-w-0 text-left">
                  <span className="block text-[13px] font-semibold text-slate-800 truncate">{c.name}</span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {c.city || '—'} · {c.lastVisit ? `son uğrama ${c.lastVisit.split('-').reverse().join('.')}` : 'hiç uğranmadı'} · 12 ayda {lira(won)}
                  </span>
                </button>
                {c.phone && (
                  <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className={`${iconBtn} bg-emerald-50 text-emerald-600 hover:bg-emerald-100`} aria-label={`${c.name} ara`} title={c.phone}>
                    <Phone className="w-4 h-4" />
                  </a>
                )}
                {onVisited && (
                  <button type="button" disabled={ok} onClick={() => { setDone(x => new Set(x).add(c.id)); onVisited(c); }}
                    className={`h-9 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0 border ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:text-brand-700'}`}>
                    {ok ? <MapPinCheck className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}{ok ? 'Uğrandı' : 'Uğradım'}
                  </button>
                )}
              </div>
            );
          })}
        </>)}
      </div>
    </section>
  );
};

/** Teklif durumlarının payı (tutara göre) tek çubukta + dönüşüm oranı */
const StatusSplit: React.FC<{ st: Record<'onay' | 'bekleyen' | 'iptal', { count: number; value: number }>; conv: number; title: string; onPick: (status: string) => void }> = ({ st, conv, title, onPick }) => {
  const rows = [
    { key: 'onaylandi', label: 'Onaylanan', x: st.onay, c: 'bg-emerald-500' },
    { key: 'aktif', label: 'Bekleyen', x: st.bekleyen, c: 'bg-amber-400' },
    { key: 'iptal', label: 'İptal', x: st.iptal, c: 'bg-rose-400' },
  ];
  const total = rows.reduce((a, r) => a + r.x.value, 0);
  return (
    <div className="mt-auto mx-4 sm:mx-5 mb-4 p-3 sm:p-4 rounded-2xl bg-slate-50">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600">{title} teklifleri</p>
        <p className="text-xs text-slate-600">Dönüşüm <b className="text-sm font-black text-[#0b2a4c]">%{conv}</b></p>
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-slate-200 overflow-hidden flex">
        {rows.map(r => total > 0 && <span key={r.key} className={r.c} style={{ width: `${(r.x.value / total) * 100}%` }} />)}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {rows.map(r => (
          <button key={r.key} onClick={() => onPick(r.key)} className="text-left min-w-0 rounded-lg hover:bg-white px-1 py-0.5">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><i className={`w-2 h-2 rounded-full ${r.c}`} />{r.label} · {r.x.count}</span>
            <span className="block text-[13px] sm:text-sm font-black text-[#0b2a4c] tabular-nums truncate">{lira(r.x.value)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/** Dönemin en çok iş yapılan 5 firması: onaylanan tutar (çubuk), teklif adedi ve dönüşüm; dokununca firma kartı açılır */
const FirmsCard: React.FC<{ firms: { name: string; onay: number; teklif: number; adet: number }[]; onOpen?: (name: string) => void }> = ({ firms, onOpen }) => {
  if (!firms.length) return <p className="px-5 pb-5 text-sm text-slate-500">Bu dönemde teklif yok.</p>;
  const max = Math.max(1, ...firms.map(f => f.teklif));
  return (
    <div className="px-2 sm:px-3 pb-3">
      {firms.map((f, i) => (
        <button key={f.name} onClick={() => onOpen?.(f.name)} disabled={!onOpen}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-slate-50 disabled:hover:bg-transparent">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
          <span className="flex-1 min-w-0">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold text-slate-800 truncate">{f.name}</span>
              <span className="text-[13px] font-black text-[#0b2a4c] tabular-nums shrink-0">{lira(f.onay)}</span>
            </span>
            <span className="relative block mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <span className="absolute inset-y-0 left-0 rounded-full bg-sky-200" style={{ width: `${(f.teklif / max) * 100}%` }} />
              <span className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${(f.onay / max) * 100}%` }} />
            </span>
            <span className="block mt-0.5 text-[11px] text-slate-500 truncate">{f.adet} teklif · {f.teklif >= 1e6 ? `${(f.teklif / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} milyon` : `${Math.round(f.teklif / 1e3).toLocaleString('tr-TR')} bin`} TL verildi · %{f.teklif ? Math.round((f.onay / f.teklif) * 100) : 0} onay</span>
          </span>
        </button>
      ))}
    </div>
  );
};

/** Beyaz kart: simge + başlık, sağda isteğe bağlı bağlantı/sekme */
const Card: React.FC<{ title: React.ReactNode; icon?: React.ElementType; right?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, icon: Icon, right, className = '', children }) => (
  <section className={`bg-white rounded-3xl border border-white shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)] min-w-0 flex flex-col ${className}`}>
    <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 pt-4 pb-2.5">
      <h2 className="text-[15px] sm:text-base font-black text-[#0b2a4c] flex items-center gap-2 min-w-0">{Icon && <Icon className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-brand-500 shrink-0" />}<span className="truncate">{title}</span></h2>
      {right}
    </header>
    {children}
  </section>
);

const SeeAll: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:text-brand-700 shrink-0"><span className="xl:hidden 2xl:inline">Tümünü Gör</span><span className="hidden xl:inline 2xl:hidden">Tümü</span> <ArrowRight className="w-4 h-4" /></button>
);

const Tabs: React.FC<{ value: string; items: [string, string][]; onChange: (k: string) => void }> = ({ value, items, onChange }) => (
  <div className="flex gap-1 sm:gap-1.5 shrink-0" role="tablist">
    {items.map(([k, l]) => (
      <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
        className={`px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs sm:text-[13px] font-semibold transition ${value === k ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{l}</button>
    ))}
  </div>
);

/** Önceki döneme (bu dönemse aynı günlerine kadar) göre değişim: %34 ↑ */
const Change: React.FC<{ cur: number; prev: number; lowerIsBetter?: boolean; dark?: boolean }> = ({ cur, prev, lowerIsBetter, dark }) => {
  if (!prev) return <span className={`font-bold ${dark ? 'text-sky-200/60' : 'text-slate-500'}`}>–</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const good = lowerIsBetter ? !up : up;
  return <span className={`inline-flex items-center gap-0.5 font-bold shrink-0 ${dark ? (good ? 'text-emerald-300' : 'text-rose-300') : good ? 'text-emerald-600' : 'text-rose-500'}`}>%{Math.abs(pct)} <Icon className="w-3.5 h-3.5" /></span>;
};

type BarItem = Month & { label: string; shortLabel: string; from: string; to: string };

/** Verilen / onaylanan sütunları; seçili ay koyu renkte (tutar üstünde yazmaz, dokununca başlıkta görünür) */
const BarsChart: React.FC<{ bars: BarItem[]; hi: string; onPick: (b: BarItem) => void }> = ({ bars, hi, onPick }) => {
  const many = bars.length > 6;
  const raw = Math.max(1, ...bars.map(x => x.teklif));
  // Yuvarlak ölçek: 2M, 4M, 6M… gibi
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => raw / k <= 5) || mag * 10;
  const max = Math.ceil(raw / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  return (
    <div className="px-3 sm:px-5 pb-4">
      <div className="relative h-40 sm:h-48 pl-11 mt-4">
        {ticks.map(v => (
          <div key={v} className={`absolute left-11 right-0 border-t ${v ? 'border-slate-100' : 'border-slate-200'}`} style={{ bottom: `${(v / max) * 100}%` }}>
            <span className="absolute -left-11 -top-2 w-9 text-right text-[11px] text-slate-500 tabular-nums">{v ? short(v) : '0 TL'}</span>
          </div>
        ))}
        <div className={`relative h-full flex items-end ${many ? 'gap-0.5 sm:gap-1.5' : 'gap-2 sm:gap-5'}`}>
          {bars.map(x => {
            const on = x.key === hi;
            const hT = Math.max(0.8, (x.teklif / max) * 100);
            return (
              <button key={x.key} onClick={() => onPick(x)} title={`${x.label}: verilen ${tl(x.teklif)}, onaylanan ${tl(x.onay)} (%${x.teklif ? Math.round((x.onay / x.teklif) * 100) : 0})`}
                className="relative flex-1 h-full flex items-end justify-center gap-1 sm:gap-1.5 min-w-0 group">
                <div className={`flex-1 ${many ? 'max-w-5' : 'max-w-9'} rounded-t-lg group-hover:brightness-95 ${on ? 'bg-gradient-to-t from-sky-400 to-brand-400' : 'bg-gradient-to-t from-sky-300 to-sky-300/80'}`} style={{ height: `${hT}%` }} />
                <div className={`flex-1 ${many ? 'max-w-5' : 'max-w-9'} rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:brightness-95`} style={{ height: `${Math.max(0.8, (x.onay / max) * 100)}%` }} />
              </button>
            );
          })}
        </div>
      </div>
      <div className={`flex ${many ? 'gap-0.5 sm:gap-1.5' : 'gap-2 sm:gap-5'} pl-11 mt-2.5`}>
        {bars.map(x => (
          <div key={x.key} className={`flex-1 text-center min-w-0 text-[11px] sm:text-xs truncate ${x.key === hi ? 'font-bold text-[#0b2a4c]' : 'text-slate-600'}`}><span className="xl:hidden">{x.shortLabel}</span><span className="hidden xl:inline">{x.label}</span></div>
        ))}
      </div>
    </div>
  );
};

const STATUS_BADGE: Record<string, [string, string, React.ElementType]> = {
  onaylandi: ['Onaylandı', 'bg-emerald-50 text-emerald-700', Check],
  gonderildi: ['Beklemede', 'bg-orange-50 text-orange-700', Clock],
  iptal: ['İptal', 'bg-rose-50 text-rose-600', X],
};

/** Son teklifler tablosu: firma, tarih, tutar, durum */
const RecentQuotes: React.FC<{ quotes: Quote[]; rates: ReturnType<typeof useRates>; onOpen: (q: Quote) => void }> = ({ quotes, rates, onOpen }) => {
  if (!quotes.length) return <p className="px-5 pb-5 text-sm text-slate-500">Henüz teklif yok.</p>;
  const cols = 'grid grid-cols-[minmax(0,1fr)_auto_5.8rem] gap-2 sm:gap-3 items-center';
  return (
    <div className="px-3 sm:px-4 pb-3">
      <div className={`${cols} px-2 py-2 rounded-xl bg-slate-50 text-[11px] sm:text-xs font-medium text-slate-500`}>
        <span>Firma Adı · Tarih</span><span className="text-right">Tutar</span><span className="text-center">Durum</span>
      </div>
      {quotes.map((q, i) => {
        const [label, cls, Icon] = STATUS_BADGE[q.status] || [q.status, 'bg-slate-50 text-slate-600', Clock];
        const d = dayOf(q.createdAt);
        return (
          <button key={q.id} onClick={() => onOpen(q)} className={`${i >= 5 ? cols.replace('grid ', 'hidden lg:grid ') : cols} w-full px-2 py-2.5 text-left hover:bg-slate-50 rounded-xl`}>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-slate-800 truncate">{q.customerName}</span>
              <span className="block text-[11px] text-slate-500 tabular-nums">{d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : ''}</span>
            </span>
            <span className="text-[12px] sm:text-[13px] text-slate-800 tabular-nums text-right whitespace-nowrap">{lira(quoteTry(q, rates))}</span>
            <span className={`w-full justify-center inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold px-1.5 py-1 rounded-full ${cls}`}><Icon className="w-3 h-3" />{label}</span>
          </button>
        );
      })}
    </div>
  );
};

/** Halka grafik */
const Donut: React.FC<{ pct: number; size: number; stroke: number; children?: React.ReactNode }> = ({ pct, size, stroke, children }) => {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const len = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eaf0f6" strokeWidth={stroke} />
        {len > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#donut-g)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${len} ${c - len}`} />}
        <defs><linearGradient id="donut-g" x1="0" x2="1"><stop offset="0" stopColor="#10b981" /><stop offset="1" stopColor="#0ea371" /></linearGradient></defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
};

/** Aylık hedef: tahsilat (yoksa satış) halkası, toplam, hedef, ilerleme; hedef buradan konur/değiştirilir */
const TargetCard: React.FC<{ cur: Month; canQuotes: boolean; canMoney: boolean; day: number; dim: number }> = ({ cur, canQuotes, canMoney, day, dim }) => {
  const [targets, saveTargets] = useSetting<Targets>('targets', { sales: 0, collection: 0 });
  const [edit, setEdit] = React.useState(false);
  const [draft, setDraft] = React.useState({ sales: '', collection: '' });
  const [err, setErr] = React.useState('');
  const pace = Math.round((day / dim) * 100);
  const num = (v: string) => Number(v.replace(/\./g, '').replace(',', '.')) || 0;
  const open = () => { setDraft({ sales: targets.sales ? String(targets.sales) : '', collection: targets.collection ? String(targets.collection) : '' }); setErr(''); setEdit(true); };
  const save = async () => {
    try { await saveTargets({ sales: num(draft.sales), collection: num(draft.collection) }); setEdit(false); }
    catch { setErr('Kaydedilemedi (yetki gerekli).'); }
  };
  const main = canMoney ? { label: 'Toplam Tahsilat', value: cur.tahsilat, target: targets.collection } : { label: 'Onaylanan Satış', value: cur.onay, target: targets.sales };
  const pct = main.target ? Math.round((main.value / main.target) * 100) : 0;
  const salesPct = targets.sales ? Math.round((cur.onay / targets.sales) * 100) : 0;
  return (
    <div className="px-4 sm:px-6 pb-5 space-y-3">
      <div className="flex items-center gap-4 sm:gap-5">
        <Donut pct={pct} size={96} stroke={13}>
          <span className="text-xl font-black text-[#0b2a4c] tabular-nums">{main.target ? `%${pct}` : '–'}</span>
        </Donut>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{main.label}</p>
          <p className="text-lg font-black text-[#0b2a4c] tabular-nums break-all leading-tight">{lira(main.value)}</p>
          <p className="text-xs text-slate-500 mt-1.5">{main.target ? <>Hedef: {lira(main.target)}</> : 'Hedef konmamış'}</p>
          <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden mt-2">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${Math.min(100, pct)}%` }} />
            {main.target > 0 && <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400" style={{ left: `${pace}%` }} title={`Ayın %${pace}'i geçti`} />}
          </div>
        </div>
      </div>
      {canMoney && canQuotes && targets.sales > 0 && (
        <div className="text-xs">
          <div className="flex justify-between font-semibold text-slate-600">
            <span>Satış hedefi · <b className={salesPct >= pace ? 'text-emerald-700' : 'text-amber-700'}>%{salesPct}</b></span>
            <span className="tabular-nums">{short(cur.onay)} / {short(targets.sales)} TL</span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden mt-1">
            <div className={`h-full rounded-full ${salesPct >= pace ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, salesPct)}%` }} />
            <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400" style={{ left: `${pace}%` }} />
          </div>
        </div>
      )}
      {edit ? (
        <div className="rounded-2xl border border-slate-200 p-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            {canQuotes && <label className="space-y-1"><span className="block text-slate-600 font-semibold">Aylık satış (TL)</span>
              <input inputMode="numeric" value={draft.sales} onChange={e => setDraft(d => ({ ...d, sales: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm" placeholder="ör. 2000000" /></label>}
            {canMoney && <label className="space-y-1"><span className="block text-slate-600 font-semibold">Aylık tahsilat (TL)</span>
              <input inputMode="numeric" value={draft.collection} onChange={e => setDraft(d => ({ ...d, collection: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm" placeholder="ör. 1500000" /></label>}
          </div>
          {err && <p className="text-rose-600 font-semibold">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEdit(false)} className="px-3 py-1.5 rounded-lg font-bold text-slate-600">Vazgeç</button>
            <button onClick={save} className="px-3 py-1.5 rounded-lg font-bold bg-brand-600 text-white">Kaydet</button>
          </div>
        </div>
      ) : (
        <button onClick={open} className="text-xs font-bold text-brand-700 hover:text-brand-800">{targets.sales || targets.collection ? 'Hedefi değiştir' : '+ Aylık hedef koy'}</button>
      )}
    </div>
  );
};
