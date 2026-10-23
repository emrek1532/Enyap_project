import React, { useRef, useState } from 'react';
import { Loader2, Mic, Square, X } from 'lucide-react';
import { Collection, Expense, Quote, QuoteItem } from '../types';
import { supabase } from '../lib/supabase';
import { canRecord, startRecording, RecordingHandle } from '../lib/recorder';
import { localDay } from '../lib/dates';
import { BANKS, EXPENSE_CATEGORIES, EXPENSE_METHODS } from './LedgerPanel';
import { TURKISH_CITIES } from '../lib/cities';

export type VoiceResult =
  | { kind: 'quote'; draft: Partial<Quote> }
  | { kind: 'collection'; draft: Partial<Collection> }
  | { kind: 'expense'; draft: Partial<Expense> };

const clean = <T extends object>(o: T | null | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== null && v !== undefined && v !== '')) as Partial<T>;

/**
 * Sesli komut: "Ahmet Isı'ya 50 bin çek aldım, vade 30 Kasım" gibi söylenir; konuşma yazıya çevrilip
 * teklif / tahsilat / harcama taslağına dönüştürülür ve ilgili form dolu açılır (kontrol edip kaydedilir).
 */
export const VoiceCommand: React.FC<{
  customers: string[];
  allow: { quote: boolean; collection: boolean; expense: boolean };
  onResult: (r: VoiceResult) => void;
}> = ({ customers, allow, onResult }) => {
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [level, setLevel] = useState(0);
  const handle = useRef<RecordingHandle | null>(null);

  const start = async () => {
    if (!canRecord()) { setMsg({ ok: false, text: 'Bu cihazda ses kaydı desteklenmiyor.' }); return; }
    setMsg(null);
    try {
      const h = await startRecording({ silenceMs: 2200, maxMs: 60000, onLevel: setLevel });
      handle.current = h;
      setState('rec');
      const audio = await h.result;
      handle.current = null;
      if (!audio) { setState('idle'); return; }
      setState('busy');
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch('/api/ai/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          audio, today: localDay(), customers: customers.slice(0, 1500),
          expenseCategories: EXPENSE_CATEGORIES, expenseMethods: EXPENSE_METHODS, regions: TURKISH_CITIES, banks: BANKS,
        }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) throw new Error(out?.message || 'Ses işlenemedi.');
      const r = out?.result;
      const heard = out?.text ? `“${out.text}”` : '';
      if (r?.intent === 'quote' && r.quote && allow.quote) {
        const q = r.quote;
        const items: QuoteItem[] = (q.items || []).map((it: any, i: number) => ({
          id: `it-${Date.now()}-${i}`, code: it.code || undefined, productName: it.query || '', quantity: it.quantity || 1,
          unit: it.unit || 'Adet', unitPrice: it.unitPrice || 0, discount: it.discount || 0, vatRate: 20, totalPrice: 0, currency: it.currency || 'TRY',
        }));
        onResult({ kind: 'quote', draft: { ...clean({ customerName: q.customerName, city: q.city, paymentTerm: q.paymentTerm, notes: q.notes }), ...(items.length ? { items } : {}) } });
      } else if (r?.intent === 'collection' && r.collection && allow.collection) {
        onResult({ kind: 'collection', draft: clean(r.collection) });
      } else if (r?.intent === 'expense' && r.expense && allow.expense) {
        onResult({ kind: 'expense', draft: clean(r.expense) });
      } else {
        setMsg({ ok: false, text: `Anlaşılamadı ${heard}. Örn: "Enorpa'dan 50 bin çek aldım, vade 30 Kasım".` });
        setState('idle');
        return;
      }
      setMsg({ ok: true, text: `${r.reply || 'Form hazırlandı, kontrol edip kaydedin.'} ${heard}` });
      setState('idle');
    } catch (e) {
      handle.current = null;
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Mikrofon açılamadı.' });
      setState('idle');
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => (state === 'rec' ? handle.current?.stop() : state === 'idle' ? start() : undefined)}
        disabled={state === 'busy'}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition ${state === 'rec' ? 'bg-rose-50 border-rose-300' : 'bg-white border-slate-200 hover:border-brand-300'}`}>
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white ${state === 'rec' ? 'bg-rose-600' : 'bg-brand-600'}`}
          style={state === 'rec' ? { boxShadow: `0 0 0 ${Math.round(level * 14)}px rgba(225,29,72,0.2)` } : undefined}>
          {state === 'busy' ? <Loader2 className="w-5 h-5 animate-spin" /> : state === 'rec' ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black text-slate-900">{state === 'rec' ? 'Dinliyorum… bitince susun ya da dokunun' : state === 'busy' ? 'Anlaşılıyor…' : 'Sesle kayıt gir'}</span>
          <span className="block text-[11px] text-slate-500 truncate">Örn: "Ahmet Isı'dan 50 bin çek aldım, vade 30 Kasım" · "Opet'e 2.400 lira yakıt"</span>
        </span>
      </button>
      {msg && (
        <div className={`text-xs rounded-xl px-3 py-2 flex gap-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Kapat"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
};
