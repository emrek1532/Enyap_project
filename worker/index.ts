/**
 * Enyap Worker: statik siteyi sunar, /api/* isteklerini burada karşılar.
 * POST /api/ai/parse — sesle söylenen metni (teklif / tahsilat / harcama) yapılandırılmış taslağa çevirir.
 * Claude API anahtarı tarayıcıya hiç gitmez; Cloudflare'de ANTHROPIC_API_KEY gizli değişkeninde durur.
 */
import Anthropic from '@anthropic-ai/sdk';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ANTHROPIC_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}

const SUPABASE_URL = 'https://aaduhhdwemnyqhnttcat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_r-RVHM4n_fEKQ5pX-L_kvQ_Cg2CDu5r';
const MODEL = 'claude-opus-5-5';

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

async function handleParse(req: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'no_key', message: 'Yapay zeka anahtarı henüz tanımlanmadı (ANTHROPIC_API_KEY).' }, 503);
  }
  if (!(await isLoggedIn(req, env))) return json({ error: 'unauthorized', message: 'Oturum açın.' }, 401);

  let body: {
    text?: string; today?: string; customers?: string[]; expenseCategories?: string[];
    expenseMethods?: string[]; regions?: string[]; banks?: string[];
  };
  try { body = await req.json(); } catch { return json({ error: 'bad_request', message: 'Geçersiz istek.' }, 400); }
  const text = (body.text || '').trim().slice(0, 4000);
  if (!text) return json({ error: 'bad_request', message: 'Metin boş.' }, 400);

  const list = (xs: string[] | undefined, max: number) => (xs || []).slice(0, max).map(x => String(x).slice(0, 80)).join('\n');
  // Listeler nadiren değişir: önbelleğe alınan sabit kısım; metin ve tarih en sonda
  const reference = [
    `KAYITLI MÜŞTERİLER:\n${list(body.customers, 1500)}`,
    `HARCAMA KATEGORİLERİ:\n${list(body.expenseCategories, 100)}`,
    `HARCAMA ÖDEME ŞEKİLLERİ:\n${list(body.expenseMethods, 50)}`,
    `BÖLGELER:\n${list(body.regions, 200)}`,
    `BANKALAR:\n${list(body.banks, 100)}`,
  ].join('\n\n');

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
        { type: 'text', text: reference, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: `BUGÜN: ${body.today || new Date().toISOString().slice(0, 10)}\n\nKONUŞMA:\n${text}` }],
    });

    if (response.stop_reason === 'refusal') {
      return json({ error: 'refusal', message: 'Bu istek işlenemedi.' }, 422);
    }
    const out = response.content.find(b => b.type === 'text');
    if (!out || out.type !== 'text') return json({ error: 'empty', message: 'Cevap alınamadı.' }, 502);
    return json({ result: JSON.parse(out.text) });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json({ error: 'bad_key', message: 'Yapay zeka anahtarı geçersiz.' }, 503);
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'rate_limit', message: 'Çok fazla istek, biraz sonra tekrar deneyin.' }, 429);
    if (err instanceof Anthropic.APIError) return json({ error: 'api', message: `Yapay zeka hatası (${err.status}).` }, 502);
    if (err instanceof SyntaxError) return json({ error: 'parse', message: 'Cevap okunamadı.' }, 502);
    return json({ error: 'unknown', message: 'Beklenmeyen hata.' }, 500);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/ai/parse' && req.method === 'POST') return handleParse(req, env);
    if (url.pathname === '/api/ai/status') return json({ ready: !!env.ANTHROPIC_API_KEY });
    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(req);
  },
};
