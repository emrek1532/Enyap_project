import React, { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, Wallet, Receipt } from 'lucide-react';
import { Collection, Customer, Expense, UserRole } from '../types';
import { CURRENCY_LABEL, Currency } from '../lib/money';

export const COLLECTION_METHODS = ['Nakit', 'Havale/EFT', 'Kredi Kartı', 'Çek', 'Senet'];
export const EXPENSE_METHODS = ['Nakit', 'Kredi Kartı', 'Havale/EFT'];
export const EXPENSE_CATEGORIES = [
  'Yakıt', 'Yemek', 'Konaklama', 'Ulaşım', 'Araç Bakım', 'Kargo/Nakliye',
  'Malzeme', 'Ofis', 'Telefon/İnternet', 'Vergi/Harç', 'Personel', 'Diğer',
];

type Kind = 'collections' | 'expenses';
type LedgerRecord = Collection | Expense;

interface LedgerPanelProps {
  kind: Kind;
  records: LedgerRecord[];
  customers?: Customer[];
  currentRole: UserRole;
  onSave: (record: LedgerRecord) => void;
  onDelete: (id: string) => void;
}

const LIST_PAGE = 50;
const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR'];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (s: string) => (s ? s.split('-').reverse().join('.') : '-');
const money = (v: number, c: Currency) =>
  `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_LABEL[c]}`;
const fold = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

/** Kaydın "kime / ne için" alanı: tahsilatta müşteri, harcamada kategori */
const partyOf = (r: LedgerRecord) => ('customerName' in r ? r.customerName : r.category);

const sumByCurrency = (list: LedgerRecord[]) =>
  list.reduce<Record<Currency, number>>((acc, r) => {
    acc[r.currency || 'TRY'] += r.amount || 0;
    return acc;
  }, { TRY: 0, USD: 0, EUR: 0 });

const totalsText = (t: Record<Currency, number>) => {
  const parts = CURRENCIES.filter(c => t[c] > 0).map(c => money(t[c], c));
  return parts.length ? parts.join(' + ') : money(0, 'TRY');
};

