import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { Quote, Order, CalendarEvent, UserRole } from '../types';
import { needsFollowUp } from '../lib/quoteRules';

interface DashboardStatsProps {
  quotes: Quote[];
  orders?: Order[];
  events?: CalendarEvent[];
  currentRole?: UserRole;
  onOpenNewQuote?: () => void;
  onNavigateTab?: (tab: any) => void;
  onShowQuotes: (filter: string) => void;
}

/** Teklifler sayfasının üstündeki uyarı (geciken / takip bekleyen teklifler) */
export const DashboardStats: React.FC<DashboardStatsProps> = ({ quotes, onShowQuotes }) => {
  const now = new Date();

  // Overdue quotes: in 'yeni_talep' status for more than 12 hours
  const overdueQuotes = quotes.filter((q) => {
    if (q.status !== 'yeni_talep') return false;
    const hoursElapsed = (now.getTime() - new Date(q.createdAt).getTime()) / (1000 * 60 * 60);
    return hoursElapsed >= 12;
  });
  const followUpQuotes = quotes.filter(needsFollowUp);

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


    </div>
  );
};
