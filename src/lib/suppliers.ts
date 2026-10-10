/**
 * Firma (tedarikçi) fiyat listeleri — bizim malzeme kataloğundan ayrı tablolarda durur.
 */
import { supabase } from './supabase';
import { Currency } from './money';
import { Material } from './materials';

export interface SupplierList {
  id: string;
  name: string;
  title: string;
  listDate: string;
  currency: Currency;
  discount: number;
  itemCount: number;
  sourceFile?: string;
  updatedAt?: string;
  /** Firma logosu: resim adresi veya küçültülmüş resim (data URL) */
  logo?: string;
}

export interface SupplierItem {
  id: number;
  listId: string;
  listName: string;
  discount: number;
  code: string;
  name: string;
  price: number;
  currency: Currency;
  unit: string;
  ourCode?: string | null;
  ourName?: string;
  /** PDF'teki bölüm başlığı */
  grp?: string;
}

export async function fetchSupplierLists(): Promise<SupplierList[]> {
  const { data, error } = await supabase.from('supplier_lists').select('*').order('name');
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id, name: r.name, title: r.title || '', listDate: r.list_date || '', currency: r.currency || 'TRY',
    discount: Number(r.discount || 0), itemCount: Number(r.item_count || 0), sourceFile: r.source_file || undefined,
    updatedAt: r.updated_at || undefined, logo: r.logo || undefined,
  }));
}

