import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ListPlus, Plus, Trash2 } from 'lucide-react';
import { Quote, QuoteItem, UrgencyLevel, UserRole, Customer } from '../types';
import { findCustomer } from '../lib/customers';
import { TURKISH_CITIES } from '../lib/cities';
import { CURRENCY_LABEL, Currency } from '../lib/money';
import { Material, MATERIAL_UNITS, foldTr, rememberMaterial } from '../lib/materials';
import { SuggestInput } from './SuggestInput';
import { DecimalInput } from './DecimalInput';
import { MaterialPicker } from './MaterialPicker';
import { nextQuoteNumber } from '../lib/quoteRules';

interface NewQuoteModalProps {
  currentRole: UserRole;
  onSaveQuote: (quote: Quote) => void;
  onClose: () => void;
  customers?: Customer[];
  initialCustomer?: Customer | null;
  /** Doluysa form bu teklifi düzenler / revize eder */
  editQuote?: Quote | null;
  /** Otomatik teklif numarası için mevcut teklifler */
  quotes?: Quote[];
}

export const PAYMENT_TERMS = ['PEŞİN', 'KREDİ KARTI', '60 GÜN', '90 GÜN'];

export const NewQuoteModal: React.FC<NewQuoteModalProps> = ({
  currentRole,
  onSaveQuote,
  onClose,
  customers = [],
  initialCustomer = null,
  editQuote = null,
  quotes = [],
}) => {
  // Form fields
  // Yeni teklifte numara otomatik (EK-2026-0001); düzenlemede mevcut numara korunur
  const quoteNumber = useMemo(
    () => (editQuote ? editQuote.quoteNumber : nextQuoteNumber(quotes)),
    [editQuote, quotes],
  );
  const [customerName, setCustomerName] = useState(editQuote?.customerName || initialCustomer?.name || '');
  const [city, setCity] = useState(editQuote?.city || initialCustomer?.city || 'Isparta');
  // Şehir önerileri: 81 il + müşteri kayıtlarındaki şehirler
  const cityOptions = useMemo(() => {
    const set = new Set<string>(TURKISH_CITIES);
    customers.forEach(c => { if (c.city?.trim()) set.add(c.city.trim()); });
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [customers]);

  // Kayıtlı bir müşteri seçilince şehir / yetkili / telefon otomatik dolsun
  const handleCustomerNameChange = (value: string) => {
    setCustomerName(value);
    const match = findCustomer(customers, value);
    if (match) {
      if (match.city) setCity(match.city);
    }
  };
  // Müşteri önerileri: tüm kelimeler geçmeli, adı yazılanla başlayanlar önce
  const customerSuggestions = useMemo(() => {
    const q = foldTr(customerName.trim());
    if (!q) return [];
    const toks = q.split(/\s+/);
    const exact = customers.find(c => foldTr(c.name) === q);
    if (exact) return [];
    return customers
      .map(c => ({ c, f: foldTr(c.name) }))
      .filter(x => toks.every(t => x.f.includes(t)))
      .sort((a, b) => Number(b.f.startsWith(q)) - Number(a.f.startsWith(q)) || a.f.localeCompare(b.f, 'tr'))
      .slice(0, 8)
      .map(x => x.c);
  }, [customers, customerName]);

  const [projectLocation, setProjectLocation] = useState(editQuote?.projectLocation || '');
  const [urgency, setUrgency] = useState<UrgencyLevel>(editQuote?.urgency || 'normal');
  const [paymentTerm, setPaymentTerm] = useState(editQuote?.paymentTerm || '');
  const [notes, setNotes] = useState(editQuote?.notes || '');
  const [items, setItems] = useState<QuoteItem[]>(editQuote?.items?.length
    ? editQuote.items.map(it => ({ ...it, currency: it.currency || editQuote.currency || 'TRY' }))
    : [
    {
      id: 'it-1',
      productName: '',
      quantity: 1,
      unit: 'Adet',
      unitPrice: 0,
      discount: 0,
      vatRate: 20,
      totalPrice: 0,
      currency: 'TRY',
    }
  ]);
  const isEdit = !!editQuote;

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
      target.totalPrice = Math.round((net + vat) * 100) / 100;

      updated[index] = target;
      return updated;
    });
  };

  // Katalogdan seçilen malzemenin birimi, fiyatı ve para birimi kaleme aktarılır
  const handlePickMaterial = (index: number, m: Material) => {
    rememberMaterial(m);
    setItems((prev) => {
      const updated = [...prev];
      const unit = (MATERIAL_UNITS as readonly string[]).includes(m.unit) ? m.unit as QuoteItem['unit'] : 'Adet';
      const target: QuoteItem = {
        ...updated[index],
        code: m.code,
        productName: m.name || m.code,
        unit,
        unitPrice: m.price || 0,
        currency: m.currency,
        vatRate: m.vatRate ?? 20,
      };
      const qty = Number(target.quantity) || 0;
      const net = qty * target.unitPrice * (1 - (Number(target.discount) || 0) / 100);
      target.totalPrice = Math.round(net * 1.2 * 100) / 100;
      updated[index] = target;
      return updated;
    });
  };

  // Koddan malzeme seçilince ad zaten dolar; doğrudan miktara geç
  const focusQuantity = (input: HTMLInputElement) => {
    const qty = input.closest('[data-quote-item]')?.querySelector<HTMLInputElement>('input[data-qty]');
    if (!qty) return false;
    qty.focus();
    qty.select();
    return true;
  };

  const blankItem = (currency?: QuoteItem['currency']): QuoteItem => ({
    id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productName: '',
    quantity: 1,
    unit: 'Adet',
    unitPrice: 0,
    discount: 0,
    vatRate: 20,
    totalPrice: 0,
    currency: currency || 'TRY',
  });

  // Yeni kalem bir öncekinin para birimiyle başlar
  const handleAddItem = () => {
    setItems((prev) => [...prev, blankItem(prev[prev.length - 1]?.currency)]);
  };

  // ---- Kalem sırası: yukarı / aşağı taşı, araya ekle ----
  const pendingFocus = useRef<{ id: string; sel: string; pos?: number } | null>(null);
  const focusItemLater = (id: string, sel = 'input') => { pendingFocus.current = { id, sel }; };
  useEffect(() => {
    const p = pendingFocus.current;
    if (!p) return;
    pendingFocus.current = null;
    const row = document.querySelector<HTMLElement>(`#newQuoteForm [data-item-id="${p.id}"]`);
    row?.scrollIntoView({ block: 'nearest' });
    const el = p.pos !== undefined
      ? row?.querySelectorAll<HTMLElement>('input, select')[p.pos]
      : row?.querySelector<HTMLElement>(p.sel);
    el?.focus();
  }, [items]);

  const moveItem = (index: number, dir: -1 | 1, sel?: string) => {
    const to = index + dir;
    if (to < 0 || to >= items.length) return;
    focusItemLater(items[index].id, sel);
    setItems(prev => {
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  };

  const insertItemAfter = (index: number) => {
    const it = blankItem(items[index]?.currency);
    focusItemLater(it.id);
    setItems(prev => [...prev.slice(0, index + 1), it, ...prev.slice(index + 1)]);
  };

  // ---- Klavye ile kalem girişi ----
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const focusNewItem = useRef(false);
  useEffect(() => {
    if (!focusNewItem.current) return;
    focusNewItem.current = false;
    const rows = document.querySelectorAll<HTMLElement>('#newQuoteForm [data-quote-item]');
    rows[rows.length - 1]?.querySelector<HTMLInputElement>('input')?.focus();
  }, [items.length]);

  const isEmptyItem = (it: QuoteItem) => !it.productName.trim() && !(it.code || '').trim();

  /** Kalemleri bitirip alt kısma geç: sondaki boş kalemi at, Not alanına odaklan */
  const finishItems = () => {
    setItems(prev => (prev.length > 1 && isEmptyItem(prev[prev.length - 1]) ? prev.slice(0, -1) : prev));
    window.setTimeout(() => notesRef.current?.focus(), 0);
  };

  /** Kalem satırı araçları: taşı, araya ekle, sil */
  const rowTools = (index: number) => (
    <>
      <button type="button" tabIndex={-1} data-move="up" onClick={() => moveItem(index, -1, '[data-move="up"]')} disabled={index === 0}
        className="p-1 text-slate-400 hover:text-brand-600 disabled:opacity-25 disabled:hover:text-slate-400" title="Yukarı taşı (Alt+↑)">
        <ArrowUp className="w-4 h-4" />
      </button>
      <button type="button" tabIndex={-1} data-move="down" onClick={() => moveItem(index, 1, '[data-move="down"]')} disabled={index === items.length - 1}
        className="p-1 text-slate-400 hover:text-brand-600 disabled:opacity-25 disabled:hover:text-slate-400" title="Aşağı taşı (Alt+↓)">
        <ArrowDown className="w-4 h-4" />
      </button>
      <button type="button" tabIndex={-1} onClick={() => insertItemAfter(index)}
        className="p-1 text-slate-400 hover:text-emerald-600" title="Altına yeni kalem ekle">
        <ListPlus className="w-4 h-4" />
      </button>
      <button type="button" tabIndex={-1} onClick={() => handleRemoveItem(index)} disabled={items.length <= 1}
        className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-25 disabled:hover:text-slate-400" title="Sil">
        <Trash2 className="w-4 h-4" />
      </button>
    </>
  );

  const handleItemsKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Alt+↑ / Alt+↓: bulunduğun kalemi taşı (imleç aynı kutuda kalır)
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const t = e.target as HTMLElement;
      const rowEls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-quote-item]'));
      const ri = rowEls.findIndex(r => r.contains(t));
      if (ri < 0) return;
      e.preventDefault();
      const pos = Array.from(rowEls[ri].querySelectorAll<HTMLElement>('input, select')).indexOf(t);
      // Taşındıktan sonra aynı kutuya (pos. sıradaki alan) geri odaklan
      moveItem(ri, e.key === 'ArrowUp' ? -1 : 1, undefined);
      if (pos >= 0 && pendingFocus.current) pendingFocus.current.pos = pos;
      return;
    }
    if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement;
    const rowEls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-quote-item]'));
    const rowIndex = rowEls.findIndex(r => r.contains(target));
    if (rowIndex !== items.length - 1) return; // sadece son kalemde
    const last = items[rowIndex];
    if (target.hasAttribute('data-disc')) {
      // Son kalemin son kutusu: yeni kalem aç (dolu ise)
      if (isEmptyItem(last)) return;
      e.preventDefault();
      focusNewItem.current = true;
      handleAddItem();
    } else if (target.closest('[data-name-cell]') && isEmptyItem(last) && items.length > 1) {
      // Boş yeni kalemde adı da boş geçerse kalem girişi bitti: alt kısma in
      e.preventDefault();
      finishItems();
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (document.activeElement === notesRef.current) {
      (e.currentTarget as HTMLFormElement).requestSubmit();
    } else {
      finishItems();
    }
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Para birimine göre KDV dahil toplamlar
  const totalsByCurrency = items.reduce<Record<Currency, number>>((acc, it) => {
    acc[it.currency || 'TRY'] += it.totalPrice || 0;
    return acc;
  }, { TRY: 0, USD: 0, EUR: 0 });
  const usedCurrencies = (Object.keys(totalsByCurrency) as Currency[]).filter(c => totalsByCurrency[c] > 0);
  const quoteCurrency: Currency = usedCurrencies.length === 1 ? usedCurrencies[0] : 'TRY';
  const totalQuoteAmount = usedCurrencies.length === 1 ? totalsByCurrency[quoteCurrency] : totalsByCurrency.TRY;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;

    const filledItems = items
      .filter(it => it.productName.trim().length > 0)
      .map(it => (it.quantity > 0 ? it : { ...it, quantity: 1 }));

    // Düzenleme: numara, durum ve oluşturma tarihi korunur
    if (editQuote) {
      // Kalemsiz (Excel'den gelen) tekliflerde kalem girilmediyse tutarlar olduğu gibi kalır
      const keepAmounts = filledItems.length === 0 && (editQuote.items?.length || 0) === 0;
      onSaveQuote({
        ...editQuote,
        customerName: customerName.trim(),
        city: city.trim(),
        projectLocation: projectLocation.trim() || undefined,
        urgency,
        items: filledItems,
        ...(keepAmounts ? {} : {
          totalAmount: totalQuoteAmount,
          currency: quoteCurrency,
          amountTry: totalsByCurrency.TRY,
          amountUsd: totalsByCurrency.USD,
          amountEur: totalsByCurrency.EUR,
          imported: false,
        }),
        notes: notes.trim() || undefined,
        paymentTerm: paymentTerm || undefined,
        updatedAt: new Date().toISOString(),
      });
      onClose();
      return;
    }

    const quoteId = 'qt-' + Date.now();
    const now = new Date();
    const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const newQuote: Quote = {
      id: quoteId,
      // Kaydetme anında tekrar hesapla (bu arada başka teklif eklendiyse çakışmasın)
      quoteNumber: nextQuoteNumber(quotes),
      customerName: customerName.trim(),
      customerPhone: '',
      city: city.trim(),
      projectLocation: projectLocation.trim() || undefined,
      requestChannel: 'telefon',
      urgency: urgency,
      status: 'gonderildi',
      items: filledItems,
      totalAmount: totalQuoteAmount,
      currency: quoteCurrency,
      amountTry: totalsByCurrency.TRY,
      amountUsd: totalsByCurrency.USD,
      amountEur: totalsByCurrency.EUR,
      validUntil: in5Days,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: currentRole,
      assignedTo: 'istanbul',
      notes: notes.trim() || undefined,
      paymentTerm: paymentTerm || undefined,
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
              {isEdit ? `Teklifi Düzenle / Revize Et · ${editQuote!.quoteNumber}` : '+ Yeni Teklif Talebi Girişi'}
            </h3>
            <p className="text-xs text-brand-100">
              {isEdit ? 'Durum ve tarih korunur; değişiklikleri yapıp kaydedin.' : 'Müşteriyi seçin, malzemeleri girin ve kaydedin.'}
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
          
            <form id="newQuoteForm" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-4">
              
              {/* Customer & Location Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 sm:max-w-[50%] sm:pr-1.5">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teklif No
                  </label>
                  <div className="w-full p-2 border border-slate-200 rounded-lg text-sm font-mono bg-slate-50 text-slate-700 flex items-center justify-between gap-2">
                    <span>{quoteNumber}</span>
                    <span className="text-[10px] font-sans text-slate-400">{isEdit ? 'değiştirilemez' : 'otomatik'}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Müşteri / Firma Adı *
                  </label>
                  <SuggestInput<Customer>
                    value={customerName}
                    required
                    placeholder="Yazmaya başlayın, Enter / Tab ile seçin..."
                    onChange={handleCustomerNameChange}
                    onPick={(c) => handleCustomerNameChange(c.name)}
                    suggestions={customerSuggestions}
                    getKey={(c) => c.id}
                    inputClassName="w-full p-2 border border-slate-200 rounded-lg text-sm"
                    renderItem={(c) => (
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-slate-800 truncate">{c.name}</span>
                        <span className="text-xs text-slate-500 shrink-0">{c.city}</span>
                      </span>
                    )}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Şehir *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Yazmaya başlayın, listeden seçin..."
                    list="quote-city-list"
                    autoComplete="off"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                  />
                  <datalist id="quote-city-list">
                    {cityOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
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

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ödeme (Vade)
                  </label>
                  <select
                    value={paymentTerm}
                    onChange={(e) => setPaymentTerm(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="">Seçiniz</option>
                    {PAYMENT_TERMS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items List */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Talep Edilen Malzemeler ({items.filter(it => it.productName.trim()).length} Kalem)
                  </label>
                  <span className="hidden sm:inline text-[10px] text-slate-400 normal-case">
                    Son kutuda Tab → yeni kalem · Alt+↑↓ → taşı · Ctrl+Enter → Not / Kaydet
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs text-brand-600 font-bold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    + Kalem Ekle
                  </button>
                </div>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto" onKeyDownCapture={handleItemsKeyDown}>
                  {items.map((item, index) => (
                    <div key={item.id} data-quote-item data-item-id={item.id} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                      <div className="flex gap-2 items-start">
                        <span className="mt-1.5 w-5 shrink-0 text-right text-[11px] font-bold text-slate-400 tabular-nums">{index + 1}</span>
                        <div className="grid grid-cols-[7.5rem_1fr] sm:grid-cols-[9rem_1fr] gap-2 flex-1 min-w-0">
                          <MaterialPicker
                            field="code"
                            value={item.code || ''}
                            placeholder="Kod"
                            focusAfterPick={focusQuantity}
                            onChange={(text) => handleItemChange(index, 'code', text)}
                            onPick={(m) => handlePickMaterial(index, m)}
                          />
                          <div data-name-cell className="min-w-0">
                            <MaterialPicker
                              field="name"
                              value={item.productName}
                              required={index === 0 && !isEdit}
                              placeholder="Malzeme adı (Örn: köşe radyatör vana 1/2)"
                              onChange={(text) => handleItemChange(index, 'productName', text)}
                              onPick={(m) => handlePickMaterial(index, m)}
                            />
                          </div>
                        </div>
                        <div className="hidden sm:flex items-center shrink-0">{rowTools(index)}</div>
                      </div>

                      <div className="flex sm:hidden items-center justify-end -mt-1">{rowTools(index)}</div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
                        <div>
                          <label className="block text-[10px] text-slate-500">Miktar</label>
                          <DecimalInput
                            placeholder="1"
                            data-qty
                            value={item.quantity || 0}
                            onValueChange={(v) => handleItemChange(index, 'quantity', v)}
                            onFocus={(e) => e.target.select()}
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
                          <label className="block text-[10px] text-slate-500">Birim Fiyat</label>
                          <DecimalInput
                            placeholder="Örn. 1.250,50"
                            value={item.unitPrice || 0}
                            onValueChange={(v) => handleItemChange(index, 'unitPrice', v)}
                            className="w-full p-1 border border-slate-300 rounded bg-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Para Birimi</label>
                          <select
                            value={item.currency || 'TRY'}
                            onChange={(e) => handleItemChange(index, 'currency', e.target.value)}
                            className="w-full p-1 border border-slate-300 rounded bg-white text-xs"
                          >
                            <option value="TRY">TL</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">İskonto %</label>
                          <DecimalInput
                            placeholder="0"
                            data-disc
                            value={item.discount || 0}
                            onValueChange={(v) => handleItemChange(index, 'discount', Math.min(100, Math.max(0, v)))}
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
                  ref={notesRef}
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
            {usedCurrencies.length > 0 && (
              <span>Tahmini Toplam (KDV dahil): <strong>
                {usedCurrencies.map(c => `${totalsByCurrency[c].toLocaleString('tr-TR')} ${CURRENCY_LABEL[c]}`).join(' + ')}
              </strong></span>
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
              {isEdit ? 'Değişiklikleri Kaydet' : 'Teklifi Kaydet'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
