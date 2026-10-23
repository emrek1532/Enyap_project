/**
 * Müşteri talebini okuma: el yazısı fotoğrafı, WhatsApp yazısı ya da Excel → ürün satırları → katalogda adaylar.
 * Yapay zekâ yalnızca talebi satırlara ayırır (/api/ai/request). Ürün seçimi kurallarla yapılır:
 * tercihli ürün kuralları ("genleşme" → VTSKGD…) ölçüyle birleşince ürünü kesinleştirir, olmazsa adaylar sıralanır
 * ve kullanıcı seçer. Emin olunmayan satır sessizce teklife geçmez.
 */
import { Material, foldTr, searchMaterials, splitSizes } from './materials';
import { supabase } from './supabase';
import { readXlsxRows } from './xlsxRead';

export interface ReqLine { text: string; item: string; qty: number; unit: string; unsure: boolean }

/** Tercihli ürün kuralı: talepte bu kelimeler geçiyorsa bu kod ailesinden seç */
export interface PrefRule { when: string; prefix: string }
export const PREF_KEY = 'preferred-products';

export async function readRequest(input: { image?: string; text?: string }): Promise<{ customer: string; lines: ReqLine[] }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch('/api/ai/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  });
  const out = await res.json().catch(() => null);
  if (res.status === 429) throw new Error('Yapay zekâ kotası doldu, biraz sonra tekrar deneyin (03:00\'te yenilenir).');
  if (!res.ok) throw new Error(out?.message || out?.error || 'Talep okunamadı');
  return { customer: String(out?.customer || ''), lines: Array.isArray(out?.lines) ? out.lines : [] };
}

