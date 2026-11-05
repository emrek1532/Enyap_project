import React, { useMemo, useState } from 'react';
import { dayOf } from '../lib/dates';
import { ArrowRight, Bell, CalendarDays, Check, ChevronDown, Clock, FileText, Handshake, LogOut, MapPin, Receipt, RefreshCw, Wallet, X, BarChart3, CalendarClock, FilePlus2, TrendingDown, TrendingUp, Target } from 'lucide-react';
import { Collection, Customer, Expense, Quote, SyncStatus } from '../types';
import { PENDING_STATUSES } from '../lib/quoteRules';
import { quoteTry, useRates } from '../lib/rates';
import type { ActiveTab } from './Sections';
import type { ToolInfo, ToolMode } from './QuickTools';
import { TurkeyMap } from './TurkeyMap';
import { Targets, useSetting } from '../lib/settings';

type Tab = Exclude<ActiveTab, 'home'>;
/** Teklifler sayfasını süzülmüş açar: durum (all, aktif, takip, onaylandi, iptal) ve tarih aralığı */
export type QuoteView = { status: string; from?: string; to?: string };

const tl = (v: number) => `${Math.round(v).toLocaleString('tr-TR')} TL`;
const lira = (v: number) => `₺ ${Math.round(v).toLocaleString('tr-TR')}`;
const short = (v: number) => v >= 1e6 ? `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}M` : v >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('tr-TR')}B` : `${Math.round(v)}`;
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
}> = ({ quotes, collections, expenses, sections, onOpen, onOpenQuotes, onOpenQuote, canAdd, onNewQuote, onNewCollection, onNewExpense, userName, tools, onOpenTool, followCount = 0, syncStatus, onSync, onSignOut }) => {
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
    const cities: Record<string, number> = {};
    for (const q of mq) if (q.status !== 'iptal' && q.city) cities[q.city] = (cities[q.city] || 0) + qv(q);
    return {
      cur, prevSame, from, to, dim, spark, cities,
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

  // Son teklifler (en yeni 4) ve yaklaşan ödemeler (çek/senet vadesi bugünden sonra olan tahsilatlar)
  const recent = useMemo(() => [...quotes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 4), [quotes]);
  const dues = useMemo(() => collections.filter(c => c.dueDate && c.dueDate >= t).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 3), [collections, t]);

  // Dönem seçenekleri: son 12 ay + son 3 yıl
  const periodOptions = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return { v: `m:${d.getFullYear()}:${d.getMonth()}`, l: `${AY_UZUN[d.getMonth()]} ${d.getFullYear()}` }; });
    const years = Array.from({ length: 3 }, (_, i) => ({ v: `y:${now.getFullYear() - i}:0`, l: `${now.getFullYear() - i} (tüm yıl)` }));
    return { months, years };
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  const periodValue = isYear ? `y:${period.y}:0` : `m:${period.y}:${period.m}`;
  const pickPeriod = (v: string) => {
    const [k, y, m] = v.split(':');
    setPeriod({ kind: k === 'y' ? 'year' : 'month', y: Number(y), m: Number(m) });
    if (k === 'y') setChart('year'); else if (chart === 'year') setChart('6m');
  };

  const actions = [
    canAdd.quote && { label: 'Yeni Teklif', icon: FilePlus2, cls: 'bg-gradient-to-r from-brand-600 to-sky-500 shadow-[0_12px_24px_-10px_rgba(0,110,198,0.9)]', on: onNewQuote },
    canAdd.collection && { label: 'Tahsilat', icon: Wallet, cls: 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_12px_24px_-10px_rgba(16,160,120,0.9)]', on: onNewCollection },
    canAdd.expense && { label: 'Harcama', icon: Receipt, cls: 'bg-gradient-to-r from-[#0b2a4c] to-[#123a63] shadow-[0_12px_24px_-10px_rgba(4,40,80,0.9)]', on: onNewExpense },
  ].filter(Boolean) as { label: string; icon: React.ElementType; cls: string; on: () => void }[];

  const tiles = [
    canQuotes && { label: 'Toplam Teklif Tutarı', value: s.cur.teklif, cur: s.cur.teklif, prev: s.prevSame.teklif, spark: s.spark.map(m => m.teklif),
      tone: TONE.blue, icon: FileText, on: () => openQuotes({ status: 'all', from: monthFrom, to: monthTo }) },
    canQuotes && { label: 'Toplam Satış', value: s.cur.onay, cur: s.cur.onay, prev: s.prevSame.onay, spark: s.spark.map(m => m.onay),
      tone: TONE.green, icon: Handshake, on: () => openQuotes({ status: 'onaylandi', from: monthFrom, to: monthTo }) },
    canMoney && { label: 'Tahsilat', value: s.cur.tahsilat, cur: s.cur.tahsilat, prev: s.prevSame.tahsilat, spark: s.spark.map(m => m.tahsilat),
      tone: TONE.violet, icon: Wallet, on: () => onOpen('collections') },
    canExp && { label: 'Harcama', value: s.cur.harcama, cur: s.cur.harcama, prev: s.prevSame.harcama, spark: s.spark.map(m => m.harcama),
      tone: TONE.orange, icon: Wallet, on: () => onOpen('expenses'), lowerIsBetter: true },
  ].filter(Boolean) as { label: string; value: number; cur: number; prev: number; spark: number[]; tone: Tone; icon: React.ElementType; on: () => void; lowerIsBetter?: boolean }[];

  const roundBtn = 'relative w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/90 backdrop-blur border border-white shadow-[0_6px_16px_-8px_rgba(15,60,120,0.5)] flex items-center justify-center text-brand-600 hover:bg-white transition';

  return (
    <div className="pb-4 -mt-1 sm:-mt-2">
      {/* Karşılama: tesis görseli, selam, dönem, bildirim, hızlı işlemler ve kısayollar */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#eaf3fd] via-[#f3f8fe] to-[#dcebfb] border border-white shadow-[0_14px_34px_-22px_rgba(15,60,120,0.55)] px-4 pt-5 pb-16 sm:px-8 sm:pt-8 sm:pb-24">
        <PlantArt />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight sm:text-4xl font-black text-[#0b2a4c] tracking-tight">Merhaba {firstName} <span className="inline-block">👋</span></h1>
            <p className="text-sm sm:text-base text-slate-600 mt-1.5">İşlerinizi kolayca takip edin, hedeflerinize odaklanın.</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            {(canQuotes || canMoney) && (
              <label className="relative flex items-center gap-2 h-10 sm:h-11 pl-3 pr-8 rounded-2xl bg-white/90 backdrop-blur border border-white shadow-[0_6px_16px_-8px_rgba(15,60,120,0.5)] text-sm font-bold text-[#0b2a4c] cursor-pointer">
                <CalendarDays className="w-4.5 h-4.5 text-brand-600" />
                <span className="whitespace-nowrap">{title}</span>
                <ChevronDown className="absolute right-2.5 w-4 h-4 text-slate-500" />
                <select value={periodValue} onChange={e => pickPeriod(e.target.value)} aria-label="Dönem" className="absolute inset-0 opacity-0 cursor-pointer">
                  <optgroup label="Ay">{periodOptions.months.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</optgroup>
                  <optgroup label="Yıl">{periodOptions.years.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</optgroup>
                </select>
              </label>
            )}
            {canQuotes && (
              <button onClick={() => openQuotes({ status: 'takip' })} className={roundBtn} title={followCount ? `${followCount} teklif takip bekliyor` : 'Takip bekleyen teklif yok'} aria-label="Takip bekleyen teklifler">
                <Bell className="w-5 h-5" />
                {followCount > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white">{followCount > 99 ? '99+' : followCount}</span>}
              </button>
            )}
            {onSync && syncStatus && (
              <button onClick={onSync} disabled={syncStatus.isSyncing} className={`${roundBtn} hidden md:flex`} title={syncStatus.isOnline ? 'Çevrimiçi · eşitlemek için dokunun' : 'Çevrimdışı'} aria-label="Eşitle">
                <RefreshCw className={`w-4.5 h-4.5 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
                <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white ${syncStatus.isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              </button>
            )}
            {onSignOut && (
              <button onClick={onSignOut} className={`${roundBtn} hidden md:flex`} title="Çıkış yap" aria-label="Çıkış yap"><LogOut className="w-4.5 h-4.5" /></button>
            )}
          </div>
        </div>

        <div className="relative mt-5 sm:mt-8 flex flex-col-reverse lg:flex-row lg:items-end justify-between gap-3">
          {/* Hızlı kısayollar: Ara, Tekliflere sor, Teklif hazırla, Sesle kayıt */}
          {tools.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tools.map(x => (
                <button key={x.key} onClick={() => onOpenTool(x.key)}
                  className="flex items-center gap-2 h-10 pl-1.5 pr-3.5 rounded-full bg-white/85 backdrop-blur border border-white shadow-[0_6px_16px_-10px_rgba(15,60,120,0.6)] text-[13px] font-bold text-[#0b2a4c] hover:bg-white active:scale-[0.98] transition">
                  <span className={`w-7 h-7 rounded-full bg-gradient-to-br ${x.tone} text-white flex items-center justify-center`}><x.icon className="w-3.5 h-3.5" /></span>
                  {x.label}
                </button>
              ))}
            </div>
          )}
          {actions.length > 0 && (
            <div className="flex gap-2 sm:gap-3 lg:ml-auto">
              {actions.map(a => (
                <button key={a.label} onClick={a.on}
                  className={`flex-1 lg:flex-none min-w-0 flex items-center justify-center gap-2 px-2 sm:px-6 h-12 sm:h-14 rounded-2xl text-white font-bold text-[13px] sm:text-base whitespace-nowrap active:scale-[0.98] hover:brightness-110 transition ${a.cls}`}>
                  <a.icon className="w-5 h-5 shrink-0" /> {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {(canQuotes || canMoney) && (
        <div className="relative -mt-10 sm:-mt-14 px-1.5 sm:px-4 space-y-4 sm:space-y-5">
          {/* Rakam kartları (karşılama alanının üstüne biner) */}
          {tiles.length > 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
              {tiles.map(k => (
                <button key={k.label} onClick={k.on}
                  className={`group relative overflow-hidden text-left rounded-3xl border border-white bg-gradient-to-br ${k.tone.card} pt-3.5 pb-3 px-3 sm:pt-5 sm:px-5 sm:pb-4 min-w-0 shadow-[0_16px_30px_-20px_rgba(15,60,120,0.7)] hover:-translate-y-0.5 transition`}>
                  <div className="relative flex items-start gap-2 sm:gap-3.5">
                    <span className={`w-8 h-8 sm:w-12 sm:h-12 2xl:w-14 2xl:h-14 rounded-full text-white flex items-center justify-center shrink-0 bg-gradient-to-br ${k.tone.icon} shadow-[0_8px_16px_-8px_rgba(0,0,0,0.35)]`}>
                      <k.icon className="w-4 h-4 sm:w-6 sm:h-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[11px] sm:text-sm 2xl:text-[15px] font-semibold truncate ${k.tone.text}`}>{k.label}</span>
                      <span className={`block text-[15px] sm:text-[22px] 2xl:text-[27px] leading-tight font-black tabular-nums truncate ${k.tone.value}`}>{lira(k.value)}</span>
                    </span>
                  </div>
                  <div className="relative mt-1 sm:mt-2 flex items-end justify-between gap-1 min-h-10 sm:min-h-12">
                    <span className="text-[10px] sm:text-xs text-slate-500 min-w-0 pb-0.5 flex flex-wrap items-center gap-x-1.5">
                      <Change cur={k.cur} prev={k.prev} lowerIsBetter={k.lowerIsBetter} />
                      <span className="truncate">{vsName}</span>
                    </span>
                  </div>
                  <Spark values={k.spark} color={k.tone.line} />
                </button>
              ))}
            </div>
          )}

          {canQuotes && (
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.45fr_1fr]">
              <Card title="Satış Performansı" icon={BarChart3}
                right={<Tabs value={chart} onChange={k => setChart(k as Chart)} items={[['6m', 'Son 6 Ay'], ['year', 'Yıl'], ['all', 'Tümü']]} />}>
                <div className="flex gap-4 px-4 sm:px-6 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-full bg-sky-400" />Verilen Teklif</span>
                  <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-full bg-emerald-500" />Onaylanan</span>
                </div>
                <BarsChart bars={bars} hi={hiKey}
                  onPick={b => chart === 'all'
                    ? (setPeriod({ kind: 'year', y: Number(b.key), m: 0 }), setChart('year'))
                    : openQuotes({ status: 'all', from: b.from, to: b.to })} />
              </Card>
              <Card title="Satış Dağılımı" icon={MapPin}>
                <Distribution st={s.status} cities={s.cities} onPick={status => openQuotes({ status, from: monthFrom, to: monthTo })} />
              </Card>
            </div>
          )}

          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr]">
            {canQuotes && (
              <Card title="Son Teklifler" icon={FileText} right={<SeeAll onClick={() => openQuotes({ status: 'all' })} />}>
                <RecentQuotes quotes={recent} rates={rates} onOpen={onOpenQuote} />
              </Card>
            )}
            {(canQuotes || canMoney) && !isYear && (
              <Card title={canMoney ? 'Tahsilat Durumu' : 'Satış Hedefi'} icon={Target}
                right={<span className="flex items-center gap-1 text-xs font-bold text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200">{isCurrent ? 'Bu Ay' : AY_UZUN[period.m]} <ChevronDown className="w-3.5 h-3.5 text-slate-400" /></span>}>
                <TargetCard cur={s.cur} canQuotes={canQuotes} canMoney={canMoney} day={isCurrent ? now.getDate() : s.dim} dim={s.dim} />
              </Card>
            )}
            {canMoney && (
              <Card title="Yaklaşan Ödemeler" icon={CalendarClock} right={<SeeAll onClick={() => onOpen('collections')} />}>
                {dues.length === 0 ? <p className="px-5 pb-5 text-sm text-slate-400">Vadesi gelecek çek/senet yok.</p> : (
                  <div className="px-4 sm:px-5 pb-3 divide-y divide-slate-100">
                    {dues.map(c => {
                      const d = new Date(`${c.dueDate}T00:00:00`);
                      return (
                        <button key={c.id} onClick={() => onOpen('collections')} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-slate-50 rounded-xl">
                          <span className="w-11 h-12 rounded-xl bg-orange-50 border border-orange-100 text-orange-500 flex flex-col items-center justify-center leading-none shrink-0">
                            <b className="text-base font-black">{d.getDate()}</b><span className="text-[10px] font-bold mt-0.5">{AY[d.getMonth()]}</span>
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-slate-800 truncate">{c.customerName}</span>
                            <span className="block text-[11px] text-slate-500 truncate">{[c.method, c.bankName, c.checkNo].filter(Boolean).join(' · ')}</span>
                          </span>
                          <span className="text-sm font-black text-slate-900 tabular-nums shrink-0">{money(c.amount, c.currency)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

type Tone = { card: string; icon: string; text: string; value: string; line: string };
const TONE: Record<'blue' | 'green' | 'violet' | 'orange', Tone> = {
  blue: { card: 'from-[#f2f8ff] via-[#eaf3fe] to-[#d7e9fc]', icon: 'from-brand-500 to-brand-700', text: 'text-[#0b2a4c]', value: 'text-[#0b2a4c]', line: '#2f86e6' },
  green: { card: 'from-[#effcf6] via-[#e5f8ef] to-[#cdf1e0]', icon: 'from-emerald-400 to-emerald-600', text: 'text-[#0b2a4c]', value: 'text-[#0b2a4c]', line: '#16b981' },
  violet: { card: 'from-[#f6f4ff] via-[#efebff] to-[#e0d9fd]', icon: 'from-violet-400 to-indigo-500', text: 'text-indigo-900', value: 'text-indigo-600', line: '#7c6cf0' },
  orange: { card: 'from-[#fff8ef] via-[#fff1df] to-[#fde2bf]', icon: 'from-orange-400 to-amber-500', text: 'text-orange-600', value: 'text-orange-500', line: '#f59a2c' },
};

const money = (v: number, cur: string) => cur === 'USD' ? `$${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` : cur === 'EUR' ? `€${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` : `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

/** Karşılama alanının sağındaki tesis çizimi: depolar, borular, çatı (resim dosyası yok, hafif) */
const PlantArt: React.FC = () => (
  <svg viewBox="0 0 640 300" preserveAspectRatio="xMaxYMid slice" className="pointer-events-none absolute inset-y-0 right-0 h-full w-[85%] sm:w-[68%]" aria-hidden>
    <defs>
      <linearGradient id="pa-steel" x1="0" x2="1">
        <stop offset="0" stopColor="#9fb6cf" /><stop offset=".35" stopColor="#f4f8fc" /><stop offset=".6" stopColor="#d5e1ee" /><stop offset="1" stopColor="#8aa3bf" />
      </linearGradient>
      <linearGradient id="pa-steel2" x1="0" x2="1">
        <stop offset="0" stopColor="#b7c8da" /><stop offset=".4" stopColor="#ffffff" /><stop offset="1" stopColor="#a3b8cf" />
      </linearGradient>
      <linearGradient id="pa-pipe" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e9f0f7" /><stop offset=".5" stopColor="#b9cadb" /><stop offset="1" stopColor="#8ea6bf" />
      </linearGradient>
      <linearGradient id="pa-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#cfe4fa" /><stop offset="1" stopColor="#eef5fd" />
      </linearGradient>
      <linearGradient id="pa-fade" x1="0" x2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".32" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity="1" />
      </linearGradient>
      <linearGradient id="pa-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset=".7" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity=".1" />
      </linearGradient>
      <mask id="pa-mask"><rect width="640" height="300" fill="url(#pa-fade)" /></mask>
    </defs>
    <g mask="url(#pa-mask)">
      <rect width="640" height="300" fill="url(#pa-sky)" />
      {/* çatı kirişleri */}
      <g stroke="#a9bdd3" strokeWidth="3" opacity=".7">
        <path d="M150 20h490M150 46h490" /><path d="M170 20l26 26M230 20l26 26M290 20l26 26M350 20l26 26M410 20l26 26M470 20l26 26M530 20l26 26M590 20l26 26" strokeWidth="2" />
      </g>
      {/* arka depolar */}
      <rect x="250" y="70" width="70" height="200" rx="10" fill="url(#pa-steel2)" opacity=".8" />
      <rect x="540" y="60" width="80" height="210" rx="12" fill="url(#pa-steel2)" opacity=".85" />
      {/* boru demetleri */}
      <g fill="none" strokeLinecap="round">
        <path d="M170 120h470" stroke="url(#pa-pipe)" strokeWidth="14" />
        <path d="M170 150h470" stroke="url(#pa-pipe)" strokeWidth="10" />
        <path d="M210 120v150M470 150v120" stroke="url(#pa-pipe)" strokeWidth="12" />
        <path d="M330 70V40h120v30" stroke="url(#pa-pipe)" strokeWidth="12" />
      </g>
      {/* ön büyük kazanlar */}
      <g>
        <rect x="330" y="60" width="120" height="220" rx="22" fill="url(#pa-steel)" />
        <ellipse cx="390" cy="64" rx="60" ry="12" fill="#e9f1f9" />
        <rect x="460" y="90" width="90" height="190" rx="18" fill="url(#pa-steel)" />
        <ellipse cx="505" cy="94" rx="45" ry="9" fill="#e9f1f9" />
        <g stroke="#8fa7c0" strokeWidth="2" opacity=".6"><path d="M330 120h120M330 200h120M460 150h90M460 220h90" /></g>
        <circle cx="390" cy="160" r="14" fill="#f5f9fd" stroke="#7d97b3" strokeWidth="3" />
        <circle cx="505" cy="185" r="11" fill="#f5f9fd" stroke="#7d97b3" strokeWidth="3" />
      </g>
      {/* flanşlar ve vanalar */}
      <g fill="#6f8aa8"><rect x="300" y="113" width="6" height="14" rx="2" /><rect x="455" y="113" width="6" height="14" rx="2" /><rect x="560" y="143" width="6" height="12" rx="2" /></g>
      <rect y="250" width="640" height="50" fill="url(#pa-floor)" opacity=".75" />
    </g>
  </svg>
);

/** Beyaz kart: simge + başlık, sağda isteğe bağlı bağlantı/sekme */
const Card: React.FC<{ title: React.ReactNode; icon?: React.ElementType; right?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, icon: Icon, right, className = '', children }) => (
  <section className={`bg-white rounded-3xl border border-white shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)] min-w-0 ${className}`}>
    <header className="flex items-center justify-between gap-2 px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
      <h2 className="text-base sm:text-lg xl:text-base 2xl:text-lg font-black text-[#0b2a4c] flex items-center gap-2 min-w-0">{Icon && <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-brand-500 shrink-0" />}<span className="truncate">{title}</span></h2>
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

/** Kart altındaki çizgi grafik (son aylar), dolgulu */
const Spark: React.FC<{ values: number[]; color: string }> = ({ values, color }) => {
  const id = React.useId().replace(/:/g, '');
  const max = Math.max(1, ...values);
  const w = 160, h = 64;
  if (!values.length) return null;
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * w : w, h - 4 - (v / max) * (h - 14)] as const);
  // yumuşak eğri
  let line = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2;
    line += ` C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute right-0 bottom-0 w-[58%] sm:w-[52%] h-12 sm:h-16" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.38" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx - 2} cy={ly} r="3.2" fill="white" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/** Önceki döneme (bu dönemse aynı günlerine kadar) göre değişim: %34 ↑ */
const Change: React.FC<{ cur: number; prev: number; lowerIsBetter?: boolean }> = ({ cur, prev, lowerIsBetter }) => {
  if (!prev) return <span className="font-bold text-slate-400">–</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const good = lowerIsBetter ? !up : up;
  return <span className={`inline-flex items-center gap-0.5 font-bold ${good ? 'text-emerald-600' : 'text-rose-500'}`}>%{Math.abs(pct)} <Icon className="w-3.5 h-3.5" /></span>;
};

type BarItem = Month & { label: string; shortLabel: string; from: string; to: string };

/** Verilen / onaylanan sütunları; seçili ayın üstünde tutar balonu */
const BarsChart: React.FC<{ bars: BarItem[]; hi: string; onPick: (b: BarItem) => void }> = ({ bars, hi, onPick }) => {
  const many = bars.length > 6;
  const raw = Math.max(1, ...bars.map(x => x.teklif));
  // Yuvarlak ölçek: 2M, 4M, 6M… gibi
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => raw / k <= 4) || mag * 10;
  const max = Math.ceil(raw / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  return (
    <div className="px-3 sm:px-6 pb-5">
      <div className="relative h-52 sm:h-60 pl-11 mt-10">
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
                {on && x.teklif > 0 && (
                  <>
                    <span className="absolute z-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 rounded-xl bg-white border border-slate-100 shadow-[0_8px_20px_-8px_rgba(15,60,120,0.45)] text-[11px] sm:text-sm font-black text-[#0b2a4c] tabular-nums"
                      style={{ bottom: `calc(${hT}% + 14px)` }}>{tl(x.teklif)}</span>
                    <span className="absolute z-10 w-3 h-3 rounded-full bg-brand-600 ring-2 ring-white" style={{ bottom: `calc(${hT}% - 6px)`, left: many ? '22%' : '30%' }} />
                  </>
                )}
                <div className={`flex-1 ${many ? 'max-w-5' : 'max-w-9'} rounded-t-lg group-hover:brightness-95 ${on ? 'bg-gradient-to-t from-sky-400 to-brand-400' : 'bg-gradient-to-t from-sky-300 to-sky-300/80'}`} style={{ height: `${hT}%` }} />
                <div className={`flex-1 ${many ? 'max-w-5' : 'max-w-9'} rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:brightness-95`} style={{ height: `${Math.max(0.8, (x.onay / max) * 100)}%` }} />
              </button>
            );
          })}
        </div>
      </div>
      <div className={`flex ${many ? 'gap-0.5 sm:gap-1.5' : 'gap-2 sm:gap-5'} pl-11 mt-2.5`}>
        {bars.map(x => (
          <div key={x.key} className={`flex-1 text-center min-w-0 text-[11px] sm:text-sm truncate ${x.key === hi ? 'font-bold text-[#0b2a4c]' : 'text-slate-600'}`}><span className="xl:hidden">{x.shortLabel}</span><span className="hidden xl:inline">{x.label}</span></div>
        ))}
      </div>
    </div>
  );
};

/** Satış dağılımı: illere göre harita, durum oranları, toplam teklif */
const Distribution: React.FC<{
  st: Record<'onay' | 'bekleyen' | 'iptal', { count: number; value: number }>;
  cities: Record<string, number>;
  onPick: (status: string) => void;
}> = ({ st, cities, onPick }) => {
  const rows = [
    { key: 'onaylandi', label: 'Onaylanan', x: st.onay, c: 'bg-brand-600' },
    { key: 'aktif', label: 'Bekleyen', x: st.bekleyen, c: 'bg-amber-400' },
    { key: 'iptal', label: 'İptal', x: st.iptal, c: 'bg-rose-500' },
  ];
  const total = rows.reduce((a, r) => a + r.x.value, 0);
  return (
    <div className="px-3 sm:px-5 pb-5">
      <div className="flex items-start gap-2 sm:gap-3">
        <TurkeyMap values={cities} format={tl} className="flex-1 min-w-0 mt-1" />
        <div className="w-[34%] sm:w-[30%] shrink-0 flex flex-col justify-between self-stretch gap-2">
          <div className="space-y-1.5 sm:space-y-2.5">
            {rows.map(r => (
              <button key={r.key} onClick={() => onPick(r.key)} className="w-full flex items-start gap-2 text-left rounded-lg hover:bg-slate-50 px-1 py-0.5">
                <i className={`mt-1 w-3 h-3 rounded-full shrink-0 ${r.c}`} />
                <span className="min-w-0">
                  <span className="block text-xs sm:text-sm text-slate-600">{r.label}</span>
                  <span className="block text-sm sm:text-base font-black text-[#0b2a4c] tabular-nums">%{total ? Math.round((r.x.value / total) * 100) : 0}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 text-right">
        <p className="text-xs sm:text-sm text-slate-500">Toplam Teklif</p>
        <p className="text-lg sm:text-xl font-black text-[#0b2a4c] tabular-nums">{tl(total)}</p>
      </div>
    </div>
  );
};

const STATUS_BADGE: Record<string, [string, string, React.ElementType]> = {
  onaylandi: ['Onaylandı', 'bg-emerald-50 text-emerald-700', Check],
  gonderildi: ['Beklemede', 'bg-orange-50 text-orange-600', Clock],
  iptal: ['İptal', 'bg-rose-50 text-rose-600', X],
};

/** Son teklifler tablosu: firma, tarih, tutar, durum */
const RecentQuotes: React.FC<{ quotes: Quote[]; rates: ReturnType<typeof useRates>; onOpen: (q: Quote) => void }> = ({ quotes, rates, onOpen }) => {
  if (!quotes.length) return <p className="px-5 pb-5 text-sm text-slate-400">Henüz teklif yok.</p>;
  const cols = 'grid grid-cols-[minmax(0,1fr)_5rem_5.6rem] sm:grid-cols-[minmax(0,1fr)_5.4rem_6.2rem_6.2rem] gap-1.5 sm:gap-2.5 items-center';
  return (
    <div className="px-3 sm:px-4 pb-3">
      <div className={`${cols} px-2 py-2 rounded-xl bg-slate-50 text-[11px] sm:text-xs font-medium text-slate-500`}>
        <span>Firma Adı</span><span className="hidden sm:block">Tarih</span><span className="text-right">Tutar</span><span className="text-center">Durum</span>
      </div>
      {quotes.map(q => {
        const [label, cls, Icon] = STATUS_BADGE[q.status] || [q.status, 'bg-slate-50 text-slate-600', Clock];
        const d = dayOf(q.createdAt);
        return (
          <button key={q.id} onClick={() => onOpen(q)} className={`${cols} w-full px-2 py-2.5 text-left hover:bg-slate-50 rounded-xl`}>
            <span className="min-w-0">
              <span className="block text-[13px] sm:text-[15px] text-slate-800 truncate">{q.customerName}</span>
              <span className="sm:hidden block text-[11px] text-slate-500 tabular-nums">{d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : ''}</span>
            </span>
            <span className="hidden sm:block text-[13px] text-slate-600 tabular-nums whitespace-nowrap">{d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : ''}</span>
            <span className="text-[12px] sm:text-[14px] text-slate-800 tabular-nums text-right whitespace-nowrap">{lira(quoteTry(q, rates))}</span>
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
        <Donut pct={pct} size={128} stroke={18}>
          <span className="text-2xl sm:text-3xl font-black text-[#0b2a4c] tabular-nums">{main.target ? `%${pct}` : '–'}</span>
        </Donut>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-600">{main.label}</p>
          <p className="text-xl sm:text-2xl font-black text-[#0b2a4c] tabular-nums truncate">{lira(main.value)}</p>
          <p className="text-sm text-slate-600 mt-2">{main.target ? <>Hedef: {lira(main.target)}</> : 'Hedef konmamış'}</p>
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
