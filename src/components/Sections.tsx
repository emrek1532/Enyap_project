import React from 'react';
import { FileText, Inbox, Users, Wallet, Receipt, BarChart3, StickyNote, Package, ChevronRight, ShieldCheck, Hourglass, AlarmClock, CheckCircle2, Coins } from 'lucide-react';

/** Uygulamanın bölümleri */
export type ActiveTab = 'home' | 'quotes' | 'requests' | 'customers' | 'notes' | 'collections' | 'expenses' | 'reports' | 'materials' | 'admin';

export const SECTION_META: Record<Exclude<ActiveTab, 'home'>, { title: string; icon: React.ElementType; tone: string }> = {
  quotes: { title: 'Teklifler', icon: FileText, tone: 'bg-brand-50 text-brand-600' },
  requests: { title: 'Talepler', icon: Inbox, tone: 'bg-[#EAF5FC] text-[#006DBB]' },
  customers: { title: 'Müşteriler', icon: Users, tone: 'bg-sky-50 text-sky-600' },
  collections: { title: 'Tahsilatlar', icon: Wallet, tone: 'bg-[#E6F7F4] text-[#008F79]' },
  expenses: { title: 'Harcamalar', icon: Receipt, tone: 'bg-[#EAF5FC] text-[#006DBB]' },
  materials: { title: 'Malzemeler', icon: Package, tone: 'bg-violet-50 text-violet-600' },
  reports: { title: 'Rapor', icon: BarChart3, tone: 'bg-[#EAF5FC] text-[#006DBB]' },
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
  eBlue: { box: 'bg-gradient-to-br from-white to-[#F1F6FC] border-[#E2EAF3]', icon: 'bg-[#EAF5FC] text-[#006DBB] ring-1 ring-[#006DBB]/10', wave: 'text-[#006DBB]/25', label: 'text-[#173F73]', value: 'text-[#17365D]', dot: 'bg-[#006DBB]' },
  eTeal: { box: 'bg-gradient-to-br from-white to-[#F2FBF9] border-[#D5EFE9]', icon: 'bg-[#E6F7F4] text-[#00B49A] ring-1 ring-[#00B49A]/10', wave: 'text-[#00B49A]/25', label: 'text-[#173F73]', value: 'text-[#17365D]', dot: 'bg-[#00B49A]' },
  /* Müşteriler (ENYAP: lacivert #0B2343, mavi #006DBB, turkuaz #00B49A, kenar #E2EAF3) */
  cBlue: { box: 'bg-gradient-to-br from-white to-[#F1F6FC] border-[#E2EAF3]', icon: 'bg-[#EAF5FC] text-[#006DBB] ring-1 ring-[#006DBB]/10', wave: 'text-[#009FE3]/20', label: 'text-[#5E7491]', value: 'text-[#0B2343]', dot: 'bg-[#006DBB]' },
  cTeal: { box: 'bg-gradient-to-br from-white to-[#EFF9F7] border-[#E2EAF3]', icon: 'bg-[#E6F7F4] text-[#00B49A] ring-1 ring-[#00B49A]/10', wave: 'text-[#00B49A]/20', label: 'text-[#5E7491]', value: 'text-[#0B2343]', dot: 'bg-[#00B49A]' },
  green: { box: 'bg-[#EFF9F7] border-[#D5EFE9]', icon: 'bg-[#00B49A] text-white', wave: 'text-[#00B49A]/25' },
  blue: { box: 'bg-[#F1F6FC] border-[#E2EAF3]', icon: 'bg-[#006DBB] text-white', wave: 'text-[#006DBB]/25' },
  violet: { box: 'bg-[#F1F6FC] border-[#E2EAF3]', icon: 'bg-[#5DA9D6] text-white', wave: 'text-[#5DA9D6]/25' },
  orange: { box: 'bg-[#EFF9F7] border-[#D5EFE9]', icon: 'bg-[#008F79] text-white', wave: 'text-[#00B49A]/25' },
};
/* Tüm sayfalarda aynı kutu görünümü: mavi / turkuaz sırayla */
const TONE_ORDER: StatTone[] = ['cBlue', 'cTeal'];
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
    <span className={`relative hidden sm:flex md:hidden xl:flex w-11 h-11 rounded-xl items-center justify-center shrink-0 shadow-sm ${t.icon}`}><SI className="w-5 h-5" /></span>
    <span className="relative min-w-0 flex-1">
      <span className={`flex items-center gap-1.5 text-[11px] sm:text-[13px] md:text-[11.5px] xl:text-[13px] font-bold leading-snug md:whitespace-normal md:line-clamp-2 xl:truncate ${t.label || 'text-slate-600'}`}>
        <span className={`sm:hidden w-2 h-2 rounded-full shrink-0 ${t.dot || t.icon}`} />{label}
      </span>
      <span className={`block mt-0.5 text-base sm:text-xl md:text-[14px] lg:text-lg xl:text-xl font-black tabular-nums whitespace-nowrap truncate leading-tight ${t.value ? `sm:text-[22px] md:text-[14px] lg:text-lg xl:text-[22px] tracking-tight ${t.value}` : 'text-[#173F73]'}`}>{value}</span>
      {trend != null ? (
        <span className="flex items-center gap-1 text-[11px] sm:text-xs md:text-[10.5px] xl:text-xs truncate">
          <b className={`tabular-nums ${trend >= 0 ? 'text-[#00B49A]' : 'text-red-600'}`}>{trend >= 0 ? '↑' : '↓'} %{Math.abs(trend)}</b>
          <span className="text-slate-500 truncate">geçen aya<span className="md:hidden xl:inline"> göre</span></span>
        </span>
      ) : sub && <span className="block text-[11px] sm:text-xs md:text-[10.5px] xl:text-xs text-slate-500 truncate">{sub}</span>}
    </span>
    {onClick && <ChevronRight className="relative hidden sm:block w-4 h-4 text-slate-400 shrink-0 self-start" />}
  </>);
  const cls = `${className} relative overflow-hidden flex items-center gap-3 md:gap-2 xl:gap-3 rounded-2xl border ${t.box} px-3 py-3 sm:px-4 sm:py-3.5 md:px-2.5 md:py-3 lg:px-3 xl:px-4 xl:py-3.5 min-w-0 text-left shadow-[0_10px_26px_-22px_rgba(15,60,120,0.6)]${t.value ? ' transition-shadow duration-200 hover:shadow-[0_14px_30px_-20px_rgba(15,60,120,0.55)]' : ''}`;
  return onClick
    ? <button type="button" onClick={onClick} title={typeof sub === 'string' ? sub : undefined} className={`${cls} transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]`}>{body}</button>
    : <div className={cls} title={typeof sub === 'string' && trend != null ? sub : undefined}>{body}</div>;
};
export const toneAt = (i: number) => TONE_ORDER[i % TONE_ORDER.length];

