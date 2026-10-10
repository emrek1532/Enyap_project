import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileUp, ImagePlus, Link2, Pencil, Loader2, Plus, Search, X, XCircle } from 'lucide-react';
import { MaterialPicker } from './MaterialPicker';
import { CURRENCY_LABEL } from '../lib/money';
import { formatPrice } from '../lib/materials';
import { SupplierItem, SupplierList, fetchSupplierLists, searchSupplierItems, deleteSupplierList, exportListToExcel, importListFromSheet, importListFromText, reimportList, updateSupplierListInfo, logoFromFile, setSupplierDiscount, setSupplierLogo, setSupplierOurCode, clearSupplierMatches, rematchSupplierItems, supplierColor, uploadSupplierPdf, uploadedSupplierFiles } from '../lib/suppliers';

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
const SupplierUploader: React.FC<{ onImported?: () => void }> = ({ onImported }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<UpState[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<number | null>(null);

  useEffect(() => { uploadedSupplierFiles().then(m => setUploaded(Object.keys(m).length), () => setUploaded(null)); }, []);

  const run = async (files: File[]) => {
    // Daha önce yazısıyla yüklenmiş dosyalar atlanır: yarıda kalan yükleme kaldığı yerden sürer
    const done = await uploadedSupplierFiles().catch(() => ({} as Record<string, number>));
    const already = files.filter(f => /\.pdf$/i.test(f.name) && done[f.name]);
    const isSheet = (f: File) => /\.(xlsx|csv)$/i.test(f.name);
    const pdfs = files.filter(f => (/\.pdf$/i.test(f.name) && !done[f.name]) || isSheet(f));
    const others = files.filter(f => !/\.pdf$/i.test(f.name) && !isSheet(f));
    const list: UpState[] = [
      ...pdfs.map(f => ({ name: f.name, status: 'wait' as const })),
      ...others.map(f => ({ name: f.name, status: 'skip' as const, info: 'desteklenmeyen dosya (PDF, Excel .xlsx ya da CSV yükleyin)' })),
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
        // Excel / CSV: doğrudan listeye
        if (isSheet(f)) {
          const imp = await importListFromSheet(f, info => setRows(r => r.map(x => (x.name === f.name ? { ...x, info } : x))));
          setRows(r => r.map(x => (x.name === f.name ? {
            ...x, status: 'ok',
            info: `${imp.name}: ${imp.items.toLocaleString('tr-TR')} kalem · ${imp.matched.toLocaleString('tr-TR')} bizim koda bağlandı`,
          } : x)));
          onImported?.();
          continue;
        }
        const res = await uploadSupplierPdf(f, info =>
          setRows(r => r.map(x => (x.name === f.name ? { ...x, info } : x))));
        if (res.chars <= 200) {
          setRows(r => r.map(x => (x.name === f.name ? { ...x, status: 'err', info: `${res.pages} sayfa ama yazı okunamadı` } : x)));
          continue;
        }
        // Yazı okundu: listeye dönüştür ve bizim kodlarla eşleştir (kendiliğinden)
        const imp = await importListFromText(f.name, res.text, info =>
          setRows(r => r.map(x => (x.name === f.name ? { ...x, info } : x))));
        setRows(r => r.map(x => (x.name === f.name ? {
          ...x, status: 'ok',
          info: `${imp.name}: ${imp.items.toLocaleString('tr-TR')} kalem · ${imp.matched.toLocaleString('tr-TR')} bizim koda bağlandı${imp.failedPages ? ` · ${imp.failedPages} sayfa okunamadı` : ''}${res.ocr ? ' (resimden okundu)' : ''}`,
        } : x)));
        onImported?.();
      } catch (e) {
        setRows(r => r.map(x => (x.name === f.name ? { ...x, status: 'err', info: `okunamadı${e instanceof Error ? ': ' + e.message : ''}` } : x)));
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
          <div className="font-bold text-sm text-slate-900">Fiyat listesi yükle (PDF, Excel)</div>
          <div className="text-xs text-slate-500">
            PDF ya da Excel (.xlsx, CSV) seçin; birden fazla dosya seçebilirsiniz. Excel'de başlık satırında "Ürün adı" ve "Fiyat" sütunları olmalı (isteğe bağlı: Kod, Grup, DN, Para birimi). Firma adı ve tarih dosya adından alınır, ör. "FAF Nisan 2026.xlsx". Liste bizim kodlarla kendiliğinden eşleştirilir.
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
          {busy ? `Yükleniyor ${done}/${total}` : 'Dosya Seç'}
        </button>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf,.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" multiple hidden
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
          {done} liste eklendi. Firmaların adını, tarihini ve iskontosunu listeye girip kontrol edebilirsiniz.
        </div>
      )}
    </div>
  );
};

