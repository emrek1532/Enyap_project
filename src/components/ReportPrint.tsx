import React from 'react';
import { createPortal } from 'react-dom';

/** PDF'e basılacak bir tablo bölümü */
export interface PrintSection {
  heading: string;
  note?: string;
  columns: { label: string; align?: 'left' | 'right' }[];
  rows: string[][];
  foot?: string[];
}

export interface PrintDoc {
  title: string;
  period: string;
  /** Üstteki özet kutuları: [etiket, değer, alt satır] */
  summary?: [string, string, string?][];
  sections: PrintSection[];
  fileName: string;
  /** Alttaki "Enyap Isı Teklif & Takip" yazısını gizle */
  hideFooter?: boolean;
}

const CSS = `
#rp-print{display:none}
.rp-doc{color:#0f172a;font-family:Arial,Arimo,'Liberation Sans',Helvetica,sans-serif;font-size:8.5pt;line-height:1.35;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
.rp-doc .rp-head{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:0.5mm solid #006ec6;padding-bottom:3mm;margin-bottom:4mm}
.rp-doc .rp-head img{height:15mm;display:block}
.rp-doc .rp-head h1{margin:0;font-size:15pt;font-weight:800;text-align:right}
.rp-doc .rp-head p{margin:1mm 0 0;font-size:8.5pt;color:#475569;text-align:right}
.rp-doc .rp-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:2.5mm;margin-bottom:5mm}
.rp-doc .rp-card{border:0.25mm solid #cbd5e1;border-radius:2mm;padding:2.5mm 3mm;break-inside:avoid}
.rp-doc .rp-card b{display:block;font-size:7pt;color:#64748b;text-transform:uppercase;letter-spacing:0.03em}
.rp-doc .rp-card span{display:block;font-size:12pt;font-weight:800;margin-top:0.8mm}
.rp-doc .rp-card i{display:block;font-style:normal;font-size:7.5pt;color:#64748b;margin-top:0.5mm}
.rp-doc .rp-sec{margin-bottom:5mm}
.rp-doc .rp-sec h2{font-size:10.5pt;margin:0 0 1mm;font-weight:800;break-after:avoid}
.rp-doc .rp-sec .rp-note{margin:0 0 1.5mm;font-size:7.5pt;color:#64748b}
.rp-doc .rp-sec table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.rp-doc .rp-sec th{background:#eef2f7;font-size:7.5pt;font-weight:700;color:#334155;padding:1.4mm 1.8mm;border-bottom:0.3mm solid #94a3b8;text-align:left}
.rp-doc .rp-sec td{padding:1.2mm 1.8mm;border-bottom:0.2mm solid #e2e8f0;vertical-align:top}
.rp-doc .rp-sec tr{break-inside:avoid}
.rp-doc .rp-sec .r{text-align:right;white-space:nowrap}
.rp-doc .rp-sec tfoot td{font-weight:800;border-top:0.4mm solid #334155;border-bottom:none;background:#f8fafc}
.rp-doc .rp-empty{color:#64748b;font-style:italic;padding:2mm 0}
.rp-doc .rp-foot{margin-top:4mm;font-size:7pt;color:#94a3b8;text-align:right}
@media print{
  @page{size:A4;margin:12mm 11mm}
  html,body{background:#fff!important;margin:0!important;padding:0!important}
  body>*:not(#rp-print){display:none!important}
  #rp-print{display:block!important}
}
`;

