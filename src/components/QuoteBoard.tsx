import React, { useMemo, useState } from 'react';
import { MoveRight } from 'lucide-react';
import { Quote } from '../types';
import { formatTl } from '../lib/rates';
import { daysToExpiry, expiryLabel, followLabel, quoteAgeInDays, isExpiring } from '../lib/quoteRules';
import { localDay } from '../lib/dates';
import { quoteNo, isPassive, isPendingQuote } from '../lib/quoteRules';

/** Pano sütunları: Beklemede (takip tarihi yok), Takipte (takip tarihi var), Onaylandı, İptal */
export type BoardCol = 'bekliyor' | 'takip' | 'pasif' | 'onaylandi' | 'iptal';

export const colOf = (q: Quote): BoardCol =>
  q.status === 'onaylandi' ? 'onaylandi' : q.status === 'iptal' ? 'iptal' : isPassive(q) ? 'pasif' : q.followUpAt ? 'takip' : 'bekliyor';

const COLS: { key: BoardCol; label: string; hint: string; dot: string; over: string }[] = [
  { key: 'bekliyor', label: 'Beklemede', hint: 'Takip tarihi verilmemiş', dot: 'bg-[#006DBB]', over: 'ring-[#006DBB]/40 bg-[#EAF5FC]/70' },
  { key: 'takip', label: 'Takipte', hint: 'Arama günü belli', dot: 'bg-[#00B49A]', over: 'ring-[#00B49A]/40 bg-[#E6F7F4]/70' },
  { key: 'pasif', label: 'Pasif', hint: 'Neden seçilmiş, beklenmiyor', dot: 'bg-[#173F73]', over: 'ring-[#173F73]/30 bg-[#EEF2F7]/70' },
  { key: 'onaylandi', label: 'Onaylandı', hint: 'Sipariş oldu', dot: 'bg-emerald-500', over: 'ring-emerald-300 bg-emerald-50/60' },
  { key: 'iptal', label: 'İptal', hint: 'Sipariş olup iptal', dot: 'bg-slate-400', over: 'ring-slate-300 bg-slate-100' },
];
const SHOW = 30;

/**
 * Satış hunisi (Kanban): teklifler durumlarına göre sütunlarda kart olarak durur.
 * Bilgisayarda kart sürüklenip başka sütuna bırakılır; telefonda karttaki "Taşı" ile.
 */
