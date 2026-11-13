import { trNum, trMoney } from '../lib/num';
import React, { useMemo, useState } from 'react';
import { dayOf } from '../lib/dates';
import { Building2, CalendarDays, ChevronRight, CircleCheck, Clock3, Database, FilePlus2, FileText, Footprints, Hash, History, IdCard, Mail, MapPin, Pencil, Phone, Search, StickyNote, User, Wallet, X } from 'lucide-react';
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
const tl = (n: number) => `${trMoney(n)} TL`;
const day = (s: string) => (s ? new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const curSym = (c?: string) => (c === 'USD' ? '$' : c === 'EUR' ? '€' : 'TL');
const money = (v: number, c?: string) => `${trNum(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curSym(c)}`;
const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

type Tab = 'info' | 'summary' | 'timeline' | 'quotes' | 'items' | 'collections';
const CARD = 'bg-white rounded-3xl border border-white shadow-[0_14px_34px_-24px_rgba(15,60,120,0.55)]';
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
  /** Müşteri bilgilerini düzenle (yetki varsa) */
  onEdit?: () => void;
}> = ({ abc, onEdit, customer, quotes: allQuotes, collections: allCollections, rates, showCollections, onClose, onOpenQuote, onNewQuote, onSaveCollection, allCollectionRecords = [], customers = [], currentRole = 'isparta', maxWon = 0, onSetStatus, balance }) => {
  const ev = useMemo(() => evaluate(allQuotes, allCollections, rates, maxWon), [allQuotes, allCollections, rates, maxWon]);
  const cStatus = statusOf(customer);
  const [addingCol, setAddingCol] = useState(false);
  const [tab, setTab] = useState<Tab>('info');
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

  const tabBtn = (t: Tab, label: string, n?: number) => (
    <button key={t} onClick={() => { setTab(t); setLimit(60); }}
      className={`relative shrink-0 px-3 sm:px-4 pt-3 pb-2.5 text-[13px] sm:text-sm font-extrabold whitespace-nowrap transition-colors ${tab === t ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'}`}>
      {label}{n != null && <span className="ml-1 tabular-nums font-bold opacity-80">({n})</span>}
      {tab === t && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-full bg-brand-600" />}
    </button>
  );
  const stat = (Icon: React.ElementType, label: string, value: string, sub: string, ring: string, val: string, onClick?: () => void) => (
    <button type="button" onClick={onClick}
      className={`${CARD} w-full h-full text-left flex items-center gap-3 p-3 sm:p-3.5 min-w-0 ${onClick ? 'hover:-translate-y-0.5 transition-transform' : 'cursor-default'}`}>
      <span className={`w-10 h-10 xl:w-11 xl:h-11 rounded-full flex items-center justify-center shrink-0 ${ring}`}><Icon className="w-5 h-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] sm:text-xs font-bold text-slate-500 truncate">{label}</span>
        <span className={`block font-black tabular-nums truncate ${value.length > 11 ? 'text-[15px] lg:text-base' : 'text-base sm:text-lg'} ${val}`}>{value}</span>
        <span className="block text-[11px] text-slate-500 tabular-nums truncate">{sub}</span>
      </span>
    </button>
  );
  const infoRow = (Icon: React.ElementType, label: string, value?: React.ReactNode) => (
    <div className="flex items-center gap-3 py-2.5 border-t border-slate-100 first:border-t-0">
      <Icon className="w-4 h-4 text-slate-500 shrink-0" />
      <span className="w-28 sm:w-32 shrink-0 text-[13px] text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-[13px] sm:text-sm font-semibold text-slate-900 break-words">{value || '—'}</span>
    </div>
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

  const phone = customer.phone || allQuotes.find(x => x.customerPhone)?.customerPhone;
  const lastQuote = allQuotes[0]?.createdAt;
  const hdrBtn = 'inline-flex items-center justify-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold';
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${customer.name} ${customer.city || ''}`)}`;

  const actions = (<>
            <WhatsAppMenu
              phone={phone}
              ctx={{ name: customer.name, contact: customer.contactPerson, quote: allQuotes.find(x => isPendingQuote(x)) || allQuotes[0], quoteValue: (() => { const x = allQuotes.find(y => isPendingQuote(y)) || allQuotes[0]; return x ? quoteTry(x, rates) : undefined; })(), balance: showCollections ? balance?.estimate : undefined, balanceDate: balance ? new Date().toISOString() : undefined }}
              className={hdrBtn}
            />
            <button onClick={onNewQuote} className={`${hdrBtn} !bg-white !text-[#0b2a4c] !border-white hover:!bg-sky-50`}><FilePlus2 className="w-4 h-4" /> Yeni teklif</button>
            {onSaveCollection && <button onClick={() => setAddingCol(true)} className={hdrBtn}><Wallet className="w-4 h-4" /> Tahsilat ekle</button>}
            {onEdit && <button onClick={onEdit} className={hdrBtn}><Pencil className="w-4 h-4" /> Düzenle</button>}
  </>);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#F1F6FC] w-full sm:max-w-6xl sm:rounded-3xl shadow-2xl h-full sm:h-auto sm:max-h-[94vh] flex flex-col overflow-hidden">
        {/* Başlık: firma simgesi, ad, durum, işlemler */}
        <div className="px-4 sm:px-6 py-4 bg-gradient-to-br from-[#0b2a4c] to-[#15457a] text-white pt-safe-4">
          <div className="flex items-start sm:items-center gap-3">
            <span className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 sm:w-7 sm:h-7 text-sky-100" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-sky-200/80 font-bold uppercase tracking-wide">Müşteri kartı</div>
              <h3 className="font-black text-lg sm:text-2xl tracking-tight leading-tight break-words">
                {customer.name}
                <span className={`ml-2 align-middle inline-block whitespace-nowrap text-[11px] leading-tight px-2 py-0.5 rounded-full font-bold border ${cStatus === 'aktif' ? 'bg-emerald-400/15 border-emerald-300/50 text-emerald-200' : CUSTOMER_STATUS[cStatus].cls}`}>{CUSTOMER_STATUS[cStatus].label}</span>
                {abc && <span title={ABC_STYLE[abc].hint} className={`ml-1.5 inline-block align-middle whitespace-nowrap text-[11px] leading-tight px-1.5 py-0.5 rounded-md font-black border ${ABC_STYLE[abc].cls}`}>{abc} müşteri</span>}
              </h3>
              <p className="text-xs sm:text-sm text-sky-200/90 flex items-center gap-1 mt-0.5"><MapPin className="w-3.5 h-3.5" />{customer.city || '—'}{customer.contactPerson ? ` · ${customer.contactPerson}` : ''}</p>
            </div>
          <div className="hidden lg:flex flex-wrap gap-2 justify-end">{actions}</div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white shrink-0" aria-label="Kapat"><X className="w-5 h-5" /></button>
          </div>
          <div className="lg:hidden mt-3 flex flex-wrap gap-2">{actions}</div>
        </div>

        <div className="p-3 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
          {/* Özet rakamlar */}
          <div className="grid grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_1fr] gap-2 sm:gap-3">
            {stat(FileText, 'Toplam teklif', trNum(allQuotes.length), `${allQuotes.filter(x => x.status === 'iptal').length} iptal/arşiv`, 'bg-sky-50 text-sky-700', 'text-slate-900', () => { setTab('quotes'); setQFilter('all'); })}
            {stat(CircleCheck, 'Onaylanan', trNum(allQuotes.filter(isApproved).length), tl(sumTry(allQuotes.filter(isApproved))), 'bg-emerald-50 text-emerald-600', 'text-slate-900', () => { setTab('quotes'); setQFilter('approved'); })}
            <div className="hidden sm:block">{stat(Clock3, 'Beklemede', trNum(allQuotes.filter(isPending).length), tl(sumTry(allQuotes.filter(isPending))), 'bg-amber-50 text-amber-600', 'text-slate-900', () => { setTab('quotes'); setQFilter('pending'); })}</div>
            <div className="max-sm:col-span-2">{showCollections && balance
              ? stat(Database, 'Cari bakiye', tl(balance.estimate), balance.estimate < 0 ? 'firma alacaklı' : balance.estimate > 0 ? 'firmanın borcu' : 'bakiye yok', 'bg-rose-50 text-rose-600', balance.estimate < 0 ? 'text-rose-600' : 'text-slate-900', () => setTab('info'))
              : showCollections
                ? stat(Wallet, 'Tahsilat', tl(allCollections.filter(c => c.currency === 'TRY').reduce((t, c) => t + c.amount, 0)), `${allCollections.length} kayıt`, 'bg-teal-50 text-teal-600', 'text-slate-900', () => setTab('collections'))
                : stat(Wallet, 'Son alım', lastBuy ? day(lastBuy) : '—', 'son onaylanan teklif', 'bg-teal-50 text-teal-600', 'text-slate-900')}</div>
            <div className="col-span-2 lg:col-span-1">{stat(CalendarDays, 'Son teklif', lastQuote ? day(lastQuote) : '—', ev.lastQuoteDays != null ? (ev.lastQuoteDays === 0 ? 'bugün' : `${ev.lastQuoteDays} gün önce`) : 'teklif yok', 'bg-indigo-50 text-indigo-600', 'text-slate-900')}</div>
          </div>

          <section className={`${CARD} overflow-hidden`}>
            {/* Sekmeler */}
            <div className="flex px-2 sm:px-3 border-b border-slate-200 overflow-x-auto no-scrollbar">
              {tabBtn('info', 'Genel bilgiler')}
              {tabBtn('summary', 'Firma özeti')}
              {tabBtn('quotes', 'Teklifler', quotes.length)}
              {tabBtn('items', 'Malzemeler', lines.length)}
              {showCollections && tabBtn('collections', 'Tahsilatlar', collections.length)}
              {tabBtn('timeline', 'Akış')}
            </div>

            <div className="p-3 sm:p-4 space-y-3">
          {tab === 'info' && (
            <div className="grid lg:grid-cols-2 gap-3">
              <div className={`${CARD} p-3.5 sm:p-4`}>
                <div className="flex items-center gap-2 mb-1">
                  <IdCard className="w-5 h-5 text-brand-700" />
                  <span className="font-black text-slate-900 flex-1">Müşteri bilgileri</span>
                  {onEdit && <button onClick={onEdit} title="Düzenle" aria-label="Düzenle" className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center hover:bg-brand-100"><Pencil className="w-4 h-4" /></button>}
                </div>
                {infoRow(Building2, 'Firma adı', customer.name)}
                {infoRow(MapPin, 'Şehir', customer.city)}
                {infoRow(User, 'Yetkili', customer.contactPerson)}
                {infoRow(Phone, 'Telefon', phone && <a href={`tel:${phone}`} className="text-brand-700 hover:underline">{phone}</a>)}
                {infoRow(Mail, 'E-posta', customer.email && <a href={`mailto:${customer.email}`} className="text-brand-700 hover:underline break-all">{customer.email}</a>)}
                {customer.mikroCode && infoRow(Hash, 'Mikro cari kodu', customer.mikroCode)}
                {infoRow(Footprints, 'Son uğrama', customer.lastVisit ? day(customer.lastVisit) : 'uğranmadı')}
                {customer.updatedAt && infoRow(History, 'Son değişiklik', <>{customer.updatedBy ? `${customer.updatedBy} · ` : ''}{new Date(customer.updatedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>)}
              </div>
              <div className="space-y-3">
                <div className={`${CARD} p-3.5 sm:p-4`}>
                  <div className="flex items-center gap-2 mb-2">
                    <StickyNote className="w-5 h-5 text-brand-700" />
                    <span className="font-black text-slate-900 flex-1">Açıklama / not</span>
                    {onEdit && <button onClick={onEdit} title="Düzenle" aria-label="Düzenle" className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center hover:bg-brand-100"><Pencil className="w-4 h-4" /></button>}
                  </div>
                  <p className="min-h-[4.5rem] rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700 whitespace-pre-line">
                    {customer.notes || customer.statusNote || <span className="text-slate-500">Not yok.</span>}
                  </p>
                </div>
                {balance && showCollections && (
                  <div className={`${CARD} p-3.5 sm:p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Database className="w-5 h-5 text-brand-700" />
                      <span className="font-black text-slate-900 flex-1">Cari bakiye</span>
                      <span className={`text-lg font-black tabular-nums ${balance.estimate < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{tl(balance.estimate)}</span>
                    </div>
                    <div className="text-xs text-slate-600 leading-relaxed">
                      Mikro bakiyesi <b className="tabular-nums">{tl(balance.balance)}</b> ({day(balance.date)} itibarıyla)
                      {balance.collectedAfter > 0 && <><br />Sonrasında girilen tahsilat <b className="tabular-nums">−{tl(balance.collectedAfter)}</b></>}
                      <br />{balance.estimate < 0 ? 'Firma alacaklı (fazla ödeme/avans)' : balance.estimate > 0 ? 'Firmanın borcu' : 'Bakiye yok'}
                    </div>
                  </div>
                )}
                <div className={`${CARD} p-3.5 sm:p-4 flex items-center gap-3`}>
                  <MapPin className="w-5 h-5 text-brand-700 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-slate-900">Konum</div>
                    <div className="text-sm text-slate-600 truncate">{customer.city || 'Şehir girilmemiş'}</div>
                  </div>
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-50 text-brand-700 text-sm font-bold hover:bg-brand-100"><MapPin className="w-4 h-4" /> Haritada gör</a>
                </div>
              </div>
            </div>
          )}

          {tab === 'summary' && <CustomerInsights ev={ev} collections={showCollections ? allCollections : undefined} balance={showCollections ? balance?.estimate : undefined} status={cStatus} statusNote={customer.statusNote} onSetStatus={onSetStatus} onOpenQuote={onOpenQuote} />}

          {tab !== 'info' && tab !== 'summary' && (
            <div className="flex flex-col lg:flex-row lg:items-center gap-2">
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
              <div className="relative flex-1 min-w-0" hidden={tab === 'timeline'}>
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={q} onChange={e => { setQ(e.target.value); setLimit(60); }}
                  placeholder={tab === 'items' ? 'Malzeme ara (ör. küresel vana 1")…' : tab === 'quotes' ? 'Teklif no, not ya da malzeme ara…' : 'Tahsilat ara…'}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-brand-400" />
              </div>
            </div>
          )}
          {tab === 'collections' && showCollections && <p className="text-xs text-slate-500">{rangeLabel}: <b className="text-slate-800 tabular-nums">{tl(colTry)}</b> · {collections.length} kayıt</p>}

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

            </div>
          </section>
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
