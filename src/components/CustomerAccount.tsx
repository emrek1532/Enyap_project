import React, { useMemo, useState } from 'react';
import { ChevronRight, FilePlus2, MapPin, Search, X } from 'lucide-react';
import { Collection, Customer, Quote, QuoteStatus } from '../types';
import { PENDING_STATUSES } from '../lib/quoteRules';
import { Rates, quoteTry } from '../lib/rates';

export const STATUS_LABEL: Record<QuoteStatus, { label: string; cls: string }> = {
  yeni_talep: { label: 'Beklemede', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  hazirlaniyor: { label: 'Beklemede', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  gonderildi: { label: 'Beklemede', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  revizyon: { label: 'Beklemede', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  onaylandi: { label: 'Onaylandı', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  siparis: { label: 'Onaylandı', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  iptal: { label: 'İptal', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  arsiv: { label: 'Arşiv', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const isApproved = (q: Quote) => q.status === 'onaylandi' || q.status === 'siparis';
const isPending = (q: Quote) => PENDING_STATUSES.includes(q.status);
const tl = (n: number) => `${Math.round(n).toLocaleString('tr-TR')} TL`;
const day = (s: string) => (s ? new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const curSym = (c?: string) => (c === 'USD' ? '$' : c === 'EUR' ? '€' : 'TL');
const money = (v: number, c?: string) => `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curSym(c)}`;
const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

type Tab = 'quotes' | 'items' | 'collections';
type QFilter = 'all' | 'approved' | 'pending' | 'cancelled';

/**
 * Cari hesap: firmaya ait her şey tek ekranda — özet, teklifler (tıklayınca açılır),
 * teklif kalemlerinden malzeme geçmişi (aranabilir) ve tahsilatlar.
 */
export const CustomerAccount: React.FC<{
  customer: Customer;
  quotes: Quote[];
  collections: Collection[];
  rates: Rates;
  showCollections: boolean;
  onClose: () => void;
  onOpenQuote?: (q: Quote) => void;
  onNewQuote: () => void;
}> = ({ customer, quotes, collections, rates, showCollections, onClose, onOpenQuote, onNewQuote }) => {
  const [tab, setTab] = useState<Tab>('quotes');
  const [qFilter, setQFilter] = useState<QFilter>('all');
  const [q, setQ] = useState('');
  const [onlyBought, setOnlyBought] = useState(true);
  const [limit, setLimit] = useState(60);

  const approved = quotes.filter(isApproved);
  const pending = quotes.filter(isPending);
  const cancelled = quotes.filter(x => x.status === 'iptal' || x.status === 'arsiv');
  const sumTry = (l: Quote[]) => l.reduce((s, x) => s + quoteTry(x, rates), 0);
  const colTry = collections.filter(c => c.currency === 'TRY').reduce((s, c) => s + c.amount, 0);
  const lastBuy = approved[0]?.createdAt;

  // Teklif kalemleri → malzeme geçmişi (en yeni önce)
  const lines = useMemo(() => quotes.flatMap(qt => (qt.items || []).map((it, i) => ({
    key: `${qt.id}-${i}`, quote: qt, it,
    cur: it.currency || qt.currency,
    net: (it.unitPrice || 0) * (1 - (it.discount || 0) / 100),
  }))), [quotes]);
  const quotesWithItems = quotes.filter(x => x.items?.length).length;

  const nq = fold(q.trim());
  const shownQuotes = quotes.filter(x =>
    (qFilter === 'all' || (qFilter === 'approved' ? isApproved(x) : qFilter === 'pending' ? isPending(x) : x.status === 'iptal' || x.status === 'arsiv'))
    && (!nq || fold(`${x.quoteNumber} ${x.notes || ''} ${x.preparedBy || ''} ${(x.items || []).map(i => `${i.productName} ${i.code || ''}`).join(' ')}`).includes(nq)));
  const shownLines = lines.filter(l => (!onlyBought || isApproved(l.quote))
    && (!nq || nq.split(/\s+/).every(w => fold(`${l.it.productName} ${l.it.code || ''} ${l.quote.quoteNumber}`).includes(w))));
  const shownCols = collections.filter(c => !nq || fold(`${c.method} ${c.description || ''} ${c.checkNo || ''} ${c.bankName || ''}`).includes(nq));

  const tile = (label: string, value: string, sub: string, cls: string, onClick?: () => void) => (
    <button type="button" onClick={onClick} className={`text-left p-3 rounded-xl border min-w-0 ${cls} ${onClick ? 'hover:brightness-95' : 'cursor-default'}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide opacity-80 truncate">{label}</div>
      <div className="text-lg font-black tabular-nums truncate">{value}</div>
      <div className="text-[11px] opacity-80 tabular-nums truncate">{sub}</div>
    </button>
  );
  const tabBtn = (t: Tab, label: string) => (
    <button onClick={() => { setTab(t); setLimit(60); }}
      className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-extrabold whitespace-nowrap ${tab === t ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>
  );
  const chip = (f: QFilter, label: string, n: number) => (
    <button onClick={() => setQFilter(f)}
      className={`px-2.5 py-1 rounded-full border text-xs font-bold whitespace-nowrap ${qFilter === f ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 text-slate-600'}`}>
      {label} <span className="opacity-70">{n}</span>
    </button>
  );
  const open = (x: Quote) => onOpenQuote?.(x);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-slate-50 w-full sm:max-w-4xl sm:rounded-2xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden">
        {/* Başlık */}
        <div className="px-4 sm:px-5 py-3.5 bg-brand-600 text-white flex items-center gap-3 pt-safe">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-brand-100 font-bold uppercase tracking-wide">Cari hesap</div>
            <h3 className="font-black text-base sm:text-lg leading-tight break-words">{customer.name}</h3>
            <p className="text-xs text-brand-100 flex items-center gap-1"><MapPin className="w-3 h-3" />{customer.city || '—'}</p>
          </div>
          <button onClick={onNewQuote} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-bold">
            <FilePlus2 className="w-4 h-4" /> Yeni teklif
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-brand-100 hover:text-white hover:bg-brand-700" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-3 sm:p-5 space-y-3 overflow-y-auto flex-1">
          {/* Özet */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {tile('Onaylanan', `${approved.length} teklif`, tl(sumTry(approved)), 'bg-emerald-50 border-emerald-200 text-emerald-800', () => { setTab('quotes'); setQFilter('approved'); })}
            {tile('Bekleyen', `${pending.length} teklif`, tl(sumTry(pending)), 'bg-purple-50 border-purple-200 text-purple-800', () => { setTab('quotes'); setQFilter('pending'); })}
            {showCollections
              ? tile('Tahsilat', tl(colTry), `${collections.length} kayıt`, 'bg-white border-slate-200 text-slate-800', () => setTab('collections'))
              : tile('Toplam teklif', `${quotes.length}`, `${cancelled.length} iptal/arşiv`, 'bg-white border-slate-200 text-slate-800')}
            {tile('Son alım', lastBuy ? day(lastBuy) : '—', quotes[0] ? `son teklif ${day(quotes[0].createdAt)}` : 'teklif yok', 'bg-white border-slate-200 text-slate-800')}
          </div>

          {/* Sekmeler + arama */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex gap-1 p-1 rounded-xl bg-slate-200/70 w-fit max-w-full overflow-x-auto">
              {tabBtn('quotes', `Teklifler · ${quotes.length}`)}
              {tabBtn('items', `Malzemeler · ${lines.length}`)}
              {showCollections && tabBtn('collections', `Tahsilatlar · ${collections.length}`)}
            </div>
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={e => { setQ(e.target.value); setLimit(60); }}
                placeholder={tab === 'items' ? 'Malzeme ara (ör. küresel vana 1")…' : tab === 'quotes' ? 'Teklif no, not ya da malzeme ara…' : 'Tahsilat ara…'}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-brand-400" />
            </div>
          </div>

          {tab === 'quotes' && (
            <>
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                {chip('all', 'Tümü', quotes.length)}
                {chip('approved', 'Onaylanan', approved.length)}
                {chip('pending', 'Bekleyen', pending.length)}
                {chip('cancelled', 'İptal/Arşiv', cancelled.length)}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {shownQuotes.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Teklif yok.</p>}
                {shownQuotes.slice(0, limit).map(x => (
                  <button key={x.id} onClick={() => open(x)} disabled={!onOpenQuote}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-sm text-brand-700 underline decoration-brand-200 underline-offset-2">{x.quoteNumber || '—'}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${STATUS_LABEL[x.status].cls}`}>{STATUS_LABEL[x.status].label}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {day(x.createdAt)}{x.preparedBy ? ` · ${x.preparedBy}` : ''}{x.items?.length ? ` · ${x.items.length} kalem` : ''}{x.notes ? ` · ${x.notes}` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-slate-900 tabular-nums whitespace-nowrap">{tl(quoteTry(x, rates))}</div>
                      {x.currency !== 'TRY' && <div className="text-[10px] text-slate-400 whitespace-nowrap">{money(x.totalAmount, x.currency)}</div>}
                    </div>
                    {onOpenQuote && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === 'items' && (
            <>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-700">
                  <input type="checkbox" checked={onlyBought} onChange={e => setOnlyBought(e.target.checked)} />
                  Sadece onaylananlar (satın aldıkları)
                </label>
                <span>{shownLines.length} kalem</span>
              </div>
              {lines.length === 0 ? (
                <p className="bg-white rounded-xl border border-slate-200 py-8 px-4 text-center text-sm text-slate-500">
                  Bu firmanın tekliflerinde kalem bilgisi yok. Excel'den aktarılan eski tekliflerde sadece toplam tutar var;
                  yeni girilen ya da Mikro PDF'inden okunan tekliflerin kalemleri burada listelenir.
                </p>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {shownLines.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Eşleşen malzeme yok.</p>}
                  {shownLines.slice(0, limit).map(l => (
                    <button key={l.key} onClick={() => open(l.quote)} disabled={!onOpenQuote}
                      className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                      <div className="w-[4.5rem] shrink-0 text-[11px] font-bold text-slate-500 tabular-nums pt-0.5">{day(l.quote.createdAt)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-900 leading-snug break-words">{l.it.productName}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {l.it.code ? `${l.it.code} · ` : ''}<span className="font-mono">{l.quote.quoteNumber}</span>
                          {!isApproved(l.quote) && ` · ${STATUS_LABEL[l.quote.status].label}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-black text-slate-900 tabular-nums whitespace-nowrap">{l.it.quantity.toLocaleString('tr-TR')} {l.it.unit}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                          {money(l.net, l.cur)}{l.it.discount ? ` (%${l.it.discount} isk.)` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {lines.length > 0 && quotesWithItems < quotes.length && (
                <p className="text-[11px] text-slate-400 px-1">{quotes.length} tekliften {quotesWithItems} tanesinde kalem bilgisi var (Excel'den gelenlerde sadece toplam tutar bulunuyor).</p>
              )}
            </>
          )}

          {tab === 'collections' && showCollections && (
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {shownCols.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Tahsilat yok.</p>}
              {shownCols.slice(0, limit).map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-[4.5rem] shrink-0 text-[11px] font-bold text-slate-500 tabular-nums">{day(c.date)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900">{c.method}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {[c.dueDate && `vade ${day(c.dueDate)}`, c.bankName, c.checkNo, c.description].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div className="text-sm font-black text-slate-900 tabular-nums whitespace-nowrap">{money(c.amount, c.currency)}</div>
                </div>
              ))}
            </div>
          )}

          {((tab === 'quotes' && shownQuotes.length > limit) || (tab === 'items' && shownLines.length > limit) || (tab === 'collections' && shownCols.length > limit)) && (
            <button onClick={() => setLimit(l => l + 60)} className="w-full py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-brand-700">Daha fazla göster</button>
          )}

          <button onClick={onNewQuote} className="sm:hidden w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold">
            <FilePlus2 className="w-4 h-4" /> Bu firmaya yeni teklif
          </button>
        </div>
      </div>
    </div>
  );
};
