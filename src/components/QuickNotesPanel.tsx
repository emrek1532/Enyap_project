import React, { useMemo, useState } from 'react';
import { Activity, Bell, Check, ChevronDown, Pin, Trash2 } from 'lucide-react';
import { QuickNote, ActivityLog, UserRole } from '../types';
import { NoteComposer } from './NoteComposer';
import { formatReminder } from '../lib/noteTime';

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
  const tab = (f: Filter, label: string) => (
    <button onClick={() => setFilter(f)}
      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold ${filter === f ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>
      {label} <span className="font-semibold opacity-60">{counts[f]}</span>
    </button>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <NoteComposer
        currentRole={currentRole}
        editing={editing}
        onSave={n => { onSaveNote(n); setEditing(null); }}
        onCancelEdit={() => setEditing(null)}
      />

      <div className="flex gap-1 p-1 rounded-xl bg-slate-200/70 w-fit">
        {tab('open', 'Notlar')}
        {tab('remind', 'Hatırlatmalı')}
        {tab('done', 'Tamamlanan')}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Not yok.</p>}
        {list.map(n => {
          const overdue = n.remindAt && !n.done && new Date(n.remindAt).getTime() < now;
          return (
            <div key={n.id} className={`flex items-start gap-2.5 px-3 py-2.5 ${highlightId === n.id ? 'bg-amber-50' : ''} ${editing?.id === n.id ? 'bg-brand-50' : ''}`}>
              <button onClick={() => onSaveNote({ ...n, done: !n.done })} title={n.done ? 'Geri al' : 'Tamamlandı'}
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${n.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-500'}`}>
                {n.done && <Check className="w-3 h-3" />}
              </button>
              <button onClick={() => setEditing(n)} className="min-w-0 flex-1 text-left">
                <div className={`text-sm leading-snug whitespace-pre-wrap break-words ${n.done ? 'line-through text-slate-400' : 'text-slate-900'}`}>{n.content}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                  {n.remindAt && (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold ${overdue ? 'bg-rose-50 text-rose-700' : n.remindedAt ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-800'}`}>
                      <Bell className="w-3 h-3" /> {formatReminder(n.remindAt)}{n.remindedAt ? ' · bildirildi' : ''}
                    </span>
                  )}
                  <span>{new Date(n.createdAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{n.author === 'istanbul' ? 'İstanbul' : n.author === 'isparta' ? 'Isparta' : n.author}</span>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => onSaveNote({ ...n, pinned: !n.pinned })} title="Sabitle"
                  className={`p-1.5 rounded-lg ${n.pinned ? 'text-brand-600' : 'text-slate-300 hover:text-slate-500'}`}>
                  <Pin className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onDeleteNote(n.id)} title="Sil" className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Son hareketler (kapalı başlar) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <button onClick={() => setShowActivity(s => !s)} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-700">
          <Activity className="w-4 h-4 text-slate-400" /> Son hareketler
          <ChevronDown className={`w-4 h-4 ml-auto text-slate-400 transition ${showActivity ? 'rotate-180' : ''}`} />
        </button>
        {showActivity && (
          <div className="divide-y divide-slate-100 border-t border-slate-100 max-h-96 overflow-y-auto">
            {activities.slice(0, 40).map(a => (
              <div key={a.id} className="px-3 py-2 text-xs">
                <div className="font-bold text-slate-800">{a.action}</div>
                <div className="text-slate-500 break-words">{a.description}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{new Date(a.timestamp).toLocaleString('tr-TR')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
