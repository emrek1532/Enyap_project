import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

const pad = (n: number) => String(n).padStart(2, '0');
const toText = (iso: string) => (iso ? iso.split('-').reverse().join('.') : '');
const FULL = /^\d{2}\.\d{2}\.\d{4}$/;
/** gg.aa.yyyy içinde parçaların yeri: gün 0-2, ay 3-5, yıl 6-10 */
const SEG: [number, number][] = [[0, 2], [3, 5], [6, 10]];
const segAt = (pos: number) => (pos <= 2 ? 0 : pos <= 5 ? 1 : 2);

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
 * Elle yazılabilen tarih kutusu (gg.aa.yyyy). Boşken rakamları yazmak yeter, noktalar kendiliğinden gelir.
 * Dolu tarihte güne / aya / yıla dokunup sadece o kısmı yazarak değiştirilir (tamamını silmeye gerek yok).
 * Sağdaki takvim simgesiyle takvimden de seçilir. Değer her zaman "yyyy-aa-gg" olarak verilir.
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
  const ref = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // Parça düzenleme: hangi parça, o parçaya şu ana kadar yazılan rakamlar
  const seg = useRef<{ i: number; buf: string } | null>(null);
  const pendingSel = useRef<[number, number] | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if ((parse(textRef.current, true) || '') !== (value || '')) setText(toText(value));
  }, [value]);

  useLayoutEffect(() => {
    const s = pendingSel.current;
    if (s && ref.current && document.activeElement === ref.current) ref.current.setSelectionRange(s[0], s[1]);
    pendingSel.current = null;
  });

  const selectSeg = (i: number) => {
    seg.current = { i, buf: '' };
    const [a, b] = SEG[i];
    ref.current?.setSelectionRange(a, b);
  };

  const emit = (t: string) => {
    const iso = parse(t, false);
    if (iso && iso !== valueRef.current) onChangeRef.current(iso);
  };

  // Dolu tarihte rakam / silme tuşlarını parça parça işle (telefon klavyesinde de çalışsın diye beforeinput)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onBefore = (e: InputEvent) => {
      const cur = textRef.current;
      if (!FULL.test(cur)) return;
      const a = el.selectionStart ?? 0, b = el.selectionEnd ?? 0;
      if (e.inputType === 'insertText' && e.data && /^\d$/.test(e.data)) {
        e.preventDefault();
        // Birden çok parça seçiliyse (ör. Tab ile gelip hepsi seçili) günden başla
        if (!seg.current || b - a > 4 || segAt(a) !== seg.current.i) seg.current = { i: b - a > 4 ? 0 : segAt(a), buf: '' };
        const s = seg.current;
        s.buf += e.data;
        const [sa, sb] = SEG[s.i];
        const len = sb - sa;
        let part: string;
        let done = false;
        if (s.i < 2) {
          const max = s.i === 0 ? 3 : 1; // gün 4-9 / ay 2-9 ile başlıyorsa tek hane yeter
          if (s.buf.length === 1 && +s.buf > max) { part = '0' + s.buf; done = true; }
          else if (s.buf.length >= 2) { part = s.buf.slice(0, 2); done = true; }
          else part = '0' + s.buf;
        } else {
          part = (s.buf + cur.slice(sa + s.buf.length, sb)).slice(0, len);
          done = s.buf.length >= 4;
        }
        const next = cur.slice(0, sa) + part + cur.slice(sb);
        setText(next);
        emit(next);
        if (done && s.i < 2) {
          seg.current = { i: s.i + 1, buf: '' };
          pendingSel.current = SEG[s.i + 1];
        } else {
          if (done) seg.current = { i: s.i, buf: '' };
          pendingSel.current = [sa, sb];
        }
      } else if (e.inputType.startsWith('delete')) {
        if (a === 0 && b >= cur.length) return; // tümü seçili: normal silme (kutuyu boşalt)
        e.preventDefault();
        selectSeg(segAt(a)); // parçayı seç; yazılan rakam onun yerine geçer
      } else if (e.inputType === 'insertText' || e.inputType === 'insertFromPaste') {
        if (e.inputType === 'insertText') e.preventDefault();
      }
    };
    el.addEventListener('beforeinput', onBefore);
    return () => el.removeEventListener('beforeinput', onBefore);
  }, []);

  const input = (raw: string) => {
    const t = mask(raw);
    setText(t);
    seg.current = null;
    if (!t) { onChange(''); return; }
    const iso = parse(t, false);
    if (iso) onChange(iso);
  };
  const blur = () => {
    seg.current = null;
    if (!text) return;
    const iso = parse(text, true);
    if (iso) { setText(toText(iso)); if (iso !== value) onChange(iso); }
    else setText(toText(value));
  };
  // Dolu tarihte tıklanan parçayı (gün/ay/yıl) seç
  const pick = () => {
    const el = ref.current;
    if (!el || !FULL.test(text) || (el.selectionEnd ?? 0) - (el.selectionStart ?? 0) > 4) return;
    selectSeg(segAt(el.selectionStart ?? 0));
  };
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!FULL.test(text) || !seg.current || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const i = seg.current.i + (e.key === 'ArrowLeft' ? -1 : 1);
    if (i < 0 || i > 2) return;
    e.preventDefault();
    selectSeg(i);
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        type="text" inputMode="numeric" autoComplete="off" maxLength={10}
        value={text} onChange={e => input(e.target.value)} onBlur={blur} onMouseUp={pick} onKeyDown={keys}
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
