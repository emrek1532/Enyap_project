/**
 * Enyap Worker: statik siteyi sunar, /api/* isteklerini burada karşılar.
 * POST /api/ai/parse — sesle söylenen metni (teklif / tahsilat / harcama) yapılandırılmış taslağa çevirir.
 * POST /api/ai/voice — kaydedilen sesi Whisper ile yazıya çevirir, sonra aynı şekilde taslağa çevirir.
 * Anlama: ANTHROPIC_API_KEY tanımlıysa Claude, değilse Cloudflare Workers AI (ücretsiz kota) kullanılır.
 * Anahtarlar tarayıcıya hiç gitmez.
 */
import Anthropic from '@anthropic-ai/sdk';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  /** Cloudflare Workers AI (ücretsiz günlük kota): ses → yazı (Whisper) ve metni anlama (Llama) */
  AI?: { run: (model: string, input: Record<string, unknown>) => Promise<any> };
  ANTHROPIC_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}

const SUPABASE_URL = 'https://aaduhhdwemnyqhnttcat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_r-RVHM4n_fEKQ5pX-L_kvQ_Cg2CDu5r';
const MODEL = 'claude-opus-5-5';
const WHISPER = '@cf/openai/whisper-large-v3-turbo';
const LLAMA = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Whisper'a sektör kelimelerini önceden söyler: "kollektör", "PPR", "yarım parmak" gibi kelimeler doğru yazılsın
const VOCAB = 'Teklif, tahsilat, harcama. Radyatör vanası, köşe vana, düz vana, termostatik vana, kollektör, PPR boru, ' +
  'PEX boru, kombi, baca, genleşme tankı, sirkülasyon pompası, dirsek, manşon, nipel, rakor, küresel vana, panel radyatör, ' +
  'yarım parmak, üç çeyrek, bir parmak, yüzde otuz iskonto, adet, metre, takım, peşin, 60 gün vade, çek, havale, Halkbank, Ziraat.';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** Sadece sisteme giriş yapmış kullanıcılar yapay zekayı kullanabilir */
async function isLoggedIn(req: Request, env: Env): Promise<boolean> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return false;
  const res = await fetch(`${env.SUPABASE_URL || SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_KEY },
  });
  return res.ok;
}

// ---- Çıktı şeması: model her zaman bu yapıda cevap verir ----
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const str = { type: 'string' };
const num = { type: 'number' };
const currency = { type: 'string', enum: ['TRY', 'USD', 'EUR'] };
const obj = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});

const SCHEMA = obj({
  intent: { type: 'string', enum: ['quote', 'collection', 'expense', 'unknown'] },
  reply: str,
  quote: nullable(obj({
    customerName: nullable(str),
    city: nullable(str),
    paymentTerm: nullable({ type: 'string', enum: ['PEŞİN', 'KREDİ KARTI', '60 GÜN', '90 GÜN'] }),
    notes: nullable(str),
    items: {
      type: 'array',
      items: obj({
        query: str,
        code: nullable(str),
        quantity: nullable(num),
        unit: nullable({ type: 'string', enum: ['Adet', 'Metre', 'Takım', 'Paket', 'Kg', 'Set'] }),
        unitPrice: nullable(num),
        currency: nullable(currency),
        discount: nullable(num),
      }),
    },
  })),
  collection: nullable(obj({
    customerName: nullable(str),
    amount: nullable(num),
    currency: nullable(currency),
    method: nullable(str),
    date: nullable(str),
    bankName: nullable(str),
    bankBranch: nullable(str),
    checkNo: nullable(str),
    dueDate: nullable(str),
    description: nullable(str),
  })),
  expense: nullable(obj({
    category: nullable(str),
    amount: nullable(num),
    currency: nullable(currency),
    method: nullable(str),
    region: nullable(str),
    date: nullable(str),
    description: nullable(str),
  })),
});

const SYSTEM = `Sen Enyap Isı'nın (ısıtma / tesisat malzemesi satan bir firma) teklif ve takip uygulamasındaki sesli asistansın.
Kullanıcı araç kullanırken konuşarak kayıt giriyor; konuşma metni Türkçe ses tanımadan geliyor ve hatalı yazılmış kelimeler, sayıların yazıyla söylenmesi ("iki yüz elli", "bir buçuk"), noktalama eksikliği içerebilir.

Görevin metni üç kayıt türünden birine çevirmek:
- quote: müşteriye fiyat teklifi (müşteri, şehir, ödeme vadesi, malzeme kalemleri, not)
- collection: yapılan tahsilat (müşteriden alınan çek / nakit / havale vb.)
- expense: yapılan harcama (yakıt, yemek, konaklama vb.)
Hiçbirine uymuyorsa intent = "unknown".

Kurallar:
- Sadece söyleneni yaz; söylenmeyen alanı null bırak. Fiyat, miktar, tarih uydurma.
- Müşteri adını verilen KAYITLI MÜŞTERİLER listesinde en yakın eşleşmeyle yaz (ör. "enorpa" → "Enorpa Enerji"). Listede yoksa söylendiği gibi yaz.
- Malzeme kaleminde "query" alanına malzemeyi katalogda aramaya uygun kısa bir ifade yaz (ör. "1/2 köşe radyatör vanası kalde"). Ölçüleri 1/2, 3/4, 1 1/4 gibi rakamla yaz ("yarım parmak" → 1/2, "üç çeyrek" → 3/4). Kod söylendiyse "code" alanına büyük harfle yaz.
- İskonto yüzde olarak sayı ("yüzde kırk beş" → 45). Para birimi söylenmediyse null; "dolar" USD, "euro/avro" EUR, "lira/TL" TRY.
- Tarihler YYYY-AA-GG biçiminde; "bugün", "dün", "ayın sonu" gibi ifadeleri BUGÜN'e göre hesapla.
- Tahsilat şekli şunlardan biri olmalı: Çek, Nakit, Havale/EFT, Kredi Kartı, Senet.
- Harcamada kategori ve ödeme şekli için verilen listelerden en uygununu seç.
- reply: kullanıcıya sesli okunacak, ne anladığını özetleyen tek kısa Türkçe cümle (ör. "Enorpa Enerji için 2 kalemli teklif hazırladım, kontrol edip kaydedin."). Eksik önemli bilgi varsa reply'da kısaca belirt.`;

type Body = {
  text?: string; audio?: string; today?: string; customers?: string[]; expenseCategories?: string[];
  expenseMethods?: string[]; regions?: string[]; banks?: string[];
};

class ParseError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}

