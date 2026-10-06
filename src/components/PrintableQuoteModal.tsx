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
  gross: number;
  discAmount: number;
  net: number;
  cur: Cur;
  rows: number; // ürün adı kaç satıra yayılıyor
}

interface Totals { gross: number; discount: number; net: number; vat: number; grand: number }

/*
 * Ölçüler (mm) Enyap'ın resmi "FİYAT TEKLİFİ" PDF'inden alınmıştır:
 * kalem satırları 71,2 mm'den başlar, 5,04 mm aralıkla 28 satır sığar, alt bölüm 213,9 mm'dedir.
 */
const ROW_TOP = 71.2;
const ROW_PITCH = 5.04;
const ROWS_PER_PAGE = 28;
/** Ürün tanımı sütununa (86 mm) bir satırda sığan yaklaşık karakter sayısı */
const NAME_CHARS_PER_ROW = 52;
const VAT_RATE = 0.2;

/** Kuruşa yuvarlama (0,795 → 0,80; kayan nokta hatası olmadan) */
const round2 = (v: number) => Math.round(parseFloat((v * 100).toPrecision(12))) / 100;

const num = (v: number) =>
  v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const trDate = (d: Date) => d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const curOf = (c?: Quote['currency']): Cur => (c === 'USD' ? 'USD' : c === 'EUR' ? 'EUR' : 'TL');

const emptyTotals = (): Totals => ({ gross: 0, discount: 0, net: 0, vat: 0, grand: 0 });

/** Kalemlerden döviz cinsine göre ara toplam / iskonto / KDV / genel toplam */
const sumLines = (lines: Line[]): Record<Cur, Totals> => {
  const t: Record<Cur, Totals> = { USD: emptyTotals(), EUR: emptyTotals(), TL: emptyTotals() };
  // Resmi teklifteki gibi: iskonto ve net tutar her kalemde ayrı kuruşa yuvarlanıp toplanır
  lines.forEach(l => {
    t[l.cur].gross += l.gross;
    t[l.cur].discount += l.discAmount;
    t[l.cur].net += l.net;
  });
  (Object.keys(t) as Cur[]).forEach(c => {
    t[c].gross = round2(t[c].gross);
    t[c].discount = round2(t[c].discount);
    t[c].net = round2(t[c].net);
    t[c].vat = round2(t[c].net * VAT_RATE);
    t[c].grand = round2(t[c].net + t[c].vat);
  });
  return t;
};

/** Excel'den aktarılan tekliflerin kalemi yok; tutarlar KDV hariç döviz kırılımından gelir */
const importedTotals = (q: Quote): Record<Cur, Totals> => {
  const mk = (net: number): Totals => ({ gross: net, discount: 0, net, vat: net * VAT_RATE, grand: net * (1 + VAT_RATE) });
  return {
    USD: mk(q.amountUsd || 0),
    EUR: mk(q.amountEur || 0),
    TL: mk(q.amountTry || (q.amountUsd || q.amountEur ? 0 : q.totalAmount || 0)),
  };
};

const fileNameFor = (q: Quote) => {
  const firm = q.customerName.split(/\s+/).slice(0, 2).join('_').replace(/[^\p{L}\p{N}_]/gu, '');
  const d = new Date(q.createdAt);
  const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  return `${firm}_${q.quoteNumber}_${date}`;
};

/** Şablondaki gibi mm cinsinden mutlak konumlanmış metin */
const T: React.FC<{
  x?: number; r?: number; y: number; w?: number;
  b?: boolean; i?: boolean; red?: boolean; size?: number; u?: boolean; lh?: number;
  children?: React.ReactNode;
}> = ({ x, r, y, w, b, i, red, size, u, lh, children }) => (
  <div
    className="rq-t"
    style={{
      left: x !== undefined ? `${x}mm` : undefined,
      right: r !== undefined ? `${210 - r}mm` : undefined,
      top: `${y}mm`,
      width: w !== undefined ? `${w}mm` : undefined,
      whiteSpace: w !== undefined ? 'normal' : 'nowrap',
      fontWeight: b ? 700 : 400,
      fontStyle: i ? 'italic' : 'normal',
      color: red ? '#e00000' : undefined,
      fontSize: size ? `${size}pt` : undefined,
      textDecoration: u ? 'underline' : undefined,
      textUnderlineOffset: u ? '0.6mm' : undefined,
      lineHeight: lh ? `${lh}mm` : undefined,
    }}
  >
    {children}
  </div>
);

/** Yatay çizgi (şablondaki kalın tablo çizgileri) */
const HLine: React.FC<{ y: number; x1?: number; x2?: number }> = ({ y, x1 = 8.2, x2 = 203.2 }) => (
  <div className="rq-hl" style={{ top: `${y}mm`, left: `${x1}mm`, width: `${x2 - x1}mm` }} />
);

