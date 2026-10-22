import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, Wallet, Receipt, Send, Loader2 } from 'lucide-react';
import { Collection, Customer, Expense, UserRole } from '../types';
import { CURRENCY_LABEL, Currency } from '../lib/money';
import { findCustomer } from '../lib/customers';
import { DecimalInput } from './DecimalInput';
import { DateInput } from './DateInput';
import { CityInput, TextSuggest } from './TextSuggest';
import { PrintDoc, useReportSender } from './ReportPrint';
import { SuggestInput } from './SuggestInput';

export const COLLECTION_METHODS = ['Çek', 'Nakit', 'Havale/EFT', 'Kredi Kartı', 'Senet'];
export const EXPENSE_METHODS = ['Kredi Kartı **9973', 'UTTS', 'Şahsi', 'Şirket', 'Nakit', 'Havale/EFT'];
// Harcama türleri (Google Sheet "Harcamalar" ile aynı); ayrıntı (şehir, gece, otopark…) açıklamaya yazılır
export const EXPENSE_CATEGORIES = ['Yemek', 'Yakıt', 'İkramlık', 'Konaklama', 'Adblue', 'Diğer'];
/** Çek bankaları (öneri listesi; kayıtlardaki yazımlarla uyumlu) */
export const BANKS = [
  'Halkbank', 'Ziraat Bankası', 'Vakıfbank', 'Garanti Bankası', 'İş Bankası', 'Yapı Kredi', 'Akbank',
  'QNB Bank', 'Denizbank', 'TEB Bankası', 'Kuveyttürk', 'Vakıf Katılım', 'Ziraat Katılım', 'Emlak Katılım',
  'Türkiye Finans', 'Albaraka Bankası', 'Şekerbank', 'ING Bank', 'HSBC', 'Fibabanka', 'Odeabank',
  'Anadolubank', 'Alternatif Bank', 'Burgan Bank', 'ICBC Turkey', 'Enpara',
];
/** Vadesi olan tahsilat şekilleri */
const HAS_DUE = ['Çek', 'Senet'];

type Kind = 'collections' | 'expenses';
type LedgerRecord = Collection | Expense;

interface LedgerPanelProps {
  kind: Kind;
  records: LedgerRecord[];
  customers?: Customer[];
  currentRole: UserRole;
  onSave: (record: LedgerRecord) => void;
  onDelete: (id: string) => void;
  /** Ana sayfadaki "Ekle" kısayoluyla açıldıysa formu hemen aç */
  startNew?: boolean;
  /** Sesli asistandan gelen taslak: yeni kayıt formu bu bilgilerle dolu açılır */
  startDraft?: Partial<Collection & Expense> | null;
  onStartNewHandled?: () => void;
}

const LIST_PAGE = 50;
const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR'];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (s?: string) => (s ? s.split('-').reverse().join('.') : '-');
const money = (v: number, c: Currency) =>
  `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_LABEL[c]}`;
const fold = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

/** Yazılana göre öneriler: tüm kelimeler geçmeli, yazılanla başlayanlar önce; birebir eşleşmede liste kapanır */
function suggest<T>(items: T[], q: string, label: (t: T) => string, limit = 8): T[] {
  const f = fold(q.trim());
  if (!f) return [];
  const toks = f.split(/\s+/);
  const rows = items.map(t => ({ t, f: fold(label(t)) }));
  if (rows.some(r => r.f === f)) return [];
  return rows
    .filter(r => toks.every(k => r.f.includes(k)))
    .sort((a, b) => Number(b.f.startsWith(f)) - Number(a.f.startsWith(f)) || a.f.localeCompare(b.f, 'tr'))
    .slice(0, limit)
    .map(r => r.t);
}

const isCollectionRec = (r: LedgerRecord): r is Collection => 'customerName' in r;
/** Kaydın "kime / ne için" alanı: tahsilatta müşteri, harcamada kategori */
const partyOf = (r: LedgerRecord) => (isCollectionRec(r) ? r.customerName : r.category);
const searchText = (r: LedgerRecord) => isCollectionRec(r)
  ? `${r.customerName} ${r.city || ''} ${r.bankName || ''} ${r.bankBranch || ''} ${r.checkNo || ''} ${r.description || ''} ${r.method}`
  : `${r.category} ${r.region || ''} ${r.description || ''} ${r.method}`;

const sumByCurrency = (list: LedgerRecord[]) =>
  list.reduce<Record<Currency, number>>((acc, r) => {
    acc[r.currency || 'TRY'] += r.amount || 0;
    return acc;
  }, { TRY: 0, USD: 0, EUR: 0 });

const totalsText = (t: Record<Currency, number>) => {
  const parts = CURRENCIES.filter(c => t[c] > 0).map(c => money(t[c], c));
  return parts.length ? parts.join(' + ') : money(0, 'TRY');
};

/** Sabit liste + kayıtlarda geçen değerler (sıra korunur) */
const withExisting = (base: string[], values: (string | undefined)[]) => {
  const set = new Set(base);
  values.forEach(v => { if (v && v.trim()) set.add(v.trim()); });
  return [...set];
};

