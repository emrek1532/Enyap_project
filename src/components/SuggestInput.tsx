import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

/** Formda bir sonraki yazılabilir alana geçer (Enter ile seçimden sonra) */
export function focusNextField(from: HTMLElement) {
  const scope = from.closest('form') || document.body;
  const fields = Array.from(scope.querySelectorAll<HTMLElement>('input, select, textarea, button'))
    .filter(el => !(el as HTMLInputElement).disabled && el.tabIndex >= 0 && el.offsetParent !== null);
  const next = fields[fields.indexOf(from) + 1];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  }
}

/**
 * Yazdıkça öneri listesi açan alan. ↑/↓ ile gezilir; Enter veya Tab ilk (seçili) öneriyi
 * alır ve bir sonraki alana geçer. Öneri yoksa alan serbest metin gibi davranır.
 */
export function SuggestInput<T>({
  value, onChange, onPick, suggestions, getKey, renderItem, loading, header, footer,
  placeholder, required, className = '', inputClassName = '', minChars = 1, inputMode, focusAfterPick,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (item: T) => void;
  suggestions: T[];
  getKey: (item: T) => string;
  renderItem: (item: T, active: boolean) => React.ReactNode;
  loading?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  minChars?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  /** Seçimden sonra odağı özel bir alana taşımak için; true dönerse varsayılan "sonraki alan" atlanır */
  focusAfterPick?: (input: HTMLInputElement) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { setActive(0); }, [suggestions]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const visible = open && value.trim().length >= minChars && (suggestions.length > 0 || !!header);

  const pick = (item: T, moveNext: boolean) => {
    onPick(item);
    setOpen(false);
    if (moveNext && inputRef.current) {
      const el = inputRef.current;
      // Seçim state'e yazıldıktan sonra odak geçsin
      window.setTimeout(() => { if (!focusAfterPick?.(el)) focusNextField(el); }, 0);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!visible || suggestions.length === 0) {
      if (e.key === 'Enter') { e.preventDefault(); focusNextField(e.currentTarget); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(suggestions[Math.min(active, suggestions.length - 1)], true);
    }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className={className}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          required={required}
          placeholder={placeholder}
          value={value}
          autoComplete="off"
          inputMode={inputMode}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={`${inputClassName} ${loading ? 'pr-7' : ''}`}
        />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 absolute right-2 top-1/2 -translate-y-1/2" />}
      </div>
      {visible && (
        <div className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          {header}
          <ul ref={listRef} className="max-h-56 overflow-y-auto divide-y divide-slate-100">
            {suggestions.map((item, i) => (
              <li key={getKey(item)} data-idx={i}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(item, false)}
                  className={`w-full text-left px-2.5 py-2 ${i === active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                >
                  {renderItem(item, i === active)}
                </button>
              </li>
            ))}
          </ul>
          {footer}
        </div>
      )}
    </div>
  );
}
