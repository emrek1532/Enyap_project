import React, { useEffect, useMemo, useRef, useState } from 'react';
import { dayOf, localDay } from '../lib/dates';
import { ArrowDown, ArrowUp, FileUp, ListPlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Quote, QuoteItem, UserRole, Customer } from '../types';
import { findCustomer } from '../lib/customers';
import { CityInput } from './TextSuggest';
import { DateInput } from './DateInput';
import { CURRENCY_LABEL, Currency, formatQuoteAmount } from '../lib/money';
import { Material, MATERIAL_UNITS, foldTr, rememberMaterial } from '../lib/materials';
import { SuggestInput } from './SuggestInput';
import { DecimalInput } from './DecimalInput';
import { MaterialPicker } from './MaterialPicker';
import { nextQuoteNumber, quoteNo, revBase, revOf } from '../lib/quoteRules';
import { allowed, useAccess } from '../lib/access';
import { supabase } from '../lib/supabase';
import { shareQuoteWithMe } from '../lib/db';
import { catalogCode, logPdfItemLoss, matchCustomer, readQuotePdf, titleTr } from '../lib/pdfQuote';
import { BrandNote, CheckRow, Suggestion, runQuoteCheck, termClass, totalsMismatch } from '../lib/quoteCheck';
import { SuggestMatchBox } from './SuggestMatchBox';
import { learnFromLinked, setSupplierOurCode } from '../lib/suppliers';

interface NewQuoteModalProps {
  currentRole: UserRole;
  /** fromPdf: form PDF'ten dolduruldu (kayıttan sonra teklif ve PDF'i gösterilir) */
  onSaveQuote: (quote: Quote, opts?: { fromPdf: boolean }) => void;
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
  /** PDF'in elle seçilmesi gerektiğinde gösterilecek yol tarifi */
  pdfNotice?: string;
  /** PDF'teki teklif no sistemde varsa: o teklifi bu PDF ile revize etmek için */
  onOpenExisting?: (q: Quote, file: File) => void;
  /** Talepten elle yüklenen teklif: kaydetmeden önce "Kontrol ettim" işaretlenmeli */
  requireCheck?: boolean;
}

export { PAYMENT_TERMS } from '../lib/constants';
import { PAYMENT_TERMS } from '../lib/constants';

