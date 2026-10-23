import React, { useMemo, useState } from 'react';
import { Footprints, MapPin, Phone, Search } from 'lucide-react';
import { Customer, Quote, UserRole, Visit } from '../types';
import { foldName, statusOf } from '../lib/customerInsights';
import { PENDING_STATUSES } from '../lib/quoteRules';
import { Rates, quoteTry } from '../lib/rates';
import { localDay, dayOf } from '../lib/dates';

const short = (v: number) => v >= 1e6 ? `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn` : v >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('tr-TR')} bin` : `${Math.round(v)}`;
const daysSince = (d: string) => Math.max(0, Math.floor((Date.now() - Date.parse(d.slice(0, 10))) / 864e5));
const trDay = (s: string) => dayOf(s).split('-').reverse().join('.');
const CITY_KEY = 'enyap-visit-city';

export const newVisit = (customer: Customer, note: string, role: UserRole): Visit => {
  const now = new Date().toISOString();
  return {
    id: 'vis-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    customerName: customer.name, city: customer.city || undefined, date: localDay(), note: note.trim() || undefined,
    createdBy: role, createdAt: now, updatedAt: now,
  };
};

/** Firmanın son ziyaretleri (yeniden eskiye) */
export const visitsOf = (visits: Visit[], name: string) => {
  const k = foldName(name);
  return visits.filter(v => foldName(v.customerName) === k).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
};

/** "Uğradım" düğmesi + isteğe bağlı kısa not */
export const VisitButton: React.FC<{ onSave: (note: string) => void; className?: string }> = ({ onSave, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  if (!open) return (
    <button onClick={() => { setNote(''); setOpen(true); }} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent-500 text-white text-xs font-bold ${className}`}>
      <Footprints className="w-3.5 h-3.5" /> Uğradım
    </button>
  );
  return (
    <div className="flex items-center gap-1.5 w-full">
      <input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="Kısa not (isteğe bağlı): ne konuşuldu?"
        onKeyDown={e => { if (e.key === 'Enter') { onSave(note); setOpen(false); } }}
        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white" />
      <button onClick={() => { onSave(note); setOpen(false); }} className="px-2.5 py-1.5 rounded-lg bg-accent-500 text-white text-xs font-bold">Kaydet</button>
      <button onClick={() => setOpen(false)} className="px-2 py-1.5 rounded-lg text-slate-500 text-xs font-bold">Vazgeç</button>
    </div>
  );
};

