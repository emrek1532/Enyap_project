import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Clock, Copy, KeyRound, Loader2, Pause, Play, ShieldCheck, Trash2, UserPlus, UserRound, X } from 'lucide-react';
import { ActivityLog } from '../types';
import { FLAGS, Level, MODULES, PRESETS, Profile, createUser, levelOf, listProfiles, removeUser, renameUser, setUserPassword, updateProfile } from '../lib/access';
import { listCard, NewButton } from './ListUI';

type Perms = Profile['perms'];

const LEVELS: { v: Level; label: string; on: string }[] = [
  { v: 'none', label: 'Göremez', on: 'bg-slate-700 text-white' },
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
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toLocaleUpperCase('tr')).join('') || '?';
const newPassword = () => {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const r = new Uint32Array(8); crypto.getRandomValues(r);
  r.forEach(x => { s += a[x % a.length]; });
  return s;
};
/** Eksik anahtarları varsayılanla doldurur (ekranda ne görüyorsa o kaydedilsin) */
const fullPerms = (p: Perms): Perms => {
  const out: Perms = {};
  [...MODULES.map(m => m.key), ...FLAGS.map(f => f.key)].forEach(k => { out[k] = levelOf({ perms: p }, k); });
  return out;
};
const inputCls = 'w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400';

