import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, Search, XCircle } from 'lucide-react';
import { CURRENCY_LABEL } from '../lib/money';
import { formatPrice } from '../lib/materials';
import { SupplierItem, SupplierList, fetchSupplierLists, searchSupplierItems, setSupplierDiscount, supplierColor, uploadSupplierPdf, uploadedSupplierFiles } from '../lib/suppliers';

const PAGE = 50;

/** Liste tarihinden ("Ocak 2026", "2023") kaç ay geçtiğini kabaca hesaplar */
const MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
function ageMonths(listDate: string): number | null {
  const y = /(20\d\d)/.exec(listDate)?.[1];
  if (!y) return null;
  const m = MONTHS.findIndex(x => fold(listDate).includes(x));
  const now = new Date();
  return (now.getFullYear() - Number(y)) * 12 + (now.getMonth() - (m >= 0 ? m : 0));
}

type UpState = { name: string; status: 'wait' | 'run' | 'ok' | 'err' | 'skip'; info?: string };

/**
 * Fiyat listesi PDF'lerini toplu yükleme: PDF cihazda okunur, sadece yazısı sisteme gider
 * (543 MB'lık klasör bile birkaç MB yazı eder). Kalemlere ayrıştırma sonra yapılır.
 */
const SupplierUploader: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<UpState[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<number | null>(null);

  useEffect(() => { uploadedSupplierFiles().then(m => setUploaded(Object.keys(m).length), () => setUploaded(null)); }, []);

  const run = async (files: File[]) => {
    // Daha önce yazısıyla yüklenmiş dosyalar atlanır: yarıda kalan yükleme kaldığı yerden sürer
    const done = await uploadedSupplierFiles().catch(() => ({} as Record<string, number>));
    const already = files.filter(f => /\.pdf$/i.test(f.name) && done[f.name]);
    const pdfs = files.filter(f => /\.pdf$/i.test(f.name) && !done[f.name]);
    const others = files.filter(f => !/\.pdf$/i.test(f.name));
    const list: UpState[] = [
      ...pdfs.map(f => ({ name: f.name, status: 'wait' as const })),
      ...others.map(f => ({ name: f.name, status: 'skip' as const, info: 'PDF değil — bu dosyayı sohbete ayrıca gönderin' })),
      ...already.map(f => ({ name: f.name, status: 'ok' as const, info: 'zaten yüklü, atlandı' })),
    ];
    setRows(list);
    setBusy(true);
    // Yükleme sürerken ekran kararmasın (kararırsa telefon sayfayı durdurabilir)
    let lock: any = null;
    try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* desteklenmiyor */ }
    for (let i = 0; i < pdfs.length; i++) {
      const f = pdfs[i];
      setRows(r => r.map(x => (x.name === f.name ? { ...x, status: 'run', info: 'okunuyor…' } : x)));
      try {
        const res = await uploadSupplierPdf(f, info =>
          setRows(r => r.map(x => (x.name === f.name ? { ...x, info } : x))));
        setRows(r => r.map(x => (x.name === f.name ? {
          ...x, status: res.chars > 200 ? 'ok' : 'err',
          info: res.chars > 200 ? `${res.pages} sayfa${res.ocr ? ' (resimden okundu)' : ''}` : `${res.pages} sayfa ama yazı okunamadı`,
        } : x)));
      } catch (e) {
        setRows(r => r.map(x => (x.name === f.name ? { ...x, status: 'err', info: `okunamadı / kaydedilemedi${e instanceof Error ? ': ' + e.message : ''}` } : x)));
      }
    }
    setBusy(false);
    try { await lock?.release(); } catch { /* yok */ }
    uploadedSupplierFiles().then(m => setUploaded(Object.keys(m).length), () => undefined);
  };

  const done = rows.filter(r => r.status === 'ok').length;
  const total = rows.filter(r => r.status !== 'skip').length;

  return (
    <div className="bg-white rounded-xl border border-dashed border-brand-300 p-3 space-y-2">
      <div className="flex items-center gap-3">
        <FileUp className="w-6 h-6 text-brand-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm text-slate-900">Fiyat listesi PDF'lerini yükle</div>
          <div className="text-xs text-slate-500">
            Klasördeki tüm PDF'leri birlikte seçebilirsiniz. PDF'ler cihazınızda okunur, sadece yazısı gönderilir.
            {uploaded !== null && uploaded > 0 && <> · Şu ana kadar <b>{uploaded}</b> dosya yüklendi.</>}
          </div>
          {busy && (
            <div className="mt-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Yükleme bitene kadar bu sayfayı açık tutun. Kapanırsa aynı dosyaları tekrar seçin; yüklenmiş olanlar atlanır.
            </div>
          )}
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="shrink-0 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-60"
        >
          {busy ? `Yükleniyor ${done}/${total}` : 'PDF Seç'}
        </button>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden
          onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) run(fs); }} />
      </div>
      {rows.length > 0 && (
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
          {rows.map(r => (
            <div key={r.name} className="py-1.5 flex items-center gap-2 text-xs">
              {r.status === 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600 shrink-0" />
                : r.status === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                : r.status === 'err' || r.status === 'skip' ? <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                : <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-slate-700">{r.name}</span>
              <span className="shrink-0 text-slate-500">{r.info}</span>
            </div>
          ))}
        </div>
      )}
      {!busy && total > 0 && done === total && (
        <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-md px-2 py-1.5">
          {done} PDF yüklendi. Claude'a "yükledim" yazın; listeler firma firma ayrıştırılıp buraya eklenecek.
        </div>
      )}
    </div>
  );
};

