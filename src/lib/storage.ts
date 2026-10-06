import { AppData, Quote, Order, CalendarEvent, QuickNote, ActivityLog } from '../types';
import { encryptText, decryptText } from './crypto';
import type { PendingOp } from './db';

const LOCAL_STORAGE_KEY = 'enyap_isi_portal_db_v1';
const E2EE_PASSPHRASE_KEY = 'enyap_e2ee_passphrase_v1';
const USER_ROLE_KEY = 'enyap_active_user_role_v1';

export const DEFAULT_E2EE_KEY = 'ENYAP-ISI-2026-GUVENLIK';

export function getStoredUserRole(): 'isparta' | 'istanbul' {
  const role = localStorage.getItem(USER_ROLE_KEY);
  return (role === 'istanbul' || role === 'isparta') ? role : 'isparta';
}

export function setStoredUserRole(role: 'isparta' | 'istanbul'): void {
  localStorage.setItem(USER_ROLE_KEY, role);
}

export function getStoredPassphrase(): string {
  return localStorage.getItem(E2EE_PASSPHRASE_KEY) || DEFAULT_E2EE_KEY;
}

export function setStoredPassphrase(key: string): void {
  localStorage.setItem(E2EE_PASSPHRASE_KEY, key);
}

export function loadLocalData(): AppData | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
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

const OUTBOX_KEY = 'enyap_isi_outbox_v1';

/** Çevrimdışıyken sunucuya yazılamayan değişiklikler kuyruğu */
export function loadOutbox(): PendingOp[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (raw) return JSON.parse(raw);
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

/**
 * Creates exportable backup package
 */
export async function createExportBackup(data: AppData, encrypt: boolean = false, passphrase?: string): Promise<string> {
  const payload = {
    app: 'Enyap Isı Portalı',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    isEncrypted: encrypt,
    data: data
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  if (encrypt && passphrase) {
    const cipher = await encryptText(jsonStr, passphrase);
    return JSON.stringify({
      app: 'Enyap Isı Portalı',
      isEncrypted: true,
      exportedAt: new Date().toISOString(),
      payload: cipher
    }, null, 2);
  }

  return jsonStr;
}

/**
 * Imports backup package
 */
export async function parseImportBackup(backupText: string, passphrase?: string): Promise<AppData> {
  const parsed = JSON.parse(backupText);
  if (parsed.isEncrypted) {
    if (!passphrase) {
      throw new Error('Bu yedek uçtan uca şifrelidir. Lütfen şifreleme anahtarını giriniz.');
    }
    const decrypted = await decryptText(parsed.payload, passphrase);
    const decryptedPackage = JSON.parse(decrypted);
    return decryptedPackage.data;
  }

  if (parsed.data && parsed.data.quotes) {
    return parsed.data;
  }

  if (parsed.quotes) {
    return parsed;
  }

  throw new Error('Geçersiz yedek dosyası biçimi.');
}
