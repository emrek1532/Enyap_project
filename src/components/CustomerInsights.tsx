import React, { useMemo, useState } from 'react';
import { Ban, CirclePause, CircleCheck } from 'lucide-react';
import { Collection, CustomerStatus, Quote } from '../types';
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
  /** Firmanın tahsilatları: ödeme alışkanlığı için (yetki yoksa verilmez) */
  collections?: Collection[];
}> = ({ ev, status, statusNote, onSetStatus, onOpenQuote, balance, whatsapp, collections }) => {
  const pay = useMemo(() => paymentHabit(collections || []), [collections]);
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

      {pay && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1">Ödeme alışkanlığı</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 text-xs">
            <Fact label="Son tahsilat" value={pay.lastDays === 0 ? 'bugün' : `${pay.lastDays} gün önce`} warn={pay.lastDays > 90} />
            <Fact label="Ortalama aralık" value={pay.gap != null ? `${pay.gap} günde bir` : '—'} />
            <Fact label="Ort. çek vadesi" value={pay.maturity != null ? `${pay.maturity} gün` : '—'} warn={(pay.maturity ?? 0) > 120} />
            <Fact label="Ödeme şekli" value={pay.methods} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5">{pay.count} tahsilat · toplam {tl(pay.total)}{pay.yearTotal > 0 && <> · son 12 ay {tl(pay.yearTotal)}</>}</div>
        </div>
      )}

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

const Fact: React.FC<{ label: string; value: string; warn?: boolean }> = ({ label, value, warn }) => (
  <div className="min-w-0">
    <div className="text-[10px] text-slate-500">{label}</div>
    <div className={`font-bold truncate ${warn ? 'text-rose-600' : 'text-slate-800'}`}>{value}</div>
  </div>
);

/** Tahsilatlardan ödeme alışkanlığı: son tahsilat, ortalama aralık, tutar ağırlıklı ortalama çek vadesi, ödeme şekli */
function paymentHabit(list: Collection[]) {
  const tr = list.filter(c => c.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!tr.length) return null;
  const day = (s: string) => Date.parse(s.slice(0, 10));
  const now = Date.now();
  const lastDays = Math.max(0, Math.floor((now - day(tr[tr.length - 1].date)) / 864e5));
  const dates = [...new Set(tr.map(c => c.date.slice(0, 10)))];
  const gap = dates.length > 1 ? Math.round((day(dates[dates.length - 1]) - day(dates[0])) / 864e5 / (dates.length - 1)) : null;
  const vade = tr.filter(c => c.dueDate && (c.currency || 'TRY') === 'TRY' && c.amount > 0);
  const w = vade.reduce((s, c) => s + c.amount, 0);
  const maturity = w > 0 ? Math.round(vade.reduce((s, c) => s + c.amount * Math.max(0, (day(c.dueDate!) - day(c.date)) / 864e5), 0) / w) : null;
  const byMethod = new Map<string, number>();
  tr.forEach(c => byMethod.set(c.method || 'Diğer', (byMethod.get(c.method || 'Diğer') || 0) + 1));
  const methods = [...byMethod.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([m, n]) => `${m} %${Math.round((n / tr.length) * 100)}`).join(', ');
  const tl0 = (c: Collection) => ((c.currency || 'TRY') === 'TRY' ? c.amount || 0 : 0);
  return {
    count: tr.length, lastDays, gap, maturity, methods,
    total: tr.reduce((s, c) => s + tl0(c), 0),
    yearTotal: tr.filter(c => now - day(c.date) <= 365 * 864e5).reduce((s, c) => s + tl0(c), 0),
  };
}
