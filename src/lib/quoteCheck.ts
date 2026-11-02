/**
 * Mikro teklif kontrolü: PDF'teki her kalemi bizim katalog ve fiyat listeleriyle karşılaştırır.
 * Liste iskontosu (fiyat listesine girilen oran) müşteriye verilmesi gereken iskontodur;
 * teklifte bundan fazla ya da eksik iskonto, farklı liste fiyatı ve katalogda olmayan ürün uyarılır.
 */
import { supabase } from './supabase';
import { PdfQuote, catalogCode } from './pdfQuote';
import { Quote, QuoteItem } from '../types';

export type CheckLevel = 'ok' | 'warn' | 'error';

export interface CheckIssue { level: Exclude<CheckLevel, 'ok'>; text: string }

export interface CheckRow {
  item: QuoteItem;
  code?: string;
  /** Kalemin bağlı olduğu fiyat listesi */
  list?: { name: string; date: string; price: number; currency: string; discount: number };
  issues: CheckIssue[];
  /** Doğru iskontoyla net tutar farkı (+: müşteriye fazla indirim) */
  loss?: number;
  level: CheckLevel;
  /** Aynı ürünün en son verildiği teklif (önce aynı firma) */
  history?: { customer: string; date: string; quoteNumber: string; discount: number; own: boolean; price?: number; currency?: string };
  /** Hiçbir listeye bağlı değilse: firma listelerinde benzer (bağsız) kalemler */
  suggest?: Suggestion[];
  /** Öneri kabul edilip bağlandıysa: "liste · kalem" */
  linked?: string;
}

export interface Suggestion { id: number; list: string; name: string; price: number; currency: string; discount: number; score: number; /** Liste fiyatı teklifteki birim fiyatla birebir */ priceHit?: boolean }

interface ListHit { list_id: string; price: number; currency: string; our_code: string }

