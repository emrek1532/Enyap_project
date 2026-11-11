import React, { useRef, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { FIELD_LABEL, ImportField, ImportResult, ParsedSheet, importMaterials, parseMaterialFile } from '../lib/materialImport';

/** Bizim malzemeler: Mikro'dan alınan Excel ile toplu güncelleme (önizleme → yükle → sonuç) */
export const MaterialImport: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(''); setSheet(null); setResult(null); setFile(f);
    try {
      const s = await parseMaterialFile(f);
      if (!s.rows.length) throw new Error('Dosyada kodlu satır bulunamadı.');
      setSheet(s);
    } catch (e) {
      setError((e as Error).message || 'Dosya okunamadı.');
    }
  };

  const run = async () => {
    if (!sheet || !file) return;
    setBusy(true); setError('');
    try {
      const r = await importMaterials(sheet.rows, file.name, (done, total) => setProgress({ done, total }));
      setResult(r);
      onDone();
    } catch (e) {
      setError(`Yüklenemedi: ${(e as { message?: string })?.message || ''} (yarım kalan kısım yeniden yüklenince tamamlanır)`);
    } finally {
      setBusy(false);
    }
  };

  const cols = sheet ? (Object.keys(FIELD_LABEL) as ImportField[]) : [];
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-gradient-to-br from-[#1a3d6d] to-[#2b5f9e] text-white">
          <h3 className="font-black text-lg tracking-tight flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-sky-300" /> Malzeme listesini yükle (Excel)</h3>
          <button type="button" disabled={busy} onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white shrink-0 disabled:opacity-50" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto text-sm">
          {!result && (
            <p className="text-xs text-slate-600 leading-relaxed">
              Mikro'dan aldığınız stok/fiyat listesini <b>.xlsx</b> olarak seçin. Başlıklar kendiliğinden tanınır: <i>Stok Kodu, Stok İsmi, Fiyat, Döviz, Birim, KDV, Miktar</i>.
              Kod eşleşen malzemeler güncellenir, yeni kodlar eklenir. <b>Listede olmayan malzemelere dokunulmaz</b>, dosyada olmayan sütunlar değişmez, 0 ya da boş fiyat mevcut fiyatı silmez.
              Bitince yöneticiye bildirim gider.
            </p>
          )}
          <input ref={input} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          {!result && (
            <button type="button" disabled={busy} onClick={() => input.current?.click()}
              className="w-full py-3 rounded-xl border-2 border-dashed border-brand-300 text-brand-700 font-bold hover:bg-brand-50 disabled:opacity-50 inline-flex items-center justify-center gap-2">
              <Upload className="w-4 h-4" /> {file ? `${file.name} · başka dosya seç` : 'Excel dosyası seç'}
            </button>
          )}
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</div>}
          {sheet && !result && (
            <>
              <div className="text-xs text-slate-700">
                <b>{sheet.rows.length.toLocaleString('tr-TR')}</b> malzeme okundu{sheet.skipped ? ` · kodsuz ${sheet.skipped} satır atlandı` : ''}.
                {' '}Tanınan sütunlar: {cols.filter(c => sheet.columns[c]).map(c => <span key={c} className="inline-block mr-1 px-1.5 py-0.5 rounded bg-slate-100">{FIELD_LABEL[c]} ← {sheet.columns[c]}</span>)}
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500"><tr>{cols.filter(c => sheet.columns[c]).map(c => <th key={c} className="text-left px-2 py-1.5 font-bold">{FIELD_LABEL[c]}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {sheet.rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>{cols.filter(c => sheet.columns[c]).map(c => <td key={c} className="px-2 py-1.5 whitespace-nowrap">{r[c] == null ? '—' : typeof r[c] === 'number' ? (r[c] as number).toLocaleString('tr-TR') : String(r[c])}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" disabled={busy} onClick={run}
                className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor{progress ? ` · ${progress.done.toLocaleString('tr-TR')} / ${progress.total.toLocaleString('tr-TR')}` : '…'}</> : `${sheet.rows.length.toLocaleString('tr-TR')} malzemeyi yükle`}
              </button>
            </>
          )}
          {result && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-emerald-800 bg-emerald-50 rounded-xl px-3 py-2.5">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <b>Tamamlandı.</b> {result.updated.toLocaleString('tr-TR')} malzeme değişti, {result.inserted.toLocaleString('tr-TR')} yeni eklendi,
                  {' '}{result.unchanged.toLocaleString('tr-TR')} zaten günceldi.
                  <div className="text-[11px] text-emerald-700 mt-1">Yöneticiye bildirim gönderildi; hareketlerde de görünür.</div>
                </div>
              </div>
              <button type="button" onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold">Kapat</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
