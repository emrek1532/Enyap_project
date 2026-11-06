import React from 'react';
import { ChevronRight, Clock, X } from 'lucide-react';

/** Ana sayfa araç sekmelerinin (Ara, Sor, Teklif hazırla, Sesle kayıt) ortak kartı: renkli başlık + beyaz gövde */
const TONES = {
  brand: { box: 'border-sky-100 from-sky-50', icon: 'bg-brand-600', line: 'border-sky-100' },
  emerald: { box: 'border-emerald-100 from-emerald-50', icon: 'bg-emerald-600', line: 'border-emerald-100' },
  rose: { box: 'border-rose-100 from-rose-50', icon: 'bg-rose-600', line: 'border-rose-100' },
} as const;

export const ToolCard: React.FC<{
  icon: React.ElementType;
  title: string;
  subtitle: string;
  tone?: keyof typeof TONES;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, tone = 'brand', action, children }) => {
  const t = TONES[tone];
  return (
    <section className={`rounded-2xl border bg-gradient-to-b to-white shadow-xs overflow-hidden ${t.box}`}>
      <div className="flex items-center gap-3 px-3.5 pt-3.5 pb-3">
        <div className={`w-11 h-11 rounded-xl text-white flex items-center justify-center shrink-0 ${t.icon}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-slate-900">{title}</h2>
          <p className="text-xs text-slate-600">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className={`bg-white rounded-t-2xl border-t p-3.5 space-y-3 ${t.line}`}>{children}</div>
    </section>
  );
};

/** Yuvarlak kısayol düğmesi */
export const Chip: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }> = ({ active, className = '', ...p }) => (
  <button type="button" {...p}
    className={`px-3 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 ${active ? 'bg-brand-50 border-brand-200 text-brand-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'} ${className}`} />
);

// ---- Son kullanılanlar: yalnız bu cihazda (localStorage), sunucuya gitmez ----
export type Past = { q: string; at: number; tag?: string };
export const readPast = (key: string): Past[] => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
export const writePast = (key: string, h: Past[]) => { try { localStorage.setItem(key, JSON.stringify(h)); } catch { /* */ } };
export const pushPast = (key: string, q: string, tag?: string, max = 8): Past[] => {
  const h = [{ q, at: Date.now(), tag }, ...readPast(key).filter(x => x.q !== q)].slice(0, max);
  writePast(key, h);
  return h;
};
export const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'az önce' : m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.round(m / 60)} saat önce` : `${Math.round(m / 1440)} gün önce`;
};

/** "Son …" listesi: dokununca yeniden çalışır, ✕ ile tek tek, "Temizle" ile hepsi silinir */
export const PastList: React.FC<{
  title: string;
  items: Past[];
  icon: React.ElementType;
  disabled?: boolean;
  tagClass?: (tag: string) => string;
  onPick: (q: string) => void;
  onChange: (h: Past[]) => void;
  storageKey: string;
}> = ({ title, items, icon: Icon, disabled, tagClass, onPick, onChange, storageKey }) => {
  if (!items.length) return null;
  const set = (h: Past[]) => { writePast(storageKey, h); onChange(h); };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5"><Clock className="w-4 h-4 text-brand-600" /> {title}</h3>
        <button type="button" onClick={() => set([])} className="text-[11px] font-bold text-slate-500 hover:text-slate-700">Temizle</button>
      </div>
      <ul className="space-y-1.5">
        {items.slice(0, 5).map(h => (
          <li key={h.q} className="flex items-center gap-1 rounded-xl border border-slate-100 bg-white shadow-xs">
            <button type="button" onClick={() => onPick(h.q)} disabled={disabled} className="flex-1 min-w-0 text-left px-3 py-2 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-slate-900 truncate">{h.q}</span>
                <span className="block text-[11px] text-slate-500">{ago(h.at)}</span>
              </span>
              {h.tag && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${tagClass?.(h.tag) || 'bg-slate-100 text-slate-600'}`}>{h.tag}</span>}
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </button>
            <button type="button" onClick={() => set(items.filter(x => x.q !== h.q))} className="p-2 text-slate-300 hover:text-slate-600" aria-label="Kaldır"><X className="w-3.5 h-3.5" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Son 6 ayda en çok teklif verilen firmalar ve en sık geçen ürünler (cihazdaki veriden) */
export function topRecent(quotes: { createdAt: string; customerName: string; items?: { productName: string }[] }[], n = 3) {
  const since = new Date(Date.now() - 182 * 864e5).toISOString();
  const recent = quotes.filter(x => (x.createdAt || '') >= since);
  const count = (keys: string[]) => {
    const m = new Map<string, number>();
    keys.forEach(k => k && m.set(k, (m.get(k) || 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  return {
    firms: count(recent.map(x => x.customerName.trim())).slice(0, n),
    products: count(recent.flatMap(x => (x.items || []).map(it => it.productName.trim()))).slice(0, n),
  };
}
export const shortName = (s: string) => s.split(/\s+/).slice(0, 3).join(' ');
