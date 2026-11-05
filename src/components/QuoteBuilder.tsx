import React, { useState } from 'react';
import { Chip, PastList, ToolCard, pushPast, readPast } from './ToolCard';
import { Bot, Camera, ChevronDown, Star, CheckCircle2, FileSpreadsheet, Loader2, Plus, Send, Settings2, Trash2, X } from 'lucide-react';
import { Customer, Quote, QuoteItem } from '../types';
import { Material, foldTr } from '../lib/materials';
import { useSetting } from '../lib/settings';
import { useQuoteAgent } from './useQuoteAgent';
import { Match, PREF_KEY, PrefRule, ReqLine, excelToText, imageToDataUrl, listDiscounts, matchLine, readRequest } from '../lib/requestRead';

type Row = ReqLine & { m: Match; pick: string | null; skip: boolean };

const money = (m: Material) => (m.price > 0
  ? `${m.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${m.currency === 'TRY' ? 'TL' : m.currency}` : 'fiyat yok');

// Örnek istekler (dokununca kutuya yazılır; firma adını kendinize göre değiştirin)
const EXAMPLES = [
  'Gemfa\'ya 10 adet 2" küresel vana, geçen seferki iskontoyla',
  'Demir İnşaat\'a 1 adet 500 lt genleşme tankı, peşin',
  '200 lt boyler ve 2 adet 1" pislik tutucu',
];
const HIST_KEY = 'draft-history';

/** Birden çok dolu satır varsa talep listesi (satır satır okunur), tek satırsa serbest istek (ajan) */
export const isList = (t: string) => t.split(/\r?\n/).filter(l => l.trim()).length >= 2;

/**
 * Teklif hazırla (tek kutu):
 * - Tek satırlık istek ("Gemfa'ya 10 adet 2" küresel vana, geçen seferki iskontoyla") → önce kurallar (quickDraft), olmazsa ajan.
 * - Çok satırlı talep (WhatsApp), Excel → satırlar kurallarla, fotoğraf → yapay zekâ ile satırlara ayrılır;
 *   ürün tercih kuralı + ölçüyle kesinleşir ya da kullanıcı seçer. Seçilmemiş satır varken teklife geçilmez.
 */
