import React, { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, Lightbulb, Loader2, Mic, Search, Square, X } from 'lucide-react';
import { SpeechSession, canSpeech, listen } from '../lib/speech';
import { Chip, PastList, ToolCard, pushPast, readPast, shortName, topRecent } from './ToolCard';
import { Customer, Quote } from '../types';
import { CURRENCY_LABEL } from '../lib/money';
import { Material, foldTr, searchMaterials, textMatcher } from '../lib/materials';
import { SupplierItem, searchSupplierItems, supplierColor } from '../lib/suppliers';
import { can, useAccess } from '../lib/access';
import { dayOf } from '../lib/dates';

/** Her firmadan en fazla `per` kalem, toplam `max` */
const perList = (items: SupplierItem[], per: number, max: number) => {
  const n = new Map<string, number>();
  return items.filter(x => { const c = n.get(x.listId) || 0; n.set(x.listId, c + 1); return c < per; }).slice(0, max);
};
const money = (v: number, c: string) => `${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${CURRENCY_LABEL[c as keyof typeof CURRENCY_LABEL] || c}`;
const trDay = (s: string) => dayOf(s).split('-').reverse().join('.');
// Son aramalar yalnız bu cihazda (sunucuya gitmez)
const HIST_KEY = 'search-history';

/**
 * Hızlı arama: firma adı yazılınca firmalar (cihazdaki veriden, internet kullanmaz); ürün adı veya kodu yazılınca
 * katalog fiyatı, firma listelerindeki fiyatlar ve bu ürünü en son kime kaçtan verdiğimiz tek ekranda görünür.
 */
