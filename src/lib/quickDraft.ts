/**
 * Yapay zekâsız teklif taslağı: "gemfaya 2000 adet c tipi 14 mm kelepçe son fiyattan" gibi bir istekten
 * firma, adet ve ürünü kurallarla çıkarır. Ürün önce o firmanın geçmiş tekliflerinde aranır (en son fiyat ve iskonto),
 * yoksa katalogda (tek aday varsa). Her şey kesinse ajan (yapay zekâ) hiç çağrılmaz; değilse eksikler ajana kalır.
 */
import { Customer, Quote, QuoteItem } from '../types';
import { Material, foldTr, searchMaterials, splitSizes } from './materials';
import { PREF_KEY, PrefRule, listDiscounts, matchLine } from './requestRead';

const STOP = /^(son|fiyat\w*|hazirla\w*|teklif\w*|ver|verin|verelim|icin|olarak|ile|gecen|sefer\w*|iskonto\w*|ayni\w*|eski|onceki|gecenki|en|gibi|lutfen|yap\w*|cikar\w*|gonder\w*|firma\w*|musteri\w*|bize|ona|kdv\w*|dahil|haric|olsun)$/;
const QTY = /(\d+(?:[.,]\d+)?)\s*(adet|ad\.?|tane|mt|metre|m|takim|paket|kg|set)\b/;
const UNIT: Record<string, QuoteItem['unit']> = { mt: 'Metre', metre: 'Metre', m: 'Metre', takim: 'Takım', paket: 'Paket', kg: 'Kg', set: 'Set' };

export interface QuickDraft {
  draft: Partial<Quote>;
  /** Firma ve tüm kalemler kesin bulundu mu (ajan gerekmez) */
  complete: boolean;
  /** Bulunamayanlar / açıklama */
  notes: string[];
}

/** İstekte geçen firmayı bulur: kelime, firma adının ilk kelimesiyle başlıyorsa ("gemfaya" → Gemfa Kazan) */
function findCustomer(words: string[], customers: Customer[], quotes: Quote[]): { name: string; city?: string; word: string; parts: string[] } | null {
  const names = new Map<string, { name: string; city?: string }>();
  for (const c of customers) names.set(foldTr(c.name.trim()), { name: c.name, city: c.city });
  for (const q of quotes) if (q.customerName && !names.has(foldTr(q.customerName.trim()))) names.set(foldTr(q.customerName.trim()), { name: q.customerName });
  let best: { name: string; city?: string; word: string; parts: string[]; len: number } | null = null;
  for (const [k, v] of names) {
    const first = k.split(/\s+/)[0];
    if (!first || first.length < 4) continue;
    const w = words.find(x => x.startsWith(first) && x.length - first.length <= 4);
    if (w && (!best || first.length > best.len)) best = { ...v, word: w, parts: k.split(/\s+/).filter(p => p.length >= 3), len: first.length };
  }
  return best;
}

/**
 * Firmanın geçmiş tekliflerinde ürünü bulur. Ölçüler (2", 22-36, 14 mm) birebir tutmalı; kelimelerin çoğu tutmalı
 * ("22-36 kelepçe" → "22-36 C TİPİ 14 MM AYARLI KELEPÇE TORK"). En çok kelimesi tutan, eşitse en yeni teklif seçilir.
 */
