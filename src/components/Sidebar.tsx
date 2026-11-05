import React, { useState } from 'react';
import { ArrowRight, BarChart3, Home, LogOut, X } from 'lucide-react';

export type SideSection = { id: string; title: string; icon: React.ElementType };

/** Kullanıcı adının baş harfleri (avatar) */
export const initials = (name: string) =>
  name.trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toLocaleUpperCase('tr-TR')).join('') || '?';

/**
 * Bilgisayarda (md ve üstü) soldaki koyu menü: logo, bölümler, altta kullanıcı kartı.
 * Telefonda gizlidir; orada alttaki menü kullanılır.
 */
export const Sidebar: React.FC<{
  sections: SideSection[];
  active: string;
  onOpen: (id: string) => void;
  onHome: () => void;
  onSignOut: () => void;
  userName: string;
  userEmail: string;
  roleLabel: string;
  /** "Raporları Gör" kartı (rapor yetkisi varsa); kapatılınca bu cihazda gizlenir */
  onReports?: () => void;
}> = ({ sections, active, onOpen, onHome, onSignOut, userName, userEmail, roleLabel, onReports }) => {
  const [promo, setPromo] = useState(() => { try { return localStorage.getItem('sidebar-promo') !== 'off'; } catch { return true; } });
  const hidePromo = () => { setPromo(false); try { localStorage.setItem('sidebar-promo', 'off'); } catch { /* */ } };
  const item = (id: string, title: string, Icon: React.ElementType, onClick: () => void) => {
    const on = active === id;
    return (
      <button key={id} onClick={onClick} aria-current={on ? 'page' : undefined}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${on
          ? 'bg-gradient-to-r from-brand-500 to-sky-500 text-white shadow-[0_8px_20px_-8px_rgba(14,140,240,0.8)]'
          : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
        <Icon className="w-5 h-5 shrink-0" /> <span className="truncate">{title}</span>
      </button>
    );
  };
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col bg-gradient-to-b from-[#0b2a4c] via-[#0a2442] to-[#071a31] text-white pt-safe">
      <button onClick={onHome} className="flex flex-col items-start gap-2 px-5 pt-6 pb-5 text-left" title="Ana Sayfa">
        <span className="px-3 py-2 rounded-xl bg-white shadow-sm"><img src="/logo-splash.png" alt="ENYAP" draggable={false} className="h-6 w-auto select-none" /></span>
        <span className="pl-1 text-[11px] font-medium text-slate-300 tracking-wide">Isı Sistemleri · Teklif & Satış</span>
      </button>
      <nav className="flex-1 overflow-y-auto px-3 space-y-1">
        {item('home', 'Ana Sayfa', Home, onHome)}
        {sections.map(s => item(s.id, s.title, s.icon, () => onOpen(s.id)))}
      </nav>
      {onReports && promo && (
        <div className="relative mx-3 mt-3 p-4 rounded-2xl overflow-hidden bg-gradient-to-br from-[#123c6b] to-[#0b2a4c] border border-white/10">
          <svg viewBox="0 0 120 90" className="absolute right-0 bottom-0 w-28 opacity-20" aria-hidden>
            <rect x="20" y="30" width="22" height="60" fill="#9cc7f2" /><rect x="48" y="10" width="28" height="80" fill="#c5def7" /><rect x="82" y="40" width="24" height="50" fill="#9cc7f2" />
          </svg>
          <button onClick={hidePromo} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-sky-500/90 text-white flex items-center justify-center" aria-label="Kapat"><X className="w-3.5 h-3.5" /></button>
          <BarChart3 className="relative w-7 h-7 text-sky-400" />
          <p className="relative mt-2 text-[15px] font-bold leading-snug">Daha güçlü satışlar için <span className="font-normal text-slate-200">verilerinizi keşfedin.</span></p>
          <button onClick={onReports} className="relative mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold">
            Raporları Gör <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="m-3 p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-brand-600 flex items-center justify-center text-sm font-black shrink-0">{initials(userName)}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold truncate">{userName}</span>
          <span className="block text-[11px] text-slate-400 truncate" title={userEmail}>{roleLabel}</span>
        </span>
        <button onClick={onSignOut} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10" title={`Çıkış Yap (${userEmail})`} aria-label="Çıkış yap">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