const fmt = (v: number, cur = '') => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? ` ${cur === 'TRY' ? 'TL' : cur}` : '');
const pct = (v: number) => `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

export async function checkQuote(pdf: PdfQuote): Promise<CheckRow[]> {
  const codes = await Promise.all(pdf.items.map(it => (it.code ? Promise.resolve(it.code) : catalogCode(it.productName))));
  const wanted = [...new Set(codes.filter(Boolean) as string[])];

  const hits = new Map<string, ListHit[]>();
  const lists = new Map<string, { name: string; list_date: string; discount: number }>();
  if (wanted.length) {
    const { data, error } = await supabase.from('supplier_items').select('list_id,price,currency,our_code').in('our_code', wanted);
    if (error) throw error;
    for (const r of (data || []) as ListHit[]) {
      const a = hits.get(r.our_code) || [];
      a.push({ ...r, price: Number(r.price) });
      hits.set(r.our_code, a);
    }
    const ids = [...new Set((data || []).map(r => r.list_id as string))];
    if (ids.length) {
      const { data: ls, error: e2 } = await supabase.from('supplier_lists').select('id,name,list_date,discount').in('id', ids);
      if (e2) throw e2;
      for (const l of ls || []) lists.set(l.id, { name: l.name, list_date: l.list_date || '', discount: Number(l.discount || 0) });
    }
  }

  return pdf.items.map((item, i) => {
    const code = codes[i];
    const issues: CheckIssue[] = [];
    const cur = item.currency || 'TRY';
    if (!code) {
      issues.push({ level: 'error', text: 'Ürün katalogda bulunamadı: ad Mikro\'daki ürün kartıyla aynı değil ya da yeni ürün' });
      return { item, issues, level: 'error' as const };
    }
    const cands = (hits.get(code) || []).filter(h => lists.has(h.list_id));
    if (!cands.length) {
      issues.push({ level: 'warn', text: 'Ürün hiçbir fiyat listesine bağlı değil; fiyat ve iskonto kontrol edilemedi' });
      return { item, code, issues, level: 'warn' as const };
    }
    // Aynı ürün birden çok listede olabilir: teklif fiyatıyla tutan liste, yoksa aynı para birimli olan
    const close = (h: ListHit) => h.currency === cur && Math.abs(h.price - item.unitPrice) <= Math.max(0.011, h.price * 0.005);
    const hit = cands.find(close) || cands.find(h => h.currency === cur) || cands[0];
    const l = lists.get(hit.list_id)!;
    const list = { name: l.name, date: l.list_date, price: hit.price, currency: hit.currency, discount: l.discount };

    if (hit.currency !== cur) {
      issues.push({ level: 'warn', text: `Para birimi farklı: listede ${hit.currency === 'TRY' ? 'TL' : hit.currency}, teklifte ${cur === 'TRY' ? 'TL' : cur}` });
    } else if (!close(hit)) {
      issues.push({ level: 'warn', text: `Liste fiyatı ${fmt(hit.price, cur)}, teklifte ${fmt(item.unitPrice, cur)} (${l.name} ${l.list_date})` });
    }

    let loss: number | undefined;
    if (l.discount > 0) {
      const diff = Math.round((item.discount - l.discount) * 100) / 100;
      if (Math.abs(diff) >= 0.05) {
        const base = item.quantity * item.unitPrice;
        loss = Math.round(base * (diff / 100) * 100) / 100;
        issues.push(diff > 0
          ? { level: 'error', text: `Fazla iskonto: ${pct(item.discount)} verilmiş, ${l.name} için ${pct(l.discount)} olmalı · müşteriye ${fmt(loss, cur)} fazla indirim` }
          : { level: 'error', text: `Eksik iskonto: ${pct(item.discount)} verilmiş, ${l.name} için ${pct(l.discount)} olmalı · müşteriye ${fmt(-loss, cur)} pahalı` });
      }
    } else if (item.discount > 0) {
      issues.push({ level: 'warn', text: `${l.name} listesine iskonto girilmemiş; teklifte ${pct(item.discount)} var, kontrol edilemedi` });
    }
    const level: CheckLevel = issues.some(x => x.level === 'error') ? 'error' : issues.length ? 'warn' : 'ok';
    return { item, code, list, issues, loss, level };
  });
}

/**
 * Okunan kalemlerin toplamı PDF'teki genel toplamla tutuyor mu (para birimi bazında, KDV dahil).
 * Tutmuyorsa bir satır okunamamış olabilir: son satır atlanınca sıra numarasında boşluk olmadığı için
 * başka türlü fark edilmez.
 */
export function totalsMismatch(pdf: PdfQuote): string[] {
  if (!pdf.totals) return [];
  const sum: Record<string, number> = { USD: 0, EUR: 0, TRY: 0 };
  for (const it of pdf.items) sum[it.currency || 'TRY'] = (sum[it.currency || 'TRY'] || 0) + it.totalPrice;
  const fmt = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const out: string[] = [];
  for (const k of ['TRY', 'USD', 'EUR'] as const) {
    const want = pdf.totals[k];
    if (Math.abs(sum[k] - want) > Math.max(0.05, want * 0.002)) {
      out.push(`PDF'teki ${k === 'TRY' ? 'TL' : k} genel toplamı ${fmt(want)}, okunan kalemlerin toplamı ${fmt(Math.round(sum[k] * 100) / 100)}: eksik okunan kalem olabilir, PDF ile karşılaştırın`);
    }
  }
  return out;
}

/**
 * Geçmişle karşılaştırma: PDF'teki her kalemin iskontosu, aynı ürünün daha önceki tekliflerdeki iskontosuyla
 * kıyaslanır (ayrı bir hafıza tutulmaz; sistemdeki teklifler kullanılır). Önce aynı firmaya en son verilen,
 * o yoksa herhangi bir firmaya en son verilen esas alınır. Aynı teklif numarası (revizyon) hariç.
 */
