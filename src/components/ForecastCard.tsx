import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { Quote } from '../types';
import { dayOf, localDay } from '../lib/dates';
import { PENDING_STATUSES } from '../lib/quoteRules';
import { Targets, useSetting } from '../lib/settings';
import { trNum } from '../lib/num';

const tl = (v: number) => `${trNum(Math.round(v))} TL`;
const short = (v: number) => (v >= 1e6 ? `${trNum(v / 1e6, { maximumFractionDigits: 1 })} M` : v >= 1e3 ? `${trNum(Math.round(v / 1e3))} B` : trNum(Math.round(v)));
const DAY = 864e5;

/**
 * Bu ay tahmini ciro: onaylanan (kesin) + bekleyen tekliflerden beklenen.
 * Beklenen = son 45 günde verilip hâlâ bekleyen tekliflerin tutarı × geçmiş satış oranı
 * (30–210 gün önce verilen tekliflerde onaylanan tutar / verilen tutar).
 */
export const ForecastCard: React.FC<{ quotes: Quote[]; amountOf: (q: Quote) => number }> = ({ quotes, amountOf }) => {
  const [targets] = useSetting<Targets>('targets', { sales: 0, collection: 0 });
  const f = useMemo(() => {
    const now = new Date();
    const today = localDay(now);
    const ym = today.slice(0, 7);
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const d = now.getDate();
    const daily = new Array(dim + 1).fill(0);
    let approved = 0, n = 0;
    let histAll = 0, histOk = 0, pendAmt = 0, pendN = 0;
    const t = now.getTime();
    for (const q of quotes) {
      const day = dayOf(q.createdAt);
      const amt = amountOf(q);
      if (q.status === 'onaylandi' && day.startsWith(ym)) { approved += amt; n++; daily[Number(day.slice(8, 10))] += amt; }
      const age = (t - Date.parse(q.createdAt)) / DAY;
      if (age >= 30 && age <= 210) { histAll += amt; if (q.status === 'onaylandi') histOk += amt; }
      if (PENDING_STATUSES.includes(q.status) && age <= 45) { pendAmt += amt; pendN++; }
    }
    const rate = histAll > 0 ? histOk / histAll : 0;
    const expected = pendAmt * rate;
    const cum: number[] = [];
    let run = 0;
    for (let i = 1; i <= d; i++) { run += daily[i]; cum.push(run); }
    return { dim, d, approved, n, rate, expected, pendAmt, pendN, cum, total: approved + expected };
  }, [quotes, amountOf]);

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
  const H = 180, L = 44, R = 12, T = 12, B = 24;
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
    <div className="bg-white p-4 rounded-3xl border border-white shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)] min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-brand-500" />Bu Ay Tahmini Ciro</h3>
          <p className="text-xs text-slate-500">Onaylanan + bekleyen tekliflerden beklenen (geçmiş satış oranı %{Math.round(f.rate * 100)})</p>
        </div>
        {pctOfTarget !== null && (
          <span className={`shrink-0 text-[11px] font-black px-2 py-1 rounded-full ${pctOfTarget >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>Hedefin %{pctOfTarget}'i</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-xl bg-emerald-50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/80">Kesin (onaylı)</div><div className="text-lg font-black text-emerald-800 tabular-nums">{tl(f.approved)}</div><div className="text-[11px] text-emerald-800/80">{f.n} teklif</div></div>
        <div className="rounded-xl bg-sky-50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-sky-800/80">Tahmini ek</div><div className="text-lg font-black text-sky-800 tabular-nums">{tl(f.expected)}</div><div className="text-[11px] text-sky-800/80">{f.pendN} bekleyen · {tl(f.pendAmt)}</div></div>
        <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Ay sonu tahmini</div><div className="text-lg font-black text-slate-900 tabular-nums">{tl(f.total)}</div><div className="text-[11px] text-slate-500">{target ? `hedef ${tl(target)}` : 'hedef girilmemiş (ana sayfada)'}</div></div>
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
          {target > 0 && <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 4" />}
          {f.cum.length > 0 && <path d={area} fill="#10b981" opacity="0.12" />}
          {f.cum.length > 0 && <path d={actual} fill="none" stroke="#0ea371" strokeWidth="2.5" strokeLinejoin="round" />}
          <path d={`M${lastX} ${lastY} L${x(f.dim)} ${endY}`} fill="none" stroke="#0284c7" strokeWidth="2.5" strokeDasharray="6 5" />
          <circle cx={lastX} cy={lastY} r="4" fill="#0ea371" />
          <circle cx={x(f.dim)} cy={endY} r="4" fill="#0284c7" />
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5"><i className="w-3 h-0.5 bg-emerald-600" />Onaylanan (gün gün)</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-0.5 border-t-2 border-dashed border-sky-600" />Tahmin</span>
        {target > 0 && <span className="flex items-center gap-1.5"><i className="w-3 h-0.5 border-t-2 border-dashed border-amber-500" />Hedef</span>}
      </div>
    </div>
  );
};
