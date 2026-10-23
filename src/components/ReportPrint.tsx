import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Send, X } from 'lucide-react';

/** PDF'e basılacak bir tablo bölümü */
export interface PrintSection {
  heading: string;
  note?: string;
  columns: { label: string; align?: 'left' | 'right' }[];
  rows: string[][];
  foot?: string[];
}

/** PDF'teki grafikler (sayfa resmine çizilir) */
export type PrintChart =
  | { type: 'columns'; title: string; months: string[]; series: { label: string; color: string; values: number[] }[] }
  | { type: 'share'; title: string; center?: string; parts: { label: string; value: number; color: string }[] }
  | { type: 'bars'; title: string; color: string; half?: boolean; rows: { label: string; value: number; sub?: string }[] };

export interface PrintDoc {
  title: string;
  period: string;
  /** Üstteki özet kutuları: [etiket, değer, alt satır] */
  summary?: [string, string, string?][];
  /** Özetin altında, tablolardan önce çizilen grafikler */
  charts?: PrintChart[];
  sections: PrintSection[];
  fileName: string;
  /** Alttaki "Enyap Isı Teklif & Takip" yazısını gizle */
  hideFooter?: boolean;
}

const CSS = `
#rp-print{display:none}
.rp-doc{color:#0f172a;font-family:Arial,Arimo,'Liberation Sans',Helvetica,sans-serif;font-size:8.5pt;line-height:1.35;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
.rp-doc .rp-head{display:flex;align-items:center;justify-content:space-between;gap:6mm;border-bottom:0.5mm solid #006ec6;padding:4mm 5mm 3.5mm;margin-bottom:3.5mm}
.rp-doc .rp-head img{height:15mm;display:block}
.rp-doc .rp-head h1{margin:0;font-size:16pt;font-weight:800;text-align:right;color:#0f172a}
.rp-doc .rp-meta{display:flex;justify-content:space-between;align-items:stretch;gap:6mm;background:#f1f6fb;border-radius:2mm;padding:3mm 4mm;margin-bottom:6mm}
.rp-doc .rp-meta i{display:block;font-style:normal;font-size:6.5pt;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em}
.rp-doc .rp-meta b{display:block;font-size:10.5pt;font-weight:800;color:#0f172a;margin-top:0.8mm}
.rp-doc .rp-meta span{display:block;font-size:8pt;color:#475569;margin-top:0.6mm}
.rp-doc .rp-prep{padding-left:3mm;border-left:0.8mm solid #00b293}
.rp-doc .rp-when{text-align:right}
.rp-doc .rp-head p{margin:1mm 0 0;font-size:8.5pt;color:#475569;text-align:right}
.rp-doc .rp-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-bottom:6mm}
.rp-doc .rp-card{border:0.25mm solid #cbd5e1;border-radius:2mm;padding:3.2mm 3.5mm;break-inside:avoid}
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
.rp-doc .rp-charts{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-bottom:5mm}
.rp-doc .rp-ch{border:0.25mm solid #cbd5e1;border-radius:2mm;padding:2.5mm 3mm}
.rp-doc .rp-ch.wide{grid-column:1/-1}
.rp-doc .rp-ch h3{margin:0 0 2mm;font-size:9pt;font-weight:800}
.rp-doc .rp-leg{display:flex;flex-wrap:wrap;gap:1mm 4mm;font-size:7pt;color:#475569;margin-bottom:1.5mm}
.rp-doc .rp-leg i{display:inline-block;width:2.5mm;height:2.5mm;border-radius:0.6mm;margin-right:1mm;vertical-align:-0.3mm}
.rp-doc .rp-cols{display:flex;align-items:flex-end;gap:1.5mm;height:46mm;border-bottom:0.3mm solid #94a3b8}
.rp-doc .rp-cols>div{flex:1;display:flex;align-items:flex-end;justify-content:center;gap:0.5mm;height:100%}
.rp-doc .rp-cols b{display:block;width:100%;max-width:6mm;border-radius:0.6mm 0.6mm 0 0}
.rp-doc .rp-mo{display:flex;gap:1.5mm;font-size:6.5pt;color:#64748b;margin-top:0.8mm}
.rp-doc .rp-mo span{flex:1;text-align:center;white-space:nowrap;overflow:hidden}
.rp-doc .rp-max{font-size:6.5pt;color:#94a3b8;text-align:right;margin-bottom:0.5mm}
.rp-doc .rp-stack{display:flex;height:5mm;border-radius:1.2mm;overflow:hidden;background:#eef2f7;margin:1mm 0 2mm}
.rp-doc .rp-row{display:flex;justify-content:space-between;gap:2mm;font-size:7.5pt;padding:0.6mm 0;border-bottom:0.2mm solid #f1f5f9}
.rp-doc .rp-row span:last-child{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.rp-doc .rp-big{font-size:14pt;font-weight:800;color:#0f172a}
.rp-doc .rp-bar{margin-bottom:2.6mm;font-size:7.5pt}
.rp-doc .rp-bar>div:first-child{display:flex;justify-content:space-between;gap:2mm}
.rp-doc .rp-bar>div:first-child span:last-child{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.rp-doc .rp-bar em{font-style:normal;color:#64748b;font-size:6.5pt}
.rp-doc .rp-track{height:2.2mm;background:#eef2f7;border-radius:1mm;overflow:hidden;margin-top:0.5mm}
.rp-doc .rp-track b{display:block;height:100%;border-radius:1mm}
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

/** Her raporda görünen hazırlayan bilgisi */
export const PREPARER = { name: 'Emre KARAKAYA', title: 'Makine Mühendisi · Bölge Satış Sorumlusu' };

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const tlShort = (n: number) => n >= 1e6 ? `${(n / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn ₺`
  : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString('tr-TR')} B ₺` : `${Math.round(n).toLocaleString('tr-TR')} ₺`;
const tlFull = (n: number) => `${Math.round(n).toLocaleString('tr-TR')} ₺`;

function chartHtml(c: PrintChart): string {
  if (c.type === 'columns') {
    const max = Math.max(1, ...c.series.flatMap(s => s.values));
    const leg = `<div class="rp-leg">${c.series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}: ${tlFull(s.values.reduce((a, b) => a + b, 0))}</span>`).join('')}</div>`;
    const cols = c.months.map((_, mi) => `<div>${c.series.map(s => `<b style="background:${s.color};height:${Math.max(s.values[mi] > 0 ? 1.5 : 0, (s.values[mi] / max) * 100)}%"></b>`).join('')}</div>`).join('');
    return `<div class="rp-ch"><h3>${esc(c.title)}</h3>${leg}<div class="rp-max">en yüksek ${tlShort(max)}</div><div class="rp-cols">${cols}</div>
      <div class="rp-mo">${c.months.map((m, i) => `<span>${i % Math.ceil(c.months.length / 7) ? '' : esc(m)}</span>`).join('')}</div></div>`;
  }
  if (c.type === 'share') {
    const parts = c.parts.filter(p => p.value > 0);
    const total = parts.reduce((a, p) => a + p.value, 0);
    if (!total) return `<div class="rp-ch"><h3>${esc(c.title)}</h3><div class="rp-empty">Bu dönemde kayıt yok.</div></div>`;
    return `<div class="rp-ch"><h3>${esc(c.title)}</h3>${c.center ? `<div class="rp-big">${esc(c.center)}</div>` : ''}
      <div class="rp-stack">${parts.map(p => `<b style="background:${p.color};width:${(p.value / total) * 100}%"></b>`).join('')}</div>
      ${parts.map(p => `<div class="rp-row"><span><i style="display:inline-block;width:2.5mm;height:2.5mm;border-radius:0.6mm;margin-right:1.2mm;vertical-align:-0.3mm;background:${p.color}"></i>${esc(p.label)}</span><span>${tlFull(p.value)} · %${Math.round((p.value / total) * 100)}</span></div>`).join('')}</div>`;
  }
  const max = Math.max(1, ...c.rows.map(r => r.value));
  return `<div class="rp-ch${c.half ? '' : ' wide'}"><h3>${esc(c.title)}</h3>${c.rows.length ? c.rows.map(r => `<div class="rp-bar"><div><span>${esc(r.label)}${r.sub ? ` <em>${esc(r.sub)}</em>` : ''}</span><span>${tlFull(r.value)}</span></div>
    <div class="rp-track"><b style="background:${c.color};width:${Math.max(1.5, (r.value / max) * 100)}%"></b></div></div>`).join('') : '<div class="rp-empty">Bu dönemde kayıt yok.</div>'}</div>`;
}

/** Raporu A4 sayfalarına böler (her sayfa ayrı çizilir: telefonda çok uzun resim sınırına takılmaz, satırlar ikiye bölünmez) */
function reportPages(doc: PrintDoc): string[] {
  const head = `<div class="rp-head"><img src="/teklif-logo.jpg" alt="Enyap" /><h1>${esc(doc.title)}</h1></div>
    <div class="rp-meta"><div class="rp-prep"><i>Hazırlayan</i><b>${esc(PREPARER.name)}</b><span>${esc(PREPARER.title)}</span></div>
    <div class="rp-when"><i>Dönem</i><b>${esc(doc.period)}</b><span>Oluşturulma: ${esc(new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }))}</span></div></div>`;
  const summary = doc.summary?.length
    ? `<div class="rp-sum">${doc.summary.map(([k, v, sub]) => `<div class="rp-card"><b>${esc(k)}</b><span>${esc(v)}</span>${sub ? `<i>${esc(sub)}</i>` : ''}</div>`).join('')}</div>` : '';
  const ROWS = 46; // bir sayfaya sığan satır (başlık payı hariç)
  const pages: string[] = [];
  let cur = head + summary, used = summary ? 17 : 7;
  const flush = () => { pages.push(cur); cur = ''; used = 0; };
  // Grafikler ilk sayfada özetin altına; tablolar sonraki sayfadan başlar
  // Geniş çubuk grafikler (ör. firmalar) ilk sayfaya sığmadığından ikinci sayfanın başına alınır
  if (doc.charts?.length) {
    const isWide = (c: PrintChart) => c.type === 'bars' && !c.half;
    const first = doc.charts.filter(c => !isWide(c)), wide = doc.charts.filter(isWide);
    if (first.length) cur += `<div class="rp-charts">${first.map(chartHtml).join('')}</div>`;
    flush();
    if (wide.length) {
      cur = `<div class="rp-charts">${wide.map(chartHtml).join('')}</div>`;
      used = wide.reduce((t, c) => t + 4 + (c.type === 'bars' ? c.rows.length * 2 : 0), 0);
    }
  }
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

/** Hazırlanmış rapor: PDF dosyası + önizleme için sayfa resimleri */
export interface BuiltReport { file: File; pages: string[]; title: string }

/** Raporu A4 PDF olarak hazırlar (gönderilmez); önizleme için sayfa resimleri de döner */
export async function buildReportPdf(doc: PrintDoc): Promise<BuiltReport> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: doc.title, author: 'Enyap Isı Sistemleri', creator: 'Enyap Isı Teklif & Takip' });
  const margin = 10, w = 210 - margin * 2;
  const previews: string[] = [];
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
        const jpg = canvas.toDataURL('image/jpeg', 0.9);
        if (p > 0) pdf.addPage();
        pdf.addImage(jpg, 'JPEG', margin, margin, w, Math.min(277, (canvas.height / canvas.width) * w));
        previews.push(jpg);
      } finally {
        box.remove();
      }
    }
  } finally {
    style.remove();
  }
  return { file: new File([pdf.output('blob')], `${doc.fileName}.pdf`, { type: 'application/pdf' }), pages: previews, title: doc.title };
}

/** Hazır PDF'i paylaşır (WhatsApp, e-posta…); paylaşım desteklenmiyorsa ya da download=true ise indirir */
export async function sendReportFile(r: BuiltReport, download = false): Promise<string> {
  if (!download && navigator.canShare?.({ files: [r.file] })) {
    // Yalnızca dosya paylaşılır: yanına yazı eklenince WhatsApp dosya adını "DOC-…-WA0001" yapıyor
    try { await navigator.share({ files: [r.file] }); return ''; } catch (e) { if ((e as Error)?.name === 'AbortError') return ''; }
  }
  const url = URL.createObjectURL(r.file);
  const a = document.createElement('a');
  a.href = url; a.download = r.file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `PDF indirildi (${r.file.name}); WhatsApp ya da e-postaya ek olarak ekleyebilirsiniz.`;
}

/** Tüm raporlarda ortak akış: PDF hazırlanır → sayfalar önizlenir → Gönder (paylaş) ya da İndir */
export function useReportSender() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState<BuiltReport | null>(null);
  const open = async (doc: PrintDoc) => {
    if (busy) return;
    setBusy(true); setMsg('');
    try { setPreview(await buildReportPdf(doc)); } catch { setMsg('PDF hazırlanamadı, tekrar deneyin.'); } finally { setBusy(false); }
  };
  const modal = preview && createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/70 flex items-stretch sm:items-center justify-center sm:p-4" onClick={() => setPreview(null)}>
      <div onClick={e => e.stopPropagation()} className="bg-slate-100 w-full sm:max-w-3xl sm:rounded-2xl shadow-2xl flex flex-col h-full sm:h-[92vh] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200 pt-safe">
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-slate-900 truncate">{preview.title}</h3>
            <p className="text-xs text-slate-500">{preview.pages.length} sayfa · göndermeden önce kontrol edin</p>
          </div>
          <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {preview.pages.map((src, i) => (
            <img key={i} src={src} alt={`Sayfa ${i + 1}`} className="w-full max-w-[700px] mx-auto block bg-white shadow-md rounded" />
          ))}
        </div>
        {msg && <p className="px-3 pt-2 bg-white text-xs text-slate-600">{msg}</p>}
        <div className="flex gap-2 p-3 bg-white border-t border-slate-200 pb-safe">
          <button onClick={async () => setMsg(await sendReportFile(preview, true))}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50">
            <Download className="w-4 h-4" /> İndir
          </button>
          <button onClick={async () => { const m = await sendReportFile(preview); setMsg(m); if (!m) setPreview(null); }}
            className="flex-[2] flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold">
            <Send className="w-4 h-4" /> Gönder
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
  return { open, busy, msg, modal };
}
