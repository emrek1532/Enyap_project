import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, XCircle } from 'lucide-react';
import { PdfQuote, readQuotePdf } from '../lib/pdfQuote';
import { CheckRow, checkQuote, totalsMismatch } from '../lib/quoteCheck';

const money = (v: number, cur?: string) =>
  v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? ` ${cur === 'TRY' ? 'TL' : cur}` : '');

const ICON = {
  ok: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
  error: <XCircle className="w-4 h-4 text-rose-600 shrink-0" />,
};

/** Mikro'dan alınan teklif PDF'ini bizim katalog, liste fiyatı ve liste iskontosuyla karşılaştırır */
export const QuoteCheck: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pdf, setPdf] = useState<PdfQuote | null>(null);
  const [rows, setRows] = useState<CheckRow[] | null>(null);

  const load = async (file: File) => {
    setBusy(true); setErr(''); setPdf(null); setRows(null);
    try {
      // Yapay zekâ kullanılmaz: kontrol yalnız Mikro'nun kendi düzeninden okunan satırlarla yapılır
      const q = await readQuotePdf(file, { ai: false });
      if (!q.items.length) throw new Error('Teklifte kalem okunamadı. Mikro\'dan "Fiyat Teklifi" PDF\'i yükleyin.');
      setPdf(q);
      setRows(await checkQuote(q));
    } catch (e) {
      setErr((e as Error)?.message || 'Okunamadı');
    } finally {
      setBusy(false);
    }
  };

  const errors = rows?.filter(r => r.level === 'error').length || 0;
  const warns = rows?.filter(r => r.level === 'warn').length || 0;
  const totalsBad = pdf ? totalsMismatch(pdf) : [];
  // Para birimine göre iskonto farkının toplamı
  const loss = new Map<string, number>();
  for (const r of rows || []) if (r.loss) loss.set(r.item.currency || 'TRY', (loss.get(r.item.currency || 'TRY') || 0) + r.loss);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-3xl max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="font-black text-slate-900 flex items-center gap-2"><FileSearch className="w-5 h-5 text-brand-600" /> Mikro teklifini kontrol et</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 text-lg font-bold leading-none" aria-label="Kapat">✕</button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed font-bold text-sm cursor-pointer
            ${busy ? 'border-slate-200 text-slate-400' : 'border-brand-300 text-brand-700 hover:bg-brand-50'}`}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
            {busy ? 'Kontrol ediliyor…' : pdf ? 'Başka teklif yükle' : 'Mikro teklif PDF\'ini seçin'}
            <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={busy}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) load(f); }} />
          </label>
          {!pdf && !err && (
            <p className="text-xs text-slate-500">Her kalem bizim ürün kodlarıyla, bağlı olduğu fiyat listesinin fiyatıyla ve o listeye girilen iskontoyla karşılaştırılır. Fazla ya da eksik iskonto, farklı fiyat ve katalogda olmayan ürün işaretlenir.</p>
          )}
          {err && <div className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{err}</div>}

          {pdf && rows && (
            <>
              <div className={`rounded-xl px-4 py-3 ${errors ? 'bg-rose-50 text-rose-800' : warns ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                <div className="font-black text-sm">
                  {pdf.customerName || 'Teklif'}{pdf.quoteNumber ? ` · No ${pdf.quoteNumber}` : ''}
                </div>
                <div className="text-sm mt-0.5">
                  {errors || warns
                    ? `${rows.length} kalemden ${errors ? `${errors} hatalı` : ''}${errors && warns ? ', ' : ''}${warns ? `${warns} kontrol edilmeli` : ''}`
                    : `${rows.length} kalemin hepsi listeyle uyumlu`}
                  {[...loss].filter(([, v]) => Math.abs(v) >= 0.01).map(([c, v]) => (
                    <span key={c} className="block font-bold">
                      {v > 0 ? `Müşteriye toplam ${money(v, c)} fazla indirim` : `Müşteriye toplam ${money(-v, c)} pahalı`}
                    </span>
                  ))}
                </div>
                {[...totalsBad, ...pdf.warnings].map(w => <div key={w} className="text-xs mt-1">⚠ {w}</div>)}
              </div>

              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {rows.map(r => (
                  <div key={r.item.id} className="px-3 py-2.5 flex gap-2.5">
                    <span className="mt-0.5">{ICON[r.level]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900 break-words">{r.item.productName}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {r.code && <span className="font-mono">{r.code} · </span>}
                        {r.item.quantity.toLocaleString('tr-TR')} {r.item.unit} × {money(r.item.unitPrice, r.item.currency)} · iskonto %{r.item.discount.toLocaleString('tr-TR')}
                        {r.list && <> · liste: {r.list.name} {money(r.list.price, r.list.currency)} %{r.list.discount.toLocaleString('tr-TR')}</>}
                      </div>
                      {r.issues.map(x => (
                        <div key={x.text} className={`text-xs mt-1 ${x.level === 'error' ? 'text-rose-700 font-semibold' : 'text-amber-700'}`}>{x.text}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
