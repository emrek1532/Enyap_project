import React from 'react';
import { FileText, Users, Wallet, Receipt, BarChart3, StickyNote, Package, ChevronRight, ShieldCheck } from 'lucide-react';

/** Uygulamanın bölümleri */
export type ActiveTab = 'home' | 'quotes' | 'customers' | 'notes' | 'collections' | 'expenses' | 'reports' | 'materials' | 'admin';

const HomeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" />
  </svg>
);

export const SECTION_META: Record<Exclude<ActiveTab, 'home'>, { title: string; icon: React.ElementType; tone: string }> = {
  quotes: { title: 'Teklifler', icon: FileText, tone: 'bg-brand-50 text-brand-600' },
  customers: { title: 'Müşteriler', icon: Users, tone: 'bg-sky-50 text-sky-600' },
  collections: { title: 'Yapılan Tahsilatlar', icon: Wallet, tone: 'bg-accent-50 text-accent-700' },
  expenses: { title: 'Yapılan Harcamalar', icon: Receipt, tone: 'bg-slate-100 text-brand-800' },
  materials: { title: 'Malzemeler', icon: Package, tone: 'bg-violet-50 text-violet-600' },
  reports: { title: 'Rapor', icon: BarChart3, tone: 'bg-indigo-50 text-indigo-600' },
  notes: { title: 'Notlar', icon: StickyNote, tone: 'bg-cyan-50 text-cyan-600' },
  admin: { title: 'Yönetim', icon: ShieldCheck, tone: 'bg-slate-100 text-slate-700' },
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

