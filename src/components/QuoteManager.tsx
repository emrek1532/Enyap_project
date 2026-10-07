import React, { useMemo, useState } from 'react';
import { 
  FileText, 
  Search, 
  Filter, 
  Plus, 
  MessageCircle, 
  Phone, 
  MapPin, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  ChevronRight, 
  Printer, 
  Truck, 
  Trash2, 
  Edit3, 
  Layers, 
  List, 
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Pencil
} from 'lucide-react';
import { Quote, QuoteStatus, UserRole } from '../types';
import { needsFollowUp, quoteAgeInDays, PENDING_STATUSES } from '../lib/quoteRules';
import { SortHeader, SortState, nextSort, compareText, SortDir, MobileSortSelect } from './SortHeader';
import { formatQuoteAmount, itemCurrency, CURRENCY_LABEL } from '../lib/money';
import { formatTl, quoteNetTry, useRates } from '../lib/rates';

const KANBAN_LIMIT = 30;
const LIST_PAGE = 50;

const fold = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

type QuoteSortKey = 'number' | 'customer' | 'amount' | 'status' | 'date';
/** Durum sırası: Beklemede → Onaylandı → İptal */
const STATUS_RANK: Record<string, number> = { yeni_talep: 0, hazirlaniyor: 0, gonderildi: 0, revizyon: 0, onaylandi: 1, siparis: 1, iptal: 2 };

interface QuoteManagerProps {
  quotes: Quote[];
  currentRole: UserRole;
  onOpenNewQuote: () => void;
  onUpdateQuoteStatus: (id: string, status: QuoteStatus) => void;
  onDeleteQuote: (id: string) => void;
  onPrintQuote: (quote: Quote) => void;
  onEditQuote: (quote: Quote) => void;
  statusFilter: string;
  onStatusFilterChange: (filter: string) => void;
}

