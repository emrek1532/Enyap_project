import React from 'react';
import { 
  Flame, 
  MapPin, 
  Building2, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Lock, 
  Bell, 
  Plus, 
  Smartphone, 
  Monitor,
  Share2
} from 'lucide-react';
import { UserRole, SyncStatus } from '../types';

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  syncStatus: SyncStatus;
  onTriggerSync: () => void;
  onOpenNewQuote: () => void;
  onOpenSyncModal: () => void;
  urgentCount: number;
  todayShipmentCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  syncStatus,
  onTriggerSync,
  onOpenNewQuote,
  onOpenSyncModal,
  urgentCount,
  todayShipmentCount,
}) => {
  return (
    <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-30 border-b border-slate-800">
      {/* Top Notification Bar if there are urgent items */}
      {(urgentCount > 0 || todayShipmentCount > 0) && (
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-1.5 text-xs sm:text-sm font-medium flex items-center justify-between text-white shadow-inner">
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
          <span className="text-amber-100 text-xs shrink-0 hidden sm:inline">Enyap Isı Saha & Ofis Eşitlemesi Aktif</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Logo & Company Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-orange-500 via-amber-500 to-sky-600 flex items-center justify-center shadow-md shadow-orange-500/20 ring-2 ring-white/10">
              <Flame className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base sm:text-xl tracking-tight text-white">
                  ENYAP <span className="text-orange-400">ISI</span>
                </span>
                <span className="text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 hidden xs:inline">
                  PORTAL
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium hidden sm:block">
                Saha & Ofis İş Birliği | Teklif, Sipariş & Takvim Takibi
              </p>
            </div>
          </div>

          {/* Active Profile / Location Switcher */}
          <div className="flex items-center gap-1 sm:gap-2 bg-slate-800/80 p-1 rounded-xl border border-slate-700/80">
            <button
              onClick={() => onRoleChange('isparta')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentRole === 'isparta'
                  ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
              title="Şakir Emre - Isparta Saha Satış Mühendisi Modu (Mobil Optimize)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Isparta Saha: </span>
              <span>Şakir Emre</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            </button>

            <button
              onClick={() => onRoleChange('istanbul')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentRole === 'istanbul'
                  ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
              title="İstanbul Merkez Ofis - Satış & Operasyon Modu"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">İstanbul: </span>
              <span>Merkez Ofis</span>
            </button>
          </div>

          {/* Actions: Sync, E2EE, New Quote */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* E2EE Lock Status */}
            <button
              onClick={onOpenSyncModal}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-400 text-xs hover:bg-emerald-900/50 transition-colors"
              title="AES-256 Uçtan Uca Şifreleme Aktif"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-[11px] font-medium">Uçtan Uca Şifreli</span>
            </button>

            {/* Cloud Sync Button */}
            <button
              onClick={onTriggerSync}
              disabled={syncStatus.isSyncing}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all"
              title="Bulut ile Senkronize Et"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">
                {syncStatus.isSyncing ? 'Eşitleniyor...' : 'Senkronize Et'}
              </span>
              <span className={`w-2 h-2 rounded-full ${syncStatus.isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </button>

            {/* Data Transfer / Backup modal */}
            <button
              onClick={onOpenSyncModal}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1"
              title="Cihazlar Arası Veri Aktarımı / Yedekleme"
            >
              <Share2 className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Aktar / Paylaş</span>
            </button>

            {/* Quick Add Quote button */}
            <button
              onClick={onOpenNewQuote}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs sm:text-sm font-bold shadow-md shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span>+ Teklif Gir</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
