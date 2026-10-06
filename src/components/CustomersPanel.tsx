import React, { useMemo, useState } from 'react';
import { Search, Plus, MapPin, Pencil, Trash2, FilePlus2, X, Building2 } from 'lucide-react';
import { Customer, Quote, QuoteStatus } from '../types';

interface CustomersPanelProps {
  customers: Customer[];
  quotes: Quote[];
  onSaveCustomer: (customer: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  onCreateQuoteForCustomer: (customer: Customer) => void;
}

const emptyForm = { name: '', city: 'Isparta' };

const trCompare = (a: string, b: string) => a.localeCompare(b, 'tr');
// Arama için Türkçe karakterleri sadeleştir: "isparta", "ISPARTA" ve "Isparta" aynı sonucu versin
const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
const normalize = (s: string) => s.toLocaleLowerCase('tr');

const STATUS_LABEL: Record<QuoteStatus, { label: string; cls: string }> = {
  yeni_talep: { label: 'Beklemede', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  hazirlaniyor: { label: 'Beklemede', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  gonderildi: { label: 'Beklemede', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  revizyon: { label: 'Beklemede', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  onaylandi: { label: 'Onaylandı', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  siparis: { label: 'Onaylandı', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  iptal: { label: 'İptal', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  arsiv: { label: 'Arşiv', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};
const isApproved = (q: Quote) => q.status === 'onaylandi' || q.status === 'siparis';
const tl = (n: number) => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;

export const CustomersPanel: React.FC<CustomersPanelProps> = ({
  customers,
  quotes,
  onSaveCustomer,
  onDeleteCustomer,
  onCreateQuoteForCustomer,
}) => {
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [onlyApproved, setOnlyApproved] = useState(true);

  // Firma adına göre (büyük/küçük harf ve Türkçe karakter farkı gözetmeden) teklifleri grupla
  const quotesByCustomer = useMemo(() => {
    const map = new Map<string, Quote[]>();
    quotes.forEach(q => {
      const k = fold(q.customerName.trim());
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(q);
    });
    map.forEach(list => list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    return map;
  }, [quotes]);
  const quotesOf = (c: Customer) => quotesByCustomer.get(fold(c.name.trim())) || [];

  const cityCounts = useMemo(() => {
    const map = new Map<string, number>();
    customers.forEach(c => map.set(c.city || '—', (map.get(c.city || '—') || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1] || trCompare(a[0], b[0]));
  }, [customers]);

  const filtered = useMemo(() => {
    const q = fold(search.trim());
    return customers
      .filter(c => cityFilter === 'all' || (c.city || '—') === cityFilter)
      .filter(c =>
        !q ||
        fold(c.name).includes(q) ||
        fold(c.city || '').includes(q)
      )
      .sort((a, b) => trCompare(a.name, b.name));
  }, [customers, search, cityFilter]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setIsFormOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, city: c.city || '' });
    setError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const duplicate = customers.find(c => normalize(c.name) === normalize(name) && c.id !== editing?.id);
    if (duplicate) {
      setError(`"${duplicate.name}" adında bir müşteri zaten kayıtlı.`);
      return;
    }
    const now = new Date().toISOString();
    onSaveCustomer({
      ...editing,
      id: editing?.id || 'cus-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      name,
      city: form.city.trim(),
      createdAt: editing?.createdAt || now,
      updatedAt: now,
    });
    setIsFormOpen(false);
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              placeholder="Firma adı veya şehir ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="all">Tüm Şehirler ({customers.length})</option>
              {cityCounts.map(([city, count]) => (
                <option key={city} value={city}>{city} ({count})</option>
              ))}
            </select>
            <button
              onClick={openNew}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Müşteri</span>
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          <Building2 className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
          {filtered.length === customers.length
            ? `${customers.length} kayıtlı müşteri`
            : `${filtered.length} / ${customers.length} müşteri gösteriliyor`}
        </p>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-sm text-slate-500">
          {customers.length === 0 ? 'Henüz müşteri kaydı yok.' : 'Aramanıza uygun müşteri bulunamadı.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => (
            <div key={c.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-2 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => { setViewing(c); setOnlyApproved(true); }}
                  className="font-bold text-sm text-slate-900 leading-snug break-words min-w-0 text-left hover:text-brand-600 hover:underline"
                >
                  {c.name}
                </button>
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                  <MapPin className="w-3 h-3" />
                  {c.city || '—'}
                </span>
              </div>
              {(() => {
                const list = quotesOf(c);
                const approved = list.filter(isApproved).length;
                return (
                  <button
                    onClick={() => { setViewing(c); setOnlyApproved(true); }}
                    className="text-left text-xs text-slate-500 hover:text-brand-600"
                  >
                    {list.length === 0 ? 'Henüz teklif yok' : (
                      <>
                        <b className="text-slate-700">{list.length}</b> teklif · <b className="text-emerald-700">{approved}</b> onaylı
                      </>
                    )}
                  </button>
                );
              })()}
              <div className="flex gap-1.5 pt-1 mt-auto">
                <button
                  onClick={() => onCreateQuoteForCustomer(c)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold border border-brand-200"
                >
                  <FilePlus2 className="w-3.5 h-3.5" /> Teklif Aç
                </button>
                <button
                  onClick={() => openEdit(c)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                  title="Düzenle"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`"${c.name}" müşterisi silinsin mi?`)) onDeleteCustomer(c.id);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200"
                  title="Sil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Customer quotes */}
      {viewing && (() => {
        const list = quotesOf(viewing);
        const approved = list.filter(isApproved);
        const pending = list.filter(q => ['yeni_talep', 'hazirlaniyor', 'gonderildi', 'revizyon'].includes(q.status));
        const cancelled = list.filter(q => q.status === 'iptal');
        const archived = list.filter(q => q.status === 'arsiv');
        const shown = onlyApproved ? approved : list;
        const approvedTotal = approved.reduce((s, q) => s + (q.totalAmount || 0), 0);
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setViewing(null)}>
            <div
              onClick={e => e.stopPropagation()}
              className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-4 sm:p-5 bg-brand-600 text-white flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-black text-base sm:text-lg break-words">{viewing.name}</h3>
                  <p className="text-xs text-brand-100 flex items-center gap-1"><MapPin className="w-3 h-3" />{viewing.city || '—'}</p>
                </div>
                <button onClick={() => setViewing(null)} className="p-1 rounded-lg text-brand-100 hover:text-white hover:bg-brand-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-lg font-black text-slate-900">{list.length}</div>
                    <div className="text-[11px] text-slate-500">Toplam teklif</div>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="text-lg font-black text-emerald-700">{approved.length}</div>
                    <div className="text-[11px] text-emerald-700">Onaylandı</div>
                  </div>
                  <div className="p-2 rounded-lg bg-purple-50 border border-purple-200">
                    <div className="text-lg font-black text-purple-700">{pending.length}</div>
                    <div className="text-[11px] text-purple-700">Beklemede</div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-lg font-black text-slate-600">{cancelled.length + archived.length}</div>
                    <div className="text-[11px] text-slate-500">İptal / Arşiv</div>
                  </div>
                </div>
                <p className="text-xs text-slate-600">
                  Onaylanan tekliflerin toplamı: <b className="text-slate-900">{tl(approvedTotal)}</b>
                </p>

                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg text-xs font-bold w-fit">
                  <button
                    onClick={() => setOnlyApproved(true)}
                    className={`px-3 py-1.5 rounded-md ${onlyApproved ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'}`}
                  >
                    Onaylananlar ({approved.length})
                  </button>
                  <button
                    onClick={() => setOnlyApproved(false)}
                    className={`px-3 py-1.5 rounded-md ${!onlyApproved ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'}`}
                  >
                    Tüm teklifler ({list.length})
                  </button>
                </div>

                {shown.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">
                    {onlyApproved ? 'Onaylanan teklif yok.' : 'Bu müşteriye verilmiş teklif yok.'}
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {shown.map(q => (
                      <div key={q.id} className="p-2.5 flex items-start justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-slate-800">{q.quoteNumber}</div>
                          <div className="text-slate-500">{new Date(q.createdAt).toLocaleDateString('tr-TR')}</div>
                          {q.notes && <div className="text-slate-600 break-words">{q.notes}</div>}
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <div className="font-bold text-slate-900 whitespace-nowrap">{q.totalAmount > 0 ? tl(q.totalAmount) : '-'}</div>
                          {q.imported && q.totalAmount > 0 && <div className="text-[10px] text-slate-400">KDV hariç</div>}
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-bold border ${STATUS_LABEL[q.status].cls}`}>
                            {STATUS_LABEL[q.status].label}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add / Edit form */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setIsFormOpen(false)}>
          <form
            onSubmit={handleSubmit}
            onClick={e => e.stopPropagation()}
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900">{editing ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'}</h3>
              <button type="button" onClick={() => setIsFormOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Firma Adı *</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Şehir</label>
              <input
                list="customer-city-list"
                value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })}
                className={inputCls}
              />
              <datalist id="customer-city-list">
                {cityCounts.map(([city]) => <option key={city} value={city} />)}
              </datalist>
            </div>
            {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</p>}
            <button type="submit" className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm">
              Kaydet
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
