import React from 'react';
import { FileText, Inbox, Users, Wallet, Receipt, BarChart3, StickyNote, Package, ChevronRight, ShieldCheck, Hourglass, AlarmClock, CheckCircle2, Coins } from 'lucide-react';

/** Uygulamanın bölümleri */
export type ActiveTab = 'home' | 'quotes' | 'requests' | 'customers' | 'notes' | 'collections' | 'expenses' | 'reports' | 'materials' | 'admin';

export const SECTION_META: Record<Exclude<ActiveTab, 'home'>, { title: string; icon: React.ElementType; tone: string }> = {
  quotes: { title: 'Teklifler', icon: FileText, tone: 'bg-brand-50 text-brand-600' },
  requests: { title: 'Talepler', icon: Inbox, tone: 'bg-[#EAF4FC] text-[#006DBB]' },
  customers: { title: 'Müşteriler', icon: Users, tone: 'bg-sky-50 text-sky-600' },
  collections: { title: 'Tahsilatlar', icon: Wallet, tone: 'bg-[#E8F8F4] text-[#007C70]' },
  expenses: { title: 'Harcamalar', icon: Receipt, tone: 'bg-[#EAF4FC] text-[#006DBB]' },
  materials: { title: 'Malzemeler', icon: Package, tone: 'bg-violet-50 text-violet-600' },
  reports: { title: 'Rapor', icon: BarChart3, tone: 'bg-[#EAF4FC] text-[#006DBB]' },
  notes: { title: 'Notlar', icon: StickyNote, tone: 'bg-cyan-50 text-cyan-600' },
  admin: { title: 'Yönetim', icon: ShieldCheck, tone: 'bg-slate-100 text-slate-700' },
};
/** Bölüm başlıklarının altındaki kısa açıklama */
export const SECTION_SUB: Record<Exclude<ActiveTab, 'home'>, string> = {
  quotes: 'Tüm tekliflerinizi buradan görüntüleyin ve yönetin.',
  requests: 'Müşteri talepleri: girin, atayın, teklife dönüştürün.',
  customers: 'Müşteri ilişkilerinizi, cari hesaplarınızı ve ziyaretlerinizi tek yerden yönetin.',
  collections: '',
  expenses: '',
  materials: 'Malzeme envanterinizi, stok durumunuzu ve firma fiyat listelerinizi yönetin.',
  reports: 'Satış, tahsilat ve harcama raporları.',
  notes: 'Notlarınız ve son hareketler.',
  admin: 'Kullanıcılar ve yetkiler.',
};

