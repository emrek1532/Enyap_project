import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Image as ImageIcon, Loader2, Paperclip } from 'lucide-react';
import type { Quote } from '../types';
import { QuoteRequest, ReqFile, fetchQuoteFiles, fileUrl } from '../lib/requests';

/**
 * Teklif penceresinde "Ekler": teklife bağlı talebin dosyaları (Excel teklif, talep fotoğrafı…).
 * Talep bellekteyse sorgu yok; değilse yalnız "Excel teklif" notlu tekliflerde bir kez sorulur.
 */
export const QuoteFiles: React.FC<{ quote: Quote; requests?: QuoteRequest[] }> = ({ quote, requests }) => {
  const known = requests?.find(r => r.quoteId === quote.id)?.files;
  const [files, setFiles] = useState<ReqFile[] | null>(known || null);
  const [opening, setOpening] = useState('');
  useEffect(() => {
    if (known) { setFiles(known); return; }
    setFiles(null);
    if (!(quote.notes || '').includes('Excel teklif')) return;
    let off = false;
    fetchQuoteFiles(quote.id).then(f => { if (!off) setFiles(f); }, () => undefined);
    return () => { off = true; };
  }, [quote.id, known]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!files?.length) return null;
  // Bağlantı geçici (1 saat): tıklayınca alınır; pencere önce açılır ki tarayıcı engellemesin
  const open = async (f: ReqFile) => {
    setOpening(f.path);
    const w = window.open('', '_blank');
    try {
      const url = await fileUrl(f.path);
      if (w) w.location.href = url; else window.location.href = url;
    } catch {
      w?.close();
      alert('Dosya açılamadı. İnternet bağlantısını kontrol edin.');
    } finally {
      setOpening('');
    }
  };
  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Ekler</label>
      <div className="space-y-1.5">
        {files.map(f => (
          <button key={f.path} type="button" onClick={() => open(f)} disabled={!!opening}
            className="w-full flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-left hover:bg-emerald-100 disabled:opacity-60">
            {opening === f.path ? <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
              : f.type.startsWith('image/') ? <ImageIcon className="w-4 h-4 text-sky-600" />
              : /\.(xlsx?|csv)$/i.test(f.name) ? <FileSpreadsheet className="w-4 h-4 text-[#008F79]" /> : <Paperclip className="w-4 h-4 text-slate-500" />}
            <span className="flex-1 min-w-0 truncate font-semibold text-slate-800">{f.name}</span>
            <span className="text-emerald-700 font-bold shrink-0">Aç</span>
          </button>
        ))}
      </div>
    </div>
  );
};
