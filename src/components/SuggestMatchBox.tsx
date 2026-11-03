import { useState } from 'react';
import { Suggestion } from '../lib/quoteCheck';
import { searchSupplierItems } from '../lib/suppliers';

const money = (v: number, cur: string) =>
  `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur === 'TRY' ? 'TL' : cur}`;

/**
 * Fiyat listesine bağlı olmayan teklif kalemi için eşleşme önerisi. Fiyatı birebir tutan adaylar önce (yalnız onlar) gösterilir,
 * diğerleri "Diğer adaylar" ile açılır. Hiçbiri doğru değilse firma listelerinde elle aranır (yalnız bağsız kalemler), ya da kapatılır.
 */
export function SuggestMatchBox({ productName, suggest, busyId, onLink }: {
  productName: string;
  suggest: Suggestion[];
  busyId: number | null;
  onLink: (s: Suggestion) => void;
}) {
  const hits = suggest.filter(s => s.priceHit);
  const [more, setMore] = useState(hits.length === 0);
  const [closed, setClosed] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Suggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  if (closed) return null;

  const shown = more ? suggest : hits;
  const search = async () => {
    const text = q.trim();
    if (text.length < 2) return;
    setSearching(true);
    try {
      const { items } = await searchSupplierItems(text, { limit: 20 });
      setFound(items.filter(i => !i.ourCode).slice(0, 8).map(i => ({
        id: i.id, list: i.listName || '', name: i.name, price: i.price, currency: i.currency, discount: i.discount || 0, score: 0,
      })));
    } catch {
      setFound([]);
    } finally {
      setSearching(false);
    }
  };

  const row = (s: Suggestion) => (
    <div key={s.id} className="flex items-center gap-2">
      <div className="flex-1 min-w-0 text-slate-800">
        <b>{s.list}</b> · {s.name} · {money(s.price, s.currency)}
        {s.discount > 0 && <span className="text-slate-500"> (liste iskontosu %{s.discount.toLocaleString('tr-TR')})</span>}
        {s.priceHit && <span className="text-emerald-700 font-semibold"> · fiyat birebir tutuyor</span>}
      </div>
      <button type="button" disabled={busyId !== null} onClick={() => onLink(s)}
        className="shrink-0 px-2 py-0.5 rounded bg-sky-600 text-white font-bold disabled:opacity-50">
        {busyId === s.id ? '…' : 'Bağla'}
      </button>
    </div>
  );

  return (
    <div className="mt-1 rounded bg-white/70 border border-amber-200 px-2 py-1.5 space-y-1">
      <div className="text-slate-600">
        {suggest.length ? 'Firma listelerinde benzeri var gibi, aynı ürünse bağlayın:' : 'Firma listelerinde benzer kalem bulunamadı, aşağıdan arayabilirsiniz:'}
      </div>
      {shown.map(row)}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
        {!more && suggest.length > hits.length && (
          <button type="button" onClick={() => setMore(true)} className="text-sky-700 font-semibold">Diğer adaylar ({suggest.length - hits.length})</button>
        )}
        <button type="button" onClick={() => { setClosed(true); }} className="text-slate-500 font-semibold">Hiçbiri</button>
      </div>
      <div className="flex gap-1.5 pt-0.5">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
          placeholder={`Listede ara (ör. ${productName.split(/\s+/).slice(0, 2).join(' ')})`}
          className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 bg-white text-slate-800" />
        <button type="button" onClick={search} disabled={searching || q.trim().length < 2}
          className="shrink-0 px-2 py-1 rounded bg-slate-700 text-white font-bold disabled:opacity-50">{searching ? '…' : 'Ara'}</button>
      </div>
      {found && (found.length ? found.map(row) : <div className="text-slate-500">Bağsız kalem bulunamadı.</div>)}
    </div>
  );
}
