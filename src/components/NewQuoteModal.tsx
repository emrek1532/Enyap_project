import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileUp, ListPlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Quote, QuoteItem, UrgencyLevel, UserRole, Customer } from '../types';
import { findCustomer } from '../lib/customers';
import { TURKISH_CITIES } from '../lib/cities';
import { CURRENCY_LABEL, Currency } from '../lib/money';
import { Material, MATERIAL_UNITS, foldTr, rememberMaterial } from '../lib/materials';
import { SuggestInput } from './SuggestInput';
import { DecimalInput } from './DecimalInput';
import { MaterialPicker } from './MaterialPicker';
import { nextQuoteNumber } from '../lib/quoteRules';
import { catalogCode, matchCustomer, readQuotePdf, titleTr } from '../lib/pdfQuote';

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
  /** Sesli asistanın hazırladığı taslak: form bununla dolu açılır, kullanıcı kontrol edip kaydeder */
  draft?: Partial<Quote> | null;
  /** Paylaş menüsünden gelen PDF: açılınca form bununla doldurulur */
  initialPdf?: File | null;
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
  draft = null,
  initialPdf = null,
}) => {
  // Düzenlemede mevcut teklif, sesli taslakta taslak; ikisi de yoksa boş form
  const init: Partial<Quote> | null = editQuote || draft;
  // Form fields
  // Teklif no: kullanıcı girerse o kullanılır; boş bırakılırsa kayıtta otomatik verilir (EK-2026-0001)
  const autoNumber = useMemo(() => nextQuoteNumber(quotes), [quotes]);
  const [quoteNoInput, setQuoteNoInput] = useState(
    editQuote && editQuote.quoteNumber && editQuote.quoteNumber !== '-' ? editQuote.quoteNumber : '',
  );
  const typedNo = quoteNoInput.trim();
  const duplicateNo = !!typedNo && quotes.some(q => q.id !== editQuote?.id && (q.quoteNumber || '').trim().toLocaleUpperCase('tr') === typedNo.toLocaleUpperCase('tr'));
  const [customerName, setCustomerName] = useState(init?.customerName || initialCustomer?.name || '');
  const [city, setCity] = useState(init?.city || initialCustomer?.city || 'Isparta');
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

  const [projectLocation, setProjectLocation] = useState(init?.projectLocation || '');
  const [urgency, setUrgency] = useState<UrgencyLevel>(init?.urgency || 'normal');
  const [paymentTerm, setPaymentTerm] = useState(init?.paymentTerm || '');
  const [notes, setNotes] = useState(init?.notes || '');
  const [items, setItems] = useState<QuoteItem[]>(init?.items?.length
    ? init.items.map(it => ({ ...it, currency: it.currency || init.currency || 'TRY' }))
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
        className="p-1.5 md:p-0.5 text-slate-400 hover:text-brand-600 disabled:opacity-25 disabled:hover:text-slate-400" title="Yukarı taşı (Alt+↑)">
        <ArrowUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" tabIndex={-1} data-move="down" onClick={() => moveItem(index, 1, '[data-move="down"]')} disabled={index === items.length - 1}
        className="p-1.5 md:p-0.5 text-slate-400 hover:text-brand-600 disabled:opacity-25 disabled:hover:text-slate-400" title="Aşağı taşı (Alt+↓)">
        <ArrowDown className="w-3.5 h-3.5" />
      </button>
      <button type="button" tabIndex={-1} onClick={() => insertItemAfter(index)}
        className="p-1.5 md:p-0.5 text-slate-400 hover:text-emerald-600" title="Altına yeni kalem ekle">
        <ListPlus className="w-3.5 h-3.5" />
      </button>
      <button type="button" tabIndex={-1} onClick={() => handleRemoveItem(index)} disabled={items.length <= 1}
        className="p-1.5 md:p-0.5 text-slate-400 hover:text-rose-600 disabled:opacity-25 disabled:hover:text-slate-400" title="Sil">
        <Trash2 className="w-3.5 h-3.5" />
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

  // ---- PDF'ten doldur: muhasebe programının teklif PDF'i formu doldurur ----
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pdfMeta, setPdfMeta] = useState<{ preparedBy?: string; date?: string } | null>(null);

  const fillFromPdf = async (file: File) => {
    setPdfBusy(true); setPdfMsg(null);
    try {
      const pdf = await readQuotePdf(file);
      if (!pdf.items.length && !pdf.quoteNumber) {
        setPdfMsg({ ok: false, text: 'PDF okunamadı (taranmış / resim PDF olabilir).' });
        return;
      }
      if (pdf.quoteNumber && !isEdit) setQuoteNoInput(pdf.quoteNumber);
      if (pdf.customerName && !isEdit) {
        const names = [...new Set([...customers.map(c => c.name), ...quotes.map(q => q.customerName)].filter(Boolean))];
        const name = matchCustomer(pdf.customerName, names) || titleTr(pdf.customerName.split(/\s+/).slice(0, 3).join(' '));
        handleCustomerNameChange(name);
        if (!findCustomer(customers, name)) {
          const known = quotes.find(q => q.customerName === name)?.city;
          if (pdf.city || known) setCity(pdf.city || known!);
        }
      }
      if (pdf.paymentTerm && PAYMENT_TERMS.includes(pdf.paymentTerm)) setPaymentTerm(pdf.paymentTerm);
      if (pdf.items.length) {
        // Katalogda adı birebir aynı olan malzemelerin kodu da gelsin
        let i = 0;
        const work = async () => { while (i < pdf.items.length) { const it = pdf.items[i++]; const c = await catalogCode(it.productName); if (c) it.code = c; } };
        await Promise.all([work(), work(), work(), work()]);
        setItems(pdf.items.map((it, k) => ({ ...it, id: `it-${Date.now()}-${k}` })));
      }
      setPdfMeta({ preparedBy: pdf.preparedBy || undefined, date: pdf.date || undefined });
      setPdfMsg({ ok: true, text: `${pdf.items.length} kalem PDF'ten aktarıldı${pdf.warnings.length ? ' · ' + pdf.warnings.join(', ') : ''}. Kontrol edip kaydedin.` });
    } catch {
      setPdfMsg({ ok: false, text: 'PDF açılamadı.' });
    } finally {
      setPdfBusy(false);
    }
  };

  // Paylaş menüsünden (WhatsApp) gelen PDF'i açılır açılmaz oku
  const sharedDone = useRef(false);
  useEffect(() => {
    if (!initialPdf || sharedDone.current) return;
    sharedDone.current = true;
    fillFromPdf(initialPdf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPdf]);

  // Genel toplamlar (Mikro'daki gibi: ara toplam, iskonto, KDV, genel toplam — para birimi başına)
  const summary = (['TRY', 'USD', 'EUR'] as Currency[]).map(c => {
    const rows = items.filter(it => (it.currency || 'TRY') === c);
    const gross = rows.reduce((a, it) => a + (it.quantity || 0) * (it.unitPrice || 0), 0);
    const net = rows.reduce((a, it) => a + (it.quantity || 0) * (it.unitPrice || 0) * (1 - (it.discount || 0) / 100), 0);
    return { c, gross, disc: gross - net, net, vat: net * 0.2, total: net * 1.2 };
  }).filter(r => r.gross > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;
    if (!paymentTerm && !isEdit) return; // yeni teklifte vade zorunlu (tarayıcı da uyarır)

    const filledItems = items
      .filter(it => it.productName.trim().length > 0)
      .map(it => (it.quantity > 0 ? it : { ...it, quantity: 1 }));

    // Düzenleme: numara, durum ve oluşturma tarihi korunur
    if (editQuote) {
      // Kalemsiz (Excel'den gelen) tekliflerde kalem girilmediyse tutarlar olduğu gibi kalır
      const keepAmounts = filledItems.length === 0 && (editQuote.items?.length || 0) === 0;
      onSaveQuote({
        ...editQuote,
        quoteNumber: typedNo || editQuote.quoteNumber, // düzenlemede boş bırakılırsa eski numara kalır
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
    const now = pdfMeta?.date ? new Date(`${pdfMeta.date}T09:00:00+03:00`) : new Date();
    const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const newQuote: Quote = {
      id: quoteId,
      // Girilen numara; boşsa kaydetme anında otomatik (bu arada başka teklif eklendiyse çakışmasın)
      quoteNumber: typedNo || nextQuoteNumber(quotes),
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
      preparedBy: pdfMeta?.preparedBy,
      isEncrypted: false,
    };

    onSaveQuote(newQuote);
    onClose();
  };

  const fmt2 = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lineNet = (it: QuoteItem) => (it.quantity || 0) * (it.unitPrice || 0) * (1 - (it.discount || 0) / 100);

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-6xl sm:rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[94vh]">

        {/* Başlık çubuğu */}
        <div className="px-3 py-2 bg-brand-600 text-white flex items-center gap-2 pt-safe">
          <h3 className="font-black text-sm sm:text-base flex-1 min-w-0 truncate">
            {isEdit ? `Teklif Düzenle · ${editQuote!.quoteNumber}` : 'Yeni Fiyat Teklifi'}
          </h3>
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={pdfBusy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/15 hover:bg-white/25 text-xs font-bold disabled:opacity-60"
            title="Muhasebe programının teklif PDF'inden firma, teklif no ve kalemleri doldur"
          >
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            <span>PDF'ten Doldur</span>
          </button>
          <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) fillFromPdf(f); e.target.value = ''; }} />
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/15" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 bg-slate-100/60">
          <form id="newQuoteForm" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="p-2.5 sm:p-3 space-y-2.5">

            {pdfMsg && (
              <div className={`text-xs rounded-md px-3 py-2 ${pdfMsg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                {pdfMsg.text}
              </div>
            )}

            {/* Teklif bilgileri */}
            <div className="bg-white border border-slate-200 rounded-md p-2.5 grid grid-cols-2 grid-flow-dense sm:grid-flow-row sm:grid-cols-12 gap-x-2 gap-y-2">
              <div className="col-span-1 sm:col-span-2">
                <label className="ql">Teklif No</label>
                <input
                  type="text"
                  value={quoteNoInput}
                  onChange={e => setQuoteNoInput(e.target.value)}
                  placeholder={isEdit ? (editQuote!.quoteNumber || '-') : autoNumber}
                  className={`qf font-mono ${duplicateNo ? '!border-amber-400' : ''}`}
                  title={typedNo ? 'Elle girildi' : isEdit ? 'Boş bırakılırsa değişmez' : 'Boş bırakılırsa otomatik verilir'}
                />
              </div>
              <div className="col-span-2 sm:col-span-5">
                <label className="ql">Müşteri / Firma *</label>
                <SuggestInput<Customer>
                  value={customerName}
                  required
                  placeholder="Yazın, Enter / Tab ile seçin"
                  onChange={handleCustomerNameChange}
                  onPick={(c) => handleCustomerNameChange(c.name)}
                  suggestions={customerSuggestions}
                  getKey={(c) => c.id}
                  inputClassName="qf"
                  renderItem={(c) => (
                    <span className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-slate-800 truncate">{c.name}</span>
                      <span className="text-xs text-slate-500 shrink-0">{c.city}</span>
                    </span>
                  )}
                />
              </div>
              <div className="col-span-1 sm:col-span-3">
                <label className="ql">Şehir *</label>
                <input
                  type="text"
                  required
                  list="quote-city-list"
                  autoComplete="off"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="qf"
                />
                <datalist id="quote-city-list">
                  {cityOptions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="col-span-1 sm:col-span-2 ">
                <label className="ql">Vade{isEdit ? '' : ' *'}</label>
                <select required={!isEdit} value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} className="qf">
                  <option value="">Seçiniz</option>
                  {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="ql">Aciliyet</label>
                <select value={urgency} onChange={(e) => setUrgency(e.target.value as UrgencyLevel)} className="qf">
                  <option value="acil">Acil</option>
                  <option value="yuksek">Yüksek</option>
                  <option value="normal">Normal</option>
                  <option value="dusuk">Düşük</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-10">
                <label className="ql">Proje / Şantiye</label>
                <input
                  type="text"
                  placeholder="Örn: Modern Evler 32 Konut"
                  value={projectLocation}
                  onChange={(e) => setProjectLocation(e.target.value)}
                  className="qf"
                />
              </div>
              {duplicateNo && <p className="col-span-2 sm:col-span-12 text-[11px] text-amber-700 -mt-1">Bu teklif no başka bir teklifte de var.</p>}
            </div>

            {/* Kalemler */}
            <div className="bg-white border border-slate-200 rounded-md">
              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-200 bg-slate-50 rounded-t-md">
                <span className="text-[11px] font-black text-slate-700 uppercase tracking-wide">
                  Kalemler ({items.filter(it => it.productName.trim()).length})
                </span>
                <span className="hidden md:inline text-[10px] text-slate-400 flex-1 text-right">
                  Son kutuda Tab → yeni kalem · Alt+↑↓ → taşı · Ctrl+Enter → Not / Kaydet
                </span>
                <button type="button" onClick={handleAddItem}
                  className="ml-auto md:ml-0 flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-brand-700 hover:bg-brand-50">
                  <Plus className="w-3.5 h-3.5" /> Kalem
                </button>
              </div>

              {/* Sütun başlıkları (geniş ekran) */}
              <div className="qrow hidden md:grid px-2 py-1 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200">
                <span data-a="no" className="text-right">#</span>
                <span data-a="kod">Kod</span>
                <span data-a="ad">Malzeme Adı</span>
                <span data-a="qty" className="text-right">Miktar</span>
                <span data-a="br">Birim</span>
                <span data-a="fiyat" className="text-right">B.Fiyat</span>
                <span data-a="dvz">Dvz</span>
                <span data-a="isk" className="text-right">İsk%</span>
                <span data-a="tut" className="text-right">Net Tutar</span>
                <span data-a="tools" />
              </div>

              {/* Telefonda ikinci satırın sütun adları */}
              <div className="qrow md:hidden px-2 pt-1 -mb-1 text-[9px] font-bold text-slate-400 uppercase" aria-hidden>
                <span data-a="qty" className="text-right">Miktar</span>
                <span data-a="br">Birim</span>
                <span data-a="fiyat" className="text-right">B.Fiyat</span>
                <span data-a="dvz">Dvz</span>
                <span data-a="isk" className="text-right">İsk%</span>
              </div>

              <div className="divide-y divide-slate-200" onKeyDownCapture={handleItemsKeyDown}>
                {items.map((item, index) => (
                  <div key={item.id} data-quote-item data-item-id={item.id}
                    className={`qrow px-2 py-1.5 ${index % 2 ? 'bg-slate-50/70' : 'bg-white'} focus-within:bg-brand-50/50`}>
                    <span data-a="no" className="text-[11px] font-bold text-slate-400 tabular-nums md:text-right">{index + 1}.</span>
                    <div data-a="kod" className="min-w-0">
                      <MaterialPicker
                        field="code"
                        value={item.code || ''}
                        placeholder="Kod"
                        inputClassName="qf"
                        focusAfterPick={focusQuantity}
                        onChange={(text) => handleItemChange(index, 'code', text)}
                        onPick={(m) => handlePickMaterial(index, m)}
                      />
                    </div>
                    <div data-a="ad" data-name-cell className="min-w-0">
                      <MaterialPicker
                        field="name"
                        value={item.productName}
                        required={index === 0 && !isEdit}
                        placeholder="Malzeme adı"
                        inputClassName="qf"
                        focusAfterPick={focusQuantity}
                        onChange={(text) => handleItemChange(index, 'productName', text)}
                        onPick={(m) => handlePickMaterial(index, m)}
                      />
                    </div>
                    <div data-a="qty">
                      <DecimalInput
                        placeholder="Miktar"
                        data-qty
                        value={item.quantity || 0}
                        onValueChange={(v) => handleItemChange(index, 'quantity', v)}
                        onFocus={(e) => e.target.select()}
                        className="qf text-right tabular-nums"
                        title="Miktar"
                      />
                    </div>
                    <div data-a="br">
                      <select value={item.unit} onChange={(e) => handleItemChange(index, 'unit', e.target.value)} className="qf !px-1" title="Birim">
                        {MATERIAL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div data-a="fiyat">
                      <DecimalInput
                        placeholder="B.Fiyat"
                        value={item.unitPrice || 0}
                        onValueChange={(v) => handleItemChange(index, 'unitPrice', v)}
                        className="qf text-right tabular-nums"
                        title="Birim fiyat"
                      />
                    </div>
                    <div data-a="dvz">
                      <select value={item.currency || 'TRY'} onChange={(e) => handleItemChange(index, 'currency', e.target.value)} className="qf !px-1" title="Para birimi">
                        <option value="TRY">TL</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                    <div data-a="isk">
                      <DecimalInput
                        placeholder="İsk%"
                        data-disc
                        value={item.discount || 0}
                        onValueChange={(v) => handleItemChange(index, 'discount', Math.min(100, Math.max(0, v)))}
                        className="qf text-right tabular-nums"
                        title="İskonto %"
                      />
                    </div>
                    <div data-a="tut" className="text-xs font-bold text-slate-700 tabular-nums md:text-right truncate">
                      {lineNet(item) > 0 ? `${fmt2(lineNet(item))} ${CURRENCY_LABEL[item.currency || 'TRY']}` : <span className="text-slate-300 font-normal">—</span>}
                    </div>
                    <div data-a="tools" className="flex items-center">{rowTools(index)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Not + toplamlar */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2.5 items-start">
              <div className="bg-white border border-slate-200 rounded-md p-2.5">
                <label className="ql">Not</label>
                <textarea
                  ref={notesRef}
                  rows={2}
                  placeholder="Müşteri pazartesiye kadar yanıt istiyor..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="qf !h-auto py-1.5"
                />
              </div>
              {summary.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
                  <table className="text-xs tabular-nums w-full">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase text-slate-500">
                        <th className="px-2.5 py-1 text-left font-bold" />
                        {summary.map(r => <th key={r.c} className="px-2.5 py-1 text-right font-bold">{CURRENCY_LABEL[r.c]}</th>)}
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      {([['Ara Toplam', 'gross'], ['İskonto', 'disc'], ['Net', 'net'], ['KDV %20', 'vat']] as const).map(([label, k]) => (
                        <tr key={k}>
                          <td className="px-2.5 py-0.5 text-slate-500">{label}</td>
                          {summary.map(r => <td key={r.c} className="px-2.5 py-0.5 text-right">{fmt2(r[k])}</td>)}
                        </tr>
                      ))}
                      <tr className="border-t border-slate-300 font-black text-slate-900">
                        <td className="px-2.5 py-1">G.Toplam</td>
                        {summary.map(r => <td key={r.c} className="px-2.5 py-1 text-right">{fmt2(r.total)}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Alt çubuk */}
        <div className="px-3 py-2 bg-white border-t border-slate-200 flex items-center justify-end gap-2 pb-safe">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm">
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => (document.getElementById('newQuoteForm') as HTMLFormElement | null)?.requestSubmit()}
            className="px-5 py-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-sm"
          >
            {isEdit ? 'Değişiklikleri Kaydet' : 'Teklifi Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};