/** Firma kartında: son ziyaret ve ziyaret geçmişi */
export const VisitBox: React.FC<{ visits: Visit[]; onVisit?: (note: string) => void }> = ({ visits, onVisit }) => {
  const last = visits[0];
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-black text-slate-900 flex items-center gap-1.5"><Footprints className="w-4 h-4 text-accent-600" /> Ziyaretler</div>
        <span className={`text-xs font-bold ${!last || daysSince(last.date) > 90 ? 'text-rose-600' : 'text-slate-500'}`}>
          {last ? `Son ziyaret ${daysSince(last.date) === 0 ? 'bugün' : `${daysSince(last.date)} gün önce`}` : 'Hiç ziyaret kaydı yok'}
        </span>
      </div>
      {onVisit && <VisitButton onSave={onVisit} />}
      {visits.length > 0 && (
        <ul className="divide-y divide-slate-100 text-xs">
          {visits.slice(0, 5).map(v => (
            <li key={v.id} className="py-1.5 flex gap-2"><span className="w-20 shrink-0 tabular-nums text-slate-500">{trDay(v.date)}</span><span className="text-slate-700 min-w-0">{v.note || '—'}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
};

/**
 * Günlük ziyaret planı: seçilen şehirde bekleyen teklifi veya alacağı olan, ya da uzun süredir uğranmayan firmalar.
 * Öncelik: bekleyen teklif + alacak tutarı, sonra en eski ziyaret.
 */
export const VisitPlan: React.FC<{
  customers: Customer[];
  quotes: Quote[];
  visits: Visit[];
  rates: Rates;
  balanceOf: (c: Customer) => { estimate: number } | null;
  onOpen: (c: Customer) => void;
  onSaveVisit?: (v: Visit) => void;
  currentRole: UserRole;
}> = ({ customers, quotes, visits, rates, balanceOf, onOpen, onSaveVisit, currentRole }) => {
  const cities = useMemo(() => {
    const m = new Map<string, number>();
    customers.forEach(c => { const k = (c.city || '').trim(); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [customers]);
  const [city, setCity] = useState(() => { try { return localStorage.getItem(CITY_KEY) || ''; } catch { return ''; } });
  const cur = city && cities.includes(city) ? city : cities[0] || '';
  const pick = (c: string) => { setCity(c); try { localStorage.setItem(CITY_KEY, c); } catch { /* yok */ } };
  const [onlyHot, setOnlyHot] = useState(false);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const byName = new Map<string, Quote[]>();
    quotes.forEach(x => { const k = foldName(x.customerName); byName.set(k, [...(byName.get(k) || []), x]); });
    const cityKey = foldName(cur);
    return customers
      .filter(c => statusOf(c) === 'aktif' && foldName(c.city || '') === cityKey)
      .filter(c => !q.trim() || foldName(c.name).includes(foldName(q)))
      .map(c => {
        const qs = byName.get(foldName(c.name)) || [];
        const pending = qs.filter(x => PENDING_STATUSES.includes(x.status));
        const pendingAmt = pending.reduce((s, x) => s + quoteTry(x, rates), 0);
        const bal = balanceOf(c)?.estimate ?? 0;
        const vs = visitsOf(visits, c.name);
        const lastQuote = qs.map(x => x.createdAt).sort().pop();
        return { c, pending: pending.length, pendingAmt, bal, lastVisit: vs[0]?.date, lastQuote, today: vs[0]?.date === localDay() };
      })
      .filter(r => !onlyHot || r.pendingAmt > 0 || r.bal > 0)
      .filter(r => r.pendingAmt > 0 || r.bal > 0 || (r.lastQuote && daysSince(r.lastQuote) <= 365) || r.lastVisit)
      .sort((a, b) => (b.pendingAmt + Math.max(0, b.bal)) - (a.pendingAmt + Math.max(0, a.bal))
        || (a.lastVisit || '').localeCompare(b.lastVisit || ''));
  }, [customers, quotes, visits, rates, cur, onlyHot, q, balanceOf]);

  const todayCount = visits.filter(v => v.date === localDay()).length;

  return (
    <div className="space-y-3">
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <MapPin className="w-4 h-4 text-brand-600" />
          <select value={cur} onChange={e => pick(e.target.value)} className="px-2.5 py-2 rounded-lg border border-slate-200 text-sm font-bold bg-white">
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={onlyHot} onChange={e => setOnlyHot(e.target.checked)} /> Sadece bekleyen teklif / alacak
          </label>
          <span className="ml-auto text-xs font-bold text-accent-700">Bugün {todayCount} ziyaret</span>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Firma ara…" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <p className="text-[11px] text-slate-500">{cur} · {rows.length} firma · sıralama: bekleyen teklif + alacak, sonra en uzun süredir uğranmayan</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">Bu şehirde öne çıkan firma yok.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100">
          {rows.map(r => (
            <div key={r.c.id} className={`p-3 space-y-2 ${r.today ? 'bg-accent-50/60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => onOpen(r.c)} className="text-left min-w-0">
                  <span className="block text-sm font-black text-slate-900 truncate">{r.c.name}</span>
                  <span className="flex flex-wrap gap-1 mt-1">
                    {r.pending > 0 && <Chip cls="bg-violet-50 text-violet-700 border-violet-200">{r.pending} bekleyen · {short(r.pendingAmt)} TL</Chip>}
                    {r.bal > 0 && <Chip cls="bg-rose-50 text-rose-700 border-rose-200">Alacak {short(r.bal)} TL</Chip>}
                    <Chip cls={!r.lastVisit || daysSince(r.lastVisit) > 90 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}>
                      {r.today ? 'Bugün uğrandı' : r.lastVisit ? `Son ziyaret ${daysSince(r.lastVisit)} gün önce` : 'Hiç ziyaret yok'}
                    </Chip>
                  </span>
                </button>
                {r.c.phone && (
                  <a href={`tel:${r.c.phone.replace(/[^\d+]/g, '')}`} className="shrink-0 p-2 rounded-lg border border-slate-200 text-slate-600" aria-label="Ara"><Phone className="w-4 h-4" /></a>
                )}
              </div>
              {onSaveVisit && <VisitButton onSave={note => onSaveVisit(newVisit(r.c, note, currentRole))} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Chip: React.FC<{ cls: string; children: React.ReactNode }> = ({ cls, children }) => (
  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${cls}`}>{children}</span>
);
