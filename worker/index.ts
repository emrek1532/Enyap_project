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
// Fiyat listesi sayfaları için küçük ve ucuz model (68 sayfalık katalog günlük ücretsiz kotaya sığsın)
const LLAMA_SMALL = '@cf/meta/llama-3.1-8b-instruct-fast';

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
  expenseMethods?: string[]; regions?: string[]; banks?: string[]; textOnly?: boolean;
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
  if (body.textOnly) return json({ text });

  try {
    return json({ text, result: await parseText(text, body, env) });
  } catch (err) {
    return json({ text, result: null, error: err instanceof ParseError ? err.code : 'unknown' });
  }
}

const PDF_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' },
          unitPrice: { type: 'number' }, discount: { type: 'number' }, currency: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit', 'unitPrice', 'discount', 'currency'],
      },
    },
  },
  required: ['items'],
};

const PDF_PROMPT = `Sana bir ısıtma/tesisat firmasının "Fiyat Teklifi" PDF'inden çıkarılmış düz metin veriyorum.
Görevin TÜM malzeme kalemlerini sırasıyla çıkarmak. Her kalem için:
- name: ürün adı (PDF'teki gibi, büyük harf korunur)
- quantity: miktar (sayı; "1.250,50" → 1250.5)
- unit: birim (ADET, MT, KG, TAKIM, PAKET, SET)
- unitPrice: iskontosuz birim fiyat (B.Fiyat)
- discount: toplam iskonto yüzdesi (yoksa 0; net birim fiyat verilmişse 100*(1-net/birim) ile hesapla)
- currency: TL, USD veya EUR
Başlık, toplam, KDV, açıklama satırlarını kalem sayma. Sayfa başlıkları tekrar ediyorsa yok say. Kalemleri tekrarlama.
Sadece JSON döndür.`;

async function handlePdf(req: Request, env: Env): Promise<Response> {
  if (!env.AI) return json({ error: 'no_ai', items: [] }, 503);
  if (!(await isLoggedIn(req, env))) return json({ error: 'unauthorized' }, 401);
  const body = await readBody(req);
  const text = String(body?.text || '').slice(0, 30000);
  if (!text.trim()) return json({ items: [] });
  try {
    const r = await env.AI.run(LLAMA, {
      messages: [{ role: 'system', content: PDF_PROMPT }, { role: 'user', content: text }],
      response_format: { type: 'json_schema', json_schema: PDF_SCHEMA },
      max_tokens: 6000,
      temperature: 0,
    });
    const out = typeof r?.response === 'string' ? JSON.parse(r.response) : r?.response;
    return json({ items: Array.isArray(out?.items) ? out.items : [] });
  } catch (err) {
    return json({ error: 'ai', message: String((err as Error)?.message || err).slice(0, 200), items: [] }, 502);
  }
}

const PRICELIST_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' }, name: { type: 'string' }, price: { type: 'number' },
          currency: { type: 'string' }, group: { type: 'string' },
        },
        required: ['code', 'name', 'price', 'currency', 'group'],
      },
    },
  },
  required: ['items'],
};

const PRICELIST_PROMPT = `Sana bir tesisat/vana/ısıtma tedarikçisinin FİYAT LİSTESİ veya KATALOĞUNUN tek bir sayfasının metnini veriyorum (taranmış sayfadan okunduysa yazım hataları olabilir).
Görevin sayfadaki fiyatı olan TÜM ürünleri çıkarmak. Katalog sayfalarında genelde üstte ürün ailesi (model no + ürün adı, ör. "FAF 2300 ÇEKVALF - ÇALPARA - WAFER - KOMPLE PASLANMAZ") ve altında ölçü (DN, inç) - fiyat tablosu olur; her tablo satırı ayrı bir üründür.
Her ürün için:
- code: firmanın ürün/stok kodu (varsa; yoksa "")
- name: anlaşılır, tam ürün adı = ürün ailesi + ölçü/özellik (ör. "FAF 2300 Çekvalf Çalpara Wafer Komple Paslanmaz DN40 1 1/2\""). Açıklama cümlelerini (sızdırmazlık, sıcaklık, gövde malzemesi vb.) ada KOYMA.
- price: liste fiyatı (sayı; "1.250,50" → 1250.5, "78" → 78)
- currency: o fiyatın para birimi: "TRY", "USD" veya "EUR". Fiyat sütunu başlığına ya da fiyatın yanındaki işarete bak ($ → USD, € → EUR, TL/₺ → TRY). Aynı sayfada farklı para birimleri olabilir; ÇEVİRME, yazıldığı gibi bırak.
- group: ürünün bölüm/aile başlığı (ör. "FAF 2300 Çekvalf Çalpara Wafer Komple Paslanmaz")
Fiyatı olmayan satırları, sertifika/belge listelerini, adres/telefon/açıklama satırlarını ALMA. Uydurma ürün ekleme. Sadece JSON döndür.`;