function findInHistory(product: string, history: Quote[]): { it: QuoteItem; q: Quote } | null {
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // DN/PN bitişik ya da ayrı yazılabilir: "dn32" = "Q 32" = "DN 32", "pn25" = "PN 25" = "PN-25"
  const pns = [...product.matchAll(/\bpn\s*-?\s*(\d+)/g)].map(m => new RegExp(`pn\\s*-?\\s*(\\d+\\s*-\\s*)?${m[1]}([^0-9]|$)`));
  const rest = product.replace(/\bpn\s*-?\s*\d+/g, ' ').replace(/\b(dn|q|ø)\s*-?\s*(\d+)/g, ' $2 ');
  const { sizes } = splitSizes(rest);
  const toks = rest.replace(/\d[\d\s/]*"/g, ' ').split(/\s+/).filter(Boolean);
  const nums = toks.filter(t => /\d/.test(t)).map(t => new RegExp(`(^|[^0-9])${esc(t)}([^0-9]|$)`));
  const words = toks.filter(t => !/\d/.test(t) && t.length >= 2);
  const need = Math.max(1, Math.ceil(words.length / 2));
  let best: { it: QuoteItem; q: Quote; score: number; len: number } | null = null;
  for (const q of history) {
    for (const it of q.items || []) {
      if (!(it.unitPrice > 0)) continue;
      const name = foldTr(`${it.productName} ${it.code || ''}`);
      if (!sizes.every(r => r.test(name)) || !nums.every(r => r.test(name)) || !pns.every(r => r.test(name))) continue;
      const score = words.filter(w => name.includes(w) || (w.length >= 5 && name.includes(w.slice(0, 4)))).length;
      // Eşit puanda adı kısa olan (fazladan kelimesi az) seçilir: "flanş" → "düz flanş", "flanşlı pislik tutucu" değil
      const len = foldTr(it.productName).split(/\s+/).length;
      if (score >= need && (!best || score > best.score || (score === best.score && len < best.len))) best = { it, q, score, len };
    }
  }
  return best;
}

export async function quickDraft(request: string, quotes: Quote[], customers: Customer[]): Promise<QuickDraft> {
  const f = foldTr(request).replace(/(\d)\s*(''|”|″)/g, '$1"');
  const words = f.split(/[^a-z0-9"/.,-]+/).filter(Boolean);
  const cust = findCustomer(words, customers, quotes);
  const notes: string[] = [];
  if (!cust) notes.push('firma bulunamadı');

  // Kalemler: "ve", virgül ya da satır sonuyla ayrılır
  const segs = f.split(/\n|,(?!\d)|;|\sve\s|\s\+\s/).map(s => s.trim()).filter(Boolean);
  const allQuotes = [...quotes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const history = allQuotes.filter(q => !cust || foldTr(q.customerName.trim()) === foldTr(cust.name.trim()));

  // Tercihli ürün kuralları ("genleşme" → VTSKGD…): talep okumadaki ayarın cihazdaki kopyası
  let prefs: PrefRule[] = [];
  try { prefs = JSON.parse(localStorage.getItem(`enyap-setting-${PREF_KEY}`) || '[]'); } catch { /* yok */ }
  const items: QuoteItem[] = [];
  let resolved = 0;
  for (const seg of segs) {
    const qm = QTY.exec(seg);
    const qty = qm ? Number(qm[1].replace(',', '.')) : 1;
    const unit = qm ? UNIT[qm[2].replace('.', '')] || 'Adet' : 'Adet';
    const product = (qm ? seg.replace(qm[0], ' ') : seg).split(/\s+/)
      // Firma adının kelimeleri ("emin mekaniğe" → emin, mekanik) ürüne karışmasın
      .filter(w => w && w !== cust?.word && !cust?.parts.some(p => w.startsWith(p.slice(0, Math.max(4, p.length - 1)))) && !STOP.test(w))
      .join(' ').trim();
    if (!/[a-z]{2}/.test(product)) continue;
    const id = `it-${Date.now()}-${items.length}`;
    // 1) Bu firmaya en son verilen aynı ürün (fiyat ve iskontosuyla)
    const hit = cust ? findInHistory(product, history) : null;
    if (hit) {
      items.push({ ...hit.it, id, quantity: qty, totalPrice: 0, currency: hit.it.currency || hit.q.currency || 'TRY' });
      resolved++;
      continue;
    }
    // 1b) Diğer firmalara verilmiş aynı ürün: kod ve liste fiyatı oradan, iskonto fiyat listesinden (firmaya özel iskonto taşınmaz)
    const other = findInHistory(product, allQuotes);
    if (other) {
      const code = other.it.code;
      const disc = code ? (await listDiscounts([code]).catch(() => new Map<string, number>())).get(code) || 0 : 0;
      // Fiyat katalogdaki güncel fiyattan (eski teklifteki fiyat zamdan önce kalmış olabilir)
      const cat = code ? (await searchMaterials(code, { field: 'code', limit: 5 }).catch(() => ({ items: [] as Material[] }))).items.find(x => x.code === code) : undefined;
      items.push({
        ...other.it, id, quantity: qty, discount: disc, totalPrice: 0,
        ...(cat && cat.price > 0 ? { unitPrice: cat.price, currency: cat.currency } : { currency: other.it.currency || other.q.currency || 'TRY' }),
      });
      notes.push(`"${other.it.productName}" başka firmanın teklifinden alındı, fiyatı kontrol edin`);
      resolved++;
      continue;
    }
    // 2) Katalog: ölçüsüyle tek aday varsa
    const m = await matchLine({ text: seg, item: product, qty, unit, unsure: false }, prefs).catch(() => null);
    const pick: Material | undefined = m?.pick ? m.cands.find(c => c.code === m.pick) : undefined;
    if (pick) {
      const disc = (await listDiscounts([pick.code]).catch(() => new Map<string, number>())).get(pick.code) || 0;
      items.push({ id, code: pick.code, productName: pick.name, quantity: qty, unit: (pick.unit as QuoteItem['unit']) || unit, unitPrice: pick.price, currency: pick.currency, discount: disc, vatRate: pick.vatRate ?? 20, totalPrice: 0 });
      resolved++;
    } else {
      items.push({ id, productName: product, quantity: qty, unit, unitPrice: 0, discount: 0, vatRate: 20, totalPrice: 0, notes: 'Katalogda seçin' });
      notes.push(`"${product}" için ürün seçilmeli`);
    }
  }
  if (!items.length) notes.push('ürün bulunamadı');
  return {
    draft: { ...(cust ? { customerName: cust.name, ...(cust.city ? { city: cust.city } : {}) } : {}), ...(items.length ? { items } : {}) },
    complete: !!cust && items.length > 0 && resolved === items.length,
    notes,
  };
}
