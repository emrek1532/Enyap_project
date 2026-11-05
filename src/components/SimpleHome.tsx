import React, { useMemo, useState } from 'react';
import { dayOf } from '../lib/dates';
import { ArrowRight, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, FilePlus2, FileText, Handshake, MapPin, PieChart, Receipt, Sparkles, Target, TrendingDown, TrendingUp, Wallet, BarChart3 } from 'lucide-react';
import { Collection, Customer, Expense, Quote } from '../types';
import { foldName } from '../lib/customerInsights';
import { PENDING_STATUSES } from '../lib/quoteRules';
import { quoteTry, useRates } from '../lib/rates';
import type { ActiveTab } from './Sections';
import { QuickToolButtons, ToolInfo, ToolMode } from './QuickTools';
import { Targets, useSetting } from '../lib/settings';

type Tab = Exclude<ActiveTab, 'home'>;
/** Teklifler sayfasını süzülmüş açar: durum (all, aktif, takip, onaylandi, iptal) ve tarih aralığı */
export type QuoteView = { status: string; from?: string; to?: string };

const tl = (v: number) => `${Math.round(v).toLocaleString('tr-TR')} TL`;
const short = (v: number) => v >= 1e6 ? `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn` : v >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('tr-TR')} bin` : `${Math.round(v)}`;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const AY_UZUN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
};
const sumTry = (list: { amount: number; currency: string }[]) => list.filter(x => (x.currency || 'TRY') === 'TRY').reduce((t, x) => t + (x.amount || 0), 0);

/** Seçili dönem: ay (y, m: 0-11) ya da yıl (y) */
type Period = { kind: 'month' | 'year'; y: number; m: number };

type Month = { key: string; teklif: number; adet: number; onay: number; onayAdet: number; tahsilat: number; harcama: number };

/**
 * Ana sayfa: hızlı işlemler, tek kutuda arama + yapay zekâ, seçili ayın/yılın rakamları (dokununca ilgili liste süzülmüş açılır),
 * son 6 ay (yılda 12 ay) grafiği, haftalar (yılda çeyrekler), firmalar. Oklarla önceki/sonraki döneme geçilir.
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
}> = ({ quotes, collections, expenses, sections, onOpen, onOpenQuotes, onOpenQuote, canAdd, onNewQuote, onNewCollection, onNewExpense, onOpenCustomer, userName, tools, onOpenTool }) => {
  const rates = useRates(quotes);
  const now = new Date();
  const t = ymd(now);
  const canMoney = sections.includes('collections');
  const canExp = sections.includes('expenses');
  const canQuotes = sections.includes('quotes');
  const openQuotes = (v: QuoteView) => (onOpenQuotes ? onOpenQuotes(v) : onOpen('quotes'));
  const [period, setPeriod] = useState<Period>(() => ({ kind: 'month', y: now.getFullYear(), m: now.getMonth() }));
  const isYear = period.kind === 'year';
  const isCurrent = period.y === now.getFullYear() && (isYear || period.m === now.getMonth());
  // Oklar: ayda bir ay, yılda bir yıl; geleceğe gidilmez
  const shift = (d: number) => setPeriod(p => {
    if (p.kind === 'year') return { ...p, y: p.y + d, m: p.y + d === now.getFullYear() ? now.getMonth() : p.m };
    const x = new Date(p.y, p.m + d, 1);
    return { ...p, y: x.getFullYear(), m: x.getMonth() };
  });
  const setKind = (kind: Period['kind']) => setPeriod(p => {
    // Yıldan aya dönünce gelecekteki aya düşmesin
    const m = p.y === now.getFullYear() ? Math.min(p.m, now.getMonth()) : p.m;
    return { kind, y: p.y, m };
  });
  const goToday = () => setPeriod(p => ({ kind: p.kind, y: now.getFullYear(), m: now.getMonth() }));

  const s = useMemo(() => {
    const qv = (q: Quote) => quoteTry(q, rates);
    const mkey = (y: number, m: number) => { const d = new Date(y, m, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
    const dimOf = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    // Grafik: ayda seçili aya kadar son 6 ay, yılda yılın 12 ayı
    const keys = isYear
      ? Array.from({ length: 12 }, (_, k) => mkey(period.y, k))
      : Array.from({ length: 6 }, (_, k) => mkey(period.y, period.m - 5 + k));
    const calcR = (key: string, from: string, to: string): Month => {
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
    };
    const monthCalc = (key: string) => calcR(key, `${key}-01`, `${key}-31`);
    const months = keys.map(monthCalc);
    // Seçili dönem ve karşılaştırılan önceki dönem (bu dönemse önceki dönemin aynı günlerine kadar: adil karşılaştırma)
    let from: string, to: string, prevFrom: string, prevTo: string, prevSameTo: string, dim: number;
    if (isYear) {
      from = `${period.y}-01-01`; to = `${period.y}-12-31`; dim = 12;
      prevFrom = `${period.y - 1}-01-01`; prevTo = `${period.y - 1}-12-31`;
      prevSameTo = isCurrent ? `${period.y - 1}-${pad(now.getMonth() + 1)}-${pad(Math.min(now.getDate(), dimOf(period.y - 1, now.getMonth())))}` : prevTo;
    } else {
      const key = mkey(period.y, period.m), pk = mkey(period.y, period.m - 1);
      const pd = new Date(period.y, period.m - 1, 1);
      dim = dimOf(period.y, period.m);
      from = `${key}-01`; to = `${key}-${pad(dim)}`;
      prevFrom = `${pk}-01`; prevTo = `${pk}-${pad(dimOf(pd.getFullYear(), pd.getMonth()))}`;
      prevSameTo = isCurrent ? `${pk}-${pad(Math.min(now.getDate(), dimOf(pd.getFullYear(), pd.getMonth())))}` : prevTo;
    }
    const cur = calcR(from.slice(0, 7), from, to);
    const prev = calcR(prevFrom.slice(0, 7), prevFrom, prevTo);
    const prevSame = calcR(prevFrom.slice(0, 7), prevFrom, prevSameTo);
    const mq = quotes.filter(q => { const d = dayOf(q.createdAt); return d >= from && d <= to; });
    const live = mq.filter(q => q.status !== 'iptal');
    const sumOf = (l: Quote[]) => ({
      teklif: l.reduce((a, q) => a + qv(q), 0), onay: l.filter(q => q.status === 'onaylandi').reduce((a, q) => a + qv(q), 0), adet: l.length,
    });
    // Dilimler: ayda haftalar (1–7, 8–14…), yılda çeyrekler; teklif tarihine göre
    const parts = isYear
      ? Array.from({ length: 4 }, (_, c) => {
        const f = `${period.y}-${pad(c * 3 + 1)}-01`, tt = `${period.y}-${pad(c * 3 + 3)}-${pad(dimOf(period.y, c * 3 + 2))}`;
        return { label: `${c + 1}. çeyrek`, hint: `${AY[c * 3]}–${AY[c * 3 + 2]}`, from: f, to: tt, ...sumOf(live.filter(q => { const d = dayOf(q.createdAt); return d >= f && d <= tt; })) };
      })
      : Array.from({ length: Math.ceil(dim / 7) }, (_, w) => {
        const f = `${from.slice(0, 7)}-${pad(w * 7 + 1)}`, tt = `${from.slice(0, 7)}-${pad(Math.min(dim, w * 7 + 7))}`;
        return { label: `${w * 7 + 1}–${Math.min(dim, w * 7 + 7)} ${AY[period.m]}`, hint: '', from: f, to: tt, ...sumOf(live.filter(q => { const d = dayOf(q.createdAt); return d >= f && d <= tt; })) };
      });
    // Firmalar: dönemde en çok teklif verilenler, onaylananıyla
    const firms = new Map<string, { label: string; teklif: number; onay: number; count: number }>();
    for (const q of live) {
      const k = foldName(q.customerName);
      const f = firms.get(k) || { label: q.customerName, teklif: 0, onay: 0, count: 0 };
      f.teklif += qv(q); f.count++;
      if (q.status === 'onaylandi') f.onay += qv(q);
      firms.set(k, f);
    }
    // Şehirlere göre (dönemin iptal dışı teklifleri)
    const cityMap = new Map<string, { label: string; teklif: number; count: number }>();
    for (const q of live) {
      const label = (q.city || '').trim() || 'Şehir yok';
      const k = foldName(label);
      const c = cityMap.get(k) || { label, teklif: 0, count: 0 };
      c.teklif += qv(q); c.count++;
      cityMap.set(k, c);
    }
    const st = (pred: (q: Quote) => boolean) => { const l = mq.filter(pred); return { count: l.length, value: l.reduce((a, q) => a + qv(q), 0) }; };
    return {
      months, cur, prev, prevSame, from, to, dim, parts,
      cities: [...cityMap.values()].sort((a, b) => b.teklif - a.teklif).slice(0, 5),
      firms: [...firms.values()].sort((a, b) => b.onay - a.onay || b.teklif - a.teklif).slice(0, 6),
      status: { onay: st(q => q.status === 'onaylandi'), bekleyen: st(q => PENDING_STATUSES.includes(q.status)), iptal: st(q => q.status === 'iptal') },
    };
  }, [quotes, collections, expenses, rates, t, period.kind, period.y, period.m]); // eslint-disable-line react-hooks/exhaustive-deps


  const monthFrom = s.from, monthTo = s.to;
  // Dönem adları
  const title = isYear ? `${period.y}` : `${AY_UZUN[period.m]} ${period.y}`;
  const unit = isYear ? 'yıl' : 'ay';
  const prevName = isCurrent ? `geçen ${unit}a göre` : `önceki ${unit}a göre`;
  const thisName = isCurrent ? `Bu ${unit} henüz` : `${title} döneminde`;
  const rate = s.cur.teklif ? Math.round((s.cur.onay / s.cur.teklif) * 100) : 0;
  const firstName = userName.split(/\s+/)[0] || userName;

  // Son teklifler (en yeni 5) ve yaklaşan vadeler (çek/senet vadesi bugünden sonra olan tahsilatlar)
  const recent = useMemo(() => [...quotes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5), [quotes]);
  const dues = useMemo(() => collections.filter(c => c.dueDate && c.dueDate >= t).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 4), [collections, t]);

  const actions = [
    canAdd.quote && { label: 'Yeni Teklif', icon: FilePlus2, cls: 'bg-gradient-to-r from-brand-600 to-sky-500 shadow-[0_10px_22px_-10px_rgba(0,110,198,0.9)]', on: onNewQuote },
    canAdd.collection && { label: 'Tahsilat', icon: Wallet, cls: 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_10px_22px_-10px_rgba(16,160,120,0.9)]', on: onNewCollection },
    canAdd.expense && { label: 'Harcama', icon: Receipt, cls: 'bg-gradient-to-r from-[#0b2a4c] to-brand-900 shadow-[0_10px_22px_-10px_rgba(4,40,80,0.9)]', on: onNewExpense },
  ].filter(Boolean) as { label: string; icon: React.ElementType; cls: string; on: () => void }[];

  const tiles = [
    canQuotes && { label: 'Toplam Teklif Tutarı', value: tl(s.cur.teklif), sub: `${s.cur.adet} teklif`, cur: s.cur.teklif, prev: s.prevSame.teklif, spark: s.months.map(m => m.teklif),
      tone: TONE.blue, icon: FileText, on: () => openQuotes({ status: 'all', from: monthFrom, to: monthTo }) },
    canQuotes && { label: 'Toplam Satış', value: tl(s.cur.onay), sub: `${s.cur.onayAdet} teklif · %${rate}`, cur: s.cur.onay, prev: s.prevSame.onay, spark: s.months.map(m => m.onay),
      tone: TONE.green, icon: Handshake, on: () => openQuotes({ status: 'onaylandi', from: monthFrom, to: monthTo }) },
    canMoney && { label: 'Tahsilat', value: tl(s.cur.tahsilat), sub: '', cur: s.cur.tahsilat, prev: s.prevSame.tahsilat, spark: s.months.map(m => m.tahsilat),
      tone: TONE.violet, icon: Wallet, on: () => onOpen('collections') },
    canExp && { label: 'Harcama', value: tl(s.cur.harcama), sub: '', cur: s.cur.harcama, prev: s.prevSame.harcama, spark: s.months.map(m => m.harcama),
      tone: TONE.orange, icon: Receipt, on: () => onOpen('expenses'), lowerIsBetter: true },
  ].filter(Boolean) as { label: string; value: string; sub: string; cur: number; prev: number; spark: number[]; tone: Tone; icon: React.ElementType; on: () => void; lowerIsBetter?: boolean }[];

  return (
    <div className="space-y-4 sm:space-y-5 pb-4">
      {/* Karşılama: selam, dönem seçimi, hızlı işlemler */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-100 via-white to-brand-100 border border-white shadow-[0_10px_30px_-18px_rgba(15,60,120,0.45)] px-4 py-5 sm:px-7 sm:py-7">
        <HeroArt />
        <div className="relative flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-brand-700/80">{GUN[now.getDay()]}, {now.getDate()} {AY_UZUN[now.getMonth()]} · {greeting()}</p>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0b2a4c] mt-0.5">Merhaba {firstName} 👋</h1>
            <p className="text-sm text-slate-600 mt-1">İşlerinizi kolayca takip edin, hedeflerinize odaklanın.</p>
          </div>
          {(canQuotes || canMoney) && (
            <PeriodBar title={title} isYear={isYear} isCurrent={isCurrent} unit={unit}
              onPrev={() => shift(-1)} onNext={() => shift(1)} onKind={setKind} onToday={goToday} />
          )}
        </div>
        {actions.length > 0 && (
          <div className="relative flex gap-2 sm:gap-3 mt-4 sm:mt-5 lg:justify-end">
            {actions.map(a => (
              <button key={a.label} onClick={a.on}
                className={`flex-1 sm:flex-none min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-5 py-3 rounded-2xl text-white font-bold text-[13px] sm:text-sm whitespace-nowrap active:scale-[0.98] hover:brightness-105 transition ${a.cls}`}>
                <a.icon className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" /> {a.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Hızlı kısayollar: Ara, Tekliflere sor, Teklif hazırla, Sesle kayıt */}
      {tools.length > 0 && (
        <section>
          <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-800 mb-2 px-0.5"><Sparkles className="w-4 h-4 text-brand-500" /> Hızlı kısayollar</h2>
          <QuickToolButtons tools={tools} onOpen={onOpenTool} />
        </section>
      )}

      {(canQuotes || canMoney) && (
        <>
          {/* Rakam kartları: dokununca ilgili liste açılır */}
          {tiles.length > 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
              {tiles.map(k => (
                <button key={k.label} onClick={k.on}
                  className={`group relative overflow-hidden text-left rounded-3xl border border-white bg-gradient-to-br ${k.tone.card} p-3 sm:p-4 min-w-0 shadow-[0_10px_26px_-18px_rgba(15,60,120,0.6)] hover:-translate-y-0.5 transition`}>
                  <div className="flex items-start gap-2.5 sm:gap-3 relative">
                    <span className={`w-9 h-9 sm:w-12 sm:h-12 rounded-2xl text-white flex items-center justify-center shrink-0 bg-gradient-to-br ${k.tone.icon}`}>
                      <k.icon className="w-4.5 h-4.5 sm:w-6 sm:h-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[11px] sm:text-sm font-bold truncate ${k.tone.text}`}>{k.label}</span>
                      <span className="block text-base sm:text-2xl font-black text-[#0b2a4c] tabular-nums truncate">{k.value}</span>
                    </span>
                  </div>
                  <div className="relative mt-1.5 flex items-end justify-between gap-1">
                    <span className="text-[10px] sm:text-xs text-slate-500 min-w-0 pb-1">
                      <Change cur={k.cur} prev={k.prev} lowerIsBetter={k.lowerIsBetter} />
                      <span className="block truncate">{k.prev ? prevName : k.sub || prevName}</span>
                    </span>
                    <Spark values={k.spark} color={k.tone.line} />
                  </div>
                </button>
              ))}
            </div>
          )}

          {canQuotes && (
            <div className="grid gap-4 lg:grid-cols-5">
              <Card title="Satış Performansı" icon={BarChart3} className="lg:col-span-3"
                right={<Tabs value={isYear ? 'year' : 'month'} onChange={k => setKind(k as Period['kind'])} items={[['month', 'Son 6 Ay'], ['year', 'Yıl']]} />}>
                <Legend items={[['bg-sky-300', 'Verilen Teklif'], ['bg-emerald-500', 'Onaylanan']]} />
                <MonthsChart months={s.months} hi={isYear ? (isCurrent ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}` : '') : s.from.slice(0, 7)}
                  note={isYear ? 'Aya dokununca o ayın ayrıntısı açılır.' : 'Aya dokununca o ayın onaylanan teklifleri açılır.'}
                  onPick={key => isYear
                    ? setPeriod({ kind: 'month', y: Number(key.slice(0, 4)), m: Number(key.slice(5)) - 1 })
                    : openQuotes({ status: 'onaylandi', from: `${key}-01`, to: `${key}-31` })} />
              </Card>
              <Card title="Satış Dağılımı" icon={PieChart} className="lg:col-span-2">
                <StatusBox st={s.status} cities={s.cities} empty={`${thisName} teklif yok.`} onPick={status => openQuotes({ status, from: monthFrom, to: monthTo })} />
              </Card>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {canQuotes && (
              <Card title="Son Teklifler" icon={FileText} right={<SeeAll onClick={() => openQuotes({ status: 'all' })} />}>
                <RecentQuotes quotes={recent} rates={rates} onOpen={onOpenQuote} />
              </Card>
            )}
            {(canQuotes || canMoney) && !isYear && (
              <Card title={canMoney ? 'Tahsilat Durumu' : 'Satış Hedefi'} icon={Target} right={<span className="text-[11px] font-bold text-slate-500 px-2 py-1 rounded-lg bg-slate-100">{isCurrent ? `Bu ${unit}` : title}</span>}>
                <TargetCard cur={s.cur} canQuotes={canQuotes} canMoney={canMoney} day={isCurrent ? now.getDate() : s.dim} dim={s.dim} />
              </Card>
            )}
            {canMoney && (
              <Card title="Yaklaşan Vadeler" icon={CalendarClock} right={<SeeAll onClick={() => onOpen('collections')} />}>
                {dues.length === 0 ? <p className="px-4 pb-4 text-sm text-slate-400">Vadesi gelecek çek/senet yok.</p> : (
                  <div className="px-3 pb-3 divide-y divide-slate-100">
                    {dues.map(c => {
                      const d = new Date(`${c.dueDate}T00:00:00`);
                      return (
                        <button key={c.id} onClick={() => onOpen('collections')} className="w-full flex items-center gap-3 py-2.5 px-1 text-left hover:bg-slate-50 rounded-xl">
                          <span className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 flex flex-col items-center justify-center leading-none shrink-0">
                            <b className="text-sm">{d.getDate()}</b><span className="text-[10px] font-semibold">{AY[d.getMonth()]}</span>
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

          {canQuotes && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={isYear ? 'Çeyreklere göre' : `Haftalara göre${isCurrent ? ' (bu ay)' : ''}`} icon={CalendarDays} right={<Legend inline items={[['bg-sky-300', 'Verilen'], ['bg-emerald-500', 'Onaylanan']]} />}>
                <div className="px-4 pb-3 space-y-2.5">
                  {s.parts.map(w => {
                    const max = Math.max(1, ...s.parts.map(x => x.teklif));
                    const future = w.from > t;
                    const here = w.from <= t && t <= w.to;
                    return (
                      <button key={w.label} disabled={future} onClick={() => openQuotes({ status: 'all', from: w.from, to: w.to })}
                        className={`w-full text-left text-xs ${future ? 'opacity-40' : 'hover:bg-slate-50'} rounded-lg -mx-1 px-1 py-0.5`}>
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-slate-700">{w.label}{w.hint && <span className="text-slate-400 font-normal"> · {w.hint}</span>}{here && <b className="text-brand-600"> · {isYear ? 'bu çeyrek' : 'bu hafta'}</b>}</span>
                          <span className="tabular-nums text-slate-600">{w.adet} teklif · <b className="text-slate-900">{short(w.teklif)}</b> · <b className="text-emerald-700">{short(w.onay)} onay</b></span>
                        </div>
                        <Bar a={w.teklif} b={w.onay} max={max} />
                      </button>
                    );
                  })}
                </div>
              </Card>
              <Card title={isCurrent ? `Bu ${unit}ın firmaları` : `${title} firmaları`} icon={Handshake} right={<span className="text-[11px] text-slate-500">onaylanana göre</span>}>
                {s.firms.length === 0 ? <p className="px-4 pb-4 text-sm text-slate-400">{thisName} teklif yok.</p> : (
                  <div className="px-4 pb-3 space-y-2.5">
                    {s.firms.map(f => {
                      const max = Math.max(1, ...s.firms.map(x => x.teklif));
                      return (
                        <button key={f.label} onClick={() => onOpenCustomer?.(f.label)} className="w-full text-left text-xs hover:bg-slate-50 rounded-lg -mx-1 px-1 py-0.5">
                          <div className="flex justify-between gap-2">
                            <span className="font-bold text-slate-800 truncate">{f.label}</span>
                            <span className="tabular-nums text-slate-600 shrink-0">{f.count} teklif · <b className="text-emerald-700">{short(f.onay)}</b> / {short(f.teklif)}</span>
                          </div>
                          <Bar a={f.teklif} b={f.onay} max={max} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
};

type Tone = { card: string; icon: string; text: string; line: string };
const TONE: Record<'blue' | 'green' | 'violet' | 'orange', Tone> = {
  blue: { card: 'from-sky-50 via-white to-sky-100', icon: 'from-brand-500 to-brand-700', text: 'text-brand-800', line: '#3b8fe0' },
  green: { card: 'from-emerald-50 via-white to-emerald-100', icon: 'from-emerald-400 to-emerald-600', text: 'text-emerald-800', line: '#10b37e' },
  violet: { card: 'from-violet-50 via-white to-violet-100', icon: 'from-violet-400 to-indigo-500', text: 'text-violet-800', line: '#7c6cf0' },
  orange: { card: 'from-orange-50 via-white to-amber-100', icon: 'from-orange-400 to-amber-500', text: 'text-orange-700', line: '#f59a2c' },
};

const money = (v: number, cur: string) => cur === 'USD' ? `$${Math.round(v).toLocaleString('tr-TR')}` : cur === 'EUR' ? `€${Math.round(v).toLocaleString('tr-TR')}` : tl(v);

/** Karşılama kartının sağındaki silik tesis çizimi (resim dosyası yok, hafif) */
const HeroArt: React.FC = () => (
  <svg viewBox="0 0 420 200" className="pointer-events-none absolute right-0 top-0 h-full w-auto max-w-[70%] opacity-[0.16] text-brand-700" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
    <rect x="200" y="40" width="60" height="150" rx="8" /><rect x="275" y="20" width="70" height="170" rx="10" /><rect x="355" y="60" width="55" height="130" rx="8" />
    <path d="M200 70h-50v120M150 110h-40v80M345 50h30M230 40V15h80v5" /><path d="M120 150h80M260 120h15M345 140h10" />
    <circle cx="230" cy="100" r="10" /><circle cx="310" cy="90" r="12" /><circle cx="382" cy="120" r="9" />
    <path d="M0 190h420" strokeWidth="2" />
  </svg>
);

/** Beyaz kart: simge + başlık, sağda isteğe bağlı bağlantı/açıklama */
const Card: React.FC<{ title: React.ReactNode; icon?: React.ElementType; right?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, icon: Icon, right, className = '', children }) => (
  <section className={`bg-white rounded-3xl border border-white shadow-[0_10px_30px_-20px_rgba(15,60,120,0.5)] min-w-0 ${className}`}>
    <header className="flex items-center justify-between gap-2 px-4 sm:px-5 pt-4 pb-2.5">
      <h2 className="text-base font-black text-[#0b2a4c] flex items-center gap-2 min-w-0">{Icon && <Icon className="w-5 h-5 text-brand-500 shrink-0" />}<span className="truncate">{title}</span></h2>
      {right}
    </header>
    {children}
  </section>
);

const SeeAll: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 shrink-0">Tümünü Gör <ArrowRight className="w-3.5 h-3.5" /></button>
);

const Tabs: React.FC<{ value: string; items: [string, string][]; onChange: (k: string) => void }> = ({ value, items, onChange }) => (
  <div className="flex gap-1 shrink-0" role="tablist">
    {items.map(([k, l]) => (
      <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
        className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${value === k ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
    ))}
  </div>
);

const Legend: React.FC<{ items: [string, string][]; inline?: boolean }> = ({ items, inline }) => (
  <span className={`flex gap-3 text-[11px] text-slate-500 shrink-0 ${inline ? '' : 'px-4 sm:px-5'}`}>
    {items.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><i className={`w-2.5 h-2.5 rounded-full ${c}`} />{l}</span>)}
  </span>
);

const Bar: React.FC<{ a: number; b: number; max: number }> = ({ a, b, max }) => (
  <div className="relative h-2.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
    <div className="absolute inset-y-0 left-0 bg-sky-300 rounded-full" style={{ width: `${(a / max) * 100}%` }} />
    <div className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full" style={{ width: `${(b / max) * 100}%` }} />
  </div>
);

/** Küçük çizgi grafik (son aylar) */
const Spark: React.FC<{ values: number[]; color: string }> = ({ values, color }) => {
  const id = React.useId();
  const max = Math.max(1, ...values);
  const w = 90, h = 38;
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * w : w, h - 3 - (v / max) * (h - 8)] as const);
  if (!pts.length) return null;
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h + 2}`} className="w-16 sm:w-24 h-8 sm:h-10 shrink-0 overflow-visible" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3" fill="white" stroke={color} strokeWidth="2" />
    </svg>
  );
};

