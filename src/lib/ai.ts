import { supabase } from './supabase';
import { Collection, Expense, Quote, QuoteItem } from '../types';
import { Currency } from './money';
import { MATERIAL_UNITS, Material, foldTr, searchMaterials } from './materials';
import { parseLocally } from './voiceParser';

/** Sesli asistanın sunucudan döndürdüğü yapı (worker/index.ts içindeki şemayla aynı) */
export interface AiItem {
  query: string;
  /** Katalogda bulunamazsa kaleme yazılacak ad (Türkçe harfleriyle) */
  label?: string;
  code: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  currency: Currency | null;
  discount: number | null;
}
export interface AiResult {
  intent: 'quote' | 'collection' | 'expense' | 'unknown';
  reply: string;
  quote: {
    customerName: string | null; city: string | null; paymentTerm: string | null; notes: string | null; items: AiItem[];
  } | null;
  collection: {
    customerName: string | null; amount: number | null; currency: Currency | null; method: string | null; date: string | null;
    bankName: string | null; bankBranch: string | null; checkNo: string | null; dueDate: string | null; description: string | null;
  } | null;
  expense: {
    category: string | null; amount: number | null; currency: Currency | null; method: string | null;
    region: string | null; date: string | null; description: string | null;
  } | null;
}

export interface AiContext {
  customers: string[];
  expenseCategories: string[];
  expenseMethods: string[];
  regions: string[];
  banks: string[];
}

