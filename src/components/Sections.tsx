import React from 'react';
import { FileText, Users, Wallet, Receipt, BarChart3, StickyNote, Package, ChevronRight, ShieldCheck } from 'lucide-react';

/** Uygulamanın bölümleri */
export type ActiveTab = 'home' | 'quotes' | 'customers' | 'notes' | 'collections' | 'expenses' | 'reports' | 'materials' | 'admin';

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
/** Bölüm başlıklarının altındaki kısa açıklama */
export const SECTION_SUB: Record<Exclude<ActiveTab, 'home'>, string> = {
  quotes: 'Tüm tekliflerinizi buradan görüntüleyin ve yönetin.',
  customers: 'Müşteri bilgilerini yönetin.',
  collections: 'Tahsilat kayıtlarınızı görüntüleyin ve yönetin.',
  expenses: 'Harcama kayıtlarınızı görüntüleyin ve yönetin.',
  materials: 'Malzeme listesini görüntüleyin ve yönetin.',
  reports: 'Satış, tahsilat ve harcama raporları.',
  notes: 'Notlarınız ve son hareketler.',
  admin: 'Kullanıcılar ve yetkiler.',
};

/** Bölüm sayfalarının üstündeki başlık: simge, başlık + açıklama, sağda isteğe bağlı ana düğme (telefonda geri) */
export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  tone?: string;
  onBack: () => void;
  onHome?: () => void;
  action?: { label: string; icon: React.ElementType; onClick: () => void };
}> = ({ title, subtitle, icon: Icon, onBack, action }) => (
  <div className="flex items-center gap-3 mb-4 sm:mb-5">
    <button onClick={onBack} aria-label="Geri"
      className="md:hidden w-9 h-9 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 shadow-xs shrink-0">
      <ChevronRight className="w-4 h-4 rotate-180" />
    </button>
    <span className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-sky-500 text-white flex items-center justify-center shrink-0 shadow-[0_8px_18px_-8px_rgba(0,110,198,0.7)]">
      <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
    </span>
    <div className="min-w-0 flex-1">
      <h1 className="font-black text-slate-900 text-lg sm:text-2xl leading-tight truncate">{title}</h1>
      {subtitle && <p className="text-xs sm:text-sm text-slate-500 truncate">{subtitle}</p>}
    </div>
    {action && (
      <button onClick={action.onClick}
        className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white text-sm font-bold shadow-[0_8px_18px_-8px_rgba(0,110,198,0.8)] shrink-0">
        <action.icon className="w-4 h-4" /> <span className="hidden sm:inline">{action.label}</span>
      </button>
    )}
  </div>
);
