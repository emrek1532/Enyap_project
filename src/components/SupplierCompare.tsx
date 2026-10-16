import React, { useEffect, useState } from 'react';
import { Loader2, Search, Trophy } from 'lucide-react';
import { SupplierItem, searchSupplierItems, supplierColor } from '../lib/suppliers';
import { Rates, fetchRates } from '../lib/rates';

const tl = (v: number) => `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
const cur = (v: number, c: string) => `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c === 'TRY' ? 'TL' : c === 'USD' ? '$' : '€'}`;

/** Aynı ürünü tüm firma listelerinde arar; iskonto ve kur uygulanmış net TL fiyata göre ucuzdan pahalıya sıralar */
export const SupplierCompare: React.FC<{ initialQuery?: string }> = ({ initialQuery = '' }) => {
  const [q, setQ] = useState(initialQuery);
  const [items, setItems] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [rates, setRates] = useState<Rates>({ USD: 0, EUR: 0 });
  useEffect(() => { fetchRates().then(r => r && setRates(r)); }, []);
  useEffect(() => setQ(initialQuery), [initialQuery]);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 3) { setItems([]); return; }
    let off = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await searchSupplierItems(s, { limit: 80 }); if (!off) setItems(r.items); }
      catch { if (!off) setItems([]); }
      finally { if (!off) setLoading(false); }
    }, 300);
    return () => { off = true; clearTimeout(t); };
  }, [q]);

  const rate = (c: string) => (c === 'USD' ? rates.USD : c === 'EUR' ? rates.EUR : 1);
  const rows = items
    .filter(i => i.price > 0)
    .map(i => ({ i, net: i.price * (1 - i.discount / 100) * rate(i.currency) }))
    .filter(r => r.net > 0)
    .sort((a, b) => a.net - b.net);
  const lists = new Set(rows.map(r => r.i.listName));

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3 sm:p-4 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} autoFocus
            placeholder='Ürün ara: ör. küresel vana dn25, pislik tutucu 2"'
            className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />}
        </div>
        <p className="text-[11px] text-slate-500">
          Tüm firma listelerinde arar; liste fiyatına firmanın iskontosu ve güncel kur uygulanır, <b>net TL</b> fiyata göre ucuzdan pahalıya sıralanır.
          {rates.USD > 0 && <> Kur: $ {rates.USD.toLocaleString('tr-TR')} · € {rates.EUR.toLocaleString('tr-TR')}</>}
        </p>
      </div>

      {q.trim().length >= 3 && !loading && rows.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">Firma listelerinde bulunamadı.</div>
      )}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
          <div className="px-3 py-2 text-[11px] font-bold text-slate-500 bg-slate-50">{rows.length} sonuç · {lists.size} firma</div>
          {rows.map(({ i, net }, k) => (
            <div key={i.id} className={`p-3 flex items-start gap-3 ${k === 0 ? 'bg-emerald-50/50' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] font-black text-white rounded px-1.5 py-px" style={{ background: supplierColor(i.listName) }}>{i.listName.toLocaleUpperCase('tr')}</span>
                  {k === 0 && <span className="text-[10px] font-black text-emerald-700 flex items-center gap-0.5"><Trophy className="w-3 h-3" /> En ucuz</span>}
                </div>
                <div className="text-sm font-semibold text-slate-800 leading-snug mt-0.5">{i.name}</div>
                <div className="text-[11px] text-slate-500 font-mono">{i.code}{i.ourCode ? ` · bizim kod ${i.ourCode}` : ''}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-black tabular-nums text-slate-900">{tl(net)}</div>
                <div className="text-[10px] text-slate-500 tabular-nums">liste {cur(i.price, i.currency)}{i.discount ? ` · %${i.discount}` : ''}</div>
                {k > 0 && rows[0].net > 0 && <div className="text-[10px] font-bold text-rose-600 tabular-nums">+%{Math.round((net / rows[0].net - 1) * 100)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