export const QuoteBoard: React.FC<{
  quotes: Quote[];
  netTry: Map<string, number>;
  readOnly?: boolean;
  onOpen: (q: Quote) => void;
  onMove: (q: Quote, to: BoardCol) => void;
}> = ({ quotes, netTry, readOnly, onOpen, onMove }) => {
  const today = localDay();
  const [over, setOver] = useState<BoardCol | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [more, setMore] = useState<Record<string, number>>({});

  const cols = useMemo(() => {
    const m: Record<BoardCol, Quote[]> = { bekliyor: [], takip: [], pasif: [], onaylandi: [], iptal: [] };
    quotes.forEach(q => m[colOf(q)].push(q));
    m.takip.sort((a, b) => (a.followUpAt || '').localeCompare(b.followUpAt || ''));
    (['bekliyor', 'pasif', 'onaylandi', 'iptal'] as BoardCol[]).forEach(k => m[k].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    return m;
  }, [quotes]);

  const drop = (to: BoardCol, id: string | null) => {
    setOver(null); setDragId(null);
    const q = id && quotes.find(x => x.id === id);
    if (q && colOf(q) !== to) onMove(q, to);
  };

  const card = (q: Quote) => {
    const exp = daysToExpiry(q, today);
    const pending = isPendingQuote(q);
    return (
      <div key={q.id} draggable={!readOnly}
        onDragStart={e => { e.dataTransfer.setData('text/plain', q.id); e.dataTransfer.effectAllowed = 'move'; setDragId(q.id); }}
        onDragEnd={() => { setDragId(null); setOver(null); }}
        className={`relative rounded-2xl border bg-white p-3 shadow-[0_6px_16px_-12px_rgba(15,60,120,0.6)] ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'} ${dragId === q.id ? 'opacity-50 rotate-1' : ''} border-slate-200 hover:border-brand-300`}>
        <button type="button" onClick={() => onOpen(q)} className="block w-full text-left">
          <div className="flex items-center justify-between gap-2">
            <span className="tabular-nums text-[11px] font-bold text-brand-700">{quoteNo(q)}</span>
            <span className="text-[13px] font-black text-slate-900 tabular-nums whitespace-nowrap">{formatTl(netTry.get(q.id) || 0)}</span>
          </div>
          <div className="mt-0.5 text-[13px] font-bold text-slate-900 leading-snug line-clamp-2">{q.customerName}</div>
          <div className="text-[11px] text-slate-500">{q.city || '—'} · {new Date(q.createdAt).toLocaleDateString('tr-TR')}</div>
        </button>
        {isPassive(q) && <div className="mt-2"><span className="text-[11px] px-2 py-0.5 rounded-full font-bold border bg-[#EAF5FC] text-[#006DBB] border-[#006DBB]/25">{(q.lostReason || '').split(' · ')[0]}</span></div>}
        {(pending || exp !== null) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {pending && q.followUpAt && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${q.followUpAt <= today ? 'bg-red-50 text-red-700 border-red-200' : 'bg-[#E6F7F4] text-[#008F79] border-[#00B49A]/30'}`}>{followLabel(q.followUpAt, today)}</span>
            )}
            {pending && !q.followUpAt && quoteAgeInDays(q) >= 3 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-bold border bg-slate-50 text-slate-600 border-slate-200">{quoteAgeInDays(q)} gündür bekliyor</span>
            )}
            {exp !== null && isExpiring(q, today) && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${exp < 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-[#EEF2F7] text-[#173F73] border-[#173F73]/15'}`}>{expiryLabel(exp)}</span>
            )}
          </div>
        )}
        {!readOnly && (
          <div className="md:hidden mt-2 relative">
            <button type="button" onClick={() => setMoveFor(moveFor === q.id ? null : q.id)}
              className="h-7 px-2.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600">
              <MoveRight className="w-3.5 h-3.5" /> Taşı
            </button>
            {moveFor === q.id && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {COLS.filter(c => c.key !== colOf(q)).map(c => (
                  <button key={c.key} type="button" onClick={() => { setMoveFor(null); onMove(q, c.key); }}
                    className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 text-[11px] font-bold text-slate-700">
                    <i className={`w-2 h-2 rounded-full ${c.dot}`} />{c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto px-3 sm:px-4 pb-4 pt-2 -mb-1">
      <div className="grid grid-cols-[repeat(5,minmax(220px,1fr))] gap-3 min-w-[1150px] 2xl:min-w-0">
        {COLS.map(c => {
          const list = cols[c.key];
          const sum = list.reduce((t, q) => t + (netTry.get(q.id) || 0), 0);
          const shown = more[c.key] || SHOW;
          return (
            <section key={c.key}
              onDragOver={e => { if (readOnly) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== c.key) setOver(c.key); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(o => (o === c.key ? null : o)); }}
              onDrop={e => { e.preventDefault(); drop(c.key, e.dataTransfer.getData('text/plain') || dragId); }}
              className={`rounded-2xl bg-slate-50 border border-slate-100 p-2.5 flex flex-col gap-2 min-w-0 transition-colors ${over === c.key ? `ring-2 ${c.over}` : ''}`}>
              <header className="px-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wide text-slate-700"><i className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />{c.label}</h3>
                  <span className="text-[11px] font-bold text-slate-500 tabular-nums">{list.length}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>{c.hint}</span><b className="text-slate-800 tabular-nums">{formatTl(sum)}</b>
                </div>
              </header>
              {list.length === 0 && <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center text-[11px] text-slate-500">{readOnly ? 'Teklif yok' : 'Buraya bırakın'}</div>}
              {list.slice(0, shown).map(card)}
              {list.length > shown && (
                <button type="button" onClick={() => setMore(m => ({ ...m, [c.key]: shown + SHOW }))}
                  className="py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-brand-700">+{list.length - shown} teklif daha</button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
