/**
 * Firma fiyat listesi içe aktarma çekirdeği: kalemlere ayırma, kaydetme, zam özeti ve eşleştirme.
 * Hem uygulamada hem sunucuda (Supabase Edge Function, uygulama kapalıyken) aynı kod çalışır;
 * veritabanı istemcisi ve yapay zeka çağrısı configure() ile verilir.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Currency } from './money';

type AiItem = { code: string; name: string; price: number; unit: string; grp?: string; currency: Currency };
let supabase: SupabaseClient;
let aiPriceListPage: (text: string) => Promise<AiItem[] | null> = async () => null;

export function configure(opts: { sb: SupabaseClient; ai: (text: string) => Promise<AiItem[] | null> }) {
  supabase = opts.sb;
  aiPriceListPage = opts.ai;
}

/** Yapay zeka cevabındaki kalemleri düzenler (uygulama ve sunucu ortak) */
export function cleanAiItems(items: any[]): AiItem[] {
  const cur = (c: string): Currency => (/usd|\$/i.test(c) ? 'USD' : /eur|€/i.test(c) ? 'EUR' : 'TRY');
  return items
    .map((x: any) => ({
      code: String(x.code || '').trim().slice(0, 40),
      name: String(x.name || '').trim().slice(0, 200),
      price: Math.round(Number(x.price) * 10000) / 10000,
      unit: 'Adet',
      grp: String(x.group || '').trim().slice(0, 120) || undefined,
      currency: cur(String(x.currency || '')),
    }))
    .filter((x: any) => x.name.length >= 3 && x.price > 0 && x.price < 10_000_000);
}

async function deleteSupplierList(id: string) {
  const { error } = await supabase.from('supplier_lists').delete().eq('id', id);
  if (error) throw error;
}

/** Yeni liste yüklenince önceki fiyatlarla karşılaştırma */
export interface PriceDiff {
  at: string;
  compared: number;
  up: number;
  down: number;
  /** Zamlanan kalemlerde ortalama artış (%) */
  avgUp: number;
  /** Değişmeyenler dahil tüm karşılaştırılan kalemlerde ortalama değişim (%) */
  avgAll: number;
  top: { name: string; old: number; now: number; pct: number }[];
}

/**
 * Okunan PDF yazısından firma listesini kendiliğinden oluşturur: kalemlere ayırır, kaydeder
 * (aynı liste tekrar yüklenirse üzerine yazar, eski "bizim kod" bağlantıları korunur) ve bizim kodlarla eşleştirir.
 */
type PItemRaw = [string, number, number, number, number];

/** Parça parça okuma durumu: sunucuda süre dolunca kaydedilir, sonraki çalışmada kaldığı sayfadan devam edilir */
export interface ParseState { next: number; parsed: ListItem[]; failed: number; quota: boolean }

/**
 * Sayfaları kalemlere ayırır. deadline verilirse (ms, Date.now() cinsinden) süre dolunca durur ve
 * { done: false, state } döner; state ile tekrar çağrılınca kaldığı yerden devam eder.
 */
