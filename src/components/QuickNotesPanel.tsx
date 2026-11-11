import React, { useMemo, useState } from 'react';
import { Activity, Bell, Check, ChevronDown, Pin, Trash2 } from 'lucide-react';
import { QuickNote, ActivityLog, UserRole } from '../types';
import { NoteComposer } from './NoteComposer';
import { formatReminder } from '../lib/noteTime';
import { listCard, UnderlineTabs, IconBtn, useWide } from './ListUI';

interface QuickNotesPanelProps {
  notes: QuickNote[];
  activities: ActivityLog[];
  currentRole: UserRole;
  onSaveNote: (note: QuickNote) => void;
  onDeleteNote: (id: string) => void;
  highlightId?: string | null;
}

type Filter = 'open' | 'remind' | 'done';

/** Notlar: üstte yazma kutusu (ses + hatırlatma), altında sade liste */
export const QuickNotesPanel: React.FC<QuickNotesPanelProps> = ({ notes, activities, currentRole, onSaveNote, onDeleteNote, highlightId }) => {
  const [filter, setFilter] = useState<Filter>('open');
  const [editing, setEditing] = useState<QuickNote | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const wide = useWide('md');

  const list = useMemo(() => {
    const f = notes.filter(n => (filter === 'done' ? n.done : !n.done) && (filter !== 'remind' || !!n.remindAt));
    return f.sort((a, b) => {
      if (filter === 'remind') return (a.remindAt || '').localeCompare(b.remindAt || '');
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [notes, filter]);

  const counts = {
    open: notes.filter(n => !n.done).length,
    remind: notes.filter(n => !n.done && n.remindAt).length,
    done: notes.filter(n => n.done).length,
  };
  const now = Date.now();
  const tabLabel = (label: string, n: number) => <>{label} <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] tabular-nums">{n}</span></>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
     <div className="space-y-3 min-w-0">
      <NoteComposer
        currentRole={currentRole}
        editing={editing}
        onSave={n => { onSaveNote(n); setEditing(null); }}
        onCancelEdit={() => setEditing(null)}
      />

      <div className={`${listCard} overflow-hidden`}>
        <div className="px-2 pt-1">
          <UnderlineTabs<Filter> value={filter} onChange={setFilter} items={[
            { key: 'open', label: tabLabel('Notlar', counts.open) },
            { key: 'remind', label: tabLabel('Hatırlatmalı', counts.remind) },
            { key: 'done', label: tabLabel('Tamamlanan', counts.done) },
          ]} />
        </div>
        <div className="divide-y divide-slate-100">
        {list.length === 0 && <p className="py-10 text-center text-sm text-slate-500">{filter === 'done' ? 'Tamamlanan not yok.' : filter === 'remind' ? 'Hatırlatmalı not yok.' : 'Not yok. Yukarıya yazıp kaydedin.'}</p>}
        {list.map(n => {
          const overdue = n.remindAt && !n.done && new Date(n.remindAt).getTime() < now;
          return (
            <div key={n.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-brand-50/40 ${highlightId === n.id ? 'bg-amber-50' : ''} ${editing?.id === n.id ? 'bg-brand-50' : ''}`}>
              <button onClick={() => onSaveNote({ ...n, done: !n.done })} title={n.done ? 'Geri al' : 'Tamamlandı'}
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${n.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-500'}`}>
                {n.done && <Check className="w-3 h-3" />}
              </button>
              <button onClick={() => setEditing(n)} className="min-w-0 flex-1 text-left">
                <div className={`text-[15px] font-medium leading-snug whitespace-pre-wrap break-words ${n.done ? 'line-through text-slate-500' : 'text-slate-900'}`}>{n.content}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  {n.remindAt && (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold ${overdue ? 'bg-rose-50 text-rose-700' : n.remindedAt ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-800'}`}>
                      <Bell className="w-3 h-3" /> {formatReminder(n.remindAt)}{n.remindedAt ? ' · bildirildi' : ''}
                    </span>
                  )}
                  <span>{new Date(n.createdAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{n.author === 'istanbul' ? 'İstanbul' : n.author === 'isparta' ? 'Isparta' : n.author}</span>
                  {n.updatedBy && n.updatedAt && n.updatedAt !== n.createdAt && <span title={new Date(n.updatedAt).toLocaleString('tr-TR')}>· değiştiren: {n.updatedBy}</span>}
                </div>
              </button>
              <div className="flex items-center shrink-0">
                <button type="button" onClick={() => onSaveNote({ ...n, pinned: !n.pinned })} title={n.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'} aria-label="Sabitle"
                  className={`w-8 h-8 inline-flex items-center justify-center rounded-lg ${n.pinned ? 'text-brand-600 bg-brand-50' : 'text-slate-500 hover:bg-slate-100'}`}>
                  <Pin className={`w-4 h-4 ${n.pinned ? 'fill-current' : ''}`} />
                </button>
                <IconBtn danger title="Sil" onClick={() => onDeleteNote(n.id)}><Trash2 className="w-4 h-4" /></IconBtn>
              </div>
            </div>
          );
        })}
        </div>
      </div>
     </div>

      {/* Son hareketler: tablet/bilgisayarda açık (geniş ekranda sağda), telefonda katlanır */}
      <div className={`${listCard} overflow-hidden lg:sticky lg:top-4`}>
        <button onClick={() => setShowActivity(s => !s)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-slate-800 md:pointer-events-none">
          <span className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Activity className="w-4 h-4" /></span> Son hareketler
          <ChevronDown className={`w-4 h-4 ml-auto text-slate-500 transition md:hidden ${showActivity ? 'rotate-180' : ''}`} />
        </button>
        {(showActivity || wide) && (
          <div className="divide-y divide-slate-100 border-t border-slate-100 max-h-96 lg:max-h-[calc(100vh-10rem)] overflow-y-auto">
            {activities.length === 0 && <p className="py-6 text-center text-xs text-slate-500">Henüz hareket yok.</p>}
            {activities.slice(0, 40).map(a => (
              <div key={a.id} className="px-4 py-2.5 text-xs">
                <div className="font-bold text-slate-800">{a.action}</div>
                <div className="text-slate-500 break-words">{a.description}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{new Date(a.timestamp).toLocaleString('tr-TR')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