/** Yetki düzenleyici: bölümler (Göremez/Görür/Düzenler) + ek izinler + hazır şablonlar */
const PermEditor: React.FC<{ value: Perms; onChange: (p: Perms) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const set = (k: string, v: Level) => onChange({ ...value, [k]: v });
  const activePreset = PRESETS.find(pr => Object.entries(pr.perms).every(([k, v]) => value[k as keyof Perms] === v))?.key;
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1.5">Hazır şablon</div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(pr => (
            <button key={pr.key} type="button" disabled={disabled} onClick={() => onChange({ ...pr.perms })}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${activePreset === pr.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
              {pr.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1.5">Bölümler</div>
        <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 bg-white">
          {MODULES.map(m => {
            const cur = value[m.key] || 'none';
            return (
              <div key={m.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800">{m.label}</div>
                  <div className="text-[11px] text-slate-500">{m.hint}</div>
                </div>
                <div className="flex gap-0.5 p-0.5 rounded-lg bg-slate-100">
                  {LEVELS.filter(l => m.key !== 'reports' || l.v !== 'edit').map(l => (
                    <button key={l.v} type="button" disabled={disabled} onClick={() => set(m.key, l.v)}
                      className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-bold ${cur === l.v ? l.on : 'text-slate-600 hover:text-slate-900'}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1.5">Ek izinler</div>
        <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 bg-white">
          {FLAGS.map(f => {
            const on = (value[f.key] || 'none') !== 'none';
            return (
              <label key={f.key} className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800">{f.label}</div>
                  <div className="text-[11px] text-slate-500">{f.hint}</div>
                </div>
                <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => set(f.key, on ? 'none' : 'edit')}
                  className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** Kişi ekleme penceresi */
const AddUserModal: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const [f, setF] = useState({ fullName: '', email: '', password: newPassword(), role: 'isparta' as 'isparta' | 'istanbul', isAdmin: false });
  const [perms, setPerms] = useState<Perms>({ ...PRESETS[1].perms });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const info = `ENYAP Teklif & Satış giriş bilgileriniz\nAdres: ${location.origin}\nE-posta: ${f.email.trim()}\nŞifre: ${f.password}`;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await createUser({ ...f, perms: fullPerms(perms) }); setDone(true); onDone(); }
    catch (x: any) { setErr(x?.message || 'Kişi eklenemedi.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 px-4 sm:px-6 py-4 pt-safe-4 sm:pt-4 bg-gradient-to-br from-[#173F73] to-[#204D84] text-white flex items-center justify-between">
          <div>
            <h3 className="font-black text-lg tracking-tight">Kişi Ekle</h3>
            <p className="text-xs text-sky-200/80">Hesap hemen açılır, onay beklemez.</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white shrink-0" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>
        {done ? (
          <div className="p-4 sm:p-6 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 font-bold"><Check className="w-5 h-5" /> {f.fullName || f.email} eklendi.</div>
            <p className="text-sm text-slate-600">Giriş bilgilerini kişiye gönderin. Şifreyi daha sonra buradan değiştirebilirsiniz.</p>
            <pre className="whitespace-pre-wrap text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800">{info}</pre>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { navigator.clipboard?.writeText(info).then(() => setCopied(true)).catch(() => undefined); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700"><Copy className="w-4 h-4" /> {copied ? 'Kopyalandı' : 'Kopyala'}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(info)}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">WhatsApp ile gönder</a>
              <button type="button" onClick={onClose} className="ml-auto px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold">Tamam</button>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Ad soyad *</label>
                <input required value={f.fullName} onChange={e => setF({ ...f, fullName: e.target.value })} className={inputCls} placeholder="Örn. Ali Yılmaz" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">E-posta *</label>
                <input required type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className={inputCls} placeholder="ali@ornek.com" autoComplete="off" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Şifre *</label>
                <div className="flex gap-1.5">
                  <input required minLength={6} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} className={`${inputCls} font-mono`} autoComplete="new-password" />
                  <button type="button" onClick={() => setF({ ...f, password: newPassword() })} className="px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 shrink-0">Üret</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Ekip</label>
                <select value={f.role} onChange={e => setF({ ...f, role: e.target.value as 'isparta' | 'istanbul' })} className={inputCls}>
                  <option value="isparta">Isparta</option>
                  <option value="istanbul">İstanbul</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 self-end h-10">
                <input type="checkbox" checked={f.isAdmin} onChange={e => setF({ ...f, isAdmin: e.target.checked })} className="w-4 h-4 accent-brand-600" />
                Yönetici (her şeyi görür ve düzenler)
              </label>
            </div>
            {!f.isAdmin && <PermEditor value={perms} onChange={setPerms} disabled={busy} />}
            {err && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{err}</p>}
            <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-sm inline-flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Kişiyi ekle
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

/** Bir kullanıcının açılan ayar kısmı: yetkiler (Kaydet ile), yönetici, şifre, ad */
const UserDetail: React.FC<{ u: Profile; me: boolean; busy: boolean; run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean> }> = ({ u, me, busy, run }) => {
  const [draft, setDraft] = useState<Perms>(() => fullPerms(u.perms));
  const [pw, setPw] = useState('');
  const [name, setName] = useState(u.fullName);
  useEffect(() => { setDraft(fullPerms(u.perms)); setName(u.fullName); }, [u]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(fullPerms(u.perms));
  return (
    <div className="px-4 pb-4 space-y-4 bg-slate-50/60 border-t border-slate-100 pt-3">
      {u.isAdmin ? (
        <p className="text-sm text-slate-600 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-indigo-600" /> Yönetici her bölümü görür ve düzenler.</p>
      ) : (
        <>
          <PermEditor value={draft} onChange={setDraft} disabled={busy} />
          <div className="flex items-center gap-2">
            <button type="button" disabled={!dirty || busy} onClick={() => run(() => updateProfile(u.id, { perms: draft }), 'Yetkiler kaydedildi.')}
              className="px-4 py-2 rounded-xl bg-brand-600 disabled:opacity-40 text-white text-sm font-bold">Yetkileri kaydet</button>
            {dirty && <button type="button" onClick={() => setDraft(fullPerms(u.perms))} className="px-3 py-2 text-sm font-bold text-slate-500">Vazgeç</button>}
            {dirty && <span className="text-xs text-amber-700 font-semibold">Kaydedilmedi</span>}
          </div>
        </>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-bold text-slate-600 mb-1.5">Ad soyad</div>
          <div className="flex gap-1.5">
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
            <button type="button" disabled={busy || !name.trim() || name.trim() === u.fullName} onClick={() => run(() => renameUser(u.id, name), 'Ad güncellendi.')}
              className="px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-40 shrink-0">Kaydet</button>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> Yeni şifre belirle</div>
          <div className="flex gap-1.5">
            <input value={pw} onChange={e => setPw(e.target.value)} placeholder="en az 6 karakter" className={`${inputCls} font-mono`} autoComplete="new-password" />
            <button type="button" onClick={() => setPw(newPassword())} className="px-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 shrink-0">Üret</button>
            <button type="button" disabled={busy || pw.length < 6} onClick={async () => { if (await run(() => setUserPassword(u.id, pw), `Şifre değişti: ${pw}`)) setPw(''); }}
              className="px-3 rounded-xl bg-slate-800 text-white text-xs font-bold disabled:opacity-40 shrink-0">Kaydet</button>
          </div>
        </div>
      </div>
      {!me && (
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={u.isAdmin} disabled={busy}
            onChange={e => run(() => updateProfile(u.id, { isAdmin: e.target.checked }), e.target.checked ? 'Yönetici yapıldı.' : 'Yöneticilik kaldırıldı.')}
            className="w-4 h-4 accent-brand-600" />
          Yönetici (her şeyi görür ve düzenler, kişi ekler)
        </label>
      )}
      <div className="text-[11px] text-slate-500">Kayıt: {when(u.createdAt)} · son giriş {when(u.lastSeen)}</div>
    </div>
  );
};

/** Yönetim: kişi ekleme, onay, ayrıntılı yetkiler ve hareket kaydı (sadece yönetici görür) */
export const AdminPanel: React.FC<{ meId: string; activities: ActivityLog[]; newRequest?: number; demoUsers?: Profile[] }> = ({ meId, activities, newRequest, demoUsers }) => {
  const [users, setUsers] = useState<Profile[] | null>(demoUsers || null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [actor, setActor] = useState('');

  const load = () => listProfiles().then(setUsers).catch(e => setErr(e.message || 'Kullanıcılar alınamadı.'));
  useEffect(() => { if (!demoUsers) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (newRequest) setAdding(true); }, [newRequest]);

  const runFor = (id: string) => async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(id); setErr(''); setMsg('');
    try { await fn(); await load(); if (ok) setMsg(ok); return true; }
    catch (e: any) { setErr(e?.message || 'İşlem yapılamadı.'); return false; }
    finally { setBusy(''); }
  };

  const sorted = useMemo(() => {
    const order = { pending: 0, active: 1, suspended: 2 };
    return [...(users || [])].sort((a, b) => order[a.status] - order[b.status] || (a.fullName || a.email).localeCompare(b.fullName || b.email, 'tr'));
  }, [users]);
  const names = useMemo(() => new Map((users || []).map(u => [u.id, u.fullName || u.email])), [users]);
  const pending = sorted.filter(u => u.status === 'pending').length;
  const acts = useMemo(() => (actor ? activities.filter(a => a.actor === actor) : activities).slice(0, 200), [activities, actor]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <div className="space-y-3 min-w-0">
        {err && <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">{err}</div>}
        {msg && <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">{msg}</div>}

        <section className={`${listCard} overflow-hidden`}>
          <header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
            <span className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><UserRound className="w-4 h-4" /></span>
            <h2 className="font-black text-slate-900">Kullanıcılar</h2>
            <span className="text-xs font-bold text-slate-500">{users?.length ?? ''}</span>
            {pending > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">{pending} onay bekliyor</span>}
            <span className="ml-auto"><NewButton label="Kişi Ekle" onClick={() => setAdding(true)} /></span>
          </header>
          {!users && !err && <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>}
          <div className="divide-y divide-slate-100">
            {sorted.map(u => {
              const me = u.id === meId;
              const isOpen = open === u.id;
              const nm = u.fullName || u.email.split('@')[0];
              return (
                <div key={u.id} className={u.status === 'pending' ? 'bg-amber-50/40' : ''}>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button onClick={() => setOpen(isOpen ? null : u.id)} className="min-w-0 basis-full sm:basis-0 flex-1 text-left flex items-center gap-3">
                      <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${u.isAdmin ? 'bg-indigo-100 text-indigo-700' : 'bg-brand-50 text-brand-700'}`}>{initials(nm)}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 truncate">{nm}{me ? ' (siz)' : ''}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS[u.status].cls}`}>{STATUS[u.status].label}</span>
                          {u.isAdmin && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold"><ShieldCheck className="w-3 h-3" /> Yönetici</span>}
                        </span>
                        <span className="block text-xs text-slate-500 truncate">{u.email} · son giriş {when(u.lastSeen)}</span>
                      </span>
                    </button>
                    <div className="flex items-center gap-2 ml-auto">
                    {busy === u.id && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
                    {!me && u.status !== 'active' && (
                      <button onClick={() => runFor(u.id)(() => updateProfile(u.id, { status: 'active' }), 'Kullanıcı aktif.')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                        {u.status === 'pending' ? <><Check className="w-3.5 h-3.5" /> Onayla</> : <><Play className="w-3.5 h-3.5" /> Aktif et</>}
                      </button>
                    )}
                    {!me && u.status === 'active' && (
                      <button onClick={() => runFor(u.id)(() => updateProfile(u.id, { status: 'suspended' }), 'Kullanıcı askıya alındı.')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-bold">
                        <Pause className="w-3.5 h-3.5" /> Askıya al
                      </button>
                    )}
                    {!me && (confirmDel === u.id ? (
                      <span className="inline-flex items-center gap-1">
                        <button onClick={() => { setConfirmDel(null); runFor(u.id)(() => removeUser(u.id), 'Kullanıcı silindi.'); }}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold">Evet, sil</button>
                        <button onClick={() => setConfirmDel(null)} className="px-2 py-1.5 text-xs text-slate-500">Vazgeç</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDel(u.id)} title="Kullanıcıyı sil" aria-label="Kullanıcıyı sil" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ))}
                    <button onClick={() => setOpen(isOpen ? null : u.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-brand-700 hover:bg-brand-50">
                      Yetkiler <ChevronDown className={`w-4 h-4 transition ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    </div>
                  </div>
                  {isOpen && <UserDetail u={u} me={me} busy={busy === u.id} run={runFor(u.id)} />}
                </div>
              );
            })}
          </div>
        </section>
        <p className="text-xs text-slate-500 px-1">Yetkiler veritabanında da uygulanır: bir bölümü göremeyen kişiye o kayıtlar hiç gönderilmez. Değişiklik kişinin uygulamasında bir sonraki açılışta geçerli olur.</p>
      </div>

      <section className={`${listCard} overflow-hidden lg:sticky lg:top-4`}>
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <span className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Clock className="w-4 h-4" /></span>
          <h2 className="font-black text-slate-900">Hareket kaydı</h2>
          <select value={actor} onChange={e => setActor(e.target.value)} className="ml-auto h-8 px-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 max-w-[10rem]" aria-label="Kişi">
            <option value="">Herkes</option>
            {(users || []).map(u => <option key={u.id} value={u.id}>{u.fullName || u.email}</option>)}
          </select>
        </header>
        <div className="divide-y divide-slate-100 max-h-[32rem] lg:max-h-[calc(100vh-10rem)] overflow-y-auto">
          {acts.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Kayıt yok.</p>}
          {acts.map(a => (
            <div key={a.id} className="px-4 py-2.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-slate-800">{(a.actor && names.get(a.actor)) || (a.author === 'istanbul' ? 'İstanbul' : 'Isparta')}</span>
                <span className="text-slate-500 tabular-nums shrink-0">{when(a.timestamp)}</span>
              </div>
              <div className="text-slate-700">{a.action}</div>
              {a.description && <div className="text-slate-500 break-words">{a.description}</div>}
            </div>
          ))}
        </div>
      </section>

      {adding && <AddUserModal onClose={() => setAdding(false)} onDone={load} />}
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
      <p className="text-xs text-slate-500">{email}</p>
      <div className="flex gap-2 justify-center pt-1">
        <button onClick={onRefresh} className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold">Tekrar kontrol et</button>
        <button onClick={onSignOut} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">Çıkış</button>
      </div>
    </div>
  </div>
);
