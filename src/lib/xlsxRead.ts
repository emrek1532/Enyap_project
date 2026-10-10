/**
 * Yedek Excel (.xlsx) okuyucu: bazı programların yazdığı boş "inline string" hücreleri gibi
 * read-excel-file'ın reddettiği dosyaları okur. Sadece ilk sayfanın değerlerini döndürür.
 */
import { strFromU8, unzipSync } from 'fflate';

const colIndex = (ref: string) => {
  const letters = (ref.match(/^[A-Z]+/i)?.[0] || 'A').toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Metin düğümlerini birleştirir (okunuş/rPh kısımları hariç)
const textOf = (el: Element) =>
  Array.from(el.getElementsByTagName('t'))
    .filter(t => t.parentElement?.tagName !== 'rPh')
    .map(t => t.textContent || '')
    .join('');

export function readXlsxRows(buf: ArrayBuffer, parser: { parseFromString(s: string, t: string): Document } = new DOMParser()): unknown[][] {
  const files = unzipSync(new Uint8Array(buf));
  const read = (p: string) => (files[p] ? strFromU8(files[p]) : '');
  const xml = (p: string) => parser.parseFromString(read(p) || '<x/>', 'application/xml');

  const shared = Array.from(xml('xl/sharedStrings.xml').getElementsByTagName('si')).map(textOf);

  // İlk sayfanın dosya yolu: workbook.xml → rels
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const first = xml('xl/workbook.xml').getElementsByTagName('sheet')[0];
  const rid = first?.getAttribute('r:id');
  if (rid) {
    const rel = Array.from(xml('xl/_rels/workbook.xml.rels').getElementsByTagName('Relationship'))
      .find(r => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  if (!files[sheetPath]) throw new Error('Excel sayfası bulunamadı');

  const rows: unknown[][] = [];
  for (const row of Array.from(xml(sheetPath).getElementsByTagName('row'))) {
    const out: unknown[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const i = colIndex(c.getAttribute('r') || '');
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? null;
      let val: unknown = null;
      if (t === 's') val = v != null ? shared[Number(v)] ?? null : null;
      else if (t === 'inlineStr') val = textOf(c) || null;
      else if (t === 'str' || t === 'e') val = v;
      else if (t === 'b') val = v === '1';
      else if (v != null && v !== '') val = Number.isFinite(Number(v)) ? Number(v) : v;
      if (typeof val === 'string') val = val.trim() || null;
      out[i] = val;
    }
    for (let k = 0; k < out.length; k++) if (out[k] === undefined) out[k] = null;
    rows.push(out);
  }
  return rows;
}
