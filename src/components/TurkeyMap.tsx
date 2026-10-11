import React, { useMemo, useState } from 'react';
import { TR_CITIES } from '../lib/turkeyMap';

const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/[âà]/g, 'a').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z]/g, '');

// Açık → koyu tek renk skala (marka mavisi)
const RAMP = ['#dbebf7', '#b2d4ee', '#80b6e2', '#4092d4', '#0160ae', '#03457d'];

/** Türkiye il haritası: değeri olan iller koyuluğa göre boyanır, üzerine gelince il ve değer çıkar */
const TurkeyMap: React.FC<{ values: Map<string, { value: number; label: string }> }> = ({ values }) => {
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const byKey = useMemo(() => {
    const m = new Map<string, { value: number; label: string }>();
    values.forEach((v, k) => m.set(fold(k), v));
    return m;
  }, [values]);
  const max = Math.max(1, ...[...byKey.values()].map(v => v.value));
  const color = (v?: { value: number }) => {
    if (!v || v.value <= 0) return '#eef2f6';
    const t = Math.sqrt(v.value / max); // küçük değerler de görünsün
    return RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))];
  };
  const hv = hover ? byKey.get(fold(hover.name)) : undefined;
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox="18 140 1014 451" className="w-full h-auto block" role="img" aria-label="Türkiye il haritası">
        {TR_CITIES.map(c => (
          <path key={c.n} d={c.p} fill={color(byKey.get(fold(c.n)))} stroke="#ffffff" strokeWidth={1.2}
            className="transition-opacity hover:opacity-80 cursor-pointer"
            onMouseMove={e => {
              const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setHover({ name: c.n, x: e.clientX - r.left, y: e.clientY - r.top });
            }}
            onClick={e => {
              const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setHover({ name: c.n, x: e.clientX - r.left, y: e.clientY - r.top });
            }} />
        ))}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-10 bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap -translate-x-1/2 -translate-y-full"
          style={{ left: hover.x, top: hover.y - 8 }}>
          <div className="font-bold">{hover.name}</div>
          <div>{hv ? hv.label : 'satış yok'}</div>
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500">
        <span>az</span>
        {RAMP.map(c => <span key={c} className="w-5 h-2 rounded-sm" style={{ background: c }} />)}
        <span>çok</span>
      </div>
    </div>
  );
};

export default TurkeyMap;
