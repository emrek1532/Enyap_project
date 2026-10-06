import React from 'react';
import { Flame, RefreshCw, Plus, LogOut } from 'lucide-react';
import { SyncStatus } from '../types';

interface HeaderProps {
  syncStatus: SyncStatus;
  onTriggerSync: () => void;
  onOpenNewQuote: () => void;
  onSignOut: () => void;
  userEmail: string;
  urgentCount: number;
  todayShipmentCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  syncStatus,
  onTriggerSync,
  onOpenNewQuote,
  onSignOut,
  userEmail,
  urgentCount,
  todayShipmentCount,
}) => {
  return (
    <header className="bg-slate-900 text-white shadow-lg border-b border-slate-800 pt-safe">
      {/* Top Notification Bar if there are urgent items */}
      {(urgentCount > 0 || todayShipmentCount > 0) && (
        <div className="bg-gradient-to-r from-amber-600 to-brand-600 px-4 py-1.5 text-xs sm:text-sm font-medium flex items-center justify-between text-white shadow-inner">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="flex h-2 w-2 rounded-full bg-white animate-ping shrink-0" />
            <span className="truncate">
              {urgentCount > 0 && (
                <span className="mr-3 font-semibold">⚠️ {urgentCount} Teklif acil işlem bekliyor!</span>
              )}
              {todayShipmentCount > 0 && (
                <span className="font-semibold">🚚 Bugün sevk edilmesi gereken {todayShipmentCount} sipariş var!</span>
              )}
            </span>
          </div>
          
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Logo & Company Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-brand-500 via-amber-500 to-sky-600 flex items-center justify-center shadow-md shadow-brand-500/20 ring-2 ring-white/10">
              <Flame className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base sm:text-xl tracking-tight text-white">
                  ENYAP <span className="text-brand-400">ISI</span>
                </span>
                <span className="text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 hidden xs:inline">
                  PORTAL
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium hidden md:block">
                Saha & Ofis İş Birliği | Teklif, Sipariş & Takvim Takibi
              </p>
            </div>
          </div>

          {/* Actions: Sync, E2EE, New Quote */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 whitespace-nowrap">
            {/* Cloud Sync Button */}
            <button
              onClick={onTriggerSync}
              disabled={syncStatus.isSyncing}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all"
              title="Bulut ile Senkronize Et"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {syncStatus.isSyncing ? 'Eşitleniyor...' : 'Senkronize Et'}
              </span>
              <span className={`w-2 h-2 rounded-full ${syncStatus.isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </button>

            {/* Quick Add Quote button */}
            <button
              onClick={onOpenNewQuote}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-amber-500 hover:from-brand-600 hover:to-amber-600 text-white text-xs sm:text-sm font-bold shadow-md shadow-brand-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">+ Teklif Gir</span>
            </button>

            {/* Sign out */}
            <button
              onClick={onSignOut}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
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
