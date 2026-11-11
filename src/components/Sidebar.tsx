import React from 'react';
import { Home } from 'lucide-react';

export type SideSection = { id: string; title: string; icon: React.ElementType; badge?: number };

/** Kullanıcı adının baş harfleri (avatar) */
export const initials = (name: string) =>
  name.trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toLocaleUpperCase('tr-TR')).join('') || '?';

/**
 * Bilgisayarda (md ve üstü) soldaki koyu menü: logo, bölümler, altta kullanıcı kartı
 * (kartın altında ara, eşitle, bildirim, kılavuz, çıkış düğmeleri: `tools`).
 * Telefonda gizlidir; orada alttaki menü kullanılır.
 */
export const Sidebar: React.FC<{
  sections: SideSection[];
  active: string;
  onOpen: (id: string) => void;
  onHome: () => void;
  tools?: React.ReactNode;
  userName: string;
  userEmail: string;
  roleLabel: string;
}> = ({ sections, active, onOpen, onHome, tools, userName, userEmail, roleLabel }) => {
  const item = (id: string, title: string, Icon: React.ElementType, onClick: () => void, badge = 0) => {
    const on = active === id;
    return (
      <button key={id} onClick={onClick} aria-current={on ? 'page' : undefined}
        className={`relative w-full flex flex-col lg:flex-row items-center gap-1 lg:gap-3 px-1 lg:px-3.5 py-2 lg:py-2.5 rounded-2xl lg:rounded-xl text-[10.5px] lg:text-sm font-semibold transition ${on
          ? 'bg-gradient-to-r from-brand-500 to-sky-500 text-white shadow-[0_8px_20px_-8px_rgba(14,140,240,0.8)]'
          : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
        <Icon className="w-5 h-5 shrink-0" /> <span className="max-w-full truncate lg:flex-1 text-center lg:text-left">{title}</span>
        {badge > 0 && <span className="max-lg:absolute max-lg:top-1 max-lg:right-2 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center tabular-nums" aria-label={`${badge} bekleyen`}>{badge > 99 ? '99+' : badge}</span>}
      </button>
    );
  };
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-[88px] lg:w-60 flex-col bg-gradient-to-b from-[#0b2a4c] via-[#0a2442] to-[#071a31] text-white pt-safe">
      <button onClick={onHome} className="mx-2 lg:mx-3 mt-5 mb-4 flex flex-col items-center gap-2 px-2 py-3 rounded-2xl hover:bg-white/5 text-center" title="Ana Sayfa">
        <span className="w-full flex justify-center px-1.5 lg:px-4 py-2 lg:py-2.5 rounded-xl bg-white shadow-sm"><img src="/logo-splash.png" alt="ENYAP" draggable={false} className="h-5 lg:h-8 w-auto max-w-full select-none" /></span>
        <span className="hidden lg:block text-[11px] font-medium text-slate-300 tracking-wide">Isı Sistemleri · Teklif & Satış</span>
      </button>
      <nav className="flex-1 overflow-y-auto px-2 lg:px-3 space-y-1">
        {item('home', 'Ana Sayfa', Home, onHome)}
        {sections.map(s => item(s.id, s.title, s.icon, () => onOpen(s.id), s.badge))}
      </nav>
      <div className="m-2 lg:m-3 p-2 lg:p-3 rounded-2xl bg-white/5 border border-white/10">
        <div className="flex flex-col lg:flex-row items-center gap-1 lg:gap-3" title={userName}>
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-brand-600 flex items-center justify-center text-sm font-black shrink-0">{initials(userName)}</span>
          <span className="hidden lg:block min-w-0 flex-1">
            <span className="block text-sm font-bold truncate">{userName}</span>
            <span className="block text-[11px] text-slate-400 truncate" title={userEmail}>{roleLabel}</span>
          </span>
        </div>
        {tools && <div className="mt-2 lg:mt-3 pt-2 lg:pt-3 border-t border-white/10 [&>div]:max-lg:grid [&>div]:max-lg:grid-cols-2 [&>div]:max-lg:justify-items-center">{tools}</div>}
      </div>
    </aside>
  );
};
