/**
 * Mikro teklif kontrolü: PDF'teki kalemleri fiyat listeleri ve geçmiş tekliflerle karşılaştırır. Uyarı verir, kaydı engellemez;
 * kırmızı (hata) yoktur: "warn" sarı (bakılması gereken), "info" gri (bilgi).
 *
 * Kurallar (697 teklifin analizinden):
 * - Fiyat: teklifteki birim fiyat güncel liste fiyatıyla karşılaştırılır. Liste güncellenince Mikro'daki fiyatlar bir süre eski kalır
 *   (ya da tersi): aynı markanın birden çok kaleminde fark aynı oransa bu tek tek uyarı değil, markaya tek bir "liste değişmiş" notudur.
 *   Eski tekliflerdeki fiyatlarla karşılaştırma yalnız listeye bağlı olmayan ürünlerde yapılır (listesi olanda eski fiyat zaten eskidir).
 * - İskonto marka (fiyat listesi) bazındadır: aynı teklifte aynı markanın kalemleri aynı iskontoyu alır (%95). Beklenen iskonto önce bu
 *   firmanın o markada en son aldığı (%63 birebir), yoksa markanın son 6 aydaki aralığı, yoksa liste iskontosu. Fazlası sarı, azı gri.
 *   Ayrı hafıza tutulmaz; geçmiş teklifler anında okunur (`quote_brand_ref`).
 * - Vade: peşin (PEŞİN / KREDİ KARTI) teklif yalnız peşin tekliflerle, vadeli (GÜN'lü ya da vadesi boş) yalnız vadelilerle karşılaştırılır.
 */
import { supabase } from './supabase';
import { PdfQuote, catalogCode } from './pdfQuote';
import { Quote, QuoteItem } from '../types';

export type CheckLevel = 'ok' | 'info' | 'warn';

export interface CheckIssue { level: Exclude<CheckLevel, 'ok'>; text: string; kind?: 'price' | 'discount' | 'nolist' | 'catalog' }

export interface CheckRow {
  item: QuoteItem;
  code?: string;
  /** Kalemin bağlı olduğu fiyat listesi */
  list?: { id: string; name: string; date: string; price: number; currency: string; discount: number };
  issues: CheckIssue[];
  level: CheckLevel;
  /** Kurala göre beklenen iskonto (sarı uyarıda "düzelt" düğmesi bunu yazar) */
  expected?: number;
  /** Aynı ürünün en son verildiği teklif (önce aynı firma) */
  history?: { customer: string; date: string; quoteNumber: string; discount: number; own: boolean; price?: number; currency?: string; /** Aynı vadede geçmiş yoksa diğer vadedeki teklif (yalnız bilgi): 'peşin' / 'vadeli' */ otherTerm?: string };
  /** Hiçbir listeye bağlı değilse: firma listelerinde benzer (bağsız) kalemler */
  suggest?: Suggestion[];
  /** Öneri kabul edilip bağlandıysa: "liste · kalem" */
  linked?: string;
}

/** Marka (fiyat listesi) bazında not: iskonto kuralı ve toplu fiyat farkı */
export interface BrandNote { list: string; level: Exclude<CheckLevel, 'ok'>; text: string }

export interface Suggestion { id: number; list: string; name: string; price: number; currency: string; discount: number; score: number; /** Liste fiyatı teklifteki birim fiyatla birebir */ priceHit?: boolean }

interface ListHit { list_id: string; price: number; currency: string; our_code: string }

