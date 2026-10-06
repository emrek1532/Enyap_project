import React, { useState } from 'react';
import { 
  StickyNote, 
  Plus, 
  Pin, 
  Trash2, 
  Clock, 
  Activity, 
  User, 
  Send,
  Sparkles
} from 'lucide-react';
import { QuickNote, ActivityLog, UserRole } from '../types';

interface QuickNotesPanelProps {
  notes: QuickNote[];
  activities: ActivityLog[];
  currentRole: UserRole;
  onSaveNote: (note: QuickNote) => void;
  onDeleteNote: (id: string) => void;
}

export const QuickNotesPanel: React.FC<QuickNotesPanelProps> = ({
  notes,
  activities,
  currentRole,
  onSaveNote,
  onDeleteNote,
}) => {
  const [newNoteContent, setNewNoteContent] = useState('');
  const [selectedColor, setSelectedColor] = useState<QuickNote['color']>('amber');

  const colorClasses = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    sky: 'bg-sky-50 border-sky-200 text-sky-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    rose: 'bg-rose-50 border-rose-200 text-rose-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;

    const note: QuickNote = {
      id: 'nt-' + Date.now(),
      content: newNoteContent.trim(),
      author: currentRole,
      color: selectedColor,
      pinned: true,
      createdAt: new Date().toISOString(),
    };

    onSaveNote(note);
    setNewNoteContent('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      
      {/* Sticky Notes Section (2 cols on lg) */}
      <div className="lg:col-span-2 space-y-4">
        
        {/* Create Note Input */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-2">
            <StickyNote className="w-4 h-4 text-orange-500" />
            <span>Ortak Hızlı Not / Ofis & Saha Mesajı Ekle</span>
          </h3>

          <form onSubmit={handleCreateNote} className="space-y-3">
            <textarea
              rows={2}
              required
              placeholder="Örn: Bucak mermer fabrikası kaskad kazan stokları teyit edildi. Ambar saat 17:00'ye kadar yükleme alıyor..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />

            <div className="flex items-center justify-between">
              {/* Color options */}
              <div className="flex items-center gap-1.5">
                {(['amber', 'sky', 'emerald', 'rose', 'purple'] as QuickNote['color'][]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${
                      c === 'amber' ? 'bg-amber-400' :
                      c === 'sky' ? 'bg-sky-400' :
                      c === 'emerald' ? 'bg-emerald-400' :
                      c === 'rose' ? 'bg-rose-400' : 'bg-purple-400'
                    } ${selectedColor === c ? 'scale-125 border-slate-900' : 'border-transparent'}`}
                  />
                ))}
              </div>

              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Notu Paylaş</span>
              </button>
            </div>
          </form>
        </div>

        {/* Notes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {notes.length === 0 ? (
            <div className="col-span-full bg-white p-6 rounded-xl border border-slate-200 text-center text-xs text-slate-400">
              Henüz paylaşılmış bir not bulunmuyor.
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className={`p-3.5 rounded-xl border shadow-2xs space-y-2.5 relative flex flex-col justify-between ${
                  colorClasses[note.color] || colorClasses.amber
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold opacity-80 border-b border-black/10 pb-1 mb-2">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {note.author === 'isparta' ? 'Şakir Emre (Isparta)' : 'İstanbul Ofis'}
                    </span>
                    <button
                      onClick={() => onSaveNote({ ...note, pinned: !note.pinned })}
                      className="hover:scale-110 transition-transform"
                      title={note.pinned ? 'Sabitlendi' : 'Sabitle'}
                    >
                      <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'fill-current' : 'opacity-50'}`} />
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm font-medium whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[10px] opacity-70 pt-2 border-t border-black/10">
                  <span>{new Date(note.createdAt).toLocaleDateString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <button
                    onClick={() => onDeleteNote(note.id)}
                    className="hover:text-rose-700 transition-colors"
                    title="Notu Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      {/* Real-time Activity Timeline (1 col on lg) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-sky-500" />
            <span>Saha & Ofis Canlı Akışı</span>
          </h3>
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
            Son İşlemler
          </span>
        </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {activities.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Kayıtlı işlem akışı yok.</p>
          ) : (
            activities.map((act) => (
              <div key={act.id} className="flex items-start gap-2.5 text-xs pb-2 border-b border-slate-100 last:border-0">
                <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-slate-800 truncate">{act.action}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(act.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px] mt-0.5 leading-snug">
                    {act.description}
                  </p>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {act.author === 'isparta' ? 'Şakir Emre' : 'İstanbul Ofis'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

    </div>
  );
};
