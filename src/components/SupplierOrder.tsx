import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Loader2, Truck, X } from 'lucide-react';
import { Quote } from '../types';
import { CURRENCY_LABEL } from '../lib/money';
import { SupplierOffer, supplierColor, supplierOffersFor } from '../lib/suppliers';

const money = (v: number, c: string) => `${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${CURRENCY_LABEL[c as keyof typeof CURRENCY_LABEL] || c}`;
const NONE = '__yok__';

/**
 * Onaylanan tekliften tedarikçi siparişi: her kalem, eşleşen firma listelerinden en ucuzuna atanır (değiştirilebilir),
 * firmalara göre ayrılmış sipariş metni WhatsApp'tan gönderilir ya da kopyalanır.
 */
export const SupplierOrder: React.FC<{ quote: Quote; onClose: () => void }> = ({ quote, onClose }) => {
  const items = useMemo(() => (quote.items || []).filter(it => it.productName.trim()), [quote]);
  const [offers, setOffers] = useState<Map<string, SupplierOffer[]> | null>(null);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState('');

  useEffect(() => {
    supplierOffersFor(items.map(it => it.code || '')).then(m => {
      setOffers(m);
      const c: Record<string, string> = {};
      items.forEach(it => { const best = m.get((it.code || '').trim())?.[0]; c[it.id] = best ? best.supplier : NONE; });
      setChoice(c);
    }, () => setError('Firma listeleri alınamadı.'));
  }, [items]);

  const groups = useMemo(() => {
    const g = new Map<string, { it: typeof items[number]; o?: SupplierOffer }[]>();
    items.forEach(it => {
      const sup = choice[it.id] || NONE;
      const o = offers?.get((it.code || '').trim())?.find(x => x.supplier === sup);
      g.set(sup, [...(g.get(sup) || []), { it, o }]);
    });
    return [...g.entries()].sort((a, b) => (a[0] === NONE ? 1 : 0) - (b[0] === NONE ? 1 : 0) || a[0].localeCompare(b[0], 'tr'));
  }, [items, choice, offers]);

  const textFor = (sup: string, rows: { it: typeof items[number]; o?: SupplierOffer }[]) => [
    `Merhaba, ${sup === NONE ? '' : sup + ' — '}sipariş (${quote.customerName} / ${quote.quoteNumber}):`,
    ...rows.map(({ it, o }) => `• ${o?.code || it.code || ''} ${o?.name || it.productName} — ${it.quantity.toLocaleString('tr-TR')} ${it.unit}`.replace(/\s+—/, ' —')),
    '', 'Teslim tarihi ve fiyat teyidi rica ederiz. Enyap Isı',
  ].join('\n');

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(''), 1500); } catch { /* yok */ }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col h-full sm:h-auto sm:max-h-[90vh] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 pt-safe">
          <Truck className="w-5 h-5 text-brand-600" />
          <h3 className="flex-1 font-black text-slate-900 min-w-0 truncate">Tedarikçi siparişi · {quote.quoteNumber}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-safe">
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {!offers && !error && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Firma listeleri taranıyor…</p>}
          {offers && (
            <>
              <div>
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1.5">Kalemler · hangi firmadan?</div>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {items.map(it => {
                    const os = offers.get((it.code || '').trim()) || [];
                    return (
                      <div key={it.id} className="p-2.5 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                        <span className="flex-1 min-w-0"><b className="font-mono text-slate-500 mr-1">{it.code}</b>{it.productName} <span className="text-slate-400">× {it.quantity.toLocaleString('tr-TR')} {it.unit}</span></span>
                        <select value={choice[it.id] || NONE} onChange={e => setChoice(c => ({ ...c, [it.id]: e.target.value }))}
                          className="sm:w-64 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs">
                          {os.map((o, i) => <option key={o.supplier} value={o.supplier}>{o.supplier} · {money(o.net, o.currency)}{i === 0 ? ' (en ucuz)' : ''}</option>)}
                          <option value={NONE}>{os.length ? 'Firma seçme' : 'Listelerde eşleşme yok'}</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {groups.map(([sup, rows]) => {
                const text = textFor(sup, rows);
                const total = rows.reduce((s, r) => s + (r.o ? r.o.net * (r.it.quantity || 0) : 0), 0);
                const cur = rows.find(r => r.o)?.o?.currency || 'TRY';
                return (
                  <div key={sup} className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 text-white text-sm font-black" style={{ background: sup === NONE ? '#64748b' : supplierColor(sup) }}>
                      <span className="flex-1 min-w-0 truncate">{sup === NONE ? 'Firması belirlenmemiş' : sup}</span>
                      <span className="text-xs font-bold opacity-90">{rows.length} kalem{total > 0 ? ` · ~${money(total, cur)} + KDV` : ''}</span>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap p-3 bg-slate-50 text-slate-700 font-sans">{text}</pre>
                    <div className="flex gap-2 p-2 border-t border-slate-100">
                      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
                        className="flex-1 text-center px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">WhatsApp'ta gönder</a>
                      <button onClick={() => copy(sup, text)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700">
                        <Copy className="w-3.5 h-3.5" /> {copied === sup ? 'Kopyalandı' : 'Kopyala'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
