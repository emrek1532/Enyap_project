import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { CURRENCY_LABEL, Currency } from '../lib/money';
import { parseDecimal } from './DecimalInput';
import { Material, MATERIAL_UNITS, MaterialFilters, MaterialSortKey, deleteMaterial, formatPrice, listMaterials, saveMaterial } from '../lib/materials';
import { MobileSortSelect, SortHeader, SortState, nextSort } from './SortHeader';
import { SupplierListsPanel } from './SupplierListsPanel';
import { supabase } from '../lib/supabase';
import { fetchSupplierLists } from '../lib/suppliers';
import { can, useAccess } from '../lib/access';

const PAGE = 50;
const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR'];
const EMPTY: Material = { code: '', name: '', price: 0, currency: 'TRY', unit: 'Adet', vatRate: 20, stock: null };

const selectCls = 'w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-medium bg-white text-slate-700';
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('tr-TR') : '-');
const fmtStock = (v?: number | null) => (v == null ? '-' : v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }));

const OwnMaterials: React.FC = () => {
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
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<{ m: Material; originalCode?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = async (offset: number, append: boolean) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      // Kod kutusu doluysa sadece kodda, değilse adda ve kodda aranır
      const byCode = codeQuery.trim() !== '';
      const r = await listMaterials(byCode ? codeQuery.trim() : query.trim(), {
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
    const t = window.setTimeout(() => load(0, false), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, codeQuery, filters, sort, reload]);

  const handleDelete = async (code: string) => {
    try {
      await deleteMaterial(code);
      setConfirmDelete(null);
      setReload(n => n + 1);
    } catch {
      setError('Silinemedi. İnternet bağlantısını kontrol edin.');
    }
  };

  const priceText = (m: Material) => (m.price > 0 ? `${formatPrice(m.price)} ${CURRENCY_LABEL[m.currency]}` : '—');

  const rowActions = (m: Material) => confirmDelete === m.code ? (
    <span className="inline-flex items-center gap-1">
      <button onClick={() => handleDelete(m.code)} className="px-2 py-1 rounded-md bg-rose-600 text-white text-[11px] font-bold">Sil</button>
      <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold">Vazgeç</button>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1">
      <button onClick={() => setEditing({ m, originalCode: m.code })} className="p-1.5 rounded-md text-slate-500 hover:text-brand-600 hover:bg-brand-50" title="Düzenle">
        <Pencil className="w-4 h-4" />
      </button>
      <button onClick={() => setConfirmDelete(m.code)} className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Sil">
        <Trash2 className="w-4 h-4" />
      </button>
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="grid grid-cols-[8.5rem_1fr] sm:grid-cols-[11rem_1fr] gap-2 flex-1 min-w-0">
            <input
              type="search"
              value={codeQuery}
              onChange={e => { setCodeQuery(e.target.value); if (e.target.value) setQuery(''); }}
              placeholder="Kod ara"
              aria-label="Kod ara"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-mono uppercase placeholder:normal-case placeholder:font-sans"
            />
            <div className="relative min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={query}
                onChange={e => { setQuery(e.target.value); if (e.target.value) setCodeQuery(''); }}
                placeholder="Malzeme adı ara (Örn: kalde vana 1/2)"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing({ m: { ...EMPTY } })}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold whitespace-nowrap flex-1 sm:flex-none"
            >
              <Plus className="w-4 h-4" /> Malzeme Ekle
            </button>
          </div>
        </div>
        {/* Filtreler */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={filters.price} onChange={e => setFilter('price', e.target.value as MaterialFilters['price'])} className={selectCls} aria-label="Fiyat durumu">
            <option value="">Fiyat: Tümü</option>
            <option value="priced">Fiyatlı</option>
            <option value="unpriced">Fiyatsız</option>
          </select>
          <select value={filters.currency} onChange={e => setFilter('currency', e.target.value as MaterialFilters['currency'])} className={selectCls} aria-label="Para birimi">
            <option value="">Para Birimi: Tümü</option>
            {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
          </select>
          <select value={filters.stock} onChange={e => setFilter('stock', e.target.value as MaterialFilters['stock'])} className={selectCls} aria-label="Stok durumu">
            <option value="">Stok: Tümü</option>
            <option value="in">Stokta var</option>
            <option value="zero">Stok yok (0)</option>
            <option value="negative">Eksi stok</option>
          </select>
          <select value={filters.unit} onChange={e => setFilter('unit', e.target.value)} className={selectCls} aria-label="Birim">
            <option value="">Birim: Tümü</option>
            {MATERIAL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{total.toLocaleString('tr-TR')} malzeme{query.trim() || codeQuery.trim() || activeFilters ? ' bulundu' : ''}</span>
          {(activeFilters > 0 || query || codeQuery || sort.key !== 'default') && (
            <button
              onClick={() => { setFilters({ currency: '', unit: '', price: '', stock: '' }); setQuery(''); setCodeQuery(''); setSort({ key: 'default', dir: 'asc' }); }}
              className="text-brand-600 font-bold hover:underline"
            >
              Filtreleri temizle
            </button>
          )}
          <MobileSortSelect<MaterialSortKey>
            sort={sort}
            onChange={setSort}
            className="ml-auto"
            options={[
              { key: 'default', dir: 'asc', label: 'Önerilen (fiyatlılar önce)' },
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
        {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</div>}
      </div>

      {/* Telefon: kartlar */}
      <div className="md:hidden bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {items.map(m => (
          <div key={m.code} className="p-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-800 leading-snug">{m.name || '-'}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                <span className="font-mono">{m.code}</span> · {m.unit} · stok {fmtStock(m.stock)}
              </div>
            </div>
            <div className="text-right shrink-0 space-y-1">
              <div className={`text-sm font-black tabular-nums ${m.price > 0 ? 'text-slate-900' : 'text-slate-400'}`}>{priceText(m)}</div>
              {rowActions(m)}
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Malzeme bulunamadı.</div>}
      </div>

      {/* Tablet / masaüstü: tablo */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] text-slate-500 font-bold text-left">
            <tr>
              <SortHeader label="Kod" active={sort.key === 'code'} dir={sort.dir} onClick={() => setSort(s => nextSort(s, 'code', 'asc'))} />
              <SortHeader label="Malzeme Adı" active={sort.key === 'name'} dir={sort.dir} onClick={() => setSort(s => nextSort(s, 'name', 'asc'))} />
              <th className="py-3 px-3">Birim</th>
              <SortHeader label="Birim Fiyat" align="right" active={sort.key === 'price'} dir={sort.dir} onClick={() => setSort(s => nextSort(s, 'price', 'desc'))} />
              <th className="py-3 px-3 text-right">KDV</th>
              <SortHeader label="Stok" align="right" active={sort.key === 'stock'} dir={sort.dir} onClick={() => setSort(s => nextSort(s, 'stock', 'desc'))} />
              <SortHeader label="Güncelleme" active={sort.key === 'updated'} dir={sort.dir} onClick={() => setSort(s => nextSort(s, 'updated', 'desc'))} />
              <th className="py-3 px-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map(m => (
              <tr key={m.code} className="hover:bg-slate-50">
                <td className="py-2.5 px-3 font-mono text-xs text-slate-600 whitespace-nowrap">{m.code}</td>
                <td className="py-2.5 px-3 text-slate-800 font-medium">{m.name || '-'}</td>
                <td className="py-2.5 px-3 text-slate-600">{m.unit}</td>
                <td className={`py-2.5 px-3 text-right font-bold tabular-nums whitespace-nowrap ${m.price > 0 ? 'text-slate-900' : 'text-slate-400'}`}>{priceText(m)}</td>
                <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">%{m.vatRate}</td>
                <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">{fmtStock(m.stock)}</td>
                <td className="py-2.5 px-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(m.updatedAt)}</td>
                <td className="py-2.5 px-3 text-right whitespace-nowrap">{rowActions(m)}</td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-slate-500">Malzeme bulunamadı.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {items.length < total && (
        <div className="text-center">
          <button
            onClick={() => load(items.length, true)}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Daha fazla göster ({items.length.toLocaleString('tr-TR')} / {total.toLocaleString('tr-TR')})
          </button>
        </div>
      )}

      {editing && (
        <MaterialForm
          initial={editing.m}
          originalCode={editing.originalCode}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setReload(n => n + 1); }}
        />
      )}
    </div>
  );
};

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

  const input = 'w-full p-2 border border-slate-200 rounded-lg text-sm';
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-black text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-teal-600" /> {originalCode ? 'Malzemeyi Düzenle' : 'Yeni Malzeme'}
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kod *</label>
              <input value={m.code} onChange={e => set('code', e.target.value)} className={`${input} font-mono`} required />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Malzeme Adı *</label>
              <input value={m.name} onChange={e => set('name', e.target.value)} className={input} required />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">Birim Fiyat</label>
              <input inputMode="decimal" value={priceText} onChange={e => setPriceText(e.target.value)} placeholder="0,00" className={`${input} tabular-nums`} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Para Birimi</label>
              <select value={m.currency} onChange={e => set('currency', e.target.value as Currency)} className={input}>
                {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Birim</label>
              <select value={m.unit} onChange={e => set('unit', e.target.value)} className={input}>
                {MATERIAL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">KDV %</label>
              <input type="number" min="0" max="100" value={m.vatRate} onChange={e => set('vatRate', parseFloat(e.target.value) || 0)} className={input} />
            </div>
          </div>
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold">Vazgeç</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-60">
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
};

/** Malzemeler: bizim kataloğumuz ve firma fiyat listeleri ayrı sekmelerde (birbirine karışmaz) */
export const MaterialsPanel: React.FC = () => {
  const me = useAccess();
  const showOwn = can(me, 'materials'), showSup = can(me, 'suppliers');
  const [tab, setTab] = useState<'own' | 'suppliers'>(() => {
    if (!showOwn) return 'suppliers';
    if (!showSup) return 'own';
    try { return localStorage.getItem('enyap-materials-tab') === 'suppliers' ? 'suppliers' : 'own'; } catch { return 'own'; }
  });
  const choose = (t: 'own' | 'suppliers') => { setTab(t); try { localStorage.setItem('enyap-materials-tab', t); } catch { /* */ } };
  // Sekmelerin altında kalem sayıları
  const [ownCount, setOwnCount] = useState<number | null>(null);
  const [supInfo, setSupInfo] = useState<{ lists: number; items: number } | null>(null);
  useEffect(() => {
    supabase.from('materials').select('code', { count: 'exact', head: true })
      .then(({ count }) => setOwnCount(count ?? null), () => undefined);
    fetchSupplierLists()
      .then(l => setSupInfo({ lists: l.length, items: l.reduce((a, x) => a + x.itemCount, 0) }), () => undefined);
  }, []);
  const tr = (n: number) => n.toLocaleString('tr-TR');
  const tabCls = (on: boolean) =>
    `flex-1 px-3 py-2 rounded-lg text-sm font-extrabold leading-tight transition-colors ${on ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`;
  const sub = 'block text-[11px] font-semibold text-slate-400 mt-0.5';
  return (
    <div className="space-y-3">
      {showOwn && showSup && <div className="flex gap-1 p-1 rounded-xl bg-slate-200/70" role="tablist">
        <button role="tab" aria-selected={tab === 'own'} onClick={() => choose('own')} className={tabCls(tab === 'own')}>
          Bizim Malzemeler
          <span className={sub}>{ownCount !== null ? `${tr(ownCount)} kalem` : '\u00a0'}</span>
        </button>
        <button role="tab" aria-selected={tab === 'suppliers'} onClick={() => choose('suppliers')} className={tabCls(tab === 'suppliers')}>
          Firma Fiyat Listeleri
          <span className={sub}>{supInfo ? `${supInfo.lists} firma · ${tr(supInfo.items)} kalem` : '\u00a0'}</span>
        </button>
      </div>}
      {tab === 'own' ? <OwnMaterials /> : <SupplierListsPanel />}
    </div>
  );
};