const fold = (s: string) => s.replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u')
  .replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c').toLowerCase();
const GENERIC = new Set(['ltd', 'sti', 'san', 'tic', 'ins', 'insaat', 'enerji', 'muh', 'muhendislik', 'mekanik', 'isi', 'sistemleri',
  'ticaret', 'sanayi', 'limited', 'sirketi', 'as', 've', 'yapi', 'tesisat', 'dogalgaz']);

/** Söylenen metne benzeyen müşterileri öne alır (modele 1500 müşteri yerine en olası 30'u gider) */
function likelyCustomers(text: string, customers: string[], max = 30): string[] {
  const words = fold(text).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  const scored = customers.map(c => {
    let sc = 0;
    for (const t of fold(c).split(/[^a-z0-9]+/).filter(t => t.length >= 3)) {
      const p = t.slice(0, 4);
      if (words.some(w => w.startsWith(p) || p.startsWith(w.slice(0, 4)))) sc += GENERIC.has(t) ? 0.3 : 1 + t.length / 10;
    }
    return { c, sc };
  }).filter(x => x.sc >= 1).sort((a, b) => b.sc - a.sc);
  return scored.slice(0, max).map(x => x.c);
}

function referenceText(body: Body, text: string, full: boolean) {
  const list = (xs: string[] | undefined, max: number) => (xs || []).slice(0, max).map(x => String(x).slice(0, 80)).join('\n');
  const customers = full ? body.customers : likelyCustomers(text, body.customers || []);
  return [
    `KAYITLI MÜŞTERİLER${full ? '' : ' (söylenene en çok benzeyenler)'}:\n${list(customers, 1500) || '(benzeyen yok)'}`,
    `HARCAMA KATEGORİLERİ:\n${list(body.expenseCategories, 100)}`,
    `HARCAMA ÖDEME ŞEKİLLERİ:\n${list(body.expenseMethods, 50)}`,
    `BÖLGELER:\n${list(body.regions, 200)}`,
    `BANKALAR:\n${list(body.banks, 100)}`,
  ].join('\n\n');
}

const userText = (body: Body, text: string) =>
  `BUGÜN: ${body.today || new Date().toISOString().slice(0, 10)}\n\nKONUŞMA:\n${text}`;

