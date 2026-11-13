import React, { useState } from 'react';
import { ChevronRight, Cpu } from 'lucide-react';
import { Quote, QuoteStatus } from '../types';
import { dayOf } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { quoteTry, useRates } from '../lib/rates';
import { AskLine, AskResult, computeAsk, findAsk, fmtMoney, lineCur, lineNet, lineText } from '../lib/askQuery';
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
  price?: string;      // fiyat sorusu: "En son" / "En düşük" / "En yüksek" (cevap kart olarak gösterilir)
  picked?: number;     // baştaki seçilen satır sayısı
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
      if (c) out = { ...base, text: c.text, local: true, lines: c.lines.slice(0, 10), quotes: c.quotes.slice(0, 10), price: c.price, picked: c.picked };
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

const STATUS_DOT: Partial<Record<QuoteStatus, string>> = { onaylandi: 'bg-emerald-500', gonderildi: 'bg-violet-500', iptal: 'bg-slate-400' };
const money2 = (v: number, c: string) => fmtMoney(Math.round(v * 100) / 100, c);

/** Fiyat cevabındaki tek satır: solda ürün ve kime/ne zaman, sağda net fiyat */
const PriceCard: React.FC<{ l: AskLine; tag?: string; strong?: boolean; onOpen?: (q: Quote) => void }> = ({ l, tag, strong, onOpen }) => {
  const cur = lineCur(l);
  const d = l.item.discount || 0;
  return (
    <button type="button" disabled={!onOpen} onClick={() => onOpen?.(l.quote)}
      className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-start gap-3 disabled:cursor-default ${strong ? 'bg-white border-violet-200 shadow-sm' : 'bg-white/60 border-slate-200'} active:bg-violet-50`}>
      <div className="min-w-0 flex-1">
        {tag && <div className="text-[10px] font-black uppercase tracking-wide text-violet-600">{tag}</div>}
        <div className={`leading-snug ${strong ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'} line-clamp-2`}>{l.item.productName}</div>
        <div className="mt-1 text-xs text-slate-600 flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[l.quote.status] || 'bg-slate-400'}`} title={statusLabel(l.quote.status)} />
          <span className="font-semibold text-slate-700 truncate">{l.quote.customerName}</span>
        </div>
        <div className="text-[11px] text-slate-500 tabular-nums">{fmtDay(l.quote.createdAt)} · No {l.quote.quoteNumber} · {statusLabel(l.quote.status)} · {l.item.quantity} {l.item.unit}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`tabular-nums ${strong ? 'text-base font-black text-slate-900' : 'text-sm font-bold text-slate-800'}`}>{money2(lineNet(l.item), cur)}</div>
        {d > 0 && <div className="text-[11px] text-slate-500 tabular-nums">liste {money2(l.item.unitPrice, cur)}</div>}
        {d > 0 && <div className="text-[11px] font-bold text-emerald-700">%{d} iskonto</div>}
      </div>
      {onOpen && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 self-center" />}
    </button>
  );
};

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
  const foot = (
    <p className="text-[11px] text-slate-500 flex items-center gap-1">
      {ans.local && <><Cpu className="w-3 h-3" /> Cihazda hesaplandı · </>}
      {ans.used} {ans.lines.length || !ans.quotes.length ? 'teklif satırına' : 'teklife'} bakıldı
    </p>
  );
  // Fiyat sorusu: aynı bilgi bir kez, kart olarak (yazı + liste tekrarı yok)
  if (ans.price && ans.lines.length) {
    const top = ans.lines.slice(0, ans.picked || 1);
    const rest = ans.lines.slice(top.length);
    return (
      <div className="text-sm space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap px-0.5">
          <span className="text-[11px] font-black uppercase tracking-wide text-violet-700">{ans.price} verilen fiyat</span>
          {ans.chips.map(c => <span key={c} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700">{c}</span>)}
        </div>
        <div className="space-y-1.5">
          {top.map(l => <PriceCard key={`${l.quote.id}-${l.item.id}`} l={l} strong onOpen={onOpenQuote} />)}
        </div>
        {rest.length > 0 && (
          <>
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 px-0.5 pt-1">Diğer teklifler</div>
            <div className="space-y-1.5">
              {rest.map(l => <PriceCard key={`${l.quote.id}-${l.item.id}`} l={l} onOpen={onOpenQuote} />)}
            </div>
          </>
        )}
        {foot}
      </div>
    );
  }
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
      {foot}
    </div>
  );
};
