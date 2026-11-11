import { isPendingQuote } from '../lib/quoteRules';
import { trNum } from '../lib/num';
import React, { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Lightbulb, Loader2, Mic, Search, Send, Sparkles, Square, Star, X } from 'lucide-react';
import { SpeechSession, canSpeech, listen } from '../lib/speech';
import { Chip, PastList, ToolCard, pushPast, readPast, shortName, topRecent, writePast } from './ToolCard';
import { Customer, Quote } from '../types';
import { CURRENCY_LABEL } from '../lib/money';
import { Material, foldTr, searchMaterials, textMatcher } from '../lib/materials';
import { SupplierItem, searchSupplierItems, supplierColor } from '../lib/suppliers';
import { can, useAccess } from '../lib/access';
import { dayOf } from '../lib/dates';
import { searchTerm } from '../lib/askQuery';
import { AskAnswer, EXAMPLES, useAsk } from './AskQuotes';

/** Her firmadan en fazla `per` kalem, toplam `max` */
const perList = (items: SupplierItem[], per: number, max: number) => {
  const n = new Map<string, number>();
  return items.filter(x => { const c = n.get(x.listId) || 0; n.set(x.listId, c + 1); return c < per; }).slice(0, max);
};
const money = (v: number, c: string) => `${trNum(v, { maximumFractionDigits: 2 })} ${CURRENCY_LABEL[c as keyof typeof CURRENCY_LABEL] || c}`;
const trDay = (s: string) => dayOf(s).split('-').reverse().join('.');
// Son aramalar/sorular yalnız bu cihazda (sunucuya gitmez); eski "Sor" geçmişi bir kez buraya taşınır
const HIST_KEY = 'search-history', OLD_ASK_KEY = 'ask-history';
const TAG_LOCAL = 'Cihazda', TAG_AI = 'Yapay zekâ';
const readHist = () => {
  const old = readPast(OLD_ASK_KEY);
  if (!old.length) return readPast(HIST_KEY);
  const seen = new Set<string>();
  const h = [...readPast(HIST_KEY), ...old].sort((a, b) => b.at - a.at).filter(x => !seen.has(x.q) && !!seen.add(x.q)).slice(0, 8);
  writePast(HIST_KEY, h);
  try { localStorage.removeItem(OLD_ASK_KEY); } catch { /* */ }
  return h;
};

/**
 * Ara · Sor (tek kutu): yazarken firmalar, katalog fiyatı, firma fiyat listeleri ve bu ürünü en son kime kaçtan
 * verdiğimiz görünür. Soru yazılıp gönderilince ("Sarı dübel kaç para?") eski tekliflerden cevap da gelir
 * (sayı/fiyat soruları cihazda; serbest sorular `ai` izni varsa yapay zekâya). Sorudaki "kaç para", tarih,
 * durum gibi sözcükler aramadan çıkarılır (`searchTerm`).
 */
