import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, XCircle, PauseCircle } from 'lucide-react';

/** Liste sayfalarının ortak görünümü (Teklifler, Müşteriler, Malzemeler, Tahsilat) */
/** Geniş ekran mı (xl, 1280px+): listeler ya tablo ya kart olarak çizilir, ikisi birden değil (daha hızlı) */
/** from="md": tablette (768px+) de tablo çizilir (sütunları dar tablo: Teklifler, Müşteriler) */
type Bp = 'md' | 'lg' | 'xl';
const MQ: Record<Bp, string> = { md: '(min-width: 768px)', lg: '(min-width: 1024px)', xl: '(min-width: 1280px)' };
export const useWide = (from: Bp = 'xl') => {
  const q = MQ[from];
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    setWide(m.matches);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return wide;
};
/** Yalnız geniş ekranda (tablo) / yalnız dar ekranda (kartlar) çizilir */
export const WideOnly: React.FC<{ children: React.ReactNode; from?: Bp }> = ({ children, from }) => (useWide(from) ? <>{children}</> : null);
export const NarrowOnly: React.FC<{ children: React.ReactNode; from?: Bp }> = ({ children, from }) => (useWide(from) ? null : <>{children}</>);

export const listCard = 'bg-white rounded-3xl border border-white shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)]';
export const ctrl = 'h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400';
export const thCls = 'py-3 px-3 text-[12px] font-bold text-slate-500';
/** Tablo başlık satırı: açık mavi zemin (örnek tasarım) */
export const theadCls = 'bg-[#f2f6fc] border-b border-slate-100 [&_th]:text-[#173F73]';
export const rowCls = 'hover:bg-brand-50/40 transition-colors';

