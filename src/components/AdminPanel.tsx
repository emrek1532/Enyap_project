import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Clock, Loader2, Pause, Play, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { ActivityLog } from '../types';
import { Level, MODULES, Profile, listProfiles, removeUser, updateProfile } from '../lib/access';

const LEVELS: { v: Level; label: string; on: string }[] = [
  { v: 'none', label: 'Göremez', on: 'bg-slate-600 text-white' },
  { v: 'view', label: 'Görür', on: 'bg-sky-600 text-white' },
  { v: 'edit', label: 'Düzenler', on: 'bg-emerald-600 text-white' },
];

const STATUS: Record<Profile['status'], { label: string; cls: string }> = {
  pending: { label: 'Onay bekliyor', cls: 'bg-amber-100 text-amber-800' },
  active: { label: 'Aktif', cls: 'bg-emerald-100 text-emerald-800' },
  suspended: { label: 'Askıda', cls: 'bg-rose-100 text-rose-700' },
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Yönetim: personel onayı, bölüm yetkileri ve hareket kaydı (sadece admin görür) */
export const AdminPanel: React.FC<{ meId: string; activities: ActivityLog[] }> = ({ meId, activities }) => {
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = () => listProfiles().then(setUsers).catch(e => setErr(e.message || 'Kullanıcılar alınamadı.'));
  useEffect(() => { load(); }, []);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id); setErr('');
    try { await fn(); await load(); } catch (e: any) { setErr(e?.message || 'İşlem yapılamadı.'); } finally { setBusy(''); }
  };

  const sorted = useMemo(() => {
    const order = { pending: 0, active: 1, suspended: 2 };
    return [...(users || [])].sort((a, b) => order[a.status] - order[b.status]);
  }, [users]);
  const names = useMemo(() => new Map((users || []).map(u => [u.id, u.fullName || u.email])), [users]);
  const pending = sorted.filter(u => u.status === 'pending').length;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {err && <div className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 text-sm">{err}</div>}

      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <UserRound className="w-4 h-4 text-slate-400" />
          <h2 className="font-black text-slate-900">Kullanıcılar</h2>
          {pending > 0 && <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">{pending} onay bekliyor</span>}
        </header>
        {!users && <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>}
        <div className="divide-y divide-slate-100">
          {sorted.map(u => {
            const me = u.id === meId;
            const isOpen = open === u.id;
            return (
              <div key={u.id} className={u.status === 'pending' ? 'bg-amber-50/40' : ''}>
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <button onClick={() => setOpen(isOpen ? null : u.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 truncate">{u.fullName || u.email.split('@')[0]}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS[u.status].cls}`}>{STATUS[u.status].label}</span>
                      {u.isAdmin && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold"><ShieldCheck className="w-3 h-3" /> Yönetici</span>}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{u.email} · son giriş {when(u.lastSeen)}</div>
                  </button>
                  {busy === u.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                  {!me && u.status !== 'active' && (
                    <button onClick={() => run(u.id, () => updateProfile(u.id, { status: 'active' }))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                      {u.status === 'pending' ? <><Check className="w-3.5 h-3.5" /> Onayla</> : <><Play className="w-3.5 h-3.5" /> Aktif et</>}
                    </button>
                  )}
                  {!me && u.status === 'active' && (
                    <button onClick={() => run(u.id, () => updateProfile(u.id, { status: 'suspended' }))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-bold">
                      <Pause className="w-3.5 h-3.5" /> Askıya al
                    </button>
                  )}
                  {!me && (confirmDel === u.id ? (
                    <span className="inline-flex items-center gap-1">
                      <button onClick={() => { setConfirmDel(null); run(u.id, () => removeUser(u.id)); }}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold">Evet, sil</button>
                      <button onClick={() => setConfirmDel(null)} className="px-2 py-1.5 text-xs text-slate-500">Vazgeç</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDel(u.id)} title="Kullanıcıyı sil" className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ))}
                  <button onClick={() => setOpen(isOpen ? null : u.id)} className="p-1 text-slate-400">
                    <ChevronDown className={`w-4 h-4 transition ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {isOpen && (
                  <div className="px-4 pb-4">
                    {u.isAdmin ? (
                      <p className="text-xs text-slate-500">Yönetici her bölümü görür ve düzenler.</p>
                    ) : (
                      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                        {MODULES.map(m => {
                          const cur = u.perms[m.key] || 'none';
                          return (
                            <div key={m.key} className="flex items-center justify-between gap-2 px-3 py-2">
                              <span className="text-sm font-semibold text-slate-700">{m.label}</span>
                              <div className="flex gap-0.5 p-0.5 rounded-lg bg-slate-100">
                                {LEVELS.map(l => (
                                  <button key={l.v} disabled={busy === u.id}
                                    onClick={() => cur !== l.v && run(u.id, () => updateProfile(u.id, { perms: { ...u.perms, [m.key]: l.v } }))}
                                    className={`px-2 sm:px-3 py-1 rounded-md text-[11px] sm:text-xs font-bold ${cur === l.v ? l.on : 'text-slate-500'}`}>
                                    {l.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-2 text-[11px] text-slate-400">Kayıt: {when(u.createdAt)} · Müşteri listesi tüm aktif kullanıcılara açıktır.</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Clock className="w-4 h-4 text-slate-400" />
          <h2 className="font-black text-slate-900">Hareket kaydı</h2>
        </header>
        <div className="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
          {activities.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Kayıt yok.</p>}
          {activities.slice(0, 150).map(a => (
            <div key={a.id} className="px-4 py-2 text-xs flex gap-3">
              <div className="w-24 shrink-0 text-slate-400 tabular-nums">{when(a.timestamp)}</div>
              <div className="min-w-0">
                <span className="font-bold text-slate-800">{(a.actor && names.get(a.actor)) || (a.author === 'istanbul' ? 'İstanbul' : 'Isparta')}</span>
                <span className="text-slate-500"> · {a.action}</span>
                <div className="text-slate-500 break-words">{a.description}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

/** Onay bekleyen / askıdaki kullanıcının gördüğü ekran */
export const PendingScreen: React.FC<{ status: Profile['status'] | 'missing'; email: string; onRefresh: () => void; onSignOut: () => void }> =
  ({ status, email, onRefresh, onSignOut }) => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
      <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"><Clock className="w-6 h-6" /></div>
      <h1 className="font-black text-lg text-slate-900">{status === 'suspended' ? 'Hesabınız askıya alındı' : 'Onay bekleniyor'}</h1>
      <p className="text-sm text-slate-500">
        {status === 'suspended'
          ? 'Erişiminiz yönetici tarafından durduruldu. Bilgi için yöneticinizle görüşün.'
          : 'Hesabınız oluşturuldu. Yönetici onayladıktan sonra yetkili olduğunuz bölümleri görebilirsiniz.'}
      </p>
      <p className="text-xs text-slate-400">{email}</p>
      <div className="flex gap-2 justify-center pt-1">
        <button onClick={onRefresh} className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold">Tekrar kontrol et</button>
        <button onClick={onSignOut} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">Çıkış</button>
      </div>
    </div>
  </div>
);