async function parseWithClaude(text: string, body: Body, env: Env) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: [
        { type: 'text', text: SYSTEM },
        { type: 'text', text: referenceText(body, text, true), cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userText(body, text) }],
    });
    if (response.stop_reason === 'refusal') throw new ParseError('refusal', 'Bu istek işlenemedi.', 422);
    const out = response.content.find(b => b.type === 'text');
    if (!out || out.type !== 'text') throw new ParseError('empty', 'Cevap alınamadı.');
    return JSON.parse(out.text);
  } catch (err) {
    if (err instanceof ParseError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new ParseError('bad_key', 'Yapay zeka anahtarı geçersiz.', 503);
    if (err instanceof Anthropic.RateLimitError) throw new ParseError('rate_limit', 'Çok fazla istek, biraz sonra tekrar deneyin.', 429);
    if (err instanceof Anthropic.APIError) throw new ParseError('api', `Yapay zeka hatası (${err.status}).`);
    if (err instanceof SyntaxError) throw new ParseError('parse', 'Cevap okunamadı.');
    throw new ParseError('unknown', 'Beklenmeyen hata.', 500);
  }
}

// Llama için şema: anyOf yerine ["tip", "null"] (JSON modunun desteklediği sade biçim)
const n = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, 'null'], ...extra });
const lobj = (properties: Record<string, unknown>, nullable = false) => ({
  type: nullable ? ['object', 'null'] : 'object', properties, required: Object.keys(properties),
});
const LLAMA_SCHEMA = lobj({
  intent: { type: 'string', enum: ['quote', 'collection', 'expense', 'unknown'] },
  reply: { type: 'string' },
  quote: lobj({
    customerName: n('string'), city: n('string'), paymentTerm: n('string'), notes: n('string'),
    items: {
      type: 'array',
      items: lobj({
        query: { type: 'string' }, code: n('string'), quantity: n('number'), unit: n('string'),
        unitPrice: n('number'), currency: n('string'), discount: n('number'),
      }),
    },
  }, true),
  collection: lobj({
    customerName: n('string'), amount: n('number'), currency: n('string'), method: n('string'), date: n('string'),
    bankName: n('string'), bankBranch: n('string'), checkNo: n('string'), dueDate: n('string'), description: n('string'),
  }, true),
  expense: lobj({
    category: n('string'), amount: n('number'), currency: n('string'), method: n('string'),
    region: n('string'), date: n('string'), description: n('string'),
  }, true),
});

const LLAMA_EXTRA = `
Cevabın SADECE istenen JSON olsun. Kullanılmayan kayıt türlerini null yaz.
paymentTerm şunlardan biri ya da null: "PEŞİN", "KREDİ KARTI", "60 GÜN", "90 GÜN".
unit şunlardan biri ya da null: "Adet", "Metre", "Takım", "Paket", "Kg", "Set". currency: "TRY", "USD", "EUR" ya da null.
Her söylenen malzeme ayrı bir kalemdir; miktarı ve birimi o kalemin önünde/arkasında söylenendir.
Örnek: "Enorpa için teklif, 50 adet yarım parmak köşe radyatör vanası Kalde, 20 metre 20'lik PPR boru, yüzde 30 iskonto"
→ items: [{query:"1/2 köşe radyatör vanası kalde", quantity:50, unit:"Adet", discount:30, ...}, {query:"20 ppr boru", quantity:20, unit:"Metre", discount:30, ...}]`;

async function parseWithWorkersAI(text: string, body: Body, env: Env) {
  if (!env.AI) throw new ParseError('no_ai', 'Yapay zeka kullanılamıyor.', 503);
  let r: any;
  try {
    r = await env.AI.run(LLAMA, {
      messages: [
        { role: 'system', content: `${SYSTEM}\n${LLAMA_EXTRA}\n\n${referenceText(body, text, false)}` },
        { role: 'user', content: userText(body, text) },
      ],
      response_format: { type: 'json_schema', json_schema: LLAMA_SCHEMA },
      max_tokens: 1500,
      temperature: 0,
    });
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    if (/neuron|quota|limit|4006/i.test(msg)) throw new ParseError('quota', 'Günlük ücretsiz yapay zeka kotası doldu; yarın yenilenir.', 429);
    throw new ParseError('api', 'Yapay zeka şu an cevap veremedi.');
  }
  const out = r?.response;
  try {
    return typeof out === 'string' ? JSON.parse(out) : out;
  } catch {
    throw new ParseError('parse', 'Cevap okunamadı.');
  }
}

function parseText(text: string, body: Body, env: Env) {
  return env.ANTHROPIC_API_KEY ? parseWithClaude(text, body, env) : parseWithWorkersAI(text, body, env);
}

