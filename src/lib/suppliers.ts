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
  const { data, error } = await supabase.rpc('search_supplier_items', {
    q, list: opts.list ?? null, lim: opts.limit ?? 30, off: opts.offset ?? 0,
  });
  if (error) throw error;
  const rows = (data || []) as any[];
  return {
    items: rows.map((r): SupplierItem => ({
      id: Number(r.id), listId: r.list_id, listName: r.list_name, discount: Number(r.discount || 0),
      code: r.code || '', name: r.name || '', price: Number(r.price || 0), currency: (r.currency || 'TRY') as Currency,
      unit: r.unit || 'Adet', ourCode: r.our_code,
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

export async function uploadSupplierPdf(file: File, onInfo?: (info: string) => void): Promise<{ pages: number; chars: number; ocr: boolean }> {
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
  if (!chars) return { pages: pages.length, chars, ocr };
  const now = new Date().toISOString();
  const rows = pages.map((lines, i) => ({ file_name: file.name, page: i + 1, content: (ocr ? '#OCR\n' : '') + lines.join('\n'), uploaded_at: now }));
  // Önce bu dosyanın eski kaydı silinir (tekrar yüklemede fazladan sayfa kalmasın)
  await supabase.from('supplier_raw_pages').delete().eq('file_name', file.name);
  for (let i = 0; i < rows.length; i += 20) {
    const { error } = await supabase.from('supplier_raw_pages').upsert(rows.slice(i, i + 20));
    if (error) throw error;
    onInfo?.(`${Math.min(i + 20, rows.length)}/${rows.length} sayfa kaydedildi`);
  }
  return { pages: rows.length, chars, ocr };
}

/** Daha önce yüklenmiş PDF dosyaları (ad → sayfa sayısı) */
export async function uploadedSupplierFiles(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('supplier_raw_pages').select('file_name').eq('page', 1).neq('content', '').range(from, from + 999);
    if (error || !data?.length) break;
    data.forEach((r: any) => { out[r.file_name] = 1; });
    if (data.length < 1000) break;
  }
  return out;
}
