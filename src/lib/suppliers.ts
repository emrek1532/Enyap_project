/**
 * Firma (tedarikçi) fiyat listeleri — bizim malzeme kataloğundan ayrı tablolarda durur.
 */
import { supabase } from './supabase';
import { ListItem, PriceDiff, autoMatchList, cleanAiItems, configure, importListFromText, markAmbiguous, saveSupplierList } from './pricelistCore';

export type { PriceDiff };
export { autoMatchList, importListFromText, markAmbiguous };

/** Fiyat listesinin bir sayfasını sunucudaki yapay zekayla kalemlere ayırır (null: okunamadı) */
async function aiPriceListPage(text: string) {
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
  return Array.isArray(out?.items) ? cleanAiItems(out.items) : null;
}
configure({ sb: supabase, ai: aiPriceListPage });

/**
 * Sayfaları görsel yapay zekâyla okur: sayfa resmi (ve varsa PDF'ten çıkan yazısı) sunucuya gider, ürün satırları döner.
 * `keepEmpty`: Claude yolunda boş cevap "bu sayfada ürün yok" demektir ve saklanır; aksi halde boş/okunamayan sayfa
 * haritada yer almaz ve eski yöntemle (konumlu yazı / cihazda yazı tanıma) okunur.
 */
async function visionPdfPages(data: ArrayBuffer, pagesNo: number[], texts: string[][], onInfo?: (info: string) => void, keepEmpty = false) {
  const pdfjs = await import('pdfjs-dist');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  const out = new Map<number, ReturnType<typeof cleanAiItems>>();
  let quota = false, done = 0, next = 0;
  const readOne = async (p: number) => {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(2.5, 1600 / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    const image = canvas.toDataURL('image/jpeg', 0.85);
    page.cleanup();
    canvas.width = canvas.height = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch('/api/ai/pricelist', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ image, text: (texts[p - 1] || []).join('\n').slice(0, 8000) }),
      }).catch(() => null);
      if (res?.status === 429) { quota = true; return; }
      if (!res?.ok) continue; // bir kez daha denenir
      const body = await res.json().catch(() => null);
      const items = Array.isArray(body?.items) ? cleanAiItems(body.items) : [];
      if (items.length || keepEmpty) out.set(p, items);
      return;
    }
  };
  try {
    // Üç sayfa aynı anda okunur
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < pagesNo.length && !quota) {
        const p = pagesNo[next++];
        await readOne(p);
        onInfo?.(`sayfalar yapay zekâyla okunuyor ${++done}/${pagesNo.length}`);
      }
    }));
  } finally {
    doc.destroy();
  }
  return out;
}
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
  /** Son yüklemede önceki fiyatlara göre değişim özeti */
  priceDiff?: PriceDiff | null;
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
    updatedAt: r.updated_at || undefined, logo: r.logo || undefined, priceDiff: r.price_diff || null,
  }));
}

