import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { Quote } from '../types';
import { monthForecast } from '../lib/forecast';
import { Targets, useSetting } from '../lib/settings';
import { trNum, trMoney } from '../lib/num';

const tl = (v: number) => `${trMoney(v)} TL`;
const short = (v: number) => (v >= 1e6 ? `${trNum(v / 1e6, { maximumFractionDigits: 1 })} M` : v >= 1e3 ? `${trNum(Math.round(v / 1e3))} B` : trNum(Math.round(v)));

/**
 * Bu ay tahmini ciro: onaylanan (kesin) + bekleyen tekliflerden beklenen.
 * Beklenen = son 45 günde verilip hâlâ bekleyen tekliflerin tutarı × geçmiş satış oranı
 * (30–210 gün önce verilen tekliflerde onaylanan tutar / verilen tutar).
 */
export const ForecastCard: React.FC<{ quotes: Quote[]; amountOf: (q: Quote) => number }> = ({ quotes, amountOf }) => {
  const [targets] = useSetting<Targets>('targets', { sales: 0, collection: 0 });
  const f = useMemo(() => monthForecast(quotes, amountOf), [quotes, amountOf]);

  const target = targets.sales || 0;
  // Grafik kutunun gerçek genişliğinde çizilir (yazılar her ekranda aynı boyda kalır)
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 170, L = 44, R = 12, T = 12, B = 24;
  const max = Math.max(1, f.total, target) * 1.12;
  const x = (day: number) => L + ((day - 1) / Math.max(1, f.dim - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(p => p * max / 1.12);
  const actual = f.cum.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const lastX = x(f.d), lastY = y(f.approved);
  const endY = y(f.total);
  const area = `${actual} L${lastX.toFixed(1)} ${y(0)} L${x(1)} ${y(0)} Z`;
  const pctOfTarget = target ? Math.round((f.total / target) * 100) : null;

  return (
    <div className="bg-white p-4 rounded-2xl border border-[#E2EAF3] shadow-[0_10px_28px_-22px_rgba(15,60,120,0.55)] min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#EAF5FC] text-[#006DBB]"><TrendingUp className="w-[18px] h-[18px]" /></span>
          <div className="min-w-0">
            <h3 className="font-extrabold text-[#0B2343] text-[15px] leading-tight">Bu Ay Tahmini Ciro</h3>
            <p className="text-xs text-[#5E7491] mt-0.5">Onaylanan + bekleyen tekliflerden beklenen (geçmiş satış oranı %{Math.round(f.rate * 100)})</p>
          </div>
        </div>
        {pctOfTarget !== null && (
          <span className={`shrink-0 text-[11px] font-black px-2.5 py-1 rounded-full ${pctOfTarget >= 100 ? 'bg-[#E6F7F4] text-[#008F79]' : 'bg-[#EAF5FC] text-[#006DBB]'}`}>Hedefin %{pctOfTarget}'i</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-xl bg-[#E6F7F4] border border-[#CBEDE6] px-3 py-2 min-w-0"><div className="text-[11px] font-bold uppercase tracking-wide text-[#008F79]">Kesin (onaylı)</div><div className="text-base xl:text-[14px] 2xl:text-lg font-black text-[#0B2343] tabular-nums truncate">{tl(f.approved)}</div><div className="text-[11px] text-[#5E7491]">{f.n} teklif</div></div>
        <div className="rounded-xl bg-[#EAF5FC] border border-[#D3E6F5] px-3 py-2 min-w-0"><div className="text-[11px] font-bold uppercase tracking-wide text-[#006DBB]">Tahmini ek</div><div className="text-base xl:text-[14px] 2xl:text-lg font-black text-[#0B2343] tabular-nums truncate">{tl(f.expected)}</div><div className="text-[11px] text-[#5E7491] truncate">{f.pendN} bekleyen · {tl(f.pendAmt)}</div></div>
        <div className="rounded-xl bg-[#F1F6FC] border border-[#E2EAF3] px-3 py-2 min-w-0"><div className="text-[11px] font-bold uppercase tracking-wide text-[#173F73]">Ay sonu tahmini</div><div className="text-base xl:text-[14px] 2xl:text-lg font-black text-[#0B2343] tabular-nums truncate">{tl(f.total)}</div><div className="text-[11px] text-[#5E7491] truncate">{target ? `hedef ${tl(target)}` : 'hedef girilmemiş (ana sayfada)'}</div></div>
      </div>
      <div ref={box} className="mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="Bu ay günlük biriken onaylı ciro ve ay sonu tahmini">
          {ticks.map(v => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" />
              <text x={L - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#64748b">{short(v)}</text>
            </g>
          ))}
          {[1, Math.ceil(f.dim / 2), f.dim].map(dd => <text key={dd} x={x(dd)} y={H - 6} textAnchor={dd === 1 ? 'start' : dd === f.dim ? 'end' : 'middle'} fontSize="10" fill="#64748b">{dd}</text>)}
          {target > 0 && <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} stroke="#173F73" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.55" />}
          {f.cum.length > 0 && <path d={area} fill="#00B49A" opacity="0.12" />}
          {f.cum.length > 0 && <path d={actual} fill="none" stroke="#00B49A" strokeWidth="2.5" strokeLinejoin="round" />}
          <path d={`M${lastX} ${lastY} L${x(f.dim)} ${endY}`} fill="none" stroke="#006DBB" strokeWidth="2.5" strokeDasharray="6 5" />
          <circle cx={lastX} cy={lastY} r="4" fill="#00B49A" />
          <circle cx={x(f.dim)} cy={endY} r="4" fill="#006DBB" />
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5"><i className="w-3 h-0.5 bg-[#00B49A]" />Onaylanan (gün gün)</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-0.5 border-t-2 border-dashed border-[#006DBB]" />Tahmin</span>
        {target > 0 && <span className="flex items-center gap-1.5"><i className="w-3 h-0.5 border-t-2 border-dashed border-[#173F73]/60" />Hedef</span>}
      </div>
    </div>
  );
};