/** Tarihi yeni güne taşır, günün saati aynı kalır (yerel saat) */
const withDay = (iso: string, day: string) => {
  const d = new Date(iso);
  const t = new Date(`${day}T00:00:00`);
  t.setHours(d.getHours(), d.getMinutes(), d.getSeconds());
  return t.toISOString();
};

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
  pdfNotice = '',
  requireCheck = false,
}) => {
  const [checked, setChecked] = useState(false);
  const [checkWarn, setCheckWarn] = useState(false);
  // Düzenlemede mevcut teklif, sesli taslakta taslak; ikisi de yoksa boş form
  const init: Partial<Quote> | null = editQuote || draft;
  // Form fields
  // Teklif no: kullanıcı girerse o kullanılır; boş bırakılırsa kayıtta otomatik verilir (EK-2026-0001)
  // Yalnız kendi tekliflerini gören kullanıcı herkesin numarasını bilmez: en büyük sıra sunucudan (yalnız sayı) alınır
  const me = useAccess();
  const [seqFloor, setSeqFloor] = useState(0);
  const scoped = !!me && !allowed(me, 'others');
  useEffect(() => {
    if (!scoped) return;
    supabase.rpc('quote_max_seq', { y: new Date().getFullYear() }).then(({ data }) => { if (typeof data === 'number') setSeqFloor(data); }, () => {});
  }, [scoped]);
  const autoNumber = useMemo(() => nextQuoteNumber(quotes, new Date(), seqFloor), [quotes, seqFloor]);
  const normNoTop = (x?: string) => (x || '').trim().toLocaleUpperCase('tr');
  const isEditTop = !!editQuote;
  const [quoteNoInput, setQuoteNoInput] = useState(
    editQuote && editQuote.quoteNumber && editQuote.quoteNumber !== '-' ? editQuote.quoteNumber : '',
  );
  const typedNo = quoteNoInput.trim();
  // Aynı numaralı (görünen) teklif: yeni teklifte kaydedince yeni kayıt açılmaz, en sonuncusunun üstüne yazılır
  const localMatch = typedNo ? quotes.filter(q => q.id !== editQuote?.id && (q.quoteNumber || '').trim().toLocaleUpperCase('tr') === typedNo.toLocaleUpperCase('tr'))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] : undefined;
  const localDup = !!localMatch;
  // Kendi tekliflerini gören kullanıcı başkasının teklifini göremez; teklif no sunucuda herkesinkiyle karşılaştırılır
  // (yalnız firma, tarih ve ekleyen döner; tutar dönmez)
  const [remoteDup, setRemoteDup] = useState<{ id: string; customer: string; date: string; owner: string } | null>(null);
  useEffect(() => {
    setRemoteDup(null);
    if (!scoped || !typedNo || localDup || (isEditTop && normNoTop(editQuote?.quoteNumber) === normNoTop(typedNo))) return;
    const t = setTimeout(() => {
      supabase.rpc('quote_lookup', { no: typedNo }).then(({ data }) => {
        const r = (data as any[] | null)?.find(x => x.id !== editQuote?.id);
        setRemoteDup(r ? { id: r.id, customer: r.customer_name || '', date: dayOf(r.created_at).split('-').reverse().join('.'), owner: r.owner_name || '' } : null);
      }, () => {});
    }, 500);
    return () => clearTimeout(t);
  }, [typedNo, scoped, localDup]);
  const duplicateNo = localDup || !!remoteDup;
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [customerName, setCustomerName] = useState(init?.customerName || initialCustomer?.name || '');
  const [city, setCity] = useState(init?.city || initialCustomer?.city || 'Isparta');

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

  const [paymentTerm, setPaymentTerm] = useState(init?.paymentTerm || '');
  // Teklif tarihi: düzenlemede kendi tarihi, yenide bugün (PDF'ten gelirse PDF'teki tarih)
  const [quoteDate, setQuoteDate] = useState(editQuote?.createdAt ? dayOf(editQuote.createdAt) : localDay());
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
    if (!m.supplier) rememberMaterial(m);
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
        // Firma listesinden seçildiyse o firmanın standart iskontosu gelir
        ...(m.supplier && m.supplierDiscount ? { discount: m.supplierDiscount } : {}),
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
        className="p-1.5 lg:p-0.5 text-slate-500 hover:text-brand-600 disabled:opacity-25 disabled:hover:text-slate-500" title="Yukarı taşı (Alt+↑)">
        <ArrowUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" tabIndex={-1} data-move="down" onClick={() => moveItem(index, 1, '[data-move="down"]')} disabled={index === items.length - 1}
        className="p-1.5 lg:p-0.5 text-slate-500 hover:text-brand-600 disabled:opacity-25 disabled:hover:text-slate-500" title="Aşağı taşı (Alt+↓)">
        <ArrowDown className="w-3.5 h-3.5" />
      </button>
      <button type="button" tabIndex={-1} onClick={() => insertItemAfter(index)}
        className="p-1.5 lg:p-0.5 text-slate-500 hover:text-emerald-600" title="Altına yeni kalem ekle">
        <ListPlus className="w-3.5 h-3.5" />
      </button>
      <button type="button" tabIndex={-1} onClick={() => handleRemoveItem(index)} disabled={items.length <= 1}
        className="p-1.5 lg:p-0.5 text-slate-500 hover:text-rose-600 disabled:opacity-25 disabled:hover:text-slate-500" title="Sil">
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

  // Para birimine göre KDV dahil toplamlar — Mikro gibi: satır net tutarları kuruşa yuvarlanır,
  // KDV satır satır değil ara toplam üzerinden hesaplanır (yuvarlama farkı çıkmasın)
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const lineNet = (it: QuoteItem) => r2((it.quantity || 0) * (it.unitPrice || 0) * (1 - (it.discount || 0) / 100));
  // Toplamlar kaydedilecek kalemlerle aynı kurala göre: adı boş satır sayılmaz, adedi 0 olan 1 sayılır
  const savedItems = items.filter(it => it.productName.trim().length > 0).map(it => (it.quantity > 0 ? it : { ...it, quantity: 1 }));
  const totalsByCurrency = (['TRY', 'USD', 'EUR'] as Currency[]).reduce<Record<Currency, number>>((acc, c) => {
    const net = r2(savedItems.filter(it => (it.currency || 'TRY') === c).reduce((a, it) => a + lineNet(it), 0));
    acc[c] = r2(net + r2(net * 0.2));
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
  // PDF'teki kalemlerin liste fiyatı ve liste iskontosuyla kontrolü (uyarı verir, kaydı engellemez)
  const [pdfCheck, setPdfCheck] = useState<CheckRow[] | null>(null);
  // Marka notları: iskonto kuralı ve toplu fiyat farkı (liste değişmiş)
  const [pdfNotes, setPdfNotes] = useState<BrandNote[]>([]);
  // Sorunsuz kalemler varsayılan kapalı ("✓ N kalem uyumlu" ile açılır)
  const [showOkRows, setShowOkRows] = useState(false);
  // Kontrolün firma ve teklif no'su (öneri bağlanınca kontrol yeniden çalışır)
  const checkCtx = useRef<{ customer: string | null; quoteNo: string | null; term: string | null }>({ customer: null, quoteNo: null, term: null });
  // PDF'teki teklif no sistemde zaten var mı (yeni teklif açarken)
  const [existing, setExisting] = useState<{ q: Quote; file: File } | null>(null);
  const normNo = (s?: string) => (s || '').trim().toLocaleUpperCase('tr');

  // PDF'ten okunan kalem adları: kayıtta eksik kalem varsa tanı kaydı için
  const pdfRead = useRef<string[] | null>(null);

  // Öneriyi kabul: firma kalemini bu ürüne elle bağlar (aynı adlı diğer ölçüler de öğrenilir), kalemi yeniden kontrol eder
  const [linking, setLinking] = useState<number | null>(null);
  const linkSuggestion = async (row: CheckRow, s: Suggestion) => {
    if (!row.code) return;
    setLinking(s.id);
    try {
      await setSupplierOurCode(s.id, row.code);
      await learnFromLinked(s.id).catch(() => 0);
      // Marka kuralları kalemler birlikte değerlendirildiği için tüm kontrol yeniden çalışır
      const prev = pdfCheck || [];
      const res = await runQuoteCheck(prev.map(r => r.item), quotes, checkCtx.current.customer, checkCtx.current.quoteNo, paymentTerm || checkCtx.current.term).catch(() => null);
      const linked = new Map(prev.filter(r => r.linked).map(r => [r.item.id, r.linked!]));
      linked.set(row.item.id, `${s.list} · ${s.name}`);
      if (res) {
        setPdfCheck(res.rows.map(r => (linked.has(r.item.id) ? { ...r, suggest: undefined, linked: linked.get(r.item.id) } : r)));
        setPdfNotes(res.notes);
      } else {
        setPdfCheck(p => p && p.map(r => (r.item.id === row.item.id ? { ...r, suggest: undefined, linked: linked.get(r.item.id) } : r)));
      }
    } catch (e) {
      alert(`Bağlanamadı: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLinking(null);
    }
  };

  // Vade peşin ↔ vadeli değişirse iskonto kontrolü o vadedeki geçmiş tekliflerle yeniden yapılır
  useEffect(() => {
    if (!pdfCheck || !paymentTerm) return;
    const was = checkCtx.current.term;
    if (was && termClass(was) === termClass(paymentTerm)) { checkCtx.current.term = paymentTerm; return; }
    checkCtx.current.term = paymentTerm;
    const prev = pdfCheck;
    let alive = true;
    runQuoteCheck(prev.map(r => r.item), quotes, checkCtx.current.customer, checkCtx.current.quoteNo, paymentTerm).then(res => {
      if (!alive || !res) return;
      const linked = new Map(prev.filter(r => r.linked).map(r => [r.item.id, r.linked!]));
      setPdfCheck(res.rows.map(r => (linked.has(r.item.id) ? { ...r, suggest: undefined, linked: linked.get(r.item.id) } : r)));
      setPdfNotes(res.notes);
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentTerm]);

  const fillFromPdf = async (file: File) => {
    setPdfBusy(true); setPdfMsg(null); setPdfCheck(null); setPdfNotes([]); setShowOkRows(false);
    try {
      const pdf = await readQuotePdf(file);
      if (!pdf.items.length && !pdf.quoteNumber) {
        setPdfMsg({ ok: false, text: 'PDF okunamadı (taranmış / resim PDF olabilir).' });
        return;
      }
      if (pdf.quoteNumber && !isEdit) {
        setQuoteNoInput(pdf.quoteNumber);
        const found = quotes.find(q => normNo(q.quoteNumber) === normNo(pdf.quoteNumber));
        setExisting(found ? { q: found, file } : null);
      }
      // Kontrolde kullanılacak firma: düzenlemede formdaki, yenide PDF'ten eşleşen
      let checkCustomer: string | null = isEdit ? customerName : pdf.customerName;
      if (pdf.customerName && !isEdit) {
        const names = [...new Set([...customers.map(c => c.name), ...quotes.map(q => q.customerName)].filter(Boolean))];
        const name = matchCustomer(pdf.customerName, names) || titleTr(pdf.customerName.split(/\s+/).slice(0, 3).join(' '));
        checkCustomer = name;
        handleCustomerNameChange(name);
        if (!findCustomer(customers, name)) {
          const known = quotes.find(q => q.customerName === name)?.city;
          if (pdf.city || known) setCity(pdf.city || known!);
        }
      }
      if (pdf.paymentTerm && PAYMENT_TERMS.includes(pdf.paymentTerm)) setPaymentTerm(pdf.paymentTerm);
      if (pdf.date && !editQuote) setQuoteDate(pdf.date);
      if (pdf.items.length) {
        // Katalogda adı birebir aynı olan malzemelerin kodu da gelsin
        let i = 0;
        const work = async () => { while (i < pdf.items.length) { const it = pdf.items[i++]; const c = await catalogCode(it.productName, quotes); if (c) it.code = c; } };
        await Promise.all([work(), work(), work(), work()]);
        const ids = pdf.items.map((_, k) => `it-${Date.now()}-${k}`);
        setItems(pdf.items.map((it, k) => ({ ...it, id: ids[k] })));
        pdfRead.current = pdf.items.map(it => it.productName.trim());
        // Liste fiyatı + marka iskonto kuralı + geçmiş + bağsız ürünlere eşleşme önerisi
        const quoteNo = pdf.quoteNumber || (isEdit ? editQuote!.quoteNumber : null);
        const term = (pdf.paymentTerm && PAYMENT_TERMS.includes(pdf.paymentTerm) ? pdf.paymentTerm : paymentTerm) || null;
        checkCtx.current = { customer: checkCustomer, quoteNo, term };
        const res = await runQuoteCheck(pdf.items.map((it, k) => ({ ...it, id: ids[k] })), quotes, checkCustomer, quoteNo, term).catch(() => null);
        setPdfCheck(res ? res.rows : null);
        setPdfNotes(res ? res.notes : []);
      }
      setPdfMeta({ preparedBy: pdf.preparedBy || undefined, date: pdf.date || undefined });
      // Kalem okunamadıysa (sıra boşluğu ya da genel toplam tutmuyor) uyarı sarı gösterilir
      const missing = [...pdf.warnings.filter(w => /okunamad/.test(w)), ...totalsMismatch(pdf)];
      const other = pdf.warnings.filter(w => !/okunamad/.test(w));
      setPdfMsg(missing.length
        ? { ok: false, text: `${pdf.items.length} kalem aktarıldı ama ⚠ ${missing.join(' · ')}${other.length ? ' · ' + other.join(', ') : ''}` }
        : { ok: true, text: `${pdf.items.length} kalem PDF'ten aktarıldı${other.length ? ' · ' + other.join(', ') : ''}. Kontrol edip kaydedin.` });
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
    const gross = r2(rows.reduce((a, it) => a + r2((it.quantity || 0) * (it.unitPrice || 0)), 0));
    const net = r2(rows.reduce((a, it) => a + lineNet(it), 0));
    const vat = r2(net * 0.2);
    return { c, gross, disc: r2(gross - net), net, vat, total: r2(net + vat) };
  }).filter(r => r.gross > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requireCheck && !checked) { setCheckWarn(true); return; }
    if (!customerName.trim()) return;
    if (!paymentTerm && !isEdit) return; // yeni teklifte vade zorunlu (tarayıcı da uyarır)

    const filledItems = savedItems;
    if (pdfRead.current && filledItems.length < pdfRead.current.length) {
      logPdfItemLoss(typedNo || editQuote?.quoteNumber || '', pdfRead.current, filledItems.map(it => it.productName.trim()));
    }

    // Düzenleme: numara, durum ve oluşturma tarihi korunur
    if (editQuote) {
      // Kalemsiz (Excel'den gelen) tekliflerde kalem girilmediyse tutarlar olduğu gibi kalır
      const keepAmounts = filledItems.length === 0 && (editQuote.items?.length || 0) === 0;
      onSaveQuote({
        ...editQuote,
        quoteNumber: typedNo || editQuote.quoteNumber, // düzenlemede boş bırakılırsa eski numara kalır
        customerName: customerName.trim(),
        city: city.trim(),
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
        // Tarih değiştiyse saat korunarak yeni güne taşınır
        createdAt: quoteDate && quoteDate !== dayOf(editQuote.createdAt) ? withDay(editQuote.createdAt, quoteDate) : editQuote.createdAt,
        updatedAt: new Date().toISOString(),
      }, { fromPdf: !!pdfMeta });
      onClose();
      return;
    }

    // Teklif no bende zaten varsa: yeni kayıt açılmaz, mevcut teklifin üstüne yazılır (numara, durum, tarih korunur)
    if (localMatch) {
      onSaveQuote({
        ...localMatch,
        quoteNumber: typedNo || localMatch.quoteNumber,
        customerName: customerName.trim(),
        city: city.trim(),
        items: filledItems,
        totalAmount: totalQuoteAmount,
        currency: quoteCurrency,
        amountTry: totalsByCurrency.TRY,
        amountUsd: totalsByCurrency.USD,
        amountEur: totalsByCurrency.EUR,
        imported: false,
        notes: notes.trim() || localMatch.notes,
        paymentTerm: paymentTerm || localMatch.paymentTerm,
        preparedBy: localMatch.preparedBy || pdfMeta?.preparedBy,
        updatedAt: new Date().toISOString(),
      }, { fromPdf: !!pdfMeta });
      onClose();
      return;
    }

    // Teklif no sistemde başkasında varsa: yeni kayıt açılmaz, o teklif bana da açılıp güncellenir
    if (remoteDup) {
      const dup = remoteDup;
      setSaving(true); setSaveErr('');
      shareQuoteWithMe(dup.id).then(base => {
        if (!base) throw new Error('Teklif bulunamadı.');
        onSaveQuote({
          ...base,
          quoteNumber: typedNo || base.quoteNumber,
          customerName: customerName.trim(),
          city: city.trim(),
          items: filledItems,
          totalAmount: totalQuoteAmount,
          currency: quoteCurrency,
          amountTry: totalsByCurrency.TRY,
          amountUsd: totalsByCurrency.USD,
          amountEur: totalsByCurrency.EUR,
          imported: false,
          notes: notes.trim() || base.notes,
          paymentTerm: paymentTerm || base.paymentTerm,
          preparedBy: base.preparedBy || pdfMeta?.preparedBy,
          updatedAt: new Date().toISOString(),
        }, { fromPdf: !!pdfMeta });
        onClose();
      }).catch(err => setSaveErr(`Kaydedilemedi: ${err?.message || 'bağlantı yok'}. İnternet bağlıyken tekrar deneyin.`))
        .finally(() => setSaving(false));
      return;
    }

    const quoteId = 'qt-' + Date.now();
    const day = quoteDate || pdfMeta?.date;
    const now = day && day !== localDay() ? new Date(`${day}T09:00:00+03:00`) : new Date();
    const in5Days = localDay(new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000));

    const newQuote: Quote = {
      id: quoteId,
      // Girilen numara; boşsa kaydetme anında otomatik (bu arada başka teklif eklendiyse çakışmasın)
      quoteNumber: typedNo || nextQuoteNumber(quotes, new Date(), seqFloor),
      customerName: customerName.trim(),
      customerPhone: '',
      city: city.trim(),
      requestChannel: 'telefon',
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
    };

    onSaveQuote(newQuote, { fromPdf: !!pdfMeta });
    onClose();
  };

  const fmt2 = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-6xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[94vh]">

        {/* Başlık çubuğu */}
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 bg-gradient-to-br from-[#0b2a4c] to-[#15457a] text-white flex items-center gap-2 pt-safe-3 sm:pt-3.5">
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-base sm:text-lg tracking-tight truncate">
              {isEdit ? `Teklif Düzenle · ${editQuote!.quoteNumber}` : 'Yeni Fiyat Teklifi'}
            </h3>
            {isEdit && editQuote!.updatedAt && (
              <div className="text-[11px] text-sky-200/80 truncate">Son değişiklik: {editQuote!.updatedBy && <b className="font-semibold text-sky-100">{editQuote!.updatedBy}</b>}{editQuote!.updatedBy ? ' · ' : ''}{new Date(editQuote!.updatedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={pdfBusy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold disabled:opacity-60"
            title="Muhasebe programının teklif PDF'inden firma, teklif no ve kalemleri doldur"
          >
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            <span className="hidden sm:inline">PDF'ten Doldur</span><span className="sm:hidden">PDF</span>
          </button>
          <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) fillFromPdf(f); e.target.value = ''; }} />
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 bg-[#f4f8fc]">
          <form id="newQuoteForm" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="p-3 sm:p-4 space-y-3">

            {pdfNotice && !pdfMsg && (
              <div className="text-xs rounded-md px-3 py-2 bg-amber-50 text-amber-900 border border-amber-200">{pdfNotice}</div>
            )}
            {pdfMsg && (
              <div className={`text-xs rounded-md px-3 py-2 ${pdfMsg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-300'}`}>
                {pdfMsg.text}
              </div>
            )}
            {pdfCheck && (() => {
              // Kırmızı yok: sarı (bakılmalı) ve gri (bilgi)
              const warnRows = pdfCheck.filter(r => r.level === 'warn');
              const warnNotes = pdfNotes.filter(n => n.level === 'warn');
              const warnCount = warnRows.length + warnNotes.length;
              const infoOnly = !warnCount && (pdfNotes.length > 0 || pdfCheck.some(r => r.issues.length));
              const discFix = pdfCheck.filter(r => r.expected !== undefined && Math.abs((r.item.discount || 0) - r.expected) >= 0.05);
              const day = (iso: string) => (iso || '').slice(0, 10).split('-').reverse().join('.');
              const tone = warnCount ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-emerald-50 text-emerald-900 border-emerald-200';
              const pctTr = (v: number) => `%${v.toLocaleString('tr-TR')}`;
              return (
                <div className={`text-xs rounded-md px-3 py-2.5 border space-y-1.5 ${tone}`}>
                  <div className="font-bold">
                    {warnCount ? `Kontrol: ${warnCount} uyarı` : infoOnly ? '✓ Önemli uyarı yok (bilgi notları aşağıda)' : '✓ Fiyatlar ve iskontolar fiyat listeleriyle ve önceki tekliflerle uyumlu'}
                  </div>
                  {/* Marka notları: firmanın bu markada son aldığı iskonto, toplu fiyat farkı */}
                  {pdfNotes.map(n => (
                    <div key={n.list + n.text} className={n.level === 'warn' ? 'text-amber-800 font-semibold' : 'text-slate-600'}>• {n.text}</div>
                  ))}
                  {/* Her kalem: bu teklifteki iskonto ve aynı ürüne en son verilen iskonto (önce aynı firma) */}
                  {(() => {
                    // Sorunlu kalemler önce ve açık; sorunsuzlar (uyarı/bilgi yok) tek satırda toplanır
                    const okRows = pdfCheck.filter(r => r.level === 'ok' && !r.linked);
                    const rest = pdfCheck.filter(r => !okRows.includes(r)).sort((a, b) => (a.level === 'warn' ? 0 : 1) - (b.level === 'warn' ? 0 : 1));
                    const rowView = (r: CheckRow) => (
                    <div key={r.item.id}>
                      <span className={`font-semibold ${r.level === 'warn' ? 'text-amber-900' : 'text-slate-700'}`}>{r.level === 'ok' && '✓ '}{r.item.productName}</span>
                      <span className="text-slate-600"> · bu teklifte {pctTr(r.item.discount || 0)}
                        {r.list && ` · ${r.list.name}`}
                        {r.history
                          ? ` · önceki${r.history.otherTerm ? ` (${r.history.otherTerm}, bu vadede yok)` : ''} ${pctTr(r.history.discount)}${r.history.price ? `, ${r.history.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${r.history.currency === 'TRY' ? 'TL' : r.history.currency}` : ''} (${r.history.own ? 'bu firma' : r.history.customer}, ${day(r.history.date)}, ${r.history.quoteNumber})`
                          : ' · daha önce teklif edilmemiş'}
                      </span>
                      {r.issues.map(x => <div key={x.text} className={x.level === 'warn' ? 'text-amber-700' : 'text-slate-500'}>· {x.text}</div>)}
                      {r.linked && <div className="text-emerald-700">✓ Fiyat listesine bağlandı: {r.linked}</div>}
                      {!r.linked && r.code && r.issues.some(x => x.kind === 'nolist') && (
                        <SuggestMatchBox productName={r.item.productName} suggest={r.suggest || []} busyId={linking} onLink={s => linkSuggestion(r, s)} />
                      )}
                    </div>
                    );
                    return (
                      <>
                        {rest.map(rowView)}
                        {okRows.length > 0 && (
                          <button type="button" onClick={() => setShowOkRows(v => !v)} className="block text-emerald-700 font-semibold">
                            ✓ {okRows.length} kalem fiyat listesi ve önceki tekliflerle uyumlu {showOkRows ? '(gizle)' : '(göster)'}
                          </button>
                        )}
                        {showOkRows && okRows.map(rowView)}
                      </>
                    );
                  })()}
                  {warnCount > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {discFix.length > 0 && (
                        <button type="button" onClick={() => {
                          const want = new Map(discFix.map(r => [r.item.id, r.expected!]));
                          setItems(prev => prev.map(it => (want.has(it.id) ? { ...it, discount: want.get(it.id)! } : it)));
                          setPdfCheck(prev => prev && prev.map(r => (want.has(r.item.id)
                            ? (() => { const issues = r.issues.filter(x => x.kind !== 'discount'); return { ...r, item: { ...r.item, discount: want.get(r.item.id)! }, issues, level: issues.some(x => x.level === 'warn') ? 'warn' as const : issues.length ? 'info' as const : 'ok' as const }; })()
                            : r)));
                          setPdfNotes(prev => prev.filter(n => n.level !== 'warn' || !/iskonto|verilmiş/.test(n.text)));
                        }} className="px-2.5 py-1 rounded-md bg-amber-600 text-white font-bold">İskontoları önerilene göre düzelt ({discFix.length})</button>
                      )}
                      <span className="opacity-80">Mikro'daki gibi kalması gerekiyorsa doğrudan kaydedebilirsiniz.</span>
                    </div>
                  )}
                </div>
              );
            })()}
            {remoteDup && (
              <div className="text-xs rounded-md px-3 py-2.5 bg-amber-50 text-amber-900 border border-amber-300">
                <b>Bu teklif sistemde zaten var:</b> {typedNo} · {remoteDup.customer} · {remoteDup.date} · {remoteDup.owner} ekledi.
                {' '}Kaydedince yeni kayıt açılmaz; mevcut teklif sizin girdiğinizle güncellenir (tek kayıt).
                {saveErr && <div className="mt-1 text-rose-700">{saveErr}</div>}
              </div>
            )}
            {existing && !isEdit && (
              <div className="text-xs rounded-md px-3 py-2.5 bg-amber-50 text-amber-900 border border-amber-300">
                <b>Bu teklif sistemde zaten var:</b> {quoteNo(existing.q)} · {existing.q.customerName} · {dayOf(existing.q.createdAt).split('-').reverse().join('.')} · {formatQuoteAmount(existing.q)}
                <div className="mt-1">Kaydedince yeni kayıt açılmaz, mevcut teklifin üstüne yazılır. Kalemler/tutar değiştiyse numara revize olur (ör. {revBase(existing.q.quoteNumber)}-R{revOf(existing.q.quoteNumber) + (existing.q.rev || 0) + 1}).</div>
              </div>
            )}
            {isEdit && pdfMeta && (
              <div className="text-xs rounded-md px-3 py-2 bg-sky-50 text-sky-900 border border-sky-200">
                <b>Bu teklif sistemde kayıtlı</b> ({dayOf(editQuote!.createdAt).split('-').reverse().join('.')}). PDF'teki bilgiler forma işlendi:
                {' '}eski tutar <b>{formatQuoteAmount(editQuote!)}</b> → yeni <b>{fmt2(totalQuoteAmount)} {CURRENCY_LABEL[quoteCurrency]}</b>.
                {' '}Kaydedince mevcut teklif güncellenir, yeni teklif açılmaz.
              </div>
            )}

            {/* Teklif bilgileri */}
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm p-2.5 grid grid-cols-2 grid-flow-dense sm:grid-flow-row sm:grid-cols-12 gap-x-2 gap-y-2">
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
              <div className="col-span-2 sm:col-span-4">
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
                {(() => {
                  const st = findCustomer(customers, customerName);
                  if (!st || !st.status || st.status === 'aktif') return null;
                  return (
                    <p className={`mt-1 text-[11px] font-bold rounded-md px-2 py-1 ${st.status === 'kara_liste' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                      {st.status === 'kara_liste' ? '⚠ Bu firma kara listede' : 'Bu firma pasif'}{st.statusNote ? `: ${st.statusNote}` : ''}
                    </p>
                  );
                })()}
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="ql">Şehir *</label>
                <CityInput required value={city} onChange={setCity} className="qf" />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="ql">Tarih *</label>
                <DateInput required value={quoteDate} onChange={setQuoteDate} className="qf" />
              </div>
              <div className="col-span-1 sm:col-span-2 ">
                <label className="ql">Vade{isEdit ? '' : ' *'}</label>
                <select required={!isEdit} value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} className="qf">
                  <option value="">Seçiniz</option>
                  {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {localDup && !isEdit && <p className="col-span-2 sm:col-span-12 text-[11px] text-amber-700 -mt-1">Bu teklif no sistemde var; kaydedince yeni kayıt açılmaz, mevcut teklifin üstüne yazılır (değiştiyse -R1, -R2… olur).</p>}
              {localDup && isEdit && <p className="col-span-2 sm:col-span-12 text-[11px] text-amber-700 -mt-1">Bu teklif no başka bir teklifte de var.</p>}
            </div>

            {/* Kalemler */}
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-200 bg-slate-50 rounded-t-md">
                <span className="text-[11px] font-black text-slate-700 uppercase tracking-wide">
                  Kalemler ({items.filter(it => it.productName.trim()).length})
                </span>
                <span className="hidden md:inline text-[10px] text-slate-500 flex-1 text-right">
                  Son kutuda Tab → yeni kalem · Alt+↑↓ → taşı · Ctrl+Enter → Not / Kaydet
                </span>
                <button type="button" onClick={handleAddItem}
                  className="ml-auto md:ml-0 flex items-center gap-1 px-2 py-1 rounded text-xs font-bold text-brand-700 hover:bg-brand-50">
                  <Plus className="w-3.5 h-3.5" /> Kalem
                </button>
              </div>

              {/* Sütun başlıkları (geniş ekran) */}
              <div className="qrow hidden lg:grid px-2 py-1 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200">
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
              <div className="qrow lg:hidden px-2 pt-1 -mb-1 text-[9px] font-bold text-slate-500 uppercase" aria-hidden>
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
                    <span data-a="no" className="text-[11px] font-bold text-slate-500 tabular-nums lg:text-right">{index + 1}.</span>
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
                    <div data-a="tut" className="text-xs font-bold text-slate-700 tabular-nums lg:text-right truncate">
                      {lineNet(item) > 0 ? `${fmt2(lineNet(item))} ${CURRENCY_LABEL[item.currency || 'TRY']}` : <span className="text-slate-300 font-normal">—</span>}
                    </div>
                    <div data-a="tools" className="flex items-center">{rowTools(index)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Not + toplamlar */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2.5 items-start">
              <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm p-2.5">
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
                <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm overflow-x-auto">
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
        <div className="px-3 py-2 bg-white border-t border-slate-200 flex items-center justify-end gap-2 pb-safe flex-wrap">
          {requireCheck && (
            <label className={`mr-auto flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-bold cursor-pointer select-none ${checked ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : checkWarn ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
              <input type="checkbox" checked={checked} onChange={e => { setChecked(e.target.checked); setCheckWarn(false); }} className="w-4 h-4 accent-emerald-600" />
              Kontrol ettim{checkWarn && !checked ? ' — kaydetmeden önce işaretleyin' : ''}
            </label>
          )}
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm">
            Vazgeç
          </button>
          <button
            type="button"
            disabled={saving || (requireCheck && !checked)}
            onClick={() => (document.getElementById('newQuoteForm') as HTMLFormElement | null)?.requestSubmit()}
            className="px-5 py-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-sm shadow-sm"
          >
            {saving ? 'Kaydediliyor…' : isEdit ? 'Değişiklikleri Kaydet' : (remoteDup || localDup) ? 'Mevcut Teklifi Güncelle' : 'Teklifi Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};
