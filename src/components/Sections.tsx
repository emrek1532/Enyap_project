import React from 'react';
import { FileText, Inbox, Users, Wallet, Receipt, BarChart3, StickyNote, Package, ChevronRight, ShieldCheck, Hourglass, AlarmClock, CheckCircle2, Coins } from 'lucide-react';

/** Uygulamanın bölümleri */
export type ActiveTab = 'home' | 'quotes' | 'requests' | 'customers' | 'notes' | 'collections' | 'expenses' | 'reports' | 'materials' | 'admin';

export const SECTION_META: Record<Exclude<ActiveTab, 'home'>, { title: string; icon: React.ElementType; tone: string }> = {
  quotes: { title: 'Teklifler', icon: FileText, tone: 'bg-brand-50 text-brand-600' },
  requests: { title: 'Talepler', icon: Inbox, tone: 'bg-emerald-50 text-emerald-600' },
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
  requests: 'Müşteri talepleri: girin, atayın, teklife dönüştürün.',
  customers: 'Müşteri bilgilerini yönetin.',
  collections: 'Tahsilat kayıtlarınızı görüntüleyin ve yönetin.',
  expenses: 'Harcama kayıtlarınızı görüntüleyin ve yönetin.',
  materials: 'Malzeme listesini görüntüleyin ve yönetin.',
  reports: 'Satış, tahsilat ve harcama raporları.',
  notes: 'Notlarınız ve son hareketler.',
  admin: 'Kullanıcılar ve yetkiler.',
};

/** Özet kutusu renkleri: belirgin açık zemin + dolu renkli simge; yazılar sade (lacivert/gri) */
export type StatTone = 'green' | 'blue' | 'violet' | 'orange';
const STAT_TONES: Record<StatTone, { box: string; icon: string }> = {
  green: { box: 'bg-emerald-50 border-emerald-200/80', icon: 'bg-emerald-500 text-white' },
  blue: { box: 'bg-sky-50 border-sky-200/80', icon: 'bg-brand-500 text-white' },
  violet: { box: 'bg-violet-50 border-violet-200/80', icon: 'bg-violet-500 text-white' },
  orange: { box: 'bg-orange-50 border-orange-200/80', icon: 'bg-orange-500 text-white' },
};
const TONE_ORDER: StatTone[] = ['green', 'blue', 'violet', 'orange'];
const statIcon = (label: string): React.ElementType =>
  /bekle|pasif/i.test(label) ? Hourglass
    : /takip|vade|gecik/i.test(label) ? AlarmClock
      : /onay|satış|nakit/i.test(label) ? CheckCircle2
        : /müşteri|firma/i.test(label) ? Users
          : /çek|senet/i.test(label) ? Receipt
            : /harcama|kalem|kayıt başına/i.test(label) ? Coins
              : BarChart3;

/** Rakam kutusu (sayfa başlıkları ve Rapor ortak): simge, etiket, büyük rakam, alt yazı; onClick varsa dokunulur */
export const StatBox: React.FC<{
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone: StatTone; icon?: React.ElementType;
  onClick?: () => void; className?: string;
}> = ({ label, value, sub, tone, icon, onClick, className = '' }) => {
  const t = STAT_TONES[tone];
  const SI = icon || statIcon(label);
  const body = (<>
    <span className={`hidden sm:flex w-11 h-11 rounded-xl items-center justify-center shrink-0 shadow-sm ${t.icon}`}><SI className="w-5 h-5" /></span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold text-slate-600 truncate">
        <span className={`sm:hidden w-2 h-2 rounded-full shrink-0 ${t.icon}`} />{label}
      </span>
      <span className="block mt-0.5 text-base sm:text-xl font-black tabular-nums break-words leading-tight text-[#1a3d6d]">{value}</span>
      {sub && <span className="block text-[11px] sm:text-xs text-slate-500 truncate">{sub}</span>}
    </span>
    {onClick && <ChevronRight className="hidden sm:block w-4 h-4 text-slate-400 shrink-0 self-start" />}
  </>);
  const cls = `${className} flex items-center gap-3 rounded-2xl border ${t.box} px-3 py-3 sm:px-4 sm:py-3.5 min-w-0 text-left shadow-[0_10px_26px_-22px_rgba(15,60,120,0.6)]`;
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]`}>{body}</button>
    : <div className={cls}>{body}</div>;
};
export const toneAt = (i: number) => TONE_ORDER[i % TONE_ORDER.length];

/**
 * Bölüm sayfalarının üstündeki açık başlık kartı: mavi simge kutusu, başlık + açıklama, sağda ana düğme;
 * altta isteğe bağlı özet rakamlar pastel kutularda. Telefonda solda geri düğmesi.
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
  <div className="mb-4 sm:mb-5 space-y-3 sm:space-y-4">
    <section className="relative overflow-hidden rounded-3xl border border-white bg-gradient-to-br from-white via-[#f1f6fd] to-[#dde9fa] px-4 py-4 sm:px-6 sm:py-5 shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)]">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 w-80 h-80 rounded-full bg-brand-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-40 -bottom-28 w-64 h-64 rounded-full bg-sky-100/70 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <button onClick={onBack} aria-label="Geri"
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 shrink-0">
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
        <span className="hidden sm:flex w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white items-center justify-center shrink-0 shadow-[0_10px_22px_-10px_rgba(0,110,198,0.9)]">
          <Icon className="w-6 h-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-black text-xl sm:text-[26px] tracking-tight leading-tight truncate text-[#1a3d6d]">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-slate-500 truncate">{subtitle}<span className="hidden md:inline ml-2 text-[11px] text-slate-400 tabular-nums" title={`Sürüm ${__APP_VERSION__}`}>v{__APP_VERSION__}</span></p>}
        </div>
        {tools}
        {action && (
          <button onClick={action.onClick}
            className="flex items-center gap-1.5 h-10 sm:h-11 px-3 sm:px-5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white text-sm font-bold shadow-[0_10px_24px_-10px_rgba(0,110,198,0.9)] shrink-0">
            <action.icon className="w-4.5 h-4.5" /> <span className="hidden sm:inline">{action.label}</span>
          </button>
        )}
      </div>
    </section>
    {stats && stats.length > 0 && (
      <div className={`grid grid-cols-2 ${stats.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-2.5 sm:gap-3`}>
        {stats.map((s, i) => (
          <StatBox key={s.label} label={s.label} value={s.value} sub={s.sub} tone={toneAt(i)}
            className={stats.length % 2 && i === stats.length - 1 ? 'col-span-2 lg:col-span-1' : ''} />
        ))}
      </div>
    )}
  </div>
);
