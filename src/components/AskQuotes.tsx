import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Cpu, Lightbulb, Loader2, MessageCircleQuestion, Mic, Send, Sparkles, Square, Star } from 'lucide-react';
import { Chip, PastList, ToolCard, pushPast, readPast, shortName, topRecent } from './ToolCard';
import { SpeechSession, canSpeech, listen } from '../lib/speech';
import { Quote, QuoteStatus } from '../types';
import { dayOf } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { quoteTry, useRates } from '../lib/rates';
import { AskLine, AskResult, computeAsk, findAsk, fmtMoney, lineCur, lineText } from '../lib/askQuery';
import { STATUS_LABEL } from './CustomerAccount';

const statusLabel = (s: QuoteStatus) => STATUS_LABEL[s]?.label || s;
const fmtDay = (s: string) => dayOf(s).split('-').reverse().join('.');

// Örnek sorular: hepsi cihazda hesaplanır (yapay zekâya gitmez), sonuncusu hariç
const EXAMPLES = [
  'Bu ay kaç teklif verdik?',
  'Geçen ay kaç teklif onaylandı?',
  'Bekleyen tekliflerin toplamı ne kadar?',
  'Son 3 ayda kaç adet küresel vana sattık?',
  '2" küresel vanayı en ucuz kaça verdik?',
  'Bu yıl en çok hangi ürünleri teklif ettik?',
];

// Son sorular yalnız bu cihazda tutulur (sunucuya gitmez)
const HIST_KEY = 'ask-history';
const TAG_LOCAL = 'Cihazda', TAG_AI = 'Yapay zekâ';

type Answer = {
  text: string;
  local: boolean;      // cihazda hesaplandı (yapay zekâ kullanılmadı)
  lines: AskLine[];    // kaynak satırlar
  quotes: Quote[];     // kaynak teklifler (satır yoksa)
  used: number;        // bakılan satır/teklif sayısı
  chips: string[];     // uygulanan süzgeçler
};

/**
 * Tekliflere soru sorma (RAG): soru cihazda çözülür (tarih, durum, firma, ürün); sayı soruları (kaç teklif, toplam,
 * kaç adet, en son/en düşük/en yüksek fiyat) cihazda hesaplanır, yapay zekâya gidilmez. Serbest sorularda süzülmüş
 * teklif satırları soruyla birlikte yapay zekâya gider; cevap yalnızca bu satırlara dayanır. Kaynağa dokununca teklif açılır.
 */
