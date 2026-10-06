import React, { useState } from 'react';
import { Truck, Calendar, MapPin, Phone, User, Package, FileText } from 'lucide-react';
import { Order, OrderStatus, UserRole, Quote, Customer } from '../types';
import { findCustomer } from '../lib/customers';

interface NewOrderModalProps {
  currentRole: UserRole;
  initialQuote?: Quote | null;
  onSaveOrder: (order: Order) => void;
  onClose: () => void;
  customers?: Customer[];
}

export const NewOrderModal: React.FC<NewOrderModalProps> = ({
  currentRole,
  initialQuote,
  onSaveOrder,
  onClose,
  customers = [],
}) => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const [customerName, setCustomerName] = useState(initialQuote?.customerName || '');
  const [customerContact, setCustomerContact] = useState(initialQuote?.customerContact || '');
  const [customerPhone, setCustomerPhone] = useState(initialQuote?.customerPhone || '');
  const [deliveryAddress, setDeliveryAddress] = useState(initialQuote?.projectLocation || initialQuote?.city || 'Isparta');
  const [city, setCity] = useState(initialQuote?.city || 'Isparta');
  
  // Format items summary from initial quote
  const defaultItemsSummary = initialQuote?.items
    ? initialQuote.items.map(it => `${it.quantity} ${it.unit} ${it.productName}`).join(', ')
    : '';

  const [itemsSummary, setItemsSummary] = useState(defaultItemsSummary);
  const [totalAmount, setTotalAmount] = useState<number>(initialQuote?.totalAmount || 0);
  const [targetShippingDate, setTargetShippingDate] = useState(tomorrowStr);
  const [carrierCompany, setCarrierCompany] = useState('Isparta Öz Ambar Nakliyat');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [driverContact, setDriverContact] = useState('');
  const [status, setStatus] = useState<OrderStatus>('hazirlaniyor');
  const [statusNotes, setStatusNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !targetShippingDate) return;

    const count = Math.floor(Math.random() * 900) + 100;
    const newOrder: Order = {
      id: 'ord-' + Date.now(),
      orderNumber: `SP-${new Date().getFullYear()}-0${count}`,
      quoteId: initialQuote?.id,
      quoteNumber: initialQuote?.quoteNumber,
      customerName: customerName.trim(),
      customerContact: customerContact.trim() || undefined,
      customerPhone: customerPhone.trim(),
      deliveryAddress: deliveryAddress.trim(),
      city: city.trim(),
      itemsSummary: itemsSummary.trim() || 'Muhtelif Isıtma Malzemeleri',
      totalAmount: totalAmount || 0,
      currency: 'TRY',
      orderDate: todayStr,
      targetShippingDate: targetShippingDate,
      carrierCompany: carrierCompany.trim(),
      trackingNumber: trackingNumber.trim() || undefined,
      driverContact: driverContact.trim() || undefined,
      status: status,
      statusNotes: statusNotes.trim() || undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: currentRole,
    };

    onSaveOrder(newOrder);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-400" />
            <h3 className="font-black text-base sm:text-lg">
              {initialQuote ? `Teklifi Siparişe & Sevkiyata Çevir (${initialQuote.quoteNumber})` : 'Yeni Sipariş & Sevkiyat Planla'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3.5 text-xs sm:text-sm">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Müşteri / Firma Adı *
              </label>
              <input
                type="text"
                required
                list="order-customer-list"
                autoComplete="off"
                placeholder="Kayıtlı müşterilerden seçin..."
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  const match = findCustomer(customers, e.target.value);
                  if (match) {
                    if (match.city) setCity(match.city);
                  }
                }}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
              />
              <datalist id="order-customer-list">
                {customers.map((c) => (
                  <option key={c.id} value={c.name}>{c.city}</option>
                ))}
              </datalist>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Teslimat Şantiyesi / Adresi *
              </label>
              <input
                type="text"
                required
                placeholder="Örn: Isparta Modernevler Mah. 102. Cad. No:5"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Sevk Edilecek Malzeme Listesi *
              </label>
              <textarea
                rows={2}
                required
                placeholder="Örn: 32 Adet 24kW Kombi, 1600 mt Pex Boru..."
                value={itemsSummary}
                onChange={(e) => setItemsSummary(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>

            <div className="bg-brand-50 p-3 rounded-xl border border-brand-200 sm:col-span-2">
              <label className="block text-xs font-black text-brand-900 mb-1 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-brand-600" />
                Hedef Sevk Tarihi (Ne Zaman Sevk Edilecek?) *
              </label>
              <input
                type="date"
                required
                value={targetShippingDate}
                onChange={(e) => setTargetShippingDate(e.target.value)}
                className="w-full p-2 border border-brand-300 rounded-lg text-sm bg-white font-bold text-slate-900"
              />
              <p className="text-[11px] text-brand-700 mt-1">
                Bu tarih ortak takvimde ve ana sayfada sevk uyarısı olarak otomatik görüntülenecektir.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nakliye / Ambar Firması
              </label>
              <input
                type="text"
                placeholder="Örn: Isparta Öz Ambarı, Yurtiçi Kargo..."
                value={carrierCompany}
                onChange={(e) => setCarrierCompany(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                İrsaliye / Fiş Takip No
              </label>
              <input
                type="text"
                placeholder="Varsa giriniz..."
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Şoför / Nakliyeci İletişim & Plaka
              </label>
              <input
                type="text"
                placeholder="Örn: 32 K 4501 - Mehmet Kaptan"
                value={driverContact}
                onChange={(e) => setDriverContact(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Başlangıç Durumu
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OrderStatus)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                <option value="hazirlaniyor">Hazırlanıyor (Depo Topluyor)</option>
                <option value="depoda_hazir">Depoda Hazır (Paletlendi)</option>
                <option value="sevk_edildi">Sevk Edildi / Yolda</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-3 border-t border-slate-200">
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-all"
            >
              🚚 Sevkiyatı Kaydet ve Takvime Ekle
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200"
            >
              İptal
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
