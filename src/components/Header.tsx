import React from 'react';
import { RefreshCw, Plus, LogOut } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { SyncStatus } from '../types';

interface HeaderProps {
  syncStatus: SyncStatus;
  onTriggerSync: () => void;
  onOpenNewQuote: () => void;
  onSignOut: () => void;
  userEmail: string;
  urgentCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  syncStatus,
  onTriggerSync,
  onOpenNewQuote,
  onSignOut,
  userEmail,
  urgentCount,
}) => {
  return (
    <header className="bg-white text-slate-900 shadow-sm border-b border-slate-200 pt-safe">
      {/* Top Notification Bar if there are urgent items */}
      {urgentCount > 0 && (
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs sm:text-sm font-medium flex items-center justify-between text-white shadow-inner">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="flex h-2 w-2 rounded-full bg-white animate-ping shrink-0" />
            <span className="truncate">
              {urgentCount > 0 && (
                <span className="mr-3 font-semibold">⚠️ {urgentCount} Teklif acil işlem bekliyor!</span>
              )}

            </span>
          </div>
          
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <BrandLogo className="h-7 sm:h-9" />
            <span className="hidden md:block pl-3 border-l border-slate-200 text-xs font-semibold text-slate-500 leading-tight">
              Isı Sistemleri<br />Teklif & Sipariş Takibi
            </span>
          </div>

          {/* Actions: Sync, New Quote, Sign out */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 whitespace-nowrap">
            {/* Cloud Sync Button */}
            <button
              onClick={onTriggerSync}
              disabled={syncStatus.isSyncing}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium transition-all"
              title="Bulut ile Senkronize Et"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-brand-500 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {syncStatus.isSyncing ? 'Eşitleniyor...' : 'Senkronize Et'}
              </span>
              <span className={`w-2 h-2 rounded-full ${syncStatus.isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </button>

            {/* Quick Add Quote button */}
            <button
              onClick={onOpenNewQuote}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs sm:text-sm font-bold shadow-sm shadow-brand-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">+ Teklif Gir</span>
            </button>

            {/* Sign out */}
            <button
              onClick={onSignOut}
              className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200"
              title={`Çıkış Yap (${userEmail})`}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
