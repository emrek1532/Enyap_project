import { useEffect, useState } from 'react';
import { localDay } from './dates';

/** Günlük ziyaret rotası: bu cihazda saklanır (sunucuya yazılmaz), ertesi gün boş başlar */
const KEY = 'enyap-route';
const EVT = 'enyap-route-change';
type Stored = { day: string; ids: string[] };

export function readRoute(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as Stored | null;
    return v && v.day === localDay() && Array.isArray(v.ids) ? v.ids : [];
  } catch { return []; }
}

export function writeRoute(ids: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify({ day: localDay(), ids: [...new Set(ids)] })); } catch { /* */ }
  window.dispatchEvent(new Event(EVT));
}

export const addToRoute = (id: string) => { const ids = readRoute(); if (!ids.includes(id)) writeRoute([...ids, id]); };

export function useRoute(): [string[], (ids: string[]) => void] {
  const [ids, setIds] = useState<string[]>(readRoute);
  useEffect(() => {
    const on = () => setIds(readRoute());
    window.addEventListener(EVT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener('storage', on); };
  }, []);
  return [ids, writeRoute];
}

/** Google Haritalar yol tarifi (bulunduğun yerden başlar; en çok 10 durak) */
export function directionsUrl(stops: { name: string; city?: string }[]): string {
  const q = stops.slice(0, 10).map(s => [s.name, s.city].filter(Boolean).join(', '));
  if (!q.length) return '';
  const dest = q[q.length - 1];
  const way = q.slice(0, -1);
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(dest)}${way.length ? `&waypoints=${encodeURIComponent(way.join('|'))}` : ''}`;
}
