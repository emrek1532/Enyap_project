import React, { useState } from 'react';
import { Bot, Loader2, Send } from 'lucide-react';
import { Customer, Quote, QuoteItem } from '../types';
import { MATERIAL_UNITS, Material, foldTr, searchMaterials } from '../lib/materials';
import { dayOf, localDay } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { STATUS_LABEL } from './CustomerAccount';
import { PAYMENT_TERMS } from './NewQuoteModal';

type Call = { tool: string; arg: string };
type Step = { calls?: Call[]; done?: boolean; reply?: string; draft?: any };

const MAX_STEPS = 7;
const TOOL_LABEL: Record<string, string> = {
  cari_bul: 'Cari aranıyor', son_teklifler: 'Son teklifleri okunuyor', urun_ara: 'Katalogda aranıyor', fiyat_gecmisi: 'Fiyat geçmişine bakılıyor',
};

const words = (s: string) => foldTr(s).replace(/[^a-z0-9"/.]+/g, ' ').split(' ').filter(w => w.length >= 2);

/**
 * Teklif taslağı ajanı: "Gemfa'ya 10 adet 2" küresel vana, geçen seferki iskontoyla" gibi bir istekten taslak hazırlar.
 * Model her adımda araç ister; araçlar burada, cihazdaki teklif/cari verisiyle ve katalog aramasıyla çalışır.
 * Sonuç kaydedilmez, teklif formu dolu açılır. Kod/fiyat/iskonto yalnızca araç sonuçlarında geçtiyse kabul edilir.
 */
export const QuoteAgent: React.FC<{
  quotes: Quote[];
  customers: Customer[];
  onDraft: (draft: Partial<Quote>) => void;
}> = ({ quotes, customers, onDraft }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [reply, setReply] = useState('');

  // ---- Araçlar (cihazda çalışır) ----
  const findCustomers = (arg: string) => {
    const ws = words(arg).filter(w => w.length >= 3);
    const scored = customers
      .map(c => ({ c, score: ws.filter(w => foldTr(c.name).includes(w)).length + (foldTr(c.name).startsWith(ws[0] || '-') ? 0.5 : 0) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return scored.length ? scored.map(x => `${x.c.name}${x.c.city ? ` (${x.c.city})` : ''}`).join('\n') : 'Eşleşen cari yok.';
  };

  const lastQuotes = (arg: string) => {
    const k = foldTr(arg.trim());
    const qs = quotes.filter(q => foldTr(q.customerName.trim()) === k)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 4);
    if (!qs.length) return 'Bu firmaya verilmiş teklif yok.';
    return qs.map(q => `${dayOf(q.createdAt)} | ${q.quoteNumber} | ${STATUS_LABEL[q.status]?.label || q.status} | vade: ${q.paymentTerm || '-'}\n` +
      (q.items || []).slice(0, 15).map(it => `  - ${it.code || 'kodsuz'} | ${it.productName} | ${it.quantity} ${it.unit} | liste ${it.unitPrice} ${it.currency || q.currency || 'TRY'} | iskonto ${it.discount || 0}`).join('\n')).join('\n');
  };

  const priceHistory = (arg: string) => {
    const code = arg.trim().toUpperCase();
    const ws = words(arg);
    const out: string[] = [];
    const sorted = [...quotes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    for (const q of sorted) {
      const it = (q.items || []).find(i => (i.code || '').toUpperCase() === code || (ws.length && ws.every(w => foldTr(`${i.productName} ${i.code || ''}`).includes(w))));
      if (!it || !(it.unitPrice > 0)) continue;
      out.push(`${dayOf(q.createdAt)} | ${q.customerName} | ${it.code || 'kodsuz'} | ${it.productName} | liste ${it.unitPrice} ${it.currency || q.currency || 'TRY'} | iskonto ${it.discount || 0}`);
      if (out.length >= 6) break;
    }
    return out.length ? out.join('\n') : 'Bu ürün daha önce teklif edilmemiş.';
  };

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    const request = text.trim();
    if (!request || busy) return;
    setBusy(true); setLog([]); setReply('');
    const materials = new Map<string, Material>();
    let seen = request; // araç sonuçlarında ve istekte geçen her şey (doğrulama için)
    const steps: { answer: string; results: string }[] = [];
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    try {
      for (let i = 0; i < MAX_STEPS; i++) {
        const res = await fetch('/api/ai/agent', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ request, today: localDay(), steps }),
        });
        const out = await res.json().catch(() => null);
        if (!res.ok) throw new Error(res.status === 429 ? 'Yapay zekâ kotası doldu, biraz sonra tekrar deneyin.' : `Ajan çalışamadı (${res.status}${out?.message ? `: ${out.message}` : ''}).`);
        const step: Step = out?.step || {};
        const calls = (step.calls || []).filter(c => TOOL_LABEL[c.tool] && c.arg).slice(0, 6);
        if (step.done || !calls.length || i === MAX_STEPS - 1) {
          finish(step, materials, seen, request);
          return;
        }
        // Araçları çalıştır (aynı adımdakiler birlikte)
        const results = await Promise.all(calls.map(async c => {
          setLog(l => [...l, `${TOOL_LABEL[c.tool]}: ${c.arg}`]);
          let r: string;
          if (c.tool === 'cari_bul') r = findCustomers(c.arg);
          else if (c.tool === 'son_teklifler') r = lastQuotes(c.arg);
          else if (c.tool === 'fiyat_gecmisi') r = priceHistory(c.arg);
          else {
            const found = await searchMaterials(c.arg, { limit: 8 }).then(x => x.items, () => [] as Material[]);
            found.forEach(m => materials.set(m.code, m));
            r = found.length ? found.map(m => `${m.code} | ${m.name} | liste ${m.price} ${m.currency} | ${m.unit}`).join('\n') : 'Katalogda bulunamadı.';
          }
          return `[${c.tool}("${c.arg}")]\n${r}`;
        }));
        const joined = results.join('\n\n');
        seen += '\n' + joined;
        steps.push({ answer: out.answer, results: joined });
      }
    } catch (err) {
      setReply(err instanceof Error ? err.message : 'Bağlantı kurulamadı.');
    } finally {
      setBusy(false);
    }
  };

  /** Modelin taslağını doğrular: uydurma kod/fiyat/iskonto atılır, katalogdaki ürünün fiyatı katalogdan alınır */
  const finish = (step: Step, materials: Map<string, Material>, seen: string, request: string) => {
    const d = step.draft || {};
    const appears = (n: number) => n > 0 && new RegExp(`(^|[^0-9.])${String(n).replace('.', '\\.')}([^0-9]|$)`).test(seen);
    const items: QuoteItem[] = (Array.isArray(d.items) ? d.items : []).filter((it: any) => it?.name || it?.code).map((it: any, i: number) => {
      const code = String(it.code || '').trim().toUpperCase();
      const m = materials.get(code) || [...materials.values()].find(x => x.code.toUpperCase() === code);
      const knownCode = m ? m.code : code && seen.toUpperCase().includes(code) ? code : undefined;
      const qty = Number(it.quantity) > 0 ? Number(it.quantity) : 1;
      const disc = Number(it.discount) || 0;
      const price = Number(it.unitPrice) || 0;
      const unit = (MATERIAL_UNITS as readonly string[]).includes(it.unit) ? it.unit : m?.unit || 'Adet';
      const cur = ['TRY', 'USD', 'EUR'].includes(it.currency) ? it.currency : 'TRY';
      return {
        id: `it-${Date.now()}-${i}`,
        code: knownCode,
        productName: m?.name || String(it.name || code),
        quantity: qty,
        unit: unit as QuoteItem['unit'],
        unitPrice: m ? m.price : appears(price) ? price : 0,
        currency: m ? m.currency : cur,
        discount: disc > 0 && disc < 100 && (appears(disc) || request.includes(String(disc))) ? disc : 0,
        vatRate: m?.vatRate ?? 20,
        totalPrice: 0,
      };
    });
    const cust = customers.find(c => foldTr(c.name.trim()) === foldTr(String(d.customerName || '').trim()));
    const draft: Partial<Quote> = {
      customerName: cust?.name || String(d.customerName || ''),
      ...(cust?.city ? { city: cust.city } : {}),
      ...(PAYMENT_TERMS.includes(d.paymentTerm) ? { paymentTerm: d.paymentTerm } : {}),
      ...(d.notes ? { notes: String(d.notes) } : {}),
      ...(items.length ? { items } : {}),
    };
    setReply(step.reply || 'Taslak hazır, kontrol edip kaydedin.');
    if (draft.customerName || items.length) onDraft(draft);
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-2">
      <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5"><Bot className="w-4 h-4 text-emerald-600" /> Teklif taslağı hazırla</h2>
      <form onSubmit={run} className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} placeholder={'Ör. Gemfa\'ya 10 adet 2" küresel vana, geçen seferki iskontoyla'}
          className="min-w-0 flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
        <button type="submit" disabled={busy || !text.trim()} className="px-3 rounded-xl bg-emerald-600 text-white disabled:opacity-50" aria-label="Hazırla">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
      {(log.length > 0 || reply) && (
        <div className="text-xs bg-emerald-50 rounded-xl px-3 py-2 space-y-1">
          {log.map((l, i) => <div key={i} className="text-slate-600">• {l}</div>)}
          {busy && <div className="text-slate-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> düşünüyor…</div>}
          {reply && <div className="text-sm text-slate-800 pt-1">{reply}</div>}
        </div>
      )}
    </section>
  );
};
