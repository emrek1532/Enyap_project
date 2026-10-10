import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Plus, LogOut, Bell, BellOff, LayoutGrid, ChevronDown } from 'lucide-react';
import { disablePush, enablePush, pushEnabled, pushSupported } from '../lib/push';
import { BrandLogo } from './BrandLogo';
import { SyncStatus } from '../types';

interface HeaderProps {
  syncStatus: SyncStatus;
  onTriggerSync: () => void;
  onOpenNewQuote: () => void;
  onSignOut: () => void;
  userEmail: string;
  urgentCount: number;
  onHome: () => void;
  /** Açılır menüdeki bölümler (yetkiye göre süzülmüş) */
  sections?: { id: string; title: string; icon: React.ElementType; tone: string }[];
  activeSection?: string;
  onOpenSection?: (id: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  syncStatus,
  onTriggerSync,
  onOpenNewQuote,
  onSignOut,
  userEmail,
  urgentCount,
  onHome,
  sections = [],
  activeSection,
  onOpenSection,
}) => {
  // Bölümler menüsü: dışarı tıklayınca / Esc ile kapanır
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [menu]);
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
          <button onClick={onHome} className="flex items-center gap-3 shrink-0 min-w-0 text-left" title="Ana Sayfa">
            <BrandLogo className="h-7 sm:h-9" />
            <span className="hidden md:block pl-3 border-l border-slate-200 text-xs font-semibold text-slate-500 leading-tight">
              Isı Sistemleri<br />Teklif & Sipariş Takibi
            </span>
          </button>

          {/* Actions: Menü, Sync, New Quote, Sign out */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 whitespace-nowrap">
            {sections.length > 0 && onOpenSection && (
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenu(m => !m)}
                  aria-expanded={menu}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-bold transition-colors ${menu ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>Menü</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menu ? 'rotate-180' : ''}`} />
                </button>
                {menu && (
                  <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-14 sm:top-full sm:mt-2 sm:w-80 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-2 grid grid-cols-2 gap-1">
                    {sections.map(sec => (
                      <button
                        key={sec.id}
                        onClick={() => { setMenu(false); onOpenSection(sec.id); }}
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-sm font-bold whitespace-normal ${activeSection === sec.id ? 'bg-brand-50 text-brand-800' : 'text-slate-800 hover:bg-slate-50'}`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${sec.tone}`}><sec.icon className="w-4 h-4" /></span>
                        <span className="min-w-0 leading-tight">{sec.title}</span>
                      </button>
                    ))}
                    {/* Telefonda üst çubuğa sığmayanlar */}
                    <div className="sm:hidden col-span-2 mt-1 pt-2 border-t border-slate-100 grid grid-cols-2 gap-1">
                      {push !== null && (
                        <button onClick={() => { setMenu(false); togglePush(); }}
                          className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50">
                          {push ? <Bell className="w-4 h-4 text-brand-600" /> : <BellOff className="w-4 h-4 text-slate-400" />}
                          {push ? 'Bildirim açık' : 'Bildirimi aç'}
                        </button>
                      )}
                      <button onClick={() => { setMenu(false); onSignOut(); }}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50">
                        <LogOut className="w-4 h-4" /> Çıkış yap
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
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

            {/* Bildirimler */}
            {push !== null && (
              <button
                onClick={togglePush}
                className={`${sections.length ? 'hidden sm:block ' : ''}p-1.5 rounded-lg border ${push ? 'bg-brand-50 border-brand-200 text-brand-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                title={push ? 'Bildirimler açık (kapatmak için dokunun)' : 'Teklif hatırlatma bildirimlerini aç'}
              >
                {push ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
              </button>
            )}

            {/* Sign out */}
            <button
              onClick={onSignOut}
              className={`${sections.length ? 'hidden sm:block ' : ''}p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200`}
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