export async function setSupplierDiscount(id: string, discount: number) {
  const { error } = await supabase.from('supplier_lists').update({ discount, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/**
 * Okunan PDF yazısından firma listesini kendiliğinden oluşturur: kalemlere ayırır, kaydeder
 * (aynı liste tekrar yüklenirse üzerine yazar, eski "bizim kod" bağlantıları korunur) ve bizim kodlarla eşleştirir.
 */
export async function importListFromText(
  fileName: string, pages: string[][], onInfo?: (info: string) => void,
): Promise<{ listId: string; name: string; items: number; matched: number; failedPages: number }> {
  const { parsePriceLines, detectCurrency, guessListInfo, listIdFor } = await import('./priceParse');
  const lines = pages.flat().filter(l => l !== '#OCR');
  const currency = detectCurrency(lines.join('\n'));
  // Her sayfa yapay zekayla okunur (katalog düzenindeki listeler için); olmazsa genel kurallarla
  type Item = { code: string; name: string; price: number; unit: string; grp?: string; currency: Currency };
  const parsed: Item[] = [];
  let failed = 0;
  const textPages = pages.map(p => p.filter(l => l !== '#OCR')).filter(p => p.join('').replace(/\s/g, '').length > 40);
  // Sayfalar ikişer ikişer okunur; yapay zeka hata verirse 2 kez daha denenir (yoğunlukta kısa bekleyerek)
  let quota = false;
  const isOcr = pages.some(p => p[0] === '#OCR');
  const readPage = async (pg: string[]) => {
    // Yazılı (taranmamış) PDF'te önce kurallarla okunur: rakamlar PDF'ten birebir alınır (0,16 $ → 0,16).
    // Yapay zeka sadece kuralların okuyamadığı (katalog düzenli / taranmış) sayfalarda devreye girer.
    if (!isOcr) {
      const rule = parsePriceLines(pg).map(x => ({ ...x, currency: x.currency || currency }));
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
  for (let i = 0; i < textPages.length; i += 2) {
    onInfo?.(`sayfalar okunuyor ${Math.min(i + 2, textPages.length)}/${textPages.length}${failed ? ` · ${failed} sayfa okunamadı` : ''}`);
    const batch = await Promise.all(textPages.slice(i, i + 2).map(readPage));
    batch.forEach(b => parsed.push(...b));
  }
  if (parsed.length < 3) throw new Error(quota ? 'yapay zekanın günlük ücretsiz kotası doldu, yarın tekrar deneyin' : 'kalem bulunamadı (liste düzeni okunamadı)');
  // Sayfaların çoğu okunamadıysa eksik liste kaydedilmez (mevcut liste korunur)
  if (failed > Math.max(2, textPages.length * 0.25)) {
    throw new Error(`${failed}/${textPages.length} sayfa okunamadı${quota ? ' (yapay zekanın günlük ücretsiz kotası doldu, yarın tekrar deneyin)' : ''}; mevcut liste korundu`);
  }
  const r = await saveSupplierList(fileName, parsed, currency, onInfo);
  return { ...r, failedPages: failed };
}

/** Fiyat listesinin bir sayfasını sunucudaki yapay zekayla kalemlere ayırır (null: okunamadı) */
async function aiPriceListPage(text: string): Promise<{ code: string; name: string; price: number; unit: string; grp?: string; currency: Currency }[] | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch('/api/ai/pricelist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ text: text.slice(0, 12000) }),
  });
  if (res.status === 429) throw new Error('quota');
  if (!res.ok) return null;
  const out = await res.json().catch(() => null);
  if (!Array.isArray(out?.items)) return null;
  const cur = (c: string): Currency => (/usd|\$/i.test(c) ? 'USD' : /eur|€/i.test(c) ? 'EUR' : 'TRY');
  return out.items
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

/** Daha önce yüklenmiş PDF'in kayıtlı yazısından listeyi yeniden oluşturur (PDF'i tekrar seçmeden) */
export async function reimportList(sourceFile: string, onInfo?: (info: string) => void) {
  const { data, error } = await supabase.from('supplier_raw_pages').select('page,content')
    .eq('file_name', sourceFile).order('page');
  if (error) throw error;
  if (!data?.length) throw new Error('bu listenin PDF yazısı kayıtlı değil, PDF\'i tekrar yükleyin');
  return importListFromText(sourceFile, data.map((r: any) => String(r.content || '').split('\n')), onInfo);
}


type ListItem = { code: string; name: string; price: number; unit: string; grp?: string; currency: Currency; ourCode?: string };

/** Kalemleri firma listesi olarak kaydeder (aynı liste varsa üzerine yazar, eski bağlantılar korunur) ve eşleştirir */
async function saveSupplierList(fileName: string, parsed: ListItem[], currency: Currency, onInfo?: (info: string) => void) {
  const { guessListInfo, listIdFor } = await import('./priceParse');
  const { name, listDate } = guessListInfo(fileName);
  const listId = listIdFor(name, listDate);

  // Eski bağlantılar (kod ya da ad aynıysa) yeni kalemlere taşınır
  const keep = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('supplier_items').select('code,name,our_code')
      .eq('list_id', listId).not('our_code', 'is', null).range(from, from + 999);
    if (error || !data?.length) break;
    data.forEach((r: any) => { keep.set(`c:${r.code}`, r.our_code); keep.set(`n:${r.name}`, r.our_code); });
    if (data.length < 1000) break;
  }
  const { data: existing } = await supabase.from('supplier_lists').select('id').eq('id', listId).maybeSingle();
  const listRow: any = { id: listId, name, list_date: listDate, currency, item_count: parsed.length, source_file: fileName, updated_at: new Date().toISOString() };
  if (!existing) listRow.title = '';
  const { error: le } = await supabase.from('supplier_lists').upsert(listRow);
  if (le) throw le;
  await supabase.from('supplier_items').delete().eq('list_id', listId);
  for (let i = 0; i < parsed.length; i += 500) {
    onInfo?.(`${Math.min(i + 500, parsed.length)}/${parsed.length} kalem kaydediliyor`);
    const rows = parsed.slice(i, i + 500).map(p => ({
      list_id: listId, code: p.code, name: p.name, grp: p.grp || null, price: p.price, currency: p.currency, unit: p.unit,
      our_code: p.ourCode || (p.code && keep.get(`c:${p.code}`)) || keep.get(`n:${p.name}`) || null,
    }));
    const { error } = await supabase.from('supplier_items').insert(rows);
    if (error) throw error;
  }
  const matched = await autoMatchList(listId, parsed.length, onInfo);
  return { listId, name, items: parsed.length, matched };
}

/**
 * Excel (.xlsx) ya da CSV fiyat listesi: başlık satırındaki sütun adlarından kod, ürün adı, fiyat,
 * para birimi, grup ve birim bulunur. Firma adı ve tarih dosya adından alınır.
 */
export async function importListFromSheet(file: File, onInfo?: (info: string) => void) {
  onInfo?.('dosya okunuyor…');
  let rows: unknown[][];
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    rows = text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()));
  } else {
    const readXlsx = (await import('read-excel-file')).default;
    rows = await readXlsx(file) as unknown[][];
  }
  const fold = (v: unknown) => String(v ?? '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').trim();
  // Başlık satırı: "fiyat" geçen ilk satır
  const hi = rows.findIndex(r => r.some(c => /fiyat|price|tutar/.test(fold(c))));
  if (hi < 0) throw new Error('Excel\'de "Fiyat" sütunu bulunamadı');
  const head = rows[hi].map(fold);
  const col = (...keys: RegExp[]) => head.findIndex(h => keys.some(k => k.test(h)));
  const cPrice = col(/fiyat|price|tutar/), cName = col(/urun ad|urun|aciklama|malzeme|description|^ad$/), cCode = head.findIndex(h => /kod|code|stok/.test(h) && !/bizim/.test(h));
  const cCur = col(/para|doviz|currency|birim fiyat cinsi/), cGrp = col(/grup|kategori|seri|group/), cUnit = col(/^birim$|unit/);
  const cDn = col(/^dn|dn \(mm\)|^mm$/);
  // Ölçü sütunu (1/2", 3/4", 25x20…): ürün adına eklenir, ürün adı da grup başlığı olur
  const cSize = col(/olcu|ebat|boyut|size|cap|inc/);
  const cOur = col(/bizim kod/);
  if (cName < 0) throw new Error('Excel\'de ürün adı sütunu bulunamadı');
  const { parseNumber } = await import('./priceParse');
  const cur = (v: unknown, fallback: Currency): Currency => {
    const f = fold(v);
    return /usd|\$|dolar/.test(f) ? 'USD' : /eur|€|avro/.test(f) ? 'EUR' : /tl|try|₺/.test(f) ? 'TRY' : fallback;
  };
  const headCur = cur(rows[hi][cPrice], 'TRY');
  const items: ListItem[] = [];
  for (const r of rows.slice(hi + 1)) {
    const name = String(r[cName] ?? '').trim();
    const pv = r[cPrice];
    const price = typeof pv === 'number' ? pv : parseNumber(String(pv ?? '').replace(/[^\d.,]/g, ''));
    if (!name || !(price > 0)) continue;
    const dn = cDn >= 0 && r[cDn] != null && String(r[cDn]).trim() ? String(r[cDn]).trim() : '';
    const size = cSize >= 0 && cSize !== cDn && r[cSize] != null ? String(r[cSize]).trim() : '';
    let full = dn && !new RegExp(`DN\\s?${dn}\\b`, 'i').test(name) ? `${name} DN${dn}` : name;
    if (size && !full.includes(size)) full = `${full} ${size}`;
    items.push({
      code: cCode >= 0 ? String(r[cCode] ?? '').trim().slice(0, 40) : '',
      name: full.slice(0, 200),
      price: Math.round(price * 10000) / 10000,
      unit: cUnit >= 0 && String(r[cUnit] ?? '').trim() ? String(r[cUnit]).trim() : 'Adet',
      grp: cGrp >= 0 ? String(r[cGrp] ?? '').trim().slice(0, 120) || undefined : size ? name.slice(0, 120) : undefined,
      currency: cCur >= 0 ? cur(r[cCur], headCur) : headCur,
      ourCode: cOur >= 0 && String(r[cOur] ?? '').trim() ? String(r[cOur]).trim() : undefined,
    });
  }
  if (!items.length) throw new Error('Excel\'de fiyatlı satır bulunamadı');
  const counts = items.reduce((m, i) => m.set(i.currency, (m.get(i.currency) || 0) + 1), new Map<Currency, number>());
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return saveSupplierList(file.name, items, main, onInfo);
}

