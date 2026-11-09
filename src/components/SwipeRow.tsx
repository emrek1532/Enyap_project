import React, { useRef, useState } from 'react';

export interface SwipeAction { key: string; label: string; icon?: React.ReactNode; cls: string; onClick: () => void }

/**
 * Telefonda kartı sola kaydırınca hızlı işlem düğmeleri açılır (Onayla, Ara, Yarın ara…).
 * Dikey kaydırmayı bozmaz: hareket yataysa kart kayar, dikeyse sayfa kayar.
 */
export const SwipeRow: React.FC<{ actions: SwipeAction[]; children: React.ReactNode }> = ({ actions, children }) => {
  const W = 72 * actions.length;
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const st = useRef<{ x0: number; y0: number; base: number; dir: 'h' | 'v' | null } | null>(null);
  if (!actions.length) return <>{children}</>;

  const onStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    st.current = { x0: t.clientX, y0: t.clientY, base: x, dir: null };
  };
  const onMove = (e: React.TouchEvent) => {
    const s = st.current; if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x0, dy = t.clientY - s.y0;
    if (!s.dir) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; s.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'; }
    if (s.dir !== 'h') return;
    setDrag(true);
    setX(Math.max(-W - 24, Math.min(0, s.base + dx)));
  };
  const onEnd = () => {
    const s = st.current; st.current = null;
    if (!s || s.dir !== 'h') return;
    setDrag(false);
    setX(v => (v < -W / 2 ? -W : 0));
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex" style={{ width: W }} aria-hidden={x === 0}>
        {actions.map(a => (
          <button key={a.key} type="button" tabIndex={x === 0 ? -1 : 0} onClick={() => { setX(0); a.onClick(); }}
            className={`w-[72px] flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-white ${a.cls}`}>
            {a.icon}{a.label}
          </button>
        ))}
      </div>
      <div onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}
        onClickCapture={e => { if (x !== 0) { e.stopPropagation(); e.preventDefault(); setX(0); } }}
        className={`relative bg-white ${drag ? '' : 'transition-transform duration-200'}`} style={{ transform: `translateX(${x}px)`, touchAction: 'pan-y' }}>
        {children}
      </div>
    </div>
  );
};
