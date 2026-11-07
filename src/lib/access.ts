/**
 * Kullanıcı yetkileri: her bölüm için Göremez / Görür / Düzenler.
 * Asıl kontrol veritabanında (RLS); burası ekranda neyin görüneceğini belirler.
 */
import { createContext, useContext } from 'react';
import { supabase } from './supabase';

export type Module = 'quotes' | 'orders' | 'collections' | 'expenses' | 'calendar' | 'notes' | 'materials' | 'suppliers' | 'customers' | 'reports';
/** Ek izinler (açık = 'edit', kapalı = 'none'); yoksa varsayılan */
export type Flag = 'remove' | 'balances' | 'ai';
export type Level = 'none' | 'view' | 'edit';
export type Status = 'pending' | 'active' | 'suspended';

export const MODULES: { key: Module; label: string; hint: string }[] = [
  { key: 'quotes', label: 'Teklifler', hint: 'Teklif listesi, teklif hazırlama, onay' },
  { key: 'customers', label: 'Müşteriler', hint: 'Müşteri listesi ve cari kartları' },
  { key: 'materials', label: 'Malzemeler', hint: 'Bizim malzeme kataloğu ve fiyatlar' },
  { key: 'suppliers', label: 'Firma fiyat listeleri', hint: 'Tedarikçi listeleri ve eşleştirme' },
  { key: 'collections', label: 'Tahsilat', hint: 'Çek, senet, havale kayıtları' },
  { key: 'expenses', label: 'Harcama', hint: 'Masraf kayıtları' },
  { key: 'notes', label: 'Notlar', hint: 'Notlar ve hatırlatmalar' },
  { key: 'reports', label: 'Rapor', hint: 'Satış, tahsilat ve harcama raporları' },
];

export const FLAGS: { key: Flag; label: string; hint: string }[] = [
  { key: 'remove', label: 'Kayıt silebilir', hint: 'Teklif, müşteri, tahsilat, harcama, not silme' },
  { key: 'balances', label: 'Cari bakiyeleri görür', hint: 'Müşterilerde bakiye ve Mikro bakiyesi' },
  { key: 'ai', label: 'Yapay zekâ araçları', hint: '"Tekliflere sor" ve "Teklif hazırla"' },
];

/** Hazır yetki şablonları (yöneticinin tek dokunuşla vermesi için) */
export const PRESETS: { key: string; label: string; perms: Profile['perms'] }[] = [
  { key: 'full', label: 'Tam yetki', perms: { quotes: 'edit', customers: 'edit', materials: 'edit', suppliers: 'edit', collections: 'edit', expenses: 'edit', notes: 'edit', reports: 'view', remove: 'edit', balances: 'edit', ai: 'edit' } },
  { key: 'sales', label: 'Satış', perms: { quotes: 'edit', customers: 'edit', materials: 'view', suppliers: 'view', collections: 'none', expenses: 'edit', notes: 'edit', reports: 'none', remove: 'none', balances: 'none', ai: 'edit' } },
  { key: 'accounting', label: 'Muhasebe', perms: { quotes: 'view', customers: 'edit', materials: 'none', suppliers: 'none', collections: 'edit', expenses: 'edit', notes: 'edit', reports: 'view', remove: 'none', balances: 'edit', ai: 'none' } },
  { key: 'viewer', label: 'Sadece bakar', perms: { quotes: 'view', customers: 'view', materials: 'view', suppliers: 'view', collections: 'none', expenses: 'none', notes: 'view', reports: 'view', remove: 'none', balances: 'none', ai: 'none' } },
];

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
  status: Status;
  perms: Partial<Record<Module | Flag, Level>>;
  lastSeen: string | null;
  createdAt: string;
}

const fromRow = (r: any): Profile => ({
  id: r.id, email: r.email || '', fullName: r.full_name || '', isAdmin: !!r.is_admin,
  status: r.status, perms: r.perms || {}, lastSeen: r.last_seen, createdAt: r.created_at,
});

const cacheKey = (id: string) => `enyap-profile-${id}`;

/** Kendi profilim (çevrimdışıyken son bilinen) */
export async function fetchMyProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    try { const c = localStorage.getItem(cacheKey(id)); return c ? JSON.parse(c) : null; } catch { return null; }
  }
  const p = fromRow(data);
  try { localStorage.setItem(cacheKey(id), JSON.stringify(p)); } catch { /* yer yok */ }
  supabase.rpc('touch_profile').then(() => {}, () => {});
  return p;
}

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
}

export async function updateProfile(id: string, patch: { status?: Status; perms?: Profile['perms']; isAdmin?: boolean }) {
  const row: Record<string, unknown> = {};
  if (patch.status) row.status = patch.status;
  if (patch.perms) row.perms = patch.perms;
  if (patch.isAdmin !== undefined) row.is_admin = patch.isAdmin;
  const { error } = await supabase.from('profiles').update(row).eq('id', id);
  if (error) throw error;
}

export async function removeUser(id: string) {
  const { error } = await supabase.rpc('admin_remove_user', { uid: id });
  if (error) throw error;
}

/** Kayıtta olmayan yetkinin varsayılanı (eski kullanıcılar etkilenmesin; veritabanındaki can() ile aynı) */
export function levelOf(p: Pick<Profile, 'perms'>, k: Module | Flag): Level {
  const v = p.perms[k];
  if (v) return v;
  switch (k) {
    case 'customers': case 'remove': case 'ai': return 'edit';
    case 'reports': return p.perms.quotes ? (p.perms.quotes === 'none' ? 'none' : 'view') : 'none';
    case 'balances': return p.perms.collections && p.perms.collections !== 'none' ? 'edit' : 'none';
    default: return 'none';
  }
}

export function can(p: Profile | null, m: Module, lvl: 'view' | 'edit' = 'view'): boolean {
  if (!p || p.status !== 'active') return false;
  if (p.isAdmin) return true;
  const v = levelOf(p, m);
  return lvl === 'view' ? v !== 'none' : v === 'edit';
}

/** Ek izin açık mı */
export function allowed(p: Profile | null, f: Flag): boolean {
  if (!p || p.status !== 'active') return false;
  return p.isAdmin || levelOf(p, f) !== 'none';
}

/** Yönetici işlemleri (sunucudaki admin-users fonksiyonu; gizli anahtar orada) */
async function adminCall(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* */ }
    throw new Error(msg || 'İşlem yapılamadı.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export const createUser = (u: { email: string; password: string; fullName: string; role: 'isparta' | 'istanbul'; isAdmin: boolean; perms: Profile['perms'] }) =>
  adminCall({ action: 'create', ...u });
export const setUserPassword = (id: string, password: string) => adminCall({ action: 'password', id, password });
export const renameUser = (id: string, fullName: string) => adminCall({ action: 'rename', id, fullName });

export const AccessContext = createContext<Profile | null>(null);
export const useAccess = () => useContext(AccessContext);