/** Firma listesini Excel olarak indirir (düzeltip aynı adla tekrar yüklenebilir) */
export async function exportListToExcel(list: SupplierList) {
  const all: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('supplier_items').select('code,name,grp,price,currency,unit,our_code')
      .eq('list_id', list.id).order('id').range(from, from + 999);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const writeXlsx = (await import('write-excel-file')).default;
  const head = ['Grup', 'Kod', 'Ürün adı', 'Fiyat', 'Para birimi', 'Birim', 'Bizim kod']
    .map(value => ({ value, fontWeight: 'bold' as const, backgroundColor: '#DCE8F5' }));
  const rows = all.map(r => [
    { type: String, value: r.grp || '' }, { type: String, value: r.code || '' }, { type: String, value: r.name || '' },
    { type: Number, value: Number(r.price) || 0 }, { type: String, value: r.currency || 'TRY' },
    { type: String, value: r.unit || 'Adet' }, { type: String, value: r.our_code || '' },
  ]);
  // Dosya adı tekrar yüklemede aynı listeye denk gelsin: "FAF Nisan 2026.xlsx"
  const fileName = `${[list.name, list.listDate].filter(Boolean).join(' ')}.xlsx`;
  await writeXlsx([head, ...rows] as any, {
    fileName,
    columns: [{ width: 40 }, { width: 14 }, { width: 60 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 16 }],
  });
}