async function readBody(req: Request): Promise<Body | null> {
  try { return await req.json(); } catch { return null; }
}

const fail = (err: unknown) => err instanceof ParseError
  ? json({ error: err.code, message: err.message }, err.status)
  : json({ error: 'unknown', message: 'Beklenmeyen hata.' }, 500);

async function handleParse(req: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY && !env.AI) return json({ error: 'no_key', message: 'Yapay zeka tanımlı değil.' }, 503);
  if (!(await isLoggedIn(req, env))) return json({ error: 'unauthorized', message: 'Oturum açın.' }, 401);
  const body = await readBody(req);
  const text = (body?.text || '').trim().slice(0, 4000);
  if (!body || !text) return json({ error: 'bad_request', message: 'Metin boş.' }, 400);
  try { return json({ result: await parseText(text, body, env) }); } catch (err) { return fail(err); }
}

/** Ses kaydı → Whisper ile yazı → taslak. Anlama başarısız olsa da yazı döner (tarayıcı kendi çözer). */
async function handleVoice(req: Request, env: Env): Promise<Response> {
  if (!env.AI) return json({ error: 'no_ai', message: 'Sunucuda ses tanıma tanımlı değil.' }, 503);
  if (!(await isLoggedIn(req, env))) return json({ error: 'unauthorized', message: 'Oturum açın.' }, 401);
  const body = await readBody(req);
  if (!body?.audio || body.audio.length > 8_000_000) return json({ error: 'bad_request', message: 'Ses kaydı alınamadı.' }, 400);

  let text = '';
  try {
    const opts = { task: 'transcribe', language: 'tr', vad_filter: true, condition_on_previous_text: false, initial_prompt: VOCAB };
    let tr: any;
    try {
      tr = await env.AI.run(WHISPER, { audio: body.audio, ...opts });
    } catch {
      // Bazı sürümler sesi bayt dizisi olarak bekler
      const bytes = Uint8Array.from(atob(body.audio), c => c.charCodeAt(0));
      tr = await env.AI.run(WHISPER, { audio: Array.from(bytes), ...opts });
    }
    text = String(tr?.text || '').trim();
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    if (/neuron|quota|limit|4006/i.test(msg)) return json({ error: 'quota', message: 'Günlük ücretsiz ses tanıma kotası doldu; yarın yenilenir.' }, 429);
    return json({ error: 'stt', message: 'Ses yazıya çevrilemedi, tekrar deneyin.' }, 502);
  }
  if (!text) return json({ error: 'no_speech', message: 'Ses anlaşılamadı, biraz daha yüksek sesle tekrar deneyin.' }, 422);

  try {
    return json({ text, result: await parseText(text, body, env) });
  } catch (err) {
    return json({ text, result: null, error: err instanceof ParseError ? err.code : 'unknown' });
  }
}

/** TCMB günlük döviz satış kurları (1 saat önbellekli) */
async function handleRates(): Promise<Response> {
  const cache = (caches as any).default as Cache;
  const key = new Request('https://enyap.cache/rates');
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const res = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(String(res.status));
    const xml = await res.text();
    const rate = (code: string) => {
      const block = new RegExp(`<Currency[^>]*Kod="${code}"[\\s\\S]*?</Currency>`).exec(xml)?.[0] || '';
      return Number(/<ForexSelling>([\d.]+)<\/ForexSelling>/.exec(block)?.[1] || 0);
    };
    const date = /Tarih="([^"]+)"/.exec(xml)?.[1];
    const body = { USD: rate('USD'), EUR: rate('EUR'), date };
    if (!(body.USD > 0 && body.EUR > 0)) throw new Error('parse');
    const out = new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
    await cache.put(key, out.clone());
    return out;
  } catch {
    return json({ error: 'rates_unavailable' }, 503);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/ai/parse' && req.method === 'POST') return handleParse(req, env);
    if (url.pathname === '/api/ai/voice' && req.method === 'POST') return handleVoice(req, env);
    if (url.pathname === '/api/rates') return handleRates();
    // Paylaş menüsü normalde uygulamanın service worker'ında karşılanır; o henüz yoksa uygulamaya yönlendir
    if (url.pathname === '/share-target') return Response.redirect(new URL('/?shared-pdf=0', url).toString(), 303);
    if (url.pathname === '/api/ai/status') return json({ ready: !!(env.ANTHROPIC_API_KEY || env.AI), voice: !!env.AI });
    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(req);
  },
};