type Stat = { label: string; value: string; sub?: string; trend?: number | null };
const StatGrid: React.FC<{ stats: Stat[] }> = ({ stats }) => (
  <div className={`grid grid-cols-2 ${stats.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-2.5 sm:gap-3`}>
    {stats.map((s, i) => (
      <StatBox key={s.label} label={s.label} value={s.value} sub={s.sub} trend={s.trend} tone={toneAt(i)}
        className={stats.length % 2 && i === stats.length - 1 ? 'col-span-2 md:col-span-1' : ''} />
    ))}
  </div>
);

/** Fotoğraflı başlık (Teklifler): sağda tesisat fotoğrafı, solda büyük başlık; telefonda küçük fotoğraf */
export type Hero = { lg?: string; sm?: string; /** fotoğraf yerine çizim (Malzemeler) */ art?: React.ReactNode; /** Müşteriler: açık mavi zemin, #006DBB düğme, ~155px */ cust?: boolean; /** Malzemeler: tam genişlikte koyu mavi fotoğraf */ materials?: boolean; /** Teklifler: fotoğrafı tablet ve telefonda daha görünür konumlandır */ quotes?: boolean; /** Talepler, Tahsilat, Harcama, Yönetim: fotoğraf sağda, solu maskeyle zemine karışır */ center?: boolean };
/** Bant fotoğrafının ortak ölçüsü (sekme değişince geçiş yeri kaymaz) */
export const HERO_PHOTO = 'pointer-events-none select-none absolute inset-y-0 right-0 h-full w-[72%] sm:w-[64%] md:w-[58%] [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.35)_14%,black_28%)]';
export const HERO_IMG: Partial<Record<ActiveTab, Hero>> = {
  quotes: { lg: '/hero-teklifler-2.webp', sm: '/hero-teklifler-2-sm.webp', quotes: true },
  requests: { lg: '/hero-talepler-2.webp', sm: '/hero-talepler-2-sm.webp', center: true },
  expenses: { lg: '/hero-harcama.webp', sm: '/hero-harcama-sm.webp', center: true },
  collections: { lg: '/hero-tahsilat.webp', sm: '/hero-tahsilat-sm.webp', center: true },
  reports: { lg: '/hero-rapor.webp', sm: '/hero-rapor-sm.webp' },
  admin: { lg: '/hero-yonetim.webp', sm: '/hero-yonetim-sm.webp', center: true },
  notes: { lg: '/hero-notlar.webp', sm: '/hero-notlar-sm.webp' },
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
      <>
      {/* ENYAP Teklifler bandı: ~130px, solda simge + başlık, sağda fotoğraf (solu açık zemine karışır) */}
      <section className={`relative overflow-hidden rounded-2xl border shadow-[0_12px_30px_-24px_rgba(18,59,104,0.55)] border-[#E2EAF3] bg-gradient-to-r from-white via-[#F6FAFE] to-[#EAF5FC]`}>
        {/* Tüm bantlarda aynı ölçü: fotoğraf sağda sabit genişlikte, sol %28'i şeffaftan nete geçer (ana sayfa bandıyla aynı) */}
        {hero.art
          ? <div aria-hidden className={`${HERO_PHOTO} [&>svg]:w-full [&>svg]:h-full`}>{hero.art}</div>
          : <picture aria-hidden>
            <source media="(min-width: 768px)" srcSet={hero.lg} />
            <img src={hero.sm} alt="" draggable={false} className={`${HERO_PHOTO} object-cover ${hero.materials ? 'object-[70%_center] sm:object-center' : hero.quotes ? 'object-[62%_center] md:object-[58%_center]' : 'object-center'}`} />
          </picture>}
        <div aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-[#006DBB] via-[#009FE3] to-[#00B49A]`} />
        <div className={`relative flex items-center gap-3 sm:gap-4 px-4 sm:px-6 lg:px-7 py-4 min-h-[112px] sm:min-h-[136px] lg:min-h-[148px]`}>
          <button onClick={onBack} aria-label="Geri"
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-[#E2EAF3] text-[#173F73] shrink-0">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <span className={`hidden sm:flex w-14 h-14 rounded-2xl bg-gradient-to-br from-[#006DBB] to-[#173F73] text-white items-center justify-center shrink-0 shadow-[0_12px_24px_-12px_rgba(0,114,206,0.9)]`}>
            <Icon className="w-7 h-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className={`font-black text-2xl sm:text-[30px] tracking-tight leading-tight text-[#0B2343]`}>{title}</h1>
            {subtitle && <p className={`hidden lg:block mt-0.5 text-[15px] line-clamp-2 text-[#5E7491] max-w-[50%]`}>{subtitle}<span className="hidden md:inline ml-2 text-[11px] text-slate-400 tabular-nums" title={`Sürüm ${__APP_VERSION__}`}>v{__APP_VERSION__}</span></p>}
          </div>
          {tools}
          {secondary && (
            <button onClick={secondary.onClick} title={secondary.label}
              className="flex items-center gap-2 h-11 sm:h-12 px-3 sm:px-4 rounded-xl bg-white/95 hover:bg-white border border-[#C9DDF1] text-[#173F73] text-sm sm:text-[15px] font-bold shadow-[0_10px_24px_-16px_rgba(18,59,104,0.7)] backdrop-blur-sm transition-colors shrink-0">
              <secondary.icon className="w-5 h-5 text-[#008F79]" /> <span className="hidden xl:inline">{secondary.label}</span>
            </button>
          )}
        </div>
      </section>
      {action && (
        /* "Yeni …" düğmesi bandın üstünde değil, altında sağda (telefonda tam genişlik): fotoğrafın önünü kapatmaz */
        <div className="flex justify-end">
          <button onClick={action.onClick}
            className={`group w-full sm:w-auto flex items-center justify-center gap-2 h-11 px-4 sm:pl-5 sm:pr-4 rounded-xl bg-[#006DBB] hover:bg-[#173F73] text-white text-sm sm:text-[15px] font-bold shadow-[0_12px_26px_-14px_rgba(0,114,206,0.95)] transition-colors duration-200`}>
            <action.icon className="w-5 h-5" /> {action.label}<ChevronRight className="hidden sm:block w-4 h-4 opacity-80 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        </div>
      )}
      </>
    ) : (
    <section className="relative overflow-hidden rounded-2xl border border-[#E2EAF3] bg-gradient-to-r from-white via-[#F6FAFE] to-[#EAF5FC] px-4 py-4 sm:px-6 sm:py-5 shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)]">
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
          <h1 className="font-black text-2xl sm:text-[30px] tracking-tight leading-tight truncate text-[#0B2343]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs sm:text-[15px] text-[#5E7491] truncate">{subtitle}<span className="hidden md:inline ml-2 text-[11px] text-slate-400 tabular-nums" title={`Sürüm ${__APP_VERSION__}`}>v{__APP_VERSION__}</span></p>}
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
    {!below && stats && stats.length > 0 && <StatGrid stats={stats} />}
  </div>
);