/** Firma logosu; yoksa (ya da yüklenemezse) renkli baş harf */
const SupplierLogo: React.FC<{ list: SupplierList; size?: 'md' | 'lg' }> = ({ list, size = 'lg' }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [list.logo]);
  const box = size === 'lg' ? 'w-12 h-12 rounded-2xl text-lg' : 'w-9 h-9 rounded-xl text-sm';
  if (list.logo && !broken) {
    return (
      <span className={`${box} bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0`}>
        <img src={list.logo} alt={list.name} onError={() => setBroken(true)} className="max-w-full max-h-full object-contain p-1" />
      </span>
    );
  }
  return (
    <span className={`${box} flex items-center justify-center text-white font-black shrink-0`} style={{ background: supplierColor(list.name) }}>
      {list.name.slice(0, 1).toLocaleUpperCase('tr')}
    </span>
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
  // Bizim koda bağlama: açık olan kalem ve arama metni
  const [linking, setLinking] = useState<number | null>(null);
  const [linkText, setLinkText] = useState('');
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const linkItem = async (it: SupplierItem, code: string | null) => {
    try {
      await setSupplierOurCode(it.id, code);
      setItems(prev => prev.map(x => (x.id === it.id ? { ...x, ourCode: code, ourName: undefined } : x)));
      setLinking(null); setLinkText('');
    } catch (e) {
      setError((e as { message?: string })?.message || 'Kaydedilemedi');
    }
  };
  const reqId = useRef(0);
  // Toplu eşleşme işlemleri (grup ya da tüm liste)
  const [bulk, setBulk] = useState<{ key: string; ask?: 'clear' | 'rematch'; info?: string } | null>(null);
  const runBulk = async (kind: 'clear' | 'rematch', grp: string | null) => {
    if (!active) return;
    const key = grp ?? '*';
    setBulk({ key, info: kind === 'clear' ? 'bağlar kaldırılıyor…' : 'eşleştiriliyor…' });
    try {
      if (kind === 'clear') await clearSupplierMatches(active, grp);
      else await rematchSupplierItems(active, grp, info => setBulk({ key, info }));
      setBulk(null);
      load(0, false);
    } catch (e) {
      setBulk(null);
      setError((e as { message?: string })?.message || 'İşlem yapılamadı');
    }
  };
  const bulkActions = (grp: string | null, tone: string) => {
    const key = grp ?? '*';
    const b = bulk?.key === key ? bulk : null;
    const btn = 'px-2 py-0.5 rounded-md border text-[11px] font-bold normal-case tracking-normal bg-white/70 hover:bg-white';
    if (b?.info) return <span className="ml-auto text-[11px] font-semibold normal-case tracking-normal inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{b.info}</span>;
    if (b?.ask) return (
      <span className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal">
        <span className="text-[11px] font-semibold">{b.ask === 'clear' ? 'Bağlar kaldırılsın mı?' : 'Bağlar silinip yeniden eşleştirilsin mi?'}</span>
        <button type="button" onClick={() => runBulk(b.ask!, grp)} className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[11px] font-bold">Evet</button>
        <button type="button" onClick={() => setBulk(null)} className="px-1.5 text-[11px] font-semibold">Vazgeç</button>
      </span>
    );
    return (
      <span className="ml-auto inline-flex items-center gap-1">
        <button type="button" disabled={!!bulk} onClick={() => setBulk({ key, ask: 'clear' })} className={btn} style={{ borderColor: tone }}>Bağları kaldır</button>
        <button type="button" disabled={!!bulk} onClick={() => setBulk({ key, ask: 'rematch' })} className={btn} style={{ borderColor: tone }}>Yeniden eşleştir</button>
      </span>
    );
  };

  const reloadLists = () => fetchSupplierLists().then(setLists).catch(() => { setLists(l => l || []); setError('Fiyat listeleri yüklenemedi.'); });
  useEffect(() => { reloadLists(); }, []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const reread = async () => {
    if (!current?.sourceFile) return;
    setReading('başlıyor…');
    try {
      const r = await reimportList(current.sourceFile, setReading);
      setReading(null);
      if (r.failedPages) setError(`${r.items} kalem okundu; ${r.failedPages} sayfa okunamadı. Tekrar "Yeniden oku" deneyebilirsiniz.`);
      await reloadLists();
      setActive(r.listId);
      load(0, false);
    } catch (e) {
      setReading(null);
      setError(`Yeniden okunamadı: ${(e as { message?: string })?.message || ''}`);
    }
  };
  const [editInfo, setEditInfo] = useState<{ name: string; listDate: string; currency: SupplierList['currency'] } | null>(null);
  const saveInfo = async () => {
    if (!current || !editInfo || !editInfo.name.trim()) return;
    try {
      await updateSupplierListInfo(current.id, { ...editInfo, name: editInfo.name.trim() });
      setEditInfo(null);
      reloadLists();
      if (active) load(0, false);
    } catch { setError('Liste bilgisi kaydedilemedi.'); }
  };
  const removeList = async () => {
    if (!current) return;
    try {
      await deleteSupplierList(current.id);
      setActive(null); setConfirmDelete(false);
      reloadLists();
    } catch { setError('Liste silinemedi.'); }
  };

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

  const net = (it: SupplierItem) => it.price * (1 - (it.discount || 0) / 100);
  const ageBadge = (listDate: string) => {
    const age = ageMonths(listDate);
    if (age === null) return null;
    return age >= 6
      ? <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">{age} ay önce</span>
      : <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">Güncel</span>;
  };
  const showUploader = uploadOpen || !lists.length;

  return (
    <div className="space-y-3">
      {/* Başlık: liste sayısı ve yükleme */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
          Firmalar · {lists.length} liste
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(o => !o)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-200 bg-white text-brand-700 text-sm font-extrabold hover:bg-brand-50"
        >
          {uploadOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} Liste Yükle
        </button>
      </div>
      {/* Yükleyici kapatılsa da yükleme sürer (bileşen yerinde kalır, sadece gizlenir) */}
      <div className={showUploader ? '' : 'hidden'}><SupplierUploader onImported={reloadLists} /></div>

      {!lists.length ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">
          Henüz firma fiyat listesi eklenmedi. Listeler eklendiğinde burada her firma ayrı bir klasör olarak görünecek.
        </div>
      ) : (
        <>
          {/* Firma şeridi */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">
            {[{ id: null as string | null, name: 'Tümü', count: lists.reduce((a, l) => a + l.itemCount, 0) },
              ...lists.map(l => ({ id: l.id as string | null, name: l.name, count: l.itemCount }))].map(c => {
              const on = active === c.id;
              return (
                <button
                  key={c.id ?? 'all'}
                  onClick={() => { setActive(c.id); setOnlyUnlinked(false); setConfirmDelete(false); setEditInfo(null); }}
                  className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-extrabold whitespace-nowrap transition-colors ${on ? 'text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-brand-300'}`}
                  style={on ? { background: c.id ? supplierColor(c.name) : '#006ec6', borderColor: c.id ? supplierColor(c.name) : '#006ec6' } : undefined}
                >
                  {!on && c.id && <span className="w-2 h-2 rounded-full" style={{ background: supplierColor(c.name) }} />}
                  {c.name}
                  <span className={`text-[11px] font-bold tabular-nums ${on ? 'text-white/75' : 'text-slate-400'}`}>{c.count.toLocaleString('tr-TR')}</span>
                </button>
              );
            })}
          </div>

          {/* Seçili firmanın bilgi kartı veya firma kartları */}
          {current ? (
            <div className="bg-white rounded-2xl border border-slate-200 border-t-4 p-3.5 flex items-center gap-3.5" style={{ borderTopColor: supplierColor(current.name) }}>
              <label className="relative cursor-pointer shrink-0" title="Logoyu değiştir">
                <SupplierLogo list={current} />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-slate-300 flex items-center justify-center text-slate-500">
                  <ImagePlus className="w-3 h-3" />
                </span>
                <input type="file" accept="image/*" hidden onChange={async e => {
                  const f = e.target.files?.[0]; e.target.value = '';
                  if (!f) return;
                  try {
                    const logo = await logoFromFile(f);
                    await setSupplierLogo(current.id, logo);
                    setLists(prev => prev?.map(l => (l.id === current.id ? { ...l, logo } : l)) || prev);
                  } catch { setError('Logo kaydedilemedi.'); }
                }} />
              </label>
              <div className="min-w-0 flex-1">
                {editInfo ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input value={editInfo.name} onChange={e => setEditInfo({ ...editInfo, name: e.target.value })} placeholder="Firma adı"
                      className="w-32 px-2 py-1 border border-slate-300 rounded-lg text-sm font-bold" />
                    <input value={editInfo.listDate} onChange={e => setEditInfo({ ...editInfo, listDate: e.target.value })} placeholder="Ocak 2026"
                      className="w-24 px-2 py-1 border border-slate-300 rounded-lg text-sm" />
                    <select value={editInfo.currency} onChange={e => setEditInfo({ ...editInfo, currency: e.target.value as SupplierList['currency'] })}
                      className="px-1.5 py-1 border border-slate-300 rounded-lg text-sm">
                      <option value="TRY">TL</option><option value="EUR">EUR</option><option value="USD">USD</option>
                    </select>
                    <button type="button" onClick={saveInfo} className="px-2 py-1 rounded-lg bg-brand-600 text-white text-xs font-bold">Kaydet</button>
                    <button type="button" onClick={() => setEditInfo(null)} className="px-2 py-1 text-xs font-semibold text-slate-500">Vazgeç</button>
                  </div>
                ) : (
                  <>
                    <div className="font-black text-slate-900 leading-tight">
                      {current.name} Fiyat Listesi
                      <button type="button" onClick={() => setEditInfo({ name: current.name, listDate: current.listDate, currency: current.currency })}
                        className="ml-1.5 align-middle text-slate-400 hover:text-brand-700" title="Firma adı, tarih, para birimi">
                        <Pencil className="w-3.5 h-3.5 inline" />
                      </button>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {current.listDate || 'tarih yok'} · {CURRENCY_LABEL[current.currency]} · liste fiyatı
                    </div>
                  </>
                )}
                <label className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  İskonto %
                  <input
                    value={discountDraft}
                    onChange={e => setDiscountDraft(e.target.value)}
                    onBlur={saveDiscount}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    inputMode="decimal"
                    placeholder="0"
                    className="w-14 px-2 py-1 border border-slate-300 rounded-lg text-sm text-right font-black text-slate-900"
                  />
                </label>
              </div>
              <div className="shrink-0 self-stretch flex flex-col items-end justify-between gap-2">
                {ageBadge(current.listDate)}
                {confirmDelete ? (
                  <span className="flex items-center gap-1.5 text-xs">
                    <button type="button" onClick={removeList} className="px-2 py-1 rounded-lg bg-rose-600 text-white font-bold">Sil</button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded-lg border border-slate-200 text-slate-600 font-semibold">Vazgeç</button>
                  </span>
                ) : (
                  <span className="flex flex-col items-end gap-1">
                    <button type="button" onClick={() => exportListToExcel(current).catch(() => setError('Excel oluşturulamadı.'))}
                      className="text-xs font-semibold text-emerald-700 hover:underline">Excel olarak indir</button>
                    {current.sourceFile && (
                      <button type="button" onClick={reread} disabled={!!reading} className="text-xs font-semibold text-brand-700 hover:underline disabled:opacity-60">
                        {reading ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{reading}</span> : 'Yeniden oku'}
                      </button>
                    )}
                    <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs font-semibold text-slate-400 hover:text-rose-600">Listeyi sil</button>
                  </span>
                )}
              </div>
            </div>
          ) : !query.trim() && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {lists.map(l => (
                <button key={l.id} onClick={() => setActive(l.id)}
                  className="text-left bg-white rounded-2xl border border-slate-200 hover:border-brand-300 hover:shadow-sm p-3.5 flex flex-col gap-1.5 transition">
                  <SupplierLogo list={l} />
                  <span className="font-black text-slate-900 text-base leading-tight truncate mt-0.5">{l.name}</span>
                  <span className="text-xs text-slate-500">{l.itemCount.toLocaleString('tr-TR')} kalem · {CURRENCY_LABEL[l.currency]}</span>
                  <span className="text-xs text-slate-500">{l.listDate || 'tarih yok'}{l.discount ? ` · %${l.discount}` : ''}</span>
                  <span className="mt-0.5">{ageBadge(l.listDate)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Arama */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={current ? `${current.name} listesinde ara…` : 'Tüm listelerde ara (kod, ürün)…'}
              className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 text-sm bg-white"
            />
          </div>

          {error && <div className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</div>}

          {(active || query.trim()) && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-slate-500">
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{total.toLocaleString('tr-TR')} kalem</span>
                {items.length > 0 && (
                  <label className="ml-auto inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={onlyUnlinked} onChange={e => setOnlyUnlinked(e.target.checked)} />
                    sadece eşleşmeyenler
                  </label>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {items.length === 0 && !loading && <p className="py-8 text-center text-sm text-slate-400">Sonuç yok.</p>}
                <div className="divide-y divide-slate-100">
                  {items.filter(it => !onlyUnlinked || !it.ourCode).map((it, idx, arr) => (
                    <React.Fragment key={it.id}>
                    {it.grp && (idx === 0 || arr[idx - 1].grp !== it.grp || arr[idx - 1].listId !== it.listId) && (
                      <div className="px-3.5 py-2 border-y text-[12px] font-black uppercase tracking-wide flex items-center gap-2"
                        style={{ background: `${supplierColor(it.grp)}14`, borderColor: `${supplierColor(it.grp)}40`, color: supplierColor(it.grp) }}>
                        <span className="w-1.5 h-4 rounded-full shrink-0" style={{ background: supplierColor(it.grp) }} />
                        <span className="min-w-0 truncate">{it.grp}</span>
                        {active && bulkActions(it.grp, `${supplierColor(it.grp)}60`)}
                      </div>
                    )}
                    <div className="px-3.5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-slate-900 leading-snug break-words">
                            {!active && (
                              <span className="text-[10px] font-black text-white rounded px-1.5 py-0.5 mr-1.5 align-[1px]" style={{ background: supplierColor(it.listName) }}>
                                {it.listName.toLocaleUpperCase('tr')}
                              </span>
                            )}
                            {it.name}
                          </div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            {it.code ? `${it.listName} kodu: ${it.code}` : `${it.listName} · kodsuz`}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            Bizim kod:
                            {it.ourCode ? (
                              <>
                                <button type="button" onClick={() => { setLinking(it.id); setLinkText(''); }} title="Değiştir"
                                  className="font-mono px-2 py-0.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:border-brand-300">
                                  {it.ourCode}
                                </button>
                                <button type="button" onClick={() => linkItem(it, null)} className="text-slate-300 hover:text-rose-600" title="Bağı kaldır"><X className="w-3.5 h-3.5" /></button>
                                {it.ourName && <span className="basis-full text-[11px] text-slate-400 leading-snug">{it.ourName}</span>}
                              </>
                            ) : (
                              <button type="button" onClick={() => { setLinking(it.id); setLinkText(''); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 font-semibold hover:border-amber-400">
                                eşleşmedi <Link2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-base font-black text-slate-900 tabular-nums whitespace-nowrap">
                            {it.price > 0 ? `${formatPrice(it.price)} ${CURRENCY_LABEL[it.currency]}` : <span className="text-sm text-slate-400 font-semibold">fiyat yok</span>}
                          </div>
                          {it.price > 0 && it.discount > 0 && (
                            <div className="text-xs font-bold text-slate-400 tabular-nums whitespace-nowrap">net {formatPrice(net(it))}</div>
                          )}
                        </div>
                      </div>
                      {linking === it.id && (
                        <div className="mt-2 flex items-center gap-2">
                          <MaterialPicker
                            field="all"
                            ownOnly
                            autoFocus
                            value={linkText}
                            onChange={setLinkText}
                            onPick={m => linkItem(it, m.code)}
                            placeholder="Bizim malzemelerde ara (kod veya ad)…"
                            className="flex-1 min-w-0"
                            inputClassName="w-full px-3 py-2 border border-brand-300 rounded-xl text-sm bg-white"
                          />
                          <button type="button" onClick={() => setLinking(null)} className="text-xs font-semibold text-slate-500 px-2 py-2">Vazgeç</button>
                        </div>
                      )}
                    </div>
                    </React.Fragment>
                  ))}
                </div>
                {items.length < total && (
                  <button onClick={() => load(items.length, true)} disabled={loading}
                    className="w-full py-3 text-sm font-bold text-brand-700 hover:bg-brand-50 border-t border-slate-100 disabled:opacity-50">
                    Daha fazla göster ({(total - items.length).toLocaleString('tr-TR')} kalem kaldı)
                  </button>
                )}
              </div>
              {active && (
                <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500">
                  <span className="font-semibold">Tüm liste:</span>
                  {bulkActions(null, '#cbd5e1')}
                </div>
              )}
              <p className="px-1 text-xs text-slate-400">Firma kodları bizim kodlarla karışmaz; aynı ürünse "Bizim kod" bağlantısı gösterilir. Elle bağladığınız ya da kaldırdığınız kalemlere otomatik eşleştirme dokunmaz; liste yeniden yüklense de korunur.</p>
            </>
          )}
        </>
      )}
    </div>
  );
};
