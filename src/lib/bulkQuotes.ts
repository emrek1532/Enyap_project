/**
 * Toplu teklif yükleme: ZIP / PDF / fotoğraf dosyalarını cihazda okur (taranmış olanlar yazı tanımayla),
 * sistemdeki tekliflerle teklif numarasından eşleştirir. Hiçbir şey kaydetmez; sonucu ekranda onaya sunar.
 */
import { Unzip, UnzipInflate } from 'fflate';
import { Quote, QuoteStatus } from '../types';
import { PdfQuote, matchCustomer, parseQuoteLines, pdfPages, titleTr } from './pdfQuote';

export type RowKind = 'fill' | 'has' | 'new' | 'bad' | 'dup';

export interface BulkRow {
  id: string;
  fileName: string;
  pdf: PdfQuote | null;
  ocr: boolean;
  kind: RowKind;
  match?: Quote;          // sistemdeki teklif (aynı numara)
  customer: string;       // sistemdeki müşteri adına eşlenmiş firma
  flags: string[];        // kontrol edilmesi gerekenler
  include: boolean;
  status: QuoteStatus;    // yeni teklifler için
  error?: string;
}

const OK_EXT = /\.(pdf|jpe?g|png|webp)$/i;
const IMG_EXT = /\.(jpe?g|png|webp)$/i;

/** Seçilen dosyaları açar: ZIP içindekiler dahil PDF ve fotoğrafları tek tek verir (bellek dostu, akışla) */
export async function expandFiles(files: File[], onInfo?: (s: string) => void): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      onInfo?.(`${f.name} açılıyor…`);
      await new Promise<void>((resolve, reject) => {
        const unzip = new Unzip(entry => {
          const name = entry.name.split('/').pop() || entry.name;
          if (entry.name.endsWith('/') || name.startsWith('.') || entry.name.includes('__MACOSX') || !OK_EXT.test(name)) return;
          const chunks: Uint8Array[] = [];
          entry.ondata = (err, chunk, final) => {
            if (err) return reject(err);
            chunks.push(chunk);
            if (final) out.push(new File(chunks as BlobPart[], name, { type: IMG_EXT.test(name) ? 'image/jpeg' : 'application/pdf' }));
          };
          entry.start();
        });
        unzip.register(UnzipInflate);
        const reader = f.stream().getReader();
        const pump = (): Promise<void> => reader.read().then(({ done, value }) => {
          if (done) { unzip.push(new Uint8Array(0), true); resolve(); return; }
          unzip.push(value!);
          return pump();
        });
        pump().catch(reject);
      });
    } else if (OK_EXT.test(f.name)) {
      out.push(f);
    }
  }
  return out;
}

/** Yazı tanıma (Türkçe); bir kez açılıp tüm dosyalar için kullanılır */
type Ocr = { recognize: (img: HTMLCanvasElement | File) => Promise<string[]>; close: () => Promise<void> };
export async function createOcr(): Promise<Ocr> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('tur');
  return {
    recognize: async img => (await worker.recognize(img)).data.text.split('\n').map(l => l.trim()).filter(Boolean),
    close: async () => { await worker.terminate(); },
  };
}

async function ocrPdf(data: ArrayBuffer, ocr: Ocr): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const lines: string[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 6); p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
      lines.push(...await ocr.recognize(canvas));
      page.cleanup();
      canvas.width = canvas.height = 0;
    }
  } finally {
    doc.destroy();
  }
  return lines;
}

