import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { CURRENCY_LABEL, Currency } from '../lib/money';
import { parseDecimal } from './DecimalInput';
import { Material, MATERIAL_UNITS, deleteMaterial, formatPrice, saveMaterial, searchMaterials } from '../lib/materials';

const PAGE = 50;
const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR'];
const EMPTY: Material = { code: '', name: '', price: 0, currency: 'TRY', unit: 'Adet', vatRate: 20, stock: null };

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('tr-TR') : '-');
const fmtStock = (v?: number | null) => (v == null ? '-' : v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }));

export const MaterialsPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [codeQuery, setCodeQuery] = useState('');
  const [onlyPriced, setOnlyPriced] = useState(false);
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
      const r = await searchMaterials(byCode ? codeQuery.trim() : query.trim(), { limit: PAGE, offset, onlyPriced, field: byCode ? 'code' : 'all' });
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
  }, [query, codeQuery, onlyPriced, reload]);

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
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={onlyPriced} onChange={e => setOnlyPriced(e.target.checked)} className="accent-brand-600" />
              Sadece fiyatlı
            </label>
            <button
              onClick={() => setEditing({ m: { ...EMPTY } })}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold whitespace-nowrap flex-1 sm:flex-none"
            >
              <Plus className="w-4 h-4" /> Malzeme Ekle
            </button>
          </div>
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-2">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{total.toLocaleString('tr-TR')} malzeme{query.trim() || codeQuery.trim() ? ' bulundu' : ''}</span>
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
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold text-left">
            <tr>
              <th className="py-3 px-3">Kod</th>
              <th className="py-3 px-3">Malzeme Adı</th>
              <th className="py-3 px-3">Birim</th>
              <th className="py-3 px-3 text-right">Birim Fiyat</th>
              <th className="py-3 px-3 text-right">KDV</th>
              <th className="py-3 px-3 text-right">Stok</th>
              <th className="py-3 px-3">Güncelleme</th>
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
