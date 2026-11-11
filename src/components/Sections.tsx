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

/** Özet kutusu renkleri: belirgin açık zemin + dolu renkli simge; yazılar sade (lacivert/gri); sağ altta hafif dalga */
export type StatTone = 'green' | 'blue' | 'violet' | 'orange';
const STAT_TONES: Record<StatTone, { box: string; icon: string; wave: string }> = {
  green: { box: 'bg-emerald-50 border-emerald-200/80', icon: 'bg-emerald-500 text-white', wave: 'text-emerald-300' },
  blue: { box: 'bg-sky-50 border-sky-200/80', icon: 'bg-brand-500 text-white', wave: 'text-sky-300' },
  violet: { box: 'bg-violet-50 border-violet-200/80', icon: 'bg-violet-500 text-white', wave: 'text-violet-300' },
  orange: { box: 'bg-orange-50 border-orange-200/80', icon: 'bg-orange-500 text-white', wave: 'text-orange-300' },
};
const TONE_ORDER: StatTone[] = ['green', 'blue', 'violet', 'orange'];
const statIcon = (label: string): React.ElementType =>
  /bekle|pasif/i.test(label) ? Hourglass
    : /takip|vade|gecik/i.test(label) ? AlarmClock
      : /onay|satış|nakit/i.test(label) ? CheckCircle2
        : /müşteri|firma/i.test(label) ? Users
          : /çek|senet/i.test(label) ? Receipt
            : /harcama|kalem|kayıt başına/i.test(label) ? Coins
              : /verilen|teklif/i.test(label) ? FileText
                : BarChart3;

/** Süs: kutunun sağ altında yumuşak dalga (veri değil) */
const Wave: React.FC<{ cls: string }> = ({ cls }) => (
  <svg aria-hidden viewBox="0 0 120 48" preserveAspectRatio="none" className={`pointer-events-none absolute right-0 bottom-0 w-28 sm:w-32 h-10 sm:h-12 ${cls}`}>
    <path d="M0 44 C18 40 26 30 42 32 C58 34 62 18 78 16 C94 14 100 6 120 2 L120 48 L0 48 Z" fill="currentColor" opacity="0.35" />
    <path d="M0 44 C18 40 26 30 42 32 C58 34 62 18 78 16 C94 14 100 6 120 2" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.9" />
  </svg>
);