/** Dönem seçimi: ‹ Kasım 2026 › ve Ay | Yıl; geleceğe gidilmez */
const PeriodBar: React.FC<{
  title: string; isYear: boolean; isCurrent: boolean; unit: string;
  onPrev: () => void; onNext: () => void; onKind: (k: Period['kind']) => void; onToday: () => void;
}> = ({ title, isYear, isCurrent, unit, onPrev, onNext, onKind, onToday }) => {
  const arrow = 'w-8 h-8 flex items-center justify-center rounded-full text-slate-600 hover:bg-brand-50 hover:text-brand-700 active:scale-95 disabled:opacity-35 disabled:pointer-events-none';
  return (
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      <div className="flex items-center gap-0.5 bg-white rounded-2xl border border-slate-200/70 shadow-xs p-1">
        <button onClick={onPrev} aria-label={`Önceki ${unit}`} title={`Önceki ${unit}`} className={arrow}><ChevronLeft className="w-4 h-4" /></button>
        <span className="flex items-center gap-1.5 min-w-[7.5rem] justify-center text-sm font-black text-[#0b2a4c] whitespace-nowrap tabular-nums" aria-live="polite">
          <CalendarDays className="w-4 h-4 text-brand-500" />{title}
        </span>
        <button onClick={onNext} disabled={isCurrent} aria-label={`Sonraki ${unit}`} title={`Sonraki ${unit}`} className={arrow}><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="flex gap-1 p-1 rounded-2xl bg-white border border-slate-200/70 shadow-xs" role="tablist" aria-label="Dönem">
        {(['month', 'year'] as const).map(k => {
          const on = (k === 'year') === isYear;
          return (
            <button key={k} role="tab" aria-selected={on} onClick={() => onKind(k)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${on ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
              {k === 'month' ? 'Ay' : 'Yıl'}
            </button>
          );
        })}
      </div>
      {!isCurrent && <button onClick={onToday} className="px-2.5 py-1.5 rounded-xl text-xs font-extrabold text-brand-700 hover:bg-white/70">Bu {unit}a dön</button>}
    </div>
  );
};

/** Önceki döneme (bu dönemse aynı günlerine kadar) göre değişim */
const Change: React.FC<{ cur: number; prev: number; lowerIsBetter?: boolean }> = ({ cur, prev, lowerIsBetter }) => {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const good = lowerIsBetter ? !up : up;
  return <span className={`inline-flex items-center gap-0.5 font-bold ${good ? 'text-emerald-600' : 'text-rose-600'}`}>%{Math.abs(pct)}<Icon className="w-3 h-3" /></span>;
};

/** Aylar: verilen ve onaylanan sütunları; seçili ayın üstünde tutar balonu; aya dokununca ilgili liste */
const MonthsChart: React.FC<{ months: Month[]; hi: string; note: string; onPick: (key: string) => void }> = ({ months, hi, note, onPick }) => {
  const gap = months.length > 6 ? 'gap-0.5 sm:gap-1.5' : 'gap-2 sm:gap-4';
  const max = Math.max(1, ...months.map(x => x.teklif));
  const ticks = [max, max * 0.75, max / 2, max / 4];
  return (
    <div className="px-4 sm:px-5 pb-4">
      <div className="relative h-48 sm:h-56 pl-10 mt-8">
        {ticks.map(v => (
          <div key={v} className="absolute left-10 right-0 border-t border-dashed border-slate-200" style={{ bottom: `${(v / max) * 100}%` }}>
            <span className="absolute -left-10 -top-2 w-9 text-right text-[10px] text-slate-400 tabular-nums">{short(v)}</span>
          </div>
        ))}
        <div className="absolute left-10 right-0 bottom-0 border-t border-slate-200" />
        <div className={`relative h-full flex items-end ${gap}`}>
          {months.map(x => {
            const on = x.key === hi;
            return (
              <button key={x.key} onClick={() => onPick(x.key)} title={`${AY_UZUN[Number(x.key.slice(5)) - 1]}: verilen ${tl(x.teklif)}, onaylanan ${tl(x.onay)}`}
                className="relative flex-1 h-full flex items-end justify-center gap-1 min-w-0 group">
                {on && x.teklif > 0 && (
                  <span className="absolute z-10 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap px-2 py-1 rounded-lg bg-white border border-slate-200 shadow-md text-[11px] font-black text-[#0b2a4c] tabular-nums"
                    style={{ bottom: `calc(${(x.teklif / max) * 100}% + 6px)` }}>{tl(x.teklif)}</span>
                )}
                <div className={`flex-1 max-w-7 rounded-t-lg group-hover:opacity-80 ${on ? 'bg-gradient-to-t from-sky-400 to-brand-400' : 'bg-gradient-to-t from-sky-300 to-sky-200'}`} style={{ height: `${Math.max(1, (x.teklif / max) * 100)}%` }} />
                <div className="flex-1 max-w-7 rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:opacity-80" style={{ height: `${Math.max(1, (x.onay / max) * 100)}%` }} />
              </button>
            );
          })}
        </div>
      </div>
      <div className={`flex ${gap} pl-10 mt-2`}>
        {months.map(x => (
          <div key={x.key} className="flex-1 text-center min-w-0 leading-tight">
            <div className={`text-[11px] sm:text-xs font-bold ${x.key === hi ? 'text-brand-700' : 'text-slate-600'}`}>{AY[Number(x.key.slice(5)) - 1]}</div>
            <div className="text-[10px] text-slate-400 tabular-nums">%{x.teklif ? Math.round((x.onay / x.teklif) * 100) : 0}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5 pl-10">Ayın altında satış oranı. {note}</p>
    </div>
  );
};

/** Halka grafik */
const Donut: React.FC<{ parts: { value: number; color: string }[]; size?: number; stroke?: number; children?: React.ReactNode }> = ({ parts, size = 132, stroke = 16, children }) => {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  let off = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        {parts.map((p, i) => {
          const len = (p.value / total) * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeLinecap={parts.length === 1 ? 'round' : 'butt'}
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} />;
          off += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
};

/** Dönemdeki tekliflerin durumu (halka) ve şehirlere göre dağılım */
const StatusBox: React.FC<{
  st: Record<'onay' | 'bekleyen' | 'iptal', { count: number; value: number }>;
  cities: { label: string; teklif: number; count: number }[];
  empty: string; onPick: (status: string) => void;
}> = ({ st, cities, empty, onPick }) => {
  const rows = [
    { key: 'onaylandi', label: 'Onaylanan', x: st.onay, c: 'bg-brand-500', hex: '#006ec6' },
    { key: 'aktif', label: 'Bekleyen', x: st.bekleyen, c: 'bg-amber-400', hex: '#fbbf24' },
    { key: 'iptal', label: 'İptal', x: st.iptal, c: 'bg-rose-500', hex: '#f43f5e' },
  ];
  const total = rows.reduce((a, r) => a + r.x.value, 0);
  if (!total) return <p className="px-4 pb-4 text-sm text-slate-400">{empty}</p>;
  const cmax = Math.max(1, ...cities.map(c => c.teklif));
  return (
    <div className="px-4 sm:px-5 pb-4 space-y-4">
      <div className="flex items-center gap-4">
        <Donut parts={rows.map(r => ({ value: r.x.value, color: r.hex }))}>
          <span className="text-[10px] text-slate-500 font-semibold">Toplam</span>
          <span className="text-sm font-black text-[#0b2a4c] tabular-nums">{short(total)}</span>
        </Donut>
        <div className="flex-1 min-w-0 space-y-1">
          {rows.map(r => (
            <button key={r.key} onClick={() => onPick(r.key)} className="w-full flex items-center gap-2 py-1 px-1.5 text-left hover:bg-slate-50 rounded-lg">
              <i className={`w-3 h-3 rounded-full shrink-0 ${r.c}`} />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-slate-600">{r.label}</span>
                <span className="block text-sm font-black text-slate-900 tabular-nums">%{Math.round((r.x.value / total) * 100)} <span className="text-[11px] font-medium text-slate-500">· {r.x.count} teklif</span></span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            </button>
          ))}
        </div>
      </div>
      {cities.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-slate-100">
          <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500"><MapPin className="w-3.5 h-3.5" /> Şehirlere göre</p>
          {cities.map(c => (
            <div key={c.label} className="text-xs">
              <div className="flex justify-between gap-2"><span className="font-semibold text-slate-700 truncate">{c.label}</span><span className="tabular-nums text-slate-600 shrink-0">{c.count} teklif · <b className="text-slate-900">{short(c.teklif)}</b></span></div>
              <div className="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-brand-500" style={{ width: `${(c.teklif / cmax) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const STATUS_BADGE: Record<string, [string, string]> = {
  onaylandi: ['Onaylandı', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  gonderildi: ['Beklemede', 'bg-amber-50 text-amber-700 border-amber-200'],
  iptal: ['İptal', 'bg-rose-50 text-rose-600 border-rose-200'],
};

/** Son teklifler tablosu */
const RecentQuotes: React.FC<{ quotes: Quote[]; rates: ReturnType<typeof useRates>; onOpen: (q: Quote) => void }> = ({ quotes, rates, onOpen }) => {
  if (!quotes.length) return <p className="px-4 pb-4 text-sm text-slate-400">Henüz teklif yok.</p>;
  return (
    <div className="px-3 pb-3">
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-1.5 rounded-lg bg-slate-50 text-[11px] font-semibold text-slate-500">
        <span>Firma</span><span className="text-right">Tutar</span><span className="w-20 text-center">Durum</span>
      </div>
      {quotes.map(q => {
        const [label, cls] = STATUS_BADGE[q.status] || [q.status, 'bg-slate-50 text-slate-600 border-slate-200'];
        const d = dayOf(q.createdAt);
        return (
          <button key={q.id} onClick={() => onOpen(q)} className="w-full grid grid-cols-[1fr_auto_auto] items-center gap-2 px-2 py-2 text-left hover:bg-slate-50 rounded-lg border-b border-slate-50 last:border-0">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800 truncate">{q.customerName}</span>
              <span className="block text-[11px] text-slate-400 tabular-nums">{d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : ''}</span>
            </span>
            <span className="text-sm font-bold text-slate-900 tabular-nums text-right">{tl(quoteTry(q, rates))}</span>
            <span className={`w-20 text-center text-[11px] font-bold px-2 py-1 rounded-full border ${cls}`}>{label}</span>
          </button>
        );
      })}
    </div>
  );
};

/** Aylık hedef: tahsilat halkası ve satış ilerlemesi; hedef buradan konur/değiştirilir */
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
  // Halka: tahsilat (yoksa satış) hedefi
  const main = canMoney ? { label: 'Toplam Tahsilat', value: cur.tahsilat, target: targets.collection } : { label: 'Onaylanan satış', value: cur.onay, target: targets.sales };
  const pct = main.target ? Math.round((main.value / main.target) * 100) : 0;
  const salesPct = targets.sales ? Math.round((cur.onay / targets.sales) * 100) : 0;
  return (
    <div className="px-4 sm:px-5 pb-4 space-y-3">
      <div className="flex items-center gap-4">
        <Donut size={120} stroke={14} parts={main.target ? [{ value: Math.min(pct, 100), color: '#10b37e' }, { value: Math.max(0, 100 - pct), color: 'transparent' }] : []}>
          <span className="text-2xl font-black text-[#0b2a4c] tabular-nums">{main.target ? `%${pct}` : '–'}</span>
        </Donut>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-500">{main.label}</p>
          <p className="text-xl font-black text-emerald-700 tabular-nums truncate">{tl(main.value)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{main.target ? <>Hedef: <b className="text-slate-700">{tl(main.target)}</b></> : 'Hedef konmamış'}</p>
          {main.target > 0 && (
            <div className="relative h-2.5 rounded-full bg-slate-100 overflow-hidden mt-2">
              <div className={`h-full rounded-full ${pct >= pace ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, pct)}%` }} />
              <div className="absolute top-0 bottom-0 w-0.5 bg-slate-500" style={{ left: `${pace}%` }} title={`Ayın %${pace}'i geçti`} />
            </div>
          )}
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
            <div className="absolute top-0 bottom-0 w-0.5 bg-slate-500" style={{ left: `${pace}%` }} />
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
        <button onClick={open} className="text-[11px] font-bold text-brand-700 hover:text-brand-800">{targets.sales || targets.collection ? 'Hedefi değiştir' : '+ Aylık hedef koy'}</button>
      )}
    </div>
  );
};
