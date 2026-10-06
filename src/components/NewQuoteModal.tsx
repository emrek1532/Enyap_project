import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Quote, QuoteItem, UrgencyLevel, UserRole, Customer } from '../types';
import { findCustomer } from '../lib/customers';

interface NewQuoteModalProps {
  currentRole: UserRole;
  onSaveQuote: (quote: Quote) => void;
  onClose: () => void;
  customers?: Customer[];
  initialCustomer?: Customer | null;
}

const COMMON_PRODUCTS = [
  '24 kW Tam Yoğuşmalı Kombi (Enyap EcoHeat)',
  '28 kW Tam Yoğuşmalı Kombi (Enyap EcoHeat Pro)',
  '35 kW Tam Yoğuşmalı Kombi (Enyap MaxHeat)',
  '150 kW Duvar Tipi Yoğuşmalı Kaskad Kazan',
  '600x1000 Panel Radyatör PKKP Tip 22',
  '600x1200 Panel Radyatör PKKP Tip 22',
  '16x2 Oksijen Bariyerli Pex-A Yerden Isıtma Borusu',
  'Yerden Isıtma Kollektör Seti 8 Ağızlı Debimetreli',
  'Termostatik Radyatör Vanası 1/2"',
  'DN50 Flanşlı Statik Balans Vanası',
  '200 Lt Kapalı Genleşme Deposu 10 Bar',
  '100 kW Plakalı Eşanjör Paslanmaz'
];

