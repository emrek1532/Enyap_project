import React, { useState } from 'react';
import { ChevronRight, Cpu, Loader2, Send, Sparkles } from 'lucide-react';
import { Quote, QuoteStatus } from '../types';
import { dayOf } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { quoteTry, useRates } from '../lib/rates';
import { AskLine, AskResult, computeAsk, findAsk, fmtMoney, lineCur, lineText } from '../lib/askQuery';
import { STATUS_LABEL } from './CustomerAccount';

const statusLabel = (s: QuoteStatus) => STATUS_LABEL[s]?.label || s;
const fmtDay = (s: string) => dayOf(s).split('-').reverse().join('.');

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

  const chipsOf = (r: AskResult) => [r.filter.period, r.customer, r.filter.status && statusLabel(r.filter.status)].filter(Boolean) as string[];

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true); setAns(null);
    const r = findAsk(question, quotes, customers);
    const chips = chipsOf(r);
    const base = { lines: r.lines.slice(0, 10), quotes: [] as Quote[], used: r.lines.length || r.quotes.length, chips };
    try {
      // Sayı soruları cihazda hesaplanır
      const c = computeAsk(r, statusLabel, x => quoteTry(x, rates));
      if (c) { setAns({ ...base, text: c.text, local: true, lines: c.lines.slice(0, 10), quotes: c.quotes.slice(0, 10) }); return; }
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
      if (res.ok && out?.answer) { setAns({ ...base, text: out.answer, local: false, used: Math.min(80, r.lines.length) }); return; }
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
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-2">
      <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-violet-600" /> Tekliflere sor</h2>
      <form onSubmit={ask} className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ör. Geçen ay kaç teklif onaylandı? · Demir İnşaat'a küresel vanayı kaça verdik?"
          className="min-w-0 flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
        <button type="submit" disabled={busy || !q.trim()} className="px-3 rounded-xl bg-violet-600 text-white disabled:opacity-50" aria-label="Sor">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
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
    </section>
  );
};