async function handlePriceList(req: Request, env: Env): Promise<Response> {
  if (!env.AI) return json({ error: 'no_ai', items: [] }, 503);
  if (!(await isLoggedIn(req, env))) return json({ error: 'unauthorized' }, 401);
  const body = await readBody(req);
  const text = String(body?.text || '').slice(0, 12000);
  if (!text.trim()) return json({ items: [] });
  try {
    const r = await env.AI.run(LLAMA_SMALL, {
      messages: [{ role: 'system', content: PRICELIST_PROMPT }, { role: 'user', content: text }],
      response_format: { type: 'json_schema', json_schema: PRICELIST_SCHEMA },
      max_tokens: 6000,
      temperature: 0,
    });
    const out = typeof r?.response === 'string' ? JSON.parse(r.response) : r?.response;
    return json({ items: Array.isArray(out?.items) ? out.items : [] });
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    if (/neuron|quota|limit|4006|429/i.test(msg)) return json({ error: 'quota', message: msg.slice(0, 200), items: [] }, 429);
    return json({ error: 'ai', message: msg.slice(0, 200), items: [] }, 502);
  }
}

// ---- Web Push (bildirim): teklif hatırlatmaları. Veritabanındaki zamanlanmış görev çağırır. ----
const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; b.forEach(c => { s += String.fromCharCode(c); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
  return out;
};
const enc = (t: string) => new TextEncoder().encode(t);
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, len * 8));
}

/** RFC 8291 (aes128gcm) ile bildirim içeriğini şifreler */
async function encryptPush(payload: Uint8Array, p256dh: string, authSecret: string) {
  const uaPublic = unb64u(p256dh), auth = unb64u(authSecret);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as any, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/** VAPID imzası (ES256 JWT) */
async function vapidAuth(endpoint: string, vapid: { public: string; private: JsonWebKey; subject: string }) {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject })));
  const key = await crypto.subtle.importKey('jwk', { ...vapid.private, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${vapid.public}`;
}

async function handlePushSend(req: Request): Promise<Response> {
  try {
    const b = await req.json() as any;
    const sub = b?.subscription, vapid = b?.vapid;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !vapid?.private || !vapid?.public) return json({ error: 'bad_request' }, 400);
    if (!/^https:\/\//.test(sub.endpoint)) return json({ error: 'bad_endpoint' }, 400);
    const body = await encryptPush(enc(JSON.stringify(b.payload || {})), sub.keys.p256dh, sub.keys.auth);
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidAuth(sub.endpoint, vapid),
        'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'normal',
      },
      body,
    });
    // Cihaz bildirimi kapattıysa / uygulama silindiyse abonelik silinir
    if (res.status === 404 || res.status === 410) {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/drop_push_subscription`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ p_endpoint: sub.endpoint }),
      }).catch(() => undefined);
    }
    return json({ status: res.status }, res.ok ? 200 : 502);
  } catch (err) {
    return json({ error: String((err as Error)?.message || err).slice(0, 200) }, 500);
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

/**
 * Paylaş menüsünden (WhatsApp vb.) gelen PDF. Normalde telefondaki service worker karşılar;
 * o yoksa / eskiyse dosya buraya gelir: küçük bir sayfa dosyayı tarayıcının önbelleğine koyup uygulamayı açar.
 */
async function handleShare(req: Request, url: URL): Promise<Response> {
  const back = (ok: boolean, why = '') =>
    Response.redirect(new URL(`/?shared-pdf=${ok ? 1 : 0}${why ? `&why=${encodeURIComponent(why.slice(0, 300))}` : ''}`, url).toString(), 303);
  if (req.method !== 'POST') return back(false, `srv:${req.method}`);
  let file = null as File | null;
  const seen: string[] = [];
  try {
    const form = await req.formData();
    form.forEach((v, k) => {
      if (typeof v === 'string') seen.push(`${k}=txt(${v.slice(0, 40)})`);
      else {
        seen.push(`${k}=file(${(v as File).type || '?'},${(v as File).size})`);
        if (!file && (v as File).size > 0) file = v as File;
      }
    });
  } catch (e) {
    return back(false, `srv:form-hata ${(req.headers.get('content-type') || '').slice(0, 60)} ${String((e as Error)?.message || e)}`);
  }
  if (!file) return back(false, `srv:dosya-yok [${seen.join(' ') || 'bos'}] ${(req.headers.get('content-type') || '').slice(0, 50)}`);
  if (file.size > 15_000_000) return back(false, 'srv:cok-buyuk');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const data = JSON.stringify({ b64: btoa(bin), name: file.name || 'teklif.pdf', type: file.type || 'application/pdf' });
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Enyap Isı</title><body style="font-family:sans-serif;padding:24px">PDF açılıyor…
<script>
const d=${data.replace(/</g, '\\u003c')};
const u=Uint8Array.from(atob(d.b64),c=>c.charCodeAt(0));
caches.open('enyap-share')
  .then(c=>c.put('/shared-pdf',new Response(new Blob([u],{type:d.type}),{headers:{'content-type':d.type,'x-file-name':encodeURIComponent(d.name)}})))
  .then(()=>location.replace('/?shared-pdf=1'),()=>location.replace('/?shared-pdf=0'));
</script>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/ai/parse' && req.method === 'POST') return handleParse(req, env);
    if (url.pathname === '/api/ai/voice' && req.method === 'POST') return handleVoice(req, env);
    if (url.pathname === '/api/ai/pdf' && req.method === 'POST') return handlePdf(req, env);
    if (url.pathname === '/api/ai/pricelist' && req.method === 'POST') return handlePriceList(req, env);
    if (url.pathname === '/api/push/send' && req.method === 'POST') return handlePushSend(req);
    if (url.pathname === '/api/rates') return handleRates();
    if (url.pathname === '/share-target') return handleShare(req, url);
    if (url.pathname === '/api/ai/status') return json({ ready: !!(env.ANTHROPIC_API_KEY || env.AI), voice: !!env.AI });
    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(req);
  },
};