/** Rapor sayfası açıkken PDF içeriği gizlice hazır durur; window.print() onu basar */
export const ReportPrint: React.FC<{ doc: PrintDoc }> = ({ doc }) => createPortal(
  <div id="rp-print" className="rp-doc">
    <style>{CSS}</style>
    <div className="rp-head">
      <img src="/teklif-logo.jpg" alt="Enyap Isı Sistemleri" />
      <div>
        <h1>{doc.title}</h1>
        <p>Dönem: {doc.period}</p>
        <p>Oluşturulma: {new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </div>
    </div>
    {doc.summary && doc.summary.length > 0 && (
      <div className="rp-sum">
        {doc.summary.map(([k, v, sub]) => (
          <div key={k} className="rp-card"><b>{k}</b><span>{v}</span>{sub && <i>{sub}</i>}</div>
        ))}
      </div>
    )}
    {doc.sections.map(s => (
      <div key={s.heading} className="rp-sec">
        {s.heading !== doc.title && <h2>{s.heading}</h2>}
        {s.note && <p className="rp-note">{s.note}</p>}
        {s.rows.length === 0 ? <div className="rp-empty">Bu dönemde kayıt yok.</div> : (
          <table>
            <thead>
              <tr>{s.columns.map((c, i) => <th key={i} className={c.align === 'right' ? 'r' : ''}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {s.rows.map((r, ri) => (
                <tr key={ri}>{r.map((cell, ci) => <td key={ci} className={s.columns[ci]?.align === 'right' ? 'r' : ''}>{cell}</td>)}</tr>
              ))}
            </tbody>
            {s.foot && (
              <tfoot>
                <tr>{s.foot.map((cell, ci) => <td key={ci} className={s.columns[ci]?.align === 'right' ? 'r' : ''}>{cell}</td>)}</tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    ))}
    {!doc.hideFooter && <div className="rp-foot">Enyap Isı Teklif &amp; Takip</div>}
  </div>,
  document.body,
);

/** Tarayıcının yazdır penceresini açar; PDF dosya adı sayfa başlığından gelir */
export function printReport(fileName: string) {
  const prev = document.title;
  document.title = fileName;
  const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  // İçerik çizildikten sonra yazdır
  window.setTimeout(() => window.print(), 50);
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Raporu A4 sayfalarına böler (her sayfa ayrı çizilir: telefonda çok uzun resim sınırına takılmaz, satırlar ikiye bölünmez) */
function reportPages(doc: PrintDoc): string[] {
  const head = `<div class="rp-head"><img src="/teklif-logo.jpg" alt="Enyap" /><div><h1>${esc(doc.title)}</h1><p>Dönem: ${esc(doc.period)}</p>
    <p>Oluşturulma: ${esc(new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }))}</p></div></div>`;
  const summary = doc.summary?.length
    ? `<div class="rp-sum">${doc.summary.map(([k, v, sub]) => `<div class="rp-card"><b>${esc(k)}</b><span>${esc(v)}</span>${sub ? `<i>${esc(sub)}</i>` : ''}</div>`).join('')}</div>` : '';
  const ROWS = 46; // bir sayfaya sığan satır (başlık payı hariç)
  const pages: string[] = [];
  let cur = head + summary, used = summary ? 14 : 4;
  const flush = () => { pages.push(cur); cur = ''; used = 0; };
  for (const sec of doc.sections) {
    const cell = (c: string, i: number) => `<td${sec.columns[i]?.align === 'right' ? ' class="r"' : ''}>${esc(c)}</td>`;
    const thead = `<thead><tr>${sec.columns.map(c => `<th${c.align === 'right' ? ' class="r"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>`;
    const title = `${sec.heading !== doc.title ? `<h2>${esc(sec.heading)}</h2>` : ''}${sec.note ? `<p class="rp-note">${esc(sec.note)}</p>` : ''}`;
    if (used > ROWS - 5) flush();
    if (!sec.rows.length) { cur += `<div class="rp-sec">${title}<div class="rp-empty">Bu dönemde kayıt yok.</div></div>`; used += 3; continue; }
    let i = 0, first = true;
    while (i < sec.rows.length) {
      const room = Math.max(1, ROWS - used - (first ? 3 : 1));
      const chunk = sec.rows.slice(i, i + room);
      i += chunk.length;
      const foot = i >= sec.rows.length && sec.foot ? `<tfoot><tr>${sec.foot.map(cell).join('')}</tr></tfoot>` : '';
      cur += `<div class="rp-sec">${first ? title : ''}<table>${thead}<tbody>${chunk.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody>${foot}</table></div>`;
      used += chunk.length + (first ? 3 : 1) + (foot ? 1 : 0);
      first = false;
      if (i < sec.rows.length) flush();
    }
  }
  if (cur) pages.push(cur);
  if (!doc.hideFooter && pages.length) pages[pages.length - 1] += '<div class="rp-foot">Enyap Isı Teklif &amp; Takip</div>';
  return pages;
}

/**
 * Raporu PDF dosyası olarak hazırlar ve paylaşır (WhatsApp, e-posta…); paylaşım desteklenmiyorsa indirir.
 * Yazdır penceresi açılmaz. Dönen yazı kullanıcıya gösterilecek kısa bilgidir.
 */
export async function shareReport(doc: PrintDoc): Promise<string> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: doc.title, author: 'Enyap Isı Sistemleri', creator: 'Enyap Isı Teklif & Takip' });
  const margin = 10, w = 210 - margin * 2;
  // Stiller sayfaya bir kez eklenir (rapor açık değilse de çalışsın)
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  try {
    const pages = reportPages(doc);
    for (let p = 0; p < pages.length; p++) {
      const box = document.createElement('div');
      box.className = 'rp-doc';
      box.style.cssText = 'position:fixed;left:-10000px;top:0;width:718px;background:#fff';
      box.innerHTML = pages[p];
      document.body.appendChild(box);
      try {
        await Promise.all([...box.querySelectorAll('img')].map(img => (img.complete ? null : new Promise(r => { img.onload = img.onerror = r; }))));
        const canvas = await html2canvas(box, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        if (p > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', margin, margin, w, Math.min(277, (canvas.height / canvas.width) * w));
      } finally {
        box.remove();
      }
    }
  } finally {
    style.remove();
  }
  const file = new File([pdf.output('blob')], `${doc.fileName}.pdf`, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: doc.title }); return ''; } catch (e) { if ((e as Error)?.name === 'AbortError') return ''; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `PDF indirildi (${file.name}); WhatsApp ya da e-postaya ek olarak ekleyebilirsiniz.`;
}
