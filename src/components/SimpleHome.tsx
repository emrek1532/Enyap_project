import React, { useMemo } from 'react';
import { dayOf, localDay } from '../lib/dates';
import { FilePlus2, Wallet, Receipt, StickyNote, ChevronRight, CalendarClock, BellRing, TrendingUp, TrendingDown, Sparkles, UserRoundCheck, Trophy, Target, Lightbulb, FileText, Phone, CirclePause, Ban, FileUp } from 'lucide-react';
import { Collection, Customer, CustomerStatus, Expense, Quote, QuickNote } from '../types';
import { foldName, statusOf } from '../lib/customerInsights';
import { estimatedBalance } from '../lib/mikroBalance';
import { usePriceChanges } from '../lib/priceWatch';
import { WhatsAppMenu } from './WhatsAppMenu';
import { PENDING_STATUSES } from '../lib/quoteRules';
import { quoteTry, useRates } from '../lib/rates';
import { STATUS_LABEL } from './CustomerAccount';
import type { ActiveTab } from './Navigation';

type Tab = Exclude<ActiveTab, 'home'>;

const tl = (v: number) => `${Math.round(v).toLocaleString('tr-TR')} TL`;
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const trDay = (s: string) => dayOf(s).split('-').reverse().join('.');
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
  onOpenCustomer?: (name: string) => void;
  onSaveCustomer?: (c: Customer) => void;
  onOpenMikro?: () => void;
}> = ({ quotes, customers, collections, expenses, notes, sections, onOpen, onOpenQuote, canAdd, onNewQuote, onNewCollection, onNewExpense, onNewNote, onOpenCustomer, onSaveCustomer, onOpenMikro }) => {
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
      const inM = (s?: string) => !!s && dayOf(s).startsWith(key) && (!upTo || dayOf(s) <= upTo);
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
    // Bu ayın detayı: durum dağılımı, firmalar, haftalar, ödeme şekli, harcama kategorisi, ay sonu tahmini
    const curKey = keys[5];
    const inCur = (s?: string) => !!s && dayOf(s).startsWith(curKey);
    const mq = quotes.filter(q => inCur(q.createdAt));
    const mc = collections.filter(c => inCur(c.date) && (c.currency || 'TRY') === 'TRY');
    const me = expenses.filter(e => inCur(e.date) && (e.currency || 'TRY') === 'TRY');
    const group = <T,>(list: T[], key: (x: T) => string, val: (x: T) => number) => {
      const m = new Map<string, { label: string; value: number; count: number }>();
      for (const x of list) { const k = key(x) || 'Diğer'; const g = m.get(k) || { label: k, value: 0, count: 0 }; g.value += val(x); g.count++; m.set(k, g); }
      return [...m.values()].sort((a, b) => b.value - a.value);
    };
    const qv = (q: Quote) => quoteTry(q, rates);
    const st = (pred: (q: Quote) => boolean) => { const l = mq.filter(pred); return { count: l.length, value: l.reduce((t, q) => t + qv(q), 0) }; };
    const firms = new Map<string, { label: string; teklif: number; onay: number; count: number }>();
    for (const q of mq.filter(q => q.status !== 'iptal')) {
      const k = foldName(q.customerName);
      const f = firms.get(k) || { label: q.customerName, teklif: 0, onay: 0, count: 0 };
      f.teklif += qv(q); f.count++;
      if (q.status === 'onaylandi' || q.status === 'siparis') f.onay += qv(q);
      firms.set(k, f);
    }
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const weekOf = (s: string) => Math.min(4, Math.floor((Number(dayOf(s).slice(8, 10)) - 1) / 7));
    const weeks = Array.from({ length: Math.ceil(dim / 7) }, (_, w) => ({
      label: `${w * 7 + 1}-${Math.min(dim, w * 7 + 7)}`,
      teklif: mq.filter(q => q.status !== 'iptal' && weekOf(q.createdAt) === w).reduce((t, q) => t + qv(q), 0),
      tahsilat: mc.filter(c => weekOf(c.date) === w).reduce((t, c) => t + (c.amount || 0), 0),
    }));
    const dueChecks = collections.filter(c => c.dueDate && dayOf(c.dueDate).startsWith(curKey) && dayOf(c.dueDate) >= t);
    const detail = {
      day: now.getDate(), dim, weeks,
      onay: st(q => q.status === 'onaylandi' || q.status === 'siparis'),
      bekleyen: st(q => PENDING_STATUSES.includes(q.status)),
      iptal: st(q => q.status === 'iptal'),
      firms: [...firms.values()].sort((a, b) => b.teklif - a.teklif).slice(0, 5),
      newFirms: [...firms.keys()].filter(k => !quotes.some(q => foldName(q.customerName) === k && dayOf(q.createdAt) < `${curKey}-01`)).length,
      methods: group(mc, c => c.method, c => c.amount || 0),
      categories: group(me, e => e.category, e => e.amount || 0).slice(0, 5),
      dueChecks: { count: dueChecks.length, value: sumTry(dueChecks) },
    };
    return { months, cur: months[5], prev: months[4], prevSame: calc(keys[4], `${keys[4]}-${pad(day)}`), pendingCount: pending.length, pendingAmt: pending.reduce((t, q) => t + quoteTry(q, rates), 0), detail };
  }, [quotes, collections, expenses, rates, t]);
  const priceChanges = usePriceChanges(quotes, canQuotes);
  const tips = useMemo(() => {
    const list = buildTips({ quotes, customers, rates, t, canQuotes });
    const extra: Tip[] = [];
    if (canMoney) {
      // Mikro bakiyeleri: en çok alacak + güncellik hatırlatması
      const bal = customers.map(c => ({ c, b: estimatedBalance(c, collections) })).filter(x => x.b && x.b.estimate > 0)
        .sort((a, b) => b.b!.estimate - a.b!.estimate);
      if (bal.length) {
        const top = bal[0];
        extra.push({ id: 'alacak', icon: Wallet, tone: 'bg-accent-50 text-accent-700', tab: 'customers', customer: top.c.name, phone: top.c.phone,
          balance: top.b!.estimate,
          title: `En çok alacak: ${top.c.name}`, text: `${tl(top.b!.estimate)} açık bakiye.${bal.length > 1 ? ` Sonra: ${bal.slice(1, 3).map(x => `${x.c.name} ${short(x.b!.estimate)}`).join(', ')}.` : ''}`,
          advice: 'Ödeme planını sorun; WhatsApp\'tan hazır ödeme hatırlatması gönderebilirsiniz.' });
      }
      const last = customers.reduce((m, c) => (c.mikroBalanceDate && c.mikroBalanceDate > m ? c.mikroBalanceDate : m), '');
      const age = last ? Math.floor((Date.now() - Date.parse(last)) / 864e5) : null;
      if (onOpenMikro && (age == null || age > 15)) extra.push({ id: 'mikro', icon: FileUp, tone: 'bg-slate-100 text-slate-700', tab: 'customers',
        title: age == null ? 'Mikro bakiyelerini yükleyin' : `Mikro bakiyeleri ${age} gün önce yüklendi`,
        text: 'Cari bakiyelerin güncel görünmesi için Mikro\'dan aldığınız cari bakiye listesini yükleyin.' });
    }
    if (priceChanges.size) {
      const n = [...priceChanges.values()].reduce((a, x) => a + x.length, 0);
      extra.push({ id: 'fiyat', icon: TrendingUp, tone: 'bg-rose-50 text-rose-600', tab: 'quotes',
        title: `${priceChanges.size} bekleyen teklifte fiyat değişti`, text: `${n} kalemin katalog fiyatı teklif verildikten sonra güncellendi.`,
        advice: 'Müşteri onaylamadan önce revize teklif göndermeyi düşünün.' });
    }
    return [...list.slice(0, 1), ...extra, ...list.slice(1)].slice(0, 7);
  }, [quotes, customers, collections, rates, t, canQuotes, canMoney, priceChanges, onOpenMikro]);
  const setStatus = (name: string, status: CustomerStatus) => {
    if (!onSaveCustomer) return;
    const label = status === 'kara_liste' ? 'kara listeye' : 'pasife';
    if (!confirm(`${name} ${label} alınsın mı? Öneriler ve hatırlatmalarda artık gösterilmez.`)) return;
    const now = new Date().toISOString();
    const c = customers.find(x => foldName(x.name) === foldName(name));
    onSaveCustomer(c ? { ...c, status, updatedAt: now } : { id: 'cus-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), name, city: '', status, createdAt: now, updatedAt: now });
  };
  const reminders = useMemo(() => {
    // remindAt UTC tutulur: yerel gün sonuyla zaman olarak karşılaştırılır
    const end = new Date(`${t}T23:59:59`).getTime();
    return notes.filter(n => !n.done && n.remindAt && Date.parse(n.remindAt) <= end).sort((a, b) => a.remindAt!.localeCompare(b.remindAt!)).slice(0, 4);
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
            {tips.map(tip => {
              const btn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border whitespace-nowrap';
              return (
                <div key={tip.id} className="snap-start shrink-0 w-[82%] sm:w-80 bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 flex flex-col gap-2.5">
                  <button onClick={() => tip.quote ? onOpenQuote(tip.quote) : tip.customer && onOpenCustomer ? onOpenCustomer(tip.customer) : onOpen(tip.tab)} className="text-left flex gap-3">
                    <span className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center ${tip.tone}`}><tip.icon className="w-4.5 h-4.5" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-slate-900 leading-snug">{tip.title}</span>
                      <span className="block text-xs text-slate-500 mt-0.5 leading-snug">{tip.text}</span>
                    </span>
                  </button>
                  {tip.advice && (
                    <p className="text-xs text-slate-700 bg-slate-50 rounded-xl px-3 py-2 leading-snug flex gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-0.5" /> <span>{tip.advice}</span>
                    </p>
                  )}
                  <div className="flex gap-1.5 flex-wrap mt-auto">
                    {tip.quote && <button onClick={() => onOpenQuote(tip.quote!)} className={`${btn} bg-brand-600 border-brand-600 text-white`}><FileText className="w-3.5 h-3.5" /> Teklifi aç</button>}
                    {tip.phone && <a href={`tel:${tip.phone.replace(/[^\d+]/g, '')}`} className={`${btn} bg-accent-500 border-accent-500 text-white`}><Phone className="w-3.5 h-3.5" /> Ara</a>}
                    {(tip.id === 'big' || tip.id === 'sleep' || tip.id === 'alacak') && tip.customer && (
                      <WhatsAppMenu phone={tip.phone} ctx={{ name: tip.customer, quote: tip.quote, quoteValue: tip.quote ? quoteTry(tip.quote, rates) : undefined, balance: tip.balance, balanceDate: tip.balance != null ? today() : undefined }} />
                    )}
                    {tip.id === 'mikro' && onOpenMikro && <button onClick={onOpenMikro} className={`${btn} bg-brand-600 border-brand-600 text-white`}><FileUp className="w-3.5 h-3.5" /> Bakiye yükle</button>}
                    {tip.id === 'fiyat' && <button onClick={() => onOpen('quotes')} className={`${btn} bg-brand-600 border-brand-600 text-white`}><FileText className="w-3.5 h-3.5" /> Teklifleri gör</button>}
                    {tip.customer && onOpenCustomer && <button onClick={() => onOpenCustomer(tip.customer!)} className={`${btn} bg-white border-slate-200 text-slate-700`}><Lightbulb className="w-3.5 h-3.5" /> Ne yapmalı?</button>}
                    {tip.id === 'sleep' && onSaveCustomer && <>
                      <button onClick={() => setStatus(tip.customer!, 'pasif')} className={`${btn} bg-white border-slate-200 text-slate-600`}><CirclePause className="w-3.5 h-3.5" /> Pasife al</button>
                      <button onClick={() => setStatus(tip.customer!, 'kara_liste')} className={`${btn} bg-white border-rose-200 text-rose-600`}><Ban className="w-3.5 h-3.5" /> Kara liste</button>
                    </>}
                  </div>
                </div>
              );
            })}
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
                <span className={`w-14 shrink-0 text-xs font-black tabular-nums ${dayOf(n.remindAt!) < t ? 'text-rose-600' : 'text-cyan-700'}`}>
                  {dayOf(n.remindAt!) < t ? trDay(n.remindAt!).slice(0, 5) : new Date(n.remindAt!).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
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
const short = (v: number) => v >= 1e6 ? `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn` : v >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('tr-TR')} bin` : `${Math.round(v)}`;

type Month = { key: string; teklif: number; adet: number; onay: number; onayAdet: number; tahsilat: number; harcama: number };
type Part = { label: string; value: number; count: number };
type MonthDetail = {
  day: number; dim: number; weeks: { label: string; teklif: number; tahsilat: number }[];
  onay: { count: number; value: number }; bekleyen: { count: number; value: number }; iptal: { count: number; value: number };
  firms: { label: string; teklif: number; onay: number; count: number }[]; newFirms: number;
  methods: Part[]; categories: Part[]; dueChecks: { count: number; value: number };
};

/** Kart içinde başlıklı küçük blok */
const Block: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`rounded-2xl bg-white/10 p-3 min-w-0 ${className}`}>
    <p className="text-[11px] font-bold uppercase tracking-wider text-brand-200 mb-2">{title}</p>
    {children}
  </div>
);

/** Etiket + tutar + oran çubuğu */
const BarRow: React.FC<{ label: string; value: number; max: number; note?: string; color?: string }> = ({ label, value, max, note, color = 'bg-accent-400' }) => (
  <div className="text-xs">
    <div className="flex justify-between gap-2"><span className="truncate text-brand-50">{label}{note && <span className="text-brand-200"> · {note}</span>}</span><span className="font-bold tabular-nums shrink-0">{short(value)}</span></div>
    <div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%` }} /></div>
  </div>
);

/** Geçen aya göre değişim rozeti */
const Change: React.FC<{ cur: number; prev: number }> = ({ cur, prev }) => {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? 'text-emerald-300' : 'text-rose-300'}`}><Icon className="w-3 h-3" />%{Math.abs(pct)}</span>;
};

const MonthPanel: React.FC<{
  stats: { months: Month[]; cur: Month; prev: Month; prevSame: Month; pendingCount: number; pendingAmt: number; detail: MonthDetail };
  canQuotes: boolean; canMoney: boolean; canExp: boolean;
  onOpen: (tab: Tab) => void;
}> = ({ stats, canQuotes, canMoney, canExp, onOpen }) => {
  const [mode, setMode] = React.useState<'teklif' | 'tahsilat'>(canQuotes ? 'teklif' : 'tahsilat');
  const [open, setOpen] = React.useState(() => { try { return localStorage.getItem('home-month-detail') !== '0'; } catch { return true; } });
  React.useEffect(() => { try { localStorage.setItem('home-month-detail', open ? '1' : '0'); } catch { /* yok */ } }, [open]);
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

      <button onClick={() => setOpen(o => !o)} className="relative mt-3 w-full flex items-center justify-center gap-1 rounded-xl bg-white/10 hover:bg-white/15 py-2 text-xs font-bold">
        {open ? 'Detayı gizle' : 'Ayın detayını göster'} <ChevronRight className={`w-4 h-4 transition ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && <MonthDetails d={stats.detail} cur={cur} prev={prev} canQuotes={canQuotes} canMoney={canMoney} canExp={canExp} onOpen={onOpen} />}
    </section>
  );
};

/** "Bu ay nasıl gidiyor?" detayı: tahmin, durumlar, firmalar, haftalar, ödeme şekli, harcama */
const MonthDetails: React.FC<{ d: MonthDetail; cur: Month; prev: Month; canQuotes: boolean; canMoney: boolean; canExp: boolean; onOpen: (tab: Tab) => void }> = ({ d, cur, prev, canQuotes, canMoney, canExp, onOpen }) => {
  const f = d.dim / Math.max(1, d.day);
  const pace = (v: number, p: number) => {
    const est = v * f;
    if (!v) return `Bu ay henüz yok (geçen ay ${short(p)} TL)`;
    if (!p) return `Ay sonu tahmini ${short(est)} TL`;
    const pct = Math.round(((est - p) / p) * 100);
    return `Ay sonu tahmini ${short(est)} TL · geçen ayın ${pct >= 0 ? `%${pct} üstünde` : `%${-pct} altında`}`;
  };
  const statusTotal = d.onay.value + d.bekleyen.value + d.iptal.value;
  const weekMax = Math.max(1, ...d.weeks.map(w => Math.max(canQuotes ? w.teklif : 0, canMoney ? w.tahsilat : 0)));
  const thisWeek = Math.min(d.weeks.length - 1, Math.floor((d.day - 1) / 7));
  return (
    <div className="relative mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
      <Block title={`Gidişat · ${d.day}/${d.dim}. gün`} className="md:col-span-2">
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-2"><div className="h-full bg-white/60 rounded-full" style={{ width: `${(d.day / d.dim) * 100}%` }} /></div>
        <ul className="space-y-1 text-xs text-brand-50">
          {canQuotes && <li><b>Teklif:</b> {pace(cur.teklif, prev.teklif)}</li>}
          {canQuotes && cur.adet > 0 && <li><b>Ortalama teklif:</b> {tl(cur.teklif / cur.adet)} · {d.newFirms} yeni firma</li>}
          {canMoney && <li><b>Tahsilat:</b> {pace(cur.tahsilat, prev.tahsilat)}</li>}
          {canMoney && d.dueChecks.count > 0 && <li><b>Ay sonuna kadar vadesi gelen çek/senet:</b> {d.dueChecks.count} adet · {tl(d.dueChecks.value)}</li>}
          {canMoney && canExp && <li><b>Net (tahsilat − harcama):</b> {tl(cur.tahsilat - cur.harcama)}</li>}
        </ul>
      </Block>

      {canQuotes && (
        <Block title="Bu ayki tekliflerin durumu">
          {statusTotal ? <>
            <div className="flex h-3 rounded-full overflow-hidden bg-white/10 mb-2">
              {[[d.onay, 'bg-emerald-300'], [d.bekleyen, 'bg-amber-300'], [d.iptal, 'bg-rose-300']].map(([x, c], i) => (x as { value: number }).value > 0 &&
                <div key={i} className={c as string} style={{ width: `${((x as { value: number }).value / statusTotal) * 100}%` }} />)}
            </div>
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              {([['Onaylanan', d.onay, 'bg-emerald-300'], ['Bekleyen', d.bekleyen, 'bg-amber-300'], ['İptal', d.iptal, 'bg-rose-300']] as const).map(([l, x, c]) => (
                <div key={l} className="min-w-0"><span className="flex items-center gap-1 text-brand-100"><i className={`w-2 h-2 rounded-sm ${c}`} />{l}</span>
                  <b className="block tabular-nums">{short(x.value)}</b><span className="text-brand-200">{x.count} teklif</span></div>
              ))}
            </div>
          </> : <p className="text-xs text-brand-200">Bu ay henüz teklif yok.</p>}
        </Block>
      )}

      {canQuotes && (
        <Block title="En çok teklif verilen firmalar">
          {d.firms.length ? <div className="space-y-2">
            {d.firms.map(x => <BarRow key={x.label} label={x.label} value={x.teklif} max={d.firms[0].teklif}
              note={x.onay ? `${short(x.onay)} onay` : `${x.count} teklif`} color={x.onay ? 'bg-emerald-300' : 'bg-accent-400'} />)}
          </div> : <p className="text-xs text-brand-200">Bu ay henüz teklif yok.</p>}
        </Block>
      )}

      {(canQuotes || canMoney) && (
        <Block title="Haftalara göre">
          <div className="space-y-2">
            {d.weeks.map((w, i) => (
              <div key={w.label} className={`text-xs ${i > thisWeek ? 'opacity-40' : ''}`}>
                <div className="flex justify-between text-brand-100"><span>{w.label} {AY[Number(cur.key.slice(5)) - 1]}{i === thisWeek && <b className="text-white"> · bu hafta</b>}</span>
                  <span className="tabular-nums">{[canQuotes && `T ${short(w.teklif)}`, canMoney && `Th ${short(w.tahsilat)}`].filter(Boolean).join(' · ')}</span></div>
                {canQuotes && <div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden"><div className="h-full bg-white/60 rounded-full" style={{ width: `${(w.teklif / weekMax) * 100}%` }} /></div>}
                {canMoney && <div className="h-1.5 rounded-full bg-white/10 mt-0.5 overflow-hidden"><div className="h-full bg-accent-400 rounded-full" style={{ width: `${(w.tahsilat / weekMax) * 100}%` }} /></div>}
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-brand-100">
            {canQuotes && <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-white/60" /> Teklif (T)</span>}
            {canMoney && <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-accent-400" /> Tahsilat (Th)</span>}
          </div>
        </Block>
      )}

      {canMoney && (
        <Block title="Tahsilat · ödeme şekli">
          {d.methods.length ? <div className="space-y-2">
            {d.methods.map(x => <BarRow key={x.label} label={x.label} note={`${x.count} kayıt`} value={x.value} max={d.methods[0].value} />)}
          </div> : <p className="text-xs text-brand-200">Bu ay henüz tahsilat yok.</p>}
          <button onClick={() => onOpen('collections')} className="mt-2 text-[11px] font-bold text-brand-100 hover:text-white">Tahsilatlara git →</button>
        </Block>
      )}

      {canExp && (
        <Block title="Harcama · kategori">
          {d.categories.length ? <div className="space-y-2">
            {d.categories.map(x => <BarRow key={x.label} label={x.label} note={`${x.count} kayıt`} value={x.value} max={d.categories[0].value} color="bg-orange-300" />)}
          </div> : <p className="text-xs text-brand-200">Bu ay henüz harcama yok.</p>}
          <button onClick={() => onOpen('expenses')} className="mt-2 text-[11px] font-bold text-brand-100 hover:text-white">Harcamalara git →</button>
        </Block>
      )}
    </div>
  );
};

type Tip = { id: string; icon: React.ElementType; tone: string; title: string; text: string; tab: Tab; quote?: Quote; customer?: string; phone?: string; advice?: string; balance?: number };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5);

/** Verilerden kısa, işe yarar öneriler üretir (en fazla 6) */
function buildTips({ quotes: allQuotes, customers, rates, t, canQuotes }: {
  quotes: Quote[]; customers: Customer[]; rates: ReturnType<typeof useRates>; t: string; canQuotes: boolean;
}): Tip[] {
  const tips: Tip[] = [];
  // Pasif ve kara listedeki firmalar önerilerde gösterilmez
  const byName = new Map(customers.map(c => [foldName(c.name), c]));
  const blocked = new Set(customers.filter(c => statusOf(c) !== 'aktif').map(c => foldName(c.name)));
  const quotes = allQuotes.filter(q => !blocked.has(foldName(q.customerName)));
  const phoneOf = (name: string, q?: Quote) => byName.get(foldName(name))?.phone || q?.customerPhone || undefined;
  const won = (q: Quote) => q.status === 'onaylandi' || q.status === 'siparis';

  if (canQuotes) {
    // Son 60 günün en büyük bekleyen teklifi
    const big = quotes.filter(q => PENDING_STATUSES.includes(q.status) && daysBetween(q.createdAt, t) <= 60)
      .map(q => ({ q, v: quoteTry(q, rates) })).sort((a, b) => b.v - a.v)[0];
    if (big && big.v > 0) {
      const d = daysBetween(big.q.createdAt, t);
      const prev = quotes.filter(q => foldName(q.customerName) === foldName(big.q.customerName) && q.id !== big.q.id);
      const wonPrev = prev.filter(won).length;
      tips.push({ id: 'big', icon: Target, tone: 'bg-brand-50 text-brand-700', tab: 'quotes', quote: big.q, customer: big.q.customerName, phone: phoneOf(big.q.customerName, big.q),
        title: `En büyük fırsat: ${big.q.customerName}`, text: `${tl(big.v)} teklif ${d} gündür kararda.`,
        advice: d < 7 ? 'Bu hafta arayıp teklifin ulaştığını ve sorusu olup olmadığını teyit edin.'
          : wonPrev ? `Daha önce ${wonPrev} teklifinizi onayladı; arayıp karar tarihini sorun, gerekirse ödeme vadesi önerin.`
          : 'Arayıp karar sürecini sorun; fiyat engeli varsa alternatif marka ya da ödeme kolaylığı önerin.' });
    }

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
    if (sleeping.length) tips.push({ id: 'sleep', icon: UserRoundCheck, tone: 'bg-sky-50 text-sky-700', tab: 'customers', customer: sleeping[0].name, phone: phoneOf(sleeping[0].name),
      advice: 'Arayıp yeni proje olup olmadığını sorun; artık çalışmıyorsanız pasife ya da kara listeye alın.',
      title: `${sleeping[0].name} uzun süredir sessiz`, text: `${Math.floor(daysBetween(sleeping[0].at, t) / 30)} aydır teklif yok; geçmişte ${tl(sleeping[0].won)} iş yapıldı.${sleeping.length > 1 ? ` (+${sleeping.length - 1} firma daha)` : ''}` });

    // Son 12 ayın en iyi müşterisi
    const y = new Date(); y.setFullYear(y.getFullYear() - 1);
    const ys = localDay(y);
    const by = new Map<string, number>();
    for (const q of quotes) if (won(q) && dayOf(q.createdAt) >= ys) by.set(q.customerName, (by.get(q.customerName) || 0) + quoteTry(q, rates));
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) tips.push({ id: 'top', icon: Trophy, tone: 'bg-violet-50 text-violet-600', tab: 'customers', customer: top[0],
      advice: 'Özel fiyat veya öncelikli teslimat teklif ederek ilişkiyi güçlendirin.',
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
