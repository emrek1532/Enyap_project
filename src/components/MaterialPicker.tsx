import React, { useEffect, useRef, useState } from 'react';
import { Package } from 'lucide-react';
import { CURRENCY_LABEL } from '../lib/money';
import { Material, MaterialField, formatPrice, searchMaterials, searchRecent } from '../lib/materials';
import { SuggestInput } from './SuggestInput';

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
  onChange: (text: string) => void;
  onPick: (m: Material) => void;
}> = ({ field, value, required, placeholder, className, focusAfterPick, onChange, onPick }) => {
  const [results, setResults] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const reqId = useRef(0);
  const minChars = field === 'code' ? 1 : 2;

  useEffect(() => {
    const q = value.trim();
    const id = ++reqId.current;
    if (q.length < minChars) { setResults([]); setTotal(0); setLoading(false); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchMaterials(q, { limit: 12, field });
        if (id !== reqId.current) return;
        setResults(r.items); setTotal(r.total); setOffline(false);
      } catch {
        if (id !== reqId.current) return;
        const recent = searchRecent(q, field);
        setResults(recent); setTotal(recent.length); setOffline(true);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [value, field, minChars]);

  return (
    <SuggestInput<Material>
      value={value}
      onChange={onChange}
      onPick={onPick}
      suggestions={results}
      getKey={m => m.code}
      loading={loading}
      minChars={minChars}
      required={required}
      placeholder={placeholder}
      className={className}
      focusAfterPick={focusAfterPick}
      inputClassName={`w-full p-1.5 border border-slate-300 rounded text-xs bg-white ${field === 'code' ? 'font-mono uppercase' : ''}`}
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
      renderItem={m => (
        <span className="flex items-start gap-2">
          <Package className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-slate-800 leading-snug">{m.name || m.code}</span>
            <span className="block text-[10px] text-slate-500 font-mono">{m.code}</span>
          </span>
          <span className={`text-xs font-bold tabular-nums whitespace-nowrap ${m.price > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
            {m.price > 0 ? `${formatPrice(m.price)} ${CURRENCY_LABEL[m.currency]}` : 'fiyat yok'}
          </span>
        </span>
      )}
    />
  );
};