/** Listedeki kalemleri bizim malzeme kodlarıyla otomatik eşleştirir (sunucuda, parça parça) */
export async function autoMatchList(listId: string, total: number, onInfo?: (info: string) => void): Promise<number> {
  for (let guard = 0; guard < 400; guard++) {
    const { data, error } = await supabase.rpc('auto_match_supplier_items', { p_list: listId, lim: 120 });
    if (error) throw error;
    const left = Number(data) || 0;
    onInfo?.(`bizim kodlarla eşleştiriliyor ${total - left}/${total}`);
    if (left <= 0) break;
  }
  const { count } = await supabase.from('supplier_items').select('id', { count: 'exact', head: true })
    .eq('list_id', listId).not('our_code', 'is', null);
  return count || 0;
}

/** Liste bilgilerini düzeltir (firma adı, tarih, para birimi) */
export async function updateSupplierListInfo(id: string, info: { name: string; listDate: string; currency: Currency }) {
  const { error } = await supabase.from('supplier_lists')
    .update({ name: info.name, list_date: info.listDate, currency: info.currency, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await supabase.from('supplier_items').update({ currency: info.currency }).eq('list_id', id);
}

/** Firma listesini tamamen siler */
export async function deleteSupplierList(id: string) {
  const { error } = await supabase.from('supplier_lists').delete().eq('id', id);
  if (error) throw error;
}

/** Firma logosunu kaydeder (null: kaldırır) */
export async function setSupplierLogo(id: string, logo: string | null) {
  const { error } = await supabase.from('supplier_lists').update({ logo }).eq('id', id);
  if (error) throw error;
}

/** Seçilen resmi en fazla 160 px'e küçültüp PNG data URL'e çevirir (veritabanında küçük yer tutsun) */
export async function logoFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url;
    });
    const k = Math.min(1, 160 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Firma kalemini bizim malzeme koduna bağlar (null: bağı kaldırır) */
export async function setSupplierOurCode(id: number, ourCode: string | null) {
  const { error } = await supabase.from('supplier_items').update({ our_code: ourCode }).eq('id', id);
  if (error) throw error;
}

export async function searchSupplierItems(q: string, opts: { list?: string | null; limit?: number; offset?: number } = {}) {
  const { data, error } = await supabase.rpc('search_supplier_items_v3', {
    q, list: opts.list ?? null, lim: opts.limit ?? 30, off: opts.offset ?? 0,
  });
  if (error) throw error;
  const rows = (data || []) as any[];
  return {
    items: rows.map((r): SupplierItem => ({
      id: Number(r.id), listId: r.list_id, listName: r.list_name, discount: Number(r.discount || 0),
      code: r.code || '', name: r.name || '', price: Number(r.price || 0), currency: (r.currency || 'TRY') as Currency,
      unit: r.unit || 'Adet', ourCode: r.our_code, ourName: r.our_name || undefined, grp: r.grp || undefined,
    })),
    total: rows.length ? Number(rows[0].total) : 0,
  };
}

/** Teklif kalemine aktarmak için malzeme biçimine çevir */
export const supplierToMaterial = (s: SupplierItem): Material => ({
  code: s.code, name: s.name, price: s.price, currency: s.currency, unit: s.unit, vatRate: 20,
  supplier: s.listName, supplierDiscount: s.discount,
});

/** Firma adına göre sabit bir renk (etiketler için) */
const COLORS = ['#e11d48', '#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706', '#db2777', '#4f46e5', '#0d9488', '#b45309', '#dc2626', '#475569'];
export const supplierColor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

/** Firma fiyat listesi PDF'inin yazısını sayfa sayfa sisteme kaydeder (kalemlere ayrıştırma sonra yapılır) */
/** Taranmış (resim) PDF sayfalarını cihazda yazı tanıma (OCR) ile okur */
async function ocrPdfPages(data: ArrayBuffer, onInfo?: (info: string) => void): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist');
  const { createWorker } = await import('tesseract.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  onInfo?.('yazı tanıma hazırlanıyor…');
  const worker = await createWorker('tur');
  const pages: string[][] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      onInfo?.(`yazı tanınıyor ${p}/${doc.numPages} sayfa`);
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
      const { data: res } = await worker.recognize(canvas);
      pages.push(res.text.split('\n').map(l => l.trim()).filter(Boolean));
      page.cleanup();
      canvas.width = canvas.height = 0;
    }
  } finally {
    await worker.terminate();
    doc.destroy();
  }
  return pages;
}

