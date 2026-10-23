/**
 * Fiyat listesi yükleme (sunucuda): uygulamada PDF yazısı kaydedildikten sonra çağrılır, hemen cevap döner ve işi
 * arka planda sürdürür (uygulama kapatılsa da). Süre sınırına yaklaşınca durumu kaydedip kendini yeniden çağırır.
 * Bittiğinde (ya da hata olursa) kullanıcıya bildirim gider. Derleme: npm run build:fn
 */
// @ts-nocheck — Deno ortamı
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cleanAiItems, configure, finishListImport, parseListPages } from '../../../src/lib/pricelistCore';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WORKER = 'https://enyap-project.sakiremre153207.workers.dev';
const BUDGET = 70_000; // tek çalışmada sayfa okumaya ayrılan süre (ücretsiz planda sınır 150 sn; yoldaki sayfalar için pay)
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

async function notify(email: string, title: string, body: string) {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data: cfg } = await admin.from('push_config').select('*').eq('id', 1).maybeSingle();
  const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_email', email);
  if (!cfg) return;
  await Promise.all((subs || []).map((s: any) => fetch(`${WORKER}/api/push/send`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      vapid: { public: cfg.vapid_public, private: cfg.vapid_private_jwk, subject: cfg.subject },
      subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload: { title, body, url: '/', tag: 'pricelist' },
    }),
  }).catch(() => undefined)));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') || '';
  const { file } = await req.json().catch(() => ({}));
  if (!file) return json({ error: 'file gerekli' }, 400);
  const sb = createClient(URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!u?.user) return json({ error: 'oturum yok' }, 401);
  const { data: job } = await sb.from('pricelist_jobs').select('*').eq('file_name', file).maybeSingle();
  if (!job) return json({ error: 'iş bulunamadı' }, 404);
  if (job.status === 'bitti' || job.status === 'hata') return json({ ok: true, status: job.status });

  const started = Date.now();
  const set = (patch: Record<string, unknown>) => sb.from('pricelist_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('file_name', file);
  let last = 0;
  const onInfo = (info: string) => { if (Date.now() - last > 3000) { last = Date.now(); set({ info }); } };
  const chain = () => fetch(`${URL}/functions/v1/pricelist-import`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: auth, apikey: ANON }, body: JSON.stringify({ file }),
  }).catch(() => undefined);

  const work = async () => {
    try {
      configure({
        sb,
        ai: async (text: string) => {
          // Takılan sayfa çalışmanın süre sınırını doldurmasın: 25 sn'de cevap yoksa sayfa atlanır
          const res = await fetch(`${WORKER}/api/ai/pricelist`, {
            method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify({ text: text.slice(0, 12000) }),
            signal: AbortSignal.timeout(25_000),
          }).catch(e => { throw new Error(e?.name === 'TimeoutError' ? 'timeout' : String(e?.message || e)); });
          if (res.status === 429) throw new Error('quota');
          if (!res.ok) return null;
          const out = await res.json().catch(() => null);
          return Array.isArray(out?.items) ? cleanAiItems(out.items) : null;
        },
      });
      await set({ status: 'calisiyor' });
      const { data: rows, error } = await sb.from('supplier_raw_pages').select('page,content').eq('file_name', file).order('page');
      if (error) throw error;
      if (!rows?.length) throw new Error('PDF yazısı bulunamadı');
      const pages = rows.map((r: any) => String(r.content || '').split('\n'));
      const r = await parseListPages(pages, onInfo, job.state || undefined, started + BUDGET);
      if (!r.done) { await set({ state: r.state, info: `sayfalar okunuyor ${r.state.next}/${pages.length}` }); await chain(); return; }
      // Kaydetme ve eşleştirme için yeterli süre kalmadıysa yeni çalışmada bitir
      if (Date.now() - started > 60_000) {
        await set({ state: { next: r.total, parsed: r.parsed, failed: r.failed, quota: r.quota }, info: 'kaydediliyor…' });
        await chain(); return;
      }
      const res = await finishListImport(file, r, onInfo);
      const text = `${res.name}: ${res.items.toLocaleString('tr-TR')} kalem · ${res.matched.toLocaleString('tr-TR')} bizim koda bağlandı`
        + (res.replaced ? ' · eski liste yerine geçti' : '')
        + (res.priceDiff?.up ? ` · ${res.priceDiff.up} üründe zam (ort. %${res.priceDiff.avgUp})` : '');
      await set({ status: 'bitti', result: res, state: null, info: text });
      await notify(u.user.email!, 'Fiyat listesi yüklendi', text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await set({ status: 'hata', error: msg, info: `okunamadı: ${msg}` });
      await notify(u.user.email!, 'Fiyat listesi yüklenemedi', `${file}: ${msg}`);
    }
  };
  // @ts-ignore EdgeRuntime Supabase'de tanımlı
  EdgeRuntime.waitUntil(work());
  return json({ ok: true, status: 'kuyrukta' }, 202);
});