export const AskQuotes: React.FC<{ quotes: Quote[]; customers: string[]; onOpenQuote?: (q: Quote) => void }> = ({ quotes, customers, onOpenQuote }) => {
  const rates = useRates(quotes);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<Answer | null>(null);
  const [hist, setHist] = useState(() => readPast(HIST_KEY));
  const [showEx, setShowEx] = useState(false);
  const [mic, setMic] = useState<SpeechSession | null>(null);
  const [micErr, setMicErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Akıllı öneriler: son 6 ayda en çok teklif verilen firmalar ve en sık geçen ürünler (cihazdaki veriden)
  const smart = useMemo(() => {
    const { firms, products } = topRecent(quotes);
    return [
      ...firms.map(f => ({ label: f, q: `Bu yıl ${f} toplam kaç teklif` })),
      ...products.map(pn => ({ label: shortName(pn), q: `${pn} en son kaça verdik` })),
    ];
  }, [quotes]);

  const remember = (question: string, local: boolean) => setHist(pushPast(HIST_KEY, question, local ? TAG_LOCAL : TAG_AI));

  const voice = async () => {
    if (mic) { mic.stop(); return; }
    setMicErr('');
    const sess = listen({ onInterim: t => setQ(t) });
    setMic(sess);
    try {
      const t = (await sess.result).trim();
      if (t) { setQ(t); run(t); }
    } catch (e) { setMicErr((e as Error).message); } finally { setMic(null); }
  };
  const chipsOf = (r: AskResult) => [r.filter.period, r.customer, r.filter.status && statusLabel(r.filter.status)].filter(Boolean) as string[];

  const ask = (e: React.FormEvent) => { e.preventDefault(); run(q); };
  const pick = (question: string) => { setQ(question); setShowEx(false); run(question); };

  const run = async (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    setBusy(true); setAns(null);
    const r = findAsk(question, quotes, customers);
    const chips = chipsOf(r);
    const base = { lines: r.lines.slice(0, 10), quotes: [] as Quote[], used: r.lines.length || r.quotes.length, chips };
    try {
      // Sayı soruları cihazda hesaplanır
      const c = computeAsk(r, statusLabel, x => quoteTry(x, rates));
      if (c) { setAns({ ...base, text: c.text, local: true, lines: c.lines.slice(0, 10), quotes: c.quotes.slice(0, 10) }); remember(question, true); return; }
      // Eşleşen satır yoksa yapay zekâya hiç gidilmez
      if (!r.lines.length) { setAns({ ...base, text: 'Kayıtlarda bulamadım: bu soruyla eşleşen teklif yok.', local: true }); return; }
      const scope = chips.length ? `SÜZGEÇ (satırlar buna göre seçildi): ${chips.join(' · ')}\n` : '';
      const context = scope + r.lines.slice(0, 80).map(l => lineText(l, statusLabel)).join('\n');
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ question, context }),
      });
      const out = await res.json().catch(() => null);
      if (res.ok && out?.answer) { setAns({ ...base, text: out.answer, local: false, used: Math.min(80, r.lines.length) }); remember(question, false); return; }
      // Kota dolu ya da yapay zekâ cevap veremedi: cihazda bulunan en ilgili satırlar listelenir
      setAns({
        ...base, local: true,
        text: res.status === 429 ? "Yapay zekâ kotası dolu (her gece 03:00'te yenilenir). Kayıtlarda bulduklarım:" : 'Yapay zekâ şu an cevap veremedi. Kayıtlarda bulduklarım:',
      });
    } catch {
      setAns({ ...base, text: 'Bağlantı kurulamadı. Kayıtlarda bulduklarım:', local: true });
    } finally {
      setBusy(false);
    }
  };

  const Row: React.FC<{ quote: Quote; children: React.ReactNode }> = ({ quote, children }) => (
    <li>
      <button type="button" disabled={!onOpenQuote} onClick={() => onOpenQuote?.(quote)}
        className="w-full text-left py-1.5 flex items-center gap-2 disabled:cursor-default">
        <div className="min-w-0 flex-1">{children}</div>
        {onOpenQuote && <ChevronRight className="w-4 h-4 text-violet-400 shrink-0" />}
      </button>
    </li>
  );

  return (
    <ToolCard icon={MessageCircleQuestion} title="Tekliflere sor" subtitle="Fiyat, adet, toplam ve tarih sorularını tekliflerinizden cevaplar.">
        <form onSubmit={ask} className="flex gap-2">
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Ör. Demir İnşaat'a küresel vanayı kaça verdik?"
            className="min-w-0 flex-1 px-4 py-3 rounded-full border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <button type="submit" disabled={busy || !q.trim()} className="w-12 h-12 shrink-0 rounded-full bg-brand-600 text-white flex items-center justify-center disabled:opacity-50" aria-label="Sor">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>

        {/* Kısayollar */}
        <div className="flex flex-wrap gap-2">
          <Chip onClick={() => setShowEx(v => !v)} active={showEx}>
            <Star className="w-3.5 h-3.5" /> Örnek sorular <ChevronDown className={`w-3.5 h-3.5 transition ${showEx ? 'rotate-180' : ''}`} />
          </Chip>
          {canSpeech() && (
            <button type="button" onClick={voice} disabled={busy}
              className={`px-3 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 ${mic ? 'bg-rose-50 border-rose-200 text-rose-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {mic ? <><Square className="w-3.5 h-3.5" /> Dinliyorum… bitir</> : <><Mic className="w-3.5 h-3.5" /> Sesli soru</>}
            </button>
          )}
        </div>
        {micErr && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{micErr}</div>}
        {showEx && (
          <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {EXAMPLES.map(x => (
              <li key={x}>
                <button type="button" onClick={() => pick(x)} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" /> <span className="flex-1">{x}</span>
                  {x !== EXAMPLES[EXAMPLES.length - 1] && <span className="text-[10px] text-slate-400">cihazda</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

      {ans && (
        <div className="text-sm text-slate-800 bg-violet-50 rounded-xl px-3 py-2 space-y-1.5">
          {ans.chips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {ans.chips.map(c => <span key={c} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-violet-200 text-violet-700">{c}</span>)}
            </div>
          )}
          <div className="whitespace-pre-wrap">{ans.text}</div>
          {(ans.lines.length > 0 || ans.quotes.length > 0) && (
            <div>
              <div className="text-[11px] font-bold text-slate-500 mt-1">Kaynak teklifler{onOpenQuote ? ' (açmak için dokunun)' : ''}</div>
              <ul className="divide-y divide-violet-100">
                {ans.lines.map(l => (
                  <Row key={`${l.quote.id}-${l.item.id}`} quote={l.quote}>
                    <div className="font-semibold text-slate-900 truncate">{l.item.productName}</div>
                    <div className="text-xs text-slate-600 tabular-nums">
                      {fmtDay(l.quote.createdAt)} · {l.quote.customerName} · {l.quote.quoteNumber} ({statusLabel(l.quote.status)}) · {l.item.quantity} {l.item.unit} · {fmtMoney(l.item.unitPrice, lineCur(l))}
                      {l.item.discount ? ` · iskonto %${l.item.discount}` : ''}
                    </div>
                  </Row>
                ))}
                {ans.quotes.map(x => (
                  <Row key={x.id} quote={x}>
                    <div className="font-semibold text-slate-900 truncate">{x.customerName}</div>
                    <div className="text-xs text-slate-600 tabular-nums">
                      {fmtDay(x.createdAt)} · {x.quoteNumber} ({statusLabel(x.status)}) · {fmtMoney(Math.round(x.totalAmount || 0), x.currency)}
                    </div>
                  </Row>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            {ans.local && <><Cpu className="w-3 h-3" /> Cihazda hesaplandı, yapay zekâ kullanılmadı · </>}
            {ans.used} {ans.lines.length || !ans.quotes.length ? 'teklif satırına' : 'teklife'} bakıldı
          </p>
        </div>
      )}

        {/* Son sorularım (yalnız bu cihazda) */}
        <PastList title="Son sorularım" items={hist} icon={MessageCircleQuestion} disabled={busy} storageKey={HIST_KEY}
          onPick={pick} onChange={setHist} tagClass={t => (t === TAG_LOCAL ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700')} />

        {/* Akıllı öneriler: en çok teklif verilen firmalar ve ürünler */}
        {smart.length > 0 && (
          <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <div>
                <div className="text-sm font-black text-slate-900">Akıllı öneriler</div>
                <div className="text-[11px] text-slate-500">Son 6 ayda en çok teklif verdiğiniz firmalar ve ürünler</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {smart.map(x => (
                <button key={x.q} type="button" onClick={() => pick(x.q)} disabled={busy} title={x.q}
                  className="px-3 py-1.5 rounded-full bg-white border border-sky-200 text-xs font-bold text-slate-700 hover:border-brand-300 max-w-[14rem] truncate">
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        )}
    </ToolCard>
  );
};
