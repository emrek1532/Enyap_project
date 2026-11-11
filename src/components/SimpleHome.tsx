import { trNum } from '../lib/num';
import React, { useMemo, useState } from 'react';
import { dayOf } from '../lib/dates';
import { ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, Building2, Receipt, Search, Wallet, X, BarChart3, FilePlus2, TrendingDown, TrendingUp, Target, Inbox, PauseCircle, Phone, Zap, History, ArrowDownLeft, CheckCircle2, BellRing, Package } from 'lucide-react';
import { Collection, Customer, Expense, Quote, QuoteStatus, SyncStatus } from '../types';
import { PENDING_STATUSES, quoteNo, viewStatus, isPendingQuote, followDue, isExpiring, quoteAgeInDays, daysToExpiry, plusDays } from '../lib/quoteRules';
import { localDay } from '../lib/dates';
import { monthForecast } from '../lib/forecast';
import { useWide } from './ListUI';
import { quoteTry, useRates } from '../lib/rates';
import { estimatedBalance } from '../lib/mikroBalance';
import type { ActiveTab } from './Sections';
import type { ToolInfo, ToolMode } from './QuickTools';
import { Targets, useSetting } from '../lib/settings';

type Tab = Exclude<ActiveTab, 'home'>;
/** Teklifler sayfasını süzülmüş açar: durum (all, aktif, takip, onaylandi, iptal) ve tarih aralığı */
export type QuoteView = { status: string; from?: string; to?: string };