export const QuickPrice: React.FC<{
  quotes: Quote[];
  customers: Customer[];
  ai?: boolean;
  onOpenQuote: (q: Quote) => void;
  onOpenCustomer?: (name: string) => void;
}> = ({ quotes, customers, ai = true, onOpenQuote, onOpenCustomer }) => {
  const me = useAccess();
  const showOwn = can(me, 'materials'), showSup = can(me, 'suppliers');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState<Material[]>([]);
  const [sup, setSup] = useState<SupplierItem[]>([]);
  const names = useMemo(() => customers.map(c => c.name), [customers]);
  const cleaned = useMemo(() => searchTerm(q, names), [q, names]);
  const term = cleaned.length >= 2 ? cleaned : q.trim();
  const [hist, setHist] = useState(readHist);
  const [showEx, setShowEx] = useState(false);
  const ask = useAsk(quotes, names, ai);
  const [asked, setAsked] = useState('');
  const answer = asked === q.trim() ? ask.ans : null;
  const submit = async (text = q) => {
    const t = text.trim();
    if (!t) return;
    setQ(t); setAsked(t); setShowEx(false);
    const a = await ask.run(t);
    setHist(pushPast(HIST_KEY, t, a?.found ? (a.local ? TAG_LOCAL : TAG_AI) : undefined));
  };
  const [mic, setMic] = useState<SpeechSession | null>(null);
  const [micErr, setMicErr] = useState('');
  // Aramayı hatırla: Enter'a basınca ya da bir sonuca dokununca
  const remember = () => { if (q.trim().length >= 2) setHist(pushPast(HIST_KEY, q.trim())); };
  const top = useMemo(() => topRecent(quotes), [quotes]);

  const voice = async () => {
    if (mic) { mic.stop(); return; }
    setMicErr('');
    const sess = listen({ onInterim: t => setQ(t) });
    setMic(sess);
    try {
      const t = (await sess.result).trim().replace(/[.?!]+$/, '');
      if (t) submit(t);
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
        return { c, pending: qs.filter(isPendingQuote).length, last, starts: foldTr(c.name).startsWith(words[0]) };
      })
      .sort((a, b) => Number(b.starts) - Number(a.starts) || (b.last || '').localeCompare(a.last || ''))
      .slice(0, 5);
  }, [term, customers, quotes]);

  const empty = term.length >= 2 && !busy && !ask.busy && !firms.length && !own.length && !sup.length && !history.length && !answer?.found;
  // Cevapta kaynak satırlar varsa "en son kime kaçtan" listesi tekrar gösterilmez
  const showHistory = history.length > 0 && !(answer && answer.lines.length);

  return (
    <ToolCard icon={Search} title="Ara · Sor" subtitle="Ürün, firma ya da soru: eski teklifler, katalog ve fiyat listeleri tek yerde.">
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ör. sarı dübel kaç para?" enterKeyHint="search"
            className="w-full pl-10 pr-10 py-3 rounded-full border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          {busy ? <Loader2 className="w-4 h-4 text-slate-500 absolute right-4 top-1/2 -translate-y-1/2 animate-spin" />
            : q && <button type="button" onClick={() => { setQ(''); ask.clear(); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500" aria-label="Temizle"><X className="w-4 h-4" /></button>}
        </div>
        <button type="submit" disabled={ask.busy || !q.trim()} aria-label="Sor"
          className="w-12 h-12 shrink-0 rounded-full bg-brand-600 text-white flex items-center justify-center disabled:opacity-50">
          {ask.busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </form>

      {/* Kısayollar */}
      <div className="flex flex-wrap gap-2">
        <Chip onClick={() => setShowEx(v => !v)} active={showEx}>
          <Star className="w-3.5 h-3.5" /> Örnek sorular <ChevronDown className={`w-3.5 h-3.5 transition ${showEx ? 'rotate-180' : ''}`} />
        </Chip>
        {canSpeech() && (
          <button type="button" onClick={voice} disabled={ask.busy}
            className={`px-3 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 ${mic ? 'bg-rose-50 border-rose-200 text-rose-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            {mic ? <><Square className="w-3.5 h-3.5" /> Dinliyorum… bitir</> : <><Mic className="w-3.5 h-3.5" /> Sesle sor</>}
          </button>
        )}
      </div>
      {micErr && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{micErr}</div>}
      {showEx && (
        <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
          {EXAMPLES.map(x => (
            <li key={x}>
              <button type="button" onClick={() => submit(x)} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" /> <span className="flex-1">{x}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Arama yokken: son aramalar/sorular ve sık kullanılanlar */}
      {term.length < 2 && !answer && (
        <>
          <PastList title="Son aramalar ve sorular" items={hist} icon={Search} storageKey={HIST_KEY} onPick={x => submit(x)} onChange={setHist}
            tagClass={t => (t === TAG_LOCAL ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700')} />
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

      {term.length >= 2 && !answer && !ask.busy && q.trim().split(/\s+/).length > 1 && (
        <p className="text-[11px] text-slate-500 px-1">Eski tekliflerden cevap için <Send className="inline w-3 h-3" /> düğmesine basın.</p>
      )}
      {answer && <AskAnswer ans={answer} onOpenQuote={q2 => { remember(); onOpenQuote(q2); }} />}

      {empty && <p className="text-xs text-slate-500 px-1">Sonuç bulunamadı.</p>}

      {firms.length > 0 && (
        <Group title="Firmalar">
          {firms.map(f => (
            <button key={f.c.id} onClick={() => { remember(); onOpenCustomer?.(f.c.name); }} className="w-full text-left">
              <Row left={<span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" /><span className="min-w-0"><b className="text-slate-800">{f.c.name}</b>{f.c.city && <span className="text-slate-500"> · {f.c.city}</span>}<span className="block text-[11px] text-slate-500">{f.pending ? `${f.pending} bekleyen teklif` : 'Bekleyen teklif yok'}{f.last ? ` · son teklif ${trDay(f.last)}` : ''}</span></span></span>}
                right={<ChevronRight className="w-4 h-4 text-slate-500" />} />
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
                right={<>{money(net, s.currency)}{s.discount > 0 && <span className="block text-[10px] font-normal text-slate-500">liste {money(s.price, s.currency)} · %{s.discount}</span>}</>} />
            );
          })}
        </Group>
      )}

      {showHistory && (
        <Group title="En son kime kaçtan verdik">
          {history.map(h => (
            <button key={h.q.id} onClick={() => { remember(); onOpenQuote(h.q); }} className="w-full text-left">
              <Row left={<><b className="text-slate-800">{h.q.customerName}</b> <span className="text-slate-500">· {trDay(h.q.createdAt)}{h.q.status === 'onaylandi' ? ' · onaylı' : ''}</span><span className="block text-[11px] text-slate-500 truncate">{h.name}</span></>}
                right={<>{money(h.price * (1 - h.disc / 100), h.cur)}{h.disc > 0 && <span className="block text-[10px] font-normal text-slate-500">liste {money(h.price, h.cur)} · %{h.disc}</span>}</>} />
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
