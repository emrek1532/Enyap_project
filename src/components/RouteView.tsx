import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, MapPin, MapPinCheck, Navigation, Phone, Plus, Trash2, X } from 'lucide-react';
import { Customer, Quote } from '../types';
import { SearchBox } from './ListUI';
import { directionsUrl, useRoute } from '../lib/route';
import { followDue, isPendingQuote } from '../lib/quoteRules';
import { localDay } from '../lib/dates';

const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').trim();
const trDay = (d: string) => d.split('-').reverse().join('.');
const card = 'bg-white rounded-2xl border border-[#E2EAF3] shadow-[0_10px_28px_-24px_rgba(11,35,67,0.45)]';
/** Ziyaret durumu: bugün (turkuaz) / yakın zamanda ≤30 gün (mavi) / uzun süredir >90 gün ya da hiç (gri) */
const visitTag = (d: string | undefined, today: string) => {
  if (!d) return { l: 'Hiç uğranmadı', c: 'bg-[#F1F6FC] text-[#7186A3] border-[#E2EAF3]' };
  if (d === today) return { l: 'Bugün uğrandı', c: 'bg-[#E6F7F4] text-[#00897A] border-[#00B49A]/30' };
  const n = Math.floor((Date.parse(today) - Date.parse(d)) / 864e5);
  if (n <= 30) return { l: 'Yakın zamanda', c: 'bg-[#EAF5FC] text-[#006DBB] border-[#006DBB]/25' };
  if (n > 90) return { l: 'Uzun süredir uğranmadı', c: 'bg-[#F1F6FC] text-[#7186A3] border-[#E2EAF3]' };
  return { l: `${n} gün önce`, c: 'bg-[#F1F6FC] text-[#173F73] border-[#E2EAF3]' };
};

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
      <div className={`${card} overflow-hidden`}>
        <div className="relative px-4 sm:px-5 py-4 bg-gradient-to-br from-[#0B2343] to-[#173F73] text-white flex flex-wrap items-center gap-3">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[#006DBB] via-[#009FE3] to-[#00B49A]" />
          <div className="flex-1 min-w-[12rem]">
            <h2 className="text-base font-black flex items-center gap-2"><Navigation className="w-5 h-5 text-[#009FE3]" />Bugünün rotası</h2>
            <p className="text-xs text-white/70">{stops.length ? `${stops.length} durak · ${done} uğrandı` : 'Henüz durak yok'} · {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}</p>
          </div>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="h-10 px-4 rounded-xl bg-[#00B49A] hover:bg-[#00A08A] text-white text-sm font-bold inline-flex items-center gap-1.5 transition-colors">
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
              <ul className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-[#E2EAF3] bg-white shadow-lg py-1">
                {matches.map(c => (
                  <li key={c.id}>
                    <button type="button" onClick={() => add(c)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[#EAF5FC]">
                      <span className="min-w-0"><span className="block text-sm font-semibold text-[#0B2343] truncate">{c.name}</span><span className="block text-[11px] text-[#7186A3]">{c.city || '—'}</span></span>
                      <Plus className="w-4 h-4 text-[#006DBB] shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {stops.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-[#E2EAF3] bg-[#F1F6FC]/60 px-4 py-8 text-center text-sm text-[#7186A3]">
              Bugün uğrayacağınız firmaları yukarıdan arayıp ekleyin ya da sağdaki önerilerden seçin. Sıralayıp "Yol tarifi" ile Google Haritalar'da açabilirsiniz.
            </div>
          )}
          <ol className="space-y-2">
            {stops.map((c, i) => {
              const inf = infoOf(c);
              const tel = (c.phone || '').replace(/[^\d+]/g, '');
              const v = visited(c);
              const tag = visitTag(c.lastVisit, today);
              return (
                <li key={c.id} className={`rounded-xl border px-3 py-2.5 transition-colors ${v ? 'border-[#00B49A]/30 bg-[#F3FBF9]' : 'border-[#E2EAF3] bg-white hover:bg-[#F1F6FC]/60'}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 w-7 h-7 rounded-full grid place-items-center text-xs font-black shrink-0 ${v ? 'bg-[#00B49A] text-white' : 'bg-[#0B2343] text-white'}`}>{v ? '✓' : i + 1}</span>
                    <button type="button" onClick={() => onOpen(c)} className="flex-1 min-w-0 text-left">
                      <span className={`block text-sm font-bold break-words ${v ? 'text-[#7186A3] line-through decoration-[#7186A3]/40' : 'text-[#0B2343]'}`}>{c.name}</span>
                      <span className="flex items-center gap-1 text-[11px] text-[#7186A3]"><MapPin className="w-3.5 h-3.5 shrink-0 text-[#006DBB]" />{c.city || '—'}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-bold">
                        <span className={`px-1.5 py-0.5 rounded-md border ${tag.c}`}>{tag.l}</span>
                        {c.lastVisit && !v && <span className="px-1.5 py-0.5 rounded-md bg-[#F1F6FC] text-[#173F73] tabular-nums">Son ziyaret {trDay(c.lastVisit)}</span>}
                        <span className="px-1.5 py-0.5 rounded-md bg-[#EAF5FC] text-[#006DBB]">Planlı · {i + 1}. durak</span>
                        {inf?.pending ? <span className="px-1.5 py-0.5 rounded-md bg-[#EAF5FC] text-[#006DBB] tabular-nums">{inf.pending} bekleyen teklif</span> : null}
                        {inf?.due ? <span className="px-1.5 py-0.5 rounded-md bg-[#E6F7F4] text-[#00897A]">Bugün aranacak</span> : null}
                      </span>
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1 flex-wrap">
                    {canEdit && (
                      <button type="button" onClick={() => toggleVisit(c)} title={v ? 'Uğradım işaretini kaldır' : 'Ziyaret kaydı: uğradım'}
                        className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-bold border transition-colors ${v ? 'bg-[#E6F7F4] border-[#00B49A]/30 text-[#00897A]' : 'bg-[#006DBB] border-[#006DBB] text-white hover:bg-[#173F73]'}`}>
                        {v ? <MapPinCheck className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}{v ? 'Uğrandı' : 'Ziyaret kaydı'}
                      </button>
                    )}
                    {tel && <a href={`tel:${tel}`} aria-label="Ara" className="w-9 h-9 rounded-lg grid place-items-center text-[#006DBB] bg-[#EAF5FC] hover:bg-[#d6ebf8]"><Phone className="w-4 h-4" /></a>}
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Yukarı" className="w-9 h-9 rounded-lg grid place-items-center text-[#173F73] hover:bg-[#F1F6FC] disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label="Aşağı" className="w-9 h-9 rounded-lg grid place-items-center text-[#173F73] hover:bg-[#F1F6FC] disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    <button type="button" onClick={() => remove(c.id)} aria-label="Rotadan çıkar" className="w-9 h-9 rounded-lg grid place-items-center text-[#7186A3] hover:text-rose-600 hover:bg-rose-50"><X className="w-4 h-4" /></button>
                  </div>
                </li>
              );
            })}
          </ol>
          {stops.length > 10 && <p className="text-[11px] font-semibold text-[#173F73]">Google Haritalar yol tarifine ilk 10 durak alınır.</p>}
        </div>
      </div>

      <aside className={`${card} p-4 h-fit`}>
        <h3 className="text-sm font-black text-[#0B2343]">Öneriler</h3>
        <p className="text-[11px] text-[#7186A3] mb-2">Takip günü gelen firmalar; rotadaki şehirlerde 3 aydır uğranmayanlar</p>
        {suggest.length === 0 && <p className="text-xs text-[#7186A3] py-3">Şu an öneri yok. Rotaya firma ekledikçe aynı şehirdeki uğranmayan firmalar burada çıkar.</p>}
        <ul className="divide-y divide-[#E2EAF3]">
          {suggest.map(({ c, why }) => (
            <li key={c.id} className="flex items-center gap-2 py-2">
              <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold text-[#0B2343] truncate">{c.name}</span><span className="block text-[11px] text-[#7186A3] truncate">{c.city || '—'} · {why}</span></span>
              <button type="button" onClick={() => add(c)} className="h-9 px-3 rounded-lg bg-[#EAF5FC] text-[#006DBB] hover:bg-[#d6ebf8] text-xs font-bold inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Ekle</button>
            </li>
          ))}
        </ul>
        {stops.length > 0 && <button type="button" onClick={() => confirm('Uğranan duraklar rotadan çıkarılsın mı?') && setIds(stops.filter(c => !visited(c)).map(c => c.id))} className="mt-3 w-full h-9 rounded-xl border border-[#E2EAF3] text-xs font-bold text-[#173F73] hover:bg-[#F1F6FC] inline-flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Uğrananları çıkar</button>}
      </aside>
    </div>
  );
};