/** Tek dosyayı okur; yazısı olmayan PDF ve fotoğraflar yazı tanımayla okunur */
export async function readOne(f: File, getOcr: () => Promise<Ocr>): Promise<{ pdf: PdfQuote; ocr: boolean }> {
  if (IMG_EXT.test(f.name)) {
    const lines = await (await getOcr()).recognize(f);
    return { pdf: parseQuoteLines(lines, f.name), ocr: true };
  }
  const data = await f.arrayBuffer();
  let lines = (await pdfPages(data.slice(0))).flat();
  let ocr = false;
  if (lines.join('').length < 200) {
    lines = await ocrPdf(data, await getOcr());
    ocr = true;
  }
  return { pdf: parseQuoteLines(lines, f.name), ocr };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Kalemlerden para birimi başına KDV dahil toplam (yeni teklif formuyla aynı hesap) */
export function totalsOf(items: PdfQuote['items']) {
  const t = { TRY: 0, USD: 0, EUR: 0 } as Record<'TRY' | 'USD' | 'EUR', number>;
  for (const c of ['TRY', 'USD', 'EUR'] as const) {
    const net = r2(items.filter(it => (it.currency || 'TRY') === c)
      .reduce((a, it) => a + r2((it.quantity || 0) * (it.unitPrice || 0) * (1 - (it.discount || 0) / 100)), 0));
    t[c] = r2(net + r2(net * 0.2));
  }
  return t;
}

/** Okunan dosyaları sistemle karşılaştırıp satırlara ayırır */
export function classify(read: { fileName: string; pdf: PdfQuote | null; ocr: boolean; error?: string }[], quotes: Quote[], customerNames: string[]): BulkRow[] {
  const byNo = new Map(quotes.filter(q => q.quoteNumber && q.quoteNumber !== '-').map(q => [q.quoteNumber.trim(), q]));
  const seen = new Map<string, BulkRow>();
  const rows: BulkRow[] = [];
  read.forEach((r, i) => {
    const pdf = r.pdf;
    const base = { id: `b${i}`, fileName: r.fileName, pdf, ocr: r.ocr, customer: '', flags: [] as string[], include: false, status: 'gonderildi' as QuoteStatus, error: r.error };
    if (!pdf || (!pdf.items.length && !pdf.quoteNumber)) { rows.push({ ...base, kind: 'bad', flags: [r.error || 'okunamadı'] }); return; }
    const flags: string[] = [];
    if (r.ocr) flags.push('fotoğraftan/taramadan okundu');
    if (!pdf.quoteNumber) flags.push('teklif no yok');
    if (!pdf.items.length) flags.push('kalem bulunamadı');
    if (pdf.totals && pdf.items.length) {
      const t = totalsOf(pdf.items);
      const off = (['TRY', 'USD', 'EUR'] as const).some(c => {
        const want = pdf.totals![c] || 0;
        return want > 0 && Math.abs(t[c] - want) > Math.max(1, want * 0.01);
      });
      if (off) flags.push('kalem toplamı PDF toplamını tutmuyor');
    }
    flags.push(...pdf.warnings.filter(w => w !== 'Kalem bulunamadı'));
    const customer = pdf.customerName
      ? matchCustomer(pdf.customerName, customerNames) || titleTr(pdf.customerName.split(/\s+/).slice(0, 3).join(' '))
      : '';
    const match = pdf.quoteNumber ? byNo.get(pdf.quoteNumber.trim()) : undefined;
    const kind: RowKind = match ? (match.items?.length ? 'has' : pdf.items.length ? 'fill' : 'has') : pdf.items.length ? 'new' : 'bad';
    const row: BulkRow = { ...base, kind, match, customer, flags };
    // Kontrol gerektirmeyen "kalem doldur" satırları baştan seçili; yeni teklifler siz seçene kadar seçilmez
    row.include = kind === 'fill' && !flags.some(f => /tutmuyor|taramadan/.test(f));
    // Aynı numara birden fazla dosyada: en çok kalemlisi kalır
    const key = pdf.quoteNumber?.trim();
    if (key && (kind === 'fill' || kind === 'new')) {
      const prev = seen.get(key);
      if (prev) {
        if ((prev.pdf?.items.length || 0) >= pdf.items.length) { rows.push({ ...row, kind: 'dup', include: false }); return; }
        prev.kind = 'dup'; prev.include = false;
      }
      seen.set(key, row);
    }
    rows.push(row);
  });
  return rows;
}