/** Malzemeler → Firma Fiyat Listeleri: her firma ayrı klasör; kalemleri bizim katalogla karışmaz */
export const SupplierListsPanel: React.FC = () => {
  const [lists, setLists] = useState<SupplierList[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SupplierItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [discountDraft, setDiscountDraft] = useState('');
  const reqId = useRef(0);

  useEffect(() => {
    fetchSupplierLists().then(setLists).catch(() => { setLists([]); setError('Fiyat listeleri yüklenemedi.'); });
  }, []);

  const current = useMemo(() => lists?.find(l => l.id === active) || null, [lists, active]);
  useEffect(() => { setDiscountDraft(current ? String(current.discount || '') : ''); }, [current]);

  const load = async (offset: number, append: boolean) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const r = await searchSupplierItems(query.trim(), { list: active, limit: PAGE, offset });
      if (id !== reqId.current) return;
      setItems(prev => (append ? [...prev, ...r.items] : r.items));
      setTotal(r.total);
      setError('');
    } catch {
      if (id === reqId.current) setError('Liste yüklenemedi. İnternet bağlantısını kontrol edin.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!lists?.length) return;
    if (!active && !query.trim()) { setItems([]); setTotal(0); return; }
    const t = window.setTimeout(() => load(0, false), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, active, lists]);

  const saveDiscount = async () => {
    if (!current) return;
    const v = Math.min(100, Math.max(0, Number(discountDraft.replace(',', '.')) || 0));
    if (v === current.discount) return;
    try {
      await setSupplierDiscount(current.id, v);
      setLists(prev => prev?.map(l => (l.id === current.id ? { ...l, discount: v } : l)) || prev);
      setItems(prev => prev.map(it => (it.listId === current.id ? { ...it, discount: v } : it)));
    } catch {
      setError('İskonto kaydedilemedi.');
    }
  };

  if (lists === null) {
    return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }
  if (!lists.length) {
    return (
      <div className="space-y-3">
        <SupplierUploader />
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
          Henüz firma fiyat listesi eklenmedi. Listeler eklendiğinde burada her firma ayrı bir klasör olarak görünecek.
        </div>
      </div>
    );
  }

  const totalItems = lists.reduce((a, l) => a + l.itemCount, 0);
  const net = (it: SupplierItem) => it.price * (1 - (it.discount || 0) / 100);

  return (
    <div className="space-y-3">
      <SupplierUploader />
      {/* Firma klasörleri */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setActive(null)}
          className={`shrink-0 px-3 py-1.5 rounded-full border text-sm font-bold ${!active ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
        >
          Tümü <span className={`text-[11px] font-semibold ${!active ? 'text-brand-100' : 'text-slate-400'}`}>{totalItems.toLocaleString('tr-TR')}</span>
        </button>
        {lists.map(l => (
          <button
            key={l.id}
            onClick={() => setActive(l.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full border text-sm font-bold whitespace-nowrap ${active === l.id ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
            title={l.title}
          >
            {l.name}{l.listDate ? <span className="font-medium opacity-70"> · {l.listDate}</span> : null}
          </button>
        ))}
      </div>

      {/* Seçili liste bilgisi */}
      {current ? (
        <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black shrink-0" style={{ background: supplierColor(current.name) }}>
            {current.name.slice(0, 1).toLocaleUpperCase('tr')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-black text-slate-900 truncate">{current.title || current.name}</div>
            <div className="text-xs text-slate-500">
              {current.listDate || 'tarih yok'} · {CURRENCY_LABEL[current.currency]} · {current.itemCount.toLocaleString('tr-TR')} kalem · liste fiyatı
            </div>
          </div>
          <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
            İskonto %
            <input
              value={discountDraft}
              onChange={e => setDiscountDraft(e.target.value)}
              onBlur={saveDiscount}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              inputMode="decimal"
              placeholder="0"
              className="w-14 px-2 py-1.5 border border-slate-300 rounded-md text-sm text-right font-bold text-slate-900"
            />
          </label>
          {(() => {
            const age = ageMonths(current.listDate);
            return age !== null && age >= 6
              ? <span className="hidden sm:inline text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">{age} ay önce</span>
              : null;
          })()}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {lists.map(l => {
            const age = ageMonths(l.listDate);
            return (
              <button key={l.id} onClick={() => setActive(l.id)} className="text-left bg-white rounded-xl border border-slate-200 hover:border-brand-300 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-sm shrink-0" style={{ background: supplierColor(l.name) }}>
                    {l.name.slice(0, 1).toLocaleUpperCase('tr')}
                  </span>
                  <span className="font-black text-slate-900 truncate">{l.name}</span>
                </div>
                <div className="text-xs text-slate-500">{l.itemCount.toLocaleString('tr-TR')} kalem · {CURRENCY_LABEL[l.currency]}{l.discount ? ` · %${l.discount}` : ''}</div>
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  {l.listDate || 'tarih yok'}
                  {age !== null && age >= 6 && <span className="text-[10px] font-bold px-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">{age} ay</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Arama */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={current ? `${current.name} listesinde kod veya ürün ara…` : 'Tüm firma listelerinde ara (kod, ürün)…'}
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white"
        />
      </div>

      {error && <div className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</div>}

      {(active || query.trim()) && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-100 flex items-center gap-2">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {total.toLocaleString('tr-TR')} kalem
          </div>
          {items.length === 0 && !loading && <p className="py-8 text-center text-sm text-slate-400">Sonuç yok.</p>}
          <div className="divide-y divide-slate-100">
            {items.map(it => (
              <div key={it.id} className="px-3 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 leading-snug break-words">
                    {!active && (
                      <span className="text-[10px] font-black text-white rounded px-1.5 py-0.5 mr-1.5 align-[1px]" style={{ background: supplierColor(it.listName) }}>
                        {it.listName.toLocaleUpperCase('tr')}
                      </span>
                    )}
                    {it.name}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {it.code ? `Firma kodu: ${it.code}` : 'kodsuz'} · {it.unit}
                    {it.ourCode && <span className="font-sans ml-1.5 px-1.5 rounded border border-slate-200 bg-slate-50">Bizim kod: {it.ourCode}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-black text-slate-900 tabular-nums whitespace-nowrap">
                    {it.price > 0 ? `${formatPrice(it.price)} ${CURRENCY_LABEL[it.currency]}` : <span className="text-slate-400 font-semibold">fiyat yok</span>}
                  </div>
                  {it.price > 0 && it.discount > 0 && (
                    <div className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">net {formatPrice(net(it))} (−%{it.discount})</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {items.length < total && (
            <button onClick={() => load(items.length, true)} disabled={loading}
              className="w-full py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-50 border-t border-slate-100 disabled:opacity-50">
              Daha fazla göster ({(total - items.length).toLocaleString('tr-TR')} kalem kaldı)
            </button>
          )}
        </div>
      )}
    </div>
  );
};
