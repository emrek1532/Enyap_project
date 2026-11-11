import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, MapPin, MapPinCheck, Navigation, Phone, Plus, Trash2, X } from 'lucide-react';
import { Customer, Quote } from '../types';
import { listCard, SearchBox } from './ListUI';
import { directionsUrl, useRoute } from '../lib/route';
import { followDue, isPendingQuote } from '../lib/quoteRules';
import { localDay } from '../lib/dates';

const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').trim();
const trDay = (d: string) => d.split('-').reverse().join('.');

/**
 * Bugünün rotası: uğranacak firmalar sırayla listelenir, "Yol tarifi" Google Haritalar'ı açar.
 * Liste bu cihazda tutulur; "Uğradım" firmanın son uğrama tarihini yazar (Müşteriler listesindekiyle aynı).
 */
export const RouteView: React.FC<{
  customers: Customer[];
  quotes: Quote[];
  canEdit?: boolean;
  onSaveCustomer: (c: Customer) => void;
  onOpen: (c: Customer) => void;
}> = ({ customers, quotes, canEdit, onSaveCustomer, onOpen }) => {
  const [ids, setIds] = useRoute();
  const [q, setQ] = useState('');
  const today = localDay();
  const byId = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
  const stops = ids.map(id => byId.get(id)).filter((c): c is Customer => !!c);

  // Firma başına bekleyen teklif ve bugün aranacak teklif
  const info = useMemo(() => {
    const m = new Map<string, { pending: number; due: number }>();
    quotes.forEach(x => {
      if (!isPendingQuote(x)) return;
      const k = fold(x.customerName);
      const g = m.get(k) || { pending: 0, due: 0 };
      g.pending++; if (followDue(x, today)) g.due++;
      m.set(k, g);
    });
    return m;
  }, [quotes, today]);
  const infoOf = (c: Customer) => info.get(fold(c.name));

  const add = (c: Customer) => { setIds([...ids, c.id]); setQ(''); };
  const remove = (id: string) => setIds(ids.filter(x => x !== id));
  const move = (i: number, d: number) => { const n = [...ids]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setIds(n); };
  const visited = (c: Customer) => c.lastVisit === today;
  const toggleVisit = (c: Customer) => onSaveCustomer({ ...c, lastVisit: visited(c) ? undefined : today, updatedAt: new Date().toISOString() });

  const matches = useMemo(() => {
    const f = fold(q);
    if (!f) return [];
    return customers.filter(c => !ids.includes(c.id) && fold(`${c.name} ${c.city}`).includes(f)).slice(0, 6);
  }, [q, customers, ids]);

  // Öneriler: takip günü gelen firmalar; rotadaki şehirlerde 3 aydır uğranmayan aktif firmalar
  const suggest = useMemo(() => {
    const since = (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return localDay(d); })();
    const cities = new Set(stops.map(c => fold(c.city)));
    const due = customers.filter(c => !ids.includes(c.id) && (infoOf(c)?.due || 0) > 0);
    const stale = cities.size ? customers.filter(c => !ids.includes(c.id) && (c.status || 'aktif') === 'aktif' && cities.has(fold(c.city))
      && (!c.lastVisit || c.lastVisit < since) && !due.includes(c))
      .sort((a, b) => (infoOf(b)?.pending || 0) - (infoOf(a)?.pending || 0)) : [];
    return [...due.map(c => ({ c, why: 'Bugün aranacak teklifi var' })), ...stale.map(c => ({ c, why: c.lastVisit ? `Son uğrama ${trDay(c.lastVisit)}` : 'Hiç uğranmadı' }))].slice(0, 6);
  }, [customers, ids, stops, info]); // eslint-disable-line react-hooks/exhaustive-deps

  const url = directionsUrl(stops);
  const done = stops.filter(visited).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className={`${listCard} overflow-hidden`}>
        <div className="px-4 sm:px-5 py-4 bg-gradient-to-br from-[#1a3d6d] to-[#2b5f9e] text-white flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[12rem]">
            <h2 className="text-base font-black flex items-center gap-2"><Navigation className="w-5 h-5 text-sky-300" />Bugünün rotası</h2>
            <p className="text-xs text-sky-200/80">{stops.length ? `${stops.length} durak · ${done} uğrandı` : 'Henüz durak yok'} · {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}</p>
          </div>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="h-10 px-4 rounded-xl bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold inline-flex items-center gap-1.5">
              <Navigation className="w-4 h-4" />Yol tarifi
            </a>
          )}
          {stops.length > 0 && (
            <button type="button" onClick={() => confirm('Rota temizlensin mi?') && setIds([])} className="h-10 px-3 rounded-xl bg-white/10 border border-white/15 text-sm font-bold">Temizle</button>
          )}
        </div>

        <div className="p-3 sm:p-4 space-y-2">
          <div className="relative">
            <SearchBox value={q} onChange={setQ} placeholder="Rotaya firma ekle (ad veya şehir)…" />
            {matches.length > 0 && (
              <ul className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg py-1">
                {matches.map(c => (
                  <li key={c.id}>
                    <button type="button" onClick={() => add(c)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-brand-50">
                      <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800 truncate">{c.name}</span><span className="block text-[11px] text-slate-500">{c.city || '—'}</span></span>
                      <Plus className="w-4 h-4 text-brand-600 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {stops.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Bugün uğrayacağınız firmaları yukarıdan arayıp ekleyin ya da sağdaki önerilerden seçin. Sıralayıp "Yol tarifi" ile Google Haritalar'da açabilirsiniz.
            </div>
          )}
          <ol className="divide-y divide-slate-100">
            {stops.map((c, i) => {
              const inf = infoOf(c);
              const tel = (c.phone || '').replace(/[^\d+]/g, '');
              const v = visited(c);
              return (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-black shrink-0 ${v ? 'bg-emerald-500 text-white' : 'bg-[#1a3d6d] text-white'}`}>{v ? '✓' : i + 1}</span>
                  <button type="button" onClick={() => onOpen(c)} className="flex-1 min-w-0 text-left">
                    <span className={`block text-sm font-bold truncate ${v ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>{c.name}</span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      {c.city || '—'}{inf?.pending ? ` · ${inf.pending} bekleyen teklif` : ''}{inf?.due ? ' · bugün aranacak' : ''}{c.lastVisit && !v ? ` · son uğrama ${trDay(c.lastVisit)}` : ''}
                    </span>
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {canEdit && (
                      <button type="button" onClick={() => toggleVisit(c)} title={v ? 'Uğradım işaretini kaldır' : 'Uğradım'}
                        className={`h-8 px-2 inline-flex items-center gap-1 rounded-lg text-[11px] font-bold border ${v ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600'}`}>
                        {v ? <MapPinCheck className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}<span className="hidden sm:inline">{v ? 'Uğrandı' : 'Uğradım'}</span>
                      </button>
                    )}
                    {tel && <a href={`tel:${tel}`} aria-label="Ara" className="w-8 h-8 rounded-lg grid place-items-center text-sky-700 hover:bg-sky-50"><Phone className="w-4 h-4" /></a>}
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Yukarı" className="w-8 h-8 rounded-lg grid place-items-center text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label="Aşağı" className="w-8 h-8 rounded-lg grid place-items-center text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    <button type="button" onClick={() => remove(c.id)} aria-label="Rotadan çıkar" className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:text-rose-600 hover:bg-rose-50"><X className="w-4 h-4" /></button>
                  </div>
                </li>
              );
            })}
          </ol>
          {stops.length > 10 && <p className="text-[11px] text-amber-700">Google Haritalar yol tarifine ilk 10 durak alınır.</p>}
        </div>
      </div>

      <aside className={`${listCard} p-4 h-fit`}>
        <h3 className="text-sm font-black text-[#1a3d6d]">Öneriler</h3>
        <p className="text-[11px] text-slate-500 mb-2">Takip günü gelen firmalar; rotadaki şehirlerde 3 aydır uğranmayanlar</p>
        {suggest.length === 0 && <p className="text-xs text-slate-500 py-3">Şu an öneri yok. Rotaya firma ekledikçe aynı şehirdeki uğranmayan firmalar burada çıkar.</p>}
        <ul className="divide-y divide-slate-100">
          {suggest.map(({ c, why }) => (
            <li key={c.id} className="flex items-center gap-2 py-2">
              <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold text-slate-800 truncate">{c.name}</span><span className="block text-[11px] text-slate-500 truncate">{c.city || '—'} · {why}</span></span>
              <button type="button" onClick={() => add(c)} className="h-8 px-2.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-bold inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Ekle</button>
            </li>
          ))}
        </ul>
        {stops.length > 0 && <button type="button" onClick={() => confirm('Uğranan duraklar rotadan çıkarılsın mı?') && setIds(stops.filter(c => !visited(c)).map(c => c.id))} className="mt-3 w-full h-9 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 inline-flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Uğrananları çıkar</button>}
      </aside>
    </div>
  );
};