const fmt = (v: number, cur = '') => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? ` ${cur === 'TRY' ? 'TL' : cur}` : '');
const pct = (v: number) => `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
const day = (iso: string) => (iso || '').slice(0, 10).split('-').reverse().join('.');
const levelOf = (issues: CheckIssue[]): CheckLevel => (issues.some(x => x.level === 'warn') ? 'warn' : issues.length ? 'info' : 'ok');
const priceEq = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.011, b * 0.005);

export async function checkQuote(pdf: Pick<PdfQuote, 'items'>): Promise<CheckRow[]> {
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
    const code = codes[i] || undefined;
    const issues: CheckIssue[] = [];
    const cur = item.currency || 'TRY';
    if (!code) {
      issues.push({ level: 'warn', kind: 'catalog', text: 'Ürün katalogda bulunamadı: ad Mikro\'daki ürün kartıyla aynı değil ya da yeni ürün' });
      return { item, issues, level: 'warn' as const };
    }
    const cands = (hits.get(code) || []).filter(h => lists.has(h.list_id));
    if (!cands.length) {
      issues.push({ level: 'warn', kind: 'nolist', text: 'Ürün hiçbir fiyat listesine bağlı değil; fiyat ve iskonto listeyle kontrol edilemedi' });
      return { item, code, issues, level: 'warn' as const };
    }
    // Aynı ürün birden çok listede olabilir: teklif fiyatıyla tutan liste, yoksa aynı para birimli olan
    const close = (h: ListHit) => h.currency === cur && priceEq(item.unitPrice, h.price);
    const hit = cands.find(close) || cands.find(h => h.currency === cur) || cands[0];
    const l = lists.get(hit.list_id)!;
    const list = { id: hit.list_id, name: l.name, date: l.list_date, price: hit.price, currency: hit.currency, discount: l.discount };
    if (hit.currency !== cur) {
      issues.push({ level: 'warn', kind: 'price', text: `Para birimi farklı: listede ${hit.currency === 'TRY' ? 'TL' : hit.currency}, teklifte ${cur === 'TRY' ? 'TL' : cur}` });
    } else if (!close(hit)) {
      issues.push({ level: 'warn', kind: 'price', text: `Liste fiyatı ${fmt(hit.price, cur)}, teklifte ${fmt(item.unitPrice, cur)} (${l.name} ${l.list_date})` });
    }
    return { item, code, list, issues, level: levelOf(issues) };
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
 * Aynı ürünün geçmişi: en son verildiği teklif (önce aynı firma, yoksa herhangi bir firma; aynı teklif numarası hariç).
 * Satırda "önceki" olarak gösterilir. Uyarı yalnız listeye bağlı olmayan ürünlerde üretilir: listesi olanın iskontosu marka kuralıyla,
 * fiyatı güncel listeyle kontrol edilir (eski teklifteki fiyat liste değişince zaten eskidir).
 */
/** Vade sınıfı: peşin (PEŞİN, KREDİ KARTI) ya da vadeli (GÜN'lü; vadesi boş eski teklifler de vadeli sayılır) */
export type TermClass = 'cash' | 'term';
export const termClass = (t?: string | null): TermClass => (/^\s*(pe|kred)/i.test(t || '') ? 'cash' : 'term');
const termName = (c: TermClass) => (c === 'cash' ? 'peşin' : 'vadeli');

export function compareWithHistory(rows: CheckRow[], quotes: Quote[], customerName: string | null, quoteNumber: string | null, term: TermClass | null = null): CheckRow[] {
  const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  const custKey = customerName ? fold(customerName).split(' ')[0] : '';
  const sameCust = (name: string) => !!custKey && custKey.length >= 3 && fold(name).startsWith(custKey);
  const all = quotes.filter(q => !quoteNumber || q.quoteNumber !== quoteNumber)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return rows.map(r => {
    const key = r.code || r.item.code;
    const nameKey = fold(r.item.productName);
    const same = (it: QuoteItem) => (key ? it.code === key : fold(it.productName) === nameKey);
    // Önce aynı vadedeki teklifler; yoksa diğer vadedeki son teklif yalnız bilgi olarak gösterilir (uyarı üretmez)
    const find = (list: Quote[]) => {
      let own: { q: Quote; it: QuoteItem } | null = null, any: { q: Quote; it: QuoteItem } | null = null;
      for (const q of list) {
        const it = (q.items || []).find(same);
        if (!it) continue;
        if (!any) any = { q, it };
        if (sameCust(q.customerName)) { own = { q, it }; break; }
      }
      return { own, any };
    };
    let { own, any } = find(term ? all.filter(q => termClass(q.paymentTerm) === term) : all);
    let otherTerm: string | undefined;
    if (!own && !any && term) {
      ({ own, any } = find(all));
      if (own || any) otherTerm = termName(term === 'cash' ? 'term' : 'cash');
    }
    const ref = own || any;
    if (!ref) return r;
    const prevCur = ref.it.currency || ref.q.currency || 'TRY';
    const history = { customer: ref.q.customerName, date: ref.q.createdAt, quoteNumber: ref.q.quoteNumber, discount: ref.it.discount || 0, own: !!own, price: ref.it.unitPrice, currency: prevCur, otherTerm };
    if (r.list || otherTerm) return { ...r, history };
    const issues = [...r.issues];
    const who = own ? 'Bu firmaya' : `${ref.q.customerName} firmasına`;
    const was = ref.it.discount || 0, now = r.item.discount || 0;
    if (Math.abs(was - now) >= 0.05) {
      issues.push({ level: now > was ? 'warn' : 'info', kind: 'discount', text: `${who} en son ${day(ref.q.createdAt)} tarihli ${ref.q.quoteNumber} teklifinde ${pct(was)} iskonto verilmiş, bu teklifte ${pct(now)}` });
    }
    const cur = r.item.currency || 'TRY';
    const was$ = ref.it.unitPrice || 0, now$ = r.item.unitPrice || 0;
    if (was$ > 0 && now$ > 0 && (prevCur !== cur || !priceEq(now$, was$))) {
      const ch = prevCur === cur ? Math.round(((now$ - was$) / was$) * 1000) / 10 : null;
      issues.push({ level: 'info', kind: 'price', text: `Birim fiyat: ${who.toLocaleLowerCase('tr')} en son ${ref.q.quoteNumber} teklifinde ${fmt(was$, prevCur)}, bu teklifte ${fmt(now$, cur)}${ch !== null ? ` (${ch > 0 ? '+' : '-'}${pct(Math.abs(ch))})` : ''}` });
    }
    return { ...r, issues, level: levelOf(issues), history };
  });
}

type BrandRef = { list: string; own: { quote: string; date: string; discount: number } | null; range: { n: number; lo: number; hi: number; p25: number; p75: number } | null };

/**
 * Marka kuralları: toplu fiyat farkı (liste değişmiş) ve marka iskontosu. Satırların fiyat uyarılarını gerektiğinde markaya tek nota
 * çevirir, iskonto için beklenen değeri (expected) yazar.
 */
export async function applyBrandRules(rows: CheckRow[], customerName: string | null, quoteNumber: string | null, term: TermClass | null = null): Promise<{ rows: CheckRow[]; notes: BrandNote[] }> {
  const ids = [...new Set(rows.filter(r => r.list).map(r => r.list!.id))];
  if (!ids.length) return { rows, notes: [] };
  const refs = new Map<string, BrandRef>();
  const { data } = await supabase.rpc('quote_brand_ref', { p_customer: customerName || '', p_lists: ids, p_exclude: quoteNumber || null, p_term: term });
  const tw = term ? ` ${termName(term)}` : '';
  for (const x of (data || []) as BrandRef[]) refs.set(x.list, x);
  const notes: BrandNote[] = [];
  const out = rows.map(r => ({ ...r, issues: [...r.issues] }));

  for (const id of ids) {
    const group = out.filter(r => r.list?.id === id);
    const brand = group[0].list!.name;
    const listDate = group[0].list!.date;

    // 1) Fiyat: farkı aynı oranda olan kalemler → liste değişmiş (tek not, gri)
    const diff = group.filter(r => r.issues.some(x => x.kind === 'price') && r.list!.currency === (r.item.currency || 'TRY') && r.list!.price > 0);
    const ratios = diff.map(r => r.item.unitPrice / r.list!.price).sort((a, b) => a - b);
    const med = ratios[Math.floor(ratios.length / 2)];
    const same = diff.filter(r => Math.abs(r.item.unitPrice / r.list!.price - med) <= 0.015);
    if (same.length >= 2 || (same.length === 1 && group.length === 1 && same[0].history?.price && priceEq(same[0].item.unitPrice, same[0].history.price))) {
      const ch = Math.round((med - 1) * 1000) / 10;
      notes.push({ list: brand, level: 'info', text: ch < 0
        ? `${brand}: ${same.length} kalemde teklif fiyatı güncel listeden (${listDate}) ${pct(-ch)} düşük. Liste yenilenmiş, Mikro'daki fiyatlar eski olabilir.`
        : `${brand}: ${same.length} kalemde teklif fiyatı listeden (${listDate}) ${pct(ch)} yüksek. Mikro'da yeni fiyat var, sistemdeki liste eski olabilir: yeni listeyi yükleyin.` });
      for (const r of same) r.issues = r.issues.filter(x => x.kind !== 'price');
    }

    // 2) İskonto: markanın bu teklifteki iskontosu (en çok kullanılan) ve kalem farkları
    const count = new Map<number, number>();
    for (const r of group) count.set(r.item.discount || 0, (count.get(r.item.discount || 0) || 0) + 1);
    const mode = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (count.size > 1) {
      for (const r of group) if (Math.abs((r.item.discount || 0) - mode) >= 0.05) {
        r.issues.push({ level: 'warn', kind: 'discount', text: `Aynı teklifte ${brand} kalemlerinin çoğunda ${pct(mode)}, bu kalemde ${pct(r.item.discount || 0)}` });
        r.expected = mode;
      }
    }
    const ref = refs.get(id);
    const ld = group[0].list!.discount;
    let expected: number | null = null, why = '';
    if (ref?.own) { expected = Number(ref.own.discount); why = `bu firmaya en son ${day(ref.own.date)} tarihli${tw} ${ref.own.quote} teklifinde ${pct(expected)} verilmiş`; }
    else if (ref?.range && ref.range.n >= 3) {
      const { lo, hi, p25, p75 } = ref.range;
      if (mode > Number(hi) + 0.05) { expected = Number(p75); why = `son 6 ayda${tw} tekliflerde en fazla ${pct(Number(hi))} verilmiş (genelde ${pct(Number(p25))}–${pct(Number(p75))})`; }
      else notes.push({ list: brand, level: 'info', text: `${brand}: bu firmaya daha önce${tw} verilmemiş; son 6 ayda${tw} tekliflerde ${pct(Number(lo))}–${pct(Number(hi))} (genelde ${pct(Number(p25))}–${pct(Number(p75))}), bu teklifte ${pct(mode)}.` });
    } else if (ld > 0 && term === 'cash') {
      // Peşin geçmişi yok: liste iskontosu genelde vadeli içindir, peşinde fazlası olağan (yalnız bilgi)
      if (Math.abs(mode - ld) >= 0.05) notes.push({ list: brand, level: 'info', text: `${brand}: peşin teklif geçmişi yok; liste iskontosu ${pct(ld)}, bu peşin teklifte ${pct(mode)}.` });
    } else if (ld > 0) { expected = ld; why = `liste iskontosu ${pct(ld)}`; }
    if (expected !== null && Math.abs(mode - expected) >= 0.05) {
      const more = mode > expected;
      notes.push({ list: brand, level: more ? 'warn' : 'info', text: `${brand}: ${why}, bu teklifte ${pct(mode)}${more ? ' (fazla)' : ''}.` });
      // Fazla verilmişse markanın tüm kalemleri beklenen iskontoya çekilebilir
      if (more) for (const r of group) r.expected = expected;
    }
    for (const r of group) r.level = levelOf(r.issues);
  }
  return { rows: out, notes };
}

