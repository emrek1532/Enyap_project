import React, { useEffect, useRef, useState } from 'react';
import { Package } from 'lucide-react';
import { CURRENCY_LABEL } from '../lib/money';
import { Material, MaterialField, foldTr, formatPrice, searchMaterials, searchRecent } from '../lib/materials';
import { SuggestInput } from './SuggestInput';
import { fetchSupplierLists, searchSupplierItems, supplierColor, supplierToMaterial } from '../lib/suppliers';

// Firma fiyat listesi var mı (yoksa her harfte boşuna sorgu atılmaz)
let hasSuppliers: Promise<boolean> | null = null;
const suppliersExist = () => (hasSuppliers ||= fetchSupplierLists().then(l => l.length > 0, () => false));

// Aynı aramayı tekrar sunucuya sormamak için küçük bellek içi önbellek
const CACHE_MAX = 300;
const cache = new Map<string, { items: Material[]; total: number }>();
const cacheGet = (field: MaterialField, key: string) => cache.get(`${field}|${key}`);
const cachePut = (field: MaterialField, key: string, r: { items: Material[]; total: number }) => {
  const k = `${field}|${key}`;
  cache.delete(k);
  cache.set(k, r);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
};

/**
 * Teklif kalemi için malzeme adı / kodu alanı. Yazdıkça fiyat kataloğunda arar;
 * seçilen malzemenin kodu, adı, birimi, fiyatı ve para birimi kaleme aktarılır.
 * Listede olmayan malzeme yine serbestçe yazılabilir.
 */
export const MaterialPicker: React.FC<{
  field: MaterialField;
  value: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  focusAfterPick?: (input: HTMLInputElement) => boolean;
  /** Kutunun görünümü (verilmezse varsayılan küçük kutu) */
  inputClassName?: string;
  /** Sadece bizim malzemeler (firma listeleri aranmaz) */
  ownOnly?: boolean;
  autoFocus?: boolean;
  onChange: (text: string) => void;
  onPick: (m: Material) => void;
}> = ({ field, value, required, placeholder, className, focusAfterPick, inputClassName, ownOnly, autoFocus, onChange, onPick }) => {
  const [results, setResults] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [focused, setFocused] = useState(false);
  // Firma fiyat listelerinden sonuçlar: bizim sonuçların ALTINDA ayrı başlıkla gösterilir
  const [supplierResults, setSupplierResults] = useState<Material[]>([]);
  const reqId = useRef(0);
  const last = useRef<{ q: string; items: Material[]; total: number } | null>(null);
  const minChars = field === 'code' ? 1 : 2;

  useEffect(() => {
    // Sadece yazılan kutu arar (seçimden sonra ya da düzenleme açılışında boşuna sorgu atılmaz)
    if (!focused) return;
    const q = value.trim();
    const id = ++reqId.current;
    if (q.length < minChars) { setResults([]); setTotal(0); setLoading(false); return; }
    const key = foldTr(q);

    const show = (r: { items: Material[]; total: number }) => {
      setResults(r.items); setTotal(r.total); setOffline(false);
      last.current = { q: key, ...r };
    };

    // 1) Daha önce aranmışsa anında göster
    const cached = cacheGet(field, key);
    if (cached) { show(cached); setLoading(false); return; }

    // 2) Önceki aramanın devamıysa sonuçları hemen süz (tam listeyse sunucuya hiç gitme)
    const prev = last.current;
    if (prev && key.startsWith(prev.q)) {
      const toks = key.split(/\s+/).filter(Boolean);
      const filtered = prev.items.filter(m => {
        const hay = foldTr(field === 'code' ? m.code : field === 'name' ? m.name : `${m.code} ${m.name}`);
        return toks.every(t => hay.includes(t));
      });
      if (prev.total <= prev.items.length) {
        const r = { items: filtered, total: filtered.length };
        cachePut(field, key, r); show(r); setLoading(false);
        return;
      }
      if (filtered.length) { setResults(filtered); setTotal(Math.max(filtered.length, prev.total)); }
    }

    // 3) Sunucuya sor (kısa bekleme: hızlı yazarken her harfte istek gitmesin)
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchMaterials(q, { limit: 12, field });
        cachePut(field, key, r);
        if (id !== reqId.current) return;
        show(r);
      } catch {
        if (id !== reqId.current) return;
        const recent = searchRecent(q, field);
        setResults(recent); setTotal(recent.length); setOffline(true);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [value, field, minChars, focused]);

  useEffect(() => {
    if (!focused || ownOnly) return;
    const q = value.trim();
    if (q.length < 3) { setSupplierResults([]); return; }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      if (!(await suppliersExist())) return;
      try {
        const r = await searchSupplierItems(q, { limit: 8 });
        if (!cancelled) setSupplierResults(r.items.map(supplierToMaterial));
      } catch { if (!cancelled) setSupplierResults([]); }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [value, focused, ownOnly]);

  const suggestions = supplierResults.length ? [...results, ...supplierResults] : results;
  const firstSupplier = results.length;

  return (
    <div className={className} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
    <SuggestInput<Material>
      value={value}
      onChange={onChange}
      onPick={onPick}
      suggestions={suggestions}
      getKey={m => (m.supplier ? `s:${m.supplier}:${m.code}:${m.name}` : m.code)}
      loading={loading}
      minChars={minChars}
      required={required}
      placeholder={placeholder}
      focusAfterPick={focusAfterPick}
      autoFocus={autoFocus}
      inputClassName={`${inputClassName || 'w-full p-1.5 border border-slate-300 rounded text-xs bg-white'} ${field === 'code' ? 'font-mono uppercase' : ''}`}
      header={offline ? (
        <div className="px-2.5 py-1.5 text-[10px] text-amber-700 bg-amber-50">
          İnternet yok — sadece son kullanılan malzemeler gösteriliyor
        </div>
      ) : undefined}
      footer={total > results.length ? (
        <div className="px-2.5 py-1.5 text-[10px] text-slate-500 bg-slate-50">
          {total.toLocaleString('tr-TR')} sonuçtan ilk {results.length} gösteriliyor — daha fazla yazarak daraltın
        </div>
      ) : undefined}
      renderItem={m => {
        const idx = suggestions.indexOf(m);
        return (
          <>
            {m.supplier && idx === firstSupplier && (
              <span className="block -mx-2.5 -mt-1.5 mb-1.5 px-2.5 py-1 bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-500">
                Firma fiyat listeleri
              </span>
            )}
            <span className="flex items-start gap-2">
              <Package className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-800 leading-snug break-words">
                  {m.supplier && (
                    <span className="text-[9px] font-black text-white rounded px-1 py-px mr-1 align-[1px]" style={{ background: supplierColor(m.supplier) }}>
                      {m.supplier.toLocaleUpperCase('tr')}
                    </span>
                  )}
                  {m.name || m.code}
                </span>
                <span className="block text-[10px] text-slate-500 font-mono">
                  {m.code}{m.supplier && m.supplierDiscount ? ` · %${m.supplierDiscount} iskonto` : ''}
                </span>
              </span>
              <span className={`shrink-0 text-right text-xs font-bold tabular-nums whitespace-nowrap ${m.price > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                {m.price > 0 ? `${formatPrice(m.price)} ${CURRENCY_LABEL[m.currency]}` : 'fiyat yok'}
                {m.supplier && m.price > 0 && m.supplierDiscount ? (
                  <span className="block text-[10px] font-semibold text-slate-500">net {formatPrice(m.price * (1 - m.supplierDiscount / 100))}</span>
                ) : null}
              </span>
            </span>
          </>
        );
      }}
    />
    </div>
  );
};
