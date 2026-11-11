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
        className={`group relative w-full flex flex-col lg:flex-row items-center gap-1 lg:gap-3 px-1 lg:px-3.5 py-2 lg:py-[11px] rounded-2xl lg:rounded-xl text-[10.5px] lg:text-[15px] font-semibold transition-all duration-200 ${on
          ? 'bg-gradient-to-r from-[#0090D6] to-[#009FE3] text-white shadow-[0_10px_26px_-8px_rgba(0,159,227,0.85)] ring-1 ring-white/20'
          : 'text-white/85 hover:bg-[#009FE3]/15 hover:text-white'}`}>
        {on && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/20 to-transparent" />}
        <Icon className={`relative w-5 h-5 shrink-0 transition-colors ${on ? 'text-white' : 'text-white/75 group-hover:text-white'}`} strokeWidth={1.9} />
        <span className="relative max-w-full truncate lg:flex-1 text-center lg:text-left">{title}</span>
        {badge > 0 && <span className="max-lg:absolute max-lg:top-1 max-lg:right-2 relative min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center tabular-nums ring-2 ring-[#12345B]" aria-label={`${badge} bekleyen`}>{badge > 99 ? '99+' : badge}</span>}
      </button>
    );
  };
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-[88px] lg:w-60 flex-col overflow-hidden bg-gradient-to-b from-[#173F70] via-[#143A66] to-[#12345B] text-white pt-safe border-r border-white/5">
      {/* Süs: altta yumuşak mavi ışık ve dalga (tıklanmaz) */}
      <div aria-hidden className="pointer-events-none absolute -left-24 bottom-24 w-72 h-72 rounded-full bg-[#009FE3]/20 blur-3xl" />
      <svg aria-hidden viewBox="0 0 240 120" preserveAspectRatio="none" className="pointer-events-none absolute left-0 right-0 bottom-0 w-full h-40 text-[#009FE3]">
        <path d="M0 70 C60 40 120 95 240 55 L240 120 L0 120 Z" fill="currentColor" opacity="0.10" />
        <path d="M0 92 C70 64 140 112 240 80 L240 120 L0 120 Z" fill="currentColor" opacity="0.12" />
      </svg>
      <button onClick={onHome} className="relative mx-2 lg:mx-3 mt-5 mb-4 flex flex-col items-center gap-2 px-2 py-3 rounded-2xl hover:bg-white/5 text-center transition-colors" title="Ana Sayfa">
        <span className="w-full flex justify-center px-1.5 lg:px-4 py-2 lg:py-2.5 rounded-xl bg-white shadow-sm"><img src="/logo-splash.png" alt="ENYAP" draggable={false} className="h-5 lg:h-8 w-auto max-w-full select-none" /></span>
        <span className="hidden lg:block text-[11px] font-medium text-white/70 tracking-wide">Isı Sistemleri · Teklif & Satış</span>
      </button>
      <nav className="relative flex-1 overflow-y-auto no-scrollbar px-2 lg:px-3 space-y-1">
        {item('home', 'Ana Sayfa', Home, onHome)}
        {sections.map(s => item(s.id, s.title, s.icon, () => onOpen(s.id), s.badge))}
      </nav>
      <div className="relative m-2 lg:m-3 p-2 lg:p-3 rounded-2xl bg-[#12345B]/80 backdrop-blur-sm border border-[#009FE3]/35 shadow-[0_10px_30px_-18px_rgba(0,159,227,0.8)]">
        <div className="flex flex-col lg:flex-row items-center gap-1 lg:gap-3" title={userName}>
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#009FE3] to-[#0072CE] ring-2 ring-white/15 flex items-center justify-center text-sm font-black shrink-0">{initials(userName)}</span>
          <span className="hidden lg:block min-w-0 flex-1">
            <span className="block text-sm font-bold truncate">{userName}</span>
            <span className="block text-[11px] text-white/60 truncate" title={userEmail}>{roleLabel}</span>
          </span>
        </div>
        {tools && <div className="mt-2 lg:mt-3 pt-2 lg:pt-3 border-t border-white/10 [&>div]:max-lg:grid [&>div]:max-lg:grid-cols-2 [&>div]:max-lg:justify-items-center">{tools}</div>}
      </div>
    </aside>
  );
};
