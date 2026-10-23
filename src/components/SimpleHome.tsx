import React, { useMemo, useState } from 'react';
import { dayOf } from '../lib/dates';
import { BellRing, Bot, ChevronRight, FilePlus2, MessageCircleQuestion, Mic, PhoneCall, Receipt, Search, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Collection, Customer, Expense, Quote, QuickNote } from '../types';
import { foldName } from '../lib/customerInsights';
import { PENDING_STATUSES, needsFollowUp, quoteAgeInDays } from '../lib/quoteRules';
import { quoteTry, useRates } from '../lib/rates';
import type { ActiveTab } from './Sections';
import { QuickPrice } from './QuickPrice';
import { AskQuotes } from './AskQuotes';
import { QuoteAgent } from './QuoteAgent';
import { VoiceCommand, VoiceResult } from './VoiceCommand';
import { Targets, useSetting } from '../lib/settings';

type Tab = Exclude<ActiveTab, 'home'>;
/** Teklifler sayfasını süzülmüş açar: durum (all, aktif, takip, onaylandi, iptal) ve tarih aralığı */
export type QuoteView = { status: string; from?: string; to?: string };

const tl = (v: number) => `${Math.round(v).toLocaleString('tr-TR')} TL`;
const short = (v: number) => v >= 1e6 ? `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn` : v >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('tr-TR')} bin` : `${Math.round(v)}`;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const trDay = (s: string) => dayOf(s).split('-').reverse().join('.');
const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const AY_UZUN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
};
const sumTry = (list: { amount: number; currency: string }[]) => list.filter(x => (x.currency || 'TRY') === 'TRY').reduce((t, x) => t + (x.amount || 0), 0);

type Month = { key: string; teklif: number; adet: number; onay: number; onayAdet: number; tahsilat: number; harcama: number };

/**
 * Ana sayfa: hızlı işlemler, tek kutuda arama + yapay zekâ, bu ayın rakamları (dokununca ilgili liste süzülmüş açılır),
 * son 6 ay grafiği, ayın haftaları, firmalar ve bugün yapılacaklar (hatırlatmalar, aranacak teklifler).
 */
export const SimpleHome: React.FC<{
  quotes: Quote[];
  customers: Customer[];
  collections: Collection[];
  expenses: Expense[];
  notes: QuickNote[];
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
}> = ({ quotes, customers, collections, expenses, notes, sections, onOpen, onOpenQuotes, onOpenQuote, canAdd, onNewQuote, onNewCollection, onNewExpense, onOpenCustomer, onVoice }) => {
  const rates = useRates(quotes);
  const now = new Date();
  const t = ymd(now);
  const canMoney = sections.includes('collections');
  const canExp = sections.includes('expenses');
  const canQuotes = sections.includes('quotes');
  const openQuotes = (v: QuoteView) => (onOpenQuotes ? onOpenQuotes(v) : onOpen('quotes'));

  const s = useMemo(() => {
    const qv = (q: Quote) => quoteTry(q, rates);
    const keys = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    });
    // upTo: geçen ayı bugünün gününe kadar sayarak adil karşılaştırma
    const calc = (key: string, upTo?: string): Month => {
      const inM = (x?: string) => !!x && dayOf(x).startsWith(key) && (!upTo || dayOf(x) <= upTo);
      const qs = quotes.filter(q => inM(q.createdAt) && q.status !== 'iptal');
      const won = qs.filter(q => q.status === 'onaylandi');
      return {
        key, adet: qs.length, onayAdet: won.length,
        teklif: qs.reduce((a, q) => a + qv(q), 0),
        onay: won.reduce((a, q) => a + qv(q), 0),
        tahsilat: sumTry(collections.filter(c => inM(c.date))),
        harcama: sumTry(expenses.filter(e => inM(e.date))),
      };
    };
    const months = keys.map(k => calc(k));
    const prevKey = keys[4];
    const prevDim = new Date(Number(prevKey.slice(0, 4)), Number(prevKey.slice(5)), 0).getDate();
    const prevSame = calc(prevKey, `${prevKey}-${pad(Math.min(now.getDate(), prevDim))}`);
    const curKey = keys[5];
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const mq = quotes.filter(q => dayOf(q.createdAt).startsWith(curKey));
    const pending = quotes.filter(q => PENDING_STATUSES.includes(q.status));
    // Haftalar: verilen ve onaylanan (teklif tarihine göre)
    const weekOf = (x: string) => Math.floor((Number(dayOf(x).slice(8, 10)) - 1) / 7);
    const weeks = Array.from({ length: Math.ceil(dim / 7) }, (_, w) => {
      const l = mq.filter(q => q.status !== 'iptal' && weekOf(q.createdAt) === w);
      return {
        label: `${w * 7 + 1}–${Math.min(dim, w * 7 + 7)}`, from: `${curKey}-${pad(w * 7 + 1)}`, to: `${curKey}-${pad(Math.min(dim, w * 7 + 7))}`,
        teklif: l.reduce((a, q) => a + qv(q), 0), onay: l.filter(q => q.status === 'onaylandi').reduce((a, q) => a + qv(q), 0), adet: l.length,
      };
    });
    // Firmalar: bu ay en çok teklif verilenler, onaylananıyla
    const firms = new Map<string, { label: string; teklif: number; onay: number; count: number }>();
    for (const q of mq.filter(q => q.status !== 'iptal')) {
      const k = foldName(q.customerName);
      const f = firms.get(k) || { label: q.customerName, teklif: 0, onay: 0, count: 0 };
      f.teklif += qv(q); f.count++;
      if (q.status === 'onaylandi') f.onay += qv(q);
      firms.set(k, f);
    }
    const st = (pred: (q: Quote) => boolean) => { const l = mq.filter(pred); return { count: l.length, value: l.reduce((a, q) => a + qv(q), 0) }; };
    const followUps = quotes.filter(needsFollowUp).sort((a, b) => qv(b) - qv(a));
    return {
      months, cur: months[5], prev: months[4], prevSame, curKey, dim, weeks,
      firms: [...firms.values()].sort((a, b) => b.onay - a.onay || b.teklif - a.teklif).slice(0, 6),
      status: { onay: st(q => q.status === 'onaylandi'), bekleyen: st(q => PENDING_STATUSES.includes(q.status)), iptal: st(q => q.status === 'iptal') },
      pendingCount: pending.length, pendingAmt: pending.reduce((a, q) => a + qv(q), 0),
      followUps: followUps.slice(0, 5), followCount: followUps.length, followAmt: followUps.reduce((a, q) => a + qv(q), 0),
    };
  }, [quotes, collections, expenses, rates, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const reminders = useMemo(() => {
    // remindAt UTC tutulur: yerel gün sonuyla zaman olarak karşılaştırılır
    const end = new Date(`${t}T23:59:59`).getTime();
    return notes.filter(n => !n.done && n.remindAt && Date.parse(n.remindAt) <= end).sort((a, b) => a.remindAt!.localeCompare(b.remindAt!)).slice(0, 5);
  }, [notes, t]);

  const monthFrom = `${s.curKey}-01`, monthTo = `${s.curKey}-${pad(s.dim)}`;
  const m = Number(s.curKey.slice(5)) - 1;
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
    canQuotes && { label: 'Bekleyen (tümü)', value: tl(s.pendingAmt), sub: `${s.pendingCount} teklif karar bekliyor`,
      tone: 'text-amber-700', on: () => openQuotes({ status: 'aktif' }) },
    canMoney && { label: 'Tahsilat', value: tl(s.cur.tahsilat), sub: canExp ? `harcama ${short(s.cur.harcama)} TL` : `geçen ay ${short(s.prev.tahsilat)} TL`, cur: s.cur.tahsilat, prev: s.prevSame.tahsilat,
      tone: 'text-accent-700', on: () => onOpen('collections') },
  ].filter(Boolean) as { label: string; value: string; sub: string; cur?: number; prev?: number; tone: string; on: () => void }[];

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

      {/* Bugün yapılacaklar */}
      {(reminders.length > 0 || (canQuotes && s.followCount > 0)) && (
        <div className="grid gap-3 lg:grid-cols-2 items-start">
          {canQuotes && s.followCount > 0 && (
            <Card title={<><PhoneCall className="w-4 h-4 text-amber-600" /> Aranacak teklifler</>}
              right={<button onClick={() => openQuotes({ status: 'takip' })} className="text-xs font-bold text-brand-700 flex items-center">{s.followCount} teklif · {short(s.followAmt)} TL <ChevronRight className="w-3.5 h-3.5" /></button>}>
              <p className="px-4 -mt-1 pb-1 text-[11px] text-slate-500">Uzun süredir cevap bekleyenler, tutarı büyükten küçüğe</p>
              <div className="divide-y divide-slate-100">
                {s.followUps.map(q => (
                  <button key={q.id} onClick={() => onOpenQuote(q)} className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900 truncate">{q.customerName}</span>
                      <span className="block text-[11px] text-slate-500">{q.quoteNumber} · {quoteAgeInDays(q)} gündür bekliyor</span>
                    </span>
                    <span className="text-sm font-black text-slate-900 tabular-nums">{tl(quoteTry(q, rates))}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {reminders.length > 0 && (
            <Card title={<><BellRing className="w-4 h-4 text-cyan-600" /> Bugünün hatırlatmaları</>}
              right={<button onClick={() => onOpen('notes')} className="text-xs font-bold text-brand-700 flex items-center">Notlar <ChevronRight className="w-3.5 h-3.5" /></button>}>
              <div className="divide-y divide-slate-100">
                {reminders.map(n => (
                  <button key={n.id} onClick={() => onOpen('notes')} className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span className={`w-12 shrink-0 text-xs font-black tabular-nums ${dayOf(n.remindAt!) < t ? 'text-rose-600' : 'text-cyan-700'}`}>
                      {dayOf(n.remindAt!) < t ? trDay(n.remindAt!).slice(0, 5) : new Date(n.remindAt!).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-slate-800 line-clamp-2">{n.content}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {(canQuotes || canMoney) && (
        <>
          {/* Bu ay: rakamlar (dokununca ilgili liste açılır) */}
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 px-0.5">
              <h2 className="text-base font-black text-slate-900 whitespace-nowrap">{AY_UZUN[m]} {s.curKey.slice(0, 4)}</h2>
              <span className="text-[11px] text-slate-500 text-right">ayın {now.getDate()}/{s.dim}. günü<span className="hidden sm:inline"> · oklar geçen ayın aynı günlerine göre</span></span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {tiles.map(k => (
                <button key={k.label} onClick={k.on} className="group text-left bg-white rounded-2xl border border-slate-200 shadow-xs px-3.5 py-3 min-w-0 hover:border-brand-300 hover:shadow-md transition">
                  <span className="flex items-center justify-between gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {k.label} {k.prev !== undefined && <Change cur={k.cur || 0} prev={k.prev} />}
                  </span>
                  <span className={`block text-lg sm:text-xl font-black tabular-nums truncate mt-0.5 ${k.tone}`}>{k.value}</span>
                  <span className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="truncate">{k.sub}</span><ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-brand-500 shrink-0" />
                  </span>
                </button>
              ))}
            </div>
            <TargetBars cur={s.cur} canQuotes={canQuotes} canMoney={canMoney} day={now.getDate()} dim={s.dim} />
          </section>

          {canQuotes && (
            <div className="grid gap-3 lg:grid-cols-5">
              {/* Son 6 ay: verilen ve onaylanan, satış oranı */}
              <Card title="Son 6 ay · teklif ve satış" className="lg:col-span-3"
                right={<Legend items={[['bg-brand-200', 'Verilen'], ['bg-emerald-500', 'Onaylanan']]} />}>
                <MonthsChart months={s.months} onPick={key => openQuotes({ status: 'onaylandi', from: `${key}-01`, to: `${key}-31` })} />
              </Card>
              {/* Ayın durumu: onay / bekleyen / iptal */}
              <Card title="Bu ayki tekliflerin durumu" className="lg:col-span-2">
                <StatusBox st={s.status} onPick={status => openQuotes({ status, from: monthFrom, to: monthTo })} />
              </Card>
            </div>
          )}

          {canQuotes && (
            <div className="grid gap-3 lg:grid-cols-2">
              <Card title="Haftalara göre (bu ay)" right={<Legend items={[['bg-brand-200', 'Verilen'], ['bg-emerald-500', 'Onaylanan']]} />}>
                <div className="px-4 pb-3 space-y-2.5">
                  {s.weeks.map((w, i) => {
                    const max = Math.max(1, ...s.weeks.map(x => x.teklif));
                    const future = Number(w.from.slice(8)) > now.getDate();
                    return (
                      <button key={w.label} disabled={future} onClick={() => openQuotes({ status: 'all', from: w.from, to: w.to })}
                        className={`w-full text-left text-xs ${future ? 'opacity-40' : 'hover:bg-slate-50'} rounded-lg -mx-1 px-1 py-0.5`}>
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-slate-700">{w.label} {AY[m]}{now.getDate() >= Number(w.from.slice(8)) && now.getDate() <= Number(w.to.slice(8)) && <b className="text-brand-600"> · bu hafta</b>}</span>
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
              <Card title="Bu ayın firmaları" right={<span className="text-[11px] text-slate-500">onaylanana göre</span>}>
                {s.firms.length === 0 ? <p className="px-4 pb-4 text-sm text-slate-400">Bu ay henüz teklif yok.</p> : (
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

/** Geçen ayın aynı günlerine göre değişim */
const Change: React.FC<{ cur: number; prev: number }> = ({ cur, prev }) => {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-0.5 normal-case tracking-normal ${up ? 'text-emerald-600' : 'text-rose-600'}`}><Icon className="w-3 h-3" />%{Math.abs(pct)}</span>;
};