export const LedgerPanel: React.FC<LedgerPanelProps> = ({ kind, records, customers = [], currentRole, onSave, onDelete }) => {
  const isCollection = kind === 'collections';
  const t = isCollection
    ? { title: 'Yapılan Tahsilatlar', one: 'Tahsilat', party: 'Müşteri / Firma', methods: COLLECTION_METHODS, Icon: Wallet, tone: 'text-accent-600 bg-accent-50' }
    : { title: 'Yapılan Harcamalar', one: 'Harcama', party: 'Kategori', methods: EXPENSE_METHODS, Icon: Receipt, tone: 'text-orange-600 bg-orange-50' };

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [limit, setLimit] = useState(LIST_PAGE);
  const [editing, setEditing] = useState<LedgerRecord | null>(null);

  const filtered = useMemo(() => {
    const q = fold(search.trim());
    return records
      .filter(r => {
        if (q && !fold(`${partyOf(r)} ${r.description || ''} ${r.method}`).includes(q)) return false;
        if (dateFrom && r.date < dateFrom) return false;
        if (dateTo && r.date > dateTo) return false;
        if (methodFilter !== 'all' && r.method !== methodFilter) return false;
        if (categoryFilter !== 'all' && partyOf(r) !== categoryFilter) return false;
        if (currencyFilter !== 'all' && r.currency !== currencyFilter) return false;
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
  }, [records, search, dateFrom, dateTo, methodFilter, categoryFilter, currencyFilter]);

  const filteredTotals = useMemo(() => sumByCurrency(filtered), [filtered]);
  const monthPrefix = today().slice(0, 7);
  const monthTotals = useMemo(() => sumByCurrency(records.filter(r => r.date?.startsWith(monthPrefix))), [records, monthPrefix]);
  const yearTotals = useMemo(() => sumByCurrency(records.filter(r => r.date?.startsWith(monthPrefix.slice(0, 4)))), [records, monthPrefix]);

  const hasFilters = !!(search || dateFrom || dateTo || methodFilter !== 'all' || categoryFilter !== 'all' || currencyFilter !== 'all');
  const resetFilters = () => {
    setSearch(''); setDateFrom(''); setDateTo(''); setMethodFilter('all'); setCategoryFilter('all'); setCurrencyFilter('all'); setLimit(LIST_PAGE);
  };

  const openNew = () => {
    const now = new Date().toISOString();
    const base = {
      id: `${isCollection ? 'thl' : 'hrc'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: today(),
      amount: 0,
      currency: 'TRY' as Currency,
      method: t.methods[0],
      description: '',
      createdBy: currentRole,
      createdAt: now,
      updatedAt: now,
    };
    setEditing(isCollection ? { ...base, customerName: '' } : { ...base, category: EXPENSE_CATEGORIES[0] });
  };

  const handleDelete = (r: LedgerRecord) => {
    if (confirm(`${fmtDate(r.date)} tarihli ${money(r.amount, r.currency)} ${t.one.toLocaleLowerCase('tr')} kaydı silinsin mi?`)) onDelete(r.id);
  };

  // Kategori listesi: sabit liste + kayıtlarda geçenler
  const categoryOptions = useMemo(() => {
    const set = new Set<string>(isCollection ? [] : EXPENSE_CATEGORIES);
    if (!isCollection) records.forEach(r => { const p = partyOf(r); if (p) set.add(p); });
    return [...set];
  }, [records, isCollection]);

  return (
    <div className="space-y-4">
      {/* Özet */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Bu Ay', value: totalsText(monthTotals) },
          { label: `${monthPrefix.slice(0, 4)} Yılı`, value: totalsText(yearTotals) },
          { label: hasFilters ? 'Filtrelenen Toplam' : 'Tüm Kayıtlar', value: totalsText(filteredTotals), sub: `${filtered.length} kayıt` },
        ].map(card => (
          <div key={card.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span className={`p-1.5 rounded-lg ${t.tone}`}><t.Icon className="w-4 h-4" /></span>
              {t.one} · {card.label}
            </div>
            <div className="mt-2 text-lg font-black text-slate-900 tabular-nums break-words">{card.value}</div>
            {card.sub && <div className="text-xs text-slate-500">{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Filtreler */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col xl:flex-row items-stretch xl:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setLimit(LIST_PAGE); }}
            placeholder={isCollection ? 'Müşteri, açıklama ara...' : 'Kategori, açıklama ara...'}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isCollection && (
            <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setLimit(LIST_PAGE); }}
              className="p-2 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="all">Tüm Kategoriler</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select value={methodFilter} onChange={e => { setMethodFilter(e.target.value); setLimit(LIST_PAGE); }}
            className="p-2 border border-slate-200 rounded-lg text-sm bg-white">
            <option value="all">Tüm Ödeme Şekilleri</option>
            {t.methods.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={currencyFilter} onChange={e => { setCurrencyFilter(e.target.value); setLimit(LIST_PAGE); }}
            className="p-2 border border-slate-200 rounded-lg text-sm bg-white">
            <option value="all">Tüm Para Birimleri</option>
            {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
          </select>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setLimit(LIST_PAGE); }}
              className="p-2 border border-slate-200 rounded-lg text-sm" />
            <span>-</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setLimit(LIST_PAGE); }}
              className="p-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          {hasFilters && (
            <button onClick={resetFilters} className="text-xs font-bold text-slate-500 hover:text-slate-800 underline">Filtreleri temizle</button>
          )}
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs sm:text-sm font-bold shadow-xs">
            <Plus className="w-4 h-4" /> {t.one} Ekle
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 whitespace-nowrap">Tarih</th>
                <th className="py-3 px-3">{t.party}</th>
                <th className="py-3 px-3">Açıklama</th>
                <th className="py-3 px-3 whitespace-nowrap">Ödeme Şekli</th>
                <th className="py-3 px-3 text-right">Tutar</th>
                <th className="py-3 px-3 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, limit).map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 tabular-nums">{fmtDate(r.date)}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">{partyOf(r) || '-'}</td>
                  <td className="py-2.5 px-3 text-slate-600 max-w-[260px] truncate">{r.description || '-'}</td>
                  <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{r.method || '-'}</td>
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
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 text-sm">
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
          methods={t.methods}
          categories={categoryOptions}
          customers={customers}
          onCancel={() => setEditing(null)}
          onSave={rec => { onSave(rec); setEditing(null); }}
        />
      )}
    </div>
  );
};

const LedgerForm: React.FC<{
  kind: Kind;
  record: LedgerRecord;
  title: string;
  partyLabel: string;
  methods: string[];
  categories: string[];
  customers: Customer[];
  onCancel: () => void;
  onSave: (r: LedgerRecord) => void;
}> = ({ kind, record, title, partyLabel, methods, categories, customers, onCancel, onSave }) => {
  const [form, setForm] = useState<LedgerRecord>(record);
  const isCollection = kind === 'collections';
  const set = (patch: Partial<Collection & Expense>) => setForm(f => ({ ...f, ...patch } as LedgerRecord));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(form.amount > 0)) return;
    onSave({
      ...form,
      ...(isCollection ? { customerName: (form as Collection).customerName.trim() } : { category: (form as Expense).category.trim() }),
      description: form.description?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    } as LedgerRecord);
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
            <label className="block">
              <span className="block text-xs font-bold text-slate-700 mb-1">Tarih *</span>
              <input type="date" required value={form.date} onChange={e => set({ date: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-slate-700 mb-1">Ödeme Şekli</span>
              <select value={form.method} onChange={e => set({ method: e.target.value })} className="w-full p-2 border border-slate-200 rounded-lg bg-white">
                {methods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold text-slate-700 mb-1">{partyLabel} *</span>
            {isCollection ? (
              <>
                <input required list="ledger-customer-list" autoComplete="off" placeholder="Yazmaya başlayın, kayıtlı müşterilerden seçin..."
                  value={(form as Collection).customerName} onChange={e => set({ customerName: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg" />
                <datalist id="ledger-customer-list">
                  {customers.map(c => <option key={c.id} value={c.name}>{c.city}</option>)}
                </datalist>
              </>
            ) : (
              <>
                <input required list="ledger-category-list" autoComplete="off" placeholder="Listeden seçin veya yazın..."
                  value={(form as Expense).category} onChange={e => set({ category: e.target.value })}
                  onFocus={e => e.target.select()}
                  className="w-full p-2 border border-slate-200 rounded-lg" />
                <datalist id="ledger-category-list">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </>
            )}
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block col-span-2">
              <span className="block text-xs font-bold text-slate-700 mb-1">Tutar *</span>
              <input type="number" required min="0.01" step="0.01" inputMode="decimal" placeholder="0,00"
                value={form.amount || ''} onChange={e => set({ amount: parseFloat(e.target.value) || 0 })}
                className="w-full p-2 border border-slate-200 rounded-lg tabular-nums" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-slate-700 mb-1">Para Birimi</span>
              <select value={form.currency} onChange={e => set({ currency: e.target.value as Currency })} className="w-full p-2 border border-slate-200 rounded-lg bg-white">
                {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold text-slate-700 mb-1">Açıklama</span>
            <textarea rows={2} value={form.description || ''} onChange={e => set({ description: e.target.value })}
              placeholder={isCollection ? 'Örn: 68551 nolu teklif ödemesi' : 'Örn: Burdur ziyareti yakıt'}
              className="w-full p-2 border border-slate-200 rounded-lg" />
          </label>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs">Vazgeç</button>
          <button type="submit" className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm">Kaydet</button>
        </div>
      </form>
    </div>
  );
};
