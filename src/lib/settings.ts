import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Aylık hedefler (TL): onaylanan satış ve tahsilat */
export interface Targets { sales: number; collection: number }

const KEY = 'enyap-setting-';

/** Ortak ayar (app_settings tablosu): önce önbellekten gelir, sunucudan güncellenir */
export function useSetting<T>(key: string, fallback: T): [T, (v: T) => Promise<void>] {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(KEY + key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  });
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', key).maybeSingle().then(({ data }) => {
      if (!data) return;
      setValue(data.value as T);
      try { localStorage.setItem(KEY + key, JSON.stringify(data.value)); } catch { /* yok */ }
    }, () => undefined);
  }, [key]);
  const save = useCallback(async (v: T) => {
    setValue(v);
    try { localStorage.setItem(KEY + key, JSON.stringify(v)); } catch { /* yok */ }
    const { error } = await supabase.from('app_settings').upsert({ key, value: v, updated_at: new Date().toISOString() });
    if (error) throw error;
  }, [key]);
  return [value, save];
}
