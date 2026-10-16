import React, { useEffect, useState } from 'react';
import { Home, MoreHorizontal, LogOut, Bell, BellOff, X } from 'lucide-react';
import { disablePush, enablePush, pushEnabled, pushSupported } from '../lib/push';

export type NavSection = { id: string; title: string; icon: React.ElementType; tone: string };

/**
 * Telefonda ekranın altındaki sabit menü: en çok kullanılan bölümler tek dokunuşla açılır,
 * diğerleri "Diğer" sayfasında. Bilgisayarda gizlidir (üstteki sekmeler kullanılır).
 */
export const BottomNav: React.FC<{
  sections: NavSection[];
  primary: string[];
  active: string;
  onOpen: (id: string) => void;
  onHome: () => void;
  onSignOut: () => void;
  userEmail: string;
}> = ({ sections, primary, active, onOpen, onHome, onSignOut, userEmail }) => {
  const [more, setMore] = useState(false);
  const main = primary.map(id => sections.find(s => s.id === id)).filter(Boolean) as NavSection[];
  const rest = sections.filter(s => !primary.includes(s.id));
  const [push, setPush] = useState<boolean | null>(null);
  useEffect(() => { if (pushSupported()) pushEnabled().then(setPush, () => setPush(false)); }, []);
  const togglePush = async () => {
    try {
      if (push) { await disablePush(); setPush(false); }
      else { await enablePush(userEmail); setPush(true); }
    } catch (e) { alert(e instanceof Error ? e.message : 'Bildirim açılamadı.'); }
  };
  const item = (key: string, label: string, Icon: React.ElementType, on: boolean, onClick: () => void) => (
    <button key={key} onClick={onClick}
      className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-bold ${on ? 'text-brand-600' : 'text-slate-500'}`}>
      <span className={`w-11 h-7 rounded-full flex items-center justify-center ${on ? 'bg-brand-50' : ''}`}><Icon className="w-5 h-5" /></span>
      <span className="truncate max-w-full">{label}</span>
    </button>
  );
  const moreActive = rest.some(s => s.id === active);
  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-stretch px-1">
          {item('home', 'Ana Sayfa', Home, active === 'home', onHome)}
          {main.map(s => item(s.id, s.title, s.icon, active === s.id, () => onOpen(s.id)))}
          {item('more', 'Diğer', MoreHorizontal, more || moreActive, () => setMore(true))}
        </div>
      </nav>
      {more && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-900/50 flex items-end" onClick={() => setMore(false)}>
          <div className="w-full bg-white rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-black text-slate-900">Diğer bölümler</h3>
              <button onClick={() => setMore(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Kapat"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {rest.map(s => (
                <button key={s.id} onClick={() => { setMore(false); onOpen(s.id); }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-xs font-bold ${active === s.id ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-700'}`}>
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.tone}`}><s.icon className="w-5 h-5" /></span>
                  <span className="text-center leading-tight">{s.title}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
              {push !== null && (
                <button onClick={togglePush} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">
                  {push ? <Bell className="w-4 h-4 text-brand-600" /> : <BellOff className="w-4 h-4 text-slate-400" />}
                  {push ? 'Bildirim açık' : 'Bildirimi aç'}
                </button>
              )}
              <button onClick={() => { setMore(false); onSignOut(); }} className={`${push === null ? 'col-span-2 ' : ''}flex items-center justify-center gap-2 py-2.5 rounded-xl border border-rose-200 text-sm font-semibold text-rose-600`}>
                <LogOut className="w-4 h-4" /> Çıkış yap
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
