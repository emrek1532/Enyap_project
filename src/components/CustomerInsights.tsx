import React, { useState } from 'react';
import { Ban, CirclePause, CircleCheck } from 'lucide-react';
import { CustomerStatus, Quote } from '../types';
import { CUSTOMER_STATUS, Evaluation } from '../lib/customerInsights';

const tl = (v: number) => `${Math.round(v).toLocaleString('tr-TR')} TL`;

const STATUS_BTN: { s: CustomerStatus; icon: React.ElementType; on: string }[] = [
  { s: 'aktif', icon: CircleCheck, on: 'bg-emerald-600 border-emerald-600 text-white' },
  { s: 'pasif', icon: CirclePause, on: 'bg-slate-600 border-slate-600 text-white' },
  { s: 'kara_liste', icon: Ban, on: 'bg-rose-600 border-rose-600 text-white' },
];

/** Cari hesap içindeki özet kartı: teklif özeti ve firma durumu (aktif / pasif / kara liste) */
export const CustomerInsights: React.FC<{
  ev: Evaluation;
  status: CustomerStatus;
  statusNote?: string;
  onSetStatus?: (s: CustomerStatus, note: string) => void;
  onOpenQuote?: (q: Quote) => void;
  balance?: number | null;
  /** Telefon varsa hazır WhatsApp mesajları */
  whatsapp?: React.ReactNode;
}> = ({ ev, status, statusNote, onSetStatus, onOpenQuote, balance, whatsapp }) => {
  const [asking, setAsking] = useState<CustomerStatus | null>(null);
  const [note, setNote] = useState('');
  const pick = (s: CustomerStatus) => {
    if (s === status) return;
    if (s === 'aktif') { onSetStatus?.('aktif', ''); return; }
    setNote(''); setAsking(s);
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-black text-slate-900">Firma özeti</span>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
            Onay oranı <b className="text-slate-700">%{Math.round(ev.winRate * 100)}</b> · onaylı <b className="text-slate-700">{tl(ev.wonTotal)}</b> · {ev.quoteCount} teklif
            {ev.lastQuoteDays != null && <> · son teklif {ev.lastQuoteDays === 0 ? 'bugün' : `${ev.lastQuoteDays} gün önce`}</>}
          </p>
        </div>
        {onSetStatus && (
          <div className="flex gap-1 w-full sm:w-auto">
            {STATUS_BTN.map(b => (
              <button key={b.s} onClick={() => pick(b.s)}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-bold ${status === b.s ? b.on : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <b.icon className="w-3.5 h-3.5" /> {CUSTOMER_STATUS[b.s].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {status !== 'aktif' && statusNote && (
        <p className={`text-xs rounded-lg px-3 py-2 border ${CUSTOMER_STATUS[status].cls}`}><b>{CUSTOMER_STATUS[status].label} nedeni:</b> {statusNote}</p>
      )}

      {asking && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          <p className="text-xs font-bold text-slate-700">{asking === 'kara_liste' ? 'Kara listeye alma nedeni' : 'Pasife alma nedeni'} (isteğe bağlı)</p>
          <input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder={asking === 'kara_liste' ? 'ör. ödemeleri geciktiriyor' : 'ör. işi bıraktı'}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAsking(null)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200">Vazgeç</button>
            <button onClick={() => { onSetStatus?.(asking, note.trim()); setAsking(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white ${asking === 'kara_liste' ? 'bg-rose-600' : 'bg-slate-600'}`}>
              {asking === 'kara_liste' ? 'Kara listeye al' : 'Pasife al'}
            </button>
          </div>
        </div>
      )}

    </section>
  );
};
