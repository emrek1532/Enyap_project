import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { dayOf } from '../lib/dates';
import { Printer, Share2, Trash2, Pencil, Eye, MoreHorizontal, Check, FileText, Filter, CalendarDays } from 'lucide-react';
import { listCard, ctrl, rowCls, SearchBox, UnderlineTabs, StatusPill, IconBtn, Pager, FilterBar, WideOnly, NarrowOnly } from './ListUI';
import { Quote, QuoteStatus, UserRole } from '../types';
import { needsFollowUp, quoteAgeInDays, PENDING_STATUSES } from '../lib/quoteRules';
import { SortHeader, SortState, nextSort, compareText, SortDir, MobileSortSelect } from './SortHeader';
import { formatQuoteAmount, itemCurrency, CURRENCY_LABEL } from '../lib/money';
import { formatTl, quoteTry, useRates } from '../lib/rates';
import { usePriceChanges } from '../lib/priceWatch';
import { textMatcher } from '../lib/materials';
import { PENDING_REASONS, splitReason } from '../lib/quoteRules';
import { DateInput } from './DateInput';

const LIST_PAGE = 25;

const fold = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');


type QuoteSortKey = 'number' | 'customer' | 'amount' | 'status' | 'date' | 'added';

/** Sisteme eklenme sırası: kimlikteki zaman damgası (qt-1791…); Excel'den aktarılanlar (imp-0001…) en eskiler */
const addedKey = (q: Quote) => {
  const ts = /(\d{13})/.exec(q.id)?.[1];
  if (ts) return Number(ts);
  const imp = /^imp-(\d+)/.exec(q.id)?.[1];
  return imp ? Number(imp) : 0;
};
const SORT_KEY = 'enyap-quote-sort';
/** Durum sırası: Beklemede → Onaylandı → İptal */
const STATUS_RANK: Record<string, number> = { gonderildi: 0, onaylandi: 1, iptal: 2 };

interface QuoteManagerProps {
  quotes: Quote[];
  currentRole: UserRole;
  onOpenNewQuote: () => void;
  onUpdateQuoteStatus: (id: string, status: QuoteStatus, lostReason?: string) => void;
  onDeleteQuote: (id: string) => void;
  onPrintQuote: (quote: Quote) => void;
  onEditQuote: (quote: Quote) => void;
  /** Sadece görüntüleme yetkisi: onay/düzenle/sil düğmeleri gizlenir */
  readOnly?: boolean;
  statusFilter: string;
  onStatusFilterChange: (filter: string) => void;
  /** Bu teklifin detayını aç (ör. kaydedildikten hemen sonra) */
  focusQuote?: { id: string; n: number } | null;
  /** Açılışta tarih aralığı (ör. ana sayfada "bu ay onaylanan"a dokununca) */
  initialRange?: { from?: string; to?: string } | null;
}

