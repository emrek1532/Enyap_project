import React from 'react';
import { SuggestInput } from './SuggestInput';
import { TURKISH_CITIES } from '../lib/cities';

export const foldTr = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

/** Yazılana göre öneriler: tüm kelimeler geçmeli, yazılanla başlayanlar önce; birebir eşleşmede liste kapanır */
export function suggestText(options: string[], q: string, limit = 8): string[] {
  const f = foldTr(q.trim());
  if (!f) return [];
  const toks = f.split(/\s+/);
  const rows = options.map(t => ({ t, f: foldTr(t) }));
  if (rows.some(r => r.f === f)) return [];
  return rows
    .filter(r => toks.every(k => r.f.includes(k)))
    .sort((a, b) => Number(b.f.startsWith(f)) - Number(a.f.startsWith(f)) || a.f.localeCompare(b.f, 'tr'))
    .slice(0, limit)
    .map(r => r.t);
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  title?: string;
  dataAttrs?: Record<string, string>;
  /** Çıkışta yazılanı listedeki karşılığına çevir (büyük/küçük harf, tek eşleşen başlangıç) */
  snap?: boolean;
};

/**
 * Teklifteki firma adı kutusu gibi: yazdıkça altta öneri listesi açılır, ↑/↓ ile gezilir, Enter / Tab ile seçilir.
 * Sistemdeki tüm şehir, banka, şube, kategori gibi seçmeli kutular bunu kullanır.
 */
export const TextSuggest: React.FC<Props> = ({ value, onChange, options, className = '', placeholder, required, disabled, title, dataAttrs, snap }) => (
  <SuggestInput<string>
    value={value}
    onChange={onChange}
    onPick={onChange}
    suggestions={disabled ? [] : suggestText(options, value)}
    getKey={s => s}
    renderItem={s => <span className="text-sm text-slate-800">{s}</span>}
    inputClassName={className}
    placeholder={disabled ? '—' : placeholder}
    required={required}
    disabled={disabled}
    title={title}
    dataAttrs={dataAttrs}
    onBlur={snap ? () => {
      const f = foldTr(value.trim());
      if (!f) return;
      const exact = options.find(o => foldTr(o) === f);
      const starts = options.filter(o => foldTr(o).startsWith(f));
      const hit = exact || (starts.length === 1 ? starts[0] : undefined);
      if (hit && hit !== value) onChange(hit);
    } : undefined}
  />
);

/** Şehir kutusu: sadece 81 ilden öneri; "ısp" yazıp çıkınca "Isparta" olur */
export const CityInput: React.FC<Omit<Props, 'options' | 'snap'>> = props => (
  <TextSuggest placeholder="Şehir" {...props} options={TURKISH_CITIES} snap />
);