export function compareWithHistory(rows: CheckRow[], quotes: Quote[], customerName: string | null, quoteNumber: string | null): CheckRow[] {
  const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  const custKey = customerName ? fold(customerName).split(' ')[0] : '';
  const sameCust = (name: string) => !!custKey && custKey.length >= 3 && fold(name).startsWith(custKey);
  const sorted = quotes.filter(q => !quoteNumber || q.quoteNumber !== quoteNumber)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const day = (iso: string) => (iso || '').slice(0, 10).split('-').reverse().join('.');
  return rows.map(r => {
    const key = r.code || r.item.code;
    const nameKey = fold(r.item.productName);
    const same = (it: QuoteItem) => (key ? it.code === key : fold(it.productName) === nameKey);
    let own: { q: Quote; it: QuoteItem } | null = null;
    let any: { q: Quote; it: QuoteItem } | null = null;
    for (const q of sorted) {
      const it = (q.items || []).find(same);
      if (!it) continue;
      if (!any) any = { q, it };
      if (sameCust(q.customerName)) { own = { q, it }; break; }
    }
    const issues = [...r.issues];
    const now = r.item.discount || 0;
    const ref = own || any;
    const prevCur = ref ? ref.it.currency || ref.q.currency || 'TRY' : undefined;
    if (ref) {
      const was = ref.it.discount || 0;
      const who = own ? 'Bu firmaya' : `${ref.q.customerName} firmasına`;
      if (Math.abs(was - now) >= 0.05) {
        issues.push({ level: 'warn', text: `${who} en son ${day(ref.q.createdAt)} tarihli ${ref.q.quoteNumber} teklifinde ${pct(was)} iskonto verilmiş, bu teklifte ${pct(now)}` });
      }
      // Birim (liste) fiyat da karşılaştırılır: aynı para biriminde %0,5'ten fazla fark uyarılır
      const cur = r.item.currency || 'TRY';
      const was$ = ref.it.unitPrice || 0, now$ = r.item.unitPrice || 0;
      if (was$ > 0 && now$ > 0) {
        if (prevCur !== cur) {
          issues.push({ level: 'warn', text: `${who} en son ${ref.q.quoteNumber} teklifinde ${fmt(was$, prevCur)} verilmiş, bu teklifte ${fmt(now$, cur)} (para birimi farklı)` });
        } else if (Math.abs(now$ - was$) > Math.max(0.011, was$ * 0.005)) {
          const ch = Math.round(((now$ - was$) / was$) * 1000) / 10;
          issues.push({ level: 'warn', text: `Birim fiyat: ${who.toLocaleLowerCase('tr')} en son ${ref.q.quoteNumber} teklifinde ${fmt(was$, cur)}, bu teklifte ${fmt(now$, cur)} (${ch > 0 ? '+' : '-'}${pct(Math.abs(ch))})` });
        }
      }
    }
    const level: CheckLevel = issues.some(x => x.level === 'error') ? 'error' : issues.length ? 'warn' : 'ok';
    return { ...r, issues, level, history: ref ? { customer: ref.q.customerName, date: ref.q.createdAt, quoteNumber: ref.q.quoteNumber, discount: ref.it.discount || 0, own: !!own, price: ref.it.unitPrice, currency: prevCur } : undefined };
  });
}

/**
 * Hiçbir fiyat listesine bağlı olmayan kalemler için öneri: firma listelerindeki bağsız kalemlerden en benzer 2'si
 * (veritabanında pg_trgm benzerliği + birim fiyat birebir + ölçü/marka/zıt özellik kuralları, yapay zekâ kullanılmaz).
 */
export async function suggestMatches(rows: CheckRow[]): Promise<CheckRow[]> {
  const want = rows.filter(r => r.code && !r.list && r.issues.some(x => /fiyat listesine bağlı değil/.test(x.text)));
  if (!want.length) return rows;
  // Birim fiyat da gönderilir: teklifteki liste fiyatıyla birebir tutan firma kalemi öne alınır
  const { data, error } = await supabase.rpc('supplier_suggest', {
    p: want.map(r => ({ code: r.code, name: r.item.productName, price: r.item.unitPrice || null, currency: r.item.currency || 'TRY' })),
  });
  if (error) return rows;
  const by = new Map<string, Suggestion[]>();
  for (const x of (data || []) as { code: string; items: (Suggestion & { price_hit?: boolean })[] }[]) {
    const all = x.items.map(s => ({ ...s, price: Number(s.price), discount: Number(s.discount || 0), priceHit: !!s.price_hit }));
    // Fiyatı tutan varsa yalnız onlar gösterilir (sadece adı benzeyenler gürültü olur)
    by.set(x.code, all.some(s => s.priceHit) ? all.filter(s => s.priceHit) : all);
  }
  return rows.map(r => (r.code && !r.list && by.has(r.code) ? { ...r, suggest: by.get(r.code) } : r));
}
