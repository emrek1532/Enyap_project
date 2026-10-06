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
  Calendar, 
  Trash2, 
  Edit3, 
  Layers, 
  List, 
  Sparkles,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { Quote, QuoteStatus, UrgencyLevel, UserRole } from '../types';

const KANBAN_LIMIT = 30;
const LIST_PAGE = 50;

const fold = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** "1.200 USD + 300 EUR + 5.000 TL" — yalnızca dövizli tekliflerde */
const currencyBreakdown = (q: Quote) => {
  const parts: string[] = [];
  if (q.amountUsd) parts.push(`${fmt(q.amountUsd)} USD`);
  if (q.amountEur) parts.push(`${fmt(q.amountEur)} EUR`);
  if (q.amountTry && parts.length) parts.push(`${fmt(q.amountTry)} TL`);
  return parts.length ? parts.join(' + ') : '';
};

interface QuoteManagerProps {
  quotes: Quote[];
  currentRole: UserRole;
  onOpenNewQuote: () => void;
  onUpdateQuoteStatus: (id: string, status: QuoteStatus) => void;
  onDeleteQuote: (id: string) => void;
  onConvertToOrder: (quote: Quote) => void;
  onAddCalendarEventFromQuote: (quote: Quote) => void;
  onPrintQuote: (quote: Quote) => void;
}

