import React, { useState } from 'react';
import { Camera, CheckCircle2, ClipboardList, FileSpreadsheet, Loader2, Plus, Settings2, Trash2, X } from 'lucide-react';
import { Customer, Quote, QuoteItem } from '../types';
import { Material, foldTr } from '../lib/materials';
import { useSetting } from '../lib/settings';
import { Match, PREF_KEY, PrefRule, ReqLine, excelToText, imageToDataUrl, listDiscounts, matchLine, readRequest } from '../lib/requestRead';

type Row = ReqLine & { m: Match; pick: string | null; skip: boolean };

const money = (m: Material) => (m.price > 0
  ? `${m.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${m.currency === 'TRY' ? 'TL' : m.currency}` : 'fiyat yok');

/**
 * Müşteri talebi: el yazısı fotoğrafı, WhatsApp yazısı ya da Excel → satırlar → katalogda ürün.
 * Yapay zekâ yalnız satırlara ayırır; ürün tercih kuralı + ölçüyle kesinleşir ya da kullanıcı seçer.
 * Seçilmemiş satır varken teklife geçilmez.
 */
export const RequestReader: React.FC<{ customers: Customer[]; onDraft: (draft: Partial<Quote>) => void }> = ({ customers, onDraft }) => {
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
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5"><ClipboardList className="w-4 h-4 text-brand-600" /> Müşteri talebini oku</h2>
        <button onClick={() => setShowPrefs(v => !v)} className="text-[11px] font-bold text-slate-500 hover:text-brand-700 flex items-center gap-1">
          <Settings2 className="w-3.5 h-3.5" /> Tercihli ürünler{prefs.length ? ` (${prefs.length})` : ''}
        </button>
      </div>

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

      <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
        placeholder="WhatsApp mesajını buraya yapıştırın (her satıra bir ürün, ör. 500 lt genleşme - 4)… ya da fotoğraf / Excel seçin"
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-y" />
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy || !text.trim()} onClick={() => { setPhoto(null); run({ text }); }}
          className="px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold disabled:opacity-40">Yazıyı oku</button>
        <label className={`px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer ${busy ? 'opacity-40 pointer-events-none' : 'hover:bg-slate-50'}`}>
          <Camera className="w-4 h-4" /> Fotoğraf <span className="font-normal text-slate-400">(yapay zekâ)</span>
          <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f); }} />
        </label>
        <label className={`px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer ${busy ? 'opacity-40 pointer-events-none' : 'hover:bg-slate-50'}`}>
          <FileSpreadsheet className="w-4 h-4" /> Excel
          <input type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onExcel(f); }} />
        </label>
        {busy && <span className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {busy}</span>}
      </div>
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
                {!r.skip && r.pick && r.m.via === 'pref' && <div className="text-[11px] text-emerald-700">Tercihli ürün kuralıyla seçildi</div>}
              </div>
            ))}
            <button onClick={toQuote} disabled={!!busy || open > 0 || !rows.some(r => !r.skip && r.pick)}
              className="w-full py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold disabled:opacity-40">
              {open > 0 ? `${open} satırda ürün seçin ya da atlayın` : 'Teklif formuna aktar'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
