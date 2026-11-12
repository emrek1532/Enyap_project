import React, { useState } from 'react';
import { Loader2, PackageCheck } from 'lucide-react';
import { Quote } from '../types';
import { formatQuoteAmount } from '../lib/money';
import { supabase } from '../lib/supabase';

/**
 * Onaylanmış ama henüz siparişe alınmamış teklif varken (yönetici olmayan kişide) ekranı kapatan pencere.
 * "Siparişe aldım" denmeden kapanmaz; sunucu kim/ne zaman yazar ve yöneticiye bildirim gider.
 */
export const ApprovedOrderGate: React.FC<{
  quotes: Quote[];
  onDone: (id: string, by: string) => void;
  meName: string;
}> = ({ quotes, onDone, meName }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const q = quotes[0];
  if (!q) return null;

  const confirm = async () => {
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.rpc('mark_quote_processed', { p_id: q.id });
      if (error) throw error;
      // false: başkası siparişe almış ya da teklif artık onaylı değil; listeden düşer
      onDone(q.id, data ? meName : '');
    } catch {
      setErr('Kaydedilemedi. İnternet bağlantısını kontrol edip tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };

  const at = q.approvedAt ? new Date(q.approvedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0"><PackageCheck className="w-6 h-6" /></span>
          <div className="min-w-0">
            <div className="text-lg font-black leading-tight">Teklif onaylandı · siparişe al</div>
            {quotes.length > 1 && <div className="text-xs text-emerald-100">{quotes.length} teklif bekliyor</div>}
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="rounded-2xl border border-slate-200 p-3.5">
            <div className="text-xs font-bold text-slate-500">{q.quoteNumber}{q.rev ? `-R${q.rev}` : ''}</div>
            <div className="text-[17px] font-black text-slate-900 leading-snug">{q.customerName}</div>
            {q.city && <div className="text-xs text-slate-500">{q.city}</div>}
            <div className="mt-1.5 text-sm font-bold text-slate-800">{formatQuoteAmount(q)} <span className="font-normal text-slate-500">· {q.items?.length || 0} kalem</span></div>
            {q.approvedBy && <div className="mt-1 text-xs text-emerald-700">✓ Onaylayan: <b>{q.approvedBy}</b>{at && ` · ${at}`}</div>}
          </div>
          <p className="text-sm text-slate-600">Bu teklifi siparişe aldıktan sonra aşağıdaki düğmeye basın. Basmadan devam edilemez.</p>
          {err && <div className="text-xs text-rose-700">{err}</div>}
          <button type="button" onClick={confirm} disabled={busy}
            className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <PackageCheck className="w-5 h-5" />} Siparişe aldım
          </button>
        </div>
      </div>
    </div>
  );
};