export const LedgerPanel: React.FC<LedgerPanelProps> = ({ kind, records, customers = [], currentRole, onSave, onDelete, startNew, startDraft, onStartNewHandled }) => {
  const isCollection = kind === 'collections';
  const t = isCollection
    ? { one: 'Tahsilat', party: 'Müşteri / Firma', Icon: Wallet, tone: 'text-accent-600 bg-accent-50' }
    : { one: 'Harcama', party: 'Kategori', Icon: Receipt, tone: 'text-orange-600 bg-orange-50' };

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  // Sıralama: varsayılan son eklenen en üstte (tarihi eski olsa bile); seçim cihazda hatırlanır
  // Varsayılan: tarihe göre (en yeni tarih üstte)
  const sortStore = `enyap-ledger-sort3-${kind}`;
  const defaultSort = 'date';
  const [sortMode, setSortModeState] = useState<'added' | 'date'>(() => {
    try { const v = localStorage.getItem(sortStore); return v === 'date' || v === 'added' ? v : defaultSort; } catch { return defaultSort; }
  });
  const setSortMode = (v: 'added' | 'date') => {
    setSortModeState(v);
    try { localStorage.setItem(sortStore, v); } catch { /* */ }
  };
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [limit, setLimit] = useState(LIST_PAGE);
  const [editing, setEditing] = useState<LedgerRecord | null>(null);

  const todayStr = today();
  const methods = useMemo(() => withExisting(isCollection ? COLLECTION_METHODS : EXPENSE_METHODS, records.map(r => r.method)), [records, isCollection]);
  const categories = useMemo(() => (isCollection ? [] : withExisting(EXPENSE_CATEGORIES, records.map(r => partyOf(r)))), [records, isCollection]);
  // Kayıtlardaki şubeler, bankaya göre (öneri için)
  const branches = useMemo(() => {
    const out: { bank: string; branch: string }[] = [];
    const seen = new Set<string>();
    records.forEach(r => {
      if (!isCollectionRec(r) || !r.bankBranch?.trim()) return;
      const k = fold(`${r.bankName || ''}|${r.bankBranch}`);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ bank: r.bankName || '', branch: r.bankBranch.trim() });
    });
    return out;
  }, [records]);
  const regions = useMemo(() => (isCollection ? [] : withExisting([], records.map(r => (r as Expense).region)).sort((a, b) => a.localeCompare(b, 'tr'))), [records, isCollection]);

  const filtered = useMemo(() => {
    const q = fold(search.trim());
    return records
      .filter(r => {
        if (q && !fold(searchText(r)).includes(q)) return false;
        if (dateFrom && r.date < dateFrom) return false;
        if (dateTo && r.date > dateTo) return false;
        if (methodFilter !== 'all' && r.method !== methodFilter) return false;
        if (categoryFilter !== 'all' && partyOf(r) !== categoryFilter) return false;
        if (regionFilter !== 'all' && (r as Expense).region !== regionFilter) return false;
        if (currencyFilter !== 'all' && r.currency !== currencyFilter) return false;
        if (dueFilter !== 'all') {
          const due = (r as Collection).dueDate;
          if (!due) return false;
          if (dueFilter === 'upcoming' && due < todayStr) return false;
          if (dueFilter === 'past' && due >= todayStr) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Vade filtresinde en yakın vade üstte
        if (dueFilter === 'upcoming') return ((a as Collection).dueDate || '').localeCompare((b as Collection).dueDate || '');
        if (sortMode === 'added') return (b.createdAt || '').localeCompare(a.createdAt || '') || (b.date || '').localeCompare(a.date || '');
        return (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt);
      });
  }, [records, search, dateFrom, dateTo, methodFilter, categoryFilter, regionFilter, currencyFilter, dueFilter, todayStr, sortMode]);

  const filteredTotals = useMemo(() => sumByCurrency(filtered), [filtered]);
  const hasFilters = !!(search || dateFrom || dateTo || methodFilter !== 'all' || categoryFilter !== 'all' || regionFilter !== 'all' || currencyFilter !== 'all' || dueFilter !== 'all');
  // Hızlı tarih aralığı (ör. seyahat dönüşü muhasebeye gönderilecek harcamalar)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const setRange = (from: string, to: string) => { setDateFrom(from); setDateTo(to); setLimit(LIST_PAGE); };
  const presets: [string, () => void][] = [
    ['Bu hafta', () => { const d = new Date(); const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setRange(iso(m), iso(d)); }],
    ['Son 7 gün', () => { const d = new Date(); const f = new Date(d); f.setDate(d.getDate() - 6); setRange(iso(f), iso(d)); }],
    ['Bu ay', () => { const d = new Date(); setRange(iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)); }],
    ['Geçen ay', () => { const d = new Date(); setRange(iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))); }],
  ];

  // PDF'te "Harcamayı yapan" (cihazda hatırlanır)
  const [spender, setSpenderState] = useState(() => { try { return localStorage.getItem('enyap-expense-spender') ?? 'Emre KARAKAYA'; } catch { return 'Emre KARAKAYA'; } });
  const setSpender = (v: string) => { setSpenderState(v); try { localStorage.setItem('enyap-expense-spender', v); } catch { /* */ } };
  // Listelenen kayıtların PDF dökümü (muhasebeye göndermek için): tarih sırasıyla, kategori/ödeme özetli
  const report = useReportSender();
  const printDoc = useMemo<PrintDoc>(() => {
    const rows = [...filtered].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const period = dateFrom || dateTo ? `${dateFrom ? fmtDate(dateFrom) : '…'} – ${dateTo ? fmtDate(dateTo) : '…'}` : 'Tüm kayıtlar';
    const tot = totalsText(filteredTotals);
    const detail = isCollection
      ? {
          heading: 'Tahsilat Listesi',
          columns: [{ label: 'Tarih' }, { label: 'Firma' }, { label: 'Ödeme' }, { label: 'Vade / Banka / No' }, { label: 'Açıklama' }, { label: 'Tutar', align: 'right' as const }],
          rows: rows.map(r => { const c = r as Collection; return [fmtDate(c.date), c.customerName, c.method, [c.dueDate && fmtDate(c.dueDate), c.bankName, c.checkNo].filter(Boolean).join(' · '), c.description || '', money(c.amount, c.currency)]; }),
          foot: ['Toplam', '', '', '', `${rows.length} kayıt`, tot],
        }
      : {
          heading: 'Harcama Listesi',
          columns: [{ label: 'Tarih' }, { label: 'Kategori' }, { label: 'Şehir' }, { label: 'Ödeme' }, { label: 'Açıklama' }, { label: 'Tutar', align: 'right' as const }],
          rows: rows.map(r => { const e = r as Expense; return [fmtDate(e.date), e.category, e.region || '', e.method, e.description || '', money(e.amount, e.currency)]; }),
          foot: ['Toplam', '', '', '', `${rows.length} kayıt`, tot],
        };
    return {
      title: isCollection ? 'Tahsilat Dökümü' : 'Harcama Dökümü',
      period,
      fileName: `${isCollection ? 'Tahsilatlar' : 'Harcamalar'} ${period.replace(/[^\d.–… a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '').trim()}`,
      hideFooter: true,
      summary: [
        ['Toplam', tot, `${rows.length} kayıt`],
        ['Dönem', period],
        ...(!isCollection && spender.trim() ? [['Harcamayı Yapan', spender.trim()] as [string, string]] : []),
        ...(search ? [['Arama', search] as [string, string]] : []),
      ],
      sections: [
        detail,
      ],
    };
  }, [filtered, filteredTotals, dateFrom, dateTo, search, isCollection, spender]);

  const resetFilters = () => {
    setSearch(''); setDateFrom(''); setDateTo(''); setMethodFilter('all'); setCategoryFilter('all');
    setRegionFilter('all'); setCurrencyFilter('all'); setDueFilter('all'); setLimit(LIST_PAGE);
  };
  const changed = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setLimit(LIST_PAGE); };

  const openNew = (draft?: Partial<Collection & Expense> | null) => {
    const now = new Date().toISOString();
    const base = {
      id: `${isCollection ? 'thl' : 'hrc'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: todayStr,
      amount: 0,
      currency: 'TRY' as Currency,
      method: methods[0],
      description: '',
      createdBy: currentRole,
      createdAt: now,
      updatedAt: now,
    };
    const clean = Object.fromEntries(Object.entries(draft || {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
    setEditing(isCollection
      ? { ...base, customerName: '', ...clean } as Collection
      : { ...base, category: '', ...clean } as Expense);
  };

  useEffect(() => {
    if (startNew) { openNew(startDraft); onStartNewHandled?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNew]);

  const handleDelete = (r: LedgerRecord) => {
    if (confirm(`${fmtDate(r.date)} tarihli ${money(r.amount, r.currency)} ${t.one.toLocaleLowerCase('tr')} kaydı silinsin mi?`)) onDelete(r.id);
  };


  // Aynı firmadan aynı gün alınan tahsilatlar (ör. 4 çek) tek satırda toplanır; dokununca parçalar açılır
  const [merge, setMerge] = useState(() => { try { return localStorage.getItem('enyap-ledger-merge') !== '0'; } catch { return true; } });
  const toggleMerge = () => setMerge(m => { try { localStorage.setItem('enyap-ledger-merge', m ? '0' : '1'); } catch { /* */ } return !m; });
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const out: { key: string; items: LedgerRecord[] }[] = [];
    const idx = new Map<string, number>();
    for (const r of filtered.slice(0, limit)) {
      const key = isCollection ? `${fold(partyOf(r) || '')}|${r.date}|${r.currency}` : r.id;
      const at = idx.get(key);
      if (at === undefined) { idx.set(key, out.length); out.push({ key, items: [r] }); }
      else out[at].items.push(r);
    }
    return out;
  }, [filtered, limit, isCollection]);
  const toggleGroup = (k: string) => setOpenGroups(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const groupInfo = (g: { items: LedgerRecord[] }) => {
    const first = g.items[0] as Collection;
    const total = g.items.reduce((t, r) => t + r.amount, 0);
    const methods = [...new Set(g.items.map(r => r.method).filter(Boolean))].join(', ');
    const dues = g.items.map(r => (r as Collection).dueDate).filter(Boolean).sort() as string[];
    return { first, total, methods, dues };
  };
  const mobileItem = (r: LedgerRecord) => {
            const c = isCollectionRec(r) ? r : null;
            const e = c ? null : (r as Expense);
            const overdue = !!c?.dueDate && c.dueDate < todayStr;
            const detail = c
              ? [c.method, c.bankName, c.checkNo ? `No ${c.checkNo}` : ''].filter(Boolean).join(' · ')
              : [e?.region, r.method].filter(Boolean).join(' · ');
            return (
              <div key={r.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm leading-snug">{partyOf(r) || '-'}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{fmtDate(r.date)}{c?.city ? ` · ${c.city}` : ''}</div>
                  </div>
                  <div className="font-black text-slate-900 text-sm tabular-nums whitespace-nowrap">{money(r.amount, r.currency)}</div>
                </div>
                {detail && <div className="text-xs text-slate-600 mt-1">{detail}</div>}
                {r.description && <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{r.description}</div>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div>
                    {c?.dueDate && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${overdue ? 'bg-slate-100 text-slate-500' : 'bg-brand-50 text-brand-700'}`}>
                        Vade {fmtDate(c.dueDate)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(r)} title="Düzenle" className="p-1.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(r)} title="Sil" className="p-1.5 rounded-md bg-slate-50 text-slate-500 border border-slate-200"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          };
  const tableRow = (r: LedgerRecord) => {
                const c = isCollectionRec(r) ? r : null;
                const e = c ? null : (r as Expense);
                const overdue = !!c?.dueDate && c.dueDate < todayStr;
                return (
                  <tr key={r.id} className="hover:bg-slate-50 align-top">
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 tabular-nums">{fmtDate(r.date)}</td>
                    <td className="py-2.5 px-3 min-w-[140px]">
                      <div className="font-semibold text-slate-900">{partyOf(r) || '-'}</div>
                      {c?.city && <div className="text-xs text-slate-500">{c.city}</div>}
                    </td>
                    {c ? (
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="text-slate-800">{c.method || '-'}</div>
                        {(c.bankName || c.checkNo) && (
                          <div className="text-xs text-slate-500">
                            {[c.bankName, c.bankBranch].filter(Boolean).join(' · ')}{c.checkNo ? ` · No ${c.checkNo}` : ''}
                          </div>
                        )}
                      </td>
                    ) : (
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">{e?.region || '-'}</td>
                    )}
                    {c ? (
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">
                        {c.dueDate ? (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${overdue ? 'bg-slate-100 text-slate-500' : 'bg-brand-50 text-brand-700'}`}>
                            {fmtDate(c.dueDate)}
                          </span>
                        ) : <span className="text-slate-400">-</span>}
                      </td>
                    ) : (
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{r.method || '-'}</td>
                    )}
                    <td className="py-2.5 px-3 text-slate-600 max-w-[260px] truncate" title={r.description || ''}>{r.description || '-'}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap tabular-nums">{money(r.amount, r.currency)}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(r)} title="Düzenle" className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-50">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(r)} title="Sil" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              };
  const mobileGroup = (g: { key: string; items: LedgerRecord[] }) => {
    const { first, total, methods, dues } = groupInfo(g);
    const open = openGroups.has(g.key);
    return (
      <div key={g.key} className={open ? 'bg-slate-50/60' : ''}>
        <button onClick={() => toggleGroup(g.key)} className="w-full text-left p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-slate-900 text-sm leading-snug">{partyOf(first) || '-'}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{fmtDate(first.date)}{first.city ? ` · ${first.city}` : ''}</div>
            </div>
            <div className="text-right">
              <div className="font-black text-slate-900 text-sm tabular-nums whitespace-nowrap">{money(total, first.currency)}</div>
              <div className="text-[10px] font-bold text-brand-700">{g.items.length} parça {open ? '▲' : '▼'}</div>
            </div>
          </div>
          <div className="text-xs text-slate-600 mt-1">{methods}{dues.length ? ` · vade ${fmtDate(dues[0])}${dues.length > 1 ? ` – ${fmtDate(dues[dues.length - 1])}` : ''}` : ''}</div>
        </button>
        {open && <div className="border-t border-dashed border-slate-200 divide-y divide-slate-100 pl-3">{g.items.map(mobileItem)}</div>}
      </div>
    );
  };
  const tableGroup = (g: { key: string; items: LedgerRecord[] }) => {
    const { first, total, methods, dues } = groupInfo(g);
    const open = openGroups.has(g.key);
    return (
      <React.Fragment key={g.key}>
        <tr onClick={() => toggleGroup(g.key)} className="hover:bg-slate-50 cursor-pointer align-top bg-white">
          <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 tabular-nums">{fmtDate(first.date)}</td>
          <td className="py-2.5 px-3 min-w-[140px]">
            <div className="font-semibold text-slate-900">{partyOf(first) || '-'}</div>
            {first.city && <div className="text-xs text-slate-500">{first.city}</div>}
          </td>
          <td className="py-2.5 px-3 whitespace-nowrap text-slate-800">{methods || '-'}</td>
          <td className="py-2.5 px-3 whitespace-nowrap text-xs text-slate-600 tabular-nums">{dues.length ? `${fmtDate(dues[0])}${dues.length > 1 ? ` – ${fmtDate(dues[dues.length - 1])}` : ''}` : '-'}</td>
          <td className="py-2.5 px-3 text-xs font-bold text-brand-700">{g.items.length} parça {open ? '▲' : '▼'}</td>
          <td className="py-2.5 px-3 text-right font-black text-slate-900 whitespace-nowrap tabular-nums">{money(total, first.currency)}</td>
          <td />
        </tr>
        {open && g.items.map(tableRow)}
      </React.Fragment>
    );
  };

  const colCount = isCollection ? 7 : 7;

  return (
    <div className="space-y-4">
      {/* Filtreler */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => changed(setSearch)(e.target.value)}
            placeholder={isCollection ? 'Müşteri, banka, çek no ara...' : 'Kategori, şehir, açıklama ara...'}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:flex-wrap [&>select]:w-full sm:[&>select]:w-auto [&>select]:min-w-0">
          {isCollection && (
            <select value={methodFilter} onChange={e => changed(setMethodFilter)(e.target.value)} className="p-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">Tüm Ödeme Şekilleri</option>
              {methods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {isCollection && (
            <select value={dueFilter} onChange={e => changed(setDueFilter)(e.target.value as typeof dueFilter)} className="p-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">Tüm Vadeler</option>
              <option value="upcoming">Vadesi Gelmemiş</option>
              <option value="past">Vadesi Geçmiş</option>
            </select>
          )}
          <select value={sortMode} onChange={e => setSortMode(e.target.value as 'added' | 'date')} className={`${isCollection ? '' : 'col-span-2 '}p-2 border border-slate-200 rounded-lg text-sm bg-white`} aria-label="Sıralama">
            <option value="added">Son eklenen en üstte</option>
            <option value="date">{isCollection ? 'Alım tarihi: yeni → eski' : 'Tarih: yeniden eskiye'}</option>
          </select>
          {isCollection && (
            <select value={currencyFilter} onChange={e => changed(setCurrencyFilter)(e.target.value)} className="p-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">Tüm Para Birimleri</option>
              {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
            </select>
          )}
          <div className="col-span-2 flex items-center gap-1 text-xs text-slate-500 [&>div]:flex-1 [&>div]:min-w-0 sm:[&>div]:flex-none sm:[&>div]:w-40">
            <DateInput value={dateFrom} onChange={v => changed(setDateFrom)(v)} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
            <span>-</span>
            <DateInput value={dateTo} onChange={v => changed(setDateTo)(v)} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div className="col-span-2 sm:col-span-1 flex flex-wrap items-center gap-1">
            {presets.map(([label, fn]) => (
              <button key={label} type="button" onClick={fn} className="px-2.5 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700">{label}</button>
            ))}
          </div>
          {!isCollection && (
            <input value={spender} onChange={e => setSpender(e.target.value)} placeholder="Harcamayı yapan (PDF'te yazar)"
              title="PDF'te 'Harcamayı Yapan' olarak yazılır" className="p-2 border border-slate-200 rounded-lg text-sm" />
          )}
          <button type="button" onClick={() => report.open(printDoc)} disabled={!filtered.length || report.busy}
            title="Listelenen kayıtların PDF'ini gör, sonra gönder / indir"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-brand-200 bg-white text-brand-700 text-xs sm:text-sm font-bold hover:bg-brand-50 disabled:opacity-40">
            {report.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {report.busy ? 'Hazırlanıyor…' : `PDF Gönder (${filtered.length})`}
          </button>
          {report.msg && <p className="w-full text-xs text-slate-600">{report.msg}</p>}
          {hasFilters && (
            <button onClick={resetFilters} className="px-2 py-2 rounded-lg border border-slate-200 sm:border-0 text-xs font-bold text-slate-500 hover:text-slate-800 sm:underline">Filtreleri temizle</button>
          )}
          <button onClick={() => openNew()}
            className={`${hasFilters ? '' : 'col-span-2 '}flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs sm:text-sm font-bold shadow-xs`}>
            <Plus className="w-4 h-4" /> {t.one} Ekle
          </button>
        </div>
      </div>

      {/* Liste üstü: listedeki kayıtların toplamı ve birleştirme seçeneği */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 empty:hidden">
        {hasFilters && (
          <div className="text-sm text-slate-600">
            Filtrelenen: <b className="text-slate-900 tabular-nums">{totalsText(filteredTotals)}</b>
            <span className="text-slate-400"> · {filtered.length} kayıt</span>
          </div>
        )}
        {isCollection && (
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={merge} onChange={toggleMerge} />
            Aynı gün aynı firmayı birleştir
          </label>
        )}
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Telefon: kart görünümü */}
        <div className="md:hidden divide-y divide-slate-100">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              {records.length === 0 ? `Henüz ${t.one.toLocaleLowerCase('tr')} kaydı yok.` : 'Filtrelere uygun kayıt bulunamadı.'}
            </p>
          )}
          {groups.map(g => (g.items.length === 1 || !merge ? g.items.map(mobileItem) : mobileGroup(g)))}
        </div>
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 whitespace-nowrap">Tarih</th>
                <th className="py-3 px-3">{t.party}</th>
                <th className="py-3 px-3 whitespace-nowrap">{isCollection ? 'Ödeme Şekli / Banka' : 'Şehir'}</th>
                {isCollection ? <th className="py-3 px-3 whitespace-nowrap">Vade</th> : <th className="py-3 px-3 whitespace-nowrap">Ödeme Şekli</th>}
                <th className="py-3 px-3">Açıklama</th>
                <th className="py-3 px-3 text-right">Tutar</th>
                <th className="py-3 px-3 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map(g => (g.items.length === 1 || !merge ? g.items.map(tableRow) : tableGroup(g)))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="py-10 text-center text-slate-500 text-sm">
                    {records.length === 0 ? `Henüz ${t.one.toLocaleLowerCase('tr')} kaydı yok. "${t.one} Ekle" ile başlayın.` : 'Filtrelere uygun kayıt bulunamadı.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{limit} / {filtered.length} kayıt gösteriliyor</span>
            <button onClick={() => setLimit(n => n + LIST_PAGE)} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700">
              Daha fazla göster
            </button>
          </div>
        )}
      </div>

      {report.modal}
      {editing && isCollection && !records.some(r => r.id === editing.id) && (
        <MultiCollectionForm
          record={editing as Collection}
          methods={methods}
          customers={customers}
          branches={branches}
          onCancel={() => setEditing(null)}
          onSave={rec => { onSave(rec); setEditing(null); }}
        />
      )}
      {editing && !isCollection && !records.some(r => r.id === editing.id) && (
        <MultiExpenseForm
          record={editing as Expense}
          methods={methods}
          categories={categories}
          regions={regions}
          onCancel={() => setEditing(null)}
          onSave={rec => { onSave(rec); setEditing(null); }}
        />
      )}
      {editing && records.some(r => r.id === editing.id) && (
        <LedgerForm
          kind={kind}
          record={editing}
          title={records.some(r => r.id === editing.id) ? `${t.one} Düzenle` : `Yeni ${t.one}`}
          partyLabel={t.party}
          methods={methods}
          categories={categories}
          regions={regions}
          customers={customers}
          branches={branches}
          onCancel={() => setEditing(null)}
          onSave={rec => { onSave(rec); setEditing(null); }}
        />
      )}
    </div>
  );
};

const inputCls = 'w-full p-2 border border-slate-200 rounded-lg';
const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className = '', children }) => (
  <label className={`block ${className}`}>
    <span className="block text-xs font-bold text-slate-700 mb-1">{label}</span>
    {children}
  </label>
);

const LedgerForm: React.FC<{
  kind: Kind;
  record: LedgerRecord;
  title: string;
  partyLabel: string;
  methods: string[];
  categories: string[];
  regions: string[];
  customers: Customer[];
  branches: { bank: string; branch: string }[];
  onCancel: () => void;
  onSave: (r: LedgerRecord) => void;
}> = ({ kind, record, title, partyLabel, methods, categories, regions, customers, branches, onCancel, onSave }) => {
  const [form, setForm] = useState<LedgerRecord>(record);
  const isCollection = kind === 'collections';
  const col = form as Collection;
  const exp = form as Expense;
  const set = (patch: Partial<Collection & Expense>) => setForm(f => ({ ...f, ...patch } as LedgerRecord));
  const hasDue = isCollection && HAS_DUE.includes(form.method);
  const trimOrUndef = (v?: string) => (v && v.trim() ? v.trim() : undefined);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(form.amount > 0)) return;
    const common = { description: trimOrUndef(form.description), updatedAt: new Date().toISOString() };
    onSave(isCollection
      ? {
          ...col, ...common,
          customerName: col.customerName.trim(),
          city: trimOrUndef(col.city),
          bankName: hasDue ? trimOrUndef(col.bankName) : undefined,
          bankBranch: hasDue ? trimOrUndef(col.bankBranch) : undefined,
          checkNo: hasDue ? trimOrUndef(col.checkNo) : undefined,
          dueDate: hasDue ? trimOrUndef(col.dueDate) : undefined,
        }
      : { ...exp, ...common, category: exp.category.trim(), region: trimOrUndef(exp.region) });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCancel}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="p-4 bg-brand-600 text-white flex items-center justify-between">
          <h3 className="font-black text-base">{title}</h3>
          <button type="button" onClick={onCancel} className="p-1 rounded-lg text-brand-100 hover:text-white hover:bg-brand-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tarih *">
              <DateInput required value={form.date} onChange={v => set({ date: v })} className={inputCls} />
            </Field>
            <Field label="Ödeme Şekli">
              <select value={form.method} onChange={e => set({ method: e.target.value })} className={`${inputCls} bg-white`}>
                {methods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>

          {isCollection ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label={`${partyLabel} *`} className="col-span-2">
                <SuggestInput<Customer>
                  required
                  placeholder="Yazın, Enter / Tab ile seçin..."
                  value={col.customerName}
                  onChange={text => {
                    const match = findCustomer(customers, text);
                    set({ customerName: text, ...(match?.city && !col.city ? { city: match.city } : {}) });
                  }}
                  onPick={c => set({ customerName: c.name, ...(c.city ? { city: c.city } : {}) })}
                  suggestions={suggest(customers, col.customerName, c => c.name)}
                  getKey={c => c.id}
                  inputClassName={inputCls}
                  renderItem={c => (
                    <span className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-slate-800 truncate">{c.name}</span>
                      <span className="text-xs text-slate-500 shrink-0">{c.city}</span>
                    </span>
                  )}
                />
              </Field>
              <Field label="Şehir">
                <CityInput value={col.city || ''} onChange={v => set({ city: v })} className={inputCls} />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${partyLabel} *`}>
                <SuggestInput<string>
                  required
                  placeholder="Yazın, Enter / Tab ile seçin..."
                  value={exp.category}
                  onChange={text => set({ category: text })}
                  onPick={c => set({ category: c })}
                  suggestions={suggest(categories, exp.category, c => c)}
                  getKey={c => c}
                  inputClassName={inputCls}
                  renderItem={c => <span className="text-sm text-slate-800">{c}</span>}
                />
              </Field>
              <Field label="Şehir">
                <CityInput value={exp.region || ''} onChange={v => set({ region: v })} className={inputCls} />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label="Tutar *" className="col-span-2">
              <DecimalInput required placeholder="0,00"
                value={form.amount || 0} onValueChange={v => set({ amount: v })}
                className={`${inputCls} tabular-nums`} />
            </Field>
            <Field label="Para Birimi">
              <select value={form.currency} onChange={e => set({ currency: e.target.value as Currency })} className={`${inputCls} bg-white`}>
                {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
              </select>
            </Field>
          </div>

          {hasDue && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-3">
              <Field label="Vade *">
                <DateInput required value={col.dueDate || ''} onChange={v => set({ dueDate: v })} className={`${inputCls} bg-white`} />
              </Field>
              <Field label={`${form.method} No`}>
                <input value={col.checkNo || ''} onChange={e => set({ checkNo: e.target.value })} className={`${inputCls} bg-white`} />
              </Field>
              {form.method === 'Çek' && (
                <>
                  <Field label="Banka">
                    <SuggestInput<string>
                      placeholder="Yazın, Enter / Tab ile seçin..."
                      value={col.bankName || ''}
                      onChange={text => set({ bankName: text })}
                      onPick={b => set({ bankName: b })}
                      suggestions={suggest(BANKS, col.bankName || '', b => b)}
                      getKey={b => b}
                      inputClassName={`${inputCls} bg-white`}
                      renderItem={b => <span className="text-sm text-slate-800">{b}</span>}
                    />
                  </Field>
                  <Field label="Şube">
                    <SuggestInput<string>
                      placeholder="Örn: Isparta Şubesi"
                      value={col.bankBranch || ''}
                      onChange={text => set({ bankBranch: text })}
                      onPick={b => set({ bankBranch: b })}
                      suggestions={suggest(
                        [...new Set(branches
                          .filter(x => !col.bankName?.trim() || fold(x.bank) === fold(col.bankName))
                          .map(x => x.branch))],
                        col.bankBranch || '', b => b)}
                      getKey={b => b}
                      inputClassName={`${inputCls} bg-white`}
                      renderItem={b => <span className="text-sm text-slate-800">{b}</span>}
                    />
                  </Field>
                </>
              )}
            </div>
          )}

          <Field label="Açıklama">
            <textarea rows={2} value={form.description || ''} onChange={e => set({ description: e.target.value })}
              placeholder={isCollection ? 'Örn: 68551 nolu teklif ödemesi' : 'Örn: Akşam yemeği, fiş yok'}
              className={inputCls} />
          </Field>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs">Vazgeç</button>
          <button type="submit" className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm">Kaydet</button>
        </div>
      </form>
    </div>
  );
};

type Piece = Pick<Collection, 'method' | 'amount' | 'currency' | 'dueDate' | 'checkNo' | 'bankName' | 'bankBranch'> & { key: string };
/** Çek no "1962548" → "1962549" (baştaki sıfırlar korunur); sayı değilse aynen kalır */
const nextNo = (v?: string) => {
  const m = v?.trim().match(/^(.*?)(\d+)$/);
  if (!m) return v;
  return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0');
};
/** Vade bir ay sonrası (ay sonu taşmasında ayın son günü) */
const nextMonth = (d?: string) => {
  if (!d) return d;
  const [y, mo, da] = d.split('-').map(Number);
  const t = new Date(y, mo, Math.min(da, new Date(y, mo + 1, 0).getDate()));
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
let pieceSeq = 0;
const newKey = () => `p${++pieceSeq}`;

/**
 * Yeni tahsilat: teklif kalemi girer gibi satır satır. Üstte tarih/firma, altta her satır bir parça (çek, havale...).
 * Son satırın son kutusunda Tab → yeni satır (önceki satırın kopyası: çek no +1, vade +1 ay). Her satır ayrı kayıt olur.
 */
const MultiCollectionForm: React.FC<{
  record: Collection;
  methods: string[];
  customers: Customer[];
  branches: { bank: string; branch: string }[];
  onCancel: () => void;
  onSave: (r: Collection) => void;
}> = ({ record, methods, customers, branches, onCancel, onSave }) => {
  const [head, setHead] = useState({ date: record.date, customerName: record.customerName, city: record.city || '', description: record.description || '' });
  const [rows, setRows] = useState<Piece[]>([{ key: newKey(), method: record.method, amount: record.amount, currency: record.currency }]);
  const [err, setErr] = useState('');
  const focusRow = React.useRef<number | null>(null);
  const tableRef = React.useRef<HTMLDivElement>(null);
  const setRow = (i: number, patch: Partial<Piece>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows(rs => {
    const l = rs[rs.length - 1];
    focusRow.current = rs.length;
    return [...rs, { ...l, key: newKey(), checkNo: nextNo(l.checkNo), dueDate: nextMonth(l.dueDate) }];
  });
  useEffect(() => {
    if (focusRow.current === null) return;
    const el = tableRef.current?.querySelectorAll<HTMLElement>('[data-row]')[focusRow.current]?.querySelector<HTMLInputElement>('[data-amt]');
    focusRow.current = null;
    window.setTimeout(() => { el?.focus(); el?.select?.(); }, 30);
  }, [rows.length]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    const t = e.target as HTMLElement;
    const rowEls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-row]'));
    const ri = rowEls.findIndex(r => r.contains(t));
    if (ri !== rows.length - 1) return;
    const fields = Array.from(rowEls[ri].querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled)'));
    if (fields[fields.length - 1] !== t || !(rows[ri].amount > 0)) return;
    e.preventDefault();
    addRow();
  };

  const filled = rows.filter(r => r.amount > 0);
  const totals = filled.reduce<Record<Currency, number>>((a, r) => { a[r.currency || 'TRY'] += r.amount; return a; }, { TRY: 0, USD: 0, EUR: 0 });
  const t = (v?: string) => (v && v.trim() ? v.trim() : undefined);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!head.customerName.trim()) { setErr('Firma girin.'); return; }
    if (!filled.length) { setErr('En az bir satıra tutar girin.'); return; }
    if (filled.some(r => HAS_DUE.includes(r.method) && !r.dueDate)) { setErr('Çek / senet satırlarında vade zorunlu.'); return; }
    const now = Date.now();
    filled.forEach((r, i) => {
      const due = HAS_DUE.includes(r.method);
      onSave({
        ...record,
        id: i === 0 ? record.id : `thl-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        date: head.date, customerName: head.customerName.trim(), city: t(head.city), description: t(head.description),
        method: r.method, amount: r.amount, currency: r.currency,
        dueDate: due ? t(r.dueDate) : undefined, checkNo: due ? t(r.checkNo) : undefined,
        bankName: due && r.method === 'Çek' ? t(r.bankName) : undefined,
        bankBranch: due && r.method === 'Çek' ? t(r.bankBranch) : undefined,
        createdAt: new Date(now + i).toISOString(), updatedAt: new Date(now + i).toISOString(),
      });
    });
  };

  const c = 'w-full px-2 py-1.5 border border-slate-200 rounded-md bg-white text-sm disabled:bg-slate-100 disabled:text-slate-300';
  const branchList = [...new Set(branches.map(b => b.branch))];
  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCancel}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-5xl rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        <div className="p-4 bg-brand-600 text-white flex items-center justify-between">
          <h3 className="font-black text-base">Yeni Tahsilat</h3>
          <button type="button" onClick={onCancel} className="p-1 rounded-lg text-brand-100 hover:text-white hover:bg-brand-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-3 sm:p-4 space-y-3 overflow-y-auto text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-[9.5rem_1fr_10rem] gap-2">
            <Field label="Tarih *">
              <DateInput required value={head.date} onChange={v => setHead(h => ({ ...h, date: v }))} className={inputCls} />
            </Field>
            <Field label="Müşteri / Firma *" className="col-span-2 sm:col-span-1 order-first sm:order-none">
              <SuggestInput<Customer>
                required
                placeholder="Yazın, Enter / Tab ile seçin..."
                value={head.customerName}
                onChange={text => { const m = findCustomer(customers, text); setHead(h => ({ ...h, customerName: text, ...(m?.city && !h.city ? { city: m.city } : {}) })); }}
                onPick={cu => setHead(h => ({ ...h, customerName: cu.name, ...(cu.city ? { city: cu.city } : {}) }))}
                suggestions={suggest(customers, head.customerName, cu => cu.name)}
                getKey={cu => cu.id}
                inputClassName={inputCls}
                renderItem={cu => (
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-slate-800 truncate">{cu.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">{cu.city}</span>
                  </span>
                )}
              />
            </Field>
            <Field label="Şehir">
              <CityInput value={head.city} onChange={v => setHead(h => ({ ...h, city: v }))} className={inputCls} />
            </Field>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="hidden md:grid crow px-2 py-1.5 bg-slate-100 text-[11px] font-bold text-slate-600 uppercase tracking-wide">
              <span>#</span><span>Ödeme</span><span className="text-right">Tutar</span><span>Dvz</span><span>Vade</span><span>Çek / Senet No</span><span>Banka</span><span>Şube</span><span />
            </div>
            <div ref={tableRef} className="divide-y divide-slate-200" onKeyDownCapture={onKeyDown}>
              {rows.map((r, i) => {
                const due = HAS_DUE.includes(r.method);
                const cek = r.method === 'Çek';
                return (
                  <div key={r.key} data-row className={`crow px-2 py-1.5 ${i % 2 ? 'bg-slate-50/70' : 'bg-white'} focus-within:bg-brand-50/50`}>
                    <span className="text-[11px] font-bold text-slate-400 tabular-nums self-center">{i + 1}.</span>
                    <select value={r.method} onChange={e => setRow(i, { method: e.target.value })} className={c} title="Ödeme şekli">
                      {methods.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <DecimalInput data-amt placeholder="Tutar" value={r.amount || 0} onValueChange={v => setRow(i, { amount: v })}
                      onFocus={e => e.target.select()} className={`${c} text-right tabular-nums`} title="Tutar" />
                    <select value={r.currency} onChange={e => setRow(i, { currency: e.target.value as Currency })} className={`${c} !px-1`} title="Para birimi">
                      {CURRENCIES.map(cu => <option key={cu} value={cu}>{CURRENCY_LABEL[cu]}</option>)}
                    </select>
                    <DateInput disabled={!due} value={due ? r.dueDate || '' : ''} onChange={v => setRow(i, { dueDate: v })} className={c} title="Vade" />
                    <input disabled={!due} placeholder={due ? `${r.method} no` : '—'} value={due ? r.checkNo || '' : ''} onChange={e => setRow(i, { checkNo: e.target.value })} className={c} title="Çek / senet no" />
                    <TextSuggest disabled={!cek} options={BANKS} snap placeholder="Banka" value={cek ? r.bankName || '' : ''} onChange={v => setRow(i, { bankName: v })} className={c} title="Banka" />
                    <TextSuggest disabled={!cek} options={branchList} placeholder="Şube" value={cek ? r.bankBranch || '' : ''} onChange={v => setRow(i, { bankBranch: v })} className={c} title="Şube" />
                    <button type="button" tabIndex={-1} disabled={rows.length === 1} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 self-center justify-self-end" title="Satırı sil">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 bg-slate-50 border-t border-slate-200">
              <button type="button" onClick={addRow} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-brand-700 font-bold text-xs hover:bg-brand-50">
                <Plus className="w-4 h-4" /> Satır ekle
              </button>
              <span className="text-xs text-slate-600">{filled.length} parça · <b className="text-slate-900 tabular-nums">{totalsText(totals)}</b></span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 -mt-1">Son satırın son kutusunda <b>Tab</b>'a basınca yeni satır açılır (çek no +1, vade +1 ay). Her satır ayrı tahsilat olarak kaydedilir.</p>

          <Field label="Açıklama">
            <input value={head.description} onChange={e => setHead(h => ({ ...h, description: e.target.value }))} placeholder="Örn: 68551 nolu teklif ödemesi" className={inputCls} />
          </Field>
          {err && <p className="text-xs font-bold text-red-600">{err}</p>}
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs">Vazgeç</button>
          <button type="submit" className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm">Kaydet</button>
        </div>
      </form>
    </div>
  );
};

type ExpRow = { key: string; date: string; category: string; region: string; method: string; amount: number; currency: Currency; description: string };

/**
 * Yeni harcama: teklif kalemi girer gibi satır satır (ör. seyahatte 4-5 fiş). Son satırın son kutusunda Tab → yeni satır
 * (tarih, şehir, ödeme şekli bir öncekinden gelir). Her satır ayrı harcama kaydı olur.
 */
const MultiExpenseForm: React.FC<{
  record: Expense;
  methods: string[];
  categories: string[];
  regions: string[];
  onCancel: () => void;
  onSave: (r: Expense) => void;
}> = ({ record, methods, categories, regions, onCancel, onSave }) => {
  const [rows, setRows] = useState<ExpRow[]>([{ key: newKey(), date: record.date, category: record.category || '', region: record.region || '', method: record.method, amount: record.amount || 0, currency: record.currency, description: record.description || '' }]);
  const [err, setErr] = useState('');
  const focusRow = React.useRef<number | null>(null);
  const tableRef = React.useRef<HTMLDivElement>(null);
  const setRow = (i: number, patch: Partial<ExpRow>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows(rs => {
    const l = rs[rs.length - 1];
    focusRow.current = rs.length;
    return [...rs, { key: newKey(), date: l.date, category: '', region: l.region, method: l.method, amount: 0, currency: l.currency, description: '' }];
  });
  useEffect(() => {
    if (focusRow.current === null) return;
    const el = tableRef.current?.querySelectorAll<HTMLElement>('[data-row]')[focusRow.current]?.querySelector<HTMLInputElement>('[data-cat]');
    focusRow.current = null;
    window.setTimeout(() => el?.focus(), 30);
  }, [rows.length]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    const t = e.target as HTMLElement;
    const rowEls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-row]'));
    const ri = rowEls.findIndex(r => r.contains(t));
    if (ri !== rows.length - 1) return;
    const fields = Array.from(rowEls[ri].querySelectorAll<HTMLElement>('input:not(:disabled):not([tabindex="-1"]), select:not(:disabled)'));
    if (fields[fields.length - 1] !== t || !(rows[ri].amount > 0)) return;
    e.preventDefault();
    addRow();
  };

  const filled = rows.filter(r => r.amount > 0);
  const totals = filled.reduce<Record<Currency, number>>((a, r) => { a[r.currency || 'TRY'] += r.amount; return a; }, { TRY: 0, USD: 0, EUR: 0 });
  const t = (v?: string) => (v && v.trim() ? v.trim() : undefined);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!filled.length) { setErr('En az bir satıra tutar girin.'); return; }
    if (filled.some(r => !r.category.trim())) { setErr('Tutar girilen her satırda kategori olmalı.'); return; }
    if (filled.some(r => !r.date)) { setErr('Her satırda tarih olmalı.'); return; }
    const now = Date.now();
    filled.forEach((r, i) => {
      onSave({
        ...record,
        id: i === 0 ? record.id : `hrc-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        date: r.date, category: r.category.trim(), region: t(r.region), method: r.method,
        amount: r.amount, currency: r.currency, description: t(r.description),
        createdAt: new Date(now + i).toISOString(), updatedAt: new Date(now + i).toISOString(),
      });
    });
  };

  const c = 'w-full px-2 py-1.5 border border-slate-200 rounded-md bg-white text-sm';
  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCancel}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-6xl rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        <div className="p-4 bg-brand-600 text-white flex items-center justify-between">
          <h3 className="font-black text-base">Yeni Harcama</h3>
          <button type="button" onClick={onCancel} className="p-1 rounded-lg text-brand-100 hover:text-white hover:bg-brand-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-3 sm:p-4 space-y-3 overflow-y-auto text-sm">
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="hidden md:grid erow px-2 py-1.5 bg-slate-100 text-[11px] font-bold text-slate-600 uppercase tracking-wide">
              <span>#</span><span>Tarih</span><span>Kategori</span><span>Şehir</span><span>Ödeme</span><span className="text-right">Tutar</span><span>Dvz</span><span>Açıklama</span><span />
            </div>
            <div ref={tableRef} className="divide-y divide-slate-200" onKeyDownCapture={onKeyDown}>
              {rows.map((r, i) => (
                <div key={r.key} data-row className={`erow px-2 py-1.5 ${i % 2 ? 'bg-slate-50/70' : 'bg-white'} focus-within:bg-brand-50/50`}>
                  <span className="text-[11px] font-bold text-slate-400 tabular-nums self-center">{i + 1}.</span>
                  <DateInput value={r.date} onChange={v => setRow(i, { date: v })} className={c} title="Tarih" />
                  <TextSuggest dataAttrs={{ 'data-cat': '' }} options={categories} placeholder="Kategori" value={r.category} onChange={v => setRow(i, { category: v })} className={c} title="Kategori" />
                  <CityInput value={r.region} onChange={v => setRow(i, { region: v })} className={c} title="Şehir" />
                  <select value={r.method} onChange={e => setRow(i, { method: e.target.value })} className={c} title="Ödeme şekli">
                    {methods.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <DecimalInput placeholder="Tutar" value={r.amount || 0} onValueChange={v => setRow(i, { amount: v })}
                    onFocus={e => e.target.select()} className={`${c} text-right tabular-nums`} title="Tutar" />
                  <select value={r.currency} onChange={e => setRow(i, { currency: e.target.value as Currency })} className={`${c} !px-1`} title="Para birimi">
                    {CURRENCIES.map(cu => <option key={cu} value={cu}>{CURRENCY_LABEL[cu]}</option>)}
                  </select>
                  <input placeholder="Açıklama" value={r.description} onChange={e => setRow(i, { description: e.target.value })} className={c} title="Açıklama" />
                  <button type="button" tabIndex={-1} disabled={rows.length === 1} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 self-center justify-self-end" title="Satırı sil">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 bg-slate-50 border-t border-slate-200">
              <button type="button" onClick={addRow} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-brand-700 font-bold text-xs hover:bg-brand-50">
                <Plus className="w-4 h-4" /> Satır ekle
              </button>
              <span className="text-xs text-slate-600">{filled.length} harcama · <b className="text-slate-900 tabular-nums">{totalsText(totals)}</b></span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 -mt-1">Son satırın açıklama kutusunda <b>Tab</b>'a basınca yeni satır açılır (tarih, şehir ve ödeme şekli aynen gelir). Her satır ayrı harcama olarak kaydedilir.</p>
          {err && <p className="text-xs font-bold text-red-600">{err}</p>}
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs">Vazgeç</button>
          <button type="submit" className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm">Kaydet</button>
        </div>
      </form>
    </div>
  );
};

/** Cari hesap gibi başka ekranlardan, firması dolu yeni tahsilat formu */
export const CollectionQuickForm: React.FC<{
  customerName: string;
  city?: string;
  records: Collection[];
  customers: Customer[];
  currentRole: UserRole;
  onCancel: () => void;
  onSave: (c: Collection) => void;
}> = ({ customerName, city, records, customers, currentRole, onCancel, onSave }) => {
  const methods = useMemo(() => withExisting(COLLECTION_METHODS, records.map(r => r.method)), [records]);
  const branches = useMemo(() => {
    const out: { bank: string; branch: string }[] = [];
    const seen = new Set<string>();
    records.forEach(r => {
      if (!r.bankBranch?.trim()) return;
      const k = fold(`${r.bankName || ''}|${r.bankBranch}`);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ bank: r.bankName || '', branch: r.bankBranch.trim() });
    });
    return out;
  }, [records]);
  const [record] = useState<Collection>(() => {
    const now = new Date().toISOString();
    return {
      id: `thl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: today(), amount: 0, currency: 'TRY' as Currency, method: methods[0], description: '',
      customerName, ...(city ? { city } : {}),
      createdBy: currentRole, createdAt: now, updatedAt: now,
    } as Collection;
  });
  return (
    <MultiCollectionForm record={record} methods={methods} customers={customers} branches={branches} onCancel={onCancel} onSave={onSave} />
  );
};
