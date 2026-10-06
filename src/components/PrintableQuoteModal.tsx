import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { Quote } from '../types';

interface PrintableQuoteModalProps {
  quote: Quote | null;
  onClose: () => void;
}

type Cur = 'USD' | 'EUR' | 'TL';

interface Line {
  no: number;
  name: string;
  qty: number;
  unit: string;
  price: number;
  disc: number;
  netUnit: number;
  net: number;
  cur: Cur;
}

interface Totals { gross: number; discount: number; net: number; vat: number; grand: number }

/** Bir sayfaya sığan satır sayısı (resmi teklif şablonundaki gibi 28 kalem) */
const ROWS_PER_PAGE = 28;
/** Ürün tanımı sütununa bir satırda sığan yaklaşık karakter sayısı */
const NAME_CHARS_PER_ROW = 56;
const rowsOf = (l: Line) => Math.max(1, Math.ceil(l.name.length / NAME_CHARS_PER_ROW));
const VAT_RATE = 0.2;

const num = (v: number) =>
  v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const trDate = (d: Date) => d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const curOf = (c: Quote['currency']): Cur => (c === 'USD' ? 'USD' : c === 'EUR' ? 'EUR' : 'TL');

const emptyTotals = (): Totals => ({ gross: 0, discount: 0, net: 0, vat: 0, grand: 0 });

/** Kalemlerden döviz cinsine göre ara toplam / iskonto / KDV / genel toplam */
const sumLines = (lines: Line[]): Record<Cur, Totals> => {
  const t: Record<Cur, Totals> = { USD: emptyTotals(), EUR: emptyTotals(), TL: emptyTotals() };
  lines.forEach(l => {
    t[l.cur].gross += l.qty * l.price;
    t[l.cur].net += l.net;
  });
  (Object.keys(t) as Cur[]).forEach(c => {
    t[c].discount = t[c].gross - t[c].net;
    t[c].vat = t[c].net * VAT_RATE;
    t[c].grand = t[c].net + t[c].vat;
  });
  return t;
};

/** Excel'den aktarılan tekliflerin kalemi yok; tutarlar KDV hariç döviz kırılımından gelir */
const importedTotals = (q: Quote): Record<Cur, Totals> => {
  const mk = (net: number): Totals => ({ gross: net, discount: 0, net, vat: net * VAT_RATE, grand: net * (1 + VAT_RATE) });
  return {
    USD: mk(q.amountUsd || 0),
    EUR: mk(q.amountEur || 0),
    TL: mk(q.amountTry ?? (q.amountUsd || q.amountEur ? 0 : q.totalAmount || 0)),
  };
};

const fileNameFor = (q: Quote) => {
  const firm = q.customerName.split(/\s+/).slice(0, 2).join('_').replace(/[^\p{L}\p{N}_]/gu, '');
  const d = new Date(q.createdAt);
  const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  return `${firm}_${q.quoteNumber}_${date}`;
};

const PAGE_CSS = `
.rq-page{width:210mm;height:297mm;overflow:hidden;box-sizing:border-box;padding:9mm 7mm 8mm 7mm;background:#fff;color:#000;
  font-family:Arial,Helvetica,sans-serif;font-size:8.6pt;display:flex;flex-direction:column;position:relative}
.rq-page *{box-sizing:border-box}
.rq-page>*{flex-shrink:0}
.rq-page>.rq-spacer{flex:1 1 0;min-height:0}
.rq-head{display:flex;justify-content:space-between;align-items:flex-start;height:27mm}
.rq-logo{width:58mm;margin-left:2mm;margin-top:1mm}
.rq-title{flex:1;text-align:center;font-weight:bold;font-size:10.5pt;text-decoration:underline;margin-top:11mm;margin-right:22mm}
.rq-meta{text-align:right;font-size:8.4pt;line-height:1.5;padding-right:7mm;padding-top:1mm}
.rq-info{display:grid;grid-template-columns:1fr 1fr;row-gap:3.2mm;font-weight:bold;font-size:8.4pt;padding:0 1mm;margin-top:1mm}
.rq-info .r{display:grid;grid-template-columns:19mm 8mm 1fr}
.rq-info .rr{display:grid;grid-template-columns:31mm 8mm 1fr;padding-left:28mm}
.rq-table{width:100%;border-collapse:collapse;margin-top:5mm;table-layout:fixed}
.rq-table thead th{font-style:italic;font-weight:bold;font-size:8.2pt;text-align:left;padding:1.6mm 1mm 2.2mm;
  border-top:1px solid #000;border-bottom:1.5px solid #000;white-space:nowrap}
.rq-table td{padding:0.6mm 1mm 0.5mm;font-size:8.4pt;line-height:1.25;white-space:nowrap;vertical-align:top}
.rq-table td.nm{white-space:normal}
.rq-table .rt{text-align:right}
.rq-table .ct{text-align:center}
.rq-table tbody tr:last-child td{padding-bottom:2mm}
.rq-table tfoot td{border-top:1.5px solid #000;padding:0}
.rq-spacer{flex:1}
.rq-foot{border-top:1.5px solid #000;border-bottom:1px solid #000;display:grid;grid-template-columns:42mm 50mm 1fr;padding:1.5mm 0 3mm}
.rq-giver{font-weight:bold;font-size:8.4pt;padding-top:7mm;padding-left:1mm;line-height:1.5}
.rq-stamp{text-align:center;font-weight:bold;font-size:8.2pt;line-height:1.2}
.rq-stamp .box{width:38mm;height:21mm;border:1px solid #000;border-radius:3mm;margin:1mm auto 0}
.rq-sum{width:100%;border-collapse:collapse;font-weight:bold;font-size:8.4pt}
.rq-sum th{font-size:8.2pt;text-align:center;padding:0.4mm 0 1.6mm}
.rq-sum td{padding:1.2mm 0}
.rq-sum td.l{text-align:left;padding-left:6mm;width:31mm}
.rq-sum td.v{text-align:center}
.rq-sum td.red{color:#d40000}
.rq-sum td.tl{text-align:right;padding-right:14mm;font-weight:normal}
.rq-notes{font-size:8.1pt;line-height:1.75;padding:3mm 1.5mm 0}
.rq-notes b{font-weight:bold}
.rq-brands{display:block;width:160mm;margin:4mm auto 0}
#rq-print{display:none}
@media print{
  @page{size:A4;margin:0}
  html,body{background:#fff!important;margin:0!important;padding:0!important}
  body>*:not(#rq-print){display:none!important}
  #rq-print{display:block!important}
  .rq-page{break-after:page;page-break-after:always}
  .rq-page:last-child{break-after:auto;page-break-after:auto}
}
`;

