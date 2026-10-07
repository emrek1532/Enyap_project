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
}

const CSS = `
#rp-print{display:none}
@media print{
  @page{size:A4;margin:12mm 11mm}
  html,body{background:#fff!important;margin:0!important;padding:0!important}
  body>*:not(#rp-print){display:none!important}
  #rp-print{display:block!important;color:#0f172a;font-family:Arial,Arimo,'Liberation Sans',Helvetica,sans-serif;font-size:8.5pt;line-height:1.35;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .rp-head{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:0.5mm solid #006ec6;padding-bottom:3mm;margin-bottom:4mm}
  .rp-head img{height:15mm;display:block}
  .rp-head h1{margin:0;font-size:15pt;font-weight:800;text-align:right}
  .rp-head p{margin:1mm 0 0;font-size:8.5pt;color:#475569;text-align:right}
  .rp-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:2.5mm;margin-bottom:5mm}
  .rp-card{border:0.25mm solid #cbd5e1;border-radius:2mm;padding:2.5mm 3mm;break-inside:avoid}
  .rp-card b{display:block;font-size:7pt;color:#64748b;text-transform:uppercase;letter-spacing:0.03em}
  .rp-card span{display:block;font-size:12pt;font-weight:800;margin-top:0.8mm}
  .rp-card i{display:block;font-style:normal;font-size:7.5pt;color:#64748b;margin-top:0.5mm}
  .rp-sec{margin-bottom:5mm}
  .rp-sec h2{font-size:10.5pt;margin:0 0 1mm;font-weight:800;break-after:avoid}
  .rp-sec .rp-note{margin:0 0 1.5mm;font-size:7.5pt;color:#64748b}
  .rp-sec table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
  .rp-sec th{background:#eef2f7;font-size:7.5pt;font-weight:700;color:#334155;padding:1.4mm 1.8mm;border-bottom:0.3mm solid #94a3b8;text-align:left}
  .rp-sec td{padding:1.2mm 1.8mm;border-bottom:0.2mm solid #e2e8f0;vertical-align:top}
  .rp-sec tr{break-inside:avoid}
  .rp-sec .r{text-align:right;white-space:nowrap}
  .rp-sec tfoot td{font-weight:800;border-top:0.4mm solid #334155;border-bottom:none;background:#f8fafc}
  .rp-empty{color:#64748b;font-style:italic;padding:2mm 0}
  .rp-foot{margin-top:4mm;font-size:7pt;color:#94a3b8;text-align:right}
}
`;

/** Rapor sayfası açıkken PDF içeriği gizlice hazır durur; window.print() onu basar */
export const ReportPrint: React.FC<{ doc: PrintDoc }> = ({ doc }) => createPortal(
  <div id="rp-print">
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
    <div className="rp-foot">Enyap Isı Teklif &amp; Takip</div>
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
