import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

const pad = (n: number) => String(n).padStart(2, '0');
const toText = (iso: string) => (iso ? iso.split('-').reverse().join('.') : '');

/** "15102026", "15.10.2026", "15.10.26", "15.10" → "2026-10-15" (geçersizse null) */
function parse(text: string, complete: boolean): string | null {
  const d = text.replace(/\D/g, '');
  let day: number, mon: number, year: number;
  if (d.length === 8) { day = +d.slice(0, 2); mon = +d.slice(2, 4); year = +d.slice(4); }
  else if (complete && d.length === 6) { day = +d.slice(0, 2); mon = +d.slice(2, 4); year = 2000 + +d.slice(4); }
  else if (complete && d.length === 4) { day = +d.slice(0, 2); mon = +d.slice(2, 4); year = new Date().getFullYear(); }
  else return null;
  const t = new Date(year, mon - 1, day);
  if (t.getFullYear() !== year || t.getMonth() !== mon - 1 || t.getDate() !== day) return null;
  return `${year}-${pad(mon)}-${pad(day)}`;
}

/** Yazılan rakamlara noktaları kendisi koyar: 151020 → 15.10.20 */
const mask = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('.');
};

/**
 * Elle yazılabilen tarih kutusu (gg.aa.yyyy). Rakamları yazmak yeter, noktalar kendiliğinden gelir;
 * sağdaki takvim simgesiyle istenirse takvimden de seçilir. Değer her zaman "yyyy-aa-gg" olarak verilir.
 */
export const DateInput: React.FC<{
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  title?: string;
  placeholder?: string;
}> = ({ value, onChange, className = '', required, disabled, title, placeholder = 'gg.aa.yyyy' }) => {
  const [text, setText] = useState(toText(value));
  const picker = useRef<HTMLInputElement>(null);

  // Dışarıdan gelen değer değişince (takvim, kopyalanan satır, sıfırlama) kutuyu güncelle
  useEffect(() => {
    if ((parse(text, true) || '') !== (value || '')) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const input = (raw: string) => {
    const t = mask(raw);
    setText(t);
    if (!t) { onChange(''); return; }
    const iso = parse(t, false);
    if (iso) onChange(iso);
  };
  const blur = () => {
    if (!text) return;
    const iso = parse(text, true);
    if (iso) { setText(toText(iso)); if (iso !== value) onChange(iso); }
    else setText(toText(value));
  };

  return (
    <div className="relative">
      <input
        type="text" inputMode="numeric" autoComplete="off" maxLength={10}
        value={text} onChange={e => input(e.target.value)} onBlur={blur}
        required={required} disabled={disabled} title={title} placeholder={disabled ? '—' : placeholder}
        className={`${className} pr-8 tabular-nums`}
      />
      {!disabled && (
        <button type="button" tabIndex={-1} aria-label="Takvimden seç"
          onClick={() => { const el = picker.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); el.click(); } }}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-brand-600">
          <CalendarDays className="w-4 h-4" />
        </button>
      )}
      <input ref={picker} type="date" tabIndex={-1} aria-hidden value={value || ''}
        onChange={e => { onChange(e.target.value); setText(toText(e.target.value)); }}
        className="absolute right-0 bottom-0 w-px h-px opacity-0 pointer-events-none" />
    </div>
  );
};
