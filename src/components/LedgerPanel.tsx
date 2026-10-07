import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, Wallet, Receipt, CalendarClock } from 'lucide-react';
import { Collection, Customer, Expense, UserRole } from '../types';
import { CURRENCY_LABEL, Currency } from '../lib/money';
import { findCustomer } from '../lib/customers';
import { DecimalInput } from './DecimalInput';
import { SuggestInput } from './SuggestInput';

export const COLLECTION_METHODS = ['Çek', 'Nakit', 'Havale/EFT', 'Kredi Kartı', 'Senet'];
export const EXPENSE_METHODS = ['Kredi Kartı **9973', 'UTTS', 'Şahsi', 'Şirket', 'Nakit', 'Havale/EFT'];
export const EXPENSE_CATEGORIES = [
  'Yakıt', 'Yemek', 'Konaklama', 'AdBlue', 'Otopark', 'İkramlık', 'Araç Bakım', 'Ulaşım',
  'Kargo/Nakliye', 'Malzeme', 'Ofis', 'Telefon/İnternet', 'Trafik Cezası', 'Vergi/Harç', 'Personel', 'Diğer',
];
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
        return (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt);
      });
  }, [records, search, dateFrom, dateTo, methodFilter, categoryFilter, regionFilter, currencyFilter, dueFilter, todayStr]);

  const filteredTotals = useMemo(() => sumByCurrency(filtered), [filtered]);
  const monthPrefix = todayStr.slice(0, 7);
  const monthTotals = useMemo(() => sumByCurrency(records.filter(r => r.date?.startsWith(monthPrefix))), [records, monthPrefix]);
  const yearTotals = useMemo(() => sumByCurrency(records.filter(r => r.date?.startsWith(monthPrefix.slice(0, 4)))), [records, monthPrefix]);
  // Portföy: vadesi henüz gelmemiş çek / senetler
  const portfolio = useMemo(() => records.filter(r => isCollectionRec(r) && r.dueDate && r.dueDate >= todayStr), [records, todayStr]);
  const portfolioTotals = useMemo(() => sumByCurrency(portfolio), [portfolio]);
  const nextDue = useMemo(() => [...portfolio].sort((a, b) => ((a as Collection).dueDate || '').localeCompare((b as Collection).dueDate || ''))[0] as Collection | undefined, [portfolio]);

  const hasFilters = !!(search || dateFrom || dateTo || methodFilter !== 'all' || categoryFilter !== 'all' || regionFilter !== 'all' || currencyFilter !== 'all' || dueFilter !== 'all');
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
      : { ...base, category: EXPENSE_CATEGORIES[0], ...clean } as Expense);
  };

  useEffect(() => {
    if (startNew) { openNew(startDraft); onStartNewHandled?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNew]);

  const handleDelete = (r: LedgerRecord) => {
    if (confirm(`${fmtDate(r.date)} tarihli ${money(r.amount, r.currency)} ${t.one.toLocaleLowerCase('tr')} kaydı silinsin mi?`)) onDelete(r.id);
  };

  const cards = [
    { label: 'Bu Ay', value: totalsText(monthTotals) },
    { label: `${monthPrefix.slice(0, 4)} Yılı`, value: totalsText(yearTotals) },
    { label: hasFilters ? 'Filtrelenen Toplam' : 'Tüm Kayıtlar', value: totalsText(filteredTotals), sub: `${filtered.length} kayıt` },
  ];
  const colCount = isCollection ? 7 : 7;

  return (
    <div className="space-y-4">
      {/* Özet */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isCollection ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
        {cards.map(card => (
          <div key={card.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span className={`p-1.5 rounded-lg ${t.tone}`}><t.Icon className="w-4 h-4" /></span>
              {t.one} · {card.label}
            </div>
            <div className="mt-2 text-lg font-black text-slate-900 tabular-nums break-words">{card.value}</div>
            {card.sub && <div className="text-xs text-slate-500">{card.sub}</div>}
          </div>
        ))}
        {isCollection && (
          <button
            onClick={() => { setDueFilter(f => (f === 'upcoming' ? 'all' : 'upcoming')); setLimit(LIST_PAGE); }}
            className={`text-left bg-white p-4 rounded-xl border shadow-xs min-w-0 hover:border-brand-300 ${dueFilter === 'upcoming' ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200'}`}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span className="p-1.5 rounded-lg text-brand-600 bg-brand-50"><CalendarClock className="w-4 h-4" /></span>
              Portföy · Vadesi Gelmemiş
            </div>
            <div className="mt-2 text-lg font-black text-slate-900 tabular-nums break-words">{totalsText(portfolioTotals)}</div>
            <div className="text-xs text-slate-500">
              {portfolio.length} çek/senet{nextDue ? ` · ilk vade ${fmtDate(nextDue.dueDate)}` : ''}
            </div>
          </button>
        )}
      </div>

      {/* Filtreler */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => changed(setSearch)(e.target.value)}
            placeholder={isCollection ? 'Müşteri, banka, çek no ara...' : 'Kategori, bölge, açıklama ara...'}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:flex-wrap [&>select]:w-full sm:[&>select]:w-auto [&>select]:min-w-0">
          {!isCollection && (
            <>
              <select value={categoryFilter} onChange={e => changed(setCategoryFilter)(e.target.value)} className="p-2 border border-slate-200 rounded-lg text-sm bg-white">
                <option value="all">Tüm Kategoriler</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={regionFilter} onChange={e => changed(setRegionFilter)(e.target.value)} className="p-2 border border-slate-200 rounded-lg text-sm bg-white">
                <option value="all">Tüm Bölgeler</option>
                {regions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </>
          )}
          <select value={methodFilter} onChange={e => changed(setMethodFilter)(e.target.value)} className="p-2 border border-slate-200 rounded-lg text-sm bg-white">
            <option value="all">Tüm Ödeme Şekilleri</option>
            {methods.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {isCollection && (
            <select value={dueFilter} onChange={e => changed(setDueFilter)(e.target.value as typeof dueFilter)} className="p-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">Tüm Vadeler</option>
              <option value="upcoming">Vadesi Gelmemiş</option>
              <option value="past">Vadesi Geçmiş</option>
            </select>
          )}
          <select value={currencyFilter} onChange={e => changed(setCurrencyFilter)(e.target.value)} className="p-2 border border-slate-200 rounded-lg text-sm bg-white">
            <option value="all">Tüm Para Birimleri</option>
            {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
          </select>
          <div className="col-span-2 flex items-center gap-1 text-xs text-slate-500 [&>input]:flex-1 [&>input]:min-w-0 sm:[&>input]:flex-none">
            <input type="date" value={dateFrom} onChange={e => changed(setDateFrom)(e.target.value)} className="p-2 border border-slate-200 rounded-lg text-sm" />
            <span>-</span>
            <input type="date" value={dateTo} onChange={e => changed(setDateTo)(e.target.value)} className="p-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          {hasFilters && (
            <button onClick={resetFilters} className="px-2 py-2 rounded-lg border border-slate-200 sm:border-0 text-xs font-bold text-slate-500 hover:text-slate-800 sm:underline">Filtreleri temizle</button>
          )}
          <button onClick={() => openNew()}
            className={`${hasFilters ? '' : 'col-span-2 '}flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs sm:text-sm font-bold shadow-xs`}>
            <Plus className="w-4 h-4" /> {t.one} Ekle
          </button>
        </div>
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
          {filtered.slice(0, limit).map(r => {
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
          })}
        </div>
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 whitespace-nowrap">Tarih</th>
                <th className="py-3 px-3">{t.party}</th>
                <th className="py-3 px-3 whitespace-nowrap">{isCollection ? 'Ödeme Şekli / Banka' : 'Bölge'}</th>
                {isCollection ? <th className="py-3 px-3 whitespace-nowrap">Vade</th> : <th className="py-3 px-3 whitespace-nowrap">Ödeme Şekli</th>}
                <th className="py-3 px-3">Açıklama</th>
                <th className="py-3 px-3 text-right">Tutar</th>
                <th className="py-3 px-3 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, limit).map(r => {
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
              })}
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

      {editing && (
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
              <input type="date" required value={form.date} onChange={e => set({ date: e.target.value })} className={inputCls} />
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
                <input value={col.city || ''} onChange={e => set({ city: e.target.value })} className={inputCls} />
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
              <Field label="Bölge">
                <SuggestInput<string>
                  placeholder="Örn: KONYA BÖLGE"
                  value={exp.region || ''}
                  onChange={text => set({ region: text })}
                  onPick={r => set({ region: r })}
                  suggestions={suggest(regions, exp.region || '', r => r)}
                  getKey={r => r}
                  inputClassName={inputCls}
                  renderItem={r => <span className="text-sm text-slate-800">{r}</span>}
                />
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
                <input type="date" required value={col.dueDate || ''} onChange={e => set({ dueDate: e.target.value })} className={`${inputCls} bg-white`} />
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