/** Hızlı seçim yuvarlak düğmeleri (Bugün, Bu Hafta, Geçen Hafta …) */
export function ChipRow<K extends string>({ items, value, onChange }: {
  items: { key: K; label: React.ReactNode }[]; value: K | null; onChange: (k: K) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
      {items.map(it => {
        const on = it.key === value;
        return (
          <button key={it.key} type="button" onClick={() => onChange(it.key)} aria-pressed={on}
            className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-bold border whitespace-nowrap transition-colors ${on ? 'bg-[#006DBB] border-[#006DBB] text-white shadow-sm' : 'bg-white border-[#E2EAF3] text-[#173F73] hover:border-[#006DBB]/50 hover:bg-[#EAF5FC]'}`}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Arama kutusu (simgeli) */
export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; className?: string; mono?: boolean }> = ({ value, onChange, placeholder, className = '', mono }) => (
  <div className={`relative min-w-0 ${className}`}>
    <svg className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
    <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`${ctrl} w-full pl-9 ${mono ? 'uppercase placeholder:normal-case' : ''}`} />
  </div>
);

/** Altı çizili sekmeler (Müşteri Listesi | Cari Bakiyeler …, Bugün | Bu Hafta …) */
export function UnderlineTabs<K extends string>({ items, value, onChange, small, enyap }: {
  items: { key: K; label: React.ReactNode }[]; value: K | null; onChange: (k: K) => void; small?: boolean;
  /** ENYAP renkleri (Müşteriler): etkin #006DBB, diğerleri lacivert-gri */
  enyap?: boolean;
}) {
  return (
    <div className={`flex overflow-x-auto no-scrollbar border-b ${enyap ? 'gap-2 sm:gap-4 border-[#E2EAF3]' : 'gap-1 border-slate-200/80'}`}>
      {items.map(it => {
        const on = it.key === value;
        return (
          <button key={it.key} type="button" onClick={() => onChange(it.key)}
            className={`relative whitespace-nowrap ${small ? 'px-3 py-2 text-[13px]' : 'px-4 py-2.5 text-sm'} font-bold transition-colors ${enyap ? (on ? 'text-[#006DBB]' : 'text-[#173F73]/70 hover:text-[#0B2343]') : on ? 'text-brand-600' : 'text-slate-600 hover:text-slate-900'}`}>
            {it.label}
            {on && <span className={`absolute left-2 right-2 -bottom-px h-0.5 rounded-full ${enyap ? 'bg-[#006DBB]' : 'bg-brand-500'}`} />}
          </button>
        );
      })}
    </div>
  );
}

/** Durum rozeti (ENYAP renkleri): Onaylandı turkuaz / Beklemede mavi / İptal gri / Pasif lacivert-gri */
export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const m = status === 'onaylandi'
    ? { l: 'Onaylandı', c: 'bg-[#E6F7F4] text-[#008F79] border-[#00B49A]/30', I: CheckCircle2, ic: 'text-white fill-[#00B49A]' }
    : status === 'iptal'
      ? { l: 'İptal', c: 'bg-slate-100 text-slate-700 border-slate-200', I: XCircle, ic: 'text-slate-500' }
      : status === 'pasif'
        ? { l: 'Pasif', c: 'bg-[#EEF2F7] text-[#173F73] border-[#173F73]/15', I: PauseCircle, ic: 'text-[#173F73]/70' }
        : { l: 'Beklemede', c: 'bg-[#EAF5FC] text-[#006DBB] border-[#006DBB]/25', I: Clock, ic: 'text-[#006DBB]' };
  return <span className={`inline-flex items-center gap-1 text-[11px] sm:text-xs pl-1.5 pr-2.5 py-0.5 sm:py-1 rounded-full font-bold border whitespace-nowrap ${m.c}`}><m.I aria-hidden className={`w-3.5 h-3.5 shrink-0 ${m.ic}`} />{m.l}</span>;
};

/** Satır simge düğmesi */
export const IconBtn: React.FC<{ title: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode; danger?: boolean }> = ({ title, onClick, children, danger }) => (
  <button type="button" title={title} aria-label={title} onClick={e => { e.stopPropagation(); onClick(e); }}
    className={`w-9 h-8 inline-flex items-center justify-center rounded-lg transition-colors ${danger ? 'bg-slate-50 text-slate-500 border border-slate-200 hover:text-rose-600 hover:bg-rose-50' : 'bg-brand-50 text-brand-600 border border-brand-100 hover:bg-brand-100'}`}>
    {children}
  </button>
);

/** Sayfa numaraları: ‹ 1 2 3 … Son › */
export const Pager: React.FC<{ page: number; total: number; size: number; onPage: (p: number) => void; label?: React.ReactNode }> = ({ page, total, size, onPage, label }) => {
  const pages = Math.max(1, Math.ceil(total / size));
  const nums: (number | '…')[] = [];
  const from = Math.max(0, Math.min(page - 1, pages - 3));
  for (let i = from; i < Math.min(pages, from + 3); i++) nums.push(i);
  if (from + 3 < pages) nums.push('…');
  const btn = 'min-w-8 h-8 px-2 inline-flex items-center justify-center rounded-lg text-xs font-bold border';
  return (
    <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 border-t border-slate-100">
      <span className="text-[13px] font-bold text-slate-700">{label}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} className={`${btn} border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30`} aria-label="Önceki"><ChevronLeft className="w-4 h-4" /></button>
          {nums.map((n, i) => n === '…'
            ? <span key={`d${i}`} className="text-xs text-slate-500 px-1">…</span>
            : <button key={n} type="button" onClick={() => onPage(n)} className={`${btn} ${n === page ? 'bg-brand-600 border-brand-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{n + 1}</button>)}
          <button type="button" disabled={page >= pages - 1} onClick={() => onPage(pages - 1)} className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 gap-0.5`}>Son <ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
};

/**
 * Arama + filtreler: telefonda yalnız arama kutusu ve "Filtreler" düğmesi görünür, filtreler dokununca açılır
 * (sayfa sade kalır); tablet/bilgisayarda filtreler hep açıktır.
 */
export const FilterBar: React.FC<{ search: React.ReactNode; active?: number; children: React.ReactNode; className?: string }> = ({ search, active = 0, children, className = 'flex flex-col xl:flex-row gap-2' }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <div className="flex gap-2 flex-1 min-w-0 xl:min-w-[240px]">
        {search}
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className={`sm:hidden shrink-0 h-10 px-3 rounded-xl border text-sm font-bold inline-flex items-center gap-1.5 ${open || active ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700'}`}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
          Filtre{active ? ` (${active})` : ''}
        </button>
      </div>
      <div className={open ? 'contents' : 'hidden sm:contents'}>{children}</div>
    </div>
  );
};

/** "Son değişiklik: Sıla Nur Alçı · 11.11.2026 14:05" (kimin değiştirdiğini veritabanı yazar) */
export const LastEdit: React.FC<{ by?: string | null; at?: string | null; className?: string }> = ({ by, at, className = '' }) => {
  if (!by && !at) return null;
  const when = at ? new Date(at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className={`text-[11px] text-slate-500 ${className}`}>
      Son değişiklik: {by && <b className="font-semibold text-slate-600">{by}</b>}{by && when ? ' · ' : ''}{when}
    </div>
  );
};
