import { AppData, Quote } from '../types';
import type { PendingOp } from './db';

const LOCAL_STORAGE_KEY = 'enyap_isi_portal_db_v1';
const OUTBOX_KEY = 'enyap_isi_outbox_v1';

/** Son bilinen veriler: uygulama internet yokken de açılabilsin diye cihazda tutulur */
export function loadLocalData(): AppData | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const data: AppData = JSON.parse(raw);
      // Arşiv durumu kaldırıldı; eski önbellekte kalanlar Beklemede sayılır
      data.quotes = (data.quotes || []).map((q: Quote) =>
        q.status === 'arsiv' ? { ...q, status: 'gonderildi' } : q);
      return data;
    }
  } catch (err) {
    console.error('Failed to load local data:', err);
  }
  return null;
}

export function saveLocalData(data: AppData): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save local data:', err);
  }
}

/** Çevrimdışıyken sunucuya yazılamayan değişiklikler kuyruğu */
export function loadOutbox(): PendingOp[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (raw) {
      const ops: PendingOp[] = JSON.parse(raw);
      // Eski sürümün otomatik arşivleme işlemleri artık gönderilmez
      const kept = ops.filter(op =>
        !(op.kind === 'upsert' && op.entity === 'quotes' && (op.record as Quote)?.status === 'arsiv'));
      if (kept.length !== ops.length) saveOutbox(kept);
      return kept;
    }
  } catch (err) {
    console.error('Failed to load outbox:', err);
  }
  return [];
}

export function saveOutbox(ops: PendingOp[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
  } catch (err) {
    console.error('Failed to save outbox:', err);
  }
}

export function clearLocalCache(): void {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  localStorage.removeItem(OUTBOX_KEY);
}
