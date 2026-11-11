import React, { useState } from 'react';
import { ChevronRight, Cpu } from 'lucide-react';
import { Quote, QuoteStatus } from '../types';
import { dayOf } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { quoteTry, useRates } from '../lib/rates';
import { AskLine, AskResult, computeAsk, findAsk, fmtMoney, lineCur, lineText } from '../lib/askQuery';
import { STATUS_LABEL } from '../lib/constants';

const statusLabel = (s: QuoteStatus) => STATUS_LABEL[s]?.label || s;
const fmtDay = (s: string) => dayOf(s).split('-').reverse().join('.');

// Örnek sorular: hepsi cihazda hesaplanır (yapay zekâya gitmez), sonuncusu hariç
export const EXAMPLES = [
  'Bu ay kaç teklif verdik?',
  'Geçen ay kaç teklif onaylandı?',
  'Bekleyen tekliflerin toplamı ne kadar?',
  'Son 3 ayda kaç adet küresel vana sattık?',
  '2" küresel vanayı en ucuz kaça verdik?',
  'Bu yıl en çok hangi ürünleri teklif ettik?',
];

export type Answer = {
  text: string;
  local: boolean;      // cihazda hesaplandı (yapay zekâ kullanılmadı)
  found: boolean;      // tekliflerde eşleşen kayıt var mı
  lines: AskLine[];    // kaynak satırlar
  quotes: Quote[];     // kaynak teklifler (satır yoksa)
  used: number;        // bakılan satır/teklif sayısı
  chips: string[];     // uygulanan süzgeçler
};

/**
 * Tekliflere soru sorma (RAG): soru cihazda çözülür (tarih, durum, firma, ürün); sayı soruları (kaç teklif, toplam,
 * kaç adet, en son/en düşük/en yüksek fiyat) cihazda hesaplanır, yapay zekâya gidilmez. Serbest sorularda süzülmüş
 * teklif satırları soruyla birlikte yapay zekâya gider (yalnız `ai` izni varsa); cevap yalnızca bu satırlara dayanır.
 */
export function useAsk(quotes: Quote[], customers: string[], ai: boolean) {
  const rates = useRates(quotes);
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<Answer | null>(null);

  const run = async (raw: string): Promise<Answer | null> => {
    const question = raw.trim();
    if (!question || busy) return null;
    setBusy(true); setAns(null);
    const r: AskResult = findAsk(question, quotes, customers);
    const chips = [r.filter.period, r.customer, r.filter.status && statusLabel(r.filter.status)].filter(Boolean) as string[];
    const base = { lines: r.lines.slice(0, 10), quotes: [] as Quote[], used: r.lines.length || r.quotes.length, chips, found: true };
    let out: Answer;
    try {
      // Sayı soruları cihazda hesaplanır
      const c = computeAsk(r, statusLabel, x => quoteTry(x, rates));
      if (c) out = { ...base, text: c.text, local: true, lines: c.lines.slice(0, 10), quotes: c.quotes.slice(0, 10) };
      // Eşleşen satır yoksa yapay zekâya hiç gidilmez
      else if (!r.lines.length) out = { ...base, found: false, text: 'Eski tekliflerde eşleşen kayıt yok.', local: true };
      else if (!ai) out = { ...base, text: 'Eski tekliflerde bulduklarım:', local: true };
      else {
        const scope = chips.length ? `SÜZGEÇ (satırlar buna göre seçildi): ${chips.join(' · ')}\n` : '';
        const context = scope + r.lines.slice(0, 80).map(l => lineText(l, statusLabel)).join('\n');
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch('/api/ai/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ question, context }),
        });
        const o = await res.json().catch(() => null);
        out = res.ok && o?.answer
          ? { ...base, text: o.answer, local: false, used: Math.min(80, r.lines.length) }
          // Kota dolu ya da yapay zekâ cevap veremedi: cihazda bulunan en ilgili satırlar listelenir
          : { ...base, local: true, text: res.status === 429 ? "Yapay zekâ kotası dolu (her gece 03:00'te yenilenir). Kayıtlarda bulduklarım:" : 'Yapay zekâ şu an cevap veremedi. Kayıtlarda bulduklarım:' };
      }
    } catch {
      out = { ...base, text: 'Bağlantı kurulamadı. Kayıtlarda bulduklarım:', local: true };
    }
    setAns(out); setBusy(false);
    return out;
  };

  return { busy, ans, run, clear: () => setAns(null) };
}

/** Cevap kutusu: süzgeçler, cevap, kaynak teklifler (dokununca açılır) */
export const AskAnswer: React.FC<{ ans: Answer; onOpenQuote?: (q: Quote) => void }> = ({ ans, onOpenQuote }) => {
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
    <div className="text-sm text-slate-800 bg-violet-50 rounded-xl px-3 py-2 space-y-1.5">
      <div className="text-[11px] font-black uppercase tracking-wide text-violet-700">Eski tekliflerden cevap</div>
      {ans.chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ans.chips.map(c => <span key={c} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-violet-200 text-violet-700">{c}</span>)}
        </div>
      )}
      <div className="whitespace-pre-wrap">{ans.text}</div>
      {(ans.lines.length > 0 || ans.quotes.length > 0) && (
        <div>
          <div className="text-[11px] font-bold text-slate-500 mt-1">Kime kaça verdik{onOpenQuote ? ' (açmak için dokunun)' : ''}</div>
          <ul className="divide-y divide-violet-100">
            {ans.lines.map(l => (
              <Row key={`${l.quote.id}-${l.item.id}`} quote={l.quote}>
                <div className="font-semibold text-slate-900 truncate">{l.quote.customerName}</div>
                <div className="text-xs text-slate-600 truncate">{l.item.productName}</div>
                <div className="text-xs text-slate-600 tabular-nums">
                  {fmtDay(l.quote.createdAt)} · {l.quote.quoteNumber} ({statusLabel(l.quote.status)}) · {l.item.quantity} {l.item.unit} · {fmtMoney(l.item.unitPrice, lineCur(l))}
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
  );
};
