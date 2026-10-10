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
import { needsFollowUp, PENDING_STATUSES } from '../lib/quoteRules';
import { quoteTry, useRates } from '../lib/rates';

interface DashboardStatsProps {
  quotes: Quote[];
  orders: Order[];
  events: CalendarEvent[];
  currentRole: UserRole;
  onOpenNewQuote: () => void;
  onNavigateTab: (tab: any) => void;
  onShowQuotes: (filter: string) => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  quotes,
  orders,
  events,
  currentRole,
  onOpenNewQuote,
  onNavigateTab,
  onShowQuotes,
}) => {
  const rates = useRates(quotes);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Overdue quotes: in 'yeni_talep' status for more than 24 hours
  const overdueQuotes = quotes.filter((q) => {
    if (q.status !== 'yeni_talep') return false;
    const createdTime = new Date(q.createdAt).getTime();
    const hoursElapsed = (now.getTime() - createdTime) / (1000 * 60 * 60);
    return hoursElapsed >= 12; // warn if >= 12 hours waiting
  });

  // Counts
  const pendingQuotes = quotes.filter((q) => PENDING_STATUSES.includes(q.status));
  const approvedQuotes = quotes.filter((q) => q.status === 'onaylandi');
  const cancelledQuotes = quotes.filter((q) => q.status === 'iptal');
  const approvedTotal = approvedQuotes.reduce((sum, q) => sum + quoteTry(q, rates), 0);
  const followUpQuotes = quotes.filter(needsFollowUp);
  const pendingTotal = pendingQuotes.reduce((sum, q) => sum + quoteTry(q, rates), 0);
  const tl = (v: number) => `${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`;
  const todayEvents = events.filter((e) => e.date === todayStr);

  // Total active pipeline value
  const totalPipeline = quotes
    .filter((q) => q.status !== 'iptal')
    .reduce((sum, q) => sum + quoteTry(q, rates), 0);

  return (
    <div className="space-y-3.5 mb-6">
      
      {/* Critical Attention Banner (Prevents forgotten quotes & delayed shipments) */}
      {(overdueQuotes.length > 0 || followUpQuotes.length > 0) && (
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
                      <span className="underline cursor-pointer" onClick={() => onShowQuotes('aktif')}>
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
                      <span className="underline cursor-pointer" onClick={() => onShowQuotes('takip')}>
                        {followUpQuotes.map((q) => q.customerName).slice(0, 3).join(', ')}
                        {followUpQuotes.length > 3 ? '...' : ''}
                      </span>
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Özet kutucukları (Tahsilat sekmesindeki kutucuklarla aynı düzen) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          {
            key: 'aktif', label: 'Beklemede', Icon: Clock, tone: 'text-purple-600 bg-purple-50', hover: 'hover:border-purple-300',
            value: pendingQuotes.length.toLocaleString('tr-TR'),
            sub: `${tl(pendingTotal)} · müşteri kararı bekleniyor`,
          },
          {
            key: 'onaylandi', label: 'Onaylandı', Icon: Send, tone: 'text-emerald-600 bg-emerald-50', hover: 'hover:border-emerald-300',
            value: approvedQuotes.length.toLocaleString('tr-TR'),
            sub: `${tl(approvedTotal)} · ${cancelledQuotes.length} iptal`,
          },
        ].map(card => (
          <button
            key={card.key}
            onClick={() => onShowQuotes(card.key)}
            className={`text-left bg-white p-4 rounded-xl border border-slate-200 shadow-xs min-w-0 transition-colors ${card.hover}`}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span className={`p-1.5 rounded-lg ${card.tone}`}><card.Icon className="w-4 h-4" /></span>
              {card.label}
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900 tabular-nums">{card.value}</div>
            <div className="text-xs text-slate-500 mt-0.5 tabular-nums">{card.sub}</div>
          </button>
        ))}
      </div>

    </div>
  );
};
