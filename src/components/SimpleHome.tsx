import React, { useMemo, useState } from 'react';
import { dayOf } from '../lib/dates';
import { Bot, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, FilePlus2, MessageCircleQuestion, Mic, Receipt, Search, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Collection, Customer, Expense, Quote } from '../types';
import { foldName } from '../lib/customerInsights';
import { PENDING_STATUSES } from '../lib/quoteRules';
import { quoteTry, useRates } from '../lib/rates';
import type { ActiveTab } from './Sections';
import { QuickPrice } from './QuickPrice';
import { AskQuotes } from './AskQuotes';
import { QuoteAgent } from './QuoteAgent';
import { RequestReader } from './RequestReader';
import { VoiceCommand, VoiceResult } from './VoiceCommand';
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
  onVoice?: (r: VoiceResult) => void;
}> = ({ quotes, customers, collections, expenses, sections, onOpen, onOpenQuotes, onOpenQuote, canAdd, onNewQuote, onNewCollection, onNewExpense, onOpenCustomer, onVoice }) => {
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
    const st = (pred: (q: Quote) => boolean) => { const l = mq.filter(pred); return { count: l.length, value: l.reduce((a, q) => a + qv(q), 0) }; };
    return {
      months, cur, prev, prevSame, from, to, dim, parts,
      firms: [...firms.values()].sort((a, b) => b.onay - a.onay || b.teklif - a.teklif).slice(0, 6),
      status: { onay: st(q => q.status === 'onaylandi'), bekleyen: st(q => PENDING_STATUSES.includes(q.status)), iptal: st(q => q.status === 'iptal') },
    };
  }, [quotes, collections, expenses, rates, t, period.kind, period.y, period.m]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthFrom = s.from, monthTo = s.to;
  // Dönem adları: başlık, "bu ay / Ekim", "geçen ay / önceki ay"
  const title = isYear ? `${period.y}` : `${AY_UZUN[period.m]} ${period.y}`;
  const unit = isYear ? 'yıl' : 'ay';
  const prevName = isCurrent ? `geçen ${unit}` : `önceki ${unit}`;
  const thisName = isCurrent ? `Bu ${unit} henüz` : `${title} döneminde`;
  const dayOfYear = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 864e5) + 1;
  const progress = isCurrent
    ? (isYear ? `yılın ${dayOfYear}. günü` : `ayın ${now.getDate()}/${s.dim}. günü`)
    : (isYear ? 'tamamlanan yıl' : 'tamamlanan ay');
  const rate = s.cur.teklif ? Math.round((s.cur.onay / s.cur.teklif) * 100) : 0;

  const actions = [
    canAdd.quote && { label: 'Yeni Teklif', icon: FilePlus2, cls: 'bg-brand-600 hover:bg-brand-700 text-white', on: onNewQuote },
    canAdd.collection && { label: 'Tahsilat', icon: Wallet, cls: 'bg-accent-500 hover:bg-accent-600 text-white', on: onNewCollection },
    canAdd.expense && { label: 'Harcama', icon: Receipt, cls: 'bg-brand-900 hover:bg-brand-800 text-white', on: onNewExpense },
  ].filter(Boolean) as { label: string; icon: React.ElementType; cls: string; on: () => void }[];

  const tiles = [
    canQuotes && { label: 'Verilen teklif', value: tl(s.cur.teklif), sub: `${s.cur.adet} teklif`, cur: s.cur.teklif, prev: s.prevSame.teklif,
      tone: 'text-brand-700', on: () => openQuotes({ status: 'all', from: monthFrom, to: monthTo }) },
    canQuotes && { label: 'Onaylanan', value: tl(s.cur.onay), sub: `${s.cur.onayAdet} teklif · satış oranı %${rate}`, cur: s.cur.onay, prev: s.prevSame.onay,
      tone: 'text-emerald-700', on: () => openQuotes({ status: 'onaylandi', from: monthFrom, to: monthTo }) },
    canMoney && { label: 'Tahsilat', value: tl(s.cur.tahsilat), sub: `${prevName} ${short(s.prev.tahsilat)} TL`, cur: s.cur.tahsilat, prev: s.prevSame.tahsilat,
      tone: 'text-accent-700', on: () => onOpen('collections') },
    // Harcamada artış kötü: ok kırmızı
    canExp && { label: 'Harcama', value: tl(s.cur.harcama), sub: `${prevName} ${short(s.prev.harcama)} TL`, cur: s.cur.harcama, prev: s.prevSame.harcama,
      tone: 'text-rose-700', on: () => onOpen('expenses'), lowerIsBetter: true },
  ].filter(Boolean) as { label: string; value: string; sub: string; cur?: number; prev?: number; tone: string; on: () => void; lowerIsBetter?: boolean }[];

  return (
    <div className="space-y-4 pb-4">
      {/* Karşılama + hızlı işlemler */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">{GUN[now.getDay()]}, {now.getDate()} {AY_UZUN[now.getMonth()]}</p>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">{greeting()} 👋</h1>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {actions.map(a => (
            <button key={a.label} onClick={a.on}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm active:scale-[0.98] transition ${a.cls}`}>
              <a.icon className="w-4.5 h-4.5 shrink-0" /> {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Arama ve yapay zekâ tek kutuda */}
      <Assistant quotes={quotes} customers={customers} canQuotes={canQuotes} canAdd={canAdd} onVoice={onVoice}
        onOpenQuote={onOpenQuote} onOpenCustomer={onOpenCustomer} />

      {(canQuotes || canMoney) && (
        <>
          {/* Seçili dönem: rakamlar (dokununca ilgili liste açılır) */}
          <section className="space-y-2">
            <PeriodBar title={title} isYear={isYear} isCurrent={isCurrent} unit={unit}
              progress={progress} compare={isCurrent ? `geçen ${unit}ın aynı günlerine göre` : `önceki ${unit}a göre`}
              onPrev={() => shift(-1)} onNext={() => shift(1)} onKind={setKind} onToday={goToday} />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {tiles.map(k => (
                <button key={k.label} onClick={k.on} className="group text-left bg-white rounded-2xl border border-slate-200 shadow-xs px-3.5 py-3 min-w-0 hover:border-brand-300 hover:shadow-md transition">
                  <span className="flex items-center justify-between gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {k.label} {k.prev !== undefined && <Change cur={k.cur || 0} prev={k.prev} lowerIsBetter={k.lowerIsBetter} />}
                  </span>
                  <span className={`block text-lg sm:text-xl font-black tabular-nums truncate mt-0.5 ${k.tone}`}>{k.value}</span>
                  <span className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="truncate">{k.sub}</span><ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-brand-500 shrink-0" />
                  </span>
                </button>
              ))}
            </div>
            {!isYear && <TargetBars cur={s.cur} canQuotes={canQuotes} canMoney={canMoney} day={isCurrent ? now.getDate() : s.dim} dim={s.dim} />}
          </section>

          {canQuotes && (
            <div className="grid gap-3 lg:grid-cols-5">
              {/* Ayda son 6 ay, yılda 12 ay: verilen ve onaylanan, satış oranı */}
              <Card title={isYear ? `${period.y} · aylara göre` : 'Son 6 ay · teklif ve satış'} className="lg:col-span-3"
                right={<Legend items={[['bg-brand-200', 'Verilen'], ['bg-emerald-500', 'Onaylanan']]} />}>
                <MonthsChart months={s.months} hi={isYear ? (isCurrent ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}` : '') : s.from.slice(0, 7)}
                  note={isYear ? 'Aya dokununca o ayın ayrıntısı açılır.' : 'Aya dokununca o ayın onaylanan teklifleri açılır.'}
                  onPick={key => isYear
                    ? setPeriod({ kind: 'month', y: Number(key.slice(0, 4)), m: Number(key.slice(5)) - 1 })
                    : openQuotes({ status: 'onaylandi', from: `${key}-01`, to: `${key}-31` })} />
              </Card>
              {/* Dönemin durumu: onay / bekleyen / iptal */}
              <Card title={`${isCurrent ? `Bu ${unit}ki` : title} tekliflerin durumu`} className="lg:col-span-2">
                <StatusBox st={s.status} empty={`${thisName} teklif yok.`} onPick={status => openQuotes({ status, from: monthFrom, to: monthTo })} />
              </Card>
            </div>
          )}

          {canQuotes && (
            <div className="grid gap-3 lg:grid-cols-2">
              <Card title={isYear ? 'Çeyreklere göre' : `Haftalara göre${isCurrent ? ' (bu ay)' : ''}`} right={<Legend items={[['bg-brand-200', 'Verilen'], ['bg-emerald-500', 'Onaylanan']]} />}>
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
                        <div className="relative h-2.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                          <div className="absolute inset-y-0 left-0 bg-brand-200 rounded-full" style={{ width: `${(w.teklif / max) * 100}%` }} />
                          <div className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full" style={{ width: `${(w.onay / max) * 100}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
              <Card title={isCurrent ? `Bu ${unit}ın firmaları` : `${title} firmaları`} right={<span className="text-[11px] text-slate-500">onaylanana göre</span>}>
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
                          <div className="relative h-2.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-brand-200 rounded-full" style={{ width: `${(f.teklif / max) * 100}%` }} />
                            <div className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full" style={{ width: `${(f.onay / max) * 100}%` }} />
                          </div>
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

/** Beyaz kart: başlık, sağda isteğe bağlı bağlantı/açıklama */
const Card: React.FC<{ title: React.ReactNode; right?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, right, className = '', children }) => (
  <section className={`bg-white rounded-2xl border border-slate-200 shadow-xs min-w-0 ${className}`}>
    <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
      <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5 min-w-0">{title}</h2>
      {right}
    </header>
    {children}
  </section>
);

const Legend: React.FC<{ items: [string, string][] }> = ({ items }) => (
  <span className="flex gap-2.5 text-[10px] text-slate-500 shrink-0">
    {items.map(([c, l]) => <span key={l} className="flex items-center gap-1"><i className={`w-2.5 h-2.5 rounded-sm ${c}`} />{l}</span>)}
  </span>
);

/**
 * Dönem çubuğu: ‹ Kasım 2026 › oklarıyla önceki/sonraki ay (yılda yıl), sağda Ay | Yıl kısayolu,
 * geçmiş dönemdeyken "Bugün" ile bu döneme dönüş. Geleceğe gidilmez (sağ ok kapalı).
 */
const PeriodBar: React.FC<{
  title: string; isYear: boolean; isCurrent: boolean; unit: string; progress: string; compare: string;
  onPrev: () => void; onNext: () => void; onKind: (k: Period['kind']) => void; onToday: () => void;
}> = ({ title, isYear, isCurrent, unit, progress, compare, onPrev, onNext, onKind, onToday }) => {
  const arrow = 'w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:border-brand-300 hover:text-brand-700 active:scale-95 disabled:opacity-35 disabled:pointer-events-none';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <button onClick={onPrev} aria-label={`Önceki ${unit}`} title={`Önceki ${unit}`} className={arrow}><ChevronLeft className="w-4.5 h-4.5" /></button>
          <h2 className="min-w-[7.5rem] sm:min-w-[9rem] text-center text-base sm:text-lg font-black text-slate-900 whitespace-nowrap tabular-nums" aria-live="polite">{title}</h2>
          <button onClick={onNext} disabled={isCurrent} aria-label={`Sonraki ${unit}`} title={`Sonraki ${unit}`} className={arrow}><ChevronRight className="w-4.5 h-4.5" /></button>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isCurrent && (
            <button onClick={onToday} className="hidden sm:flex items-center gap-1 px-2.5 h-9 rounded-xl text-xs font-extrabold text-brand-700 hover:bg-brand-50 transition">
              <CalendarDays className="w-3.5 h-3.5" /> Bu {unit}
            </button>
          )}
          <div className="flex gap-1 p-1 rounded-xl bg-slate-200/70" role="tablist" aria-label="Dönem">
            {(['month', 'year'] as const).map(k => {
              const on = (k === 'year') === isYear;
              return (
                <button key={k} role="tab" aria-selected={on} onClick={() => onKind(k)}
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold transition ${on ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                  {k === 'month' ? 'Ay' : 'Yıl'}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="flex items-center justify-between gap-2 px-0.5 text-[11px] text-slate-500">
        <span>{progress}<span className="hidden sm:inline"> · oklar {compare}</span></span>
        {!isCurrent && <button onClick={onToday} className="sm:hidden font-bold text-brand-700">Bu {unit}a dön</button>}
      </p>
    </div>
  );
};

/** Önceki dönemin (bu dönemse aynı günlerine kadar) göre değişim */
const Change: React.FC<{ cur: number; prev: number; lowerIsBetter?: boolean }> = ({ cur, prev, lowerIsBetter }) => {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const good = lowerIsBetter ? !up : up;
  return <span className={`inline-flex items-center gap-0.5 normal-case tracking-normal ${good ? 'text-emerald-600' : 'text-rose-600'}`}><Icon className="w-3 h-3" />%{Math.abs(pct)}</span>;
};

/** Son 6 ay: her ay için verilen ve onaylanan sütunu; altında tutarlar ve satış oranı; aya dokununca o ayın onaylananları */
const MonthsChart: React.FC<{ months: Month[]; hi: string; note: string; onPick: (key: string) => void }> = ({ months, hi, note, onPick }) => {
  const gap = months.length > 6 ? 'gap-0.5 sm:gap-1.5' : 'gap-2';
  const max = Math.max(1, ...months.map(x => x.teklif));
  // Ölçek çizgileri: tepe ve yarı
  const ticks = [max, max / 2];
  return (
    <div className="px-4 pb-3">
      <div className="relative h-40 pl-10 mt-2">
        {ticks.map(v => (
          <div key={v} className="absolute left-10 right-0 border-t border-dashed border-slate-200" style={{ bottom: `${(v / max) * 100}%` }}>
            <span className="absolute -left-10 -top-2 w-9 text-right text-[9px] text-slate-400 tabular-nums">{short(v)}</span>
          </div>
        ))}
        <div className="absolute left-10 right-0 bottom-0 border-t border-slate-300" />
        <div className={`relative h-full flex items-end ${gap}`}>
          {months.map(x => {
            const last = x.key === hi;
            return (
              <button key={x.key} onClick={() => onPick(x.key)} title={`${AY_UZUN[Number(x.key.slice(5)) - 1]}: verilen ${tl(x.teklif)}, onaylanan ${tl(x.onay)}`}
                className="flex-1 h-full flex items-end justify-center gap-1 min-w-0 group">
                <div className={`flex-1 max-w-6 rounded-t group-hover:opacity-80 ${last ? 'bg-brand-400' : 'bg-brand-200'}`} style={{ height: `${Math.max(1, (x.teklif / max) * 100)}%` }} />
                <div className="flex-1 max-w-6 rounded-t bg-emerald-500 group-hover:opacity-80" style={{ height: `${Math.max(1, (x.onay / max) * 100)}%` }} />
              </button>
            );
          })}
        </div>
      </div>
      <div className={`flex ${gap} pl-10 mt-1.5`}>
        {months.map(x => (
          <div key={x.key} className="flex-1 text-center min-w-0 leading-tight">
            <div className={`text-[11px] font-bold ${x.key === hi ? 'text-brand-700' : 'text-slate-700'}`}>{AY[Number(x.key.slice(5)) - 1]}</div>
            <div className="text-[10px] text-brand-600 tabular-nums truncate">{x.teklif ? short(x.teklif) : '–'}</div>
            <div className="text-[10px] font-bold text-emerald-700 tabular-nums truncate">{x.onay ? short(x.onay) : '–'}</div>
            <div className="text-[10px] text-slate-500 tabular-nums">%{x.teklif ? Math.round((x.onay / x.teklif) * 100) : 0}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5 pl-10">Ayın altında: verilen, onaylanan ve satış oranı. {note}</p>
    </div>
  );
};

/** Seçili dönemdeki tekliflerin durumu: tutar payı ve adetler; satıra dokununca o liste açılır */
const StatusBox: React.FC<{ st: Record<'onay' | 'bekleyen' | 'iptal', { count: number; value: number }>; empty: string; onPick: (status: string) => void }> = ({ st, empty, onPick }) => {
  const rows = [
    { key: 'onaylandi', label: 'Onaylanan', x: st.onay, c: 'bg-emerald-500' },
    { key: 'aktif', label: 'Bekleyen', x: st.bekleyen, c: 'bg-amber-400' },
    { key: 'iptal', label: 'İptal', x: st.iptal, c: 'bg-rose-400' },
  ];
  const total = rows.reduce((a, r) => a + r.x.value, 0);
  if (!total) return <p className="px-4 pb-4 text-sm text-slate-400">{empty}</p>;
  return (
    <div className="px-4 pb-3">
      <div className="flex h-4 rounded-full overflow-hidden bg-slate-100">
        {rows.map(r => r.x.value > 0 && <div key={r.key} className={r.c} style={{ width: `${(r.x.value / total) * 100}%` }} />)}
      </div>
      <div className="mt-3 divide-y divide-slate-100">
        {rows.map(r => (
          <button key={r.key} onClick={() => onPick(r.key)} className="w-full flex items-center gap-2 py-2 text-left hover:bg-slate-50 rounded-lg">
            <i className={`w-3 h-3 rounded-sm shrink-0 ${r.c}`} />
            <span className="flex-1 text-sm font-semibold text-slate-700">{r.label}</span>
            <span className="text-xs text-slate-500 tabular-nums">{r.x.count} teklif · %{Math.round((r.x.value / total) * 100)}</span>
            <span className="w-24 text-right text-sm font-black text-slate-900 tabular-nums">{short(r.x.value)}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          </button>
        ))}
      </div>
    </div>
  );
};

type Mode = 'search' | 'ask' | 'request' | 'agent' | 'voice';

/** Tek kutu: ürün/firma arama, tekliflere soru, müşteri talebi okuma, teklif taslağı (ajan), sesle kayıt */
const Assistant: React.FC<{
  quotes: Quote[]; customers: Customer[]; canQuotes: boolean;
  canAdd: { quote: boolean; collection: boolean; expense: boolean };
  onVoice?: (r: VoiceResult) => void; onOpenQuote: (q: Quote) => void; onOpenCustomer?: (name: string) => void;
}> = ({ quotes, customers, canQuotes, canAdd, onVoice, onOpenQuote, onOpenCustomer }) => {
  const modes = [
    { key: 'search' as Mode, label: 'Ara', short: 'Ara', icon: Search },
    canQuotes && { key: 'ask' as Mode, label: 'Tekliflere sor', short: 'Sor', icon: MessageCircleQuestion },
    onVoice && canAdd.quote && { key: 'request' as Mode, label: 'Talep oku', short: 'Talep', icon: ClipboardList },
    onVoice && canAdd.quote && { key: 'agent' as Mode, label: 'Teklif hazırla', short: 'Taslak', icon: Bot },
    onVoice && (canAdd.quote || canAdd.collection || canAdd.expense) && { key: 'voice' as Mode, label: 'Sesle kayıt', short: 'Sesle', icon: Mic },
  ].filter(Boolean) as { key: Mode; label: string; short: string; icon: React.ElementType }[];
  const [mode, setModeState] = useState<Mode>(() => { try { return (localStorage.getItem('home-assistant') as Mode) || 'search'; } catch { return 'search'; } });
  const setMode = (k: Mode) => { setModeState(k); try { localStorage.setItem('home-assistant', k); } catch { /* */ } };
  const active = modes.some(x => x.key === mode) ? mode : 'search';
  return (
    <section className="space-y-2">
      <div className="flex gap-1 p-1 rounded-xl bg-slate-200/70">
        {modes.map(x => (
          <button key={x.key} onClick={() => setMode(x.key)}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition ${active === x.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            <x.icon className="w-3.5 h-3.5 shrink-0" /> <span className="sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.label}</span>
          </button>
        ))}
      </div>
      {active === 'search' && <QuickPrice quotes={quotes} customers={customers} onOpenQuote={onOpenQuote} onOpenCustomer={onOpenCustomer} />}
      {active === 'ask' && <AskQuotes quotes={quotes} customers={customers.map(c => c.name)} onOpenQuote={onOpenQuote} />}
      {active === 'request' && onVoice && <RequestReader customers={customers} onDraft={draft => onVoice({ kind: 'quote', draft })} />}
      {active === 'agent' && onVoice && <QuoteAgent quotes={quotes} customers={customers} onDraft={draft => onVoice({ kind: 'quote', draft })} />}
      {active === 'voice' && onVoice && <VoiceCommand customers={customers.map(c => c.name)} allow={canAdd} onResult={onVoice} />}
    </section>
  );
};

/** Aylık hedef: onaylanan satış ve tahsilat için ilerleme (dikey çizgi ayın geçen kısmı) */
const TargetBars: React.FC<{ cur: Month; canQuotes: boolean; canMoney: boolean; day: number; dim: number }> = ({ cur, canQuotes, canMoney, day, dim }) => {
  const [targets, saveTargets] = useSetting<Targets>('targets', { sales: 0, collection: 0 });
  const [edit, setEdit] = React.useState(false);
  const [draft, setDraft] = React.useState({ sales: '', collection: '' });
  const [err, setErr] = React.useState('');
  const pace = Math.round((day / dim) * 100);
  const rows = [
    canQuotes && targets.sales > 0 && { label: 'Satış hedefi', value: cur.onay, target: targets.sales },
    canMoney && targets.collection > 0 && { label: 'Tahsilat hedefi', value: cur.tahsilat, target: targets.collection },
  ].filter(Boolean) as { label: string; value: number; target: number }[];
  const num = (v: string) => Number(v.replace(/\./g, '').replace(',', '.')) || 0;
  const open = () => { setDraft({ sales: targets.sales ? String(targets.sales) : '', collection: targets.collection ? String(targets.collection) : '' }); setErr(''); setEdit(true); };
  const save = async () => {
    try { await saveTargets({ sales: num(draft.sales), collection: num(draft.collection) }); setEdit(false); }
    catch { setErr('Kaydedilemedi (yetki gerekli).'); }
  };
  if (!canQuotes && !canMoney) return null;
  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map(r => {
            const pct = Math.round((r.value / r.target) * 100);
            return (
              <div key={r.label} className="bg-white rounded-2xl border border-slate-200 shadow-xs px-3.5 py-2.5">
                <div className="flex justify-between text-xs font-semibold text-slate-600">
                  <span>{r.label} · <b className={pct >= pace ? 'text-emerald-700' : 'text-amber-700'}>%{pct}</b>
                    <span className="text-slate-400"> (ayın %{pace}'i geçti)</span></span>
                  <span className="tabular-nums">{short(r.value)} / {short(r.target)} TL</span>
                </div>
                <div className="relative h-2.5 rounded-full bg-slate-100 overflow-hidden mt-1.5">
                  <div className={`h-full rounded-full ${pct >= pace ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  <div className="absolute top-0 bottom-0 w-0.5 bg-slate-500" style={{ left: `${pace}%` }} title="Ayın geçen kısmı" />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {edit ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2 text-xs">
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
        <button onClick={open} className="text-[11px] font-bold text-brand-700 hover:text-brand-800 px-0.5">{rows.length ? 'Hedefi değiştir' : '+ Aylık hedef koy'}</button>
      )}
    </div>
  );
};
