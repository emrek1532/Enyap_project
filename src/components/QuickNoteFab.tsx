import React, { useState } from 'react';
import { StickyNote, X } from 'lucide-react';
import { QuickNote, UserRole } from '../types';
import { NoteComposer } from './NoteComposer';

/** Her sayfada küçük "not al" düğmesi: alttan açılan kutuda yaz/söyle, hatırlatma seç, kaydet */
export const QuickNoteFab: React.FC<{ currentRole: UserRole; onSave: (n: QuickNote) => void }> = ({ currentRole, onSave }) => {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <button
        onClick={() => { setOpen(true); setSaved(false); }}
        className="fixed z-40 right-[1.375rem] bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] w-11 h-11 rounded-full bg-amber-400 hover:bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/30 flex items-center justify-center active:scale-95 transition"
        aria-label="Hızlı not" title="Hızlı not al"
      >
        <StickyNote className="w-5 h-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-slate-50 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-black text-slate-900 flex items-center gap-2"><StickyNote className="w-4 h-4 text-amber-500" /> Hızlı not</h3>
              <button onClick={() => setOpen(false)} className="p-1.5 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            {saved && <div className="text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">Not kaydedildi. Bir not daha yazabilirsiniz.</div>}
            <NoteComposer currentRole={currentRole} autoFocus onSave={n => { onSave(n); setSaved(true); }} />
          </div>
        </div>
      )}
    </>
  );
};
