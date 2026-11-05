import React, { useEffect, useMemo, useState } from 'react';
import { foldName } from '../lib/customerInsights';

type MapData = { TR_VIEWBOX: string; TR_CITIES: [string, number, string][] };
let cache: MapData | null = null;

/**
 * Türkiye il haritası: her il, değerine göre maviden koyu maviye boyanır (değer yoksa açık gri-mavi).
 * İl çizimleri ilk açılışta ayrı dosyadan yüklenir (uygulamanın açılışını yavaşlatmaz).
 */
export const TurkeyMap: React.FC<{
  values: Record<string, number>;
  format: (v: number) => string;
  onPick?: (city: string) => void;
  className?: string;
}> = ({ values, format, onPick, className = '' }) => {
  const [data, setData] = useState<MapData | null>(cache);
  const [hover, setHover] = useState<{ name: string; v: number } | null>(null);
  useEffect(() => {
    if (cache) return;
    let live = true;
    import('../lib/turkeyMap').then(m => { cache = m; if (live) setData(m); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  // İl adları Türkçe harf farkı gözetmeden eşleşir (ör. "AFYON" → Afyonkarahisar)
  const byKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(values)) {
      let key = foldName(k);
      if (key === 'afyon') key = 'afyonkarahisar';
      if (key === 'maras') key = 'kahramanmaras';
      if (key === 'urfa') key = 'sanliurfa';
      if (key === 'antep') key = 'gaziantep';
      m.set(key, (m.get(key) || 0) + v);
    }
    return m;
  }, [values]);
  const max = Math.max(1, ...byKey.values());
  const fill = (v: number) => {
    if (!v) return '#cfe0f4';
    const t = 0.25 + 0.75 * Math.sqrt(v / max);
    // açık mavi (#a9cdf3) → koyu mavi (#0a5bc0)
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
    return `rgb(${mix(169, 10)},${mix(205, 91)},${mix(243, 192)})`;
  };
  if (!data) return <div className={`aspect-[2.2/1] rounded-2xl bg-slate-100 animate-pulse ${className}`} />;
  return (
    <div className={`relative ${className}`}>
      <svg viewBox={data.TR_VIEWBOX} className="w-full h-auto" role="img" aria-label="Türkiye illerine göre teklif dağılımı">
        {data.TR_CITIES.map(([name, , d]) => {
          const v = byKey.get(foldName(name)) || 0;
          return (
            <path key={name} d={d} fill={fill(v)} stroke="#fff" strokeWidth={0.8}
              className={`transition-opacity ${onPick && v ? 'cursor-pointer hover:opacity-80' : ''}`}
              onMouseEnter={() => setHover({ name, v })} onMouseLeave={() => setHover(null)}
              onClick={() => v && onPick?.(name)}>
              <title>{`${name}: ${v ? format(v) : 'teklif yok'}`}</title>
            </path>
          );
        })}
      </svg>
      {hover && (
        <span className="pointer-events-none absolute left-1 top-0 px-2 py-1 rounded-lg bg-white/95 border border-slate-200 shadow-sm text-[11px] font-bold text-slate-700">
          {hover.name}: <span className="text-brand-700">{hover.v ? format(hover.v) : 'teklif yok'}</span>
        </span>
      )}
    </div>
  );
};