export async function uploadSupplierPdf(file: File, onInfo?: (info: string) => void): Promise<{ pages: number; chars: number; ocr: boolean; text: string[][] }> {
  const { pdfPages } = await import('./pdfQuote');
  const data = await file.arrayBuffer();
  let pages = await pdfPages(data.slice(0));
  let ocr = false;
  const textLen = (ps: string[][]) => ps.reduce((a, l) => a + l.join('').length, 0);
  // Sayfa başına çok az yazı varsa PDF taranmıştır: resimden okunur
  if (textLen(pages) < pages.length * 50) {
    pages = await ocrPdfPages(data, onInfo);
    ocr = true;
  }
  const chars = textLen(pages);
  if (!chars) return { pages: pages.length, chars, ocr, text: pages };
  const now = new Date().toISOString();
  const rows = pages.map((lines, i) => ({ file_name: file.name, page: i + 1, content: (ocr ? '#OCR\n' : '') + lines.join('\n'), uploaded_at: now }));
  // Önce bu dosyanın eski kaydı silinir (tekrar yüklemede fazladan sayfa kalmasın)
  await supabase.from('supplier_raw_pages').delete().eq('file_name', file.name);
  for (let i = 0; i < rows.length; i += 20) {
    const { error } = await supabase.from('supplier_raw_pages').upsert(rows.slice(i, i + 20));
    if (error) throw error;
    onInfo?.(`${Math.min(i + 20, rows.length)}/${rows.length} sayfa kaydedildi`);
  }
  return { pages: rows.length, chars, ocr, text: pages };
}

/** Listeye dönüştürülmüş PDF dosyaları (dosya adı → 1); bunlar tekrar seçilince atlanır */
export async function uploadedSupplierFiles(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const { data, error } = await supabase.from('supplier_lists').select('source_file').not('source_file', 'is', null);
  if (error) throw error;
  (data || []).forEach((r: any) => { out[r.source_file] = 1; });
  return out;
}
