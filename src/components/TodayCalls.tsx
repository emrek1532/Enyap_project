import React, { useMemo, useState } from 'react';
import { BellRing, Phone } from 'lucide-react';
import { Quote } from '../types';
import { localDay } from '../lib/dates';
import { daysToExpiry, expiryLabel, followDue, followLabel, isExpiring } from '../lib/quoteRules';
import { quoteTry, Rates } from '../lib/rates';
import { trNum, trMoney } from '../lib/num';
import { quoteNo } from '../lib/quoteRules';

const lira = (v: number) => `₺ ${trMoney(v)}`;
const SHOW = 5;

/**
 * Ana sayfa: "Bugün aranacaklar" (takip günü gelen teklifler) ve "Süresi dolanlar".
 * İkisi de boşsa kart hiç çizilmez.
 */
export const TodayCalls: React.FC<{
  quotes: Quote[];
  rates: Rates;
  onOpen: (q: Quote) => void;
  onAll: (status: 'takip' | 'expiring') => void;
}> = ({ quotes, rates, onOpen, onAll }) => {
  const today = localDay();
  const { calls, expiring } = useMemo(() => ({
    calls: quotes.filter(q => followDue(q, today)).sort((a, b) => (a.followUpAt || '').localeCompare(b.followUpAt || '')),
    expiring: quotes.filter(q => isExpiring(q, today)).sort((a, b) => (a.validUntil || '').localeCompare(b.validUntil || '')),
  }), [quotes, today]);
  type K = 'calls' | 'expiring';
  const tabs = ([['calls', 'Bugün aranacak', calls.length], ['expiring', 'Süresi dolan', expiring.length]] as [K, string, number][]).filter(x => x[2] > 0);
  const [pick, setPick] = useState<K | null>(null);
  const tab = tabs.find(x => x[0] === pick)?.[0] || tabs[0]?.[0];
  if (!tab) return null;
  const list = tab === 'calls' ? calls : expiring;

  return (
    <section className="bg-white rounded-3xl border border-white shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)] min-w-0 overflow-hidden">
      <header className="px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-black text-[#173F73] flex items-center gap-2"><BellRing className="w-5 h-5 text-amber-500" />Takip</h2>
        {list.length > SHOW && <button onClick={() => onAll(tab === 'calls' ? 'takip' : 'expiring')} className="text-xs font-bold text-brand-600">Tümü ({list.length})</button>}
      </header>
      <div className="px-4 sm:px-5 pb-1 flex gap-1.5" role="tablist" aria-label="Takip">
        {tabs.map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setPick(k)}
            className={`flex-1 h-9 rounded-xl text-xs font-bold border ${tab === k ? 'bg-[#173F73] border-[#173F73] text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
            {label} <span className={`tabular-nums ${tab === k ? 'text-sky-200' : 'text-slate-500'}`}>{n}</span>
          </button>
        ))}
      </div>
      <ul className="px-2 sm:px-3 pb-2 pt-1">
        {list.slice(0, SHOW).map(q => {
          const tel = (q.customerPhone || '').replace(/[^\d+]/g, '');
          const exp = daysToExpiry(q, today);
          const late = tab === 'calls' ? (q.followUpAt || '') < today : (exp ?? 0) < 0;
          return (
            <li key={q.id} className="flex items-center gap-2">
              <button onClick={() => onOpen(q)} className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 text-left rounded-xl hover:bg-slate-50">
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-800 truncate">{q.customerName}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{quoteNo(q)} · {lira(quoteTry(q, rates))}</span>
                </span>
                <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-bold border ${late ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                  {tab === 'calls' ? followLabel(q.followUpAt!, today) : expiryLabel(exp ?? 0)}
                </span>
              </button>
              {tel && (
                <a href={`tel:${tel}`} aria-label={`${q.customerName} ara`} className="shrink-0 w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center hover:bg-sky-100">
                  <Phone className="w-4 h-4" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