const foldKey = (s: string) => s.trim().toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
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
  /** Teklifin detayını Teklifler sayfasında aç (takip kartından) */
  onShowQuote?: (q: Quote) => void;
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
  /** Cari bakiyeleri görebilir (Alacak sekmesi) */
  showBalances?: boolean;
  /** Yönetici: ekibin yüklediği, kontrol bekleyen teklifler */
  reviewQuotes?: Quote[];
  /** Bana atanan açık talepler */
  myRequests?: { id: string; customerName: string; note?: string; createdAt: string }[];
  onOpenRequest?: (id: string) => void;
  /** Ana sayfadan teklif durumu (Onayla) */
  onSetStatus?: (id: string, status: QuoteStatus) => void;
  /** Ana sayfadan takip günü (Yarın ara) */
  onPatchQuote?: (id: string, patch: { followUpAt?: string }) => void;
}> = ({ onSetStatus, onPatchQuote, reviewQuotes = [], myRequests = [], onOpenRequest, quotes, customers, showBalances, collections, expenses, sections, onOpen, onOpenQuotes, onOpenQuote, onShowQuote, canAdd, onNewQuote, onNewCollection, onNewExpense, onOpenCustomer, userName, tools, onOpenTool, syncStatus, onSync, onSignOut, userEmail }) => {
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
  const recent = useMemo(() => [...quotes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 7), [quotes]);
  // Para özeti: en çok alacağımız firmalar (Mikro bakiyesi − sonraki tahsilat), en büyük bekleyen teklifler, dönemin en çok satılan ürünleri
  const money3 = useMemo(() => {
    const debtors = showBalances
      ? customers.map(c => ({ c, b: estimatedBalance(c, collections) })).filter(x => x.b && x.b.estimate >= 1)
          .sort((a, b) => b.b!.estimate - a.b!.estimate).map(x => ({ c: x.c, v: x.b!.estimate }))
      : [];
    // Seçili dönemde firmaya göre tahsilat (döviz kurla TL'ye çevrilir)
    const cm = new Map<string, { name: string; v: number; n: number }>();
    if (canMoney) for (const c of collections) {
      if (!c.date || c.date < s.from || c.date > s.to || !c.customerName) continue;
      const cur = c.currency || 'TRY';
      const v = (c.amount || 0) * (cur === 'USD' ? rates.USD : cur === 'EUR' ? rates.EUR : 1);
      const k = foldKey(c.customerName);
      const e = cm.get(k) || { name: c.customerName.trim(), v: 0, n: 0 };
      e.v += v; e.n += 1; cm.set(k, e);
    }
    const paid = [...cm.values()].sort((a, b) => b.v - a.v);
    const pm = new Map<string, { name: string; v: number; n: number }>();
    for (const q of quotes) {
      if (q.status !== 'onaylandi') continue;
      const d = dayOf(q.createdAt); if (d < s.from || d > s.to) continue;
      for (const it of q.items || []) {
        const name = (it.productName || '').trim(); if (!name) continue;
        const cur = it.currency || q.currency || 'TRY';
        const v = (it.totalPrice || 0) * (cur === 'USD' ? rates.USD : cur === 'EUR' ? rates.EUR : 1);
        const k = foldKey(name);
        const e = pm.get(k) || { name, v: 0, n: 0 };
        e.v += v; e.n += 1; pm.set(k, e);
      }
    }
    const products = [...pm.values()].sort((a, b) => b.v - a.v);
    return { debtors, paid, products };
  }, [customers, collections, quotes, rates, showBalances, canMoney, s.from, s.to]);
  // Telefonda grafik / hedef / firmalar kapalı başlar (seçim cihazda hatırlanır)
  const [more, setMore] = useState(() => { try { return localStorage.getItem('home-more') === '1'; } catch { return false; } });
  const toggleMore = () => setMore(v => { try { localStorage.setItem('home-more', v ? '0' : '1'); } catch { /* yok */ } return !v; });
  const wide = useWide('lg');
  /** Telefonda grafik ve firmalar kapalıyken hiç çizilmez (daha hızlı açılış) */
  const showMore = wide || more;
  // Bu ayın satış tahmini (raporlardaki ile aynı hesap; cihazdaki veriden)
  const forecast = useMemo(() => (isCurrent && !isYear && canQuotes ? monthForecast(quotes, q => quoteTry(q, rates), now) : undefined), [quotes, rates, isCurrent, isYear, canQuotes, t]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ---------- Yeni ana sayfa (v1.16): işe göre düzen ----------
  // Kullanım: en sık iş teklif girme (PDF) ve bekleyen teklife karar vermek; sonra tahsilat/harcama girmek.
  const pending = useMemo(() => {
    const today = localDay();
    const list = quotes.filter(isPendingQuote);
    const rank = (q: Quote) => (followDue(q, today) ? 0 : isExpiring(q, today) ? 1 : 2);
    return list
      .map(q => ({ q, r: rank(q) }))
      .sort((a, b) => a.r - b.r || (b.q.createdAt || '').localeCompare(a.q.createdAt || ''))
      .map(x => x.q);
  }, [quotes, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = [
    canQuotes && { label: 'Verilen teklif', tone: 0, icon: FileText, spark: s.spark.map(x => x.teklif), value: s.cur.teklif, sub: `${s.cur.adet} teklif`, prev: s.prevSame.teklif, on: () => openQuotes({ status: 'all', from: s.from, to: s.to }) },
    canQuotes && { label: 'Satış (onaylanan)', tone: 1, icon: CheckCircle2, spark: s.spark.map(x => x.onay), value: s.cur.onay, sub: `${s.cur.onayAdet} teklif`, prev: s.prevSame.onay, on: () => openQuotes({ status: 'onaylandi', from: s.from, to: s.to }) },
    canMoney && { label: 'Tahsilat', tone: 2, icon: Wallet, spark: s.spark.map(x => x.tahsilat), value: s.cur.tahsilat, prev: s.prevSame.tahsilat, on: () => onOpen('collections') },
    canExp && { label: 'Harcama', tone: 3, icon: Receipt, spark: s.spark.map(x => x.harcama), value: s.cur.harcama, prev: s.prevSame.harcama, on: () => onOpen('expenses'), lowerIsBetter: true },
  ].filter(Boolean) as { label: string; tone: number; icon: React.ElementType; spark: number[]; value: number; sub?: string; prev: number; on: () => void; lowerIsBetter?: boolean }[];

  const now2 = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  const hello = now.getHours() < 12 ? 'Günaydın' : now.getHours() < 18 ? 'İyi günler' : 'İyi akşamlar';
  const conv = s.cur.teklif ? Math.round((s.cur.onay / s.cur.teklif) * 100) : 0;
  // Son işlemler: teklif, tahsilat ve harcamalar tek akışta (cihazdaki veriden, en yeni 7)
  const feed = useMemo(() => {
    type F = { id: string; kind: 'q' | 'c' | 'e'; day: string; at: string; title: string; sub: string; amount: number; q?: Quote };
    const out: F[] = [];
    const cut = plusDays(-45);
    for (const q of quotes) { const d = dayOf(q.createdAt); if (d >= cut) out.push({ id: 'q' + q.id, kind: 'q', day: d, at: q.createdAt || '', title: q.customerName, sub: `Teklif ${quoteNo(q)}`, amount: quoteTry(q, rates), q }); }
    if (canMoney) for (const c of collections) if (c.date >= cut) out.push({ id: 'c' + c.id, kind: 'c', day: c.date, at: c.createdAt || '', title: c.customerName || 'Tahsilat', sub: `Tahsilat${c.method ? ` · ${c.method}` : ''}`, amount: (c.amount || 0) * (c.currency === 'USD' ? rates.USD : c.currency === 'EUR' ? rates.EUR : 1) });
    if (canExp) for (const e of expenses) if (e.date >= cut) out.push({ id: 'e' + e.id, kind: 'e', day: e.date, at: e.createdAt || '', title: e.description || e.category || 'Harcama', sub: `Harcama${e.category ? ` · ${e.category}` : ''}`, amount: (e.amount || 0) * (e.currency === 'USD' ? rates.USD : e.currency === 'EUR' ? rates.EUR : 1) });
    return out.sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at)).slice(0, 7);
  }, [quotes, collections, expenses, rates, canMoney, canExp, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasInbox = myRequests.length > 0 || reviewQuotes.length > 0;
  const quick = [
    canAdd.quote && { key: 'q', label: 'Yeni Teklif', icon: FilePlus2, on: onNewQuote, tone: 'from-[#D9ECFB] to-[#F1F6FC] text-[#006DBB]', ring: 'bg-white/80' },
    sections.includes('materials') && { key: 'm', label: 'Malzemeler', icon: Package, on: () => onOpen('materials'), tone: 'from-[#D3F2EC] to-[#EEFAF7] text-[#00B49A]', ring: 'bg-white/80' },
    canAdd.collection && { key: 'c', label: 'Tahsilat', icon: Wallet, on: onNewCollection, tone: 'from-[#D3EEFB] to-[#EFF9FE] text-[#009FE3]', ring: 'bg-white/80' },
    canAdd.expense && { key: 'e', label: 'Harcama', icon: Receipt, on: onNewExpense, tone: 'from-[#D8F1F0] to-[#F0F9FA] text-[#008F79]', ring: 'bg-white/80' },
  ].filter(Boolean) as { key: string; label: string; icon: React.ElementType; on: () => void; tone: string; ring: string }[];
  const glass = 'bg-white/10 hover:bg-white/15 border border-white/15 text-white';

  return (
    <div className="relative pb-6 space-y-4 sm:space-y-5">
      {/* Arka plan: üstte yumuşak mavi ışık */}
      {/* 1. Selam bandı: lacivert, sağda ENYAP binası fotoğrafı (net görünür) */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0a3168] via-[#0c3f7d] to-[#0f4f96] text-white min-h-[118px] sm:min-h-[150px] px-5 py-4 sm:px-7 sm:py-6 flex items-center shadow-[0_20px_44px_-28px_rgba(10,49,104,0.9)]">
        <div aria-hidden className="absolute inset-y-0 right-0 w-[58%] md:w-[50%] bg-no-repeat bg-[url(/hero-enyap-sm.webp)] md:bg-[url(/hero-enyap.webp)] bg-[length:auto_230%] bg-[position:96%_30%] md:bg-[length:auto_400%] md:bg-[position:100%_26%] [mask-image:linear-gradient(to_right,transparent,black_28%)]" />
        <div aria-hidden className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#0a3168]/70 to-transparent" />
        <div className="relative min-w-0 max-w-[68%] md:max-w-[62%] lg:max-w-[55%]">
          <p className="text-[11px] sm:text-sm text-sky-100/85"><span className="capitalize">{now2}</span><span className="ml-2 text-[11px] text-sky-100/55 tabular-nums">v{__APP_VERSION__}</span></p>
          <h1 className="text-[20px] sm:text-[26px] xl:text-[30px] font-black tracking-tight leading-tight drop-shadow whitespace-nowrap">{hello}, {firstName} <span className="inline-block">👋</span></h1>
          <p className="text-[13px] sm:text-[15px] text-sky-100/90">Bugünün özeti burada.</p>
        </div>
      </section>

      {/* 2. Arama (tablet/bilgisayar) + dönem seçimi */}
      {(canQuotes || canMoney) && (
        <div className="flex flex-col xl:flex-row xl:items-center gap-2.5 sm:gap-3">
          <button onClick={() => onOpenTool('search')} className="hidden md:flex xl:flex-1 w-full min-w-0 shrink-0 items-center gap-3 h-12 px-4 rounded-2xl bg-white border border-white text-left text-slate-500 shadow-[0_12px_28px_-20px_rgba(15,60,120,0.7)] hover:border-sky-200">
            <Search className="w-5 h-5 text-brand-600 shrink-0" /><span className="truncate text-[15px]">Ara, tekliflere sor, teklif hazırla ya da sesle kaydet…</span>
          </button>
          <div className="flex items-center gap-2 xl:shrink-0">
            <div className="flex flex-1 xl:flex-none items-center h-12 rounded-2xl bg-white border border-white shadow-[0_12px_28px_-20px_rgba(15,60,120,0.7)]">
              <button onClick={() => stepPeriod(-1)} className="w-11 h-full flex items-center justify-center text-slate-500 hover:text-[#173F73]" aria-label={isYear ? 'Önceki yıl' : 'Önceki ay'}><ChevronLeft className="w-5 h-5" /></button>
              <span className="flex-1 xl:w-36 flex items-center justify-center gap-1.5 text-sm font-black text-[#173F73] whitespace-nowrap"><CalendarDays className="w-4 h-4 text-brand-500" />{title}</span>
              <button onClick={() => stepPeriod(1)} disabled={isCurrent} className="w-11 h-full flex items-center justify-center text-slate-500 hover:text-[#173F73] disabled:opacity-25" aria-label={isYear ? 'Sonraki yıl' : 'Sonraki ay'}><ChevronRight className="w-5 h-5" /></button>
            </div>
            <div className="flex h-12 p-1 rounded-2xl bg-white border border-white shadow-[0_12px_28px_-20px_rgba(15,60,120,0.7)]" role="tablist" aria-label="Dönem türü">
              {([['month', 'Ay'], ['year', 'Yıl']] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={period.kind === k} onClick={() => setKind(k)}
                  className={`px-4 rounded-xl text-sm font-bold ${period.kind === k ? 'bg-[#0b3a75] text-white' : 'text-slate-600'}`}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Dönem kartı: büyük satış + teklif / tahsilat / harcama */}
      {(canQuotes || canMoney) && (
        <PeriodCard title={title} isYear={isYear} cur={s.cur} prev={s.prevSame} spark={s.spark} conv={conv}
          canQuotes={canQuotes} canMoney={canMoney} canExp={canExp} forecast={isCurrent && !isYear ? forecast : undefined}
          onOpenSales={() => openQuotes({ status: 'onaylandi', from: s.from, to: s.to })}
          onOpenQuotes={() => openQuotes({ status: 'all', from: s.from, to: s.to })}
          onOpenCollections={() => onOpen('collections')} onOpenExpenses={() => onOpen('expenses')} />
      )}

      {/* 2. Hızlı işlemler: her ekranda 4 kutu */}
      {quick.length > 0 && (
        <section className="relative">
          <h2 className="mb-2.5 flex items-center gap-1.5 text-[15px] font-black text-[#173F73]"><Zap className="w-4.5 h-4.5 text-[#009FE3] fill-[#009FE3]" />Hızlı İşlemler</h2>
          <div className={`grid gap-2 sm:gap-3 ${quick.length >= 4 ? 'grid-cols-4' : quick.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {quick.map(x => (
              <button key={x.key} onClick={x.on}
                className={`min-w-0 rounded-2xl sm:rounded-3xl bg-gradient-to-br ${x.tone} border border-white shadow-[0_12px_28px_-22px_rgba(15,60,120,0.7)] px-1 py-2.5 sm:py-4 flex flex-col xl:flex-row items-center justify-center gap-1.5 sm:gap-2 xl:gap-3 transition hover:-translate-y-0.5 active:scale-[0.97]`}>
                <span className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl ${x.ring} flex items-center justify-center shrink-0 shadow-sm`}><x.icon className="w-5 h-5 sm:w-5.5 sm:h-5.5" /></span>
                <span className="max-w-full truncate text-xs sm:text-sm font-black text-[#173F73] text-center leading-tight">{x.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 4. Gövde: bilgisayarda iki bağımsız sütun; tablette iki sütunlu ızgara; telefonda tek sütun */}
      <div className="relative flex flex-col gap-4 sm:gap-5 md:grid md:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="max-lg:contents lg:flex lg:flex-col lg:gap-5 min-w-0">
          {canQuotes && (
            <Card className="order-2 md:col-span-2" title="Satış Performansı" icon={BarChart3}
              right={<Tabs value={chart} onChange={k => setChart(k as Chart)} items={[['6m', 'Son 6 Ay'], ['year', 'Yıl'], ['all', 'Tümü']]} />}>
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 sm:px-5 text-xs text-slate-600">
                <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[#8CC8EE]" />Verilen teklif</span>
                <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[#00B49A]" />Onaylanan</span>
                {forecast && forecast.total > 0 && <span className="flex items-center gap-1.5 text-[#006DBB] font-semibold"><TrendingUp className="w-3.5 h-3.5" />Ay sonu tahmini {short(forecast.total)} TL</span>}
              </div>
              <BarsChart bars={bars} hi={hiKey}
                onPick={b => chart === 'all'
                  ? (setPeriod({ kind: 'year', y: Number(b.key), m: 0 }), setChart('year'))
                  : openQuotes({ status: 'all', from: b.from, to: b.to })} />
              {showMore && <StatusSplit st={s.status} conv={conv} title={title} onPick={status => openQuotes({ status, from: monthFrom, to: monthTo })} />}
            </Card>
          )}
          {canQuotes && (
            <DecisionList className="order-3 md:col-span-2" pending={pending} rates={rates}
              onOpen={onShowQuote || onOpenQuote} onAll={status => openQuotes({ status })}
              onApprove={onSetStatus ? q => onSetStatus(q.id, 'onaylandi') : undefined}
              onTomorrow={onPatchQuote ? q => onPatchQuote(q.id, { followUpAt: plusDays(1) }) : undefined} />
          )}
          {feed.length > 0 && (
            <Card className="order-6 md:col-span-2" title="Son İşlemler" icon={History} right={canQuotes ? <SeeAll onClick={() => openQuotes({ status: 'all' })} /> : undefined}>
              <ul className="px-2 sm:px-3 pb-3 divide-y divide-[#E2EAF3]">
                {feed.map(f => {
                  const [Icon, tone, label] = f.kind === 'q' ? [FileText, 'bg-[#F1F6FC] text-[#006DBB]', ''] : f.kind === 'c' ? [ArrowDownLeft, 'bg-[#E6F7F4] text-[#008F79]', ''] : [Receipt, 'bg-[#EEF3F8] text-[#173F73]', ''];
                  const st = f.q ? STATUS_BADGE[viewStatus(f.q)] : null;
                  return (
                    <li key={f.id}>
                      <button onClick={() => (f.q ? onOpenQuote(f.q) : onOpen(f.kind === 'c' ? 'collections' : 'expenses'))} className="w-full flex items-center gap-3 px-2 py-2.5 text-left rounded-xl hover:bg-[#F1F6FC]">
                        <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-5 h-5" />{label}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-bold text-[#17365D] truncate">{f.title}</span>
                          <span className="block text-[12px] text-[#5E7491] truncate">{f.sub} · <b className={f.kind === 'c' ? 'text-[#008F79]' : f.kind === 'e' ? 'text-[#173F73]' : 'text-[#17365D]'}>{f.kind === 'e' ? '−' : ''}{lira(f.amount)}</b></span>
                        </span>
                        <span className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[12px] text-[#5E7491] tabular-nums">{f.day.slice(8, 10)}.{f.day.slice(5, 7)}.{f.day.slice(0, 4)}</span>
                          {st && <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${st[1]}`}>{st[0]}</span>}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
        <div className="max-lg:contents lg:flex lg:flex-col lg:gap-5 min-w-0">
          {hasInbox && (
            <TodoList className="order-1 md:col-span-2 lg:col-span-1" tone="sky" icon={Inbox} title="Gelen işler" n={myRequests.length + reviewQuotes.length}>
              {myRequests.slice(0, 4).map(r => (
                <TodoRow key={r.id} onClick={() => onOpenRequest?.(r.id)} tag="Talep" title={r.customerName} sub={r.note} />
              ))}
              {reviewQuotes.slice(0, 4).map(q => (
                <TodoRow key={q.id} onClick={() => (onShowQuote || onOpenQuote)(q)} tag="Kontrol" title={q.customerName} sub={`${quoteNo(q)} · ${lira(quoteTry(q, rates))}`} />
              ))}
            </TodoList>
          )}
          {(canQuotes || canMoney) && !isYear && (
            <Card className="order-4" title={canMoney ? 'Aylık Hedef' : 'Satış Hedefi'} icon={Target} right={<span className="text-xs font-bold text-[#006DBB]">{isCurrent ? 'Bu Ay' : AY_UZUN[period.m]}</span>}>
              <TargetCard cur={s.cur} canQuotes={canQuotes} canMoney={canMoney} day={isCurrent ? now.getDate() : s.dim} dim={s.dim} forecast={isCurrent && canQuotes ? forecast : undefined} />
            </Card>
          )}
          {(canQuotes || canMoney || (showBalances && money3.debtors.length > 0)) && (
            <div className={`order-5 min-w-0 flex ${isYear ? 'md:col-span-2 lg:col-span-1' : ''}`}>
              <MoneyCard data={money3} canQuotes={canQuotes} canMoney={canMoney} periodTitle={title}
                onOpenCustomer={onOpenCustomer} onAllDebtors={() => onOpen('customers')} onAllPaid={() => onOpen('collections')} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Dönem kartı: büyük satış rakamı + değişim, altında teklif / tahsilat / harcama (küçük çizgili), dönüşüm ve ay sonu tahmini */
const PeriodCard: React.FC<{
  className?: string; title: string; isYear: boolean; cur: Month; prev: Month; spark: Month[]; conv: number;
  canQuotes: boolean; canMoney: boolean; canExp: boolean; forecast?: { total: number };
  onOpenSales: () => void; onOpenQuotes: () => void; onOpenCollections: () => void; onOpenExpenses: () => void;
}> = ({ className = '', title, isYear, cur, prev, spark, conv, canQuotes, canMoney, canExp, forecast, onOpenSales, onOpenQuotes, onOpenCollections, onOpenExpenses }) => {
  const [targets] = useSetting<Targets>('targets', { sales: 0, collection: 0 });
  const vs = isYear ? 'geçen yıla göre' : 'geçen aya göre';
  const big = canQuotes
    ? { label: 'Satış (onaylanan)', value: cur.onay, prev: prev.onay, sub: `${cur.onayAdet} teklif`, on: onOpenSales, spark: spark.map(x => x.onay) }
    : { label: 'Tahsilat', value: cur.tahsilat, prev: prev.tahsilat, sub: '', on: onOpenCollections, spark: spark.map(x => x.tahsilat) };
  const minis = [
    canQuotes && { label: 'Verilen teklif', value: cur.teklif, prev: prev.teklif, sub: `${cur.adet} adet`, on: onOpenQuotes, spark: spark.map(x => x.teklif), color: '#38bdf8' },
    canQuotes && canMoney && { label: 'Tahsilat', value: cur.tahsilat, prev: prev.tahsilat, on: onOpenCollections, spark: spark.map(x => x.tahsilat), color: '#10b981' },
    canExp && { label: 'Harcama', value: cur.harcama, prev: prev.harcama, on: onOpenExpenses, spark: spark.map(x => x.harcama), color: '#fb7185', lower: true },
  ].filter(Boolean) as { label: string; value: number; prev: number; sub?: string; on: () => void; spark: number[]; color: string; lower?: boolean }[];
  const tPct = targets.sales && canQuotes ? Math.round((cur.onay / targets.sales) * 100) : 0;
  return (
    <section className={`bg-white rounded-3xl border border-white shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)] min-w-0 overflow-hidden text-slate-900 ${className}`}>
      <button onClick={big.on} className="w-full text-left px-4 sm:px-6 pt-4 sm:pt-5 pb-3 flex items-end justify-between gap-3 hover:bg-slate-50/60">
        <span className="min-w-0">
          <span className="block text-xs font-bold text-slate-500">{title} · {big.label}</span>
          <span className="block mt-1 text-[30px] sm:text-[40px] leading-none font-black tracking-tight text-[#173F73] tabular-nums truncate">{lira(big.value)}</span>
          <span className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Change cur={big.value} prev={big.prev} />{big.sub && <span>{big.sub} ·</span>}<span>{vs}</span></span>
        </span>
        <span className="hidden sm:block"><Spark values={big.spark} color="#10b981" w={120} h={44} /></span>
      </button>
      {(canQuotes && (conv > 0 || forecast || tPct > 0)) && (
        <div className="mx-4 sm:mx-6 mb-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-slate-100 text-xs font-bold text-slate-700">Dönüşüm <b className="text-[#173F73]">%{conv}</b></span>
          {tPct > 0 && <span className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-bold ${tPct >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}><Target className="w-3.5 h-3.5" />Hedefin %{tPct}'i</span>}
          {forecast && forecast.total > 0 && <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-sky-50 text-xs font-bold text-sky-800"><TrendingUp className="w-3.5 h-3.5" />Ay sonu tahmini {short(forecast.total)} TL</span>}
        </div>
      )}
      {minis.length > 0 && (
        <div className={`grid border-t border-slate-100 divide-x divide-slate-100 ${minis.length === 3 ? 'grid-cols-3' : minis.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {minis.map(m => (
            <button key={m.label} onClick={m.on} className="text-left px-3 sm:px-5 py-3 hover:bg-slate-50 min-w-0">
              <span className="flex items-center justify-between gap-1">
                <span className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">{m.label}</span>
                <span className="hidden xl:block"><Spark values={m.spark} color={m.color} /></span>
              </span>
              <span className="block mt-0.5 text-[15px] sm:text-xl font-black text-[#173F73] tabular-nums truncate">{short(m.value)}<span className="text-xs font-bold text-slate-400"> TL</span></span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500"><Change cur={m.value} prev={m.prev} lowerIsBetter={m.lower} />{m.sub && <span className="hidden sm:inline truncate">· {m.sub}</span>}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

/** Karar bekleyen teklifler: önce bugün aranacaklar, sonra süresi dolanlar, sonra en yeniler; satırdan Onayla / Yarın ara */
const DecisionList: React.FC<{
  className?: string; pending: Quote[]; rates: ReturnType<typeof useRates>;
  onOpen: (q: Quote) => void; onAll: (status: string) => void;
  onApprove?: (q: Quote) => void; onTomorrow?: (q: Quote) => void;
}> = ({ className = '', pending, rates, onOpen, onAll, onApprove, onTomorrow }) => {
  const today = localDay();
  type K = 'all' | 'calls' | 'expiring';
  const calls = pending.filter(q => followDue(q, today));
  const exp = pending.filter(q => isExpiring(q, today));
  const tabs = ([['all', 'Bekleyen', pending.length], ['calls', 'Bugün ara', calls.length], ['expiring', 'Süresi dolan', exp.length]] as [K, string, number][]).filter(x => x[0] === 'all' || x[2] > 0);
  const [tab, setTab] = useState<K>('all');
  const [ask, setAsk] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const list = (tab === 'calls' ? calls : tab === 'expiring' ? exp : pending).slice(0, 6);
  const SHOW_ALL: Record<K, string> = { all: 'aktif', calls: 'takip', expiring: 'expiring' };
  return (
    <section className={`bg-white rounded-3xl border border-[#E2EAF3] shadow-[0_12px_30px_-24px_rgba(18,52,91,0.45)] min-w-0 overflow-hidden ${className}`}>
      <header className="px-4 sm:px-5 pt-4 pb-2 flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-2xl bg-[#F1F6FC] text-[#006DBB] flex items-center justify-center shrink-0"><BellRing className="w-5 h-5" /></span>
        <span className="flex-1 min-w-0">
          <h2 className="text-base font-black text-[#173F73] truncate">Takip · karar bekleyenler</h2>
          <p className="text-[11px] text-[#5E7491] truncate">Onayla ya da yarın aramak üzere ertele</p>
        </span>
        <button onClick={() => onAll(SHOW_ALL[tab])} className="text-[13px] font-bold text-[#006DBB] shrink-0">Tümü ({tab === 'calls' ? calls.length : tab === 'expiring' ? exp.length : pending.length})</button>
      </header>
      {tabs.length > 1 && (
        <div className="px-4 sm:px-5 pb-2 flex gap-1.5 overflow-x-auto" role="tablist">
          {tabs.map(([k, l, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`shrink-0 h-9 px-3.5 rounded-full text-xs font-bold border ${tab === k ? 'bg-[#173F73] border-[#173F73] text-white' : 'bg-white border-[#E2EAF3] text-slate-600'}`}>
              {l} <span className={tab === k ? 'text-sky-200' : 'text-slate-400'}>{n}</span>
            </button>
          ))}
        </div>
      )}
      {list.length === 0 && <p className="px-5 pb-5 text-sm text-[#5E7491]">Karar bekleyen teklif yok.</p>}
      <ul className="px-2 sm:px-3 pb-2 divide-y divide-[#E2EAF3]">
        {list.map((q, i) => {
          const age = quoteAgeInDays(q);
          const due = followDue(q, today);
          const d2e = daysToExpiry(q, today);
          const st = done[q.id];
          return (
            <li key={q.id} className={`${i >= 4 ? 'max-sm:hidden ' : ''}flex flex-col sm:flex-row sm:items-center gap-2 px-2 py-3`}>
              <button onClick={() => onOpen(q)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                <span className="w-10 h-10 rounded-2xl bg-slate-100 text-[#173F73] text-sm font-black flex items-center justify-center shrink-0">{(q.customerName || '?').trim().charAt(0).toLocaleUpperCase('tr')}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px] font-bold text-[#17365D] truncate">{q.customerName}</span>
                    {due && <span className="shrink-0 text-[11px] font-black px-1.5 py-0.5 rounded-md bg-[#E6F7F4] text-[#008F79]">Bugün ara</span>}
                    {!due && d2e !== null && d2e <= 3 && <span className="shrink-0 text-[11px] font-black px-1.5 py-0.5 rounded-md bg-[#EEF3F8] text-[#173F73]">{d2e < 0 ? 'Süre doldu' : `Süre ${d2e} gün`}</span>}
                  </span>
                  <span className="block text-[12px] text-[#5E7491] tabular-nums truncate">{quoteNo(q)} · {age === 0 ? 'bugün' : `${age} gün önce`} · <b className="text-slate-700">{lira(quoteTry(q, rates))}</b></span>
                </span>
              </button>
              {st ? (
                <span className="sm:w-[208px] h-10 flex items-center justify-center rounded-xl bg-[#E6F7F4] text-[#008F79] text-xs font-bold"><Check className="w-4 h-4 mr-1" />{st}</span>
              ) : (onApprove || onTomorrow) && (
                <span className="flex gap-2 sm:w-[208px] shrink-0">
                  {onTomorrow && (
                    <button onClick={() => { onTomorrow(q); setDone(x => ({ ...x, [q.id]: 'Yarın aranacak' })); }}
                      className="flex-1 h-10 rounded-xl border border-[#E2EAF3] text-xs font-bold text-slate-700 hover:bg-[#F1F6FC] flex items-center justify-center gap-1"><Phone className="w-3.5 h-3.5" />Yarın ara</button>
                  )}
                  {onApprove && (ask === q.id ? (
                    <button onClick={() => { onApprove(q); setAsk(null); setDone(x => ({ ...x, [q.id]: 'Onaylandı' })); }}
                      className="flex-1 h-10 rounded-xl bg-[#00B49A] hover:bg-[#008F79] text-white text-xs font-black">Evet, onayla</button>
                  ) : (
                    <button onClick={() => setAsk(q.id)}
                      className="flex-1 h-10 rounded-xl bg-[#E6F7F4] text-[#008F79] hover:bg-[#D2F1EB] text-xs font-bold flex items-center justify-center gap-1"><Check className="w-3.5 h-3.5" />Onayla</button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** Küçük çizgi grafik (son aylar); hepsi sıfırsa çizilmez */
const Spark: React.FC<{ values: number[]; color: string; w?: number; h?: number; fallback?: React.ReactNode }> = ({ values, color, w = 56, h = 18, fallback = null }) => {
  const max = Math.max(...values, 0);
  if (values.length < 2 || max <= 0) return <>{fallback}</>;
  const W = w, H = h;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 2 - (v / max) * (H - 4)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 opacity-80 group-hover:opacity-100" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.2" fill={color} />
    </svg>
  );
};

const TONES = {
  emerald: { icon: 'bg-[#E6F7F4] text-[#00B49A]', n: 'bg-[#00B49A]', arrow: 'text-[#00B49A]' },
  sky: { icon: 'bg-[#F1F6FC] text-[#006DBB]', n: 'bg-[#006DBB]', arrow: 'text-[#006DBB]' },
};
const TodoCtx = React.createContext<keyof typeof TONES>('sky');

/** Yapılacaklar kartı (talepler / kontrol): başlık, adet rozeti, en çok 4 satır */
const TodoList: React.FC<{ className?: string; tone: keyof typeof TONES; icon: React.ElementType; title: string; n: number; children: React.ReactNode }> = ({ className = '', tone, icon: Icon, title, n, children }) => (
  <section className={`${className} bg-white rounded-3xl border border-[#E2EAF3] shadow-[0_12px_30px_-24px_rgba(18,52,91,0.45)] min-w-0 overflow-hidden`}>
    <header className="px-4 sm:px-5 pt-4 pb-2 flex items-center gap-2.5">
      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${TONES[tone].icon}`}><Icon className="w-4.5 h-4.5" /></span>
      <h2 className="flex-1 min-w-0 truncate text-[15px] font-black text-[#173F73]">{title}</h2>
      <span className={`min-w-6 h-6 px-1.5 rounded-full text-white text-xs font-black flex items-center justify-center tabular-nums ${TONES[tone].n}`}>{n}</span>
    </header>
    <TodoCtx.Provider value={tone}><ul className="px-2 sm:px-3 pb-2">{children}</ul></TodoCtx.Provider>
  </section>
);
const TodoRow: React.FC<{ title: string; sub?: string; tag?: string; onClick: () => void }> = ({ title, sub, tag, onClick }) => {
  const tone = React.useContext(TodoCtx);
  return (
    <li>
      <button onClick={onClick} className="w-full flex items-center gap-3 px-2 py-2 text-left rounded-xl hover:bg-[#F1F6FC]">
        {tag && <span className="shrink-0 w-16 text-center text-[11px] font-black px-1.5 py-1 rounded-md bg-slate-100 text-slate-600">{tag}</span>}
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold text-[#17365D] truncate">{title}</span>
          {sub && <span className="block text-[11px] text-[#5E7491] truncate">{sub}</span>}
        </span>
        <ArrowRight className={`w-4 h-4 shrink-0 ${TONES[tone].arrow}`} />
      </button>
    </li>
  );
};

/** Para özeti: sekmeli tek liste — en çok alacağımız firmalar, en büyük bekleyen teklifler, dönemin en çok satılan ürünleri */
const MoneyCard: React.FC<{
  data: { debtors: { c: Customer; v: number }[]; paid: { name: string; v: number; n: number }[]; products: { name: string; v: number; n: number }[] };
  canQuotes: boolean; canMoney: boolean; periodTitle: string;
  onOpenCustomer?: (name: string) => void; onAllDebtors: () => void; onAllPaid: () => void;
}> = ({ data, canQuotes, canMoney, periodTitle, onOpenCustomer, onAllDebtors, onAllPaid }) => {
  type K = 'debt' | 'paid' | 'products';
  const tabs = ([['debt', 'Alacak', data.debtors.length], ['paid', 'Tahsilat', data.paid.length], ['products', 'Ürünler', data.products.length]] as [K, string, number][])
    .filter(([k]) => k === 'debt' ? data.debtors.length > 0 : k === 'paid' ? canMoney : canQuotes);
  const [pick, setPick] = useState<K | null>(null);
  const tab: K | undefined = tabs.find(x => x[0] === pick)?.[0] || tabs[0]?.[0];
  const SHOW = 5;
  const sum = (l: { v: number }[]) => l.reduce((t, x) => t + x.v, 0);
  const rowCls = 'w-full flex items-center gap-3 px-2 py-2 text-left rounded-xl hover:bg-[#F1F6FC]';
  const rank = (i: number) => <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>;
  const val = (v: number) => <span className="text-[13px] font-black text-[#17365D] tabular-nums shrink-0">{lira(v)}</span>;
  const sub = 'block text-[11px] text-[#5E7491] truncate';
  const name = 'block text-[13px] font-semibold text-[#17365D] truncate';
  const head = (label: string, total: number, all?: () => void, n?: number) => (
    <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-0.5">
      <p className="text-[11px] text-[#5E7491]">{label} <b className="text-[#17365D] tabular-nums">{lira(total)}</b></p>
      {all && n != null && n > SHOW && <button onClick={all} className="text-xs font-bold text-[#006DBB] shrink-0">Tümü ({n})</button>}
    </div>
  );
  return (
    <section className="flex-1 bg-white rounded-3xl border border-[#E2EAF3] shadow-[0_12px_30px_-24px_rgba(18,52,91,0.45)] min-w-0 overflow-hidden">
      <header className="px-4 sm:px-5 pt-4 pb-2">
        <h2 className="text-base font-black text-[#173F73] flex items-center gap-2"><Wallet className="w-5 h-5 text-[#006DBB]" />Para özeti</h2>
      </header>
      {tabs.length > 0 && (
        <div className="px-4 sm:px-5 pb-1 flex gap-1.5" role="tablist" aria-label="Para özeti">
          {tabs.map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setPick(k)}
              className={`flex-1 h-9 rounded-xl text-xs font-bold border ${tab === k ? 'bg-[#173F73] border-[#173F73] text-white' : 'bg-white border-[#E2EAF3] text-slate-600'}`}>
              {label} <span className={`tabular-nums ${tab === k ? 'text-sky-200' : 'text-[#5E7491]'}`}>{n}</span>
            </button>
          ))}
        </div>
      )}
      <div className="px-2 sm:px-3 pb-2 pt-1">
        {tab === 'debt' && (<>
          {head('Toplam alacak', sum(data.debtors), onAllDebtors, data.debtors.length)}
          {data.debtors.slice(0, SHOW).map(({ c, v }, i) => (
            <button key={c.id} onClick={() => onOpenCustomer?.(c.name)} className={rowCls}>
              {rank(i)}
              <span className="flex-1 min-w-0"><span className={name}>{c.name}</span><span className={sub}>{c.city || '—'}{c.mikroBalanceDate ? ` · Mikro ${c.mikroBalanceDate.split('-').reverse().join('.')}` : ''}</span></span>
              {val(v)}
            </button>
          ))}
        </>)}
        {tab === 'paid' && (<>
          {head(`${periodTitle} tahsilat`, sum(data.paid), onAllPaid, data.paid.length)}
          {data.paid.length === 0 && <p className="px-2 py-3 text-sm text-[#5E7491]">Bu dönemde tahsilat yok.</p>}
          {data.paid.slice(0, SHOW).map((p, i) => (
            <button key={p.name} onClick={() => onOpenCustomer?.(p.name)} className={rowCls}>
              {rank(i)}
              <span className="flex-1 min-w-0"><span className={name}>{p.name}</span><span className={sub}>{p.n} tahsilat</span></span>
              {val(p.v)}
            </button>
          ))}
        </>)}
        {tab === 'products' && (<>
          {head(`${periodTitle} onaylanan ürünler`, sum(data.products))}
          {data.products.length === 0 && <p className="px-2 py-3 text-sm text-[#5E7491]">Bu dönemde onaylanan ürün yok.</p>}
          {data.products.slice(0, SHOW).map((p, i) => (
            <div key={p.name} className={rowCls.replace('hover:bg-[#F1F6FC]', '')}>
              {rank(i)}
              <span className="flex-1 min-w-0"><span className={name}>{p.name}</span><span className={sub}>{p.n} teklif satırında</span></span>
              {val(p.v)}
            </div>
          ))}
        </>)}
      </div>
    </section>
  );
};

/** Teklif durumlarının payı (tutara göre) tek çubukta + dönüşüm oranı */
const StatusSplit: React.FC<{ st: Record<'onay' | 'bekleyen' | 'iptal', { count: number; value: number }>; conv: number; title: string; onPick: (status: string) => void }> = ({ st, conv, title, onPick }) => {
  const rows = [
    { key: 'onaylandi', label: 'Onaylanan', x: st.onay, c: 'bg-[#00B49A]' },
    { key: 'gonderildi', label: 'Bekleyen / Pasif', x: st.bekleyen, c: 'bg-[#009FE3]' },
    { key: 'iptal', label: 'İptal', x: st.iptal, c: 'bg-[#A9BBD0]' },
  ];
  const total = rows.reduce((a, r) => a + r.x.value, 0);
  return (
    <div className="mx-4 sm:mx-5 mb-4 p-3 sm:p-4 rounded-2xl bg-[#F1F6FC]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600">{title} teklifleri</p>
        <p className="text-xs text-slate-600">Dönüşüm <b className="text-sm font-black text-[#173F73]">%{conv}</b></p>
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-slate-200 overflow-hidden flex">
        {rows.map(r => total > 0 && <span key={r.key} className={r.c} style={{ width: `${(r.x.value / total) * 100}%` }} />)}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {rows.map(r => (
          <button key={r.key} onClick={() => onPick(r.key)} className="text-left min-w-0 rounded-lg hover:bg-white px-1 py-0.5">
            <span className="flex items-center gap-1.5 text-[11px] text-[#5E7491]"><i className={`w-2 h-2 rounded-full ${r.c}`} />{r.label} · {r.x.count}</span>
            <span className="block text-[13px] sm:text-sm font-black text-[#173F73] tabular-nums truncate">{lira(r.x.value)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/** Beyaz kart: simge + başlık, sağda isteğe bağlı bağlantı/sekme */
const Card: React.FC<{ title: React.ReactNode; icon?: React.ElementType; right?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, icon: Icon, right, className = '', children }) => (
  <section className={`bg-white rounded-3xl border border-[#E2EAF3] shadow-[0_12px_30px_-24px_rgba(18,52,91,0.45)] min-w-0 flex flex-col ${className}`}>
    <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 pt-4 pb-2.5">
      <h2 className="text-[15px] sm:text-base font-black text-[#173F73] flex items-center gap-2 min-w-0">{Icon && <Icon className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-[#006DBB] shrink-0" />}<span className="truncate">{title}</span></h2>
      {right}
    </header>
    {children}
  </section>
);

const SeeAll: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="flex items-center gap-1 text-[13px] font-bold text-[#006DBB] hover:text-[#173F73] shrink-0"><span className="xl:hidden 2xl:inline">Tümünü Gör</span><span className="hidden xl:inline 2xl:hidden">Tümü</span> <ArrowRight className="w-4 h-4" /></button>
);

const Tabs: React.FC<{ value: string; items: [string, string][]; onChange: (k: string) => void }> = ({ value, items, onChange }) => (
  <div className="flex gap-1 sm:gap-1.5 shrink-0" role="tablist">
    {items.map(([k, l]) => (
      <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
        className={`px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs sm:text-[13px] font-semibold transition ${value === k ? 'bg-[#006DBB] text-white shadow-[0_6px_14px_-6px_rgba(0,114,206,0.8)]' : 'bg-[#F1F6FC] text-[#17365D] hover:bg-[#E3EFFA]'}`}>{l}</button>
    ))}
  </div>
);

/** Önceki döneme (bu dönemse aynı günlerine kadar) göre değişim: %34 ↑ */
const Change: React.FC<{ cur: number; prev: number; lowerIsBetter?: boolean; dark?: boolean; pill?: boolean }> = ({ cur, prev, lowerIsBetter, dark, pill }) => {
  if (!prev) return <span className={`font-bold ${dark ? 'text-sky-200/60' : 'text-slate-500'}`}>–</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const good = lowerIsBetter ? !up : up;
  if (pill) return <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-black shrink-0 ${good ? 'bg-emerald-100/80 text-emerald-700' : 'bg-rose-100/80 text-rose-600'}`}>%{Math.abs(pct)} <Icon className="w-3.5 h-3.5" /></span>;
  return <span className={`inline-flex items-center gap-0.5 font-bold shrink-0 ${dark ? (good ? 'text-emerald-300' : 'text-rose-300') : good ? 'text-emerald-600' : 'text-rose-500'}`}>%{Math.abs(pct)} <Icon className="w-3.5 h-3.5" /></span>;
};

type BarItem = Month & { label: string; shortLabel: string; from: string; to: string };

/** Verilen / onaylanan sütunları; seçili ay koyu renkte. Fareyle üzerine gelince (dokunmatikte ilk dokunuşta) değerler kutuda görünür */
const BarsChart: React.FC<{ bars: BarItem[]; hi: string; onPick: (b: BarItem) => void }> = ({ bars, hi, onPick }) => {
  const [tip, setTip] = useState<string | null>(null);
  const many = bars.length > 6;
  const raw = Math.max(1, ...bars.map(x => x.teklif));
  // Yuvarlak ölçek: 2M, 4M, 6M… gibi
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => raw / k <= 5) || mag * 10;
  const max = Math.ceil(raw / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const tipIdx = bars.findIndex(b => b.key === tip);
  const t = tipIdx >= 0 ? bars[tipIdx] : null;
  const barW = many ? 'max-w-6' : 'max-w-12';
  return (
    <div className="px-3 sm:px-5 pb-4">
      <div className="relative h-44 sm:h-60 pl-11 mt-4" onPointerLeave={e => e.pointerType === 'mouse' && setTip(null)}>
        {ticks.map(v => (
          <div key={v} className={`absolute left-11 right-0 border-t ${v ? 'border-[#E2EAF3]' : 'border-[#E2EAF3]'}`} style={{ bottom: `${(v / max) * 100}%` }}>
            <span className="absolute -left-11 -top-2 w-9 text-right text-[11px] text-[#5E7491] tabular-nums">{v ? short(v) : '0 TL'}</span>
          </div>
        ))}
        <div className={`relative h-full flex items-end ${many ? 'gap-0.5 sm:gap-1.5' : 'gap-2 sm:gap-4'}`}>
          {bars.map(x => {
            const on = x.key === hi;
            const hov = x.key === tip;
            const hT = Math.max(0.8, (x.teklif / max) * 100);
            return (
              <button key={x.key} aria-label={`${x.label}: verilen ${tl(x.teklif)}, onaylanan ${tl(x.onay)}`}
                onPointerEnter={e => e.pointerType === 'mouse' && setTip(x.key)}
                onPointerDown={e => { if (e.pointerType !== 'mouse' && tip !== x.key) { e.preventDefault(); setTip(x.key); } }}
                onClick={() => { if (tip === x.key || !matchMedia('(hover: none)').matches) onPick(x); else setTip(x.key); }}
                className={`relative flex-1 h-full flex items-end justify-center gap-1 sm:gap-1.5 min-w-0 rounded-t-xl ${hov ? 'bg-[#F1F6FC]' : ''}`}>
                <div className={`flex-1 ${barW} rounded-t-md ${on || hov ? 'bg-gradient-to-t from-[#006DBB] to-[#009FE3]' : 'bg-gradient-to-t from-[#8CC8EE] to-[#B9DDF5]'}`} style={{ height: `${hT}%` }} />
                <div className={`flex-1 ${barW} rounded-t-md bg-gradient-to-t from-[#008F79] to-[#2BCDB4] ${hov ? 'brightness-95' : ''}`} style={{ height: `${Math.max(0.8, (x.onay / max) * 100)}%` }} />
              </button>
            );
          })}
        </div>
        {t && (
          <div className="pointer-events-none absolute top-1 z-10 w-48 rounded-xl bg-[#173F73] text-white shadow-lg px-3 py-2 text-xs"
            style={{ left: `calc(2.75rem + (100% - 2.75rem) * ${(tipIdx + 0.5) / bars.length})`, transform: `translateX(${tipIdx < bars.length / 3 ? '-15%' : tipIdx >= (bars.length * 2) / 3 ? '-85%' : '-50%'})` }}>
            <div className="font-black mb-1">{t.label}</div>
            <div className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-[#8CC8EE]" /><span className="flex-1 text-sky-100/80">Verilen</span><b className="tabular-nums">{lira(t.teklif)}</b></div>
            <div className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-[#2BCDB4]" /><span className="flex-1 text-sky-100/80">Onaylanan</span><b className="tabular-nums">{lira(t.onay)}</b></div>
            <div className="mt-1 text-[11px] text-sky-200/80">Onay oranı %{t.teklif ? Math.round((t.onay / t.teklif) * 100) : 0} · tıkla: teklifleri aç</div>
          </div>
        )}
      </div>
      <div className={`flex ${many ? 'gap-0.5 sm:gap-1.5' : 'gap-2 sm:gap-4'} pl-11 mt-2.5`}>
        {bars.map(x => (
          <div key={x.key} className={`flex-1 text-center min-w-0 text-[11px] sm:text-xs truncate ${x.key === hi ? 'font-bold text-[#173F73]' : 'text-slate-600'}`}><span className="xl:hidden">{x.shortLabel}</span><span className="hidden xl:inline">{x.label}</span></div>
        ))}
      </div>
    </div>
  );
};

const STATUS_BADGE: Record<string, [string, string, React.ElementType]> = {
  onaylandi: ['Onaylandı', 'bg-[#E6F7F4] text-[#008F79]', Check],
  gonderildi: ['Beklemede', 'bg-[#EAF5FC] text-[#006DBB]', Clock],
  pasif: ['Pasif', 'bg-[#EEF3F8] text-[#173F73]', PauseCircle],
  iptal: ['İptal', 'bg-slate-100 text-slate-600', X],
};

/** Son teklifler: firma, teklif no · tarih, tutar, durum (pasif ayrı) */
const RecentQuotes: React.FC<{ quotes: Quote[]; rates: ReturnType<typeof useRates>; onOpen: (q: Quote) => void }> = ({ quotes, rates, onOpen }) => {
  if (!quotes.length) return <p className="px-5 pb-5 text-sm text-[#5E7491]">Henüz teklif yok.</p>;
  return (
    <ul className="px-2 sm:px-3 pb-3 divide-y divide-[#E2EAF3]">
      {quotes.map((q, i) => {
        const [label, cls, Icon] = STATUS_BADGE[viewStatus(q)] || [q.status, 'bg-slate-50 text-slate-600', Clock];
        const d = dayOf(q.createdAt);
        return (
          <li key={q.id} className={i >= 5 ? 'hidden lg:block' : ''}>
            <button onClick={() => onOpen(q)} className="w-full flex items-center gap-3 px-2 py-2.5 text-left hover:bg-[#F1F6FC] rounded-xl">
              <span className="w-9 h-9 rounded-xl bg-slate-100 text-[#173F73] text-xs font-black flex items-center justify-center shrink-0">{(q.customerName || '?').trim().charAt(0).toLocaleUpperCase('tr')}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold text-[#17365D] truncate">{q.customerName}</span>
                <span className="block text-[11px] text-[#5E7491] tabular-nums truncate">{quoteNo(q)}{d ? ` · ${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : ''}</span>
              </span>
              <span className="flex flex-col 2xl:flex-row-reverse items-end 2xl:items-center gap-1 2xl:gap-3 shrink-0">
                <span className="text-[13px] font-black text-[#17365D] tabular-nums whitespace-nowrap">{lira(quoteTry(q, rates))}</span>
                <span className={`inline-flex items-center 2xl:justify-center gap-1 2xl:w-24 text-[11px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}><Icon className="w-3 h-3" />{label}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/** Halka grafik */
const Donut: React.FC<{ pct: number; size: number; stroke: number; children?: React.ReactNode }> = ({ pct, size, stroke, children }) => {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const len = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2EAF3" strokeWidth={stroke} />
        {len > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#donut-g)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${len} ${c - len}`} />}
        <defs><linearGradient id="donut-g" x1="0" x2="1"><stop offset="0" stopColor="#00B49A" /><stop offset="1" stopColor="#009FE3" /></linearGradient></defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
};

/** Aylık hedef: tahsilat (yoksa satış) halkası, toplam, hedef, ilerleme; hedef buradan konur/değiştirilir */
const TargetCard: React.FC<{ cur: Month; canQuotes: boolean; canMoney: boolean; day: number; dim: number; forecast?: { total: number; expected: number; pendN: number } }> = ({ cur, canQuotes, canMoney, day, dim, forecast }) => {
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
          <span className="text-xl font-black text-[#173F73] tabular-nums">{main.target ? `%${pct}` : '–'}</span>
        </Donut>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#5E7491]">{main.label}</p>
          <p className="text-lg font-black text-[#173F73] tabular-nums break-all leading-tight">{lira(main.value)}</p>
          <p className="text-xs text-[#5E7491] mt-1.5">{main.target ? <>Hedef: {lira(main.target)}</> : 'Hedef konmamış'}</p>
          <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden mt-2">
            <div className="h-full rounded-full bg-gradient-to-r from-[#00B49A] to-[#009FE3]" style={{ width: `${Math.min(100, pct)}%` }} />
            {main.target > 0 && <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400" style={{ left: `${pace}%` }} title={`Ayın %${pace}'i geçti`} />}
          </div>
        </div>
      </div>
      {canMoney && canQuotes && targets.sales > 0 && (
        <div className="text-xs">
          <div className="flex justify-between font-semibold text-slate-600">
            <span>Satış hedefi · <b className={salesPct >= pace ? 'text-[#008F79]' : 'text-[#006DBB]'}>%{salesPct}</b></span>
            <span className="tabular-nums">{short(cur.onay)} / {short(targets.sales)} TL</span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden mt-1">
            <div className={`h-full rounded-full ${salesPct >= pace ? 'bg-[#00B49A]' : 'bg-[#009FE3]'}`} style={{ width: `${Math.min(100, salesPct)}%` }} />
            <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400" style={{ left: `${pace}%` }} />
          </div>
        </div>
      )}
      {forecast && forecast.total > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-[#F1F6FC] px-3 py-2.5">
          <span className="w-8 h-8 rounded-xl bg-white text-[#006DBB] flex items-center justify-center shrink-0"><TrendingUp className="w-4.5 h-4.5" /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] text-slate-600">Ay sonu satış tahmini</span>
            <span className="block text-[15px] font-black text-[#173F73] tabular-nums truncate">{lira(forecast.total)}</span>
          </span>
          {targets.sales > 0 && (() => { const p = Math.round((forecast.total / targets.sales) * 100); return (
            <span className={`shrink-0 text-[11px] font-black px-2 py-1 rounded-full ${p >= 100 ? 'bg-[#E6F7F4] text-[#008F79]' : 'bg-[#EAF5FC] text-[#006DBB]'}`}>Hedefin %{p}'i</span>
          ); })()}
        </div>
      )}
      {edit ? (
        <div className="rounded-2xl border border-[#E2EAF3] p-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            {canQuotes && <label className="space-y-1"><span className="block text-slate-600 font-semibold">Aylık satış (TL)</span>
              <input inputMode="numeric" value={draft.sales} onChange={e => setDraft(d => ({ ...d, sales: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-[#E2EAF3] text-sm" placeholder="ör. 2000000" /></label>}
            {canMoney && <label className="space-y-1"><span className="block text-slate-600 font-semibold">Aylık tahsilat (TL)</span>
              <input inputMode="numeric" value={draft.collection} onChange={e => setDraft(d => ({ ...d, collection: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-[#E2EAF3] text-sm" placeholder="ör. 1500000" /></label>}
          </div>
          {err && <p className="text-red-600 font-semibold">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEdit(false)} className="px-3 py-1.5 rounded-lg font-bold text-slate-600">Vazgeç</button>
            <button onClick={save} className="px-3 py-1.5 rounded-lg font-bold bg-[#006DBB] text-white">Kaydet</button>
          </div>
        </div>
      ) : (
        <button onClick={open} className="text-xs font-bold text-[#006DBB] hover:text-[#173F73]">{targets.sales || targets.collection ? 'Hedefi değiştir' : '+ Aylık hedef koy'}</button>
      )}
    </div>
  );
};
