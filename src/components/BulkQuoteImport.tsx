import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, FolderUp, Loader2, X } from 'lucide-react';
import { Quote, QuoteStatus, UserRole } from '../types';
import { BulkRow, RowKind, classify, createOcr, expandFiles, readOne, totalsOf } from '../lib/bulkQuotes';

const fmt = (v: number, c: string) => `${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${c === 'TRY' ? 'TL' : c === 'USD' ? '$' : '€'}`;
const day = (s?: string | null) => (s ? s.split('-').reverse().join('.') : '—');
const STATUS_OPTS: { v: QuoteStatus; label: string }[] = [
  { v: 'gonderildi', label: 'Beklemede' }, { v: 'onaylandi', label: 'Onaylandı' }, { v: 'iptal', label: 'İptal' },
];

/**
 * Toplu teklif yükleme: ZIP / klasör / PDF / fotoğraf seçilir, cihazda okunur, sistemle karşılaştırılır.
 * Sistemde olan tekliflerin sadece kalemleri doldurulur (durum ve tutar değişmez);
 * yeni teklifler siz seçip durumunu belirleyince eklenir.
 */
export const BulkQuoteImport: React.FC<{
  quotes: Quote[];
  customerNames: string[];
  currentRole: UserRole;
  onApply: (updates: Quote[], creates: Quote[]) => void;
  onClose: () => void;
}> = ({ quotes, customerNames, currentRole, onApply, onClose }) => {
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [tab, setTab] = useState<RowKind>('fill');
  const [done, setDone] = useState<string>('');
  const stop = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  const run = async (picked: File[]) => {
    stop.current = false; setDone('');
    setBusy('dosyalar hazırlanıyor…');
    let ocr: Awaited<ReturnType<typeof createOcr>> | null = null;
    const getOcr = async () => (ocr ||= await createOcr());
    let lock: any = null;
    try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* yok */ }
    try {
      const files = await expandFiles(picked, setBusy);
      const read: { fileName: string; pdf: any; ocr: boolean; error?: string }[] = [];
      for (let i = 0; i < files.length && !stop.current; i++) {
        setBusy(`${i + 1} / ${files.length} okunuyor · ${files[i].name}`);
        try { read.push({ fileName: files[i].name, ...(await readOne(files[i], getOcr)) }); }
        catch (e) { read.push({ fileName: files[i].name, pdf: null, ocr: false, error: (e as Error)?.message?.slice(0, 80) || 'açılamadı' }); }
      }
      const res = classify(read, quotes, customerNames);
      setRows(res);
      setTab(res.some(r => r.kind === 'fill') ? 'fill' : res.some(r => r.kind === 'new') ? 'new' : 'bad');
    } finally {
      await (ocr as any)?.close?.();
      try { await lock?.release(); } catch { /* */ }
      setBusy('');
    }
  };

  const counts = useMemo(() => {
    const c: Record<RowKind, number> = { fill: 0, has: 0, new: 0, bad: 0, dup: 0 };
    rows?.forEach(r => c[r.kind]++);
    return c;
  }, [rows]);
  const shown = (rows || []).filter(r => r.kind === tab);
  const selected = (rows || []).filter(r => r.include && (r.kind === 'fill' || r.kind === 'new'));
  const set = (id: string, patch: Partial<BulkRow>) => setRows(rs => rs!.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const setAll = (patch: Partial<BulkRow>) => setRows(rs => rs!.map(r => (r.kind === tab ? { ...r, ...patch } : r)));

  const apply = () => {
    const now = new Date().toISOString();
    const items = (r: BulkRow) => r.pdf!.items.map((it, k) => ({ ...it, id: `it-${Date.now()}-${r.id}-${k}` }));
    const updates = selected.filter(r => r.kind === 'fill').map(r => ({ ...r.match!, items: items(r), updatedAt: now }));
    const creates = selected.filter(r => r.kind === 'new').map((r, i): Quote => {
      const t = totalsOf(r.pdf!.items);
      const used = (['TRY', 'USD', 'EUR'] as const).filter(c => t[c] > 0);
      const currency = used.length === 1 ? used[0] : 'TRY';
      const created = r.pdf!.date ? new Date(`${r.pdf!.date}T09:00:00+03:00`) : new Date();
      return {
        id: `qt-bulk-${Date.now()}-${i}`,
        quoteNumber: r.pdf!.quoteNumber || '-',
        customerName: r.customer || 'Bilinmeyen firma',
        customerPhone: '', city: r.pdf!.city || '',
        requestChannel: 'telefon', urgency: 'normal', status: r.status,
        items: items(r),
        totalAmount: used.length === 1 ? t[currency] : t.TRY, currency,
        amountTry: t.TRY, amountUsd: t.USD, amountEur: t.EUR,
        validUntil: new Date(created.getTime() + 5 * 86400e3).toISOString().slice(0, 10),
        createdAt: created.toISOString(), updatedAt: now,
        createdBy: currentRole, assignedTo: 'istanbul',
        paymentTerm: r.pdf!.paymentTerm || undefined, preparedBy: r.pdf!.preparedBy || undefined,
        notes: r.flags.length ? `Toplu yükleme: ${r.fileName}` : undefined,
        isEncrypted: false,
      } as Quote;
    });
    onApply(updates, creates);
    setDone(`${updates.length} teklifin kalemleri dolduruldu, ${creates.length} yeni teklif eklendi.`);
    setRows(rs => rs!.map(r => (r.include && (r.kind === 'fill' || r.kind === 'new') ? { ...r, kind: 'has', include: false } : r)));
  };

  const TABS: { k: RowKind; label: string }[] = [
    { k: 'fill', label: 'Kalemleri doldurulacak' }, { k: 'new', label: 'Sistemde yok (yeni)' },
    { k: 'bad', label: 'Okunamayan' }, { k: 'has', label: 'Zaten kalemli' }, { k: 'dup', label: 'Tekrar eden' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-slate-50 w-full sm:max-w-5xl sm:rounded-2xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 bg-brand-600 text-white flex items-center gap-3 pt-safe">
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-base sm:text-lg">Toplu teklif yükleme</h3>
            <p className="text-xs text-brand-100">ZIP, klasör, PDF ya da fotoğraf · dosyalar bu cihazda okunur</p>
          </div>
          {!busy && <button onClick={onClose} className="p-1.5 rounded-lg text-brand-100 hover:text-white hover:bg-brand-700" aria-label="Kapat"><X className="w-5 h-5" /></button>}
        </div>

        <div className="p-3 sm:p-5 space-y-3 overflow-y-auto flex-1">
          <input ref={fileRef} type="file" multiple hidden accept=".zip,.pdf,.jpg,.jpeg,.png,.webp,application/zip,application/pdf,image/*"
            onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) run(f); }} />
          <input ref={dirRef} type="file" multiple hidden {...({ webkitdirectory: '' } as any)}
            onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) run(f); }} />

          {!rows && !busy && (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = [...e.dataTransfer.files]; if (f.length) run(f); }}
              className="border-2 border-dashed border-brand-300 rounded-2xl bg-white p-6 sm:p-10 text-center space-y-3">
              <FileUp className="w-10 h-10 text-brand-500 mx-auto" />
              <p className="font-bold text-slate-800">ZIP dosyasını ya da PDF'leri buraya sürükleyin</p>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                Sistemde olan tekliflerin <b>sadece kalemleri</b> doldurulur (durum ve tutar değişmez). Sistemde olmayanlar
                size listelenir; siz seçip durumunu belirlemeden eklenmez. Büyük dosyalar için bilgisayar önerilir.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold"><FileUp className="w-4 h-4" /> Dosya / ZIP seç</button>
                <button onClick={() => dirRef.current?.click()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700"><FolderUp className="w-4 h-4" /> Klasör seç</button>
              </div>
            </div>
          )}

          {busy && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-700 break-all">{busy}</p>
              <p className="text-xs text-slate-400">Sayfayı kapatmayın. Taranmış dosyalar daha yavaş okunur.</p>
              <button onClick={() => { stop.current = true; }} className="text-xs font-bold text-rose-600">Durdur (okunanlarla devam et)</button>
            </div>
          )}

          {rows && !busy && (
            <>
              {done && <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 text-sm font-semibold"><CheckCircle2 className="w-4 h-4" /> {done}</div>}
              <div className="flex gap-1 p-1 rounded-xl bg-slate-200/70 overflow-x-auto [scrollbar-width:none]">
                {TABS.map(t => (
                  <button key={t.k} onClick={() => setTab(t.k)}
                    className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-extrabold whitespace-nowrap ${tab === t.k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>
                    {t.label} <span className="opacity-60">{counts[t.k]}</span>
                  </button>
                ))}
              </div>

              {(tab === 'fill' || tab === 'new') && shown.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button onClick={() => setAll({ include: true })} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold">Tümünü seç</button>
                  <button onClick={() => setAll({ include: false })} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold">Seçimi kaldır</button>
                  {tab === 'new' && (
                    <span className="inline-flex items-center gap-1">Hepsini:
                      {STATUS_OPTS.map(o => <button key={o.v} onClick={() => setAll({ status: o.v })} className="px-2 py-1 rounded-lg border border-slate-200 bg-white font-bold">{o.label}</button>)}
                    </span>
                  )}
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {shown.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Bu grupta dosya yok.</p>}
                {shown.slice(0, 400).map(r => {
                  const t = r.pdf ? totalsOf(r.pdf.items) : null;
                  const sel = r.kind === 'fill' || r.kind === 'new';
                  return (
                    <div key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                      {sel && <input type="checkbox" checked={r.include} onChange={e => set(r.id, { include: e.target.checked })} className="mt-1" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-sm text-slate-900">{r.pdf?.quoteNumber || '—'}</span>
                          <span className="text-xs text-slate-500">{day(r.pdf?.date)}</span>
                          <span className="text-sm font-bold text-slate-800 truncate">{r.match?.customerName || r.customer || r.pdf?.customerName || ''}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{r.fileName}{r.pdf ? ` · ${r.pdf.items.length} kalem` : ''}{r.match ? ` · sistemde: ${r.match.status === 'onaylandi' || r.match.status === 'siparis' ? 'Onaylandı' : r.match.status === 'iptal' ? 'İptal' : 'Beklemede'}` : ''}</div>
                        {r.flags.length > 0 && (
                          <div className="mt-0.5 flex items-start gap-1 text-[11px] text-amber-700"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{r.flags.join(' · ')}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        {t && <div className="text-xs font-black text-slate-800 tabular-nums whitespace-nowrap">
                          {(['TRY', 'USD', 'EUR'] as const).filter(c => t[c] > 0).map(c => fmt(t[c], c)).join(' + ') || '—'}
                        </div>}
                        {r.kind === 'new' && (
                          <select value={r.status} onChange={e => set(r.id, { status: e.target.value as QuoteStatus, include: true })}
                            className="text-xs border border-slate-200 rounded-lg px-1.5 py-1 bg-white">
                            {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
                {shown.length > 400 && <p className="py-2 text-center text-xs text-slate-400">İlk 400 satır gösteriliyor ({shown.length} toplam).</p>}
              </div>
            </>
          )}
        </div>

        {rows && !busy && (
          <div className="px-4 py-3 border-t border-slate-200 bg-white flex flex-wrap items-center gap-2 pb-safe">
            <span className="text-xs text-slate-500 flex-1 min-w-0">
              Seçili: <b>{selected.filter(r => r.kind === 'fill').length}</b> kalem doldurma · <b>{selected.filter(r => r.kind === 'new').length}</b> yeni teklif
            </span>
            <button onClick={() => { setRows(null); setDone(''); }} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">Başka dosya</button>
            <button onClick={apply} disabled={!selected.length} className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold disabled:opacity-40">Seçilenleri kaydet</button>
          </div>
        )}
      </div>
    </div>
  );
};