export const QuoteBuilder: React.FC<{ quotes: Quote[]; customers: Customer[]; onDraft: (draft: Partial<Quote>) => void }> = ({ quotes, customers, onDraft }) => {
  const agent = useQuoteAgent(quotes, customers, onDraft);
  const [hist, setHist] = useState(() => readPast(HIST_KEY));
  const [showEx, setShowEx] = useState(false);
  const [prefs, savePrefs] = useSetting<PrefRule[]>(PREF_KEY, []);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [customer, setCustomer] = useState('');
  const [showPrefs, setShowPrefs] = useState(false);
  const [draftRule, setDraftRule] = useState<PrefRule>({ when: '', prefix: '' });

  const run = async (input: { image?: string; text?: string }) => {
    agent.reset();
    setErr(''); setRows(null); setBusy('Talep okunuyor…');
    try {
      const out = await readRequest(input);
      if (!out.lines.length) throw new Error('Talepte ürün satırı bulunamadı.');
      setBusy('Katalogda aranıyor…');
      const matched = await Promise.all(out.lines.map(async l => {
        const m = await matchLine(l, prefs);
        return { ...l, m, pick: m.pick, skip: false };
      }));
      setRows(matched);
      const c = out.customer && customers.find(x => foldTr(x.name).includes(foldTr(out.customer)) || foldTr(out.customer).includes(foldTr(x.name)));
      setCustomer(c ? c.name : out.customer);
    } catch (e) {
      setErr((e as Error)?.message || 'Okunamadı');
    } finally {
      setBusy('');
    }
  };

  // Hazırla: tek satır → ajan, çok satır → talep okuma
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy || agent.busy) return;
    setPhoto(null);
    if (isList(t)) { run({ text: t }); return; }
    setErr(''); setRows(null);
    setHist(pushPast(HIST_KEY, t));
    agent.run(t);
  };
  const working = !!busy || agent.busy;

  const onPhoto = async (f: File) => {
    const url = await imageToDataUrl(f);
    setPhoto(url);
    run({ image: url });
  };
  const onExcel = async (f: File) => {
    setPhoto(null);
    const t = await excelToText(f).catch(() => '');
    if (!t) { setErr('Excel okunamadı.'); return; }
    setText(t);
    run({ text: t });
  };

  const update = (i: number, p: Partial<Row>) => setRows(prev => prev && prev.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const open = rows?.filter(r => !r.skip && !r.pick).length || 0;

  const toQuote = async () => {
    if (!rows) return;
    const use = rows.filter(r => !r.skip && r.pick);
    setBusy('Teklif hazırlanıyor…');
    const disc = await listDiscounts(use.map(r => r.pick!)).catch(() => new Map<string, number>());
    setBusy('');
    const items: QuoteItem[] = use.map((r, i) => {
      const m = r.m.cands.find(c => c.code === r.pick)!;
      return {
        id: `it-${Date.now()}-${i}`, code: m.code, productName: m.name, quantity: r.qty,
        unit: (m.unit || r.unit) as QuoteItem['unit'], unitPrice: m.price, currency: m.currency,
        discount: disc.get(m.code) || 0, vatRate: m.vatRate ?? 20, totalPrice: 0,
        notes: r.text && foldTr(r.text) !== foldTr(m.name) ? `Talep: ${r.text}` : undefined,
      };
    });
    const cust = customers.find(c => c.name === customer);
    onDraft({ customerName: customer, ...(cust?.city ? { city: cust.city } : {}), items });
  };

  return (
    <ToolCard icon={Bot} tone="emerald" title="Teklif hazırla"
      subtitle="İsteği yazın ya da müşterinin mesajını, fotoğrafını, Excel'ini verin; teklif formu dolu açılsın."
      >
      <form onSubmit={submit} className="space-y-2">
        <div className="flex gap-2 items-stretch">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isList(text)) { e.preventDefault(); submit(); } }}
            placeholder={'Ör. Gemfa\'ya 10 adet 2" küresel vana, geçen seferki iskontoyla — ya da müşterinin mesajını yapıştırın (her satıra bir ürün)'}
            className="min-w-0 flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          <button type="submit" disabled={working || !text.trim()} className="px-3 rounded-xl bg-emerald-600 text-white disabled:opacity-50" aria-label="Hazırla">
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer ${working ? 'opacity-40 pointer-events-none' : 'hover:bg-slate-50'}`}>
            <Camera className="w-4 h-4" /> Fotoğraf <span className="font-normal text-slate-400">(yapay zekâ)</span>
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f); }} />
          </label>
          <label className={`px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer ${working ? 'opacity-40 pointer-events-none' : 'hover:bg-slate-50'}`}>
            <FileSpreadsheet className="w-4 h-4" /> Excel
            <input type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onExcel(f); }} />
          </label>
          {busy && <span className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {busy}</span>}
          {!busy && text.trim() && <span className="text-[11px] text-slate-400">{isList(text) ? 'Satır satır okunacak (yapay zekâsız)' : 'İstek olarak hazırlanacak'}</span>}
        </div>
      </form>
      <div className="flex flex-wrap gap-2">
        <Chip onClick={() => setShowEx(v => !v)} active={showEx}>
          <Star className="w-3.5 h-3.5" /> Örnek istekler <ChevronDown className={`w-3.5 h-3.5 transition ${showEx ? 'rotate-180' : ''}`} />
        </Chip>
        <Chip onClick={() => setShowPrefs(v => !v)} active={showPrefs}>
          <Settings2 className="w-3.5 h-3.5" /> Tercihli ürünler{prefs.length ? ` (${prefs.length})` : ''}
        </Chip>
      </div>
      {showEx && (
        <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
          {EXAMPLES.map(x => (
            <li key={x}>
              <button type="button" onClick={() => { setText(x); setShowEx(false); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{x}</button>
            </li>
          ))}
        </ul>
      )}
      {showPrefs && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 space-y-1.5 text-xs">
          <p className="text-slate-500">Talepte marka yazmıyorsa hangi ürün ailesi gelsin. Örnek: <b>genleşme</b> → <b>VTSKGD</b> (Wates), <b>serpantinli boyler</b> → <b>APABTS</b> (APA). Ölçüyle birlikte ürün kesinleşir.</p>
          {prefs.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate">"{p.when}" → <span className="font-mono font-bold">{p.prefix}…</span></span>
              <button onClick={() => savePrefs(prefs.filter((_, k) => k !== i))} className="p-1 text-slate-400 hover:text-rose-600" aria-label="Kaldır"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <div className="flex gap-1.5">
            <input value={draftRule.when} onChange={e => setDraftRule({ ...draftRule, when: e.target.value })} placeholder="talepte geçen (ör. genleşme)"
              className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 bg-white" />
            <input value={draftRule.prefix} onChange={e => setDraftRule({ ...draftRule, prefix: e.target.value.toUpperCase() })} placeholder="kod başı (VTSKGD)"
              className="w-32 px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-mono" />
            <button disabled={!draftRule.when.trim() || !draftRule.prefix.trim()}
              onClick={() => { savePrefs([...prefs, { when: draftRule.when.trim(), prefix: draftRule.prefix.trim() }]); setDraftRule({ when: '', prefix: '' }); }}
              className="px-2.5 rounded-lg bg-brand-600 text-white disabled:opacity-40" aria-label="Ekle"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {(agent.log.length > 0 || agent.reply) && (
        <div className="text-xs bg-emerald-50 rounded-xl px-3 py-2 space-y-1">
          {agent.log.map((l, i) => <div key={i} className="text-slate-600">• {l}</div>)}
          {agent.busy && <div className="text-slate-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> düşünüyor…</div>}
          {agent.reply && <div className="text-sm text-slate-800 pt-1">{agent.reply}</div>}
        </div>
      )}
      {err && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{err}</div>}

      {rows && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_1fr] items-start">
          {photo && <img src={photo} alt="Talep" className="w-full rounded-lg border border-slate-200 lg:sticky lg:top-2" />}
          <div className="space-y-2 min-w-0">
            <input value={customer} onChange={e => setCustomer(e.target.value)} list="req-customers" placeholder="Firma (isteğe bağlı)"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <datalist id="req-customers">{customers.map(c => <option key={c.id} value={c.name} />)}</datalist>
            {rows.map((r, i) => (
              <div key={i} className={`rounded-xl border p-2.5 space-y-1.5 ${r.skip ? 'opacity-50 border-slate-200' : r.pick ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/50'}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-slate-500">Talepte: <span className="font-semibold text-slate-700">"{r.text}"</span>{r.unsure && <span className="text-rose-600 font-bold"> · okunuşu belirsiz</span>}</div>
                    <div className="text-sm font-bold text-slate-900">{r.item}</div>
                  </div>
                  <input type="number" min={0} step="any" value={r.qty} onChange={e => update(i, { qty: Number(e.target.value) || 0 })}
                    className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-sm text-right tabular-nums" aria-label="Adet" />
                  <button onClick={() => update(i, { skip: !r.skip })} title={r.skip ? 'Teklife ekle' : 'Bu satırı atla'} className="p-1 text-slate-400 hover:text-slate-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {!r.skip && (r.m.cands.length ? (
                  <div className="flex items-center gap-2">
                    {r.pick ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <span className="w-4 h-4 rounded-full bg-amber-400 shrink-0" />}
                    <select value={r.pick || ''} onChange={e => update(i, { pick: e.target.value || null })}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white">
                      <option value="">— ürün seçin ({r.m.cands.length} aday) —</option>
                      {r.m.cands.map(c => <option key={c.code} value={c.code}>{c.name} · {c.code} · {money(c)}</option>)}
                    </select>
                  </div>
                ) : <div className="text-xs text-rose-700">Katalogda bulunamadı: teklif formunda elle ekleyin ya da atlayın.</div>)}
                {!r.skip && r.pick && (() => {
                  const m = r.m.cands.find(c => c.code === r.pick);
                  return m && (
                    <div className="text-[11px] text-emerald-700 tabular-nums">
                      <span className="font-mono">{m.code}</span> · {money(m)}{r.m.via === 'pref' ? ' · tercihli ürün kuralıyla seçildi' : ''}
                    </div>
                  );
                })()}
              </div>
            ))}
            <button onClick={toQuote} disabled={!!busy || open > 0 || !rows.some(r => !r.skip && r.pick)}
              className="w-full py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold disabled:opacity-40">
              {open > 0 ? `${open} satırda ürün seçin ya da atlayın` : 'Teklif formuna aktar'}
            </button>
          </div>
        </div>
      )}
      {!rows && !agent.busy && !agent.reply && (
        <PastList title="Son istekler" items={hist} icon={Bot} storageKey={HIST_KEY} disabled={working} onChange={setHist}
          onPick={t => { setText(t); }} />
      )}
    </ToolCard>
  );
};
