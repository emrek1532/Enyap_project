import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { Material } from '../lib/materials';
import type { ReqRow } from '../lib/requests';

export const money = (m: Pick<Material, 'price' | 'currency'>) => (m.price > 0
  ? `${m.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${m.currency === 'TRY' ? 'TL' : m.currency}` : 'fiyat yok');

/** Seçim bekleyen satır sayısı (adayı olup seçilmemiş; katalogda olmayanlar teklif notuna yazılır) */
export const openCount = (rows: ReqRow[] | null | undefined) => rows?.filter(r => !r.skip && !r.pick && r.m.cands.length > 0).length || 0;

/**
 * Okunan talep satırları: talepteki yazı, adet, katalog adayından seçim, atla.
 * Yeşil = ürün seçildi, sarı = seçim bekliyor, kırmızı yazı = katalogda yok.
 */
export const RequestLines: React.FC<{ rows: ReqRow[]; onChange: (rows: ReqRow[]) => void; readOnly?: boolean }> = ({ rows, onChange, readOnly }) => {
  const update = (i: number, p: Partial<ReqRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className={`rounded-xl border p-2.5 space-y-1.5 ${r.skip ? 'opacity-50 border-slate-200' : r.pick ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/50'}`}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-500">Talepte: <span className="font-semibold text-slate-700">"{r.text}"</span>{r.unsure && <span className="text-rose-600 font-bold"> · okunuşu belirsiz</span>}</div>
              <div className="text-sm font-bold text-slate-900">{r.item}</div>
            </div>
            <input type="number" min={0} step="any" value={r.qty} disabled={readOnly} onChange={e => update(i, { qty: Number(e.target.value) || 0 })}
              className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-sm text-right tabular-nums bg-white" aria-label="Adet" />
            {!readOnly && (
              <button onClick={() => update(i, { skip: !r.skip })} title={r.skip ? 'Teklife ekle' : 'Bu satırı atla'} className="p-1 text-slate-500 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {!r.skip && (r.m.cands.length ? (
            <div className="flex items-center gap-2">
              {r.pick ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <span className="w-4 h-4 rounded-full bg-amber-400 shrink-0" />}
              <select value={r.pick || ''} disabled={readOnly} onChange={e => update(i, { pick: e.target.value || null })}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white">
                <option value="">— ürün seçin ({r.m.cands.length} aday) —</option>
                {r.m.cands.map(c => <option key={c.code} value={c.code}>{c.name} · {c.code} · {money(c)}</option>)}
              </select>
            </div>
          ) : <div className="text-xs text-rose-700">Katalogda bulunamadı: teklif formunda elle ekleyin ya da atlayın.</div>)}
          {!r.skip && r.pick && (() => {
            const m = r.m.cands.find(c => c.code === r.pick);
            return m && (
              <div className="text-[11px] text-emerald-700 tabular-nums">
                <span className="font-mono">{m.code}</span> · {money(m)}{r.m.via === 'pref' ? ' · tercihli ürün kuralıyla seçildi' : ''}
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
};