/** Özet kutusu renkleri: belirgin açık zemin + dolu renkli simge; yazılar sade (lacivert/gri); sağ altta hafif dalga */
export type StatTone = 'green' | 'blue' | 'violet' | 'orange' | 'eBlue' | 'eTeal' | 'cBlue' | 'cTeal';
type ToneCls = { box: string; icon: string; wave: string; label?: string; value?: string; dot?: string };
const STAT_TONES: Record<StatTone, ToneCls> = {
  /* ENYAP kurumsal (yalnız Teklifler): beyaz → çok açık mavi yüzey, açık zeminli mavi/turkuaz simge */
  eBlue: { box: 'bg-gradient-to-br from-white to-[#F3F8FD] border-[#DCE8F5]', icon: 'bg-[#EAF4FC] text-[#0072CE] ring-1 ring-[#0072CE]/10', wave: 'text-[#0072CE]/25', label: 'text-[#17477D]', value: 'text-[#173B63]', dot: 'bg-[#0072CE]' },
  eTeal: { box: 'bg-gradient-to-br from-white to-[#F2FBF9] border-[#D5EFE9]', icon: 'bg-[#E8F8F4] text-[#00B89C] ring-1 ring-[#00B89C]/10', wave: 'text-[#00B89C]/25', label: 'text-[#17477D]', value: 'text-[#173B63]', dot: 'bg-[#00B89C]' },
  /* Müşteriler (ENYAP: lacivert #0B2343, mavi #006DBB, turkuaz #00B49A, kenar #E2EAF3) */
  cBlue: { box: 'bg-gradient-to-br from-white to-[#F1F6FC] border-[#E2EAF3]', icon: 'bg-[#EAF5FC] text-[#006DBB] ring-1 ring-[#006DBB]/10', wave: 'text-[#009FE3]/20', label: 'text-[#7186A3]', value: 'text-[#0B2343]', dot: 'bg-[#006DBB]' },
  cTeal: { box: 'bg-gradient-to-br from-white to-[#EFF9F7] border-[#E2EAF3]', icon: 'bg-[#E6F7F4] text-[#00B49A] ring-1 ring-[#00B49A]/10', wave: 'text-[#00B49A]/20', label: 'text-[#7186A3]', value: 'text-[#0B2343]', dot: 'bg-[#00B49A]' },
  green: { box: 'bg-[#EFF9F7] border-[#D5EFE9]', icon: 'bg-[#00A68C] text-white', wave: 'text-[#00B49A]/25' },
  blue: { box: 'bg-[#F1F6FC] border-[#DCE8F5]', icon: 'bg-[#0072CE] text-white', wave: 'text-[#0072CE]/25' },
  violet: { box: 'bg-[#F1F6FC] border-[#DCE8F5]', icon: 'bg-[#5DA9D6] text-white', wave: 'text-[#5DA9D6]/25' },
  orange: { box: 'bg-[#EFF9F7] border-[#D5EFE9]', icon: 'bg-[#008F7C] text-white', wave: 'text-[#00B49A]/25' },
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
      <span className={`flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold truncate ${t.label || 'text-slate-600'}`}>
        <span className={`sm:hidden w-2 h-2 rounded-full shrink-0 ${t.dot || t.icon}`} />{label}
      </span>
      <span className={`block mt-0.5 text-base sm:text-xl font-black tabular-nums break-words leading-tight ${t.value ? `sm:text-[22px] tracking-tight ${t.value}` : 'text-[#1a3d6d]'}`}>{value}</span>
      {trend != null ? (
        <span className="flex items-center gap-1 text-[11px] sm:text-xs truncate">
          <b className={`tabular-nums ${trend >= 0 ? 'text-[#00A68C]' : 'text-red-600'}`}>{trend >= 0 ? '↑' : '↓'} %{Math.abs(trend)}</b>
          <span className="text-slate-500 truncate">geçen aya göre</span>
        </span>
      ) : sub && <span className="block text-[11px] sm:text-xs text-slate-500 truncate">{sub}</span>}
    </span>
    {onClick && <ChevronRight className="relative hidden sm:block w-4 h-4 text-slate-400 shrink-0 self-start" />}
  </>);
  const cls = `${className} relative overflow-hidden flex items-center gap-3 rounded-2xl border ${t.box} px-3 py-3 sm:px-4 sm:py-3.5 min-w-0 text-left shadow-[0_10px_26px_-22px_rgba(15,60,120,0.6)]${t.value ? ' transition-shadow duration-200 hover:shadow-[0_14px_30px_-20px_rgba(15,60,120,0.55)]' : ''}`;
  return onClick
    ? <button type="button" onClick={onClick} title={typeof sub === 'string' ? sub : undefined} className={`${cls} transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]`}>{body}</button>
    : <div className={cls} title={typeof sub === 'string' && trend != null ? sub : undefined}>{body}</div>;
};
export const toneAt = (i: number) => TONE_ORDER[i % TONE_ORDER.length];

type Stat = { label: string; value: string; sub?: string; trend?: number | null };
const StatGrid: React.FC<{ stats: Stat[]; brand?: boolean; cust?: boolean }> = ({ stats, brand, cust }) => (
  <div className={`grid grid-cols-2 ${stats.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-2.5 sm:gap-3`}>
    {stats.map((s, i) => (
      <StatBox key={s.label} label={s.label} value={s.value} sub={s.sub} trend={s.trend} tone={cust ? (i % 2 ? 'cTeal' : 'cBlue') : brand ? (i % 2 ? 'eTeal' : 'eBlue') : toneAt(i)}
        className={stats.length % 2 && i === stats.length - 1 ? 'col-span-2 lg:col-span-1' : ''} />
    ))}
  </div>
);