export const QuoteManager: React.FC<QuoteManagerProps> = ({
  quotes,
  currentRole,
  onOpenNewQuote,
  onUpdateQuoteStatus,
  onDeleteQuote,
  onPrintQuote,
  onEditQuote,
  statusFilter,
  onStatusFilterChange: setStatusFilter,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [listLimit, setListLimit] = useState(LIST_PAGE);
  const [cityFilter, setCityFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  // Müşteri kartı: o müşteriye verilen tüm teklifler
  const [customerView, setCustomerView] = useState<string | null>(null);
  // Tutarlar KDV hariç TL karşılığı (döviz TCMB kuruyla çevrilir)
  const rates = useRates(quotes);
  const netTry = useMemo(() => {
    const m = new Map<string, number>();
    quotes.forEach(q => m.set(q.id, quoteNetTry(q, rates)));
    return m;
  }, [quotes, rates]);
  // Sütun başlığına tıklayarak sıralama (varsayılan: tarih, yeniden eskiye)
  const [sort, setSort] = useState<SortState<QuoteSortKey>>({ key: 'date', dir: 'desc' });
  const sortBy = (key: QuoteSortKey, firstDir: SortDir) => { setSort(s => nextSort(s, key, firstDir)); setListLimit(LIST_PAGE); };

  // Filtered quotes (newest first). Memoized: there can be thousands of quotes.
  const filteredQuotes = useMemo(() => {
    const q = fold(searchTerm.trim());
    return quotes
      .filter((quote) => {
        const matchesSearch =
          !q ||
          fold(quote.customerName).includes(q) ||
          fold(quote.quoteNumber).includes(q) ||
          fold(quote.city || '').includes(q) ||
          fold(quote.notes || '').includes(q) ||
          (quote.items || []).some((it) => fold(it.productName).includes(q));

        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'aktif'
            ? PENDING_STATUSES.includes(quote.status)
            : statusFilter === 'takip'
              ? needsFollowUp(quote)
              : quote.status === statusFilter);
        const matchesCity = cityFilter === 'all' || quote.city === cityFilter;
        const day = (quote.createdAt || '').slice(0, 10);
        const matchesDate = (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);

        return matchesSearch && matchesStatus && matchesCity && matchesDate;
      })
      .sort((a, b) => {
        let r = 0;
        switch (sort.key) {
          case 'number': r = compareText(a.quoteNumber, b.quoteNumber); break;
          case 'customer': r = compareText(a.customerName, b.customerName) || compareText(a.city, b.city); break;
          case 'amount': r = (netTry.get(a.id) || 0) - (netTry.get(b.id) || 0); break;
          case 'status': r = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9); break;
          default: r = (a.createdAt || '').localeCompare(b.createdAt || '');
        }
        // Eşitlikte yeni teklif üstte
        return (sort.dir === 'asc' ? r : -r) || (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, searchTerm, statusFilter, cityFilter, dateFrom, dateTo, sort, netTry]);

  const cities = useMemo(
    () => [...new Set(quotes.map((q) => q.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [quotes]
  );
  const followUpCount = useMemo(() => quotes.filter(needsFollowUp).length, [quotes]);
  const hasExtraFilters = cityFilter !== 'all' || !!dateFrom || !!dateTo || !!searchTerm;
  const resetFilters = () => {
    setSearchTerm(''); setStatusFilter('all');
    setCityFilter('all'); setDateFrom(''); setDateTo(''); setListLimit(LIST_PAGE);
  };

  const getStatusBadge = (status: QuoteStatus) => {
    switch (status) {
      case 'yeni_talep':
        return { label: 'Yeni Talep', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'hazirlaniyor':
        return { label: 'Ofiste Hazırlanıyor', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'gonderildi':
        return { label: 'Beklemede', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'onaylandi':
        return { label: 'Onaylandı', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'siparis':
        return { label: 'Siparişe Dönüştü', color: 'bg-accent-100 text-accent-800 border-accent-200' };
      case 'arsiv':
        return { label: 'Arşiv', color: 'bg-slate-100 text-slate-500 border-slate-200' };
      case 'revizyon':
        return { label: 'Revizyon Bekliyor', color: 'bg-brand-100 text-brand-800 border-brand-200' };
      case 'iptal':
        return { label: 'İptal', color: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const kanbanColumns: { status: QuoteStatus; title: string; hint: string; border: string }[] = [
    { status: 'yeni_talep', title: 'Yeni Talep', hint: 'Fiyatlandırma bekliyor', border: 'border-t-amber-500' },
    { status: 'hazirlaniyor', title: 'Hazırlanıyor', hint: 'İstanbul fiyatlandırıyor', border: 'border-t-blue-500' },
    { status: 'gonderildi', title: 'Teklif Gönderildi', hint: 'Müşteri onayı bekleniyor', border: 'border-t-purple-500' },
    { status: 'onaylandi', title: 'Onaylandı', hint: 'Siparişe çevrilmeyi bekliyor', border: 'border-t-emerald-500' },
  ];

  return (
    <div className="space-y-4">
      
      {/* Top Filter & Action Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Müşteri adı, teklif no, şehir veya ürün ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        {/* Filter controls */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:flex-wrap [&>select]:w-full sm:[&>select]:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setListLimit(LIST_PAGE); }}
            className="px-2.5 py-2 rounded-lg border border-slate-200 text-xs sm:text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="all">Tüm Teklifler</option>
            <option value="aktif">Beklemede</option>
            <option value="takip">Tekrar Görüşülecek ({followUpCount})</option>
            <option value="onaylandi">Onaylandı</option>
            <option value="iptal">İptal</option>
          </select>

          <select
            value={cityFilter}
            onChange={(e) => { setCityFilter(e.target.value); setListLimit(LIST_PAGE); }}
            className="px-2.5 py-2 rounded-lg border border-slate-200 text-xs sm:text-sm font-medium bg-white"
            aria-label="Şehir"
          >
            <option value="all">Tüm Şehirler</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="col-span-2 order-last sm:order-none flex items-center gap-1 text-xs text-slate-500 [&>input]:flex-1 sm:[&>input]:flex-none">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setListLimit(LIST_PAGE); }}
              className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
              aria-label="Başlangıç tarihi"
            />
            <span>–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setListLimit(LIST_PAGE); }}
              className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
              aria-label="Bitiş tarihi"
            />
          </div>

          {(hasExtraFilters || statusFilter !== 'all') && (
            <button onClick={resetFilters} className="px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 sm:border-0">
              Filtreleri temizle
            </button>
          )}

          {/* Add New Quote Button */}
          <button
            onClick={onOpenNewQuote}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">+ Yeni Teklif Talebi</span>
            <span className="sm:hidden">Yeni Teklif</span>
          </button>
        </div>

      </div>

      {/* Table / List View */}
      {followUpCount > 0 && statusFilter !== 'takip' && (
        <button
          onClick={() => { setStatusFilter('takip'); setListLimit(LIST_PAGE); }}
          className="w-full text-left p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-900 font-semibold hover:bg-amber-100"
        >
          ⏰ {followUpCount} teklif 3 günden uzun süredir yanıt bekliyor — müşteri ile tekrar görüşün. Listelemek için tıklayın.
        </button>
      )}

      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs text-slate-500">{filteredQuotes.length} teklif</p>
        <MobileSortSelect sort={sort} onChange={(s) => { setSort(s); setListLimit(LIST_PAGE); }} options={[
          { key: 'date', dir: 'desc', label: 'Tarih: yeniden eskiye' },
          { key: 'date', dir: 'asc', label: 'Tarih: eskiden yeniye' },
          { key: 'customer', dir: 'asc', label: 'Müşteri: A → Z' },
          { key: 'customer', dir: 'desc', label: 'Müşteri: Z → A' },
          { key: 'status', dir: 'asc', label: 'Durum' },
          { key: 'number', dir: 'desc', label: 'Teklif No' },
        ]} />
      </div>

      {(
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Telefon: kart görünümü (yana kaydırma yok) */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredQuotes.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">Arama kriterine uygun teklif bulunamadı.</p>
            )}
            {filteredQuotes.slice(0, listLimit).map((quote) => {
              const statusBadge = getStatusBadge(quote.status);
              const pending = PENDING_STATUSES.includes(quote.status);
              return (
                <div key={quote.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button onClick={() => setCustomerView(quote.customerName)} className="font-bold text-slate-900 text-sm leading-snug text-left hover:text-brand-700 underline-offset-2 hover:underline">
                        {quote.customerName}
                      </button>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        <button onClick={() => setSelectedQuote(quote)} className="font-mono font-bold text-brand-700 underline underline-offset-2">{quote.quoteNumber}</button>
                        {' '}· {quote.city || '-'} · {new Date(quote.createdAt).toLocaleDateString('tr-TR')}
                      </div>
                    </div>
                    <button onClick={() => setSelectedQuote(quote)} className="text-right shrink-0">
                      <div className="text-sm font-black text-slate-900 tabular-nums whitespace-nowrap">{formatTl(netTry.get(quote.id) || 0)}</div>
                      <div className="text-[10px] text-slate-400">KDV hariç</div>
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${statusBadge.color}`}>{statusBadge.label}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {pending && (
                        <>
                          <button onClick={() => onUpdateQuoteStatus(quote.id, 'onaylandi')}
                            className="px-2 py-1.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">✓ Onayla</button>
                          <button onClick={() => onUpdateQuoteStatus(quote.id, 'iptal')}
                            className="px-2 py-1.5 rounded-md bg-slate-50 text-slate-500 text-[11px] font-bold border border-slate-200">✕</button>
                        </>
                      )}
                      <button onClick={() => onPrintQuote(quote)} className="p-1.5 rounded-md text-sky-600 bg-sky-50" title="Resmi Teklif"><Printer className="w-4 h-4" /></button>
                      <button onClick={() => onEditQuote(quote)} className="p-1.5 rounded-md text-amber-600 bg-amber-50" title="Düzenle / Revize Et"><Pencil className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Tablet / bilgisayar: tablo */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <SortHeader label="Teklif No" active={sort.key === 'number'} dir={sort.dir} onClick={() => sortBy('number', 'desc')} />
                  <SortHeader label="Müşteri & Şehir" active={sort.key === 'customer'} dir={sort.dir} onClick={() => sortBy('customer', 'asc')} />
                  <SortHeader label="Durum" active={sort.key === 'status'} dir={sort.dir} onClick={() => sortBy('status', 'asc')} />
                  <SortHeader label="Tarih" active={sort.key === 'date'} dir={sort.dir} onClick={() => sortBy('date', 'desc')} />
                  <SortHeader label="Tutar (KDV hariç)" active={sort.key === 'amount'} dir={sort.dir} onClick={() => sortBy('amount', 'desc')} />
                  <th className="py-3 px-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredQuotes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Arama kriterine uygun teklif bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredQuotes.slice(0, listLimit).map((quote) => {
                    const statusBadge = getStatusBadge(quote.status);
                    return (
                      <tr key={quote.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3">
                          <button onClick={() => setSelectedQuote(quote)} title="Teklifi aç"
                            className="font-mono font-bold text-slate-900 hover:text-brand-700 hover:underline underline-offset-2">
                            {quote.quoteNumber}
                          </button>
                        </td>
                        <td className="py-3 px-3">
                          <button onClick={() => setCustomerView(quote.customerName)} title="Müşterinin tüm teklifleri"
                            className="font-bold text-slate-900 text-left hover:text-brand-700 hover:underline underline-offset-2">
                            {quote.customerName}
                          </button>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {quote.city}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${statusBadge.color}`}>
                            {statusBadge.label}
                          </span>
                          {needsFollowUp(quote) && (
                            <span className="mt-1 block w-fit text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                              ⏰ Tekrar görüş ({quoteAgeInDays(quote)} gün)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(quote.createdAt).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatTl(netTry.get(quote.id) || 0)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {PENDING_STATUSES.includes(quote.status) && (
                              <>
                                <button
                                  onClick={() => onUpdateQuoteStatus(quote.id, 'onaylandi')}
                                  className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold border border-emerald-200 whitespace-nowrap"
                                  title="Onaylandı olarak işaretle"
                                >
                                  ✓ Onayla
                                </button>
                                <button
                                  onClick={() => onUpdateQuoteStatus(quote.id, 'iptal')}
                                  className="px-2 py-1 rounded-md bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-700 text-[11px] font-bold border border-slate-200 whitespace-nowrap"
                                  title="İptal olarak işaretle"
                                >
                                  ✕ İptal
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => onPrintQuote(quote)}
                              className="p-1.5 rounded-md hover:bg-sky-50 text-sky-600 transition-colors"
                              title="Resmi Antetli Teklif Yazdır / PDF"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onEditQuote(quote)}
                              className="p-1.5 rounded-md hover:bg-amber-50 text-amber-600 transition-colors"
                              title="Düzenle / Revize Et"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setSelectedQuote(quote)}
                              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors"
                              title="Detay"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filteredQuotes.length > listLimit && (
            <div className="p-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>{listLimit} / {filteredQuotes.length} teklif gösteriliyor</span>
              <button
                onClick={() => setListLimit((n) => n + LIST_PAGE)}
                className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold"
              >
                {LIST_PAGE} teklif daha göster
              </button>
            </div>
          )}
        </div>
      )}

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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-start justify-between bg-slate-50/80 rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                    {selectedQuote.quoteNumber}
                  </span>
                  <span className="text-xs font-bold text-slate-700">
                    {formatTl(netTry.get(selectedQuote.id) ?? quoteNetTry(selectedQuote, rates))} <span className="font-normal text-slate-400">KDV hariç</span>
                  </span>
                </div>
                <button onClick={() => setCustomerView(selectedQuote.customerName)} title="Müşterinin tüm teklifleri"
                  className="text-lg font-black text-slate-900 mt-1 text-left hover:text-brand-700 hover:underline underline-offset-2">
                  {selectedQuote.customerName}
                </button>
                <p className="text-xs text-slate-500">
                  {selectedQuote.city} {selectedQuote.projectLocation ? `• ${selectedQuote.projectLocation}` : ''}
                </p>
              </div>
              <button
                onClick={() => setSelectedQuote(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
              
              {/* Stepper / Status Controller */}
              <div>
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
                          setSelectedQuote({ ...selectedQuote, status: st });
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
              </div>

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
              <div className="flex justify-between items-center pt-2 text-xs text-slate-400">
                <span>{rates.date ? `Kur: 1 USD = ${rates.USD.toLocaleString('tr-TR')} TL · 1 EUR = ${rates.EUR.toLocaleString('tr-TR')} TL (TCMB ${rates.date})` : ''}</span>
                <button
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
const CustomerQuotes: React.FC<{
  name: string;
  quotes: Quote[];
  netTry: Map<string, number>;
  statusBadge: (s: QuoteStatus) => { label: string; color: string } | undefined;
  onOpenQuote: (q: Quote) => void;
  onClose: () => void;
}> = ({ name, quotes, netTry, statusBadge, onOpenQuote, onClose }) => {
  const list = useMemo(
    () => quotes.filter(q => q.customerName === name).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [quotes, name],
  );
  const sum = (xs: Quote[]) => xs.reduce((t, q) => t + (netTry.get(q.id) || 0), 0);
  const approved = list.filter(q => q.status === 'onaylandi' || q.status === 'siparis');
  const pending = list.filter(q => PENDING_STATUSES.includes(q.status));
  const cancelled = list.filter(q => q.status === 'iptal');
  const city = list.find(q => q.city)?.city;
  const first = list[list.length - 1]?.createdAt;
  const stats: [string, string, string?][] = [
    ['Toplam teklif', `${list.length}`, formatTl(sum(list))],
    ['Onaylanan', `${approved.length}`, formatTl(sum(approved))],
    ['Beklemede', `${pending.length}`, formatTl(sum(pending))],
    ['Onay oranı', list.length ? `%${Math.round((approved.length / list.length) * 100)}` : '—', `${cancelled.length} iptal`],
  ];
  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-3xl sm:rounded-2xl shadow-2xl flex flex-col h-full sm:h-auto sm:max-h-[90vh]">
        <div className="p-4 border-b border-slate-200 flex items-start justify-between gap-3 bg-slate-50 sm:rounded-t-2xl pt-safe">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-900 leading-tight">{name}</h3>
            <p className="text-xs text-slate-500">
              {city || '—'}{first ? ` · ilk teklif ${new Date(first).toLocaleDateString('tr-TR')}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 text-lg font-bold" aria-label="Kapat">✕</button>
        </div>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-slate-100">
          {stats.map(([k, v, sub]) => (
            <div key={k} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{k}</div>
              <div className="text-lg font-black text-slate-900 tabular-nums">{v}</div>
              {sub && <div className="text-[11px] text-slate-500 tabular-nums">{sub}</div>}
            </div>
          ))}
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Teklif No</th>
                <th className="px-3 py-2 text-left">Tarih</th>
                <th className="px-3 py-2 text-left">Durum</th>
                <th className="px-3 py-2 text-right">Tutar (KDV hariç)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map(q => {
                const b = statusBadge(q.status);
                return (
                  <tr key={q.id} onClick={() => onOpenQuote(q)} className="cursor-pointer hover:bg-brand-50/50">
                    <td className="px-3 py-2 font-mono font-bold text-brand-700">{q.quoteNumber}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{new Date(q.createdAt).toLocaleDateString('tr-TR')}</td>
                    <td className="px-3 py-2">
                      {b && <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${b.color}`}>{b.label}</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap">{formatTl(netTry.get(q.id) || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
