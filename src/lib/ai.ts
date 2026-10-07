import { supabase } from './supabase';
import { Collection, Expense, Quote, QuoteItem } from '../types';
import { Currency } from './money';
import { MATERIAL_UNITS, searchMaterials } from './materials';

/** Sesli asistanın sunucudan döndürdüğü yapı (worker/index.ts içindeki şemayla aynı) */
export interface AiItem {
  query: string;
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

/** Söylenen malzemeyi katalogda bulup teklif kalemine çevirir (bulunamazsa söylendiği gibi kalır) */
async function toQuoteItem(it: AiItem, i: number): Promise<QuoteItem> {
  let match = null;
  try {
    if (it.code) match = (await searchMaterials(it.code, { limit: 1, field: 'code' })).items[0] || null;
    if (!match && it.query) match = (await searchMaterials(it.query, { limit: 1, field: 'all' })).items[0] || null;
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
    productName: match?.name || it.query,
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
  const items = await Promise.all(q.items.map(toQuoteItem));
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