export async function parseListPages(
  pages: string[][], onInfo?: (info: string) => void, state?: ParseState, deadline?: number,
): Promise<{ done: false; state: ParseState } | { done: true; parsed: ListItem[]; failed: number; total: number; currency: Currency; quota: boolean }> {
  const { parsePriceLines, detectCurrency } = await import('./priceParse');
  const { parsePositionedPage } = await import('./tableParse');
  const { parseMatrixPage } = await import('./matrixParse');
  // Sayfa başındaki konumlu yazı (#POS:…) ayrılır
  const posOf = new Map<string[], PItemRaw[]>();
  pages = pages.map(p => {
    if (!p[0]?.startsWith('#POS:')) return p;
    const rest = p.slice(1);
    try { posOf.set(rest, JSON.parse(p[0].slice(5))); } catch { /* bozuk kayıt: yok say */ }
    return rest;
  });
  const lines = pages.flat().filter(l => l !== '#OCR');
  const currency = detectCurrency(lines.join('\n'));
  // Her sayfa yapay zekayla okunur (katalog düzenindeki listeler için); olmazsa genel kurallarla
  type Item = { code: string; name: string; price: number; unit: string; grp?: string; currency: Currency };
  const parsed: Item[] = state ? [...state.parsed] : [];
  let failed = state?.failed ?? 0;
  const textPages = pages.map(p => {
    const f = p.filter(l => l !== '#OCR');
    const raw = posOf.get(p);
    if (raw) posOf.set(f, raw);
    return f;
  }).filter(p => p.join('').replace(/\s/g, '').length > 40);
  // Sayfalar ikişer ikişer okunur; yapay zeka hata verirse 2 kez daha denenir (yoğunlukta kısa bekleyerek)
  let quota = state?.quota ?? false;
  const isOcr = pages.some(p => p[0] === '#OCR');
  const readPage = async (pg: string[]) => {
    // Yazılı (taranmamış) PDF'te önce kurallarla okunur: rakamlar PDF'ten birebir alınır (0,16 $ → 0,16).
    // Yapay zeka sadece kuralların okuyamadığı (katalog düzenli / taranmış) sayfalarda devreye girer.
    if (!isOcr) {
      const rule = parsePriceLines(pg).map(x => ({ ...x, currency: x.currency || currency }));
      // Konuma göre tablo okuma (iki sütunlu sayfalar, koli/fiyat ayrımı): satır okumasıyla en az aynı sayıda kalem bulursa tercih edilir
      const raw = posOf.get(pg);
      if (raw) {
        const its = raw.map(([s, x, y, w, h]) => ({ s, x, y, w, h }));
        // Matris tablo (ölçü sütunları × Siyah/Galvaniz gibi çeşit satırları): her hücre ayrı kalem, çeşit adı korunur
        const mat = parseMatrixPage(its).map(x => ({ ...x, currency: x.currency || currency }));
        const pos = parsePositionedPage(its).map(x => ({ ...x, currency: x.currency || currency }));
        if (mat.length >= 6 && mat.length >= pos.length && mat.length >= rule.length * 0.5) return mat;
        if (pos.length >= 3 && pos.length >= rule.length * 0.8) return pos;
      }
      if (rule.length >= 3) return rule;
    }
    for (let attempt = 0; attempt < 3 && !quota; attempt++) {
      const ai = await aiPriceListPage(pg.join('\n')).catch(e => { if (String(e?.message) === 'quota') quota = true; return null; });
      if (ai) return ai;
      if (!quota) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
    const rule = parsePriceLines(pg).map(x => ({ ...x, currency: x.currency || currency }));
    if (!rule.length) failed++;
    return rule;
  };
  for (let i = state?.next ?? 0; i < textPages.length; i += 2) {
    if (deadline && Date.now() > deadline) return { done: false, state: { next: i, parsed, failed, quota } };
    onInfo?.(`sayfalar okunuyor ${Math.min(i + 2, textPages.length)}/${textPages.length}${failed ? ` · ${failed} sayfa okunamadı` : ''}`);
    const batch = await Promise.all(textPages.slice(i, i + 2).map(readPage));
    batch.forEach(b => parsed.push(...b));
  }
  return { done: true, parsed, failed, total: textPages.length, currency, quota };
}

/** Okunan sayfaları kontrol edip listeyi kaydeder (çok sayfa okunamadıysa mevcut liste korunur) */
export async function finishListImport(
  fileName: string, r: { parsed: ListItem[]; failed: number; total: number; currency: Currency; quota: boolean }, onInfo?: (info: string) => void,
) {
  const { parsed, failed, quota, currency } = r;
  const textPages = { length: r.total };
  if (parsed.length < 3) throw new Error(quota ? 'yapay zekanın günlük ücretsiz kotası doldu, yarın tekrar deneyin' : 'kalem bulunamadı (liste düzeni okunamadı)');
  // Sayfaların çoğu okunamadıysa eksik liste kaydedilmez (mevcut liste korunur)
  if (failed > Math.max(2, textPages.length * 0.25)) {
    throw new Error(`${failed}/${textPages.length} sayfa okunamadı${quota ? ' (yapay zekanın günlük ücretsiz kotası doldu, yarın tekrar deneyin)' : ''}; mevcut liste korundu`);
  }
  const saved = await saveSupplierList(fileName, parsed, currency, onInfo);
  return { ...saved, failedPages: failed };
}

/** PDF yazısından listeyi tek seferde oluşturur (uygulama içinde) */
export async function importListFromText(
  fileName: string, pages: string[][], onInfo?: (info: string) => void,
): Promise<{ listId: string; name: string; items: number; matched: number; failedPages: number; ambiguous: number; priceDiff: PriceDiff | null; replaced: string | null }> {
  const r = await parseListPages(pages, onInfo);
  if (!r.done) throw new Error('okuma tamamlanamadı');
  return finishListImport(fileName, r, onInfo);
}

export type ListItem = { code: string; name: string; price: number; unit: string; grp?: string; currency: Currency; ourCode?: string };

/**
 * Aynı adla farklı fiyatlı kalemler: listede renk/çeşit (Siyah–Galvaniz, PN16–PN25…) bilgisi okunamamış demektir.
 * Bu kalemler ayırt edilebilsin diye adlarına fiyat sırasıyla "(çeşit 1)", "(çeşit 2)" eklenir ve sayısı döner;
 * kullanıcıya uyarı gösterilir (ucuz olan genelde siyah/standart çeşittir). Kalemler birbirine karışıp yanlış koda bağlanmaz.
 */
export function markAmbiguous(items: { name: string; price: number; code?: string }[]): number {
  const by = new Map<string, typeof items>();
  for (const it of items) {
    const k = `${it.code || ''}|${it.name.toLocaleLowerCase('tr')}`;
    const g = by.get(k); if (g) g.push(it); else by.set(k, [it]);
  }
  let n = 0;
  for (const g of by.values()) {
    if (new Set(g.map(i => i.price)).size < 2) continue;
    [...g].sort((a, b) => a.price - b.price).forEach((it, k) => { it.name = `${it.name} (çeşit ${k + 1})`.slice(0, 200); n++; });
  }
  return n;
}

/**
 * Kalemleri firma listesi olarak kaydeder ve eşleştirir. Aynı liste varsa üzerine yazar; aynı firmanın başka tarihli
 * listesi varsa yeni liste onun yerine geçer (eşleştirmeler, iskonto, logo ve firma adı taşınır, eski liste kaldırılır).
 */
export async function saveSupplierList(fileName: string, parsed: ListItem[], currency: Currency, onInfo?: (info: string) => void) {
  const { guessListInfo, listIdFor } = await import('./priceParse');
  const { name, listDate } = guessListInfo(fileName);
  const listId = listIdFor(name, listDate);
  const ambiguous = markAmbiguous(parsed);
  const { data: existing } = await supabase.from('supplier_lists').select('id').eq('id', listId).maybeSingle();

  // Aynı firmanın eski listesi (firma adı ya da eski dosya adından çıkan ad aynıysa, büyük/küçük harf farkı gözetmeden)
  let old: { id: string; name: string; discount: number; logo: string | null; title: string | null } | null = null;
  if (!existing) {
    const low = (s: string) => s.trim().toLocaleLowerCase('tr');
    const { data: all } = await supabase.from('supplier_lists').select('id,name,discount,logo,title,source_file,list_date');
    const same = (all || []).filter((l: any) => low(l.name || '') === low(name) || (l.source_file && low(guessListInfo(l.source_file).name) === low(name)));
    same.sort((a: any, b: any) => String(b.list_date || '').localeCompare(String(a.list_date || '')));
    old = same[0] ? { id: same[0].id, name: same[0].name, discount: Number(same[0].discount || 0), logo: same[0].logo, title: same[0].title } : null;
  }
  const linkSource = existing ? listId : old?.id;

  // Eski bağlantılar (aynı ürün adı) yeni kalemlere taşınır; elle kaldırılan bağlar da kaldırılmış kalır
  const keep = new Map<string, { code: string | null; manual: boolean }>();
  for (let from = 0; linkSource; from += 1000) {
    const { data, error } = await supabase.from('supplier_items').select('code,name,our_code,match_manual')
      .eq('list_id', linkSource).or('our_code.not.is.null,match_manual.eq.true').range(from, from + 999);
    // Eski bağlantılar okunamazsa liste silinmez (bağlar kaybolmasın)
    if (error) throw error;
    if (!data?.length) break;
    data.forEach((r: any) => {
      const v = { code: r.our_code, manual: !!r.match_manual };
      keep.set(`${r.code}|${r.name}`, v);
      if (!keep.has(`n:${r.name}`)) keep.set(`n:${r.name}`, v);
      // Ürün adı okuma düzeltmesiyle değişse bile aynı firma kodu aynı üründür
      if (r.code && !keep.has(`c:${r.code}`)) keep.set(`c:${r.code}`, v);
    });
    if (data.length < 1000) break;
  }
  // Zam özeti: aynı liste yeniden yükleniyorsa onun, değilse aynı firmanın eski listesinin fiyatlarıyla karşılaştır
  const prevId = linkSource ?? null;
  const priceDiff = prevId ? await diffPrices(prevId, parsed).catch(() => null) : null;
  const listRow: any = { id: listId, currency, item_count: parsed.length, source_file: fileName, updated_at: new Date().toISOString(), price_diff: priceDiff };
  // Var olan liste yeniden yüklenince kullanıcının verdiği firma adı / tarih korunur
  if (!existing) Object.assign(listRow, old
    ? { title: old.title || '', name: old.name, list_date: listDate, discount: old.discount, logo: old.logo }
    : { title: '', name, list_date: listDate });
  const { error: le } = await supabase.from('supplier_lists').upsert(listRow);
  if (le) throw le;
  const { error: de } = await supabase.from('supplier_items').delete().eq('list_id', listId);
  if (de) throw de;
  for (let i = 0; i < parsed.length; i += 500) {
    onInfo?.(`${Math.min(i + 500, parsed.length)}/${parsed.length} kalem kaydediliyor`);
    const rows = parsed.slice(i, i + 500).map(p => {
      const k = p.ourCode ? { code: p.ourCode, manual: true } : keep.get(`${p.code}|${p.name}`) || keep.get(`n:${p.name}`) || (p.code ? keep.get(`c:${p.code}`) : undefined);
      return {
        list_id: listId, code: p.code, name: p.name, grp: p.grp || null, price: p.price, currency: p.currency, unit: p.unit,
        our_code: k?.code || null, match_manual: !!k?.manual, match_tried: !!k,
      };
    });
    const { error } = await supabase.from('supplier_items').insert(rows);
    if (error) throw error;
  }
  const matched = await autoMatchList(listId, parsed.length, onInfo);
  // Yeni liste kaydedildi: aynı firmanın eski listesi kaldırılır (kalemleriyle birlikte)
  let replaced: string | null = null;
  if (old && old.id !== listId) {
    onInfo?.('eski liste kaldırılıyor');
    // Kaldırılamazsa yeni liste yine de kayıtlı kalır; eski liste elle silinebilir
    replaced = await deleteSupplierList(old.id).then(() => old!.id, () => null);
  }
  return { listId, name: old?.name || name, items: parsed.length, matched, ambiguous, priceDiff, replaced };
}

/** Önceki listedeki fiyatlarla yeni kalemleri karşılaştırır (firma koduna, yoksa ürün adına göre; aynı para birimi) */
async function diffPrices(prevId: string, parsed: ListItem[]): Promise<PriceDiff | null> {
  const old = new Map<string, { price: number; currency: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('supplier_items').select('code,name,price,currency').eq('list_id', prevId).range(from, from + 999);
    if (error) throw error;
    (data || []).forEach((r: any) => { const k = r.code ? `c:${r.code}` : `n:${r.name}`; if (!old.has(k)) old.set(k, { price: Number(r.price || 0), currency: r.currency || 'TRY' }); });
    if (!data || data.length < 1000) break;
  }
  if (!old.size) return null;
  let compared = 0, up = 0, down = 0, sumUp = 0, sumAll = 0;
  const changes: PriceDiff['top'] = [];
  const seen = new Set<string>();
  for (const p of parsed) {
    const k = p.code ? `c:${p.code}` : `n:${p.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const o = old.get(k);
    if (!o || !(o.price > 0) || !(p.price > 0) || o.currency !== p.currency) continue;
    const pct = (p.price / o.price - 1) * 100;
    if (Math.abs(pct) > 300) continue; // okuma hatası olabilir
    compared++; sumAll += pct;
    if (pct > 0.5) { up++; sumUp += pct; changes.push({ name: p.name, old: o.price, now: p.price, pct: Math.round(pct * 10) / 10 }); }
    else if (pct < -0.5) down++;
  }
  if (!compared) return null;
  return {
    at: new Date().toISOString(), compared, up, down,
    avgUp: up ? Math.round((sumUp / up) * 10) / 10 : 0,
    avgAll: Math.round((sumAll / compared) * 10) / 10,
    top: changes.sort((a, b) => b.pct - a.pct).slice(0, 8),
  };
}

export async function autoMatchList(listId: string, total: number, onInfo?: (info: string) => void): Promise<number> {
  for (let guard = 0; guard < 400; guard++) {
    const { data, error } = await supabase.rpc('auto_match_supplier_items', { p_list: listId, lim: 120 });
    if (error) throw error;
    const left = Number(data) || 0;
    onInfo?.(total ? `bizim kodlarla eşleştiriliyor ${total - left}/${total}` : `bizim kodlarla eşleştiriliyor · ${left} kalem kaldı`);
    if (left <= 0) break;
  }
  const { count } = await supabase.from('supplier_items').select('id', { count: 'exact', head: true })
    .eq('list_id', listId).not('our_code', 'is', null);
  return count || 0;
}

/** Liste bilgilerini düzeltir (firma adı, tarih, para birimi) */