export const QuickPrice: React.FC<{
  quotes: Quote[];
  customers: Customer[];
  onOpenQuote: (q: Quote) => void;
  onOpenCustomer?: (name: string) => void;
}> = ({ quotes, customers, onOpenQuote, onOpenCustomer }) => {
  const me = useAccess();
  const showOwn = can(me, 'materials'), showSup = can(me, 'suppliers');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState<Material[]>([]);
  const [sup, setSup] = useState<SupplierItem[]>([]);
  const term = q.trim();
  const [hist, setHist] = useState(() => readPast(HIST_KEY));
  const [mic, setMic] = useState<SpeechSession | null>(null);
  const [micErr, setMicErr] = useState('');
  // Aramayı hatırla: Enter'a basınca ya da bir sonuca dokununca
  const remember = () => { if (term.length >= 2) setHist(pushPast(HIST_KEY, term)); };
  const top = useMemo(() => topRecent(quotes), [quotes]);

  const voice = async () => {
    if (mic) { mic.stop(); return; }
    setMicErr('');
    const sess = listen({ onInterim: t => setQ(t) });
    setMic(sess);
    try {
      const t = (await sess.result).trim().replace(/[.?!]+$/, '');
      if (t) { setQ(t); setHist(pushPast(HIST_KEY, t)); }
    } catch (e) { setMicErr((e as Error).message); } finally { setMic(null); }
  };

  useEffect(() => {
    if (term.length < 2) { setOwn([]); setSup([]); return; }
    let live = true;
    const t = window.setTimeout(async () => {
      setBusy(true);
      const [o, s] = await Promise.all([
        showOwn ? searchMaterials(term, { limit: 5 }).then(r => r.items, () => []) : Promise.resolve([]),
        // Her firmadan en fazla 2 kalem: liste adına göre sıralı ilk 6'da hep aynı firmalar kalmasın
        showSup ? searchSupplierItems(term, { limit: 60 }).then(r => perList(r.items, 2, 10), () => []) : Promise.resolve([]),
      ]);
      if (!live) return;
      setOwn(o as Material[]); setSup(s as SupplierItem[]); setBusy(false);
    }, 300);
    return () => { live = false; window.clearTimeout(t); };
  }, [term, showOwn, showSup]);

  // Bu ürünü en son kime kaçtan verdik (teklif kalemlerinden, yeniden eskiye)
  const history = useMemo(() => {
    if (term.length < 2) return [];
    const match = textMatcher(term);
    const code = term.toUpperCase();
    const out: { q: Quote; name: string; price: number; disc: number; cur: string }[] = [];
    const sorted = [...quotes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    for (const qt of sorted) {
      for (const it of qt.items || []) {
        const hit = (it.code || '').toUpperCase() === code || !!match?.(`${it.productName} ${it.code || ''}`);
        if (!hit || !(it.unitPrice > 0)) continue;
        out.push({ q: qt, name: it.productName, price: it.unitPrice, disc: it.discount || 0, cur: it.currency || qt.currency || 'TRY' });
        break;
      }
      if (out.length >= 6) break;
    }
    return out;
  }, [term, quotes]);

  // Firmalar: ada (ya da şehre) göre; bekleyen teklif ve son teklif tarihiyle
  const firms = useMemo(() => {
    if (term.length < 2) return [];
    const words = foldTr(term).split(/\s+/).filter(Boolean);
    return customers
      .filter(c => words.every(w => foldTr(`${c.name} ${c.city || ''}`).includes(w)))
      .map(c => {
        const k = foldTr(c.name.trim());
        const qs = quotes.filter(x => foldTr(x.customerName.trim()) === k);
        const last = qs.reduce((m, x) => (x.createdAt > m ? x.createdAt : m), '');
        return { c, pending: qs.filter(x => x.status === 'gonderildi').length, last, starts: foldTr(c.name).startsWith(words[0]) };
      })
      .sort((a, b) => Number(b.starts) - Number(a.starts) || (b.last || '').localeCompare(a.last || ''))
      .slice(0, 5);
  }, [term, customers, quotes]);

  const empty = term.length >= 2 && !busy && !firms.length && !own.length && !sup.length && !history.length;

  return (
    <ToolCard icon={Search} title="Ara" subtitle="Firma, ürün adı ya da kodu: katalog fiyatı, firma listeleri ve en son kime kaçtan verdiğimiz.">
      <form onSubmit={e => { e.preventDefault(); remember(); }} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ara: firma, ürün adı veya kodu…" enterKeyHint="search"
            className="w-full pl-10 pr-10 py-3 rounded-full border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          {busy ? <Loader2 className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 animate-spin" />
            : q && <button type="button" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400" aria-label="Temizle"><X className="w-4 h-4" /></button>}
        </div>
        {canSpeech() && (
          <button type="button" onClick={voice} aria-label={mic ? 'Dinlemeyi bitir' : 'Sesle ara'}
            className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center ${mic ? 'bg-rose-600 text-white' : 'bg-brand-600 text-white'}`}>
            {mic ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
          </button>
        )}
      </form>
      {micErr && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{micErr}</div>}

      {/* Arama yokken: son aramalar ve sık kullanılanlar */}
      {term.length < 2 && (
        <>
          <PastList title="Son aramalar" items={hist} icon={Search} storageKey={HIST_KEY} onPick={setQ} onChange={setHist} />
          {(top.firms.length > 0 || top.products.length > 0) && (
            <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <div>
                  <div className="text-sm font-black text-slate-900">Sık kullanılanlar</div>
                  <div className="text-[11px] text-slate-500">Son 6 ayda en çok teklif verdiğiniz firmalar ve ürünler</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...top.firms.map(f => ({ label: f, q: f })), ...top.products.map(pn => ({ label: shortName(pn), q: pn }))].map(x => (
                  <Chip key={x.q} onClick={() => setQ(x.q)} title={x.q} className="bg-white border-sky-200 max-w-[14rem]"><span className="truncate">{x.label}</span></Chip>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {empty && <p className="text-xs text-slate-500 px-1">Sonuç bulunamadı.</p>}

      {firms.length > 0 && (
        <Group title="Firmalar">
          {firms.map(f => (
            <button key={f.c.id} onClick={() => { remember(); onOpenCustomer?.(f.c.name); }} className="w-full text-left">
              <Row left={<span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span className="min-w-0"><b className="text-slate-800">{f.c.name}</b>{f.c.city && <span className="text-slate-400"> · {f.c.city}</span>}<span className="block text-[11px] text-slate-500">{f.pending ? `${f.pending} bekleyen teklif` : 'Bekleyen teklif yok'}{f.last ? ` · son teklif ${trDay(f.last)}` : ''}</span></span></span>}
                right={<ChevronRight className="w-4 h-4 text-slate-400" />} />
            </button>
          ))}
        </Group>
      )}

      {own.length > 0 && (
        <Group title="Katalog fiyatı">
          {own.map(m => (
            <Row key={m.code} left={<><b className="font-mono text-[11px] text-slate-500 mr-1">{m.code}</b>{m.name}</>}
              right={m.price > 0 ? money(m.price, m.currency) : '—'} />
          ))}
        </Group>
      )}

      {sup.length > 0 && (
        <Group title="Firma listeleri (iskonto sonrası)">
          {sup.map(s => {
            const net = s.price * (1 - (s.discount || 0) / 100);
            return (
              <Row key={s.id}
                left={<><span className="inline-block text-[10px] font-black text-white rounded px-1.5 py-0.5 mr-1.5 align-middle" style={{ background: supplierColor(s.listName) }}>{s.listName}</span>{s.name}</>}
                right={<>{money(net, s.currency)}{s.discount > 0 && <span className="block text-[10px] font-normal text-slate-400">liste {money(s.price, s.currency)} · %{s.discount}</span>}</>} />
            );
          })}
        </Group>
      )}

      {history.length > 0 && (
        <Group title="En son kime kaçtan verdik">
          {history.map(h => (
            <button key={h.q.id} onClick={() => { remember(); onOpenQuote(h.q); }} className="w-full text-left">
              <Row left={<><b className="text-slate-800">{h.q.customerName}</b> <span className="text-slate-400">· {trDay(h.q.createdAt)}{h.q.status === 'onaylandi' ? ' · onaylı' : ''}</span><span className="block text-[11px] text-slate-500 truncate">{h.name}</span></>}
                right={<>{money(h.price * (1 - h.disc / 100), h.cur)}{h.disc > 0 && <span className="block text-[10px] font-normal text-slate-400">liste {money(h.price, h.cur)} · %{h.disc}</span>}</>} />
            </button>
          ))}
        </Group>
      )}
    </ToolCard>
  );
};

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500 px-1 mb-1">{title}</div>
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{children}</div>
  </div>
);

const Row: React.FC<{ left: React.ReactNode; right: React.ReactNode }> = ({ left, right }) => (
  <div className="flex items-start justify-between gap-3 px-2.5 py-1.5 text-xs">
    <span className="min-w-0 flex-1 text-slate-700 leading-snug">{left}</span>
    <span className="shrink-0 text-right font-bold text-slate-900 tabular-nums">{right}</span>
  </div>
);