/**
 * Hiçbir fiyat listesine bağlı olmayan kalemler için öneri: firma listelerindeki bağsız kalemlerden en benzer 5'i
 * (veritabanında pg_trgm benzerliği + birim fiyat birebir + ölçü/marka/zıt özellik kuralları, yapay zekâ kullanılmaz).
 */
export async function suggestMatches(rows: CheckRow[]): Promise<CheckRow[]> {
  const want = rows.filter(r => r.code && !r.list && r.issues.some(x => x.kind === 'nolist'));
  if (!want.length) return rows;
  // Birim fiyat da gönderilir: teklifteki liste fiyatıyla birebir tutan firma kalemi öne alınır
  const { data, error } = await supabase.rpc('supplier_suggest', {
    p: want.map(r => ({ code: r.code, name: r.item.productName, price: r.item.unitPrice || null, currency: r.item.currency || 'TRY' })),
  });
  if (error) return rows;
  const by = new Map<string, Suggestion[]>();
  for (const x of (data || []) as { code: string; items: (Suggestion & { price_hit?: boolean })[] }[]) {
    by.set(x.code, x.items.map(s => ({ ...s, price: Number(s.price), discount: Number(s.discount || 0), priceHit: !!s.price_hit })));
  }
  return rows.map(r => (r.code && !r.list && by.has(r.code) ? { ...r, suggest: by.get(r.code) } : r));
}

/** Tüm kontrol: liste + geçmiş + marka kuralları + eşleşme önerisi */
export async function runQuoteCheck(items: QuoteItem[], quotes: Quote[], customerName: string | null, quoteNumber: string | null, paymentTerm?: string | null): Promise<{ rows: CheckRow[]; notes: BrandNote[] } | null> {
  const listed = await checkQuote({ items }).catch(() => null);
  if (!listed) return null;
  const term = paymentTerm ? termClass(paymentTerm) : null;
  const hist = compareWithHistory(listed, quotes, customerName, quoteNumber, term);
  const ruled = await applyBrandRules(hist, customerName, quoteNumber, term).catch(() => ({ rows: hist, notes: [] as BrandNote[] }));
  return { rows: await suggestMatches(ruled.rows), notes: ruled.notes };
}
