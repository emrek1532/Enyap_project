import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, Loader2, Mic, Send, Square, X } from 'lucide-react';
import { QuickNote, UserRole } from '../types';
import { canRecord, startRecording, RecordingHandle } from '../lib/recorder';
import { supabase } from '../lib/supabase';
import { formatReminder, parseReminder, toLocalInput } from '../lib/noteTime';

/** Sesi yazıya çevirir (sunucudaki Whisper) */
async function transcribe(audio: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch('/api/ai/voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ audio, textOnly: true }),
  });
  const out = await res.json().catch(() => null);
  if (!res.ok || !out?.text) throw new Error(out?.message || 'Ses yazıya çevrilemedi.');
  return String(out.text);
}

const nextWeekday = (day: number, hour: number) => {
  const d = new Date();
  let diff = (day - d.getDay() + 7) % 7;
  if (diff === 0 && d.getHours() >= hour) diff = 7;
  d.setDate(d.getDate() + diff); d.setHours(hour, 0, 0, 0);
  return d;
};

/**
 * Not yazma kutusu: yaz ya da mikrofona söyle; "pazartesi 9'da" gibi ifadelerden hatırlatma zamanı
 * kendiliğinden bulunur, hazır seçeneklerle de seçilebilir. Hatırlatma saatinde telefona bildirim gider.
 */
export const NoteComposer: React.FC<{
  currentRole: UserRole;
  editing?: QuickNote | null;
  autoFocus?: boolean;
  onSave: (note: QuickNote) => void;
  onCancelEdit?: () => void;
}> = ({ currentRole, editing, autoFocus, onSave, onCancelEdit }) => {
  const [text, setText] = useState(editing?.content || '');
  const [remindAt, setRemindAt] = useState<string | null>(editing?.remindAt || null);
  const [manualRemind, setManualRemind] = useState(!!editing?.remindAt);
  const [showPicker, setShowPicker] = useState(false);
  const [rec, setRec] = useState<RecordingHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(editing?.content || ''); setRemindAt(editing?.remindAt || null);
    setManualRemind(!!editing?.remindAt); setShowPicker(false);
  }, [editing?.id]);

  // Yazılan metinden hatırlatma zamanı (elle seçilmediyse)
  const detected = useMemo(() => parseReminder(text), [text]);
  useEffect(() => { if (!manualRemind) setRemindAt(detected ? detected.toISOString() : null); }, [detected, manualRemind]);

  const pick = (d: Date | null) => { setManualRemind(true); setRemindAt(d ? d.toISOString() : null); setShowPicker(false); };

  const mic = async () => {
    setErr('');
    if (rec) { rec.stop(); return; }
    if (!canRecord()) { setErr('Bu cihazda ses kaydı desteklenmiyor.'); return; }
    try {
      const h = await startRecording({ silenceMs: 2500, maxMs: 90000 });
      setRec(h);
      const audio = await h.result;
      setRec(null);
      if (!audio) return;
      setBusy(true);
      const said = await transcribe(audio);
      setText(t => (t.trim() ? `${t.trim()} ${said}` : said));
      taRef.current?.focus();
    } catch (e) {
      setRec(null);
      setErr(e instanceof Error ? e.message : 'Ses alınamadı.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const content = text.trim();
    if (!content) return;
    const changedTime = (editing?.remindAt || null) !== remindAt;
    onSave({
      id: editing?.id || 'nt-' + Date.now(),
      content,
      author: editing?.author || currentRole,
      color: editing?.color || 'amber',
      pinned: editing?.pinned ?? false,
      createdAt: editing?.createdAt || new Date().toISOString(),
      remindAt,
      remindedAt: changedTime ? null : editing?.remindedAt || null,
      done: editing?.done || false,
    });
    setText(''); setRemindAt(null); setManualRemind(false); setShowPicker(false);
  };

  const chip = 'px-2.5 py-1 rounded-full border text-xs font-bold whitespace-nowrap';
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-2.5 space-y-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={taRef}
          autoFocus={autoFocus}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); }}
          rows={text.length > 60 ? 3 : 1}
          placeholder={rec ? 'Dinliyorum… konuşun' : 'Not yazın ya da mikrofona söyleyin (ör. "Pazartesi 9\'da Ahmet Bey\'i ara")'}
          className="flex-1 min-w-0 resize-none px-3 py-2 rounded-xl border border-slate-200 text-sm leading-snug focus:outline-none focus:border-brand-400"
        />
        <button type="button" onClick={mic} disabled={busy} title={rec ? 'Kaydı bitir' : 'Sesle yaz'}
          className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${rec ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : rec ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <button type="button" onClick={save} disabled={!text.trim()} title="Kaydet"
          className="shrink-0 w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {remindAt ? (
          <span className={`${chip} inline-flex items-center gap-1 bg-amber-50 border-amber-300 text-amber-800`}>
            <Bell className="w-3 h-3" /> {formatReminder(remindAt)}
            <button type="button" onClick={() => pick(null)} className="ml-0.5 text-amber-600" title="Hatırlatmayı kaldır"><X className="w-3 h-3" /></button>
          </span>
        ) : (
          <span className={`${chip} inline-flex items-center gap-1 border-slate-200 text-slate-400`}><BellOff className="w-3 h-3" /> hatırlatma yok</span>
        )}
        <button type="button" className={`${chip} border-slate-200 text-slate-600`} onClick={() => pick(new Date(Date.now() + 3600e3))}>1 saat</button>
        <button type="button" className={`${chip} border-slate-200 text-slate-600`} onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); pick(d); }}>Yarın 09:00</button>
        <button type="button" className={`${chip} border-slate-200 text-slate-600`} onClick={() => pick(nextWeekday(1, 9))}>Pzt 09:00</button>
        <button type="button" className={`${chip} border-slate-200 text-slate-600`} onClick={() => setShowPicker(s => !s)}>Tarih seç…</button>
        {editing && onCancelEdit && (
          <button type="button" className={`${chip} border-slate-200 text-slate-500 ml-auto`} onClick={onCancelEdit}>Vazgeç</button>
        )}
      </div>
      {showPicker && (
        <input type="datetime-local" defaultValue={toLocalInput(remindAt ? new Date(remindAt) : new Date(Date.now() + 3600e3))}
          onChange={e => e.target.value && pick(new Date(e.target.value))}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
      )}
      {err && <div className="text-xs text-rose-700">{err}</div>}
    </div>
  );
};
