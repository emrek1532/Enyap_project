import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> { key: K; dir: SortDir }

/**
 * Sütun başlığına tıklayınca sıralar; aynı başlığa tekrar tıklamak yönü çevirir.
 * Tarih ve sayılar ilk tıklamada büyükten küçüğe (yeniden eskiye), metinler A → Z sıralanır.
 */
export function nextSort<K extends string>(current: SortState<K>, key: K, firstDir: SortDir): SortState<K> {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: firstDir };
}

export const SortHeader: React.FC<{
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: 'left' | 'right';
  className?: string;
}> = ({ label, active, dir, onClick, align = 'left', className = '' }) => {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`py-3 px-3 ${align === 'right' ? 'text-right' : ''} ${className}`} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-900 ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-brand-600' : ''}`}
      >
        <span>{label}</span>
        <Icon className={`w-3.5 h-3.5 ${active ? '' : 'opacity-40'}`} />
      </button>
    </th>
  );
};

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
/** Türkçe ve sayıları doğal sıralayan karşılaştırma (68551 < 68552, "Ç" doğru yerde) */
export const compareText = (a: string, b: string) => collator.compare(a || '', b || '');
