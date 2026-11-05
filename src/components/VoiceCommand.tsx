import React, { useRef, useState } from 'react';
import { Loader2, Mic, Send, Square, X } from 'lucide-react';
import { PastList, ToolCard, pushPast, readPast } from './ToolCard';
import { Collection, Expense, Quote, QuoteItem } from '../types';
import { supabase } from '../lib/supabase';
import { canRecord, startRecording, RecordingHandle } from '../lib/recorder';
import { canSpeech, listen, SpeechSession } from '../lib/speech';
import { localDay } from '../lib/dates';
import { BANKS, EXPENSE_CATEGORIES, EXPENSE_METHODS } from './LedgerPanel';
import { TURKISH_CITIES } from '../lib/cities';

export type VoiceResult =
  | { kind: 'quote'; draft: Partial<Quote> }
  | { kind: 'collection'; draft: Partial<Collection> }
  | { kind: 'expense'; draft: Partial<Expense> };

const HIST_KEY = 'voice-history';
const KIND_LABEL = { quote: 'Teklif', collection: 'Tahsilat', expense: 'Harcama' } as const;
const EXAMPLES = [
  { kind: 'collection' as const, text: 'Ahmet Isı\'dan 50 bin çek aldım, vade 30 Kasım' },
  { kind: 'expense' as const, text: 'Opet\'e 2.400 lira yakıt, kredi kartı' },
  { kind: 'quote' as const, text: 'Gemfa\'ya 10 adet 2 inç küresel vana teklifi' },
];

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
  const [live, setLive] = useState('');
  const handle = useRef<RecordingHandle | SpeechSession | null>(null);
  const [typed, setTyped] = useState('');
  const [hist, setHist] = useState(() => readPast(HIST_KEY));

  const start = async () => {
    const useSpeech = canSpeech();
    if (!useSpeech && !canRecord()) { setMsg({ ok: false, text: 'Bu cihazda ses kaydı desteklenmiyor.' }); return; }
    setMsg(null);
    setLive('');
    try {
      // Telefonun kendi tanıyıcısı varsa yazıya çevirme cihazda yapılır (hızlı, kota harcamaz);
      // yoksa ses kaydedilip sunucudaki Whisper'a gönderilir.
      let payload: { text: string } | { audio: string };
      if (useSpeech) {
        const s = listen({ onInterim: setLive });
        handle.current = s;
        setState('rec');
        const said = await s.result;
        handle.current = null;
        if (!said) { setState('idle'); setMsg({ ok: false, text: 'Ses algılanamadı, tekrar deneyin.' }); return; }
        setLive(said);
        payload = { text: said };
      } else {
        const h = await startRecording({ silenceMs: 2200, maxMs: 60000, onLevel: setLevel });
        handle.current = h;
        setState('rec');
        const audio = await h.result;
        handle.current = null;
        if (!audio) { setState('idle'); return; }
        payload = { audio };
      }
      await process(payload);
    } catch (e) {
      handle.current = null;
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Mikrofon açılamadı.' });
      setState('idle');
    }
  };

  /** Söylenen (ya da yazılan) cümleyi sunucuda anlamlandırır, ilgili formu dolu açar */
  const process = async (payload: { text: string } | { audio: string }) => {
    setMsg(null);
    try {
      setState('busy');
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch('/api/ai/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          ...payload, today: localDay(), customers: customers.slice(0, 1500),
          expenseCategories: EXPENSE_CATEGORIES, expenseMethods: EXPENSE_METHODS, regions: TURKISH_CITIES, banks: BANKS,
        }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) throw new Error(out?.message || 'Ses işlenemedi.');
      const r = out?.result;
      const heard = out?.text ? `“${out.text}”` : '';
      const said = String(out?.text || ('text' in payload ? payload.text : '')).trim();
      const kind = r?.intent as keyof typeof KIND_LABEL | undefined;
      if (said && kind && KIND_LABEL[kind] && r[kind] && allow[kind]) setHist(pushPast(HIST_KEY, said, KIND_LABEL[kind]));
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
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Ses işlenemedi.' });
      setState('idle');
    }
  };
  const sendTyped = (e: React.FormEvent) => { e.preventDefault(); const t = typed.trim(); if (t && state === 'idle') { setTyped(''); process({ text: t }); } };
  const examples = EXAMPLES.filter(x => allow[x.kind]);

  return (
    <ToolCard icon={Mic} tone="rose" title="Sesle kayıt" subtitle="Söyleyin ya da yazın: teklif, tahsilat veya harcama formu dolu açılır, siz kaydedersiniz.">
      {/* Büyük mikrofon düğmesi */}
      <div className="flex flex-col items-center gap-2 py-1">
        <button
          onClick={() => (state === 'rec' ? handle.current?.stop() : state === 'idle' ? start() : undefined)}
          disabled={state === 'busy'} aria-label={state === 'rec' ? 'Dinlemeyi bitir' : 'Konuşmaya başla'}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-md transition ${state === 'rec' ? 'bg-rose-600' : 'bg-brand-600 hover:bg-brand-700'}`}
          style={state === 'rec' ? { boxShadow: `0 0 0 ${6 + Math.round(level * 14)}px rgba(225,29,72,0.18)` } : undefined}>
          {state === 'busy' ? <Loader2 className="w-8 h-8 animate-spin" /> : state === 'rec' ? <Square className="w-7 h-7" /> : <Mic className="w-9 h-9" />}
        </button>
        <div className="text-sm font-black text-slate-900">{state === 'rec' ? 'Dinliyorum… bitince susun ya da dokunun' : state === 'busy' ? 'Anlaşılıyor…' : 'Dokunun ve söyleyin'}</div>
        {live && state !== 'idle' && <div className="text-xs text-slate-600 text-center">“{live}”</div>}
      </div>

      {msg && (
        <div className={`text-xs rounded-xl px-3 py-2 flex gap-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Kapat"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Yazarak da girilebilir */}
      <form onSubmit={sendTyped} className="flex gap-2">
        <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="ya da yazın: Opet'e 2.400 lira yakıt"
          className="min-w-0 flex-1 px-4 py-2.5 rounded-full border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        <button type="submit" disabled={state !== 'idle' || !typed.trim()} className="w-11 h-11 shrink-0 rounded-full bg-brand-600 text-white flex items-center justify-center disabled:opacity-50" aria-label="Gönder">
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Örnek komutlar */}
      {examples.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-slate-500 mb-1">Örnek komutlar (dokununca yazı kutusuna gelir)</div>
          <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {examples.map(x => (
              <li key={x.text}>
                <button type="button" onClick={() => setTyped(x.text)} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <span className="flex-1">“{x.text}”</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">{KIND_LABEL[x.kind]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PastList title="Son kayıtlar" items={hist} icon={Mic} storageKey={HIST_KEY} disabled={state !== 'idle'} onChange={setHist}
        onPick={t => setTyped(t)}
        tagClass={t => (t === 'Tahsilat' ? 'bg-emerald-50 text-emerald-700' : t === 'Harcama' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700')} />
    </ToolCard>
  );
};
