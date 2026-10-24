import React, { useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { Quote } from '../types';
import { foldTr, splitSizes } from '../lib/materials';
import { dayOf } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { STATUS_LABEL } from './CustomerAccount';

// Soruda arama için anlamı olmayan kelimeler
const STOP = new Set(('ne neler kac kaca kactan hangi hangisi verdik verdim verildi icin mi mu en son ile ve veya bir bu su o gecen yil ' +
  'yili ay ayi hafta kim kime kimden fiyat fiyati fiyatina teklif teklifi teklifler tekliflerde ver vermis olan olarak gibi daha kadar ' +
  'toplam tum butun hepsi var yok nedir nasil acaba bize biz firmasina firmaya firma para paraya parayla tane adet ' +
  'bugun dun yarin sattik sattim satildi aldi aldik aldilar verildi istedi onaylandi onaylanan iptal bekleyen bekliyor').split(' '));

/** Soruyla ilgili teklif satırlarını cihazdaki veriden bulur (internet kullanmaz) */
function findLines(question: string, quotes: Quote[], customers: string[]): string[] {
  // İnç ölçüleri ayrı ve tam eşleşir (2" ≠ 1 1/2", 1/2"); 2 inç, 2'', 1 1/2 parmak da olur
  // Kesme işaretinden sonraki ek atılır: "Gemfa'ya" → "Gemfa" (inç işareti olan '' dokunulmaz)
  const clean = question.replace(/(\p{L})['’](\p{L}+)/gu, '$1').replace(/[?!,;:()]/g, ' ');
  const { words: tokens, sizes } = splitSizes(clean);
  // Uzun kelimelerde ek atılır (enerjiye → enerj, dirseği → dirse)
  const words = tokens.map(w => w.replace(/\.+$/, '')).filter(w => !STOP.has(w) && /[a-z]/.test(w) && w.length >= 3)
    .map(w => (/^[a-z]{6,}$/.test(w) ? w.slice(0, 5) : w));
  if (!words.length && !sizes.length) return [];
  const has = (text: string, w: string) => text.includes(w);
  // Soruda firma adı geçiyorsa yalnızca adı en çok eşleşen firmanın teklifleri
  const nameHits = (name: string) => words.filter(w => foldTr(name).includes(w)).length;
  const custHits = (q: Quote) => nameHits(q.customerName);
  const best = Math.max(0, ...quotes.map(custHits));
  // Adı daha iyi eşleşen bir cari varsa ama teklifi yoksa başka firmanın teklifleri gönderilmez
  if (Math.max(0, ...customers.map(nameHits)) > best) return [];
  const pool = best ? quotes.filter(q => custHits(q) === best) : quotes;
  const custWords = best ? words.filter(w => pool.some(q => foldTr(q.customerName).includes(w))) : [];
  // Firmanın hiçbir ürününde geçmeyen kelimeler (zaman, fiil) ürün aramasından çıkarılır
  const itemWords = words.filter(w => !custWords.includes(w)
    && (!best || pool.some(q => (q.items || []).some(it => has(foldTr(`${it.productName} ${it.code || ''}`), w)))));
  const scored: { score: number; date: string; line: string }[] = [];
  for (const q of pool) {
    for (const it of q.items || []) {
      const name = foldTr(`${it.productName} ${it.code || ''}`);
      if (!sizes.every(r => r.test(name))) continue;
      const hits = itemWords.filter(w => has(name, w)).length;
      if (itemWords.length && !hits) continue;
      const cur = it.currency || q.currency || 'TRY';
      scored.push({
        score: hits,
        date: q.createdAt || '',
        line: `${dayOf(q.createdAt)} | ${q.customerName} | ${q.quoteNumber} | ${STATUS_LABEL[q.status]?.label || q.status} | ${it.productName} | ` +
          `${it.quantity} ${it.unit} | birim ${it.unitPrice} ${cur}${it.discount ? ` | iskonto %${it.discount}` : ''}`,
      });
    }
  }
  return scored.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, 80).map(s => s.line);
}

/**
 * Tekliflere soru sorma (RAG): ilgili teklif satırları cihazda bulunur, soruyla birlikte yapay zekâya gider;
 * cevap yalnızca bu satırlara dayanır. Her soru tek istek.
 */
export const AskQuotes: React.FC<{ quotes: Quote[]; customers: string[] }> = ({ quotes, customers }) => {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [used, setUsed] = useState(0);
  // Yapay zekâ cevap veremezse (kota) bulunan satırlar doğrudan gösterilir
  const [found, setFound] = useState<string[]>([]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true); setAnswer(''); setFound([]);
    try {
      const lines = findLines(question, quotes, customers);
      setUsed(lines.length);
      // Eşleşen satır yoksa yapay zekâya hiç gidilmez
      if (!lines.length) { setAnswer('Kayıtlarda bulamadım: bu soruyla eşleşen teklif yok.'); return; }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ question, context: lines.join('\n') }),
      });
      const out = await res.json().catch(() => null);
      if (res.ok && out?.answer) { setAnswer(out.answer); return; }
      // Kota dolu ya da yapay zekâ cevap veremedi: cihazda bulunan en ilgili satırlar (en yeni önce) listelenir
      setAnswer(res.status === 429
        ? "Yapay zekâ kotası dolu (her gece 03:00'te yenilenir). Kayıtlarda bulduklarım:"
        : 'Yapay zekâ şu an cevap veremedi. Kayıtlarda bulduklarım:');
      setFound(lines.slice(0, 10));
    } catch {
      setAnswer('Bağlantı kurulamadı. Kayıtlarda bulduklarım:');
      setFound(findLines(question, quotes, customers).slice(0, 10));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-2">
      <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-violet-600" /> Tekliflere sor</h2>
      <form onSubmit={ask} className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ör. Demir İnşaat'a küresel vanayı kaça verdik?"
          className="min-w-0 flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
        <button type="submit" disabled={busy || !q.trim()} className="px-3 rounded-xl bg-violet-600 text-white disabled:opacity-50" aria-label="Sor">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
      {answer && (
        <div className="text-sm text-slate-800 whitespace-pre-wrap bg-violet-50 rounded-xl px-3 py-2">
          {answer}
          {found.length > 0 && (
            <ul className="mt-1.5 divide-y divide-violet-100 whitespace-normal">
              {found.map(l => {
                // satır: tarih | firma | teklif no | durum | ürün | miktar | birim fiyat | iskonto
                const [d, firm, no, st, prod, qty, ...rest] = l.split(' | ');
                return (
                  <li key={l} className="py-1.5">
                    <div className="font-semibold text-slate-900">{prod}</div>
                    <div className="text-xs text-slate-600 tabular-nums">
                      {d.split('-').reverse().join('.')} · {firm} · {no} ({st}) · {qty} · {rest.join(' · ').replace('birim ', '').replace(/ TRY\b/, ' TL')}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-slate-500">{used} teklif satırına bakıldı</p>
        </div>
      )}
    </section>
  );
};
