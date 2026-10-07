import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Package } from 'lucide-react';
import { CURRENCY_LABEL } from '../lib/money';
import { Material, formatPrice, searchMaterials, searchRecent } from '../lib/materials';

/**
 * Teklif kalemi için malzeme adı alanı. Yazdıkça fiyat kataloğunda arar;
 * seçilen malzemenin birimi, fiyatı ve para birimi kaleme aktarılır.
 * Listede olmayan malzeme yine serbestçe yazılabilir.
 */
export const MaterialPicker: React.FC<{
  value: string;
  required?: boolean;
  onChange: (text: string) => void;
  onPick: (m: Material) => void;
}> = ({ value, required, onChange, onPick }) => {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const reqId = useRef(0);
  const blurTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const q = value.trim();
    if (q.length < 2) { setResults([]); setTotal(0); return; }
    const id = ++reqId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchMaterials(q, { limit: 12 });
        if (id !== reqId.current) return;
        setResults(r.items); setTotal(r.total); setOffline(false);
      } catch {
        if (id !== reqId.current) return;
        const recent = searchRecent(q);
        setResults(recent); setTotal(recent.length); setOffline(true);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [value, open]);

  const pick = (m: Material) => {
    onPick(m);
    setOpen(false);
  };

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          required={required}
          placeholder="Malzeme adı veya kodu yazın (Örn: köşe radyatör vana 1/2)"
          value={value}
          autoComplete="off"
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 200); }}
          className="w-full p-1.5 pr-7 border border-slate-300 rounded text-xs bg-white"
        />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 absolute right-2 top-1/2 -translate-y-1/2" />}
      </div>
      {open && value.trim().length >= 2 && !loading && (results.length > 0 || offline) && (
        <div
          className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden"
          onMouseDown={() => window.clearTimeout(blurTimer.current)}
        >
          {offline && (
            <div className="px-2.5 py-1.5 text-[10px] text-amber-700 bg-amber-50">
              İnternet yok — sadece son kullanılan malzemeler gösteriliyor
            </div>
          )}
          <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100">
            {results.map(m => (
              <li key={m.code}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(m)}
                  className="w-full text-left px-2.5 py-2 hover:bg-brand-50 active:bg-brand-100 flex items-start gap-2"
                >
                  <Package className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-800 leading-snug">{m.name || m.code}</span>
                    <span className="block text-[10px] text-slate-500 font-mono">{m.code}</span>
                  </span>
                  <span className={`text-xs font-bold tabular-nums whitespace-nowrap ${m.price > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                    {m.price > 0 ? `${formatPrice(m.price)} ${CURRENCY_LABEL[m.currency]}` : 'fiyat yok'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {total > results.length && (
            <div className="px-2.5 py-1.5 text-[10px] text-slate-500 bg-slate-50">
              {total.toLocaleString('tr-TR')} sonuçtan ilk {results.length} gösteriliyor — daha fazla kelime yazarak daraltın
            </div>
          )}
        </div>
      )}
    </div>
  );
};