export const QuoteManager: React.FC<QuoteManagerProps> = ({
  quotes,
  currentRole,
  onOpenNewQuote,
  onUpdateQuoteStatus,
  onDeleteQuote,
  onPrintQuote,
  onEditQuote,
  readOnly = false,
  statusFilter,
  onStatusFilterChange: setStatusFilter,
  focusQuote,
  initialRange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [cityFilter, setCityFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(initialRange?.from || '');
  const [dateTo, setDateTo] = useState(initialRange?.to || '');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [reasonNote, setReasonNote] = useState('');
  useEffect(() => setReasonNote(splitReason(selectedQuote?.lostReason).note), [selectedQuote?.id]);
  useEffect(() => {
    const q = focusQuote && quotes.find(x => x.id === focusQuote.id);
    if (q) setSelectedQuote(q);
  }, [focusQuote]); // eslint-disable-line react-hooks/exhaustive-deps
  // Müşteri kartı: o müşteriye verilen tüm teklifler
  const [customerView, setCustomerView] = useState<string | null>(null);
  // Tutarlar KDV dahil TL karşılığı (döviz TCMB kuruyla çevrilir)
  const rates = useRates(quotes);
  const priceChanges = usePriceChanges(quotes);
  const priceBadge = (id: string) => {
    const ch = priceChanges.get(id);
    if (!ch) return null;
    const avg = Math.round((ch.reduce((a, c) => a + c.pct, 0) / ch.length) * 100);
    return <span title={`${ch.length} kalemin katalog fiyatı değişti`} className="text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap bg-rose-50 text-rose-700 border-rose-200">Fiyat değişti {avg > 0 ? '+' : ''}%{avg}</span>;
  };
  const netTry = useMemo(() => {
    const m = new Map<string, number>();
    quotes.forEach(q => m.set(q.id, quoteTry(q, rates)));
    return m;
  }, [quotes, rates]);
  // Sütun başlığına tıklayarak sıralama (varsayılan: tarih, yeniden eskiye)
  // Varsayılan: son eklenen en üstte (teklif tarihi eski olsa bile); seçilen sıralama hatırlanır
  const [sort, setSortState] = useState<SortState<QuoteSortKey>>(() => {
    try { const v = JSON.parse(localStorage.getItem(SORT_KEY) || 'null'); if (v?.key && v?.dir) return v; } catch { /* */ }
    return { key: 'added', dir: 'desc' };
  });
  const setSort = (u: SortState<QuoteSortKey> | ((s: SortState<QuoteSortKey>) => SortState<QuoteSortKey>)) =>
    setSortState(prev => {
      const next = typeof u === 'function' ? u(prev) : u;
      try { localStorage.setItem(SORT_KEY, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  const sortBy = (key: QuoteSortKey, firstDir: SortDir) => { setSort(s => nextSort(s, key, firstDir)); setPage(0); };

  // Filtered quotes (newest first). Memoized: there can be thousands of quotes.
  // Arama dizini: her teklifin aranacak yazıları bir kez sadeleştirilir (her tuşta yeniden değil)
  const searchIndex = useMemo(() => new Map(quotes.map(qt => {
    const items = (qt.items || []).map(it => `${it.productName} ${it.code || ''}`);
    return [qt.id, { head: fold(`${qt.customerName}\n${qt.quoteNumber}\n${qt.city || ''}\n${qt.notes || ''}`), items, itemsF: items.map(fold) }];
  })), [quotes]);
  // Yazarken liste bir adım geriden gelir: kutu takılmaz
  const deferredSearch = useDeferredValue(searchTerm);
  const filteredQuotes = useMemo(() => {
    const q = fold(deferredSearch.trim());
    const itemMatch = q ? textMatcher(deferredSearch) : null;
    return quotes
      .filter((quote) => {
        const ix = searchIndex.get(quote.id);
        const matchesSearch =
          !q || !ix ||
          ix.head.includes(q) ||
          ix.itemsF.some((t, i) => t.includes(q) || !!itemMatch?.(ix.items[i]));

        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'aktif'
            ? PENDING_STATUSES.includes(quote.status)
            : statusFilter === 'takip'
              ? needsFollowUp(quote)
              : quote.status === statusFilter);
        const matchesCity = cityFilter === 'all' || quote.city === cityFilter;
        const day = dayOf(quote.createdAt);
        const matchesDate = (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);

        return matchesSearch && matchesStatus && matchesCity && matchesDate;
      })
      .sort((a, b) => {
        let r = 0;
        switch (sort.key) {
          case 'number': r = compareText(a.quoteNumber, b.quoteNumber); break;
          case 'customer': r = compareText(a.customerName, b.customerName) || compareText(a.city, b.city); break;
          case 'amount': r = (netTry.get(a.id) || 0) - (netTry.get(b.id) || 0); break;
          case 'added': r = addedKey(a) - addedKey(b); break;
          case 'status': r = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9); break;
          default: r = (a.createdAt || '').localeCompare(b.createdAt || '');
        }
        // Eşitlikte yeni teklif üstte
        return (sort.dir === 'asc' ? r : -r) || (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, searchIndex, deferredSearch, statusFilter, cityFilter, dateFrom, dateTo, sort, netTry]);

  const cities = useMemo(
    () => [...new Set(quotes.map((q) => q.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [quotes]
  );
  const followUpCount = useMemo(() => quotes.filter(needsFollowUp).length, [quotes]);
  // Hızlı tarih aralıkları: [etiket, başlangıç, bitiş]
  const datePresets = useMemo((): [string, string, string][] => {
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const d = new Date();
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const lastMon = new Date(mon); lastMon.setDate(mon.getDate() - 7);
    const lastSun = new Date(mon); lastSun.setDate(mon.getDate() - 1);
    return [
      ['Bugün', iso(d), iso(d)],
      ['Bu hafta', iso(mon), iso(d)],
      ['Geçen hafta', iso(lastMon), iso(lastSun)],
      ['Bu ay', iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)],
      ['Geçen ay', iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))],
      ['Bu yıl', iso(new Date(d.getFullYear(), 0, 1)), iso(d)],
    ];
  }, []);
  const hasExtraFilters = cityFilter !== 'all' || !!dateFrom || !!dateTo || !!searchTerm;
  const resetFilters = () => {
    setSearchTerm(''); setStatusFilter('all');
    setCityFilter('all'); setDateFrom(''); setDateTo(''); setPage(0);
  };

  const getStatusBadge = (status: QuoteStatus) => {
    switch (status) {
      case 'gonderildi':
        return { label: 'Beklemede', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'onaylandi':
        return { label: 'Onaylandı', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'iptal':
        return { label: 'İptal', color: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const pageRows = filteredQuotes.slice(page * LIST_PAGE, (page + 1) * LIST_PAGE);
  const allOnPage = pageRows.length > 0 && pageRows.every(q => selected.has(q.id));
  const toggleSel = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(s => { const n = new Set(s); pageRows.forEach(q => (allOnPage ? n.delete(q.id) : n.add(q.id))); return n; });
  const approveSelected = () => {
    const ids = quotes.filter(q => selected.has(q.id) && PENDING_STATUSES.includes(q.status)).map(q => q.id);
    if (!ids.length || !confirm(`${ids.length} bekleyen teklif onaylandı olarak işaretlensin mi?`)) return;
    ids.forEach(id => onUpdateQuoteStatus(id, 'onaylandi'));
    setSelected(new Set());
  };
  const activePreset = datePresets.find(([, f, t]) => f === dateFrom && t === dateTo)?.[0] ?? null;
  const filteredSum = filteredQuotes.reduce((t, q) => t + (netTry.get(q.id) || 0), 0);
  const filtering = !!(searchTerm.trim() || statusFilter !== 'all' || cityFilter !== 'all' || dateFrom || dateTo);

  const moreMenu = (quote: Quote) => menuFor === quote.id && (
    <>
      <div className="fixed inset-0 z-30" onClick={e => { e.stopPropagation(); setMenuFor(null); }} />
      <div className="absolute right-0 top-9 z-40 w-48 rounded-xl border border-slate-200 bg-white shadow-lg py-1 text-left text-sm">
        {PENDING_STATUSES.includes(quote.status) && !readOnly && (
          <button onClick={() => { onUpdateQuoteStatus(quote.id, 'onaylandi'); setMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-emerald-50 text-emerald-700 font-semibold"><Check className="w-4 h-4" /> Onayla</button>
        )}
        <button onClick={() => { onPrintQuote(quote); setMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700"><Share2 className="w-4 h-4" /> Gönder / yazdır</button>
        <button onClick={() => { setCustomerView(quote.customerName); setMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700"><FileText className="w-4 h-4" /> Müşterinin teklifleri</button>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <div className={listCard}>
        {/* Filtreler */}
        <FilterBar className="p-3 sm:p-4 flex flex-col xl:flex-row gap-2" active={(statusFilter !== 'all' ? 1 : 0) + (cityFilter !== 'all' ? 1 : 0) + (dateFrom || dateTo ? 1 : 0)}
          search={<SearchBox value={searchTerm} onChange={v => { setSearchTerm(v); setPage(0); }} placeholder="Müşteri adı veya teklif no..." className="flex-1" />}>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap xl:flex-nowrap gap-2">
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} className={ctrl} aria-label="Durum">
              <option value="all">Tüm Teklifler</option>
              <option value="aktif">Beklemede</option>
              <option value="takip">Tekrar Görüşülecek ({followUpCount})</option>
              <option value="onaylandi">Onaylandı</option>
              <option value="iptal">İptal</option>
            </select>
            <select value={cityFilter} onChange={e => { setCityFilter(e.target.value); setPage(0); }} className={ctrl} aria-label="Şehir">
              <option value="all">Tüm Şehirler</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className={`${ctrl} col-span-2 flex items-center gap-1.5 text-slate-500`}>
              <CalendarDays className="w-4 h-4 shrink-0" />
              <DateInput value={dateFrom} onChange={v => { setDateFrom(v); setPage(0); }} className="w-full sm:w-24 bg-transparent text-xs text-slate-700 focus:outline-none" />
              <span>–</span>
              <DateInput value={dateTo} onChange={v => { setDateTo(v); setPage(0); }} className="w-full sm:w-24 bg-transparent text-xs text-slate-700 focus:outline-none" />
            </div>
            <button type="button" onClick={() => setShowMore(v => !v)}
              className={`${ctrl} col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 font-bold ${showMore ? 'border-brand-300 text-brand-700 bg-brand-50' : ''}`}>
              <Filter className="w-4 h-4" /> Sırala
            </button>
          </div>
        </FilterBar>
        {showMore && (
          <div className="px-3 sm:px-4 pb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <MobileSortSelect always sort={sort} onChange={(s) => { setSort(s); setPage(0); }} options={[
              { key: 'added', dir: 'desc', label: 'Son eklenen en üstte' },
              { key: 'date', dir: 'desc', label: 'Tarih: yeniden eskiye' },
              { key: 'date', dir: 'asc', label: 'Tarih: eskiden yeniye' },
              { key: 'customer', dir: 'asc', label: 'Müşteri: A → Z' },
              { key: 'customer', dir: 'desc', label: 'Müşteri: Z → A' },
              { key: 'amount', dir: 'desc', label: 'Tutar: yüksek' },
              { key: 'status', dir: 'asc', label: 'Durum' },
              { key: 'number', dir: 'desc', label: 'Teklif No' },
            ]} />
            {filtering && <span>{filteredQuotes.length} teklif · <b className="text-slate-800 tabular-nums">{formatTl(filteredSum)}</b> KDV dahil</span>}
            {(hasExtraFilters || statusFilter !== 'all') && (
              <button onClick={resetFilters} className="font-bold text-brand-600 hover:underline">Filtreleri temizle</button>
            )}
          </div>
        )}
        {/* Hızlı tarih */}
        <div className="px-3 sm:px-4">
          <UnderlineTabs small value={activePreset} onChange={k => {
            const p = datePresets.find(x => x[0] === k)!;
            if (activePreset === k) { setDateFrom(''); setDateTo(''); } else { setDateFrom(p[1]); setDateTo(p[2]); }
            setPage(0);
          }} items={datePresets.map(([label]) => ({ key: label, label }))} />
        </div>

        {selected.size > 0 && (
          <div className="mx-3 sm:mx-4 mt-3 flex items-center gap-2 rounded-xl bg-brand-50 border border-brand-100 px-3 py-2 text-xs text-brand-800">
            <b>{selected.size} teklif seçili</b>
            <span className="text-brand-600/80 tabular-nums">· {formatTl(quotes.filter(q => selected.has(q.id)).reduce((t, q) => t + (netTry.get(q.id) || 0), 0))}</span>
            <span className="flex-1" />
            {!readOnly && <button onClick={approveSelected} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold">Seçilenleri onayla</button>}
            <button onClick={() => setSelected(new Set())} className="px-2 py-1 rounded-lg font-bold hover:bg-brand-100">Temizle</button>
          </div>
        )}

        {/* Telefon: kartlar */}
        <NarrowOnly><div className="xl:hidden divide-y divide-slate-100 mt-1">
          {pageRows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Arama kriterine uygun teklif bulunamadı.</p>}
          {pageRows.map(quote => (
            <div key={quote.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button onClick={() => setCustomerView(quote.customerName)} className="font-bold text-slate-900 text-sm leading-snug text-left">{quote.customerName}</button>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    <button onClick={() => setSelectedQuote(quote)} className="font-bold text-slate-700">{quote.quoteNumber}</button>
                    {' '}· {quote.city || '-'} · {new Date(quote.createdAt).toLocaleDateString('tr-TR')}
                  </div>
                </div>
                <button onClick={() => setSelectedQuote(quote)} className="text-right shrink-0">
                  <div className="text-sm font-black text-slate-900 tabular-nums whitespace-nowrap">{formatTl(netTry.get(quote.id) || 0)}</div>
                  <div className="text-[10px] text-slate-500">KDV dahil</div>
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 flex-wrap">
                  <StatusPill status={quote.status} />
                  {priceBadge(quote.id)}
                  {quote.status === 'gonderildi' && quote.lostReason && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap bg-amber-50 text-amber-800 border-amber-200" title={quote.lostReason}>{splitReason(quote.lostReason).reason}</span>}
                </div>
                <div className="relative flex items-center shrink-0">
                  <IconBtn title="Detay" onClick={() => setSelectedQuote(quote)}><Eye className="w-4 h-4" /></IconBtn>
                  {!readOnly && <IconBtn title="Düzenle / Revize Et" onClick={() => onEditQuote(quote)}><Pencil className="w-4 h-4" /></IconBtn>}
                  <IconBtn title="Diğer" onClick={() => setMenuFor(quote.id)}><MoreHorizontal className="w-4 h-4" /></IconBtn>
                  {moreMenu(quote)}
                </div>
              </div>
            </div>
          ))}
        </div></NarrowOnly>

        {/* Tablet / bilgisayar: tablo */}
        <WideOnly><div className="hidden xl:block overflow-x-auto mt-1">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100">
              <tr className="[&>th]:text-[12px] [&>th]:font-bold [&>th]:text-slate-500">
                <th className="py-3 pl-4 pr-1 w-8"><input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Sayfadakilerin hepsini seç" className="w-4 h-4 rounded border-slate-300 accent-brand-500" /></th>
                <SortHeader label="Teklif No" active={sort.key === 'number'} dir={sort.dir} onClick={() => sortBy('number', 'desc')} />
                <SortHeader label="Müşteri & Şehir" active={sort.key === 'customer'} dir={sort.dir} onClick={() => sortBy('customer', 'asc')} />
                <SortHeader label="Durum" active={sort.key === 'status'} dir={sort.dir} onClick={() => sortBy('status', 'asc')} />
                <SortHeader label="Tarih" active={sort.key === 'date'} dir={sort.dir} onClick={() => sortBy('date', 'desc')} />
                <SortHeader label="Tutar (KDV Dahil)" align="right" active={sort.key === 'amount'} dir={sort.dir} onClick={() => sortBy('amount', 'desc')} />
                <th className="py-3 px-3 text-center">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">Arama kriterine uygun teklif bulunamadı.</td></tr>
              )}
              {pageRows.map(quote => (
                <tr key={quote.id} className={`${rowCls} ${selected.has(quote.id) ? 'bg-brand-50/50' : ''}`}>
                  <td className="py-3 pl-4 pr-1"><input type="checkbox" checked={selected.has(quote.id)} onChange={() => toggleSel(quote.id)} aria-label="Seç" className="w-4 h-4 rounded border-slate-300 accent-brand-500" /></td>
                  <td className="py-3 px-3">
                    <button onClick={() => setSelectedQuote(quote)} title="Teklifi aç" className="font-bold text-slate-900 hover:text-brand-700 whitespace-nowrap">{quote.quoteNumber}</button>
                  </td>
                  <td className="py-3 px-3">
                    <button onClick={() => setCustomerView(quote.customerName)} title="Müşterinin tüm teklifleri" className="font-bold text-slate-900 text-left hover:text-brand-700 leading-snug">{quote.customerName}</button>
                    <div className="text-xs text-slate-500">{quote.city}</div>
                  </td>
                  <td className="py-3 px-3">
                    <StatusPill status={quote.status} />
                    {priceChanges.has(quote.id) && <span className="mt-1 block w-fit">{priceBadge(quote.id)}</span>}
                    {quote.status === 'gonderildi' && quote.lostReason && <span className="mt-1 block w-fit text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap bg-amber-50 text-amber-800 border-amber-200" title={quote.lostReason}>{splitReason(quote.lostReason).reason}</span>}
                    {needsFollowUp(quote) && <span className="mt-1 block w-fit text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">⏰ Tekrar görüş ({quoteAgeInDays(quote)} gün)</span>}
                  </td>
                  <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{new Date(quote.createdAt).toLocaleDateString('tr-TR')}</td>
                  <td className="py-3 px-3 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">{formatTl(netTry.get(quote.id) || 0)}</td>
                  <td className="py-3 px-3">
                    <div className="relative flex items-center justify-center gap-0.5">
                      <IconBtn title="Detay" onClick={() => setSelectedQuote(quote)}><Eye className="w-4 h-4" /></IconBtn>
                      {!readOnly && <IconBtn title="Düzenle / Revize Et" onClick={() => onEditQuote(quote)}><Pencil className="w-4 h-4" /></IconBtn>}
                      <IconBtn title="Diğer" onClick={() => setMenuFor(quote.id)}><MoreHorizontal className="w-4 h-4" /></IconBtn>
                      {moreMenu(quote)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></WideOnly>
        <Pager page={page} total={filteredQuotes.length} size={LIST_PAGE} onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          label={<>Toplam {filteredQuotes.length.toLocaleString('tr-TR')} teklif</>} />
      </div>

      {/* Müşteri kartı: verilen tüm teklifler */}
      {customerView && (
        <CustomerQuotes
          name={customerView}
          quotes={quotes}
          netTry={netTry}
          statusBadge={getStatusBadge}
          onOpenQuote={setSelectedQuote}
          onClose={() => setCustomerView(null)}
        />
      )}

      {/* Quote Detail & Action Modal */}
      {selectedQuote && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-stretch sm:items-center justify-center sm:p-4" onClick={() => setSelectedQuote(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-2xl sm:rounded-3xl h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto shadow-2xl">
            
            {/* Modal Header */}
            <div className="sticky top-0 z-10 px-4 sm:px-6 py-4 pt-safe-4 bg-gradient-to-br from-[#0b2a4c] to-[#15457a] text-white flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold bg-white/15 text-white px-2 py-0.5 rounded-md">
                    {selectedQuote.quoteNumber}
                  </span>
                  <span className="text-xs font-bold text-white">
                    {formatTl(netTry.get(selectedQuote.id) ?? quoteTry(selectedQuote, rates))} <span className="font-normal text-sky-200/80">KDV dahil</span>
                  </span>
                </div>
                <button onClick={() => { setCustomerView(selectedQuote.customerName); setSelectedQuote(null); }} title="Müşterinin tüm teklifleri"
                  className="text-lg sm:text-[22px] font-black tracking-tight text-white mt-1 text-left hover:underline underline-offset-2">
                  {selectedQuote.customerName}
                </button>
                <p className="text-xs text-sky-200/80">
                  {selectedQuote.city}
                </p>
              </div>
              <button
                onClick={() => setSelectedQuote(null)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white shrink-0 text-base font-bold"
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
              
              {/* Stepper / Status Controller */}
              <div className={readOnly ? 'hidden' : ''}>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Teklif Durumu
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['gonderildi', 'onaylandi', 'iptal'] as QuoteStatus[]).map((st) => {
                    const isCurrent = selectedQuote.status === st;
                    const badge = getStatusBadge(st);
                    return (
                      <button
                        key={st}
                        onClick={() => {
                          onUpdateQuoteStatus(selectedQuote.id, st);
                          setSelectedQuote({ ...selectedQuote, status: st, lostReason: st === 'onaylandi' ? undefined : selectedQuote.lostReason });
                        }}
                        className={`p-2 rounded-lg text-xs font-bold border transition-all text-center ${
                          isCurrent
                            ? 'bg-brand-500 text-white border-brand-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {badge.label}
                      </button>
                    );
                  })}
                </div>
                {selectedQuote.status === 'gonderildi' && (() => {
                  const cur = splitReason(selectedQuote.lostReason);
                  const save = (reason: string, note: string) => {
                    const v = reason ? [reason, note.trim()].filter(Boolean).join(' · ') : '';
                    onUpdateQuoteStatus(selectedQuote.id, selectedQuote.status, v);
                    setSelectedQuote({ ...selectedQuote, lostReason: v || undefined });
                  };
                  return (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                      <div className="text-[11px] font-bold text-slate-600">Neden bekliyor?</div>
                      <div className="flex flex-wrap gap-1.5">
                        {PENDING_REASONS.map(r => (
                          <button key={r} onClick={() => save(cur.reason === r ? '' : r, reasonNote)}
                            className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${cur.reason === r ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                            {r}
                          </button>
                        ))}
                      </div>
                      {cur.reason && (
                        <input value={reasonNote} onChange={e => setReasonNote(e.target.value)}
                          onBlur={() => reasonNote.trim() !== cur.note && save(cur.reason, reasonNote)}
                          placeholder={cur.reason === 'Rakip daha ucuz' ? 'Rakip firma ve fiyatı (ör. ABC Isı 45.000 TL)' : 'Kısa not (isteğe bağlı)'}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white" />
                      )}
                    </div>
                  );
                })()}
              </div>

              {priceChanges.get(selectedQuote.id) && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                  <div className="text-xs font-black text-rose-700 mb-1.5">Teklif verildikten sonra {priceChanges.get(selectedQuote.id)!.length} kalemin fiyatı değişti</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {priceChanges.get(selectedQuote.id)!.map(c => (
                      <div key={c.code} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="min-w-0 truncate text-slate-700">{c.name}</span>
                        <span className="shrink-0 tabular-nums text-slate-500">{c.old.toLocaleString('tr-TR')} → <b className="text-slate-900">{c.now.toLocaleString('tr-TR')}</b> <b className={c.pct > 0 ? 'text-rose-600' : 'text-emerald-600'}>{c.pct > 0 ? '+' : ''}%{Math.round(c.pct * 100)}</b></span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-2">Müşteri onaylamadan önce revize teklif göndermeyi düşünün (Düzenle / Revize Et).</p>
                </div>
              )}

              {/* Items Table */}
              {(selectedQuote.items?.length || 0) > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Talep Edilen Malzemeler ({selectedQuote.items?.length || 0} Kalem)
                  </label>
                  <span className="text-xs font-bold text-slate-900">
                    Toplam: {formatQuoteAmount(selectedQuote)}
                  </span>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2">Malzeme / Ürün</th>
                        <th className="p-2">Miktar</th>
                        <th className="p-2 text-right">Birim Fiyat</th>
                        <th className="p-2 text-right">Toplam</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedQuote.items?.map((it, idx) => (
                        <tr key={idx} className="hover:bg-white">
                          <td className="p-2 font-medium text-slate-900">{it.productName}</td>
                          <td className="p-2 text-slate-600">{it.quantity} {it.unit}</td>
                          <td className="p-2 text-right text-slate-600">{it.unitPrice > 0 ? `${it.unitPrice.toLocaleString('tr-TR')} ${CURRENCY_LABEL[itemCurrency(it, selectedQuote)]}` : '-'}</td>
                          <td className="p-2 text-right font-bold text-slate-900">{it.totalPrice > 0 ? `${it.totalPrice.toLocaleString('tr-TR')} ${CURRENCY_LABEL[itemCurrency(it, selectedQuote)]}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              {/* Notes */}
              {selectedQuote.notes && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Notlar
                  </label>
                  <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                    {selectedQuote.notes}
                  </p>
                </div>
              )}

              {/* Action Buttons Grid */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                <button
                  hidden={readOnly}
                  onClick={() => {
                    onEditQuote(selectedQuote);
                    setSelectedQuote(null);
                  }}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Düzenle / Revize</span>
                </button>
                <button
                  onClick={() => {
                    onPrintQuote(selectedQuote);
                    setSelectedQuote(null);
                  }}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Resmi Teklif</span>
                </button>

              </div>

              {/* Danger zone delete */}
              <div className="flex justify-between items-center pt-2 text-xs text-slate-500">
                <span>{rates.date ? `Kur: 1 USD = ${rates.USD.toLocaleString('tr-TR')} TL · 1 EUR = ${rates.EUR.toLocaleString('tr-TR')} TL (TCMB ${rates.date})` : ''}</span>
                <button
                  hidden={readOnly}
                  onClick={() => {
                    if (confirm('Bu teklifi silmek istediğinize emin misiniz?')) {
                      onDeleteQuote(selectedQuote.id);
                      setSelectedQuote(null);
                    }
                  }}
                  className="text-rose-600 hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Teklifi Sil
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};

/** Müşteri kartı: özet + o müşteriye verilen tüm teklifler (tıklayınca teklif açılır) */
export const CustomerQuotes: React.FC<{
  name: string;
  quotes: Quote[];
  netTry: Map<string, number>;
  statusBadge: (s: QuoteStatus) => { label: string; color: string } | undefined;
  onOpenQuote: (q: Quote) => void;
  onClose: () => void;
}> = ({ name, quotes, netTry, statusBadge, onOpenQuote, onClose }) => {
  const list = useMemo(
    () => quotes.filter(q => q.customerName.trim().toLocaleLowerCase('tr') === name.trim().toLocaleLowerCase('tr')).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [quotes, name],
  );
  const sum = (xs: Quote[]) => xs.reduce((t, q) => t + (netTry.get(q.id) || 0), 0);
  const approved = list.filter(q => q.status === 'onaylandi');
  const pending = list.filter(q => PENDING_STATUSES.includes(q.status));
  const cancelled = list.filter(q => q.status === 'iptal');
  const city = list.find(q => q.city)?.city;
  const first = list[list.length - 1]?.createdAt;
  const rate = list.length ? Math.round((approved.length / list.length) * 100) : 0;
  const stats: { k: string; v: string; sub?: string; tone: string }[] = [
    { k: 'Toplam teklif', v: `${list.length}`, sub: formatTl(sum(list)), tone: 'bg-brand-50 border-brand-100 text-brand-800' },
    { k: 'Onaylanan', v: `${approved.length}`, sub: formatTl(sum(approved)), tone: 'bg-accent-50 border-accent-100 text-accent-800' },
    { k: 'Beklemede', v: `${pending.length}`, sub: formatTl(sum(pending)), tone: 'bg-amber-50 border-amber-100 text-amber-800' },
    { k: 'Onay oranı', v: list.length ? `%${rate}` : '—', sub: `${cancelled.length} iptal`, tone: 'bg-slate-50 border-slate-200 text-slate-800' },
  ];
  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-3xl sm:rounded-3xl shadow-2xl flex flex-col h-full sm:h-auto sm:max-h-[90vh] overflow-hidden">
        <div className="px-4 sm:px-6 pb-4 pt-safe bg-gradient-to-br from-[#0b2a4c] to-[#15457a] text-white">
          <div className="pt-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg sm:text-[22px] font-black tracking-tight leading-tight truncate">{name}</h3>
              <p className="text-xs text-sky-200/80">
                {city || '—'}{first ? ` · ilk teklif ${new Date(first).toLocaleDateString('tr-TR')}` : ''}
              </p>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white shrink-0 text-base font-bold leading-none" aria-label="Kapat">✕</button>
          </div>
          {/* Onay oranı çubuğu */}
          {list.length > 0 && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full rounded-full bg-accent-400" style={{ width: `${rate}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-sky-200/80">Tekliflerin %{rate}'i onaylandı</div>
            </div>
          )}
        </div>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-slate-100">
          {stats.map(s => (
            <div key={s.k} className={`rounded-xl border px-3 py-2 min-w-0 ${s.tone}`}>
              <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{s.k}</div>
              <div className="text-lg font-black tabular-nums">{s.v}</div>
              {s.sub && <div className="text-[11px] opacity-80 tabular-nums truncate">{s.sub}</div>}
            </div>
          ))}
        </div>
        {/* Liste: sütunlar ekrana sığar, yana kaymaz */}
        <div className="overflow-y-auto overflow-x-hidden flex-1">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 sticky top-0 flex justify-between">
            <span>Teklifler</span><span>Tutar (KDV dahil)</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {list.map(q => {
              const b = statusBadge(q.status);
              return (
                <li key={q.id}>
                  <button onClick={() => onOpenQuote(q)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-brand-50/60 active:bg-brand-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-brand-700 text-sm">{q.quoteNumber}</span>
                        <span className="text-xs text-slate-500 whitespace-nowrap">{new Date(q.createdAt).toLocaleDateString('tr-TR')}</span>
                      </div>
                      {b && <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${b.color}`}>{b.label}</span>}
                    </div>
                    <div className="text-right font-bold tabular-nums whitespace-nowrap text-sm text-slate-900">{formatTl(netTry.get(q.id) || 0)}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};