/** Fotoğrafı küçültüp (uzun kenar 1600 px) JPEG data URL'e çevirir: hem hızlı gider hem kotayı az harcar */
export async function imageToDataUrl(file: File, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Excel talebini düz yazıya çevirir (her satır bir satır, hücreler " | " ile) */
export async function excelToText(file: File): Promise<string> {
  const rows = readXlsxRows(await file.arrayBuffer());
  return rows.map(r => r.map(c => String(c ?? '').trim()).filter(Boolean).join(' | ')).filter(Boolean).slice(0, 300).join('\n');
}

// Katalog adlarında geçen kısaltmalar: "genleşme tankı" → "GENL. DEPOSU", "tek serpantinli" → "TEK SERP."
const SYN: [RegExp, string][] = [
  [/genle[sş]me/g, 'genl'], [/serpantin\w*/g, 'serp'], [/k[uü]resel/g, 'kure'],
];
const STOP = new Set(['adet', 'ad', 'tane', 'lt', 'litre', 'lik', 'luk', 'tanki', 'tank', 'deposu', 'depo', 'mt', 'metre', 'li', 'lu', 'ile', 've', 'icin']);
const SPARE = /membran|conta|yedek|tamir|kit\b|takim/;

/** Talep satırından katalog arama ifadesi: sayılar, inç ölçüleri ve kelime kökleri */
export function searchTerms(item: string): string {
  let s = foldTr(item).replace(/(\d)\s*(''|”|″)/g, '$1"');
  for (const [re, to] of SYN) s = s.replace(re, to);
  return s.replace(/[^a-z0-9"/ ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w))
    .map(w => (/^[a-z]{6,}$/.test(w) ? w.slice(0, 4) : w)).join(' ');
}

/** Satırdaki ölçüler: inç (regex) ve 2+ haneli sayılar (litre, DN, mm); bar ayrı tutulur */
function sizeOf(item: string) {
  const f = foldTr(item);
  const bar = /(\d+)\s*-?\s*bar/.exec(f)?.[1] || null;
  const nums = [...f.replace(/(\d+)\s*-?\s*bar/g, ' ').matchAll(/(^|[^0-9.,/])(\d{2,5})(?![0-9.,/"])/g)].map(m => m[2]);
  return { bar, nums, sizes: splitSizes(item).sizes };
}

function fitsSize(name: string, s: ReturnType<typeof sizeOf>) {
  const n = foldTr(name);
  if (!s.nums.every(x => new RegExp(`(^|[^0-9.,])${x}([^0-9]|$)`).test(n))) return false;
  if (!s.sizes.every(r => r.test(n))) return false;
  const nb = /(\d+)\s*-?\s*bar/.exec(n)?.[1];
  // Basınç yazılmadıysa standart (16 bar olmayan) ürün; yazıldıysa o basınç
  return s.bar ? (nb ? nb === s.bar : s.bar === '10') : nb !== '16';
}

const familyCache = new Map<string, Promise<Material[]>>();
const family = (prefix: string) => {
  const k = prefix.toUpperCase();
  if (!familyCache.has(k)) {
    familyCache.set(k, searchMaterials(k, { field: 'code', limit: 200 })
      .then(r => r.items.filter(m => m.code.toUpperCase().startsWith(k)), () => []));
  }
  return familyCache.get(k)!;
};

export interface Match { cands: Material[]; pick: string | null; via: 'pref' | 'unique' | 'choose' | 'none' }

/** Bir talep satırı için katalog adayları ve (kesinse) seçim */
export async function matchLine(line: ReqLine, prefs: PrefRule[]): Promise<Match> {
  const f = foldTr(`${line.item} ${line.text}`);
  const size = sizeOf(line.item);
  const spareOk = SPARE.test(f);
  // 1) Tercihli ürün kuralı + ölçü
  // Yedek parça isteniyorsa (membran, conta…) ürünün kendisine ait kural uygulanmaz
  const rule = prefs.find(p => p.when.trim() && p.prefix.trim() && (!spareOk || SPARE.test(foldTr(p.when)))
    && foldTr(p.when).split(/\s+/).filter(Boolean).every(w => f.includes(w)));
  let pref: Material[] = [];
  if (rule) {
    pref = (await family(rule.prefix)).filter(m => fitsSize(m.name, size) && (spareOk || !SPARE.test(foldTr(m.name))));
    if (pref.length === 1) return { cands: pref, pick: pref[0].code, via: 'pref' };
  }
  // 2) Katalog araması; bulamazsa kelimeleri azaltarak
  const q = searchTerms(line.item);
  let items: Material[] = [];
  const words = q.split(' ');
  for (let k = words.length; k >= 1 && !items.length; k--) {
    const sub = words.filter((w, i) => /\d/.test(w) || i < k).join(' ');
    items = (await searchMaterials(sub, { limit: 40 }).catch(() => ({ items: [] as Material[] }))).items;
    if (k === words.length && items.length) break;
  }
  items = items.filter(m => spareOk || !SPARE.test(foldTr(m.name)));
  const sized = items.filter(m => fitsSize(m.name, size));
  const pool = (sized.length ? sized : items);
  const cands = [...pref, ...pool.filter(m => !pref.some(p => p.code === m.code))]
    .sort((a, b) => Number(b.price > 0) - Number(a.price > 0)).slice(0, 12);
  if (!cands.length) return { cands, pick: null, via: 'none' };
  if (sized.length === 1 && !pref.length) return { cands, pick: sized[0].code, via: 'unique' };
  return { cands, pick: null, via: 'choose' };
}

/** Seçilen kodların bağlı olduğu fiyat listesinin iskontosu (teklifte varsayılan iskonto) */
export async function listDiscounts(codes: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!codes.length) return out;
  const { data } = await supabase.from('supplier_items').select('our_code,list_id').in('our_code', codes);
  const ids = [...new Set((data || []).map(r => r.list_id as string))];
  if (!ids.length) return out;
  const { data: ls } = await supabase.from('supplier_lists').select('id,discount').in('id', ids);
  const disc = new Map((ls || []).map(l => [l.id as string, Number(l.discount || 0)]));
  for (const r of data || []) { const d = disc.get(r.list_id); if (d && !out.has(r.our_code)) out.set(r.our_code, d); }
  return out;
}
