/**
 * Döviz kurları (USD / EUR → TL): sunucu TCMB'den çeker (/api/rates).
 * Çevrimdışı ya da kur gelmezse son bilinen kur, o da yoksa Excel'den gelen tekliflerdeki kur kullanılır.
 */
import { useEffect, useState } from 'react';
import { Quote } from '../types';

export interface Rates { USD: number; EUR: number; date?: string }

const KEY = 'enyap-rates';
const readStored = (): Rates | null => {
  try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); return r?.USD > 0 && r?.EUR > 0 ? r : null; } catch { return null; }
};

let pending: Promise<Rates | null> | null = null;
export function fetchRates(): Promise<Rates | null> {
  if (!pending) {
    pending = fetch('/api/rates')
      .then(r => (r.ok ? r.json() : null))
      .then((r: Rates | null) => {
        if (r && r.USD > 0 && r.EUR > 0) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* */ } return r; }
        return null;
      })
      .catch(() => null);
  }
  return pending;
}

/** Excel'den aktarılan tekliflerdeki "Genel Toplam TL" ile döviz tutarından kuru çıkarır (yedek) */
export function impliedRates(quotes: Quote[]): Rates {
  const pick = (cur: 'USD' | 'EUR') => {
    const xs = quotes
      .filter(q => q.imported && (cur === 'USD' ? (q.amountUsd || 0) > 0 && !q.amountEur : (q.amountEur || 0) > 0 && !q.amountUsd))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 15)
      .map(q => ((q.totalAmount || 0) - (q.amountTry || 0)) / ((cur === 'USD' ? q.amountUsd : q.amountEur) || 1))
      .filter(x => x > 1)
      .sort((a, b) => a - b);
    return xs.length ? xs[Math.floor(xs.length / 2)] : 0;
  };
  return { USD: pick('USD') || 40, EUR: pick('EUR') || 45 };
}

export function useRates(quotes: Quote[]): Rates {
  const [rates, setRates] = useState<Rates>(() => readStored() || impliedRates(quotes));
  useEffect(() => { fetchRates().then(r => { if (r) setRates(r); }); }, []);
  return rates;
}

/** Teklifin KDV hariç TL karşılığı */
export function quoteNetTry(q: Quote, r: Rates): number {
  const toTry = (v: number, c?: string) => v * (c === 'USD' ? r.USD : c === 'EUR' ? r.EUR : 1);
  if (q.items?.length) {
    return q.items.reduce((s, it) =>
      s + toTry((it.quantity || 0) * (it.unitPrice || 0) * (1 - (it.discount || 0) / 100), it.currency || q.currency), 0);
  }
  // Excel'den gelen tekliflerde "Genel Toplam TL" zaten KDV hariç TL karşılığı
  if (q.imported) return q.totalAmount || 0;
  const broken = (q.amountTry || 0) + toTry(q.amountUsd || 0, 'USD') + toTry(q.amountEur || 0, 'EUR');
  return (broken > 0 ? broken : toTry(q.totalAmount || 0, q.currency)) / 1.2;
}

export const formatTl = (v: number) => `${Math.round(v).toLocaleString('tr-TR')} TL`;
