import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileUp, ImagePlus, Link2, Loader2, Plus, Search, X, XCircle } from 'lucide-react';
import { MaterialPicker } from './MaterialPicker';
import { CURRENCY_LABEL } from '../lib/money';
import { formatPrice } from '../lib/materials';
import { SupplierItem, SupplierList, fetchSupplierLists, searchSupplierItems, logoFromFile, setSupplierDiscount, setSupplierLogo, setSupplierOurCode, supplierColor, uploadSupplierPdf, uploadedSupplierFiles } from '../lib/suppliers';

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
      setItems(prev => prev.map(x => (x.id === it.id ? { ...x, ourCode: code } : x)));
      setLinking(null); setLinkText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    }
  };
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
      <div className={showUploader ? '' : 'hidden'}><SupplierUploader /></div>

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
                  onClick={() => { setActive(c.id); setOnlyUnlinked(false); }}
                  className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-extrabold whitespace-nowrap transition-colors ${on ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-brand-300'}`}
                >
                  {c.name}
                  <span className={`text-[11px] font-bold tabular-nums ${on ? 'text-brand-100' : 'text-slate-400'}`}>{c.count.toLocaleString('tr-TR')}</span>
                </button>
              );
            })}
          </div>

          {/* Seçili firmanın bilgi kartı veya firma kartları */}
          {current ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex items-center gap-3.5">
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
                <div className="font-black text-slate-900 leading-tight">{current.name} Fiyat Listesi</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {current.listDate || 'tarih yok'} · {CURRENCY_LABEL[current.currency]} · liste fiyatı
                </div>
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
              <div className="shrink-0 self-start">{ageBadge(current.listDate)}</div>
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
                  {items.filter(it => !onlyUnlinked || !it.ourCode).map(it => (
                    <div key={it.id} className="px-3.5 py-3">
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
                  ))}
                </div>
                {items.length < total && (
                  <button onClick={() => load(items.length, true)} disabled={loading}
                    className="w-full py-3 text-sm font-bold text-brand-700 hover:bg-brand-50 border-t border-slate-100 disabled:opacity-50">
                    Daha fazla göster ({(total - items.length).toLocaleString('tr-TR')} kalem kaldı)
                  </button>
                )}
              </div>
              <p className="px-1 text-xs text-slate-400">Firma kodları bizim kodlarla karışmaz; aynı ürünse "Bizim kod" bağlantısı gösterilir.</p>
            </>
          )}
        </>
      )}
    </div>
  );
};
