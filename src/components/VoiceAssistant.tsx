import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Send, Sparkles, X } from 'lucide-react';
import { AiContext, AiError, AiResult, interpret, speak } from '../lib/ai';
import { bestTranscript } from '../lib/voiceParser';

// Tarayıcının ses tanıma arayüzü (Chrome / Android'de webkit önekli)
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null;
};
const RecognitionCtor: (new () => Recognition) | undefined =
  typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : undefined;

const EXAMPLES = [
  'Enorpa Enerji için teklif: 50 adet yarım parmak köşe radyatör vanası Kalde, yüzde 30 iskonto, 20 metre 20\'lik PPR boru, vade 60 gün',
  'Muslu Mekanik\'ten 500 bin lira çek aldım, Halkbank Isparta şubesi, vadesi 31 Ocak',
  'Bugün 2.500 lira yakıt aldım, kredi kartıyla, Konya bölge',
];

/**
 * Sesli asistan: konuş → yapay zeka anlasın → teklif / tahsilat / harcama formu dolu açılsın.
 * Kayıt asla kendiliğinden yapılmaz; form açılır, kullanıcı kontrol edip kaydeder.
 */
export const VoiceAssistant: React.FC<{
  context: () => AiContext;
  onResult: (r: AiResult) => Promise<void> | void;
}> = ({ context, onResult }) => {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef('');
  const autoSend = useRef(false);
  const silenceTimer = useRef<number | undefined>(undefined);

  // Dinleme oturumu: tarayıcı her duraksamada tanımayı bitirir; biz kullanıcı susana kadar
  // yeniden başlatıp parçaları birleştiririz (Android'deki tekrar eden sonuçlar da böylece oluşmaz)
  const session = useRef({ active: false, base: '', segments: [] as string[], current: '' });
  const SILENCE_MS = 3000;   // konuştuktan sonra bu kadar susunca biter
  const FIRST_WAIT_MS = 8000; // hiç konuşmazsa bu kadar bekler

  const joined = () => {
    const s = session.current;
    return [s.base, ...s.segments, s.current].map(x => x.trim()).filter(Boolean).join(' ');
  };

  const armSilence = (ms: number) => {
    window.clearTimeout(silenceTimer.current);
    silenceTimer.current = window.setTimeout(() => {
      session.current.active = false;
      try { recRef.current?.stop(); } catch { /* */ }
    }, ms);
  };

  const finish = () => {
    window.clearTimeout(silenceTimer.current);
    setListening(false);
    setInterim('');
    finalRef.current = joined();
    // Konuşma bitince kendiliğinden gönder: araçta ekrana dokunmak gerekmesin
    if (autoSend.current && finalRef.current.trim()) submit(finalRef.current);
    autoSend.current = false;
  };

  const startSegment = () => {
    if (!RecognitionCtor) return;
    const rec = new RecognitionCtor();
    rec.lang = 'tr-TR';
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      session.current.current = bestTranscript(Array.from(e.results as ArrayLike<any>).map((r: any) => String(r[0]?.transcript || '')));
      finalRef.current = joined();
      setText(finalRef.current);
      armSilence(SILENCE_MS);
    };
    rec.onerror = (e: any) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        session.current.active = false;
        setError('Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verin.');
      } else if (e?.error === 'network') {
        session.current.active = false;
        setError('Ses tanıma hatası. İnternet bağlantısını kontrol edin.');
      }
      // no-speech / aborted: oturum sürüyorsa yeniden dinlemeye devam edilir
    };
    rec.onend = () => {
      const s = session.current;
      if (s.current.trim()) { s.segments.push(s.current.trim()); s.current = ''; }
      if (s.active) {
        // Kullanıcı daha susmadı: dinlemeye devam
        window.setTimeout(() => {
          if (!session.current.active) { finish(); return; }
          try { startSegment(); } catch { session.current.active = false; finish(); }
        }, 60);
        return;
      }
      finish();
    };
    recRef.current = rec;
    rec.start();
  };

  const stopRec = () => {
    session.current.active = false;
    try { recRef.current?.stop(); } catch { finish(); }
  };

  useEffect(() => () => { session.current.active = false; try { recRef.current?.abort(); } catch { /* */ } }, []);

  const startRec = () => {
    if (!RecognitionCtor) { setError('Bu tarayıcı sesle yazmayı desteklemiyor. Chrome kullanın veya metni yazın.'); return; }
    setError('');
    // Kutuda yazan metin varsa yeni söylenenler sonuna eklenir
    session.current = { active: true, base: text.trim(), segments: [], current: '' };
    finalRef.current = session.current.base;
    autoSend.current = true;
    try {
      startSegment();
      setListening(true);
      armSilence(FIRST_WAIT_MS);
    } catch { session.current.active = false; setError('Mikrofon başlatılamadı.'); }
  };

  const toggleMic = () => {
    if (listening) { stopRec(); } else { startRec(); }
  };

  const submit = async (value = text) => {
    const t = value.trim();
    if (!t || busy) return;
    autoSend.current = false;
    session.current.active = false;
    window.clearTimeout(silenceTimer.current);
    if (listening) { try { recRef.current?.abort(); } catch { /* */ } setListening(false); }
    setBusy(true); setError('');
    try {
      const r = await interpret(t, context());
      speak(r.reply);
      if (r.intent === 'unknown') { setError(r.reply || 'Ne yapmak istediğinizi anlayamadım.'); return; }
      await onResult(r);
      setOpen(false); setText(''); finalRef.current = '';
    } catch (err) {
      const msg = err instanceof AiError ? err.message : 'Beklenmeyen bir hata oluştu.';
      setError(msg); speak(msg);
    } finally {
      setBusy(false);
    }
  };

  const openPanel = () => {
    setOpen(true); setError(''); setText(''); finalRef.current = '';
    // Açılır açılmaz dinlemeye başla
    window.setTimeout(startRec, 150);
  };
  const close = () => { autoSend.current = false; session.current.active = false; window.clearTimeout(silenceTimer.current); try { recRef.current?.abort(); } catch { /* */ } setOpen(false); };

  return (
    <>
      {!open && (
        <button
          onClick={openPanel}
          className="fixed z-40 right-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-600/30 flex items-center justify-center active:scale-95 transition"
          aria-label="Sesli asistan"
          title="Sesli asistan: konuşarak teklif, tahsilat veya harcama girin"
        >
          <Mic className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={close}>
          <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="font-black text-slate-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-brand-600" /> Sesli Asistan</h3>
              <button onClick={close} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Kapat"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={toggleMic}
                  disabled={busy}
                  className={`w-24 h-24 rounded-full flex items-center justify-center text-white shadow-lg transition active:scale-95 disabled:opacity-60 ${listening ? 'bg-rose-600 animate-pulse' : 'bg-brand-600 hover:bg-brand-700'}`}
                  aria-label={listening ? 'Dinlemeyi durdur' : 'Konuşmaya başla'}
                >
                  {busy ? <Loader2 className="w-10 h-10 animate-spin" /> : listening ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
                </button>
                <p className="text-sm font-semibold text-slate-700">
                  {busy ? 'Anlıyorum, form hazırlanıyor…' : listening ? 'Dinliyorum… bitince 3 sn susun ya da dokunun' : 'Konuşmak için dokunun'}
                </p>
              </div>

              <div>
                <textarea
                  rows={4}
                  value={text + (interim ? (text ? ' ' : '') + interim : '')}
                  onChange={e => { setText(e.target.value); finalRef.current = e.target.value; }}
                  placeholder="Söyledikleriniz burada yazılır; isterseniz düzeltebilir ya da yazabilirsiniz."
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm"
                />
                <button
                  onClick={() => submit()}
                  disabled={busy || !text.trim()}
                  className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm disabled:opacity-50"
                >
                  <Send className="w-4 h-4" /> Anla ve Formu Hazırla
                </button>
              </div>

              {error && <div className="text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{error}</div>}

              <div className="text-xs text-slate-500 space-y-1.5">
                <p className="font-bold text-slate-600">Örnek cümleler</p>
                {EXAMPLES.map(e => (
                  <button key={e} onClick={() => { setText(e); finalRef.current = e; }} className="block w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100">
                    “{e}”
                  </button>
                ))}
                <p className="pt-1">Kayıt kendiliğinden yapılmaz: form dolu açılır, kontrol edip <b>Kaydet</b>'e basarsınız.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
