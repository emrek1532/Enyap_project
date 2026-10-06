import React from 'react';
import { 
  AlertTriangle, 
  Clock, 
  FileCheck, 
  Truck, 
  Calendar, 
  Send, 
  PlusCircle, 
  CheckCircle2, 
  ArrowUpRight,
  TrendingUp,
  MapPin
} from 'lucide-react';
import { Quote, Order, OrderStatus, CalendarEvent, UserRole } from '../types';
import { needsFollowUp } from '../lib/quoteRules';

interface DashboardStatsProps {
  quotes: Quote[];
  orders: Order[];
  events: CalendarEvent[];
  currentRole: UserRole;
  onOpenNewQuote: () => void;
  onNavigateTab: (tab: any) => void;
}

const NOT_SHIPPED: OrderStatus[] = ['hazirlaniyor', 'depoda_hazir', 'gecikmeli'];

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  quotes,
  orders,
  events,
  currentRole,
  onOpenNewQuote,
  onNavigateTab,
}) => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Overdue quotes: in 'yeni_talep' status for more than 24 hours
  const overdueQuotes = quotes.filter((q) => {
    if (q.status !== 'yeni_talep') return false;
    const createdTime = new Date(q.createdAt).getTime();
    const hoursElapsed = (now.getTime() - createdTime) / (1000 * 60 * 60);
    return hoursElapsed >= 12; // warn if >= 12 hours waiting
  });

  // Shipments due today or pending
  const todayShipments = orders.filter((o) => {
    return o.targetShippingDate === todayStr && NOT_SHIPPED.includes(o.status);
  });

  const overdueShipments = orders.filter((o) => {
    return o.targetShippingDate < todayStr && NOT_SHIPPED.includes(o.status);
  });

  // Counts
  const pendingQuotes = quotes.filter((q) => q.status === 'yeni_talep');
  const inProgressQuotes = quotes.filter((q) => q.status === 'hazirlaniyor' || q.status === 'gonderildi');
  const approvedQuotes = quotes.filter((q) => q.status === 'onaylandi');
  const followUpQuotes = quotes.filter(needsFollowUp);
  const todayEvents = events.filter((e) => e.date === todayStr);

  // Total active pipeline value
  const totalPipeline = quotes
    .filter((q) => q.status !== 'iptal')
    .reduce((sum, q) => sum + (q.totalAmount || 0), 0);

  return (
    <div className="space-y-3.5 mb-6">
      
      {/* Critical Attention Banner (Prevents forgotten quotes & delayed shipments) */}
      {(overdueQuotes.length > 0 || overdueShipments.length > 0 || todayShipments.length > 0 || followUpQuotes.length > 0) && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-3 sm:p-4 rounded-r-xl shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-700 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-amber-900 flex items-center gap-2">
                <span>Enyap Isı Operasyon Takip Uyarısı</span>
                <span className="text-[10px] bg-amber-200/80 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
                  Aksiyon Gerekiyor
                </span>
              </h4>
              <div className="text-xs text-amber-800 mt-1 space-y-1">
                {overdueQuotes.length > 0 && (
                  <p className="flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      <strong>{overdueQuotes.length} teklif</strong> 12 saatten uzun süredir İstanbul ofis tarafından hazırlanmayı bekliyor:
                      {' '}
                      <span className="underline cursor-pointer" onClick={() => onNavigateTab('quotes')}>
                        {overdueQuotes.map((q) => q.customerName).slice(0, 2).join(', ')}
                        {overdueQuotes.length > 2 ? '...' : ''}
                      </span>
                    </span>
                  </p>
                )}
                {followUpQuotes.length > 0 && (
                  <p className="flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      <strong>{followUpQuotes.length} teklif</strong> 3 günden uzun süredir yanıt bekliyor, müşteri ile tekrar görüşün:{' '}
                      <span className="underline cursor-pointer" onClick={() => onNavigateTab('quotes')}>
                        {followUpQuotes.map((q) => q.customerName).slice(0, 3).join(', ')}
                        {followUpQuotes.length > 3 ? '...' : ''}
                      </span>
                    </span>
                  </p>
                )}
                {overdueShipments.length > 0 && (
                  <p className="flex items-center gap-1.5 font-medium text-rose-800">
                    <Truck className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>
                      <strong>{overdueShipments.length} sipariş</strong> sevk hedef tarihini aştı! Lütfen nakliye ve ambar durumunu kontrol ediniz.
                    </span>
                  </p>
                )}
                {todayShipments.length > 0 && (
                  <p className="flex items-center gap-1.5 font-medium text-blue-900">
                    <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>
                      Bugün sevk edilecek <strong>{todayShipments.length} sipariş</strong> planlanmış durumda.
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        
        {/* Card 1: Bekleyen Teklifler */}
        <div 
          onClick={() => onNavigateTab('quotes')}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-xs hover:border-brand-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Bekleyen Talepler
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-black text-slate-900">
              {pendingQuotes.length}
            </span>
            <span className="text-[11px] font-medium text-brand-600 flex items-center">
              Yanıt bekliyor
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {pendingQuotes.length === 0 ? 'Tüm talepler yanıtlandı' : 'Fiyatlandırma bekliyor'}
          </p>
        </div>

        {/* Card 2: Süreçteki & Gönderilen Teklifler */}
        <div 
          onClick={() => onNavigateTab('quotes')}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-xs hover:border-sky-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Müşteri Kararında
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-black text-slate-900">
              {inProgressQuotes.length}
            </span>
            <span className="text-[11px] font-medium text-sky-600">
              {approvedQuotes.length} Onaylı
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Teklif iletildi, cevap bekleniyor
          </p>
        </div>

        {/* Card 3: Müşteri ile tekrar görüşülecek teklifler */}
        <div
          onClick={() => onNavigateTab('quotes')}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-xs hover:border-amber-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tekrar Görüşülecek
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-black text-slate-900">
              {followUpQuotes.length}
            </span>
            <span className="text-[11px] font-medium text-amber-600">3+ gün</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Müşteri ile tekrar görüşün
          </p>
        </div>

        {/* Card 4: Bugünkü Takvim & Ajanda */}
        <div 
          onClick={() => onNavigateTab('calendar')}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-xs hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Bugünkü Ajanda
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-black text-slate-900">
              {todayEvents.length}
            </span>
            <span className="text-[11px] font-medium text-purple-600">
              {events.filter((e) => !e.completed).length} Bekleyen
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Saha ziyareti ve takip notları
          </p>
        </div>

      </div>

    </div>
  );
};