export const PrintableQuoteModal: React.FC<PrintableQuoteModalProps> = ({ quote, onClose }) => {
  const printedAt = useMemo(() => new Date(), []);
  // Telefonda A4 sayfası ekrana sığsın diye önizleme küçültülür
  const fitZoom = () => Math.min(1, (window.innerWidth - 24) / 794);
  const [zoom, setZoom] = useState(fitZoom);
  useEffect(() => {
    const onResize = () => setZoom(fitZoom());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const lines = useMemo<Line[]>(() => {
    if (!quote) return [];
    const cur = curOf(quote.currency);
    return (quote.items || []).map((it, i) => {
      const price = Number(it.unitPrice) || 0;
      const disc = Number(it.discount) || 0;
      const netUnit = price * (1 - disc / 100);
      return {
        no: i + 1,
        name: it.productName + (it.notes ? ` ${it.notes}` : ''),
        qty: Number(it.quantity) || 0,
        unit: (it.unit || 'Adet').toLocaleUpperCase('tr-TR'),
        price,
        disc,
        netUnit,
        net: netUnit * (Number(it.quantity) || 0),
        cur,
      };
    });
  }, [quote]);

  // PDF kaydederken dosya adı tarayıcı başlığından gelir
  useEffect(() => {
    if (!quote) return;
    const prev = document.title;
    document.title = fileNameFor(quote);
    return () => { document.title = prev; };
  }, [quote]);

  if (!quote) return null;

  const pages: Line[][] = [];
  let used = ROWS_PER_PAGE;
  lines.forEach(l => {
    const r = rowsOf(l);
    if (used + r > ROWS_PER_PAGE) { pages.push([]); used = 0; }
    pages[pages.length - 1].push(l);
    used += r;
  });
  if (pages.length === 0) pages.push([]);

  const useImported = lines.length === 0 && quote.imported;
  const giver = (quote.preparedBy || 'Emre Karakaya').toLocaleUpperCase('tr-TR');
  const quoteDate = trDate(new Date(quote.createdAt));
  const stamp = `${trDate(printedAt)} ${printedAt.toLocaleTimeString('tr-TR')}`;
  const phone = (quote.customerPhone || '').trim();

  const renderPage = (pi: number) => {
    const pageLines = pages[pi];
            // Şablondaki gibi her sayfanın altında o sayfaya kadarki toplamlar
            const totals = useImported ? importedTotals(quote) : sumLines(pages.slice(0, pi + 1).flat());
            return (
              <div className="rq-page">
                  <div className="rq-head">
                    <img src="/teklif-logo.jpg" alt="Enyap Isı Sistemleri Pazarlama Ltd. Şti." className="rq-logo" />
                    <div className="rq-title">FİYAT TEKLİFİ</div>
                    <div className="rq-meta">
                      <div>Sayfa&nbsp;&nbsp;&nbsp;{pi + 1}</div>
                      <div>{stamp}</div>
                    </div>
                  </div>

                  <div className="rq-info">
                    <div className="r"><span>Firma</span><span>:</span><span>{quote.customerName.toLocaleUpperCase('tr-TR')}</span></div>
                    <div className="rr"><span>Teklif No</span><span>:</span><span>{quote.quoteNumber}</span></div>
                    <div className="r"><span>Tel</span><span>:</span><span>{phone}</span></div>
                    <div className="rr"><span>Teklif Tarihi</span><span>:</span><span>{quoteDate}</span></div>
                    <div className="r"><span>Şehir</span><span>:</span><span>{(quote.city || '').toLocaleUpperCase('tr-TR')}</span></div>
                    <div className="rr"><span>Vade Tarihi</span><span></span><span></span></div>
                  </div>

                  <table className="rq-table">
                    <thead>
                      <tr>
                        <th style={{ width: '8mm' }}>S. No</th>
                        <th>Ürün Tanımı</th>
                        <th className="rt" style={{ width: '12mm' }}>Miktar</th>
                        <th style={{ width: '10mm' }}>Br.</th>
                        <th className="rt" style={{ width: '16mm' }}>B.Fiyatı</th>
                        <th className="ct" style={{ width: '13mm' }}>İsk.%</th>
                        <th className="rt" style={{ width: '22mm' }}>Net Bir. Fy.</th>
                        <th className="rt" style={{ width: '19mm' }}>Net Tutarı</th>
                        <th style={{ width: '8mm' }}>Dvz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageLines.map(l => (
                        <tr key={l.no}>
                          <td className="rt">{l.no})</td>
                          <td className="nm">{l.name}</td>
                          <td className="rt">{num(l.qty)}</td>
                          <td>{l.unit}</td>
                          <td className="rt">{num(l.price)}</td>
                          <td className="ct">{Math.round(l.disc)}&nbsp;&nbsp;0,00</td>
                          <td className="rt">{num(l.netUnit)} {l.cur}</td>
                          <td className="rt">{num(l.net)}</td>
                          <td>{l.cur}</td>
                        </tr>
                      ))}
                      {useImported && (
                        <tr>
                          <td className="rt">1)</td>
                          <td className="nm">{quote.notes || 'Teklif toplamı (kalem detayı sistemde yok)'}</td>
                          <td colSpan={7}></td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot><tr><td colSpan={9}></td></tr></tfoot>
                  </table>

                  <div className="rq-spacer" />

                  <div className="rq-foot">
                    <div className="rq-giver">Teklif Veren<br />{giver}</div>
                    <div className="rq-stamp">FİRMA<br />ONAY-KAŞE<div className="box" /></div>
                    <table className="rq-sum">
                      <thead>
                        <tr><th></th><th>USD TOPLAM</th><th>EUR TOPLAM</th><th>TL TOPLAM</th></tr>
                      </thead>
                      <tbody>
                        {([
                          ['Ara Toplam', 'gross'],
                          ['Toplam İskonto', 'discount'],
                          ['Ara Toplam', 'net'],
                          ['KDV', 'vat'],
                          ['G.TOPLAM', 'grand'],
                        ] as [string, keyof Totals][]).map(([label, key], i) => (
                          <tr key={i}>
                            <td className="l">{label}</td>
                            <td className="v red">{num(totals.USD[key])}</td>
                            <td className="v red">{num(totals.EUR[key])}</td>
                            <td className="tl">{num(totals.TL[key])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rq-notes">
                    <div><b>BU TEKLİF 1 İŞ GÜNÜ GEÇERLİDİR.</b></div>
                    <div>DÖVİZLİ İŞLEMLERDE FATURA TARİHİNDEKİ T.C.M.B SATIŞ DÖVİZ KURU GEÇERLİDİR.</div>
                    <div><b>ÖDEMESİ SİPARİŞLE BİRLİKTE KAPATILMAYAN ÜRÜNLER İÇİN SEVK TARİHİNDEKİ FİYATLAR GEÇERLİDİR....</b></div>
                  </div>
                  <img src="/teklif-markalar.jpg" alt="FAF, Norm Teknopomp, TDS, Armas, Moneks, Smart, Klepsan, Trakya Döküm" className="rq-brands" />
                </div>
            );
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 z-50 flex flex-col">
      <style>{PAGE_CSS}</style>

      <div className="no-print p-3 bg-brand-600 text-white flex items-center justify-between gap-2 shrink-0">
        <span className="font-bold text-sm sm:text-base truncate">Fiyat Teklifi · {quote.quoteNumber}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white hover:bg-brand-50 text-brand-700 font-bold text-xs sm:text-sm shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Yazdır / PDF Kaydet</span>
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-brand-100 hover:text-white hover:bg-brand-700">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 bg-slate-600">
        <div className="flex flex-col items-center gap-4">
          {pages.map((_, pi) => (
            <div key={pi} className="shadow-lg" style={{ zoom }}>{renderPage(pi)}</div>
          ))}
        </div>
      </div>
      {createPortal(<div id="rq-print">{pages.map((_, pi) => <React.Fragment key={pi}>{renderPage(pi)}</React.Fragment>)}</div>, document.body)}
    </div>
  );
};