/** Rakam kutusu (sayfa başlıkları ve Rapor ortak): simge, etiket, büyük rakam, alt yazı; onClick varsa dokunulur */
export const StatBox: React.FC<{
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone: StatTone; icon?: React.ElementType;
  /** geçen aya göre % değişim (varsa "↑ %40 geçen aya göre") */
  trend?: number | null;
  onClick?: () => void; className?: string;
}> = ({ label, value, sub, tone, icon, trend, onClick, className = '' }) => {
  const t = STAT_TONES[tone];
  const SI = icon || statIcon(label);
  const body = (<>
    <Wave cls={t.wave} />
    <span className={`relative hidden sm:flex w-11 h-11 rounded-xl items-center justify-center shrink-0 shadow-sm ${t.icon}`}><SI className="w-5 h-5" /></span>
    <span className="relative min-w-0 flex-1">
      <span className="flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold text-slate-600 truncate">
        <span className={`sm:hidden w-2 h-2 rounded-full shrink-0 ${t.icon}`} />{label}
      </span>
      <span className="block mt-0.5 text-base sm:text-xl font-black tabular-nums break-words leading-tight text-[#1a3d6d]">{value}</span>
      {trend != null ? (
        <span className="flex items-center gap-1 text-[11px] sm:text-xs truncate">
          <b className={`tabular-nums ${trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{trend >= 0 ? '↑' : '↓'} %{Math.abs(trend)}</b>
          <span className="text-slate-500 truncate">geçen aya göre</span>
        </span>
      ) : sub && <span className="block text-[11px] sm:text-xs text-slate-500 truncate">{sub}</span>}
    </span>
    {onClick && <ChevronRight className="relative hidden sm:block w-4 h-4 text-slate-400 shrink-0 self-start" />}
  </>);
  const cls = `${className} relative overflow-hidden flex items-center gap-3 rounded-2xl border ${t.box} px-3 py-3 sm:px-4 sm:py-3.5 min-w-0 text-left shadow-[0_10px_26px_-22px_rgba(15,60,120,0.6)]`;
  return onClick
    ? <button type="button" onClick={onClick} title={typeof sub === 'string' ? sub : undefined} className={`${cls} transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]`}>{body}</button>
    : <div className={cls} title={typeof sub === 'string' && trend != null ? sub : undefined}>{body}</div>;
};
export const toneAt = (i: number) => TONE_ORDER[i % TONE_ORDER.length];

type Stat = { label: string; value: string; sub?: string; trend?: number | null };
const StatGrid: React.FC<{ stats: Stat[] }> = ({ stats }) => (
  <div className={`grid grid-cols-2 ${stats.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-2.5 sm:gap-3`}>
    {stats.map((s, i) => (
      <StatBox key={s.label} label={s.label} value={s.value} sub={s.sub} trend={s.trend} tone={toneAt(i)}
        className={stats.length % 2 && i === stats.length - 1 ? 'col-span-2 lg:col-span-1' : ''} />
    ))}
  </div>
);

/** Fotoğraflı başlık (Teklifler): sağda tesisat fotoğrafı, solda büyük başlık; telefonda küçük fotoğraf */
export const HERO_IMG: Partial<Record<ActiveTab, { lg: string; sm: string }>> = {
  quotes: { lg: '/hero-teklif.webp', sm: '/hero-teklif-sm.webp' },
};

/**
 * Bölüm sayfalarının üstü: başlık + açıklama, sağda ana düğme; altta isteğe bağlı özet rakamlar.
 * `hero` verilirse (Teklifler) açık zemin üzerinde büyük başlık ve sağda fotoğraf; yoksa açık başlık kartı.
 * Telefonda solda geri düğmesi.
 */
export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  tone?: string;
  onBack: () => void;
  onHome?: () => void;
  action?: { label: string; icon: React.ElementType; onClick: () => void };
  stats?: Stat[];
  /** Sağ üstteki düğmeler (ara, eşitle, bildirim, kılavuz, çıkış) */
  tools?: React.ReactNode;
  hero?: { lg: string; sm: string };
}> = ({ title, subtitle, icon: Icon, onBack, action, stats, tools, hero }) => (
  <div className="mb-4 sm:mb-5 space-y-3 sm:space-y-4">
    {hero ? (
      <section className="relative overflow-hidden rounded-3xl border border-white bg-[#eef4fb] shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)]">
        <picture aria-hidden>
          <source media="(min-width: 768px)" srcSet={hero.lg} />
          <img src={hero.sm} alt="" draggable={false} className="pointer-events-none select-none absolute inset-y-0 right-0 h-full w-[62%] sm:w-[55%] lg:w-[48%] object-cover object-[30%_45%]" />
        </picture>
        {/* Fotoğrafın solu zemine karışır: yazı okunur kalsın */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#eef4fb] from-[38%] via-[#eef4fb]/60 via-[58%] to-transparent to-[85%] sm:from-[45%] sm:via-[64%] lg:from-[52%] lg:via-[70%]" />
        <div className="relative flex items-center gap-3 px-4 py-5 sm:px-7 sm:py-7 lg:py-9">
          <button onClick={onBack} aria-label="Geri"
            className="md:hidden self-start w-9 h-9 flex items-center justify-center rounded-xl bg-white/90 border border-slate-200 text-slate-600 shrink-0">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <div className="min-w-0 flex-1">
            <span aria-hidden className="block w-12 sm:w-16 h-1 sm:h-1.5 rounded-full bg-gradient-to-r from-brand-600 to-sky-400 mb-2 sm:mb-3" />
            <h1 className="font-black text-[28px] sm:text-4xl lg:text-5xl tracking-tight leading-none text-[#1a3d6d]">{title}</h1>
            {subtitle && <p className="mt-1.5 sm:mt-2 text-xs sm:text-base text-slate-600 max-w-[60%] sm:max-w-none line-clamp-2">{subtitle}<span className="hidden md:inline ml-2 text-[11px] text-slate-400 tabular-nums" title={`Sürüm ${__APP_VERSION__}`}>v{__APP_VERSION__}</span></p>}
          </div>
          {tools}
          {action && (
            <button onClick={action.onClick}
              className="self-end sm:self-center flex items-center gap-1.5 sm:gap-2 h-11 sm:h-12 px-3.5 sm:pl-5 sm:pr-4 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white text-sm sm:text-base font-bold shadow-[0_12px_26px_-10px_rgba(0,110,198,0.95)] ring-4 ring-white/50 shrink-0">
              <action.icon className="w-5 h-5" /> <span className="hidden sm:inline">{action.label}</span><ChevronRight className="hidden sm:block w-4 h-4 opacity-80" />
            </button>
          )}
        </div>
      </section>
    ) : (
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
    )}
    {stats && stats.length > 0 && <StatGrid stats={stats} />}
  </div>
);
