import React, { useEffect, useRef, useState } from 'react';

/**
 * Türkçe sayı yazımını çözer: "1.234,56" → 1234.56, "235,06" → 235.06.
 * Virgül yoksa: birden çok nokta ya da "1.234" gibi tam 3 haneli grup binlik ayırıcıdır, "235.06" ondalıktır.
 */
export function parseDecimal(text: string): number {
  let s = text.trim().replace(/\s/g, '');
  if (!s) return 0;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = s.split('.').length - 1;
    if (dots > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const formatDecimal = (v: number) =>
  v ? v.toLocaleString('tr-TR', { maximumFractionDigits: 4, useGrouping: false }) : '';

/** Virgülle ondalık girilebilen sayı alanı (telefon klavyesinde de virgül çalışır) */
export const DecimalInput: React.FC<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
    value: number;
    onValueChange: (v: number) => void;
  }
> = ({ value, onValueChange, onFocus, onBlur, ...rest }) => {
  const [text, setText] = useState(formatDecimal(value));
  const focused = useRef(false);

  // Değer dışarıdan değişirse (ör. katalogdan fiyat geldi) alanı güncelle
  useEffect(() => {
    if (!focused.current) setText(formatDecimal(value));
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,-]/g, '');
        setText(t);
        onValueChange(parseDecimal(t));
      }}
      onFocus={(e) => { focused.current = true; onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; setText(formatDecimal(parseDecimal(text))); onBlur?.(e); }}
    />
  );
};
