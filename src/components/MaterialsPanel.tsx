import { viewStatus } from '../lib/quoteRules';
import { trNum } from '../lib/num';
import React, { useEffect, useRef, useState } from 'react';
import { Eye, FileSpreadsheet, Loader2, Package, PackageSearch, Pencil, Plus, Trash2, Wallet, Warehouse, X } from 'lucide-react';
import { MaterialImport } from './MaterialImport';
import { LastImport, fetchLastImport } from '../lib/materialImport';
import { listCard, ctrl, theadCls, SearchBox, IconBtn, Pager, WideOnly, NarrowOnly, LastEdit } from './ListUI';
import { CURRENCY_LABEL, Currency } from '../lib/money';
import { parseDecimal } from './DecimalInput';
import { Material, MATERIAL_UNITS, MaterialFilters, MaterialSortKey, deleteMaterial, formatPrice, listMaterials, saveMaterial } from '../lib/materials';
import { MobileSortSelect, SortHeader, SortState, nextSort } from './SortHeader';
import { SupplierListsPanel } from './SupplierListsPanel';
import { supabase } from '../lib/supabase';
import { fetchSupplierLists } from '../lib/suppliers';
import { allowed, can, useAccess } from '../lib/access';
import { Quote } from '../types';
import { STATUS_LABEL } from '../lib/constants';
import { dayOf } from '../lib/dates';
import { PageHeader, SECTION_SUB } from './Sections';

const PAGE = 25;
const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR'];
const EMPTY: Material = { code: '', name: '', price: 0, currency: 'TRY', unit: 'Adet', vatRate: 20, stock: null };

const selectCls = `${ctrl} w-full text-xs !border-[#E2EAF3] !text-[#17365D]`;
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('tr-TR') : '-');
const fmtStock = (v?: number | null) => (v == null ? '-' : v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }));