/** Son 6 ay: her ay için verilen ve onaylanan sütunu; altında tutarlar ve satış oranı; aya dokununca o ayın onaylananları */
const MonthsChart: React.FC<{ months: Month[]; onPick: (key: string) => void }> = ({ months, onPick }) => {
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
        <div className="relative h-full flex items-end gap-2">
          {months.map((x, i) => {
            const last = i === months.length - 1;
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
      <div className="flex gap-2 pl-10 mt-1.5">
        {months.map((x, i) => (
          <div key={x.key} className="flex-1 text-center min-w-0 leading-tight">
            <div className={`text-[11px] font-bold ${i === months.length - 1 ? 'text-brand-700' : 'text-slate-700'}`}>{AY[Number(x.key.slice(5)) - 1]}</div>
            <div className="text-[10px] text-brand-600 tabular-nums truncate">{x.teklif ? short(x.teklif) : '–'}</div>
            <div className="text-[10px] font-bold text-emerald-700 tabular-nums truncate">{x.onay ? short(x.onay) : '–'}</div>
            <div className="text-[10px] text-slate-500 tabular-nums">%{x.teklif ? Math.round((x.onay / x.teklif) * 100) : 0}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5 pl-10">Ayın altında: verilen, onaylanan ve satış oranı. Aya dokununca o ayın onaylanan teklifleri açılır.</p>
    </div>
  );
};

/** Bu ayki tekliflerin durumu: tutar payı ve adetler; satıra dokununca o liste açılır */
const StatusBox: React.FC<{ st: Record<'onay' | 'bekleyen' | 'iptal', { count: number; value: number }>; onPick: (status: string) => void }> = ({ st, onPick }) => {
  const rows = [
    { key: 'onaylandi', label: 'Onaylanan', x: st.onay, c: 'bg-emerald-500' },
    { key: 'aktif', label: 'Bekleyen', x: st.bekleyen, c: 'bg-amber-400' },
    { key: 'iptal', label: 'İptal', x: st.iptal, c: 'bg-rose-400' },
  ];
  const total = rows.reduce((a, r) => a + r.x.value, 0);
  if (!total) return <p className="px-4 pb-4 text-sm text-slate-400">Bu ay henüz teklif yok.</p>;
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

type Mode = 'search' | 'ask' | 'agent' | 'voice';

/** Tek kutu: ürün/firma arama, tekliflere soru, teklif taslağı (ajan), sesle kayıt */
const Assistant: React.FC<{
  quotes: Quote[]; customers: Customer[]; canQuotes: boolean;
  canAdd: { quote: boolean; collection: boolean; expense: boolean };
  onVoice?: (r: VoiceResult) => void; onOpenQuote: (q: Quote) => void; onOpenCustomer?: (name: string) => void;
}> = ({ quotes, customers, canQuotes, canAdd, onVoice, onOpenQuote, onOpenCustomer }) => {
  const modes = [
    { key: 'search' as Mode, label: 'Ara', short: 'Ara', icon: Search },
    canQuotes && { key: 'ask' as Mode, label: 'Tekliflere sor', short: 'Sor', icon: MessageCircleQuestion },
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
      {active === 'ask' && <AskQuotes quotes={quotes} customers={customers.map(c => c.name)} />}
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
