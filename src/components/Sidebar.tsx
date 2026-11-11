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
        className={`group relative w-full flex flex-col lg:flex-row items-center gap-1 lg:gap-3.5 px-1 lg:px-4 py-2 lg:py-2.5 rounded-2xl lg:rounded-xl text-[10.5px] lg:text-[15px] font-medium transition-all duration-200 ${on
          ? 'bg-gradient-to-r from-[#1677D8] to-[#1AA6EE] text-white font-semibold shadow-[0_6px_26px_-2px_rgba(26,166,238,0.7)] ring-1 ring-[#7FD3FA]/40'
          : 'text-white/90 hover:bg-white/10 hover:text-white'}`}>
        <Icon className="relative w-5 h-5 lg:w-[22px] lg:h-[22px] shrink-0 text-white" strokeWidth={1.7} />
        <span className="relative max-w-full truncate lg:flex-1 text-center lg:text-left">{title}</span>
        {badge > 0 && <span className="max-lg:absolute max-lg:top-1 max-lg:right-2 relative min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center tabular-nums" aria-label={`${badge} bekleyen`}>{badge > 99 ? '99+' : badge}</span>}
      </button>
    );
  };
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-[88px] lg:w-60 flex-col overflow-hidden bg-gradient-to-b from-[#0A1E3D] via-[#0C2850] to-[#0B2447] text-white pt-safe border-r border-white/5">
      {/* Süs (tıklanmaz): sağ alt yarıda kavisli, yumuşak mavi parlama */}
      <svg aria-hidden viewBox="0 0 240 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="sb-g1" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1AA6EE" stopOpacity="0.38" /><stop offset="0.6" stopColor="#0072CE" stopOpacity="0.16" /><stop offset="1" stopColor="#0A1E3D" stopOpacity="0" /></linearGradient>
          <linearGradient id="sb-g2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5CC4F5" stopOpacity="0.32" /><stop offset="1" stopColor="#0072CE" stopOpacity="0" /></linearGradient>
        </defs>
        <path d="M240 330 C150 430 70 600 120 760 C150 860 210 930 240 960 Z" fill="url(#sb-g1)" />
        <path d="M240 470 C185 540 150 650 185 760 C205 830 230 880 240 900 Z" fill="url(#sb-g2)" />
        <path d="M240 330 C150 430 70 600 120 760 C150 860 210 930 240 960" fill="none" stroke="#7FD3FA" strokeOpacity="0.28" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div aria-hidden className="pointer-events-none absolute -right-16 top-[45%] w-56 h-72 rounded-full bg-[#1AA6EE]/15 blur-3xl" />
      <button onClick={onHome} className="relative mx-2 lg:mx-4 mt-6 mb-5 flex flex-col items-center gap-2.5 px-2 py-2 rounded-2xl hover:bg-white/5 text-center transition-colors" title="Ana Sayfa">
        <img src="/logo-mark.png" alt="ENYAP" draggable={false} className="lg:hidden w-11 h-auto select-none" />
        <img src="/logo-dark.png" alt="ENYAP" draggable={false} className="hidden lg:block w-full max-w-[190px] h-auto select-none" />
        <span className="hidden lg:block text-[13px] font-medium text-white/90">Isı Sistemleri · Teklif & Satış</span>
      </button>
      <nav className="relative flex-1 overflow-y-auto no-scrollbar px-2 lg:px-3 space-y-1 lg:space-y-1.5">
        {item('home', 'Ana Sayfa', Home, onHome)}
        {sections.map(s => item(s.id, s.title, s.icon, () => onOpen(s.id), s.badge))}
      </nav>
      <div className="relative m-2 lg:m-3 p-2 lg:p-3.5 rounded-2xl bg-[#0B2447]/80 backdrop-blur-sm border border-[#5CC4F5]/25 shadow-[0_12px_30px_-16px_rgba(0,0,0,0.6)]">
        <div className="flex flex-col lg:flex-row items-center gap-1 lg:gap-3" title={userName}>
          <span className="w-11 h-11 rounded-full bg-gradient-to-br from-[#1AA6EE] to-[#0072CE] flex items-center justify-center text-[15px] font-black shrink-0">{initials(userName)}</span>
          <span className="hidden lg:block min-w-0 flex-1">
            <span className="block text-[15px] font-bold truncate">{userName}</span>
            <span className="block text-xs text-white/65 truncate" title={userEmail}>{roleLabel}</span>
          </span>
        </div>
        {tools && <div className="mt-2 lg:mt-3 pt-2 lg:pt-3 border-t border-white/10 [&>div]:max-lg:grid [&>div]:max-lg:grid-cols-2 [&>div]:max-lg:justify-items-center">{tools}</div>}
      </div>
    </aside>
  );
};