/** Fotoğraflı başlık (Teklifler): sağda tesisat fotoğrafı, solda büyük başlık; telefonda küçük fotoğraf */
export type Hero = { lg?: string; sm?: string; /** fotoğraf yerine çizim (Malzemeler) */ art?: React.ReactNode; /** Müşteriler: açık mavi zemin, #006DBB düğme, ~155px */ cust?: boolean; /** Malzemeler: tam genişlikte koyu mavi fotoğraf */ materials?: boolean; /** Teklifler: fotoğrafı tablet ve telefonda daha görünür konumlandır */ quotes?: boolean; /** Talepler: fotoğraf tablet/masaüstünde bandın ortasında, iki yanı zemine karışır */ center?: boolean };
export const HERO_IMG: Partial<Record<ActiveTab, Hero>> = {
  quotes: { lg: '/hero-teklifler-2.webp', sm: '/hero-teklifler-2-sm.webp', quotes: true },
  requests: { lg: '/hero-talepler-2.webp', sm: '/hero-talepler-2-sm.webp', center: true },
  expenses: { lg: '/hero-harcama.webp', sm: '/hero-harcama-sm.webp', center: true },
  collections: { lg: '/hero-tahsilat.webp', sm: '/hero-tahsilat-sm.webp', center: true },
  reports: { lg: '/hero-rapor.webp', sm: '/hero-rapor-sm.webp' },
  admin: { lg: '/hero-yonetim.webp', sm: '/hero-yonetim-sm.webp', center: true },
  customers: { lg: '/hero-musteri.webp', sm: '/hero-musteri-sm.webp', cust: true },
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
  /** İkinci düğme (çerçeveli; telefonda yalnız simge) */
  secondary?: { label: string; icon: React.ElementType; onClick: () => void };
  /** Rakamlar yerine özel içerik (Malzemeler: sunucudan sayılan kutular) */
  below?: React.ReactNode;
  /** Sağ üstteki düğmeler (ara, eşitle, bildirim, kılavuz, çıkış) */
  tools?: React.ReactNode;
  hero?: Hero;
}> = ({ title, subtitle, icon: Icon, onBack, action, secondary, below, stats, tools, hero }) => (
  <div className="mb-4 sm:mb-5 space-y-3 sm:space-y-4">
    {hero ? (
      /* ENYAP Teklifler bandı: ~130px, solda simge + başlık, sağda fotoğraf (solu açık zemine karışır) */
      <section className={`relative overflow-hidden rounded-2xl border shadow-[0_12px_30px_-24px_rgba(18,59,104,0.55)] ${hero.materials ? 'border-[#DCE8F5] bg-white' : hero.cust ? 'border-[#E2EAF3] bg-gradient-to-r from-[#F7FBFE] via-[#EAF5FC] to-[#EAF5FC]' : 'border-[#DCE8F5] bg-gradient-to-r from-white via-[#F6FAFE] to-[#EAF4FC]'}`}>
        {hero.art
          ? <div aria-hidden className="pointer-events-none select-none absolute inset-y-0 right-0 w-[64%] sm:w-[58%] lg:w-[54%] [&>svg]:w-full [&>svg]:h-full">{hero.art}</div>
          : <picture aria-hidden>
            <source media="(min-width: 768px)" srcSet={hero.lg} />
            <img src={hero.sm} alt="" draggable={false} className={`pointer-events-none select-none absolute inset-y-0 right-0 h-full object-cover object-center ${hero.materials ? 'w-[76%] sm:w-[68%] lg:w-[62%] object-[70%_center] sm:object-center [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.15)_18%,black_52%)]' : hero.cust ? "w-[72%] sm:w-[65%] lg:w-[60%] [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.15)_18%,black_55%)]" : hero.quotes ? "w-[83%] sm:w-[76%] md:w-[72%] lg:w-[66%] object-[62%_center] md:object-[58%_center]" : hero.center ? "w-[58%] sm:w-[52%] md:right-auto md:left-1/2 md:-translate-x-1/2 md:w-[46%] lg:w-[42%] object-[60%_center] md:[mask-image:linear-gradient(to_right,transparent_0%,black_22%,black_78%,transparent_100%)]" : "w-[58%] sm:w-[52%] lg:w-[46%]"}`} />
          </picture>}
        {hero.materials
          ? <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white from-[34%] via-white/70 via-[49%] to-transparent to-[75%] sm:from-[38%] sm:via-[54%] lg:from-[42%] lg:via-[57%]" />
          : hero.quotes
          ? <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white from-[26%] via-white/75 via-[42%] to-transparent to-[69%] sm:from-[32%] sm:via-[47%] sm:to-[70%] md:from-[35%] md:via-[49%] md:to-[72%] lg:from-[41%] lg:via-[53%] lg:to-[75%]" />
          : hero.cust
          ? <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#EAF5FC]/75 from-[30%] via-[#EAF5FC]/20 via-[53%] to-transparent to-[76%]" />
          : <div aria-hidden className={`pointer-events-none absolute inset-0 ${hero.center ? 'md:hidden ' : ''}bg-gradient-to-r from-white from-[42%] via-white/40 via-[58%] to-transparent to-[78%] sm:from-[48%] sm:via-[62%] lg:from-[54%] lg:via-[66%] lg:to-[82%]`} />}
        <div aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${hero.cust ? 'from-[#006DBB] via-[#009FE3] to-[#00B49A]' : 'from-[#0072CE] via-[#0072CE] to-[#00B89C]'}`} />
        <div className={`relative flex items-center gap-3 sm:gap-4 px-4 sm:px-6 lg:px-7 py-4 ${hero.cust ? 'min-h-[108px] sm:min-h-[145px] lg:min-h-[155px]' : 'min-h-[104px] sm:min-h-[124px] lg:min-h-[132px]'}`}>
          <button onClick={onBack} aria-label="Geri"
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-[#DCE8F5] text-[#17477D] shrink-0">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <span className={`hidden sm:flex w-14 h-14 rounded-2xl bg-gradient-to-br ${hero.cust ? 'from-[#006DBB] to-[#173F73]' : 'from-[#0072CE] to-[#17477D]'} text-white items-center justify-center shrink-0 shadow-[0_12px_24px_-12px_rgba(0,114,206,0.9)]`}>
            <Icon className="w-7 h-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className={`font-black text-2xl sm:text-[30px] tracking-tight leading-tight ${hero.materials ? 'text-[#0B2343]' : hero.cust ? 'text-[#0B2343]' : 'text-[#123B68]'}`}>{title}</h1>
            {subtitle && <p className={`mt-0.5 text-xs sm:text-[15px] line-clamp-2 max-w-[62%] ${hero.materials ? 'text-[#17477D]/80 max-w-[80%] sm:max-w-[65%] lg:max-w-[62%]' : hero.cust ? 'text-[#7186A3] sm:max-w-[52%] lg:max-w-[46%]' : 'text-[#17477D]/80 sm:max-w-none'}`}>{subtitle}<span className="hidden md:inline ml-2 text-[11px] text-slate-400 tabular-nums" title={`Sürüm ${__APP_VERSION__}`}>v{__APP_VERSION__}</span></p>}
          </div>
          {tools}
          {secondary && (
            <button onClick={secondary.onClick} title={secondary.label}
              className="flex items-center gap-2 h-11 sm:h-12 px-3 sm:px-4 rounded-xl bg-white/95 hover:bg-white border border-[#C9DDF1] text-[#173F73] text-sm sm:text-[15px] font-bold shadow-[0_10px_24px_-16px_rgba(18,59,104,0.7)] backdrop-blur-sm transition-colors shrink-0">
              <secondary.icon className="w-5 h-5 text-[#00A08A]" /> <span className="hidden xl:inline">{secondary.label}</span>
            </button>
          )}
          {action && (
            <button onClick={action.onClick}
              className={`group flex items-center gap-2 h-11 sm:h-12 px-3.5 sm:pl-5 sm:pr-4 rounded-xl ${hero.cust ? 'self-start bg-[#006DBB] hover:bg-[#173F73]' : 'bg-[#0072CE] hover:bg-[#17477D]'} text-white text-sm sm:text-[15px] font-bold shadow-[0_12px_26px_-12px_rgba(0,114,206,0.95)] transition-colors duration-200 shrink-0`}>
              <action.icon className="w-5 h-5" /> <span className="hidden sm:inline">{action.label}</span><ChevronRight className="hidden sm:block w-4 h-4 opacity-80 transition-transform duration-200 group-hover:translate-x-0.5" />
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
    {below}
    {!below && stats && stats.length > 0 && <StatGrid stats={stats} brand={!!hero} cust={!!hero?.cust} />}
  </div>
);