export class AiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const pad = (n: number) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Konuşma metnini yapay zekaya gönderir, taslak döner */
export async function parseSpeech(text: string, ctx: AiContext): Promise<AiResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch('/api/ai/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ text, today: todayStr(), ...ctx }),
    });
  } catch {
    throw new AiError('offline', 'İnternet bağlantısı yok.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.result) throw new AiError(body?.error || 'unknown', body?.message || 'Yapay zeka şu an cevap veremedi.');
  return body.result as AiResult;
}

// Sunucuda yapay zeka anahtarı var mı? (yoksa ücretsiz yerel çözücü kullanılır)
let aiReady: Promise<boolean> | null = null;
const checkAiReady = () => {
  if (!aiReady) {
    aiReady = fetch('/api/ai/status')
      .then(r => (r.ok ? r.json() : { ready: false }))
      .then(b => !!b.ready)
      .catch(() => false);
  }
  return aiReady;
};

/**
 * Konuşmayı anlar: yapay zeka anahtarı tanımlıysa Claude, değilse cihazda çalışan ücretsiz çözücü.
 * Yapay zekaya ulaşılamazsa da yerel çözücüye düşer.
 */
export async function interpret(text: string, ctx: AiContext): Promise<AiResult> {
  if (await checkAiReady()) {
    try {
      return await parseSpeech(text, ctx);
    } catch (err) {
      if (err instanceof AiError && err.code === 'no_key') aiReady = Promise.resolve(false);
    }
  }
  return parseLocally(text, ctx);
}

// Kelimeyi kökü gibi kısalt: "vanası" → "vana", "radyatörü" → "radya" (ekler eşleşmeyi bozmasın)
const stem = (w: string) => (/^[\d/.,-]+$/.test(w) ? w : w.slice(0, w.length >= 7 ? 5 : 4));

/** Söylenen ifadeye en uygun katalog malzemesini seçer (kelime kökleri + ölçü + marka puanı) */
async function findMaterial(query: string): Promise<Material | null> {
  const words = foldTr(query).split(/\s+/).filter(w => w && (w.length >= 2 || /\d/.test(w)));
  if (!words.length) return null;
  const stems = [...new Set(words.map(stem))];
  const weight = (t: string) => (/\d/.test(t) ? 6 : t.length);
  // Aday listesi: önce tüm köklerle; bulunamazsa birer kelime çıkararak (yanlış duyulan kelime elensin),
  // en sonda en ayırt edici (uzun) iki / tek kökle ara
  const byLen = [...stems].sort((a, b) => weight(b) - weight(a));
  const minusOne = [...byLen].reverse().map(drop => byLen.filter(t => t !== drop).join(' '));
  const words2 = byLen.filter(t => !/^[\d/.,-]+$/.test(t));
  const tries = [byLen.join(' '), ...(byLen.length > 2 ? minusOne : []), words2.slice(0, 2).join(' '), words2[0], words2[1]]
    .filter((q, i, a) => q && a.indexOf(q) === i);
  const within = <T,>(p: Promise<T>) => Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), 2500))]);
  const pool = new Map<string, Material>();
  for (const q of tries) {
    const r = await within(searchMaterials(q, { limit: 60, field: 'name' })).catch(() => null);
    r?.items.forEach(m => pool.set(m.code, m));
    if (pool.size) break; // en çok kelimeyi tutan ilk arama yeterli
  }
  if (!pool.size) return null;

  const totalW = stems.reduce((a, t) => a + weight(t), 0);
  let best: Material | null = null;
  let bestScore = 0;
  for (const m of pool.values()) {
    const hay = foldTr(`${m.name} ${m.code}`);
    const hayWords = hay.split(/[\s()"',]+/);
    let sc = 0;
    for (const t of stems) {
      if (/^[\d/.,-]+$/.test(t)) { if (hay.includes(t)) sc += weight(t); }
      else if (hayWords.some(h => h.startsWith(t))) sc += weight(t);
    }
    sc = sc / totalW + (m.price > 0 ? 0.05 : 0) - hay.length / 2000; // fiyatlı ve kısa adlar hafif öne
    if (sc > bestScore) { bestScore = sc; best = m; }
  }
  // Söylenenin en az yarısı tutmuyorsa yanlış malzeme koymaktansa boş bırak
  return bestScore >= 0.5 ? best : null;
}

/** Söylenen malzemeyi katalogda bulup teklif kalemine çevirir (bulunamazsa söylendiği gibi kalır) */
async function toQuoteItem(it: AiItem, i: number): Promise<QuoteItem> {
  let match: Material | null = null;
  try {
    if (it.code) match = (await searchMaterials(it.code, { limit: 1, field: 'code' })).items[0] || null;
    if (!match) match = await findMaterial(it.query);
  } catch { /* internet yoksa katalogsuz devam */ }

  const quantity = it.quantity && it.quantity > 0 ? it.quantity : 1;
  const unitPrice = it.unitPrice ?? match?.price ?? 0;
  const discount = Math.min(100, Math.max(0, it.discount ?? 0));
  const unitRaw = it.unit || match?.unit || 'Adet';
  const unit = ((MATERIAL_UNITS as readonly string[]).includes(unitRaw) ? unitRaw : 'Adet') as QuoteItem['unit'];
  const net = quantity * unitPrice * (1 - discount / 100);
  return {
    id: `it-ai-${Date.now()}-${i}`,
    code: match?.code || it.code || undefined,
    productName: match?.name || it.label || it.query,
    quantity,
    unit,
    unitPrice,
    discount,
    vatRate: match?.vatRate ?? 20,
    totalPrice: Math.round(net * 1.2 * 100) / 100,
    currency: it.currency || match?.currency || 'TRY',
  };
}

export async function quoteDraftFrom(q: NonNullable<AiResult['quote']>): Promise<Partial<Quote>> {
  const items = await Promise.all(q.items.slice(0, 40).map(toQuoteItem));
  return {
    customerName: q.customerName || '',
    city: q.city || undefined,
    paymentTerm: q.paymentTerm || undefined,
    notes: q.notes || undefined,
    items,
  };
}

export const collectionDraftFrom = (c: NonNullable<AiResult['collection']>): Partial<Collection> => ({
  customerName: c.customerName || '',
  amount: c.amount ?? 0,
  currency: c.currency || 'TRY',
  method: c.method || undefined,
  date: c.date || undefined,
  bankName: c.bankName || undefined,
  bankBranch: c.bankBranch || undefined,
  checkNo: c.checkNo || undefined,
  dueDate: c.dueDate || undefined,
  description: c.description || undefined,
});

export const expenseDraftFrom = (e: NonNullable<AiResult['expense']>): Partial<Expense> => ({
  category: e.category || undefined,
  amount: e.amount ?? 0,
  currency: e.currency || 'TRY',
  method: e.method || undefined,
  region: e.region || undefined,
  date: e.date || undefined,
  description: e.description || undefined,
});

/** Cevabı Türkçe sesli okur (araçta ekrana bakmadan anlaşılsın) */
export function speak(text: string) {
  try {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR';
    const tr = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('tr'));
    if (tr) u.voice = tr;
    window.speechSynthesis.speak(u);
  } catch { /* ses yoksa sessiz geç */ }
}