export const NewQuoteModal: React.FC<NewQuoteModalProps> = ({
  currentRole,
  onSaveQuote,
  onClose,
  customers = [],
  initialCustomer = null,
}) => {
  // Form fields
  const [customerName, setCustomerName] = useState(initialCustomer?.name || '');
  const [city, setCity] = useState(initialCustomer?.city || 'Isparta');

  // Kayıtlı bir müşteri seçilince şehir / yetkili / telefon otomatik dolsun
  const handleCustomerNameChange = (value: string) => {
    setCustomerName(value);
    const match = findCustomer(customers, value);
    if (match) {
      if (match.city) setCity(match.city);
    }
  };
  const [projectLocation, setProjectLocation] = useState('');
  const [urgency, setUrgency] = useState<UrgencyLevel>('normal');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([
    {
      id: 'it-1',
      productName: '',
      quantity: 1,
      unit: 'Adet',
      unitPrice: 0,
      discount: 0,
      vatRate: 20,
      totalPrice: 0,
    }
  ]);

  const handleItemChange = (index: number, field: keyof QuoteItem, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      const target = { ...updated[index], [field]: value };

      // Calculate line total
      const qty = Number(target.quantity) || 0;
      const price = Number(target.unitPrice) || 0;
      const disc = Number(target.discount) || 0;
      const net = qty * price * (1 - disc / 100);
      const vat = net * 0.20;
      target.totalPrice = Math.round(net + vat);

      updated[index] = target;
      return updated;
    });
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `it-${Date.now()}`,
        productName: '',
        quantity: 1,
        unit: 'Adet',
        unitPrice: 0,
        discount: 0,
        vatRate: 20,
        totalPrice: 0,
      }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalQuoteAmount = items.reduce((sum, it) => sum + (it.totalPrice || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;

    const quoteId = 'qt-' + Date.now();
    const count = Math.floor(Math.random() * 900) + 100;
    const now = new Date();
    const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const newQuote: Quote = {
      id: quoteId,
      quoteNumber: `EY-${new Date().getFullYear()}-0${count}`,
      customerName: customerName.trim(),
      customerPhone: '',
      city: city.trim(),
      projectLocation: projectLocation.trim() || undefined,
      requestChannel: 'telefon',
      urgency: urgency,
      status: 'gonderildi',
      items: items.filter(it => it.productName.trim().length > 0),
      totalAmount: totalQuoteAmount,
      currency: 'TRY',
      validUntil: in5Days,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: currentRole,
      assignedTo: 'istanbul',
      notes: notes.trim() || undefined,
      isEncrypted: false,
    };

    onSaveQuote(newQuote);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-brand-600 text-white flex items-center justify-between border-b border-brand-700">
          <div>
            <h3 className="font-black text-base sm:text-lg">
              + Yeni Teklif Talebi Girişi
            </h3>
            <p className="text-xs text-brand-100">
              Müşteriyi seçin, malzemeleri girin ve kaydedin.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-brand-100 hover:text-white hover:bg-brand-700 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm flex-1">
          
            <form id="newQuoteForm" onSubmit={handleSubmit} className="space-y-4">
              
              {/* Customer & Location Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Müşteri / Firma Adı *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Yazmaya başlayın, kayıtlı müşterilerden seçin..."
                    list="quote-customer-list"
                    autoComplete="off"
                    value={customerName}
                    onChange={(e) => handleCustomerNameChange(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                  />
                  <datalist id="quote-customer-list">
                    {customers.map((c) => (
                      <option key={c.id} value={c.name}>{c.city}</option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Şehir & İlçe *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: Isparta / Merkez, Burdur / Bucak..."
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Proje / Şantiye Bilgisi
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: Modern Evler 32 Konut Projesi"
                    value={projectLocation}
                    onChange={(e) => setProjectLocation(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Aciliyet
                    </label>
                    <select
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                    >
                      <option value="acil">Acil (Aynı Gün)</option>
                      <option value="yuksek">Yüksek (24 Saat)</option>
                      <option value="normal">Normal</option>
                      <option value="dusuk">Düşük</option>
                    </select>
                </div>
              </div>

              {/* Items List */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Talep Edilen Malzemeler ({items.length} Kalem)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs text-brand-600 font-bold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    + Kalem Ekle
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {items.map((item, index) => (
                    <div key={item.id} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <input
                            type="text"
                            required
                            placeholder="Malzeme adı (Örn: 24 kW Kombi, Panel Radyatör, Pex Boru...)"
                            value={item.productName}
                            onChange={(e) => handleItemChange(index, 'productName', e.target.value)}
                            list={`prod-list-${index}`}
                            className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white"
                          />
                          <datalist id={`prod-list-${index}`}>
                            {COMMON_PRODUCTS.map((cp) => (
                              <option key={cp} value={cp} />
                            ))}
                          </datalist>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <label className="block text-[10px] text-slate-500">Miktar</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 1)}
                            className="w-full p-1 border border-slate-300 rounded bg-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Birim</label>
                          <select
                            value={item.unit}
                            onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                            className="w-full p-1 border border-slate-300 rounded bg-white text-xs"
                          >
                            <option value="Adet">Adet</option>
                            <option value="Metre">Metre</option>
                            <option value="Takım">Takım</option>
                            <option value="Paket">Paket</option>
                            <option value="Set">Set</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Birim Fiyat (TL)</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Opsiyonel"
                            value={item.unitPrice || ''}
                            onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full p-1 border border-slate-300 rounded bg-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">İskonto %</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={item.discount || ''}
                            onChange={(e) => handleItemChange(index, 'discount', parseFloat(e.target.value) || 0)}
                            className="w-full p-1 border border-slate-300 rounded bg-white text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Not
                </label>
                <textarea
                  rows={2}
                  placeholder="Müşteri pazartesiye kadar yanıt istiyor, ödeme nakit olacak..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

            </form>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {totalQuoteAmount > 0 && (
              <span>Tahmini Toplam: <strong>{totalQuoteAmount.toLocaleString('tr-TR')} TL</strong></span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-colors"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={() => {
                const form = document.getElementById('newQuoteForm') as HTMLFormElement;
                if (form) form.requestSubmit();
              }}
              className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm shadow-sm transition-all"
            >
              Teklifi Kaydet
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
