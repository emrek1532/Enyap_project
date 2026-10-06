import React, { useState } from 'react';
import { Flame, Mail, Lock, User, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserRole } from '../types';

type Mode = 'signin' | 'signup';

export const AuthScreen: React.FC = () => {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('isparta');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, role },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo('Kayıt oluşturuldu. E-posta adresinize gelen doğrulama bağlantısına tıkladıktan sonra giriş yapabilirsiniz.');
          setMode('signin');
        }
      }
    } catch (err: any) {
      const msg: string = err?.message || 'Bir hata oluştu';
      if (msg.includes('Invalid login credentials')) setError('E-posta veya şifre hatalı.');
      else if (msg.includes('Email not confirmed')) setError('E-posta adresi henüz doğrulanmadı. Gelen kutunuzu kontrol edin.');
      else if (msg.includes('Signups not allowed')) setError('Yeni kayıt kapalı. Hesap için yöneticinize başvurun.');
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500';

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6 text-white">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 via-amber-500 to-sky-600 flex items-center justify-center shadow-lg mb-3">
            <Flame className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-extrabold text-2xl tracking-tight">
            ENYAP <span className="text-brand-400">ISI</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Saha & Ofis Takip Portalı</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl text-sm font-bold">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); }}
              className={`py-2 rounded-lg ${mode === 'signin' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              Giriş Yap
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); }}
              className={`py-2 rounded-lg ${mode === 'signup' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              Kayıt Ol
            </button>
          </div>

          {mode === 'signup' && (
            <>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="Ad Soyad"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Konum / Ekip</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="isparta">Isparta Saha Satış</option>
                  <option value="istanbul">İstanbul Merkez Ofis</option>
                </select>
              </div>
            </>
          )}

          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="E-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder="Şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </div>

          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</p>}
          {info && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-amber-500 hover:from-brand-600 hover:to-amber-600 text-white font-bold text-sm shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'signin' ? 'Giriş Yap' : 'Hesap Oluştur'}
          </button>
        </form>
      </div>
    </div>
  );
};