/** Stok: eksi → koyu lacivert + "Eksi" etiketi, 0/boş → gri + "Yok"; kırmızı kullanılmaz */
const StockCell: React.FC<{ v?: number | null; right?: boolean }> = ({ v, right }) => {
  const n = v ?? 0;
  const tag = n < 0 ? <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-[#E6F1FB] text-[#006DBB] border border-[#C7DFF5]">Eksi</span>
    : n === 0 ? <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-[#F1F6FC] text-[#5E7491] border border-[#E2EAF3]">Yok</span>
      : null;
  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums ${right ? 'flex-row-reverse' : ''}`}>
      <span className={n < 0 ? 'font-extrabold text-[#173F73]' : n === 0 ? 'text-[#5E7491]' : 'font-semibold text-[#17365D]'}>{fmtStock(v)}</span>
      {tag}
    </span>
  );
};

const CurBadge: React.FC<{ c: Currency }> = ({ c }) => (
  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-[#F1F6FC] text-[#204D84] border border-[#E2EAF3]">{CURRENCY_LABEL[c]}</span>
);

const OwnMaterials: React.FC<{
  quotes: Quote[]; onOpenQuote?: (q: Quote) => void; newRequest?: number; importRequest?: number;
  onChanged?: () => void;
  actions?: React.ReactNode;
  /** istek karşılandı (sayaç sıfırlanır; sekme değişip geri gelince form yeniden açılmaz) */
  onConsumed?: (k: 'new' | 'import') => void;
}> = ({ quotes, onOpenQuote, newRequest, importRequest, onChanged, onConsumed, actions }) => {
  const [page, setPage] = useState(0);
  useEffect(() => { if (newRequest) { setEditing({ m: { ...EMPTY } }); onConsumed?.('new'); } }, [newRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState('');
  const [codeQuery, setCodeQuery] = useState('');
  const [filters, setFilters] = useState<MaterialFilters>({ currency: '', unit: '', price: '', stock: '' });
  const [sort, setSort] = useState<SortState<MaterialSortKey>>({ key: 'default', dir: 'asc' });
  const setFilter = <K extends keyof MaterialFilters>(k: K, v: MaterialFilters[K]) => setFilters(prev => ({ ...prev, [k]: v }));
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const [items, setItems] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Material | null>(null);
  const [reload, setReload] = useState(0);
  const changed = () => { setReload(n => n + 1); onChanged?.(); };
  const [editing, setEditing] = useState<{ m: Material; originalCode?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const reqId = useRef(0);
  // Mikro'dan Excel ile toplu güncelleme (düğme başlıkta: "Excel'den Malzeme Aktar")
  const [importing, setImporting] = useState(false);
  useEffect(() => { if (importRequest) { setImporting(true); onConsumed?.('import'); } }, [importRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const [lastImport, setLastImport] = useState<LastImport | null>(null);
  useEffect(() => { fetchLastImport().then(setLastImport, () => undefined); }, [reload]);

  const load = async (offset: number, append: boolean) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      // Kod kutusu doluysa sadece kodda; değilse (kategori kelimesi + arama) adda ve kodda aranır
      const byCode = codeQuery.trim() !== '';
      const q = byCode ? codeQuery.trim() : query.trim();
      const r = await listMaterials(q, {
        limit: PAGE, offset, field: byCode ? 'code' : 'all', filters, sortKey: sort.key, sortDir: sort.dir,
      });
      if (id !== reqId.current) return;
      setItems(prev => (append ? [...prev, ...r.items] : r.items));
      setTotal(r.total);
      setError('');
    } catch {
      if (id !== reqId.current) return;
      setError('Malzeme listesi yüklenemedi. İnternet bağlantısını kontrol edin.');
      if (!append) { setItems([]); setTotal(0); }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => load(page * PAGE, false), page ? 0 : 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, codeQuery, filters, sort, reload, page]);
  // Arama / filtre değişince ilk sayfaya dön
  useEffect(() => setPage(0), [query, codeQuery, filters, sort]);

  const handleDelete = async (code: string) => {
    try {
      await deleteMaterial(code);
      setConfirmDelete(null);
      changed();
    } catch {
      setError('Silinemedi. İnternet bağlantısını kontrol edin.');
    }
  };

  const priceNum = (m: Material) => (m.price > 0 ? formatPrice(m.price) : '—');

  const rowActions = (m: Material) => confirmDelete === m.code ? (
    <span className="inline-flex items-center gap-1">
      <button onClick={() => handleDelete(m.code)} className="px-2 py-1 rounded-md bg-[#173F73] text-white text-[11px] font-bold">Sil</button>
      <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold">Vazgeç</button>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1">
      <IconBtn title="Görüntüle (satış geçmişi)" onClick={() => setHistory(m)}><Eye className="w-4 h-4" /></IconBtn>
      <IconBtn title="Düzenle" onClick={() => setEditing({ m, originalCode: m.code })}><Pencil className="w-4 h-4" /></IconBtn>
      <IconBtn danger title="Sil" onClick={() => setConfirmDelete(m.code)}><Trash2 className="w-4 h-4" /></IconBtn>
    </span>
  );

  const anything = activeFilters > 0 || query || codeQuery || sort.key !== 'default';

  return (
    <div className="space-y-4">
    <div className={`${listCard} !rounded-2xl !border-[#E2EAF3]`}>
      <div className="p-3 sm:p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center gap-2">
          <div className="grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] gap-2 min-w-0 flex-1">
          <SearchBox mono value={codeQuery} onChange={v => { setCodeQuery(v); if (v) setQuery(''); }} placeholder="Kod ara" className="[&_input]:h-9 [&_input]:!text-sm [&_input]:!border-[#E2EAF3]" />
          <SearchBox value={query} onChange={v => { setQuery(v); if (v) setCodeQuery(''); }} placeholder="Malzeme adı ara" className="[&_input]:h-9 [&_input]:!text-sm [&_input]:!border-[#E2EAF3]" />
          </div>
          {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={filters.unit} onChange={e => setFilter('unit', e.target.value)} className={selectCls} aria-label="Birim">
            <option value="">Birim: Tümü</option>
            {MATERIAL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <MobileSortSelect<MaterialSortKey>
            always
            sort={sort}
            onChange={setSort}
            className={selectCls}
            options={[
              { key: 'default', dir: 'asc', label: 'Sıra: Önerilen' },
              { key: 'name', dir: 'asc', label: 'Ad (A → Z)' },
              { key: 'name', dir: 'desc', label: 'Ad (Z → A)' },
              { key: 'code', dir: 'asc', label: 'Kod (A → Z)' },
              { key: 'price', dir: 'desc', label: 'Fiyat (yüksek → düşük)' },
              { key: 'price', dir: 'asc', label: 'Fiyat (düşük → yüksek)' },
              { key: 'stock', dir: 'desc', label: 'Stok (çok → az)' },
              { key: 'stock', dir: 'asc', label: 'Stok (az → çok)' },
              { key: 'updated', dir: 'desc', label: 'Son güncellenen' },
            ]}
          />
        </div>
        <div className="text-xs text-[#5E7491] flex items-center gap-x-2 gap-y-1 flex-wrap">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span><b className="text-[#17365D]">{total.toLocaleString('tr-TR')}</b> malzeme{query.trim() || codeQuery.trim() || activeFilters ? ' bulundu' : ''}</span>
          {anything && (
            <button
              onClick={() => { setFilters({ currency: '', unit: '', price: '', stock: '' }); setQuery(''); setCodeQuery(''); setSort({ key: 'default', dir: 'asc' }); }}
              className="text-[#006DBB] font-bold hover:underline"
            >
              Filtreleri temizle
            </button>
          )}
          {lastImport && (
            <span className="sm:ml-auto">
              Son toplu güncelleme: <b className="text-[#17365D]">{new Date(lastImport.at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</b>
              {lastImport.byName && <> · {lastImport.byName}</>} · {lastImport.updated.toLocaleString('tr-TR')} değişti, {lastImport.inserted.toLocaleString('tr-TR')} yeni
            </span>
          )}
        </div>
        {error && <div className="text-xs text-[#173F73] bg-[#E6F1FB] border border-[#C7DFF5] rounded-lg px-3 py-2">{error}</div>}
      </div>
    </div>

    <div className={`${listCard} !rounded-2xl !border-[#E2EAF3] overflow-hidden`}>

      {/* Telefon / dar tablet: kartlar */}
      <NarrowOnly from="lg"><div className="lg:hidden divide-y divide-[#E2EAF3]">
        {items.map(m => (
          <div key={m.code} className="p-3 flex items-start gap-3">
            <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setHistory(m)}>
              <div className="text-[11px] font-extrabold text-[#173F73] tabular-nums">{m.code}</div>
              <div className="text-sm font-semibold text-[#17365D] leading-snug uppercase">{m.name || '-'}</div>
              <div className="text-[11px] text-[#5E7491] mt-1 flex items-center gap-1.5 flex-wrap">
                <span>{m.unit}</span><span>·</span><span>KDV %{m.vatRate}</span>
              </div>
            </div>
            <div className="text-right shrink-0 space-y-1.5">
              <div className={`text-sm font-black tabular-nums ${m.price > 0 ? 'text-[#17365D]' : 'text-[#5E7491]'}`}>
                {priceNum(m)} {m.price > 0 && <span className="text-[11px] font-bold text-[#204D84]">{CURRENCY_LABEL[m.currency]}</span>}
              </div>
              {rowActions(m)}
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && <EmptyState />}
      </div></NarrowOnly>

      {/* Geniş ekran: envanter tablosu */}
      <WideOnly from="lg"><div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={`${theadCls} text-left`}>
            <tr className="[&>th]:text-[12px] [&>th]:font-bold [&>th]:text-[#17365D]">
              <SortHeader className="pl-5" label="Kod" active={sort.key === 'code'} dir={sort.dir} onClick={() => setSort(s => nextSort(s, 'code', 'asc'))} />
              <SortHeader label="Malzeme Adı" active={sort.key === 'name'} dir={sort.dir} onClick={() => setSort(s => nextSort(s, 'name', 'asc'))} />
              <th className="py-3 px-3">Birim</th>
              <SortHeader label="Birim Fiyat" align="right" active={sort.key === 'price'} dir={sort.dir} onClick={() => setSort(s => nextSort(s, 'price', 'desc'))} />
              <th className="hidden xl:table-cell py-3 px-3">Para Birimi</th>
              <th className="hidden xl:table-cell py-3 px-3">KDV</th>
              <SortHeader className="hidden xl:table-cell" label="Güncelleme" active={sort.key === 'updated'} dir={sort.dir} onClick={() => setSort(s => nextSort(s, 'updated', 'desc'))} />
              <th className="py-3 px-3 pr-5 text-center">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2EAF3]">
            {items.map(m => (
              <tr key={m.code} className="hover:bg-[#F1F8FE] transition-colors">
                <td className="py-3 px-3 pl-5 text-xs font-extrabold text-[#173F73] whitespace-nowrap">{m.code}</td>
                <td className="py-3 px-3 text-[#17365D] font-semibold uppercase text-[13px]">
                  <button type="button" onClick={() => setHistory(m)} className="text-left hover:text-[#006DBB]">{m.name || '-'}</button>
                </td>
                <td className="py-3 px-3 text-[#5E7491]">{m.unit}</td>
                <td className={`py-3 px-3 text-right font-black tabular-nums whitespace-nowrap ${m.price > 0 ? 'text-[#17365D]' : 'text-[#5E7491]'}`}>
                  {priceNum(m)}<span className="xl:hidden">{m.price > 0 && <span className="ml-1 text-[11px] font-bold text-[#204D84]">{CURRENCY_LABEL[m.currency]}</span>}</span>
                </td>
                <td className="hidden xl:table-cell py-3 px-3"><CurBadge c={m.currency} /></td>
                <td className="hidden xl:table-cell py-3 px-3 text-[#5E7491] tabular-nums">%{m.vatRate}</td>
                <td className="hidden xl:table-cell py-3 px-3 text-[#5E7491] text-xs whitespace-nowrap">{fmtDate(m.updatedAt)}</td>
                <td className="py-3 px-3 pr-5 text-center whitespace-nowrap">{rowActions(m)}</td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8}><EmptyState /></td></tr>
            )}
          </tbody>
        </table>
      </div></WideOnly>

      <Pager page={page} total={total} size={PAGE} onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        label={<>Toplam {total.toLocaleString('tr-TR')} kayıt</>} />
    </div>

      {history && <MaterialHistory m={history} quotes={quotes} onClose={() => setHistory(null)}
        onOpenQuote={onOpenQuote ? q => { setHistory(null); onOpenQuote(q); } : undefined} />}
      {importing && <MaterialImport onClose={() => setImporting(false)} onDone={changed} />}
      {editing && (
        <MaterialForm
          initial={editing.m}
          originalCode={editing.originalCode}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); changed(); }}
        />
      )}
    </div>
  );
};

const EmptyState: React.FC = () => (
  <div className="py-10 flex flex-col items-center gap-2 text-center">
    <span className="w-12 h-12 rounded-2xl bg-[#F1F6FC] text-[#006DBB] flex items-center justify-center"><PackageSearch className="w-6 h-6" /></span>
    <div className="text-sm font-bold text-[#17365D]">Malzeme bulunamadı</div>
    <div className="text-xs text-[#5E7491]">Aramayı kısaltın ya da filtreleri temizleyin.</div>
  </div>
);

const money = (v: number, c: string) => `${trNum(v, { maximumFractionDigits: 2 })} ${CURRENCY_LABEL[c as Currency] || c}`;

/** Malzemeye tıklayınca: bu malzemeyi kime, ne zaman, kaç adet, kaçtan teklif ettik / sattık (yeni → eski) */
const MaterialHistory: React.FC<{ m: Material; quotes: Quote[]; onClose: () => void; onOpenQuote?: (q: Quote) => void }> = ({ m, quotes, onClose, onOpenQuote }) => {
  const code = m.code.trim().toUpperCase();
  const name = m.name.trim().toLocaleLowerCase('tr');
  const rows = quotes.flatMap(q => (q.items || [])
    .filter(it => ((it.code || '').trim().toUpperCase() === code) || (!it.code && it.productName.trim().toLocaleLowerCase('tr') === name))
    .map(it => ({ q, it, cur: it.currency || q.currency || 'TRY' })))
    .sort((a, b) => (b.q.createdAt || '').localeCompare(a.q.createdAt || ''));
  const sold = rows.filter(r => r.q.status === 'onaylandi');
  const sum = (list: typeof rows) => list.reduce((t, r) => t + (r.it.quantity || 0), 0);
  const firms = new Set(sold.map(r => r.q.customerName.trim().toLocaleLowerCase('tr'))).size;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 bg-gradient-to-br from-[#173F73] to-[#204D84] text-white flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="tabular-nums text-[11px] text-sky-200/80">{m.code}</div>
            <h3 className="font-black text-lg tracking-tight leading-snug">{m.name}</h3>
            <div className="text-xs text-sky-100/90 mt-1">
              Satılan <b className="text-[#5FE0C8]">{sum(sold).toLocaleString('tr-TR')} {m.unit.toLocaleLowerCase('tr')}</b> ({sold.length} teklif, {firms} firma)
              {' · '}teklif edilen <b className="text-white">{sum(rows).toLocaleString('tr-TR')}</b> ({rows.length} teklif)
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white shrink-0" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto divide-y divide-slate-100">
          {rows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Bu malzeme henüz hiçbir teklifte yok.</p>}
          {rows.map(({ q, it, cur }, i) => {
            const net = (it.unitPrice || 0) * (1 - (it.discount || 0) / 100);
            const st = STATUS_LABEL[viewStatus(q)];
            return (
              <button key={`${q.id}-${i}`} type="button" disabled={!onOpenQuote} onClick={() => onOpenQuote?.(q)}
                className="w-full text-left px-4 py-2.5 flex items-start gap-3 hover:bg-slate-50 disabled:hover:bg-transparent">
                <div className="min-w-0 flex-1 text-xs">
                  <div><b className="text-slate-800 text-sm">{q.customerName}</b> <span className={`ml-1 px-1.5 py-0.5 rounded text-[11px] font-bold ${st?.cls || ''}`}>{st?.label || q.status}</span></div>
                  <div className="text-slate-500 mt-0.5">{dayOf(q.createdAt).split('-').reverse().join('.')} · {q.quoteNumber}</div>
                </div>
                <div className="text-right text-xs shrink-0 tabular-nums">
                  <div className="font-black text-slate-900 text-sm">{(it.quantity || 0).toLocaleString('tr-TR')} {it.unit.toLocaleLowerCase('tr')}</div>
                  <div className="text-slate-600">{money(net, cur)}{it.discount ? <span className="text-slate-500"> · liste {money(it.unitPrice, cur)} %{it.discount}</span> : null}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};


/** Form bölüm başlığı: küçük simge + ad */
const Group: React.FC<{ icon: React.ElementType; title: string; note?: string; children: React.ReactNode }> = ({ icon: I, title, note, children }) => (
  <fieldset className="rounded-xl border border-[#E2EAF3] bg-white p-3 sm:p-3.5">
    <legend className="px-1.5 -ml-1.5 flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-[#204D84]">
      <I className="w-4 h-4 text-[#006DBB]" /> {title}{note && <span className="normal-case tracking-normal font-semibold text-[#5E7491]">· {note}</span>}
    </legend>
    {children}
  </fieldset>
);

const MaterialForm: React.FC<{
  initial: Material;
  originalCode?: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ initial, originalCode, onClose, onSaved }) => {
  const [m, setM] = useState<Material>(initial);
  const [priceText, setPriceText] = useState(initial.price ? String(initial.price).replace('.', ',') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Material>(k: K, v: Material[K]) => setM(prev => ({ ...prev, [k]: v }));
  // Son değiştiren (tek satır sorgu; liste sorgusu değişmez)
  const [last, setLast] = useState<{ by: string | null; at: string | null } | null>(null);
  useEffect(() => {
    if (!originalCode) return;
    supabase.from('materials').select('updated_by, updated_at').eq('code', originalCode).maybeSingle()
      .then(({ data }) => data && setLast({ by: data.updated_by, at: data.updated_at }), () => undefined);
  }, [originalCode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!m.code.trim() || !m.name.trim()) { setError('Kod ve malzeme adı zorunlu.'); return; }
    const price = parseDecimal(priceText);
    setSaving(true);
    try {
      await saveMaterial({ ...m, price }, originalCode);
      onSaved();
    } catch (err: any) {
      setError(err?.code === '23505' ? 'Bu kodla başka bir malzeme var.' : 'Kaydedilemedi. İnternet bağlantısını kontrol edin.');
      setSaving(false);
    }
  };

  const input = 'w-full h-10 px-3 border border-[#E2EAF3] rounded-lg text-sm text-[#17365D] bg-white focus:outline-none focus:ring-2 focus:ring-[#006DBB]/20 focus:border-[#7DB6E3]';
  const label = 'block text-xs font-bold text-[#17365D] mb-1';
  return (
    <div className="fixed inset-0 z-50 bg-[#0B2343]/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="bg-[#F7FAFD] w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 relative flex items-center gap-3 px-4 sm:px-5 py-3.5 bg-gradient-to-r from-white to-[#EAF5FC] border-b border-[#E2EAF3]">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#006DBB] to-[#173F73] text-white flex items-center justify-center shrink-0 shadow-[0_8px_18px_-10px_rgba(0,109,187,0.9)]"><Package className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-lg tracking-tight text-[#173F73] leading-tight">{originalCode ? 'Malzemeyi Düzenle' : 'Yeni Malzeme'}</h3>
            <p className="text-xs text-[#5E7491] truncate">{originalCode ? <span className="tabular-nums">{originalCode}</span> : 'Kod ve ad zorunlu; diğer alanlar sonradan da girilebilir.'}</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-[#E2EAF3] text-[#204D84] hover:bg-[#F1F6FC] shrink-0" aria-label="Kapat"><X className="w-5 h-5" /></button>
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[#006DBB] to-[#00B49A]" />
        </div>
        <div className="p-4 sm:p-5 space-y-3.5">
          {last?.by && <LastEdit by={last.by} at={last.at} />}
          <Group icon={Package} title="Malzeme Bilgileri">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={label}>Malzeme Kodu *</label>
                <input value={m.code} onChange={e => set('code', e.target.value)} className={`${input} tabular-nums`} required />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Malzeme Adı *</label>
                <input value={m.name} onChange={e => set('name', e.target.value)} className={input} required />
              </div>
            </div>
          </Group>
          <Group icon={Wallet} title="Fiyat Bilgileri">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={label}>Birim Fiyat</label>
                <input inputMode="decimal" value={priceText} onChange={e => setPriceText(e.target.value)} placeholder="0,00" className={`${input} tabular-nums text-right font-bold`} />
              </div>
              <div>
                <label className={label}>Para Birimi</label>
                <select value={m.currency} onChange={e => set('currency', e.target.value as Currency)} className={input}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>KDV %</label>
                <input type="number" min="0" max="100" value={m.vatRate} onChange={e => set('vatRate', parseFloat(e.target.value) || 0)} className={input} />
              </div>
            </div>
          </Group>
          <Group icon={Warehouse} title="Stok Bilgileri" note="stok Mikro'dan gelir">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Birim</label>
                <select value={m.unit} onChange={e => set('unit', e.target.value)} className={input}>
                  {MATERIAL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Stok Miktarı</label>
                <div className="h-10 px-3 rounded-lg border border-dashed border-[#E2EAF3] bg-[#F1F6FC] flex items-center"><StockCell v={m.stock} /></div>
              </div>
            </div>
          </Group>
          {error && <div className="text-xs text-[#173F73] bg-[#E6F1FB] border border-[#C7DFF5] rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="sticky bottom-0 flex gap-2 px-4 sm:px-5 py-3 border-t border-[#E2EAF3] bg-white">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl bg-white border border-[#E2EAF3] text-[#17365D] text-sm font-bold hover:bg-[#F1F6FC]">Vazgeç</button>
          <button type="submit" disabled={saving} className="flex-1 h-11 rounded-xl bg-[#006DBB] hover:bg-[#173F73] text-white text-sm font-bold disabled:opacity-60 shadow-[0_10px_22px_-12px_rgba(0,109,187,0.9)]">
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
};

/** Sekmedeki kalem sayısı (tek `count head` isteği, satır inmez); 10 dakika bellekte, kayıt/aktarımdan sonra yenilenir */
type Counts = { total: number };
let countCache: { at: number; v: Counts } | null = null;
async function fetchCounts(force = false): Promise<Counts> {
  if (!force && countCache && Date.now() - countCache.at < 10 * 60_000) return countCache.v;
  const { count, error } = await supabase.from('materials').select('code', { count: 'exact', head: true });
  if (error) throw error;
  const v = { total: count ?? 0 };
  countCache = { at: Date.now(), v };
  return v;
}

/** Malzemeler: başlık bandı + özet kutuları; altta bizim kataloğumuz ve firma fiyat listeleri ayrı sekmelerde */
export const MaterialsPanel: React.FC<{
  quotes?: Quote[]; onOpenQuote?: (q: Quote) => void; newRequest?: number;
  /** Başlık (uygulamada verilir; deneme sayfasında yoksa geri düğmesi boş) */
  onBack?: () => void; canAdd?: boolean;
}> = ({ quotes = [], onOpenQuote, newRequest, onBack, canAdd }) => {
  const me = useAccess();
  const showOwn = can(me, 'materials'), showSup = can(me, 'suppliers');
  const canImport = can(me, 'materials', 'edit') || allowed(me, 'matImport');
  const [tab, setTab] = useState<'own' | 'suppliers'>(() => {
    if (!showOwn) return 'suppliers';
    if (!showSup) return 'own';
    try { return localStorage.getItem('enyap-materials-tab') === 'suppliers' ? 'suppliers' : 'own'; } catch { return 'own'; }
  });
  const choose = (t: 'own' | 'suppliers') => { setTab(t); try { localStorage.setItem('enyap-materials-tab', t); } catch { /* */ } };
  // Başlıktaki düğmeler: yeni malzeme / Excel'den aktar (dışarıdan gelen istek de yeni malzeme açar)
  const [newLocal, setNewLocal] = useState(0);
  const [importReq, setImportReq] = useState(0);
  useEffect(() => { if (newRequest && showOwn) { setTab('own'); setNewLocal(n => n + 1); } }, [newRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const [counts, setCounts] = useState<Counts | null>(countCache?.v ?? null);
  const loadCounts = (force = false) => fetchCounts(force).then(setCounts, () => undefined);
  useEffect(() => { if (showOwn) loadCounts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [supInfo, setSupInfo] = useState<{ lists: number; items: number } | null>(null);
  useEffect(() => {
    if (showSup) fetchSupplierLists().then(l => setSupInfo({ lists: l.length, items: l.reduce((a, x) => a + x.itemCount, 0) }), () => undefined);
  }, [showSup]);

  const tr = (n?: number | null) => (n == null ? '–' : n.toLocaleString('tr-TR'));


  const tabCls = (on: boolean) =>
    `relative flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 sm:px-4 py-3 text-center transition-colors ${on ? 'bg-white text-[#006DBB] shadow-sm' : 'text-[#5E7491] hover:text-[#17365D]'}`;
  const bar = <span className="absolute left-5 right-5 bottom-0 h-[3px] rounded-full bg-[#006DBB]" />;
  return (
    <div>
      <PageHeader
        title="Malzemeler"
        subtitle={SECTION_SUB.materials}
        icon={Package}
        onBack={onBack || (() => undefined)}
        hero={{ lg: '/hero-malzeme-sabit.png', sm: '/hero-malzeme-sabit.png', materials: true }}
      />
      <div className="space-y-4">
        {showOwn && showSup && <div className="flex gap-1 rounded-2xl border border-[#E2EAF3] bg-[#E7F3FC] p-1.5" role="tablist">
          <button role="tab" aria-selected={tab === 'own'} onClick={() => choose('own')} className={tabCls(tab === 'own')}>
            <span className="text-sm sm:text-base font-extrabold">Bizim Malzemelerimiz</span>
            <span className="text-xs sm:text-sm font-semibold text-[#5E7491]">{counts ? `${tr(counts.total)} malzeme` : '– malzeme'}</span>
            {tab === 'own' && bar}
          </button>
          <button role="tab" aria-selected={tab === 'suppliers'} onClick={() => choose('suppliers')} className={tabCls(tab === 'suppliers')}>
            <span className="text-sm sm:text-base font-extrabold">Firma Fiyat Listeleri</span>
            <span className="text-xs sm:text-sm font-semibold text-[#5E7491]">{supInfo ? `${supInfo.lists} firma · ${tr(supInfo.items)} kalem` : '– firma · – kalem'}</span>
            {tab === 'suppliers' && bar}
          </button>
        </div>}
        {tab === 'own'
          ? <OwnMaterials quotes={quotes} onOpenQuote={onOpenQuote} newRequest={newLocal} importRequest={importReq}
              actions={<>
                {canImport && <button type="button" onClick={() => setImportReq(n => n + 1)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#C9DDF1] bg-white px-3 text-xs sm:text-sm font-bold text-[#173F73] hover:bg-[#F1F6FC]"><FileSpreadsheet className="h-4 w-4 text-[#008F79]" />Excel'den Malzeme Aktar</button>}
                {canAdd && <button type="button" onClick={() => setNewLocal(n => n + 1)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#006DBB] px-3 text-xs sm:text-sm font-bold text-white hover:bg-[#173F73]"><Plus className="h-4 w-4" />Yeni Malzeme</button>}
              </>}
              onChanged={() => loadCounts(true)}
              onConsumed={k => (k === 'new' ? setNewLocal(0) : setImportReq(0))} />
          : <SupplierListsPanel />}
      </div>
    </div>
  );
};
