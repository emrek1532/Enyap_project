import React from 'react';
import { Flame, Printer, X, Download, ShieldCheck } from 'lucide-react';
import { Quote } from '../types';

interface PrintableQuoteModalProps {
  quote: Quote | null;
  onClose: () => void;
}

export const PrintableQuoteModal: React.FC<PrintableQuoteModalProps> = ({
  quote,
  onClose,
}) => {
  if (!quote) return null;

  const handlePrint = () => {
    window.print();
  };

  // Subtotal calculations
  const subtotal = quote.items?.reduce((sum, it) => {
    const raw = it.quantity * (it.unitPrice || 0);
    const discounted = raw * (1 - (it.discount || 0) / 100);
    return sum + discounted;
  }, 0) || 0;

  const vatTotal = subtotal * 0.20; // 20% VAT in Turkey
  const grandTotal = quote.totalAmount || (subtotal + vatTotal);

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* Top Modal Controls (Hidden in Print) */}
        <div className="no-print p-3 sm:p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" />
            <span className="font-bold text-sm sm:text-base">
              Resmi Antetli Teklif Mektubu Önizleme
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs sm:text-sm shadow-sm transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Yazdır / PDF Kaydet</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* The Printable Paper Container */}
        <div className="p-6 sm:p-10 overflow-y-auto flex-1 bg-white text-slate-900 font-sans print:p-0 print:m-0">
          
          {/* Header with Company Logo & Contact */}
          <div className="border-b-2 border-slate-900 pb-5 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md">
                <Flame className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  ENYAP ISI SİSTEMLERİ A.Ş.
                </h1>
                <p className="text-xs text-slate-600 font-semibold uppercase tracking-wider">
                  Kazan, Kombi, Radyatör & Tesisat Teknolojileri
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right text-xs text-slate-600 space-y-0.5">
              <p className="font-bold text-slate-800">Merkez: İkitelli OSB Demirciler San. Sit. İstanbul</p>
              <p>Bölge: Isparta / Akdeniz Satış Temsilciliği</p>
              <p>Tel: +90 (212) 549 00 00 • info@enyapisi.com</p>
              <p className="text-slate-400">Vergi Dairesi: İkitelli V.D. / 338 041 2910</p>
            </div>
          </div>

          {/* Quotation Metadata & Recipient */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 mb-6 text-xs sm:text-sm">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Sayın / Firma Bilgileri:
              </span>
              <h2 className="text-base font-black text-slate-900">
                {quote.customerName}
              </h2>
              {quote.customerContact && (
                <p className="text-slate-700 font-medium">Yetkili: {quote.customerContact}</p>
              )}
              {quote.customerPhone && (
                <p className="text-slate-700">Tel: {quote.customerPhone}</p>
              )}
              <p className="text-slate-700">Şehir / Konum: {quote.city} {quote.projectLocation ? `(${quote.projectLocation})` : ''}</p>
            </div>

            <div className="space-y-1 sm:text-right">
              <div>
                <span className="text-slate-500 font-medium">Teklif Referans No: </span>
                <span className="font-mono font-black text-slate-950 text-sm sm:text-base">{quote.quoteNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Düzenleme Tarihi: </span>
                <span className="font-bold text-slate-800">{new Date(quote.createdAt).toLocaleDateString('tr-TR')}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Geçerlilik Tarihi: </span>
                <span className="font-bold text-slate-800">{quote.validUntil || '7 Gün'}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Hazırlayan: </span>
                <span className="font-bold text-orange-700">Şakir Emre - Satış Pazarlama Müh.</span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-6 border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-900 text-white font-bold">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3">Malzeme Tanımı & Özellikleri</th>
                  <th className="p-3 text-center">Miktar</th>
                  <th className="p-3 text-right">Birim Fiyat</th>
                  <th className="p-3 text-center">İsk. %</th>
                  <th className="p-3 text-right">Toplam Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {quote.items?.map((item, idx) => {
                  const lineRaw = item.quantity * (item.unitPrice || 0);
                  const lineNet = lineRaw * (1 - (item.discount || 0) / 100);
                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{item.productName}</div>
                        {item.notes && <div className="text-xs text-slate-500 italic">{item.notes}</div>}
                      </td>
                      <td className="p-3 text-center font-bold text-slate-700">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="p-3 text-right text-slate-800 font-medium whitespace-nowrap">
                        {item.unitPrice ? `${item.unitPrice.toLocaleString('tr-TR')} TL` : '-'}
                      </td>
                      <td className="p-3 text-center text-slate-600 font-bold">
                        %{item.discount || 0}
                      </td>
                      <td className="p-3 text-right font-black text-slate-900 whitespace-nowrap">
                        {item.totalPrice ? `${item.totalPrice.toLocaleString('tr-TR')} TL` : `${lineNet.toLocaleString('tr-TR')} TL`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
            <div className="text-xs text-slate-600 space-y-1 max-w-md">
              <p className="font-bold text-slate-800 uppercase tracking-wider mb-1">Ticari Koşullar & Şartlar:</p>
              <p>• Teslimat: İstanbul fabrika/depo teslim veya anlaşmalı ambar ile sevk.</p>
              <p>• Nakliye ve sigorta alıcıya aittir (Özel anlaşmalar saklıdır).</p>
              <p>• Fiyatlarımıza %20 Katma Değer Vergisi (KDV) dahildir.</p>
              <p>• Garanti süresi devreye alma tarihinden itibaren 2 yıldır.</p>
            </div>

            <div className="w-full sm:w-72 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs sm:text-sm space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>Ara Toplam:</span>
                <span className="font-bold">{subtotal.toLocaleString('tr-TR')} TL</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>KDV (%20):</span>
                <span className="font-bold">{vatTotal.toLocaleString('tr-TR')} TL</span>
              </div>
              <div className="border-t-2 border-slate-900 pt-2 flex justify-between text-base font-black text-slate-950">
                <span>GENEL TOPLAM:</span>
                <span className="text-orange-600">{grandTotal.toLocaleString('tr-TR')} TL</span>
              </div>
            </div>
          </div>

          {/* Signatures & Seal Area */}
          <div className="border-t border-slate-200 pt-6 grid grid-cols-2 gap-8 text-center text-xs">
            <div>
              <p className="font-bold text-slate-800">Teklifi Hazırlayan</p>
              <p className="text-slate-500">Şakir Emre</p>
              <p className="text-[11px] text-slate-400">Satış Pazarlama Mühendisi (Isparta)</p>
              <div className="mt-8 border-b border-dashed border-slate-400 w-32 mx-auto" />
              <p className="text-[10px] text-slate-400 mt-1">İmza / Kaşe</p>
            </div>

            <div>
              <p className="font-bold text-slate-800">Teklif Onayı</p>
              <p className="text-slate-500">Enyap Isı Sistemleri A.Ş.</p>
              <p className="text-[11px] text-slate-400">İstanbul Satış & Operasyon Müdürlüğü</p>
              <div className="mt-8 border-b border-dashed border-slate-400 w-32 mx-auto" />
              <p className="text-[10px] text-slate-400 mt-1">Yetkili İmza / Kaşe</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
