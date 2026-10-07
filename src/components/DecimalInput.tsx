import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

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

const MAX_DEC = 4;

/** 1250.5 → "1.250,5" */
const formatDecimal = (v: number) =>
  v ? v.toLocaleString('tr-TR', { maximumFractionDigits: MAX_DEC }) : '';

/** Yazılan metni "1.250.000,5" biçimine getirir: noktalar binlik, virgül ondalık */
function groupText(raw: string): string {
  const s = raw.replace(/[^\d,]/g, '');
  const comma = s.indexOf(',');
  let int = comma === -1 ? s : s.slice(0, comma);
  const dec = comma === -1 ? null : s.slice(comma + 1).replace(/,/g, '').slice(0, MAX_DEC);
  int = int.replace(/^0+(?=\d)/, '');
  if (int === '' && dec !== null) int = '0';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec === null ? grouped : `${grouped},${dec}`;
}

/** Imleçten önceki rakam + virgül sayısı (biçimlendirmeden sonra imleci aynı yere koymak için) */
const significantBefore = (s: string, pos: number) => s.slice(0, pos).replace(/[^\d,]/g, '').length;
function caretFor(formatted: string, sig: number) {
  if (sig <= 0) return 0;
  let n = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d,]/.test(formatted[i])) n++;
    if (n === sig) return i + 1;
  }
  return formatted.length;
}

/**
 * Para / miktar alanı. Yazarken binlik noktaları kendiliğinden eklenir (1.250.000),
 * ondalık için virgül kullanılır; nokta tuşu da virgül olarak alınır.
 */
export const DecimalInput: React.FC<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
    value: number;
    onValueChange: (v: number) => void;
  }
> = ({ value, onValueChange, onFocus, onBlur, ...rest }) => {
  const [text, setText] = useState(formatDecimal(value));
  const focused = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  // Değer dışarıdan değişirse (ör. katalogdan fiyat geldi) alanı güncelle
  useEffect(() => {
    if (!focused.current) setText(formatDecimal(value));
  }, [value]);

  useLayoutEffect(() => {
    if (pendingCaret.current != null && inputRef.current && document.activeElement === inputRef.current) {
      inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  }, [text]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const prev = text;
    let next = e.target.value;
    let caret = e.target.selectionStart ?? next.length;

    if (next.length - prev.length > 1) {
      // Yapıştırma: olduğu gibi çöz, sonra biçimlendir
      const n = parseDecimal(next);
      const out = n ? groupText(String(n).replace('.', ',')) : '';
      pendingCaret.current = out.length;
      setText(out);
      onValueChange(n);
      return;
    }
    if (next.length === prev.length + 1 && next[caret - 1] === '.') {
      // Nokta tuşu → ondalık virgül (zaten virgül varsa yok say)
      next = prev.includes(',') ? prev : next.slice(0, caret - 1) + ',' + next.slice(caret);
      if (prev.includes(',')) caret -= 1;
    } else if (prev.length === next.length + 1 && prev[caret] === '.') {
      // Binlik noktası silindiyse önündeki rakamı sil
      next = next.slice(0, caret - 1) + next.slice(caret);
      caret -= 1;
    }

    const sig = significantBefore(next, caret);
    const out = groupText(next);
    pendingCaret.current = caretFor(out, sig);
    setText(out);
    onValueChange(parseDecimal(out));
  };

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={handleChange}
      onFocus={(e) => { focused.current = true; onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; setText(formatDecimal(parseDecimal(text))); onBlur?.(e); }}
    />
  );
};
