import React from 'react';
import { Home } from 'lucide-react';

export type SideSection = { id: string; title: string; icon: React.ElementType };

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
      <div className="m-3 p-3 rounded-2xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-brand-600 flex items-center justify-center text-sm font-black shrink-0">{initials(userName)}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold truncate">{userName}</span>
            <span className="block text-[11px] text-slate-400 truncate" title={userEmail}>{roleLabel}</span>
          </span>
        </div>
        {tools && <div className="mt-3 pt-3 border-t border-white/10">{tools}</div>}
      </div>
    </aside>
  );
};
