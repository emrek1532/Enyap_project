import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Search, X } from 'lucide-react';
import { Material, searchMaterials } from '../lib/materials';
import type { ReqRow } from '../lib/requests';

export const money = (m: Pick<Material, 'price' | 'currency'>) => (m.price > 0
  ? `${m.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${m.currency === 'TRY' ? 'TL' : m.currency}` : 'fiyat yok');

/** Seçim bekleyen satır sayısı (adayı olup seçilmemiş; katalogda olmayanlar teklif notuna yazılır) */
export const openCount = (rows: ReqRow[] | null | undefined) => rows?.filter(r => !r.skip && !r.pick && r.m.cands.length > 0).length || 0;

/**
 * Okunan talep satırları: talepteki yazı, adet, katalog adayından seçim, atla.
 * Yeşil = ürün seçildi, sarı = seçim bekliyor, kırmızı yazı = katalogda yok.
 */
/**
 * Adaylar yanlışsa katalogda elle arama. Yalnız kullanıcı yazınca (2+ harf, 400 ms bekleyip) tek istek atar;
 * seçilen ürün satırın adaylarına eklenir ve seçilir.
 */
const CatalogSearch: React.FC<{ initial: string; onPick: (m: Material) => void; onClose: () => void }> = ({ initial, onPick, onClose }) => {
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Material[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setItems([]); return; }
    let live = true;
    const h = setTimeout(() => {
      setBusy(true);
      searchMaterials(t, { limit: 15 }).then(r => { if (live) setItems(r.items); }, () => { if (live) setItems([]); })
        .finally(() => { if (live) setBusy(false); });
    }, 400);
    return () => { live = false; clearTimeout(h); };
  }, [q]);
  return (
    <div className="rounded-lg border border-sky-200 bg-white p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder='Ürün adı ya da kod (ör. 2 1/2" dirsek)'
          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 text-sm" aria-label="Katalogda ara" />
        {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-700" aria-label="Aramayı kapat"><X className="w-4 h-4" /></button>
      </div>
      {items.length > 0 ? (
        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
          {items.map(m => (
            <button key={m.code} onClick={() => onPick(m)} className="w-full text-left px-2 py-1.5 text-xs hover:bg-sky-50">
              <span className="font-semibold text-slate-800">{m.name}</span>
              <span className="text-slate-500"> · <span className="tabular-nums">{m.code}</span> · {money(m)}</span>
            </button>
          ))}
        </div>
      ) : q.trim().length >= 2 && !busy && <div className="text-[11px] text-slate-500 px-1">Sonuç yok; başka kelimeyle deneyin.</div>}
    </div>
  );
};

export const RequestLines: React.FC<{ rows: ReqRow[]; onChange: (rows: ReqRow[]) => void; readOnly?: boolean }> = ({ rows, onChange, readOnly }) => {
  const update = (i: number, p: Partial<ReqRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const [searching, setSearching] = useState<number | null>(null);
  // Aramada seçilen ürün adayların başına eklenir (saklanan en fazla 8 aday içinde kalsın)
  const pickFound = (i: number, m: Material) => {
    const r = rows[i];
    update(i, { pick: m.code, m: { ...r.m, cands: [m, ...r.m.cands.filter(c => c.code !== m.code)], via: 'choose' } });
    setSearching(null);
  };
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
          {!r.skip && searching === i && !readOnly && <CatalogSearch initial={r.item} onPick={m => pickFound(i, m)} onClose={() => setSearching(null)} />}
          {!r.skip && searching !== i && (r.m.cands.length ? (
            <div className="flex items-center gap-2">
              {r.pick ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <span className="w-4 h-4 rounded-full bg-amber-400 shrink-0" />}
              <select value={r.pick || ''} disabled={readOnly} onChange={e => update(i, { pick: e.target.value || null })}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white">
                <option value="">— ürün seçin ({r.m.cands.length} aday) —</option>
                {r.m.cands.map(c => <option key={c.code} value={c.code}>{c.name} · {c.code} · {money(c)}</option>)}
              </select>
              {!readOnly && (
                <button onClick={() => setSearching(i)} title="Doğru ürün listede yoksa katalogda ara"
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-800 text-xs font-semibold hover:bg-sky-100">
                  <Search className="w-3.5 h-3.5" /> Ara
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-rose-700">
              <span className="flex-1">Katalogda bulunamadı: aşağıdan arayın, teklif formunda elle ekleyin ya da atlayın.</span>
              {!readOnly && (
                <button onClick={() => setSearching(i)} className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-800 font-semibold hover:bg-sky-100">
                  <Search className="w-3.5 h-3.5" /> Ara
                </button>
              )}
            </div>
          ))}
          {!r.skip && r.pick && (() => {
            const m = r.m.cands.find(c => c.code === r.pick);
            return m && (
              <div className="text-[11px] text-emerald-700 tabular-nums">
                <span className="tabular-nums">{m.code}</span> · {money(m)}{r.m.via === 'pref' ? ' · tercihli ürün kuralıyla seçildi' : ''}
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
};
