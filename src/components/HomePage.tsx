import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Users, Wallet, Receipt, BarChart3, StickyNote, Package, ChevronRight, Plus } from 'lucide-react';
import { Collection, Customer, Expense, Quote, QuickNote } from '../types';
import { PENDING_STATUSES } from '../lib/quoteRules';
import { supabase } from '../lib/supabase';
import type { ActiveTab } from './Navigation';

interface HomePageProps {
  quotes: Quote[];
  customers: Customer[];
  collections: Collection[];
  expenses: Expense[];
  notes: QuickNote[];
  onOpen: (tab: Exclude<ActiveTab, 'home'>) => void;
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

export const HomePage: React.FC<HomePageProps> = ({
  quotes, customers, collections, expenses, notes, onOpen, onNewQuote, onNewCollection, onNewExpense,
}) => {
  const s = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const month = today.slice(0, 7);
    const year = today.slice(0, 4);
    const pending = quotes.filter(q => PENDING_STATUSES.includes(q.status));
    const yearQuotes = quotes.filter(q => (q.createdAt || '').startsWith(year));
    const yearApproved = yearQuotes.filter(q => q.status === 'onaylandi' || q.status === 'siparis');
    const sum = (list: { totalAmount?: number; amount?: number }[]) => list.reduce((t, x) => t + (x.totalAmount ?? x.amount ?? 0), 0);
    const tryOnly = <T extends { currency: string }>(list: T[]) => list.filter(x => x.currency === 'TRY');
    const yearQuoteAmt = sum(yearQuotes);
    return {
      pending: pending.length,
      pendingAmt: sum(pending),
      approved: quotes.filter(q => q.status === 'onaylandi' || q.status === 'siparis').length,
      customers: customers.length,
      activeCustomers: new Set(quotes.map(q => q.customerName.trim().toLocaleLowerCase('tr'))).size,
      colYear: sum(tryOnly(collections.filter(c => c.date.startsWith(year)))),
      portfolio: collections.filter(c => c.dueDate && c.dueDate >= today).length,
      expMonth: sum(tryOnly(expenses.filter(e => e.date.startsWith(month)))),
      expYear: sum(tryOnly(expenses.filter(e => e.date.startsWith(year)))),
      rate: yearQuoteAmt > 0 ? sum(yearApproved) / yearQuoteAmt : 0,
      year,
      notes: notes.length,
      pinned: notes.filter(n => n.pinned).length,
    };
  }, [quotes, customers, collections, expenses, notes]);

  // Katalog sunucuda; sadece toplam sayıyı soruyoruz
  const [materialCount, setMaterialCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.from('materials').select('code', { count: 'estimated', head: true })
      .then(({ count }) => { if (alive && count != null) setMaterialCount(count); });
    return () => { alive = false; };
  }, []);

  const tiles: {
    tab: Exclude<ActiveTab, 'home'>; title: string; desc: string; Icon: React.ElementType;
    tone: string; ring: string; stat: string; statLabel: string;
  }[] = [
    { tab: 'quotes', title: 'Teklifler', desc: 'Teklif listesi, onay ve revize', Icon: FileText,
      tone: 'bg-brand-50 text-brand-600', ring: 'hover:border-brand-300',
      stat: s.pending.toLocaleString('tr-TR'), statLabel: `bekleyen · ${tl(s.pendingAmt)}` },
    { tab: 'customers', title: 'Müşteriler', desc: 'Firma kartları ve teklif geçmişi', Icon: Users,
      tone: 'bg-sky-50 text-sky-600', ring: 'hover:border-sky-300',
      stat: s.customers.toLocaleString('tr-TR'), statLabel: `kayıtlı firma · ${s.activeCustomers} teklif verilen` },
    { tab: 'materials', title: 'Malzemeler', desc: 'Fiyat listesi, kod ve stok', Icon: Package,
      tone: 'bg-teal-50 text-teal-600', ring: 'hover:border-teal-300',
      stat: materialCount == null ? '—' : materialCount.toLocaleString('tr-TR'), statLabel: 'kalem fiyat listesinde' },
    { tab: 'collections', title: 'Tahsilat', desc: 'Çek, senet ve nakit tahsilatlar', Icon: Wallet,
      tone: 'bg-accent-50 text-accent-700', ring: 'hover:border-accent-300',
      stat: tl(s.colYear), statLabel: `${s.year} tahsilatı · ${s.portfolio} çek/senet portföyde` },
    { tab: 'expenses', title: 'Harcama', desc: 'Yakıt, konaklama ve yol giderleri', Icon: Receipt,
      tone: 'bg-orange-50 text-orange-600', ring: 'hover:border-orange-300',
      stat: tl(s.expMonth), statLabel: `bu ay · ${s.year} yılı ${tl(s.expYear)}` },
    { tab: 'reports', title: 'Rapor', desc: 'Satış oranı, aylık özet, performans', Icon: BarChart3,
      tone: 'bg-indigo-50 text-indigo-600', ring: 'hover:border-indigo-300',
      stat: `%${(s.rate * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`, statLabel: `${s.year} satış oranı (tutar)` },
    { tab: 'notes', title: 'Notlar', desc: 'Ofis / saha notları ve akış', Icon: StickyNote,
      tone: 'bg-amber-50 text-amber-600', ring: 'hover:border-amber-300',
      stat: s.notes.toLocaleString('tr-TR'), statLabel: s.pinned ? `not · ${s.pinned} sabitlenmiş` : 'not' },
  ];

  const dateText = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Karşılama + hızlı işlemler */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-600 to-brand-800 text-white p-5 sm:p-6 shadow-sm">
        <div aria-hidden className="absolute -right-10 -top-16 w-56 h-56 rounded-full bg-white/5" />
        <div aria-hidden className="absolute right-16 -bottom-20 w-40 h-40 rounded-full bg-accent-400/20" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-brand-100 text-sm">{greeting()}</p>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight mt-0.5">Enyap Isı Teklif & Takip</h1>
            <p className="text-brand-100 text-xs sm:text-sm mt-1 capitalize">{dateText}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:flex">
            {[
              { label: 'Yeni Teklif', onClick: onNewQuote },
              { label: 'Tahsilat Ekle', onClick: onNewCollection },
              { label: 'Harcama Ekle', onClick: onNewExpense },
            ].map(a => (
              <button
                key={a.label}
                onClick={a.onClick}
                className="flex flex-col lg:flex-row items-center justify-center gap-1 lg:gap-1.5 px-2 lg:px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 active:bg-white/30 text-white text-xs sm:text-sm font-bold backdrop-blur-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="whitespace-nowrap">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Bölümler */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map((t, i) => (
          <button
            key={t.tab}
            onClick={() => onOpen(t.tab)}
            className={`${i === 0 ? 'col-span-2 ' : ''}group text-left bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 min-w-0 flex flex-col transition-all hover:shadow-md active:scale-[0.99] ${t.ring}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${t.tone}`}>
                <t.Icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </span>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h2 className="mt-3 font-black text-slate-900 text-base sm:text-lg">{t.title}</h2>
            <p className="text-[11px] sm:text-xs text-slate-500 leading-snug">{t.desc}</p>
            <div className="mt-auto pt-3">
              <div className="text-lg sm:text-2xl font-black text-slate-900 tabular-nums break-words">{t.stat}</div>
              <div className="text-[11px] sm:text-xs text-slate-500 leading-snug">{t.statLabel}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
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
};
