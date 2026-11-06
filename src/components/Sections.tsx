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

/**
 * Bölüm sayfalarının üstündeki koyu bant (ana sayfadaki gibi): simge, başlık + açıklama, sağda ana düğme,
 * altta isteğe bağlı özet rakamlar. Telefonda solda geri düğmesi.
 */
export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  tone?: string;
  onBack: () => void;
  onHome?: () => void;
  action?: { label: string; icon: React.ElementType; onClick: () => void };
  stats?: { label: string; value: string; sub?: string }[];
  /** Sağ üstteki düğmeler (ara, eşitle, bildirim, kılavuz, çıkış) */
  tools?: React.ReactNode;
}> = ({ title, subtitle, icon: Icon, onBack, action, stats, tools }) => (
  <section className="relative overflow-hidden rounded-3xl bg-[#0b2a4c] text-white px-4 py-4 sm:px-7 sm:py-5 mb-4 sm:mb-5">
    <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 w-96 h-96 rounded-full bg-brand-500/25 blur-3xl" />
    <div aria-hidden className="pointer-events-none absolute -left-20 bottom-0 w-72 h-72 rounded-full bg-sky-400/10 blur-3xl" />
    <div className="relative flex items-center gap-3">
      <button onClick={onBack} aria-label="Geri"
        className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 border border-white/15 text-white shrink-0">
        <ChevronRight className="w-4 h-4 rotate-180" />
      </button>
      <span className="hidden sm:flex md:hidden lg:flex w-12 h-12 rounded-2xl bg-white/10 border border-white/15 text-sky-300 items-center justify-center shrink-0">
        <Icon className="w-6 h-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="font-black text-xl sm:text-[26px] tracking-tight leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-sky-200/80 truncate">{subtitle}<span className="hidden md:inline ml-2 text-[11px] text-sky-200/50 tabular-nums" title={`Sürüm ${__APP_VERSION__}`}>v{__APP_VERSION__}</span></p>}
      </div>
      {tools}
      {action && (
        <button onClick={action.onClick}
          className="flex items-center gap-1.5 h-10 sm:h-11 px-3 sm:px-4 rounded-2xl bg-brand-500 hover:bg-brand-400 text-white text-sm font-bold shadow-[0_10px_24px_-10px_rgba(14,140,240,0.9)] shrink-0">
          <action.icon className="w-4.5 h-4.5" /> <span className="hidden sm:inline">{action.label}</span>
        </button>
      )}
    </div>
    {stats && stats.length > 0 && (
      <div className={`relative mt-4 grid grid-cols-2 ${stats.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-px rounded-2xl overflow-hidden bg-white/10`}>
        {stats.map((s, i) => (
          <div key={s.label} className={`${stats.length % 2 && i === stats.length - 1 ? 'col-span-2 lg:col-span-1 ' : ''}bg-[#0b2a4c] px-3 py-2.5 sm:px-4 sm:py-3 min-w-0`}>
            <span className="block text-[11px] sm:text-xs text-sky-200/80 font-semibold truncate">{s.label}</span>
            <span className="block mt-0.5 text-base sm:text-xl font-black tabular-nums truncate">{s.value}</span>
            {s.sub && <span className="block text-[11px] text-sky-100/60 truncate">{s.sub}</span>}
          </div>
        ))}
      </div>
    )}
  </section>
);
