import React, { useEffect, useState } from 'react';
import { RefreshCw, LogOut, Bell, BellOff, Home } from 'lucide-react';
import { HelpGuide } from './HelpGuide';
import { disablePush, enablePush, pushEnabled, pushSupported } from '../lib/push';
import { BrandLogo } from './BrandLogo';
import { SyncStatus } from '../types';

interface HeaderProps {
  syncStatus: SyncStatus;
  onTriggerSync: () => void;
  onSignOut: () => void;
  userEmail: string;
  onHome: () => void;
  /** Açılır menüdeki bölümler (yetkiye göre süzülmüş) */
  sections?: { id: string; title: string; icon: React.ElementType; tone: string }[];
  activeSection?: string;
  onOpenSection?: (id: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  syncStatus,
  onTriggerSync,
  onSignOut,
  userEmail,
  onHome,
  sections = [],
  activeSection,
  onOpenSection,
}) => {
  // Bildirim (teklif hatırlatma) aç/kapat
  const [push, setPush] = useState<boolean | null>(null);
  useEffect(() => { if (pushSupported()) pushEnabled().then(setPush, () => setPush(false)); }, []);
  const togglePush = async () => {
    try {
      if (push) { await disablePush(); setPush(false); alert('Bu cihazda bildirimler kapatıldı.'); }
      else { await enablePush(userEmail); setPush(true); alert('Bildirimler açıldı. Bekleyen teklifler 2 gün sonra size hatırlatılacak.'); }
    } catch (e) { alert(e instanceof Error ? e.message : 'Bildirim açılamadı.'); }
  };
  return (
    <header className="bg-white text-slate-900 shadow-sm border-b border-slate-200 pt-safe">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Logo */}
          <button onClick={onHome} className="flex items-center gap-3 shrink-0 min-w-0 text-left" title="Ana Sayfa">
            <BrandLogo className="h-7 sm:h-9" />
            <span className="hidden md:block pl-3 border-l border-slate-200 text-xs font-semibold text-slate-500 leading-tight">
              Isı Sistemleri<br />Teklif & Satış Takibi
            </span>
          </button>

          {/* Actions: eşitleme durumu, bildirim, kılavuz, çıkış */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 whitespace-nowrap">
            {/* Cloud Sync Button */}
            <button
              onClick={onTriggerSync}
              disabled={syncStatus.isSyncing}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium transition-all"
              title={syncStatus.isSyncing ? 'Eşitleniyor…' : syncStatus.isOnline ? 'Çevrimiçi · eşitlemek için dokunun' : 'Çevrimdışı · kayıtlar bağlantı gelince gönderilir'}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-brand-500 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
              <span className={`w-2 h-2 rounded-full ${syncStatus.isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </button>

            {/* Bildirimler */}
            {push !== null && (
              <button
                onClick={togglePush}
                className={`${sections.length ? 'hidden md:block ' : ''}p-1.5 rounded-lg border ${push ? 'bg-brand-50 border-brand-200 text-brand-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                title={push ? 'Bildirimler açık (kapatmak için dokunun)' : 'Teklif hatırlatma bildirimlerini aç'}
              >
                {push ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
              </button>
            )}

            <HelpGuide variant="icon" className={sections.length ? 'hidden md:block' : ''} />

            {/* Sign out */}
            <button
              onClick={onSignOut}
              className={`${sections.length ? 'hidden md:block ' : ''}p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200`}
              title={`Çıkış Yap (${userEmail})`}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </div>
      {/* Bilgisayarda bölüm sekmeleri (telefonda alttaki menü kullanılır) */}
      {sections.length > 0 && onOpenSection && (
        <nav className="hidden md:block border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center gap-1 overflow-x-auto">
            <button onClick={onHome}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap ${activeSection === 'home' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
              <Home className="w-4 h-4" /> Ana Sayfa
            </button>
            {sections.map(sec => (
              <button key={sec.id} onClick={() => onOpenSection(sec.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap ${activeSection === sec.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                <sec.icon className="w-4 h-4" /> {sec.title}
              </button>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
};
