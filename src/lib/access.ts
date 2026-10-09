/**
 * Kullanıcı yetkileri: her bölüm için Göremez / Görür / Düzenler.
 * Asıl kontrol veritabanında (RLS); burası ekranda neyin görüneceğini belirler.
 */
import { createContext, useContext } from 'react';
import { supabase } from './supabase';

export type Module = 'quotes' | 'orders' | 'collections' | 'expenses' | 'calendar' | 'notes' | 'materials' | 'suppliers';
export type Level = 'none' | 'view' | 'edit';
export type Status = 'pending' | 'active' | 'suspended';

export const MODULES: { key: Module; label: string }[] = [
  { key: 'quotes', label: 'Teklifler' },
  { key: 'orders', label: 'Siparişler' },
  { key: 'collections', label: 'Tahsilat' },
  { key: 'expenses', label: 'Harcama' },
  { key: 'calendar', label: 'Takvim' },
  { key: 'notes', label: 'Notlar' },
  { key: 'materials', label: 'Malzemeler' },
  { key: 'suppliers', label: 'Firma listeleri' },
];

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
  status: Status;
  perms: Partial<Record<Module, Level>>;
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

export function can(p: Profile | null, m: Module, lvl: 'view' | 'edit' = 'view'): boolean {
  if (!p || p.status !== 'active') return false;
  if (p.isAdmin) return true;
  const v = p.perms[m] || 'none';
  return lvl === 'view' ? v !== 'none' : v === 'edit';
}

export const AccessContext = createContext<Profile | null>(null);
export const useAccess = () => useContext(AccessContext);
