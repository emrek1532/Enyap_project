import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Quote } from '../types';
import { CURRENCY_LABEL } from '../lib/money';
import { Material, foldTr, searchMaterials } from '../lib/materials';
import { SupplierItem, searchSupplierItems, supplierColor } from '../lib/suppliers';
import { can, useAccess } from '../lib/access';
import { dayOf } from '../lib/dates';

const money = (v: number, c: string) => `${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${CURRENCY_LABEL[c as keyof typeof CURRENCY_LABEL] || c}`;
const trDay = (s: string) => dayOf(s).split('-').reverse().join('.');

/**
 * Hızlı fiyat sorgusu: ürün adı veya kodu yazılınca katalog fiyatı, firma listelerindeki fiyatlar
 * ve bu ürünü en son kime kaçtan verdiğimiz tek ekranda görünür (müşteri telefonda sorduğunda).
 */
export const QuickPrice: React.FC<{ quotes: Quote[]; onOpenQuote: (q: Quote) => void }> = ({ quotes, onOpenQuote }) => {
  const me = useAccess();
  const showOwn = can(me, 'materials'), showSup = can(me, 'suppliers');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState<Material[]>([]);
  const [sup, setSup] = useState<SupplierItem[]>([]);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) { setOwn([]); setSup([]); return; }
    let live = true;
    const t = window.setTimeout(async () => {
      setBusy(true);
      const [o, s] = await Promise.all([
        showOwn ? searchMaterials(term, { limit: 5 }).then(r => r.items, () => []) : Promise.resolve([]),
        showSup ? searchSupplierItems(term, { limit: 6 }).then(r => r.items, () => []) : Promise.resolve([]),
      ]);
      if (!live) return;
      setOwn(o as Material[]); setSup(s as SupplierItem[]); setBusy(false);
    }, 300);
    return () => { live = false; window.clearTimeout(t); };
  }, [term, showOwn, showSup]);

  // Bu ürünü en son kime kaçtan verdik (teklif kalemlerinden, yeniden eskiye)
  const history = useMemo(() => {
    if (term.length < 2) return [];
    const words = foldTr(term).split(/\s+/).filter(Boolean);
    const code = term.toUpperCase();
    const out: { q: Quote; name: string; price: number; disc: number; cur: string }[] = [];
    const sorted = [...quotes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    for (const qt of sorted) {
      for (const it of qt.items || []) {
        const hit = (it.code || '').toUpperCase() === code || words.every(w => foldTr(`${it.productName} ${it.code || ''}`).includes(w));
        if (!hit || !(it.unitPrice > 0)) continue;
        out.push({ q: qt, name: it.productName, price: it.unitPrice, disc: it.discount || 0, cur: it.currency || qt.currency || 'TRY' });
        break;
      }
      if (out.length >= 6) break;
    }
    return out;
  }, [term, quotes]);

  const empty = term.length >= 2 && !busy && !own.length && !sup.length && !history.length;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 space-y-2.5">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Hızlı fiyat sor: ürün adı veya kodu…"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
        {busy ? <Loader2 className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
          : q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400" aria-label="Temizle"><X className="w-4 h-4" /></button>}
      </div>

      {empty && <p className="text-xs text-slate-500 px-1">Sonuç bulunamadı.</p>}

      {own.length > 0 && (
        <Group title="Katalog fiyatı">
          {own.map(m => (
            <Row key={m.code} left={<><b className="font-mono text-[11px] text-slate-500 mr-1">{m.code}</b>{m.name}</>}
              right={m.price > 0 ? money(m.price, m.currency) : '—'} />
          ))}
        </Group>
      )}

      {sup.length > 0 && (
        <Group title="Firma listeleri (iskonto sonrası)">
          {sup.map(s => {
            const net = s.price * (1 - (s.discount || 0) / 100);
            return (
              <Row key={s.id}
                left={<><span className="inline-block text-[10px] font-black text-white rounded px-1.5 py-0.5 mr-1.5 align-middle" style={{ background: supplierColor(s.listName) }}>{s.listName}</span>{s.name}</>}
                right={<>{money(net, s.currency)}{s.discount > 0 && <span className="block text-[10px] font-normal text-slate-400">liste {money(s.price, s.currency)} · %{s.discount}</span>}</>} />
            );
          })}
        </Group>
      )}

      {history.length > 0 && (
        <Group title="En son kime kaçtan verdik">
          {history.map(h => (
            <button key={h.q.id} onClick={() => onOpenQuote(h.q)} className="w-full text-left">
              <Row left={<><b className="text-slate-800">{h.q.customerName}</b> <span className="text-slate-400">· {trDay(h.q.createdAt)}{h.q.status === 'onaylandi' ? ' · onaylı' : ''}</span><span className="block text-[11px] text-slate-500 truncate">{h.name}</span></>}
                right={<>{money(h.price * (1 - h.disc / 100), h.cur)}{h.disc > 0 && <span className="block text-[10px] font-normal text-slate-400">liste {money(h.price, h.cur)} · %{h.disc}</span>}</>} />
            </button>
          ))}
        </Group>
      )}
    </section>
  );
};

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500 px-1 mb-1">{title}</div>
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{children}</div>
  </div>
);

const Row: React.FC<{ left: React.ReactNode; right: React.ReactNode }> = ({ left, right }) => (
  <div className="flex items-start justify-between gap-3 px-2.5 py-1.5 text-xs">
    <span className="min-w-0 flex-1 text-slate-700 leading-snug">{left}</span>
    <span className="shrink-0 text-right font-bold text-slate-900 tabular-nums">{right}</span>
  </div>
);
