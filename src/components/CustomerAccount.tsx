import { trNum } from '../lib/num';
import React, { useMemo, useState } from 'react';
import { dayOf } from '../lib/dates';
import { ChevronRight, FilePlus2, MapPin, Search, Wallet, X } from 'lucide-react';
import { CollectionQuickForm } from './LedgerPanel';
import { DateInput } from './DateInput';
import { Collection, Customer, CustomerStatus, Quote, QuoteStatus, UserRole } from '../types';
import { CustomerInsights } from './CustomerInsights';
import { WhatsAppMenu } from './WhatsAppMenu';
import { ABC_STYLE, AbcClass, CUSTOMER_STATUS, evaluate, statusOf } from '../lib/customerInsights';
import { isPendingQuote } from '../lib/quoteRules';
import { Rates, quoteTry } from '../lib/rates';
import { formatQuoteAmount } from '../lib/money';
import { textMatcher } from '../lib/materials';
import { quoteNo, viewStatus } from '../lib/quoteRules';

export { STATUS_LABEL } from '../lib/constants';
import { STATUS_LABEL } from '../lib/constants';

const isApproved = (q: Quote) => q.status === 'onaylandi';
const isPending = (q: Quote) => isPendingQuote(q);
const tl = (n: number) => `${Math.round(n).toLocaleString('tr-TR')} TL`;
const day = (s: string) => (s ? new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const curSym = (c?: string) => (c === 'USD' ? '$' : c === 'EUR' ? '€' : 'TL');
const money = (v: number, c?: string) => `${trNum(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curSym(c)}`;
const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

type Tab = 'timeline' | 'quotes' | 'items' | 'collections';
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
  /** Tahsilat düzenleme yetkisi varsa: cari içinden yeni tahsilat */
  onSaveCollection?: (c: Collection) => void;
  allCollectionRecords?: Collection[];
  customers?: Customer[];
  currentRole?: UserRole;
  /** Değerlendirme puanı için en yüksek onaylı ciro (tüm müşteriler) */
  maxWon?: number;
  onSetStatus?: (s: CustomerStatus, note: string) => void;
  /** Mikro'dan yüklenen bakiye ve sonrasındaki tahsilatlarla tahmini güncel bakiye */
  balance?: { balance: number; date: string; collectedAfter: number; estimate: number } | null;
  /** Müşteri sınıfı (A/B/C, son 12 ay ciro) */
  abc?: AbcClass;
}> = ({ abc, customer, quotes: allQuotes, collections: allCollections, rates, showCollections, onClose, onOpenQuote, onNewQuote, onSaveCollection, allCollectionRecords = [], customers = [], currentRole = 'isparta', maxWon = 0, onSetStatus, balance }) => {
  const ev = useMemo(() => evaluate(allQuotes, allCollections, rates, maxWon), [allQuotes, allCollections, rates, maxWon]);
  const cStatus = statusOf(customer);
  const [addingCol, setAddingCol] = useState(false);
  const [tab, setTab] = useState<Tab>('quotes');
  const [qFilter, setQFilter] = useState<QFilter>('all');
  const [q, setQ] = useState('');
  const [onlyBought, setOnlyBought] = useState(true);
  const [limit, setLimit] = useState(60);

  // Tarih filtresi: teklifler (teklif tarihi) ve tahsilatlar (tahsilat tarihi) birlikte süzülür
  const [range, setRange] = useState<{ key: string; from: string; to: string }>({ key: 'all', from: '', to: '' });
  const years = useMemo(() => {
    const ys = new Set<string>();
    allQuotes.forEach(x => x.createdAt && ys.add(dayOf(x.createdAt).slice(0, 4)));
    allCollections.forEach(c => c.date && ys.add(c.date.slice(0, 4)));
    return [...ys].sort().reverse().slice(0, 4);
  }, [allQuotes, allCollections]);
  const inRange = (d?: string) => {
    const x = dayOf(d);
    return (!range.from || x >= range.from) && (!range.to || x <= range.to);
  };
  const quotes = range.key === 'all' ? allQuotes : allQuotes.filter(x => inRange(x.createdAt));
  const collections = range.key === 'all' ? allCollections : allCollections.filter(c => inRange(c.date));
  const pickYear = (y: string) => setRange({ key: y, from: `${y}-01-01`, to: `${y}-12-31` });
  const pickMonth = () => {
    const n = new Date(); const ym = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    setRange({ key: 'month', from: `${ym}-01`, to: `${ym}-31` });
  };
  const rangeLabel = range.key === 'all' ? 'tüm zamanlar' : range.key === 'month' ? 'bu ay' : range.key === 'custom' ? `${day(range.from)} – ${day(range.to)}` : range.key;

  const approved = quotes.filter(isApproved);
  const pending = quotes.filter(isPending);
  const cancelled = quotes.filter(x => x.status === 'iptal');
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
  const lineMatch = textMatcher(q);
  const shownQuotes = quotes.filter(x =>
    (qFilter === 'all' || (qFilter === 'approved' ? isApproved(x) : qFilter === 'pending' ? isPending(x) : x.status === 'iptal'))
    && (!nq || fold(`${x.quoteNumber} ${quoteNo(x)} ${x.notes || ''} ${x.preparedBy || ''} ${(x.items || []).map(i => `${i.productName} ${i.code || ''}`).join(' ')}`).includes(nq)));
  const shownLines = lines.filter(l => (!onlyBought || isApproved(l.quote))
    && (!lineMatch || lineMatch(`${l.it.productName} ${l.it.code || ''} ${l.quote.quoteNumber}`)));
  const shownCols = collections.filter(c => !nq || fold(`${c.method} ${c.description || ''} ${c.checkNo || ''} ${c.bankName || ''}`).includes(nq));

  // Aynı gün alınan tahsilatlar (ör. aynı gün verilen çekler) tek satırda toplanır; dokununca parçalar açılır
  const colGroups = useMemo(() => {
    const out: { key: string; items: Collection[] }[] = [];
    const idx = new Map<string, number>();
    for (const c of shownCols) {
      const key = `${c.date}|${c.currency}`;
      const at = idx.get(key);
      if (at === undefined) { idx.set(key, out.length); out.push({ key, items: [c] }); } else out[at].items.push(c);
    }
    return out;
  }, [shownCols]);
  const [openCols, setOpenCols] = useState<Set<string>>(new Set());
  const toggleCol = (k: string) => setOpenCols(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const tile = (label: string, value: string, sub: string, cls: string, onClick?: () => void) => (
    <button type="button" onClick={onClick} className={`text-left p-3 rounded-xl border min-w-0 ${cls} ${onClick ? 'hover:brightness-95' : 'cursor-default'}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide opacity-80 truncate">{label}</div>
      <div className="text-lg font-black tabular-nums truncate">{value}</div>
      <div className="text-[11px] opacity-80 tabular-nums truncate">{sub}</div>
    </button>
  );
  const tabBtn = (t: Tab, label: string) => (
    <button onClick={() => { setTab(t); setLimit(60); }}
      className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-sm font-extrabold whitespace-nowrap ${tab === t ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>
  );
  const chip = (f: QFilter, label: string, n: number) => (
    <button onClick={() => setQFilter(f)}
      className={`px-2.5 py-1 rounded-full border text-xs font-bold whitespace-nowrap ${qFilter === f ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 text-slate-600'}`}>
      {label} <span className="opacity-70">{n}</span>
    </button>
  );
  const open = (x: Quote) => onOpenQuote?.(x);

  // Akış: teklifler, onay/iptal, planlı aramalar, tahsilatlar ve ziyaret tek zaman çizelgesinde (yeni üstte)
  type Ev = { key: string; day: string; kind: 'quote' | 'won' | 'lost' | 'call' | 'col' | 'visit'; title: string; sub?: string; amount?: string; quote?: Quote };
  const events = useMemo(() => {
    const out: Ev[] = [];
    const today = dayOf(new Date().toISOString());
    quotes.forEach(x => {
      const d = dayOf(x.createdAt);
      out.push({ key: `q-${x.id}`, day: d, kind: 'quote', title: `Teklif ${quoteNo(x) || ''} verildi`, sub: [x.preparedBy, x.items?.length ? `${x.items.length} kalem` : '', x.notes].filter(Boolean).join(' · '), amount: tl(quoteTry(x, rates)), quote: x });
      const u = dayOf(x.updatedAt);
      if (x.status === 'onaylandi' || x.status === 'iptal') {
        out.push({ key: `s-${x.id}`, day: u > d ? u : d, kind: x.status === 'onaylandi' ? 'won' : 'lost', title: `Teklif ${quoteNo(x) || ''} ${x.status === 'onaylandi' ? 'onaylandı' : 'iptal edildi'}`, amount: tl(quoteTry(x, rates)), quote: x });
      }
      if (isPending(x) && x.followUpAt) {
        out.push({ key: `f-${x.id}`, day: x.followUpAt, kind: 'call', title: x.followUpAt > today ? 'Arama planlandı' : 'Arama günü', sub: `${x.quoteNumber || ''}${x.lostReason ? ` · ${x.lostReason}` : ''}`, quote: x });
      }
    });
    if (showCollections) collections.forEach(c => out.push({ key: `c-${c.id}`, day: c.date, kind: 'col', title: `Tahsilat · ${c.method || '—'}`, sub: [c.checkNo ? `No ${c.checkNo}` : '', c.dueDate ? `vade ${day(c.dueDate)}` : '', c.description].filter(Boolean).join(' · '), amount: money(c.amount, c.currency) }));
    if (customer.lastVisit) out.push({ key: 'visit', day: customer.lastVisit, kind: 'visit', title: 'Uğrandı (ziyaret)' });
    const rank: Record<Ev['kind'], number> = { call: 0, col: 1, won: 2, lost: 2, visit: 3, quote: 4 };
    return out.sort((a, b) => b.day.localeCompare(a.day) || rank[a.kind] - rank[b.kind]);
  }, [quotes, collections, showCollections, customer.lastVisit, rates]);
  const EV_STYLE: Record<Ev['kind'], string> = {
    quote: 'bg-sky-500', won: 'bg-emerald-500', lost: 'bg-slate-400', call: 'bg-amber-500', col: 'bg-teal-600', visit: 'bg-indigo-500',
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#F1F6FC] w-full sm:max-w-4xl sm:rounded-3xl shadow-2xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden">
        {/* Başlık */}
        <div className="px-4 sm:px-6 py-4 bg-gradient-to-br from-[#173F73] to-[#204D84] text-white flex items-center gap-3 pt-safe-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-sky-200/80 font-bold uppercase tracking-wide">Cari hesap</div>
            <h3 className="font-black text-lg sm:text-[22px] tracking-tight leading-tight break-words">
              {customer.name}
              {abc && <span title={ABC_STYLE[abc].hint} className={`ml-2 inline-block align-middle whitespace-nowrap text-[11px] leading-tight px-1.5 py-0.5 rounded-md font-black border ${ABC_STYLE[abc].cls}`}>{abc} müşteri</span>}
              {cStatus !== 'aktif' && <span className={`ml-2 align-middle text-[11px] px-2 py-0.5 rounded-full font-bold border ${CUSTOMER_STATUS[cStatus].cls}`}>{CUSTOMER_STATUS[cStatus].label}</span>}
            </h3>
            <p className="text-xs text-sky-200/80 flex items-center gap-1"><MapPin className="w-3 h-3" />{customer.city || '—'}</p>
            {customer.updatedAt && <p className="text-[11px] text-sky-200/70 mt-0.5">Son değişiklik: {customer.updatedBy && <b className="font-semibold text-sky-100">{customer.updatedBy}</b>}{customer.updatedBy ? ' · ' : ''}{new Date(customer.updatedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
          </div>
          {onSaveCollection && (
            <button onClick={() => setAddingCol(true)} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold">
              <Wallet className="w-4 h-4" /> Tahsilat ekle
            </button>
          )}
          <WhatsAppMenu
            phone={customer.phone || allQuotes.find(x => x.customerPhone)?.customerPhone}
            ctx={{ name: customer.name, contact: customer.contactPerson, quote: allQuotes.find(x => isPendingQuote(x)) || allQuotes[0], quoteValue: (() => { const x = allQuotes.find(y => isPendingQuote(y)) || allQuotes[0]; return x ? quoteTry(x, rates) : undefined; })(), balance: showCollections ? balance?.estimate : undefined, balanceDate: balance ? new Date().toISOString() : undefined }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold"
          />
          <button onClick={onNewQuote} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold">
            <FilePlus2 className="w-4 h-4" /> Yeni teklif
          </button>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white shrink-0" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-3 sm:p-5 space-y-3 overflow-y-auto flex-1">
          {balance && showCollections && (
            <section className="bg-white rounded-3xl border border-white shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)] p-3.5 sm:p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Cari bakiye (tahmini güncel)</div>
                <div className={`text-2xl font-black tabular-nums ${balance.estimate < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{tl(balance.estimate)}</div>
                <div className="text-[11px] text-slate-500">{balance.estimate < 0 ? 'Firma alacaklı (fazla ödeme/avans)' : balance.estimate > 0 ? 'Firmanın borcu' : 'Bakiye yok'}</div>
              </div>
              <div className="text-xs text-slate-600 leading-relaxed">
                Mikro bakiyesi <b className="tabular-nums">{tl(balance.balance)}</b> ({day(balance.date)} itibarıyla)
                {balance.collectedAfter > 0 && <><br />Sonrasında girilen tahsilat <b className="tabular-nums">−{tl(balance.collectedAfter)}</b></>}
              </div>
            </section>
          )}
          <CustomerInsights ev={ev} collections={showCollections ? allCollections : undefined} balance={showCollections ? balance?.estimate : undefined} status={cStatus} statusNote={customer.statusNote} onSetStatus={onSetStatus} onOpenQuote={onOpenQuote} />
          {/* Tarih filtresi */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[{ k: 'all', label: 'Tümü', on: () => setRange({ key: 'all', from: '', to: '' }) },
              { k: 'month', label: 'Bu ay', on: pickMonth },
              ...years.map(y => ({ k: y, label: y, on: () => pickYear(y) }))].map(o => (
              <button key={o.k} onClick={() => { o.on(); setLimit(60); }}
                className={`px-3 py-1.5 rounded-full border text-xs font-bold ${range.key === o.k ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{o.label}</button>
            ))}
            <span className="inline-flex items-center gap-1 text-xs">
              <DateInput value={range.key === 'custom' ? range.from : ''} onChange={v => setRange(r => ({ key: 'custom', from: v, to: r.key === 'custom' ? r.to : '' }))}
                className={`w-32 px-2 py-1 rounded-lg border text-xs ${range.key === 'custom' ? 'border-brand-400' : 'border-slate-200'} bg-white`} title="Başlangıç tarihi" />
              <span className="text-slate-500">–</span>
              <DateInput value={range.key === 'custom' ? range.to : ''} onChange={v => setRange(r => ({ key: 'custom', from: r.key === 'custom' ? r.from : '', to: v }))}
                className={`w-32 px-2 py-1 rounded-lg border text-xs ${range.key === 'custom' ? 'border-brand-400' : 'border-slate-200'} bg-white`} title="Bitiş tarihi" />
            </span>
          </div>

          {/* Özet */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {tile('Onaylanan', `${approved.length} teklif`, tl(sumTry(approved)), 'bg-emerald-50 border-emerald-200 text-emerald-800', () => { setTab('quotes'); setQFilter('approved'); })}
            {tile('Bekleyen', `${pending.length} teklif`, tl(sumTry(pending)), 'bg-purple-50 border-purple-200 text-purple-800', () => { setTab('quotes'); setQFilter('pending'); })}
            {showCollections
              ? tile('Tahsilat', tl(colTry), `${collections.length} kayıt · ${rangeLabel}`, 'bg-white border-slate-200 text-slate-800', () => setTab('collections'))
              : tile('Toplam teklif', `${quotes.length}`, `${cancelled.length} iptal/arşiv`, 'bg-white border-slate-200 text-slate-800')}
            {tile('Son alım', lastBuy ? day(lastBuy) : '—', quotes[0] ? `son teklif ${day(quotes[0].createdAt)}` : 'teklif yok', 'bg-white border-slate-200 text-slate-800')}
          </div>

          {/* Sekmeler + arama */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex gap-1 p-1 rounded-xl bg-slate-200/70 w-full sm:w-fit max-w-full overflow-x-auto no-scrollbar">
              {tabBtn('quotes', `Teklifler · ${quotes.length}`)}
              {tabBtn('timeline', 'Akış')}
              {tabBtn('items', `Malzemeler · ${lines.length}`)}
              {showCollections && tabBtn('collections', `Tahsilatlar · ${collections.length}`)}
            </div>
            <div className="relative flex-1 min-w-0" hidden={tab === 'timeline'}>
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={e => { setQ(e.target.value); setLimit(60); }}
                placeholder={tab === 'items' ? 'Malzeme ara (ör. küresel vana 1")…' : tab === 'quotes' ? 'Teklif no, not ya da malzeme ara…' : 'Tahsilat ara…'}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-brand-400" />
            </div>
          </div>

          {tab === 'timeline' && (
            <div className="bg-white rounded-xl border border-slate-200 px-3 py-3">
              {events.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Bu firma için kayıt yok.</p>}
              <ol className="relative ml-2 border-l-2 border-slate-100">
                {events.slice(0, limit).map((e, i) => {
                  const newDay = i === 0 || events[i - 1].day !== e.day;
                  const clickable = !!(e.quote && onOpenQuote);
                  return (
                    <li key={e.key} className="relative pl-5 pb-3">
                      <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full ring-4 ring-white ${EV_STYLE[e.kind]}`} />
                      {newDay && <div className="text-[11px] font-bold text-slate-500 tabular-nums mb-0.5">{day(e.day)}{e.day > dayOf(new Date().toISOString()) ? ' · planlı' : ''}</div>}
                      <button type="button" disabled={!clickable} onClick={() => e.quote && open(e.quote)}
                        className={`w-full flex items-start justify-between gap-3 text-left rounded-lg ${clickable ? 'hover:bg-slate-50 -mx-1 px-1' : 'cursor-default'}`}>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-slate-800">{e.title}</span>
                          {e.sub && <span className="block text-[11px] text-slate-500 truncate">{e.sub}</span>}
                        </span>
                        {e.amount && <span className="text-sm font-black text-slate-900 tabular-nums whitespace-nowrap">{e.amount}</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {tab === 'quotes' && (
            <>
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                {chip('all', 'Tümü', quotes.length)}
                {chip('approved', 'Onaylanan', approved.length)}
                {chip('pending', 'Bekleyen', pending.length)}
                {chip('cancelled', 'İptal/Arşiv', cancelled.length)}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {shownQuotes.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Teklif yok.</p>}
                {shownQuotes.slice(0, limit).map(x => (
                  <button key={x.id} onClick={() => open(x)} disabled={!onOpenQuote}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="tabular-nums font-black text-sm text-brand-700 underline decoration-brand-200 underline-offset-2">{quoteNo(x) || '—'}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${STATUS_LABEL[viewStatus(x)].cls}`}>{STATUS_LABEL[viewStatus(x)].label}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {day(x.createdAt)}{x.preparedBy ? ` · ${x.preparedBy}` : ''}{x.items?.length ? ` · ${x.items.length} kalem` : ''}{x.notes ? ` · ${x.notes}` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-slate-900 tabular-nums whitespace-nowrap">{tl(quoteTry(x, rates))}</div>
                      {x.currency !== 'TRY' && <div className="text-[11px] text-slate-500 whitespace-nowrap">{formatQuoteAmount(x)}</div>}
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
                  {shownLines.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Eşleşen malzeme yok.</p>}
                  {shownLines.slice(0, limit).map(l => (
                    <button key={l.key} onClick={() => open(l.quote)} disabled={!onOpenQuote}
                      className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                      <div className="w-[4.5rem] shrink-0 text-[11px] font-bold text-slate-500 tabular-nums pt-0.5">{day(l.quote.createdAt)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-900 leading-snug break-words">{l.it.productName}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {l.it.code ? `${l.it.code} · ` : ''}<span className="tabular-nums">{quoteNo(l.quote)}</span>
                          {!isApproved(l.quote) && ` · ${STATUS_LABEL[viewStatus(l.quote)].label}`}
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
                <p className="text-[11px] text-slate-500 px-1">{quotes.length} tekliften {quotesWithItems} tanesinde kalem bilgisi var (Excel'den gelenlerde sadece toplam tutar bulunuyor).</p>
              )}
            </>
          )}

          {tab === 'collections' && showCollections && (
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {shownCols.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Tahsilat yok.</p>}
              {colGroups.slice(0, limit).map(g => {
                const c = g.items[0];
                const many = g.items.length > 1;
                const open = openCols.has(g.key);
                const total = g.items.reduce((t, x) => t + x.amount, 0);
                const dues = g.items.map(x => x.dueDate).filter(Boolean).sort() as string[];
                const line = (x: Collection) => (
                  <div key={x.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="w-[4.5rem] shrink-0" />
                    <div className="min-w-0 flex-1 text-[11px] text-slate-500 truncate">
                      {[x.method, x.dueDate && `vade ${day(x.dueDate)}`, x.bankName, x.checkNo, x.description].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap">{money(x.amount, x.currency)}</div>
                  </div>
                );
                return (
                  <div key={g.key} className={open ? 'bg-slate-50/70' : ''}>
                    <button type="button" disabled={!many} onClick={() => toggleCol(g.key)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 disabled:cursor-default">
                      <div className="w-[4.5rem] shrink-0 text-[11px] font-bold text-slate-500 tabular-nums">{day(c.date)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-900">
                          {many ? [...new Set(g.items.map(x => x.method))].join(', ') : c.method}
                          {many && <span className="ml-2 text-[11px] font-bold text-brand-700">{g.items.length} parça {open ? '▲' : '▼'}</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {many
                            ? [dues.length && `vade ${day(dues[0])}${dues.length > 1 ? ` – ${day(dues[dues.length - 1])}` : ''}`, [...new Set(g.items.map(x => x.bankName).filter(Boolean))].join(', ')].filter(Boolean).join(' · ') || '—'
                            : [c.dueDate && `vade ${day(c.dueDate)}`, c.bankName, c.checkNo, c.description].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                      <div className="text-sm font-black text-slate-900 tabular-nums whitespace-nowrap">{money(total, c.currency)}</div>
                    </button>
                    {many && open && <div className="border-t border-dashed border-slate-200 divide-y divide-slate-100">{g.items.map(line)}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {((tab === 'timeline' && events.length > limit) || (tab === 'quotes' && shownQuotes.length > limit) || (tab === 'items' && shownLines.length > limit) || (tab === 'collections' && colGroups.length > limit)) && (
            <button onClick={() => setLimit(l => l + 60)} className="w-full py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-brand-700">Daha fazla göster</button>
          )}

          {onSaveCollection && (
            <button onClick={() => setAddingCol(true)} className="sm:hidden w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-brand-200 text-brand-700 text-sm font-bold">
              <Wallet className="w-4 h-4" /> Bu firmaya tahsilat ekle
            </button>
          )}
          <button onClick={onNewQuote} className="sm:hidden w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold">
            <FilePlus2 className="w-4 h-4" /> Bu firmaya yeni teklif
          </button>
        </div>
      </div>
      {addingCol && onSaveCollection && (
        <CollectionQuickForm
          customerName={customer.name}
          city={customer.city}
          records={allCollectionRecords}
          customers={customers}
          currentRole={currentRole}
          onCancel={() => setAddingCol(false)}
          onSave={c => { onSaveCollection(c); setAddingCol(false); setTab('collections'); }}
        />
      )}
    </div>
  );
};