export const QuoteManager: React.FC<QuoteManagerProps> = ({
  quotes,
  currentRole,
  onOpenNewQuote,
  onUpdateQuoteStatus,
  onDeleteQuote,
  onConvertToOrder,
  onAddCalendarEventFromQuote,
  onPrintQuote,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  // 'aktif' = siparişe dönüşmemiş ve iptal edilmemiş teklifler
  const [statusFilter, setStatusFilter] = useState<string>('aktif');
  const [listLimit, setListLimit] = useState(LIST_PAGE);
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

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
          fold(quote.preparedBy || '').includes(q) ||
          fold(quote.notes || '').includes(q) ||
          (quote.items || []).some((it) => fold(it.productName).includes(q));

        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'aktif' ? !['siparis', 'iptal'].includes(quote.status) : quote.status === statusFilter);
        const matchesUrgency = urgencyFilter === 'all' || quote.urgency === urgencyFilter;

        return matchesSearch && matchesStatus && matchesUrgency;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [quotes, searchTerm, statusFilter, urgencyFilter]);

  const showAllOfStatus = (status: QuoteStatus) => {
    setStatusFilter(status);
    setViewMode('list');
    setListLimit(LIST_PAGE);
  };

  const getStatusBadge = (status: QuoteStatus) => {
    switch (status) {
      case 'yeni_talep':
        return { label: 'Yeni Talep', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'hazirlaniyor':
        return { label: 'Ofiste Hazırlanıyor', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'gonderildi':
        return { label: 'Teklif Gönderildi', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'onaylandi':
        return { label: 'Onaylandı', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'siparis':
        return { label: 'Siparişe Dönüştü', color: 'bg-accent-100 text-accent-800 border-accent-200' };
      case 'revizyon':
        return { label: 'Revizyon Bekliyor', color: 'bg-brand-100 text-brand-800 border-brand-200' };
      case 'iptal':
        return { label: 'İptal / Kaybedildi', color: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const getUrgencyBadge = (urgency: UrgencyLevel) => {
    switch (urgency) {
      case 'acil':
        return { label: 'Acil', color: 'bg-rose-500 text-white' };
      case 'yuksek':
        return { label: 'Yüksek', color: 'bg-amber-500 text-white' };
      case 'normal':
        return { label: 'Normal', color: 'bg-slate-200 text-slate-700' };
      case 'dusuk':
        return { label: 'Düşük', color: 'bg-slate-100 text-slate-600' };
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
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
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
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setListLimit(LIST_PAGE); }}
            className="px-2.5 py-2 rounded-lg border border-slate-200 text-xs sm:text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="aktif">Aktif Teklifler</option>
            <option value="all">Tüm Teklifler</option>
            <option value="yeni_talep">Yeni Talep (Bekleyen)</option>
            <option value="hazirlaniyor">Hazırlanıyor</option>
            <option value="gonderildi">Gönderildi</option>
            <option value="onaylandi">Onaylandı</option>
            <option value="revizyon">Revizyon</option>
            <option value="iptal">İptal</option>
            <option value="siparis">Siparişe Dönüşenler</option>
          </select>

          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            className="px-2.5 py-2 rounded-lg border border-slate-200 text-xs sm:text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="all">Tüm Aciliyetler</option>
            <option value="acil">Acil</option>
            <option value="yuksek">Yüksek</option>
            <option value="normal">Normal</option>
          </select>

          {/* View toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'kanban' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Kanban Pano Görünümü"
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'list' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Tablo Liste Görünümü"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Add New Quote Button */}
          <button
            onClick={onOpenNewQuote}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">+ Yeni Teklif Talebi</span>
            <span className="sm:hidden">+ Teklif</span>
          </button>
        </div>

      </div>

      {/* Kanban Board View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {kanbanColumns.map((col) => {
            const allColQuotes = filteredQuotes.filter((q) => q.status === col.status);
            const colQuotes = expandedColumns[col.status] ? allColQuotes : allColQuotes.slice(0, KANBAN_LIMIT);
            const hiddenCount = allColQuotes.length - colQuotes.length;
            return (
              <div 
                key={col.status} 
                className={`bg-slate-100/80 rounded-xl border border-slate-200/90 shadow-2xs border-t-4 ${col.border} flex flex-col max-h-[calc(100vh-250px)]`}
              >
                {/* Column Header */}
                <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between rounded-t-lg">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <span>{col.title}</span>
                      <span className="px-1.5 py-0.2 rounded-full text-xs bg-slate-100 font-bold text-slate-600">
                        {allColQuotes.length}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500">{col.hint}</p>
                  </div>
                </div>

                {/* Cards List */}
                <div className="p-2 space-y-2.5 overflow-y-auto flex-1">
                  {allColQuotes.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 font-medium">
                      Bu aşamada teklif yok
                    </div>
                  ) : (
                    colQuotes.map((quote) => {
                      const urgency = getUrgencyBadge(quote.urgency);
                      const isWaitingForOffice = quote.status === 'yeni_talep';

                      return (
                        <div
                          key={quote.id}
                          className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs hover:shadow-md transition-all space-y-2.5 group relative"
                        >
                          {/* Top Card Info */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {quote.quoteNumber}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 mt-1 line-clamp-1">
                                {quote.customerName}
                              </h4>
                              {quote.customerContact && (
                                <p className="text-[11px] text-slate-500">
                                  Yetkili: {quote.customerContact}
                                </p>
                              )}
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${urgency.color}`}>
                              {urgency.label}
                            </span>
                          </div>

                          {/* Location & Channel */}
                          <div className="flex items-center gap-2 text-[11px] text-slate-600">
                            <span className="flex items-center gap-1 font-medium">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {quote.city || 'Isparta'}
                            </span>
                            {quote.customerPhone && (
                              <a
                                href={`tel:${quote.customerPhone}`}
                                className="flex items-center gap-1 text-sky-600 hover:underline"
                              >
                                <Phone className="w-3 h-3" />
                                {quote.customerPhone}
                              </a>
                            )}
                          </div>

                          {/* Items brief */}
                          {quote.items && quote.items.length > 0 && (
                            <div className="bg-slate-50 p-2 rounded border border-slate-100 text-xs text-slate-700 space-y-1">
                              {quote.items.slice(0, 2).map((item, i) => (
                                <div key={i} className="flex justify-between text-[11px]">
                                  <span className="truncate pr-2 font-medium">• {item.productName}</span>
                                  <span className="text-slate-500 font-bold shrink-0">{item.quantity} {item.unit}</span>
                                </div>
                              ))}
                              {quote.items.length > 2 && (
                                <p className="text-[10px] text-slate-500 font-semibold italic">
                                  + {quote.items.length - 2} kalem malzeme daha
                                </p>
                              )}
                            </div>
                          )}

                          {(quote.preparedBy || currencyBreakdown(quote)) && (
                            <div className="text-[11px] text-slate-500 space-y-0.5">
                              {quote.preparedBy && <p>Teklifi veren: <span className="font-semibold text-slate-700">{quote.preparedBy}</span></p>}
                              {currencyBreakdown(quote) && <p className="font-mono">{currencyBreakdown(quote)}</p>}
                            </div>
                          )}

                          {/* Price & Status Date */}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 block font-medium">Tutar (KDV Dahil)</span>
                              <span className="text-sm font-black text-slate-900">
                                {quote.totalAmount > 0 
                                  ? `${quote.totalAmount.toLocaleString('tr-TR')} TL` 
                                  : 'Fiyat Bekleniyor'}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(quote.createdAt).toLocaleDateString('tr-TR')}
                            </span>
                          </div>

                          {/* Quick Action Buttons on Card */}
                          <div className="grid grid-cols-1 gap-1.5 pt-1 border-t border-slate-100">
                            {/* View / Detail */}
                            <button
                              onClick={() => setSelectedQuote(quote)}
                              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-200 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Detay & İşlem</span>
                            </button>
                          </div>

                          {/* Direct Pipeline Advancement Action */}
                          {quote.status === 'yeni_talep' && (
                            <button
                              onClick={() => onUpdateQuoteStatus(quote.id, 'hazirlaniyor')}
                              className="w-full flex items-center justify-center gap-1 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold border border-blue-200 transition-colors"
                            >
                              <span>Hazırlanıyor'a Al &rarr;</span>
                            </button>
                          )}

                          {quote.status === 'hazirlaniyor' && (
                            <button
                              onClick={() => onUpdateQuoteStatus(quote.id, 'gonderildi')}
                              className="w-full flex items-center justify-center gap-1 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-bold border border-purple-200 transition-colors"
                            >
                              <span>Müşteriye Gönderildi'ye Al &rarr;</span>
                            </button>
                          )}

                          {quote.status === 'gonderildi' && (
                            <button
                              onClick={() => onUpdateQuoteStatus(quote.id, 'onaylandi')}
                              className="w-full flex items-center justify-center gap-1 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs transition-colors"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Müşteri Onayladı!</span>
                            </button>
                          )}

                          {quote.status === 'onaylandi' && (
                            <button
                              onClick={() => onConvertToOrder(quote)}
                              className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-[11px] font-extrabold shadow-xs transition-colors"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>🚚 Siparişe & Sevkiyata Çevir</span>
                            </button>
                          )}

                        </div>
                      );
                    })
                  )}
                  {hiddenCount > 0 && (
                    <button
                      onClick={() => showAllOfStatus(col.status)}
                      className="w-full py-2 rounded-lg bg-white hover:bg-brand-50 border border-slate-200 text-xs font-bold text-brand-600"
                    >
                      + {hiddenCount} teklif daha · listede gör
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table / List View */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">Teklif No</th>
                  <th className="py-3 px-3">Müşteri & Şehir</th>
                  <th className="py-3 px-3">Malzeme / Not</th>
                  <th className="py-3 px-3">Tutar</th>
                  <th className="py-3 px-3">Aciliyet</th>
                  <th className="py-3 px-3">Durum</th>
                  <th className="py-3 px-3">Tarih</th>
                  <th className="py-3 px-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredQuotes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Arama kriterine uygun teklif bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredQuotes.slice(0, listLimit).map((quote) => {
                    const statusBadge = getStatusBadge(quote.status);
                    const urgencyBadge = getUrgencyBadge(quote.urgency);

                    return (
                      <tr key={quote.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">
                          {quote.quoteNumber}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{quote.customerName}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {quote.city}{quote.preparedBy ? ` • ${quote.preparedBy}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 max-w-[200px] truncate text-slate-700">
                          {quote.items?.length
                            ? quote.items.map(it => `${it.quantity} ${it.unit} ${it.productName}`).join(', ')
                            : quote.notes || currencyBreakdown(quote) || '-'}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                          {quote.totalAmount > 0 ? `${quote.totalAmount.toLocaleString('tr-TR')} TL` : 'Fiyat Bekleniyor'}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${urgencyBadge.color}`}>
                            {urgencyBadge.label}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${statusBadge.color}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(quote.createdAt).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onPrintQuote(quote)}
                              className="p-1.5 rounded-md hover:bg-sky-50 text-sky-600 transition-colors"
                              title="Resmi Antetli Teklif Yazdır / PDF"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setSelectedQuote(quote)}
                              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors"
                              title="Detay & Düzenle"
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
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${getUrgencyBadge(selectedQuote.urgency).color}`}>
                    {selectedQuote.urgency}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 mt-1">
                  {selectedQuote.customerName}
                </h3>
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
                  Teklif Süreci Durumu
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['yeni_talep', 'hazirlaniyor', 'gonderildi', 'onaylandi'] as QuoteStatus[]).map((st) => {
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

              {currencyBreakdown(selectedQuote) && (
                <div className="p-3 rounded-lg bg-brand-50 border border-brand-100 text-xs text-brand-800 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="font-bold">Döviz kırılımı:</span>
                  <span className="font-mono">{currencyBreakdown(selectedQuote)}</span>
                  {!!selectedQuote.totalUsd && <span>Genel toplam: <b>{fmt(selectedQuote.totalUsd)} USD</b></span>}
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
                    Toplam: {selectedQuote.totalAmount?.toLocaleString('tr-TR')} TL
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
                          <td className="p-2 text-right text-slate-600">{it.unitPrice > 0 ? `${it.unitPrice.toLocaleString('tr-TR')} TL` : '-'}</td>
                          <td className="p-2 text-right font-bold text-slate-900">{it.totalPrice > 0 ? `${it.totalPrice.toLocaleString('tr-TR')} TL` : '-'}</td>
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
                    onPrintQuote(selectedQuote);
                    setSelectedQuote(null);
                  }}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Resmi Teklif</span>
                </button>

                <button
                  onClick={() => {
                    onAddCalendarEventFromQuote(selectedQuote);
                    setSelectedQuote(null);
                  }}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Takvime Ekle</span>
                </button>
              </div>

              {/* Convert to Order Button (hidden once the quote became an order) */}
              {selectedQuote.status === 'siparis' ? (
                <p className="pt-2 text-xs font-semibold text-accent-700 bg-accent-50 border border-accent-200 rounded-lg p-2.5">
                  Bu teklif siparişe dönüştürüldü. Takibi Sevkiyat sekmesinden yapılır.
                </p>
              ) : (
              <div className="pt-2">
                <button
                  onClick={() => {
                    onConvertToOrder(selectedQuote);
                    setSelectedQuote(null);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 hover:from-brand-600 hover:to-accent-600 text-white text-sm font-black shadow-md shadow-brand-500/20 transition-all"
                >
                  <Truck className="w-4 h-4" />
                  <span>🚚 Bu Teklifi Siparişe & Sevkiyata Dönüştür</span>
                </button>
              </div>
              )}

              {/* Danger zone delete */}
              <div className="flex justify-between items-center pt-2 text-xs text-slate-400">
                <span>Teklifi veren: {selectedQuote.preparedBy || (selectedQuote.createdBy === 'isparta' ? 'Isparta' : 'İstanbul')}</span>
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