export async function setSupplierDiscount(id: string, discount: number) {
  const { error } = await supabase.from('supplier_lists').update({ discount, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/** Daha önce yüklenmiş PDF'in kayıtlı yazısından listeyi yeniden oluşturur (PDF'i tekrar seçmeden) */
export async function reimportList(sourceFile: string, onInfo?: (info: string) => void) {
  const { data, error } = await supabase.from('supplier_raw_pages').select('page,content')
    .eq('file_name', sourceFile).order('page');
  if (error) throw error;
  if (!data?.length) throw new Error('bu listenin PDF yazısı kayıtlı değil, PDF\'i tekrar yükleyin');
  return importListFromText(sourceFile, data.map((r: any) => String(r.content || '').split('\n')), onInfo);
}


/** Zam özeti tek satır: "Önceki listeye göre 45 üründe zam (ort. %12), 3 üründe indirim" */
export const priceDiffText = (d: PriceDiff) =>
  d.up || d.down
    ? `Önceki listeye göre ${d.up ? `${d.up.toLocaleString('tr-TR')} üründe zam (ort. %${d.avgUp.toLocaleString('tr-TR')})` : 'zam yok'}${d.down ? `, ${d.down.toLocaleString('tr-TR')} üründe indirim` : ''} · ${d.compared.toLocaleString('tr-TR')} ürün karşılaştırıldı`
    : `Önceki listeye göre fiyat değişmedi (${d.compared.toLocaleString('tr-TR')} ürün)`;

/** Tırnak içindeki ayırıcıları bölmeden CSV satırını hücrelere ayırır ("1.234,56" ve "Vana, DN25" tek hücre kalır) */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
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
    rows = text.split(/\r?\n/).filter(l => l.trim()).map(l => splitCsvLine(l, sep));
  } else {
    try {
      const readXlsx = (await import('read-excel-file')).default;
      rows = await readXlsx(file) as unknown[][];
    } catch {
      // Bazı programların yazdığı dosyalar (boş "inline string" hücreleri vb.) için yedek okuyucu
      const { readXlsxRows } = await import('./xlsxRead');
      rows = readXlsxRows(await file.arrayBuffer());
    }
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
    .map(value => ({ value, fontWeight: 'bold' as const, backgroundColor: '#E2EAF3' }));
  // Excel'in kabul etmediği kontrol karakterleri temizlenir (bazı PDF'lerde "i" harfi U+001E olarak gelir)
  const clean = (v: unknown) => String(v ?? '').replace(/\u001e/g, 'i').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/g, '');
  const rows = all.map(r => [
    { type: String, value: clean(r.grp) }, { type: String, value: clean(r.code) }, { type: String, value: clean(r.name) },
    { type: Number, value: Number(r.price) || 0 }, { type: String, value: r.currency || 'TRY' },
    { type: String, value: clean(r.unit || 'Adet') }, { type: String, value: clean(r.our_code) },
  ]);
  // Dosya adı tekrar yüklemede aynı listeye denk gelsin: "FAF Nisan 2026.xlsx"
  const fileName = `${[list.name, list.listDate].filter(Boolean).join(' ')}.xlsx`;
  await writeXlsx([head, ...rows] as any, {
    fileName,
    columns: [{ width: 40 }, { width: 14 }, { width: 60 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 16 }],
  });
}

/** Listedeki kalemleri bizim malzeme kodlarıyla otomatik eşleştirir (sunucuda, parça parça) */
export async function updateSupplierListInfo(id: string, info: { name: string; listDate: string; currency: Currency }) {
  const { data: old } = await supabase.from('supplier_lists').select('currency').eq('id', id).maybeSingle();
  const { error } = await supabase.from('supplier_lists')
    .update({ name: info.name, list_date: info.listDate, currency: info.currency, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  // Para birimi değiştiyse sadece eski liste para birimindeki kalemler güncellenir (ayrı USD/EUR satırlar korunur)
  if (old?.currency && old.currency !== info.currency) {
    await supabase.from('supplier_items').update({ currency: info.currency }).eq('list_id', id).eq('currency', old.currency);
  }
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
/** Elle bağlama / bağı kaldırma: otomatik eşleştirme bu kaleme bir daha dokunmaz */
export async function setSupplierOurCode(id: number, ourCode: string | null) {
  const { error } = await supabase.from('supplier_items').update({ our_code: ourCode, match_manual: true, match_tried: true }).eq('id', id);
  if (error) throw error;
}

/** Elle bağlanan kalemden öğrenir: listede aynı adlı (ölçüsü farklı) bağsız kalemleri aynı kod ailesine bağlar */
export async function learnFromLinked(id: number): Promise<number> {
  const { data, error } = await supabase.rpc('supplier_learn', { p_item: id });
  if (error) throw error;
  return Number(data) || 0;
}

/** "Diğer ölçülere uygula" düğmesi: aynı adlı diğer ölçüleri, "eşleşmedi" diye kilitlenmiş olsalar da bağlar (elle verilen kodlara dokunmaz) */
export async function learnAllFromLinked(id: number): Promise<number> {
  const { data, error } = await supabase.rpc('supplier_learn_all', { p_item: id });
  if (error) throw error;
  return Number(data) || 0;
}

/** Bir gruptaki (grp boşsa tüm listedeki) bağları toplu kaldırır */
export async function clearSupplierMatches(listId: string, grp: string | null) {
  let q = supabase.from('supplier_items').update({ our_code: null, match_manual: true, match_tried: true }).eq('list_id', listId);
  if (grp) q = q.eq('grp', grp);
  const { error } = await q;
  if (error) throw error;
}

/** Bir grubu (grp boşsa tüm listeyi) sıfırlayıp otomatik eşleştirmeyi yeniden çalıştırır */
export async function rematchSupplierItems(listId: string, grp: string | null, onInfo?: (info: string) => void) {
  let q = supabase.from('supplier_items').update({ our_code: null, match_manual: false, match_tried: false, ai_checked: false }).eq('list_id', listId);
  if (grp) q = q.eq('grp', grp);
  const { error } = await q;
  if (error) throw error;
  return autoMatchList(listId, 0, onInfo);
}

/**
 * Kuralla eşleştirme (yapay zekâsız, tek seferde): bağsız kalemleri fiyat (kuruşu kuruşuna), ad (ortak kelimeler) ve
 * ölçüye (inç/cm/mm/DN/PN/model no çelişmez) bakarak bizim kodlara bağlar; tek ve açık aday yoksa bağlamaz. Sunucuda `supplier_rule_match_part`.
 */
export async function ruleMatchList(listId: string, onInfo?: (info: string) => void): Promise<{ linked: number; examples: string[] }> {
  // 400'er kalemlik parçalar (sunucudaki 8 sn sınırı); 'next' boşsa liste bitti
  let after = 0, linked = 0;
  const examples: string[] = [];
  for (let guard = 0; guard < 100; guard++) {
    const { data, error } = await supabase.rpc('supplier_rule_match_part', { p_list: listId, p_apply: true, p_after: after, p_lim: 400 });
    if (error) throw error;
    linked += Number(data?.linked) || 0;
    examples.push(...((data?.examples || []) as string[]));
    onInfo?.(`kuralla eşleştiriyor · ${linked} bağlandı`);
    if (data?.next == null) break;
    after = Number(data.next);
  }
  return { linked, examples };
}

/**
 * Yapay zekâ ile eşleştirme (RAG): veritabanı her kalem için en benzer malzemeleri bulur, yapay zekâ bunlardan
 * aynı ürünü seçer ya da "yok" der. Yalnızca bağsız kalemlere bakılır (kuralların bağladığına ve elle bağlanana dokunulmaz),
 * adaylar aynı ölçüdekilerle sınırlıdır; yarıda kalırsa kaldığı yerden sürer.
 */
export async function aiMatchList(listId: string, onInfo?: (info: string) => void): Promise<{ checked: number; linked: number }> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  type Row = { id: number; code: string | null; name: string; current: string | null; candidates: { code: string; name: string }[] };
  let checked = 0, linked = 0;
  for (let guard = 0; guard < 500; guard++) {
    const { data, error } = await supabase.rpc('supplier_ai_batch', { p_list: listId, lim: 60 });
    if (error) throw error;
    const rows = (data || []) as Row[];
    if (!rows.length) break;
    const results: { id: number; code: string | null }[] = rows.filter(r => !r.candidates.length).map(r => ({ id: r.id, code: null }));
    const ask = rows.filter(r => r.candidates.length);
    // 20'şerli paketler aynı anda sorulur
    await Promise.all(Array.from({ length: Math.ceil(ask.length / 20) }, (_, i) => ask.slice(i * 20, i * 20 + 20)).map(async chunk => {
      const res = await fetch('/api/ai/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ items: chunk.map(r => ({ id: r.id, name: r.name, code: r.code || undefined, candidates: r.candidates })) }),
      });
      if (res.status === 429) throw new Error('quota');
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(`Yapay zekâ cevap vermedi (${res.status}${err?.message ? `: ${err.message}` : err?.error ? `: ${err.error}` : ''})`);
      }
      const out = await res.json();
      const got = new Map<number, string | null>((out.matches || []).map((m: { id: number; code: string | null }) => [m.id, m.code]));
      // Cevapta olmayan kalem mevcut bağıyla kalır
      for (const r of chunk) results.push({ id: r.id, code: got.has(r.id) ? got.get(r.id)! : r.current });
    }));
    // Sunucu ölçüsü tutmayan seçimi yazmaz; dönen sayı gerçekten bağlananlardır
    const { data: n, error: e2 } = await supabase.rpc('supplier_ai_apply', { p: results });
    if (e2) throw e2;
    checked += results.length;
    linked += Number(n) || 0;
    onInfo?.(`yapay zekâ eşleştiriyor · ${checked} kalem, ${linked} bağlandı`);
  }
  return { checked, linked };
}

/** Yükleme bitince: dosyadan kurulan listeyi yapay zekâyla eşleştirir (kural eşleşmesinin bulamadıkları) */
export async function aiMatchUploaded(fileName: string, onInfo?: (info: string) => void) {
  const { data } = await supabase.from('supplier_lists').select('id').eq('source_file', fileName).order('updated_at', { ascending: false }).limit(1);
  const id = data?.[0]?.id as string | undefined;
  return id ? aiMatchList(id, onInfo) : null;
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
/** Firma renkleri: yalnız ENYAP mavi / lacivert / turkuaz tonları (mor, turuncu yok) */
const COLORS = ['#006DBB', '#008F79', '#173F73', '#009FE3', '#204D84', '#0E7C86', '#1D4ED8', '#0891B2', '#3A6EA5', '#00B49A', '#204D84', '#4A6F94'];
export const supplierColor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

/** Firma fiyat listesi PDF'inin yazısını sayfa sayfa sisteme kaydeder (kalemlere ayrıştırma sonra yapılır) */
/** Taranmış (resim) PDF sayfalarını cihazda yazı tanıma (OCR) ile okur; `only` verilirse yalnızca o sayfalar (1'den başlar) */
async function ocrPdfPages(data: ArrayBuffer, onInfo?: (info: string) => void, only?: number[]): Promise<Map<number, string[]>> {
  const pdfjs = await import('pdfjs-dist');
  const { createWorker } = await import('tesseract.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  onInfo?.('yazı tanıma hazırlanıyor…');
  const worker = await createWorker('tur');
  const pages = new Map<number, string[]>();
  const list = only ?? Array.from({ length: doc.numPages }, (_, i) => i + 1);
  try {
    for (const [k, p] of list.entries()) {
      onInfo?.(`yazı tanınıyor ${k + 1}/${list.length} sayfa (resim sayfalar)`);
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
      const { data: res } = await worker.recognize(canvas);
      pages.set(p, res.text.split('\n').map(l => l.trim()).filter(Boolean));
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
  const { pdfPagesWithItems } = await import('./pdfQuote');
  const data = await file.arrayBuffer();
  const full = await pdfPagesWithItems(data.slice(0));
  // Konumlu yazı sayfanın ilk satırında saklanır (#POS:…): liste tablo tablo okunur, tekrar okumada da kullanılır
  const r1 = (n: number) => Math.round(n * 10) / 10;
  let pages = full.map(p => p.lines);
  const posLine = (i: number) => '#POS:' + JSON.stringify(full[i].items.map(it => [it.s, r1(it.x), r1(it.y), r1(it.w), r1(it.h)]));
  const textLen = (ps: string[][]) => ps.reduce((a, l) => a + l.join('').length, 0);
  // Karar sayfa sayfa verilir: yazısı çok az olan sayfa (yalnız başlık/altbilgi, tablo resim) resimden okunur.
  // Aynı PDF'te hem yazılı hem resim sayfalar olabilir (ör. Yavuz: ilk sayfalar yazı, sonrakiler taranmış).
  const scanned = pages.map((l, i) => (l.join('').length < 600 ? i + 1 : 0)).filter(Boolean);
  // Claude tanımlıysa HER sayfa resim + yazısıyla Claude'a okutulur (liste düzeninden bağımsız, kural gerekmez);
  // değilse yalnız taranmış sayfalar ücretsiz görsel modelle. Kalemler doğrudan saklanır (#ITEMS:…);
  // okunamayan sayfalar eski yöntemle (konumlu yazı kuralları / cihazda yazı tanıma) okunur.
  const claude = await fetch('/api/ai/pricelist-mode').then(r => r.json()).then(j => !!j?.claude).catch(() => false);
  const targets = claude ? pages.map((_, i) => i + 1) : scanned;
  const vision = targets.length ? await visionPdfPages(data.slice(0), targets, pages, onInfo, claude).catch(() => new Map()) : new Map();
  const rest = scanned.filter(p => !vision.has(p));
  const ocrText = rest.length ? await ocrPdfPages(data, onInfo, rest) : new Map<number, string[]>();
  const ocr = ocrText.size > 0;
  const humanOf = (its: { name: string; price: number; currency: string }[]) => its.map(x => `${x.name} · ${x.price} ${x.currency}`);
  pages = pages.map((l, i) => {
    const v = vision.get(i + 1);
    if (v) return v.length ? humanOf(v) : [];
    const o = ocrText.get(i + 1);
    // Resimden daha çok yazı çıktıysa o kullanılır
    return o && o.join('').length > l.join('').length ? o : l;
  });
  // Yapay zekâ kalem okuduysa sayfa yazısı az olsa da (küçük liste) okunmuş sayılır
  const chars = Math.max(textLen(pages), [...vision.values()].some(v => v.length) ? 1000 : 0);
  if (!chars) return { pages: pages.length, chars, ocr, text: pages };
  const now = new Date().toISOString();
  const rows = pages.map((lines, i) => {
    const its = vision.get(i + 1);
    if (its) {
      // Görsel modelin okuduğu kalemler: ilk satır makine için, altı okunabilir özet
      // Ürün çıkmayan sayfa (kapak, açıklama) yalnız işaretle saklanır: ayrıştırıcı onu boş sayfa olarak atlar
      if (!its.length) return { file_name: file.name, page: i + 1, content: '#ITEMS:[]', uploaded_at: now };
      return { file_name: file.name, page: i + 1, content: ['#ITEMS:' + JSON.stringify(its), ...lines].join('\n'), uploaded_at: now };
    }
    const fromOcr = lines !== full[i].lines;
    return { file_name: file.name, page: i + 1, content: fromOcr ? '#OCR\n' + lines.join('\n') : [posLine(i), ...lines].join('\n'), uploaded_at: now };
  });
  // Önce bu dosyanın eski kaydı silinir (tekrar yüklemede fazladan sayfa kalmasın)
  await supabase.from('supplier_raw_pages').delete().eq('file_name', file.name);
  for (let i = 0; i < rows.length; i += 20) {
    const { error } = await supabase.from('supplier_raw_pages').upsert(rows.slice(i, i + 20));
    if (error) throw error;
    onInfo?.(`${Math.min(i + 20, rows.length)}/${rows.length} sayfa kaydedildi`);
  }
  // Ayrıştırma için kaydedilen içerik (konum #POS, görsel model kalemleri #ITEMS dahil) döner
  return { pages: rows.length, chars, ocr: ocr || vision.size > 0, text: rows.map(r => r.content.split('\n')) };
}

/** Listeye dönüştürülmüş PDF dosyaları (dosya adı → 1); bunlar tekrar seçilince atlanır */
export async function uploadedSupplierFiles(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const { data, error } = await supabase.from('supplier_lists').select('source_file').not('source_file', 'is', null);
  if (error) throw error;
  (data || []).forEach((r: any) => { out[r.source_file] = 1; });
  return out;
}
