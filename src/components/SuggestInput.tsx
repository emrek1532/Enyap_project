import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  placeholder, required, className = '', inputClassName = '', minChars = 1, inputMode, focusAfterPick, autoFocus,
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
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Liste içeriği değişince seçimi başa al (her çizimde yeni dizi gelse de)
  const listKey = suggestions.map(getKey).join('|');
  useEffect(() => { setActive(0); }, [listKey]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const visible = open && value.trim().length >= minChars && (suggestions.length > 0 || !!header);

  // Liste sayfanın üstünde (portal) açılır: dar kutularda bile geniş görünür, kaydırılan alanlarda kesilmez.
  // Telefonda ekran genişliğinde, büyük dokunma satırlarıyla açılır.
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    if (!visible) { setPos(null); return; }
    const place = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = (vv?.height ?? window.innerHeight) + (vv?.offsetTop ?? 0);
      const isNarrow = vw < 640;
      setNarrow(isNarrow);
      const below = vh - r.bottom - 8;
      const above = r.top - 8;
      const up = below < 180 && above > below;
      const maxHeight = Math.max(120, Math.min(isNarrow ? 360 : 300, up ? above : below));
      const width = isNarrow ? vw - 16 : Math.min(Math.max(r.width, 420), vw - 16);
      const left = isNarrow ? 8 : Math.min(r.left, vw - width - 8);
      setPos({
        position: 'fixed', left, width, maxHeight, zIndex: 80,
        ...(up ? { bottom: window.innerHeight - r.top + 2 } : { top: r.bottom + 2 }),
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [visible, suggestions.length]);

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
    if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+Enter vb. formun kısayolları
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
          autoFocus={autoFocus}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={`${inputClassName} ${loading ? 'pr-7' : ''}`}
        />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 absolute right-2 top-1/2 -translate-y-1/2" />}
      </div>
      {visible && pos && createPortal(
        <div style={pos} className="rounded-lg border border-slate-300 bg-white shadow-xl overflow-hidden flex flex-col">
          {header}
          <ul ref={listRef} className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 overscroll-contain">
            {suggestions.map((item, i) => (
              <li key={getKey(item)} data-idx={i}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(item, true)}
                  className={`w-full text-left ${narrow ? 'px-3 py-3' : 'px-2.5 py-1.5'} ${i === active ? 'bg-brand-50' : 'hover:bg-slate-50 active:bg-brand-50'}`}
                >
                  {renderItem(item, i === active)}
                </button>
              </li>
            ))}
          </ul>
          {footer}
        </div>,
        document.body,
      )}
    </div>
  );
}
