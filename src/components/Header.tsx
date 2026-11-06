import React, { useEffect, useState } from 'react';
import { RefreshCw, Bell, BellOff, Search, LogOut } from 'lucide-react';
import { HelpGuide } from './HelpGuide';
import { disablePush, enablePush, pushEnabled, pushSupported } from '../lib/push';
import { BrandLogo } from './BrandLogo';
import { initials } from './Sidebar';
import { SyncStatus } from '../types';

interface HeaderProps {
  syncStatus: SyncStatus;
  onTriggerSync: () => void;
  onHome: () => void;
  userName: string;
  userEmail: string;
  roleLabel: string;
  /** "Arama yap…" kutusu: dokununca Ara kısayolu açılır */
  onSearch?: () => void;
}

/**
 * Üst çubuk: telefonda logo, bilgisayar/tablette arama kutusu; sağda eşitleme, bildirim, kılavuz, kullanıcı.
 * Bölümler bilgisayar/tablette soldaki menüde, telefonda alttaki menüde.
 */
export const Header: React.FC<HeaderProps> = ({ syncStatus, onTriggerSync, onHome, userName, userEmail, roleLabel, onSearch }) => {
  const [push, setPush] = useState<boolean | null>(null);
  useEffect(() => { if (pushSupported()) pushEnabled().then(setPush, () => setPush(false)); }, []);
  const togglePush = async () => {
    try {
      if (push) { await disablePush(); setPush(false); alert('Bu cihazda bildirimler kapatıldı.'); }
      else { await enablePush(userEmail); setPush(true); alert('Bildirimler açıldı. Bekleyen teklifler 2 gün sonra size hatırlatılacak.'); }
    } catch (e) { alert(e instanceof Error ? e.message : 'Bildirim açılamadı.'); }
  };
  const iconBtn = 'w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white border border-slate-200/80 shadow-xs text-slate-600 hover:text-brand-600 hover:border-brand-200 transition';
  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/70 pt-safe">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center gap-2 sm:gap-4">
        {/* Telefonda logo (bilgisayar/tablette soldaki menüde) */}
        <button onClick={onHome} className="md:hidden shrink-0" title="Ana Sayfa"><BrandLogo className="h-6" /></button>

        {onSearch ? (
          <button onClick={onSearch}
            className="flex-1 min-w-0 max-w-md flex items-center gap-2.5 h-10 px-3.5 rounded-full bg-white border border-slate-200 shadow-xs text-sm text-slate-400 hover:border-brand-300 transition text-left ml-auto md:ml-0">
            <Search className="w-4 h-4 text-slate-500 shrink-0" /> <span className="truncate">Arama yap…</span>
          </button>
        ) : <span className="flex-1" />}

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 md:ml-auto">
          <span className="hidden sm:inline text-[10px] font-medium text-slate-500 tabular-nums select-none" title={`Sürüm ${__APP_VERSION__} · ${__APP_BUILD__}`}>
            v{__APP_VERSION__}
          </span>
          <button onClick={onTriggerSync} disabled={syncStatus.isSyncing} className={`${iconBtn} relative`}
            title={syncStatus.isSyncing ? 'Eşitleniyor…' : syncStatus.isOnline ? 'Çevrimiçi · eşitlemek için dokunun' : 'Çevrimdışı · kayıtlar bağlantı gelince gönderilir'}>
            <RefreshCw className={`w-4 h-4 ${syncStatus.isSyncing ? 'animate-spin text-brand-500' : ''}`} />
            <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ring-2 ring-white ${syncStatus.isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          </button>
          {push !== null && (
            <button onClick={togglePush} className={`${iconBtn} hidden md:flex ${push ? 'text-brand-600' : ''}`}
              title={push ? 'Bildirimler açık (kapatmak için dokunun)' : 'Teklif hatırlatma bildirimlerini aç'}>
              {push ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
          )}
          <HelpGuide variant="icon" className="hidden md:block" />
          <div className="hidden lg:flex items-center gap-2.5 pl-2 ml-1 border-l border-slate-200">
            <span className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-brand-600 text-white flex items-center justify-center text-xs font-black">{initials(userName)}</span>
            <span className="leading-tight max-w-[10rem]">
              <span className="block text-sm font-bold text-slate-800 truncate">{userName}</span>
              <span className="block text-[11px] text-slate-500 truncate">{roleLabel}</span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

/**
 * Sol menünün altındaki kullanıcı kartında duran düğmeler: ara, eşitle, bildirim, kılavuz, çıkış.
 * Bilgisayar/tablette üst çubuk yok; telefonda üst çubuk bunları gösterir.
 */
export const BandTools: React.FC<{ syncStatus: SyncStatus; onSync: () => void; onSearch?: () => void; onSignOut?: () => void; userEmail: string }> = ({ syncStatus, onSync, onSearch, onSignOut, userEmail }) => {
  const [push, setPush] = useState<boolean | null>(null);
  useEffect(() => { if (pushSupported()) pushEnabled().then(setPush, () => setPush(false)); }, []);
  const togglePush = async () => {
    try {
      if (push) { await disablePush(); setPush(false); alert('Bu cihazda bildirimler kapatıldı.'); }
      else { await enablePush(userEmail); setPush(true); alert('Bildirimler açıldı. Bekleyen teklifler 2 gün sonra size hatırlatılacak.'); }
    } catch (e) { alert(e instanceof Error ? e.message : 'Bildirim açılamadı.'); }
  };
  const btn = 'relative w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition';
  return (
    <div className="flex items-center justify-between gap-1">
      {onSearch && <button onClick={onSearch} className={btn} title="Ara, tekliflere sor, teklif hazırla" aria-label="Ara"><Search className="w-4 h-4" /></button>}
      <button onClick={onSync} disabled={syncStatus.isSyncing} className={btn} aria-label="Eşitle"
        title={syncStatus.isSyncing ? 'Eşitleniyor…' : syncStatus.isOnline ? 'Çevrimiçi · eşitlemek için dokunun' : 'Çevrimdışı · kayıtlar bağlantı gelince gönderilir'}>
        <RefreshCw className={`w-4 h-4 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
        <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${syncStatus.isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      </button>
      {push !== null && (
        <button onClick={togglePush} className={`${btn} ${push ? '' : 'text-slate-500'}`} aria-label="Bildirimler"
          title={push ? 'Bildirimler açık (kapatmak için dokunun)' : 'Teklif hatırlatma bildirimlerini aç'}>
          {push ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </button>
      )}
      <HelpGuide variant="dark" className="!bg-transparent !border-0 !text-slate-300 hover:!bg-white/10 hover:!text-white" />
      {onSignOut && <button onClick={onSignOut} className={btn} title="Çıkış yap" aria-label="Çıkış yap"><LogOut className="w-4 h-4" /></button>}
    </div>
  );
};