const PAGE_CSS = `
.rq-page{position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;color:#000;
  font-family:Arial,Arimo,'Liberation Sans',Helvetica,sans-serif;font-size:8pt;line-height:1;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.rq-t{position:absolute}
.rq-hl{position:absolute;height:0.35mm;background:#000}
.rq-img{position:absolute;display:block;max-width:none}
.rq-box{position:absolute;border:0.3mm solid #000;border-radius:3mm}
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
    return (quote.items || []).map((it, i) => {
      const price = Number(it.unitPrice) || 0;
      const disc = Number(it.discount) || 0;
      const qty = Number(it.quantity) || 0;
      const netUnit = price * (1 - disc / 100);
      const gross = round2(qty * price);
      const discAmount = round2(qty * price * disc / 100);
      const name = (it.productName + (it.notes ? ` ${it.notes}` : '')).trim();
      return {
        no: i + 1,
        name,
        qty,
        unit: (it.unit || 'Adet').toLocaleUpperCase('tr-TR'),
        price,
        disc,
        netUnit,
        gross,
        discAmount,
        net: round2(qty * price - qty * price * disc / 100),
        cur: curOf(it.currency || quote.currency),
        rows: Math.max(1, Math.ceil(name.length / NAME_CHARS_PER_ROW)),
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

  // Sayfalara böl: uzun ürün adları birden fazla satır kaplar
  const pages: Line[][] = [];
  let used = ROWS_PER_PAGE;
  lines.forEach(l => {
    if (used + l.rows > ROWS_PER_PAGE) { pages.push([]); used = 0; }
    pages[pages.length - 1].push(l);
    used += l.rows;
  });
  if (pages.length === 0) pages.push([]);

  const useImported = lines.length === 0 && !!quote.imported;
  const giver = (quote.preparedBy || 'Emre Karakaya').toLocaleUpperCase('tr-TR');
  const quoteDate = trDate(new Date(quote.createdAt));
  const stamp = `${trDate(printedAt)} ${printedAt.toLocaleTimeString('tr-TR')}`;
  const phone = (quote.customerPhone || '').trim();
  const paymentTerm = quote.paymentTerm ? quote.paymentTerm.toLocaleUpperCase('tr-TR') : '';

  const renderPage = (pi: number) => {
    const pageLines = pages[pi];
    // Şablondaki gibi her sayfanın altında o sayfaya kadarki toplamlar
    const totals = useImported ? importedTotals(quote) : sumLines(pages.slice(0, pi + 1).flat());

    let rowIndex = 0;
    const rows = pageLines.map(l => {
      const y = ROW_TOP + rowIndex * ROW_PITCH;
      rowIndex += l.rows;
      return (
        <React.Fragment key={l.no}>
          <T r={14.7} y={y}>{l.no})</T>
          <T x={16.9} y={y - (ROW_PITCH - 2.82) / 2} w={86} lh={ROW_PITCH}>{l.name}</T>
          <T r={111.7} y={y}>{num(l.qty)}</T>
          <T x={115} y={y}>{l.unit}</T>
          <T r={138.1} y={y}>{num(l.price)}</T>
          <T r={146.1} y={y}>{Math.round(l.disc)}</T>
          <T x={148.5} y={y}>0,00</T>
          <T r={168.9} y={y}>{num(l.netUnit)}</T>
          <T x={169.6} y={y}>{l.cur}</T>
          <T r={194.2} y={y}>{num(l.net)}</T>
          <T x={195.5} y={y}>{l.cur}</T>
        </React.Fragment>
      );
    });
    if (useImported) {
      rowIndex = 1;
      rows.push(
        <React.Fragment key="imp">
          <T r={14.7} y={ROW_TOP}>1)</T>
          <T x={16.9} y={ROW_TOP} w={86}>{quote.notes || 'Teklif toplamı (kalem detayı sistemde yok)'}</T>
        </React.Fragment>
      );
    }
    // Sayfa dolmadıysa son kalemin altına çizgi (şablonun 2. sayfasındaki gibi)
    const endLineY = ROW_TOP + (rowIndex - 1) * ROW_PITCH + 6.4;

    const sumRows: [string, keyof Totals, number][] = [
      ['Ara Toplam', 'gross', 221.1],
      ['Toplam İskonto', 'discount', 226.9],
      ['Ara Toplam', 'net', 232.7],
      ['KDV', 'vat', 239.1],
      ['G.TOPLAM', 'grand', 244.4],
    ];

    return (
      <div className="rq-page">
        {/* Başlık */}
        <img src="/teklif-logo.jpg" alt="Enyap Isı Sistemleri Pazarlama Ltd. Şti." className="rq-img"
          style={{ left: '10.3mm', top: '10mm', width: '52.1mm', height: '21.7mm' }} />
        <T x={182.2} y={8.3}>Sayfa</T>
        <T r={195} y={8.3}>{pi + 1}</T>
        <T r={194} y={13.5}>{stamp}</T>
        <T x={101.3} y={16.4} b size={10} u>FİYAT TEKLİFİ</T>

        {/* Firma ve teklif bilgileri */}
        <T x={9} y={35.1} b>Firma</T><T x={26.6} y={35.1} b>:</T>
        <T x={36.2} y={35.1} b w={98}>{quote.customerName.toLocaleUpperCase('tr-TR')}</T>
        <T x={9} y={43.8} b>Tel</T><T x={26.6} y={43.8} b>:</T><T x={36.2} y={43.5} b>{phone}</T>
        <T x={9} y={50.4} b>Faks</T><T x={26.6} y={50.4} b>:</T>
        <T x={136.5} y={35.1} b>Teklif No</T><T x={166.3} y={35.1} b>:</T><T x={175.2} y={35.1} b>{quote.quoteNumber}</T>
        <T x={136.5} y={43.5} b>Teklif Tarihi</T><T x={166.3} y={43.5} b>:</T><T x={175.2} y={43.5} b>{quoteDate}</T>
        <T x={136.5} y={50.4} b>Vade Tarihi</T><T x={174.4} y={50.4} b>{paymentTerm}</T>

        {/* Tablo başlığı */}
        <HLine y={61.1} />
        <T x={7.7} y={62.3} b i>S. No</T>
        <T x={16.9} y={62.3} b i>Ürün Tanımı</T>
        <T x={105.3} y={62} b i>Miktar</T>
        <T x={116.2} y={62} b i>Br.</T>
        <T x={127.8} y={62.3} b i>B.Fiyatı</T>
        <T x={146} y={62.3} b i>İsk.%</T>
        <T x={159.2} y={62.3} b i>Net Bir. Fy.</T>
        <T x={176.2} y={62} b>Net Tutarı</T>
        <T x={195.5} y={62.3} b>Dvz</T>
        <HLine y={67.4} x1={7.7} x2={204} />

        {rows}
        {rowIndex > 0 && rowIndex < ROWS_PER_PAGE && <HLine y={endLineY} />}

        {/* Alt bölüm: teklif veren, onay-kaşe, toplamlar */}
        <HLine y={213.8} />
        <T x={61.6} y={215.8} b>FİRMA</T>
        <T x={58.5} y={219.2} b>ONAY-KAŞE</T>
        <div className="rq-box" style={{ left: '48.7mm', top: '224.6mm', width: '36.7mm', height: '21.1mm' }} />
        <T x={8.5} y={221.1} b>Teklif Veren</T>
        <T x={8} y={225} b>{giver}</T>

        <T x={121.3} y={215.8} b>USD TOPLAM</T>
        <T x={147} y={215.8} b>EUR TOPLAM</T>
        <T x={174.2} y={215.8} b>TL TOPLAM</T>
        {sumRows.map(([label, key, y]) => (
          <React.Fragment key={label + key}>
            <T x={91.5} y={y} b>{label}</T>
            <T x={127} y={y} b red>{num(totals.USD[key])}</T>
            <T x={152.2} y={y} b red>{num(totals.EUR[key])}</T>
            <T x={177.8} y={y}>{num(totals.TL[key])}</T>
          </React.Fragment>
        ))}
        <HLine y={252.4} x1={8} x2={202.9} />

        {/* Koşullar ve markalar */}
        <T x={10.3} y={257.1} b>BU TEKLİF 1 İŞ GÜNÜ GEÇERLİDİR.</T>
        <T x={10.3} y={261.7}>DÖVİZLİ İŞLEMLERDE FATURA TARİHİNDEKİ T.C.M.B SATIŞ DÖVİZ KURU GEÇERLİDİR.</T>
        <T x={10.3} y={266.6} b>ÖDEMESİ SİPARİŞLE BİRLİKTE KAPATILMAYAN ÜRÜNLER İÇİN SEVK TARİHİNDEKİ FİYATLAR GEÇERLİDİR....</T>
        <img src="/teklif-markalar.jpg" alt="FAF, Norm Teknopomp, TDS, Armas, Moneks, Smart, Klepsan, Trakya Döküm" className="rq-img"
          style={{ left: '18.1mm', top: '274mm', width: '173.6mm', height: '12.4mm' }} />
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
