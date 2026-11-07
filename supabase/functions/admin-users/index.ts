// @ts-nocheck Deno (Supabase Edge Function) dosyası; uygulamanın tip kontrolüne girmez
// Yönetim: kişi ekleme ve şifre belirleme (yalnız aktif yönetici çağırabilir).
// Gizli servis anahtarı yalnız burada (sunucuda) kullanılır, uygulamaya gitmez.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const LEVELS = new Set(['none', 'view', 'edit']);
const cleanPerms = (p: unknown) => {
  const out: Record<string, string> = {};
  if (p && typeof p === 'object') {
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (/^[a-z_]{2,20}$/.test(k) && typeof v === 'string' && LEVELS.has(v)) out[k] = v;
    }
  }
  return out;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Yalnız POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') || '';

  // Çağıran kişi yönetici mi? (kendi oturumuyla, veritabanındaki is_admin() ile)
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: isAdmin, error: adminErr } = await asCaller.rpc('is_admin');
  if (adminErr || isAdmin !== true) return json({ error: 'Bu işlem için yönetici olmalısınız.' }, 403);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Geçersiz istek.' }, 400); }

  if (body.action === 'create') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.fullName || '').trim().slice(0, 80);
    const role = body.role === 'istanbul' ? 'istanbul' : 'isparta';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'E-posta adresi geçersiz.' }, 400);
    if (password.length < 6) return json({ error: 'Şifre en az 6 karakter olmalı.' }, 400);

    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName, role },
    });
    if (error || !data.user) {
      const msg = /already|registered|exists/i.test(error?.message || '') ? 'Bu e-posta ile kayıtlı bir kullanıcı zaten var.' : (error?.message || 'Kullanıcı oluşturulamadı.');
      return json({ error: msg }, 400);
    }
    // Profil satırı tetikleyiciyle oluşur; onaylı ve yetkileriyle güncellenir
    const { error: upErr } = await admin.from('profiles').update({
      full_name: fullName, status: 'active', is_admin: body.isAdmin === true, perms: cleanPerms(body.perms),
    }).eq('id', data.user.id);
    if (upErr) return json({ error: 'Kullanıcı açıldı ama yetkiler yazılamadı: ' + upErr.message, id: data.user.id }, 500);
    return json({ ok: true, id: data.user.id });
  }

  if (body.action === 'password') {
    const id = String(body.id || '');
    const password = String(body.password || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Kullanıcı bulunamadı.' }, 400);
    if (password.length < 6) return json({ error: 'Şifre en az 6 karakter olmalı.' }, 400);
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (body.action === 'rename') {
    const id = String(body.id || '');
    const fullName = String(body.fullName || '').trim().slice(0, 80);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !fullName) return json({ error: 'Geçersiz istek.' }, 400);
    const { error } = await admin.from('profiles').update({ full_name: fullName }).eq('id', id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Bilinmeyen işlem.' }, 400);
});
