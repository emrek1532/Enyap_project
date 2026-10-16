import React, { useState } from 'react';
import { Ban, CirclePause, CircleCheck, Lightbulb, PhoneCall, Target, TrendingDown, RotateCcw, Crown, Wallet, Sparkles, ShieldAlert, ChevronRight } from 'lucide-react';
import { CustomerStatus, Quote } from '../types';
import { Advice, CUSTOMER_STATUS, Evaluation, SEGMENT, adviseFor } from '../lib/customerInsights';

const tl = (v: number) => `${Math.round(v).toLocaleString('tr-TR')} TL`;

export const ADVICE_ICON: Record<Advice['kind'], { icon: React.ElementType; tone: string }> = {
  firsat: { icon: Target, tone: 'bg-brand-50 text-brand-700' },
  takip: { icon: PhoneCall, tone: 'bg-accent-50 text-accent-700' },
  fiyat: { icon: TrendingDown, tone: 'bg-violet-50 text-violet-600' },
  kazan: { icon: RotateCcw, tone: 'bg-sky-50 text-sky-700' },
  sadakat: { icon: Crown, tone: 'bg-amber-50 text-amber-700' },
  odeme: { icon: Wallet, tone: 'bg-rose-50 text-rose-600' },
  yeni: { icon: Sparkles, tone: 'bg-cyan-50 text-cyan-700' },
  risk: { icon: ShieldAlert, tone: 'bg-rose-50 text-rose-600' },
};

const STATUS_BTN: { s: CustomerStatus; icon: React.ElementType; on: string }[] = [
  { s: 'aktif', icon: CircleCheck, on: 'bg-emerald-600 border-emerald-600 text-white' },
  { s: 'pasif', icon: CirclePause, on: 'bg-slate-600 border-slate-600 text-white' },
  { s: 'kara_liste', icon: Ban, on: 'bg-rose-600 border-rose-600 text-white' },
];

/** Cari hesap içindeki değerlendirme kartı: puan, durum ve önerilen aksiyonlar */
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
  const seg = SEGMENT[ev.segment];
  const advice = adviseFor(ev, status, balance);
  const pick = (s: CustomerStatus) => {
    if (s === status) return;
    if (s === 'aktif') { onSetStatus?.('aktif', ''); return; }
    setNote(''); setAsking(s);
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-14 h-14 shrink-0">
          <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="4" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
              className="text-brand-600" strokeDasharray={`${(ev.score / 100) * 97.4} 97.4`} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-slate-900 tabular-nums">{ev.score}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-black text-slate-900">Müşteri puanı</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${seg.cls}`}>{seg.label}</span>
          </div>
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

      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-1.5"><Lightbulb className="w-3.5 h-3.5" /> Ne yapılabilir?</h4>
        <ul className="space-y-1.5">
          {advice.map((a, i) => {
            const ic = ADVICE_ICON[a.kind];
            const body = (
              <>
                <span className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${ic.tone}`}><ic.icon className="w-4 h-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900 leading-snug">{a.title}</span>
                  <span className="block text-xs text-slate-600 leading-snug mt-0.5">{a.text}</span>
                </span>
                {a.quote && onOpenQuote && <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 self-center" />}
              </>
            );
            return (
              <li key={i}>
                {a.quote && onOpenQuote
                  ? <button onClick={() => onOpenQuote(a.quote!)} className="w-full text-left flex gap-2.5 rounded-xl p-2 hover:bg-slate-50">{body}</button>
                  : <div className="flex gap-2.5 rounded-xl p-2">{body}</div>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};
