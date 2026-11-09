import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, CalendarClock, History, Loader2 } from 'lucide-react';
import { Quote, QuoteItem } from '../types';
import { localDay } from '../lib/dates';
import { daysToExpiry, expiryLabel, followLabel, plusDays } from '../lib/quoteRules';
import { fetchQuoteRevisions, QuoteRevision } from '../lib/db';
import { CURRENCY_LABEL, itemCurrency } from '../lib/money';
import { DateInput } from './DateInput';

const trDate = (d: string) => d.slice(0, 10).split('-').reverse().join('.');
const chipCls = (on: boolean) => `px-2.5 py-1 rounded-full border text-[11px] font-bold ${on ? 'bg-[#0b2a4c] border-[#0b2a4c] text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`;

/** Takip tarihi: "ne zaman arayayım?" — o sabah telefona bildirim gider, ana sayfada "Bugün aranacaklar"da çıkar */
export const FollowUpBox: React.FC<{ quote: Quote; onChange: (day: string | undefined) => void }> = ({ quote, onChange }) => {
  const today = localDay();
  const cur = quote.followUpAt;
  const presets: [string, string][] = [['Yarın', plusDays(1)], ['3 gün sonra', plusDays(3)], ['1 hafta', plusDays(7)], ['2 hafta', plusDays(14)]];
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5"><BellRing className="w-3.5 h-3.5 text-amber-500" />Ne zaman arayayım?</div>
        {cur && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${cur <= today ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>{followLabel(cur, today)} · {trDate(cur)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map(([label, day]) => (
          <button key={label} type="button" onClick={() => onChange(cur === day ? undefined : day)} className={chipCls(cur === day)}>{label}</button>
        ))}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[11px] text-slate-600">
          <CalendarClock className="w-3.5 h-3.5" />
          <DateInput value={cur || ''} onChange={v => onChange(v || undefined)} className="w-24 bg-transparent text-[11px] font-bold text-slate-700 focus:outline-none" />
        </span>
        {cur && <button type="button" onClick={() => onChange(undefined)} className="text-[11px] font-bold text-rose-600 hover:underline px-1">Kaldır</button>}
      </div>
      <p className="text-[10px] text-slate-500">O gün sabah 09:00'da bildirim gelir; teklif ana sayfada "Bugün aranacaklar" listesine düşer.</p>
    </div>
  );
};

/** Geçerlilik süresi: dolmak üzereyse uyarı ve tek dokunuşla süre uzatma */
export const ValidityBox: React.FC<{ quote: Quote; priceChanged?: number; onExtend: (day: string) => void; onRevise: () => void }> = ({ quote, priceChanged = 0, onExtend, onRevise }) => {
  const d = daysToExpiry(quote);
  if (d === null) return null;
  const warn = d <= 3;
  const base = d < 0 ? new Date() : new Date(quote.validUntil.slice(0, 10) + 'T12:00:00');
  return (
    <div className={`rounded-xl border p-2.5 flex flex-wrap items-center gap-2 ${warn ? (d < 0 ? 'border-rose-200 bg-rose-50/70' : 'border-orange-200 bg-orange-50/70') : 'border-slate-200 bg-slate-50'}`}>
      <div className="flex-1 min-w-[10rem]">
        <div className="text-[11px] font-bold text-slate-600">Geçerlilik: <span className="text-slate-900 tabular-nums">{trDate(quote.validUntil)}</span></div>
        <div className={`text-[11px] font-bold ${d < 0 ? 'text-rose-700' : warn ? 'text-orange-700' : 'text-slate-500'}`}>
          {d > 3 ? `${d} gün kaldı` : expiryLabel(d)}
          {warn && priceChanged > 0 && <span className="font-normal text-slate-600"> · {priceChanged} kalemin fiyatı değişti</span>}
        </div>
      </div>
      {warn && priceChanged > 0 && (
        <button type="button" onClick={onRevise} className="h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold">Güncel fiyatla revize et</button>
      )}
      <button type="button" onClick={() => onExtend(plusDays(15, base))}
        className={`h-8 px-3 rounded-lg text-[11px] font-bold ${warn ? 'bg-[#0b2a4c] text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
        Süreyi 15 gün uzat
      </button>
    </div>
  );
};

type Line = { key: string; name: string; qty: number; unit: string; total: number; cur: string };
const linesOf = (items: QuoteItem[], q: Quote): Line[] => {
  const m = new Map<string, Line>();
  (items || []).forEach(it => {
    const key = ((it.code || '').trim() || it.productName.trim()).toLocaleLowerCase('tr');
    const cur = CURRENCY_LABEL[itemCurrency(it, q)];
    const prev = m.get(key);
    if (prev) { prev.qty += it.quantity || 0; prev.total += it.totalPrice || 0; }
    else m.set(key, { key, name: it.productName, qty: it.quantity || 0, unit: it.unit, total: it.totalPrice || 0, cur });
  });
  return [...m.values()];
};
const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** Revizyon geçmişi: teklif her değiştiğinde eski hâli saklanır; iki sürüm kalem kalem karşılaştırılır */
export const RevisionsBox: React.FC<{ quote: Quote }> = ({ quote }) => {
  const [open, setOpen] = useState(false);
  const [revs, setRevs] = useState<QuoteRevision[] | null>(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => { setOpen(false); setRevs(null); setPick(null); setErr(''); }, [quote.id]);
  useEffect(() => {
    if (!open || revs) return;
    const demo = (globalThis as { __enyapDemoRevisions?: QuoteRevision[] }).__enyapDemoRevisions; // yalnız deneme sayfası
    (demo ? Promise.resolve(demo) : fetchQuoteRevisions(quote.id))
      .then(r => { setRevs(r); setPick(r.length ? r[r.length - 1].rev : null); })
      .catch(() => setErr('Revizyonlar okunamadı (internet bağlantısını kontrol edin).'));
  }, [open, revs, quote.id]);
  // Teklif bu ekranda değişirse (ör. başka cihazdan) listeyi yeniden oku
  useEffect(() => { if (open) setRevs(null); }, [quote.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const cmp = useMemo(() => {
    const old = revs?.find(r => r.rev === pick);
    if (!old) return null;
    const a = linesOf(old.items, quote), b = linesOf(quote.items, quote);
    const bm = new Map(b.map(l => [l.key, l]));
    const rows = a.map(l => ({ name: l.name, old: l, now: bm.get(l.key) }));
    const am = new Set(a.map(l => l.key));
    b.filter(l => !am.has(l.key)).forEach(l => rows.push({ name: l.name, old: undefined as unknown as Line, now: l }));
    return { old, rows, nowTotal: quote.totalAmount };
  }, [revs, pick, quote]);

  const cur = CURRENCY_LABEL[quote.currency] || 'TL';
  const nextRev = (revs?.length || 0) + 1;
  return (
    <div className="rounded-xl border border-slate-200">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><History className="w-4 h-4 text-brand-500" />Revizyon geçmişi</span>
        <span className="text-[11px] font-bold text-brand-600">{open ? 'Gizle' : 'Göster'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {!revs && !err && <div className="py-3 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />Okunuyor…</div>}
          {err && <p className="text-xs text-rose-600">{err}</p>}
          {revs && revs.length === 0 && <p className="text-xs text-slate-500">Henüz revizyon yok. Teklif düzenlenip kalemleri ya da tutarı değişince eski hâli burada R1, R2… olarak saklanır.</p>}
          {revs && revs.length > 0 && (<>
            <div className="flex flex-wrap gap-1.5">
              {revs.map(r => (
                <button key={r.rev} type="button" onClick={() => setPick(r.rev)} className={chipCls(pick === r.rev)}>
                  R{r.rev} · {new Date(r.at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}
                </button>
              ))}
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">R{nextRev} · şimdiki</span>
            </div>
            {cmp && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-[11px] tabular-nums">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr><th className="p-2 text-left font-bold">Kalem</th><th className="p-2 text-right font-bold">R{cmp.old.rev}</th><th className="p-2 text-right font-bold">R{nextRev}</th><th className="p-2 text-right font-bold">Fark</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cmp.rows.map((r, i) => {
                      const o = r.old?.total ?? 0, n = r.now?.total ?? 0, d = n - o;
                      return (
                        <tr key={i}>
                          <td className="p-2 text-slate-800">{r.name}{r.old && r.now && r.old.qty !== r.now.qty && <span className="block text-[10px] text-slate-500">miktar {num(r.old.qty)} → {num(r.now.qty)} {r.now.unit}</span>}</td>
                          <td className="p-2 text-right text-slate-600 whitespace-nowrap">{r.old ? `${num(o)} ${r.old.cur}` : '—'}</td>
                          <td className="p-2 text-right text-slate-900 whitespace-nowrap">{r.now ? `${num(n)} ${r.now.cur}` : '—'}</td>
                          <td className={`p-2 text-right font-bold whitespace-nowrap ${!r.old ? 'text-amber-700' : !r.now ? 'text-slate-500' : d > 0 ? 'text-rose-600' : d < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {!r.old ? 'yeni kalem' : !r.now ? 'çıkarıldı' : Math.abs(d) < 0.005 ? '—' : `${d > 0 ? '+' : '−'}${num(Math.abs(d))}`}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-50 font-black">
                      <td className="p-2">Toplam</td>
                      <td className="p-2 text-right whitespace-nowrap">{num(cmp.old.totalAmount)} {CURRENCY_LABEL[cmp.old.currency] || cur}</td>
                      <td className="p-2 text-right whitespace-nowrap">{num(cmp.nowTotal)} {cur}</td>
                      <td className={`p-2 text-right whitespace-nowrap ${cmp.nowTotal - cmp.old.totalAmount > 0 ? 'text-rose-600' : cmp.nowTotal - cmp.old.totalAmount < 0 ? 'text-emerald-600' : ''}`}>
                        {Math.abs(cmp.nowTotal - cmp.old.totalAmount) < 0.005 ? '—' : `${cmp.nowTotal > cmp.old.totalAmount ? '+' : '−'}${num(Math.abs(cmp.nowTotal - cmp.old.totalAmount))}`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>)}
        </div>
      )}
    </div>
  );
};
