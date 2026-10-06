import React, { useMemo, useState } from 'react';
import { Search, Plus, MapPin, Phone, User, Pencil, Trash2, FilePlus2, X, Building2 } from 'lucide-react';
import { Customer } from '../types';

interface CustomersPanelProps {
  customers: Customer[];
  onSaveCustomer: (customer: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  onCreateQuoteForCustomer: (customer: Customer) => void;
}

const emptyForm = { name: '', city: 'Isparta', contactPerson: '', phone: '', email: '', notes: '' };

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

export const CustomersPanel: React.FC<CustomersPanelProps> = ({
  customers,
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
        fold(c.city || '').includes(q) ||
        fold(c.contactPerson || '').includes(q) ||
        (c.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, ''))
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
    setForm({
      name: c.name,
      city: c.city || '',
      contactPerson: c.contactPerson || '',
      phone: c.phone || '',
      email: c.email || '',
      notes: c.notes || '',
    });
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
      id: editing?.id || 'cus-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      name,
      city: form.city.trim(),
      contactPerson: form.contactPerson.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      notes: form.notes.trim(),
      createdAt: editing?.createdAt || now,
      updatedAt: now,
    });
    setIsFormOpen(false);
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              placeholder="Firma adı, şehir, yetkili veya telefon ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
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
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm shadow-sm whitespace-nowrap"
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
                <h4 className="font-bold text-sm text-slate-900 leading-snug break-words min-w-0">{c.name}</h4>
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                  <MapPin className="w-3 h-3" />
                  {c.city || '—'}
                </span>
              </div>
              {(c.contactPerson || c.phone) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                  {c.contactPerson && (
                    <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{c.contactPerson}</span>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-sky-700 hover:underline">
                      <Phone className="w-3 h-3" />{c.phone}
                    </a>
                  )}
                </div>
              )}
              {c.notes && <p className="text-xs text-slate-500 line-clamp-2">{c.notes}</p>}
              <div className="flex gap-1.5 pt-1 mt-auto">
                <button
                  onClick={() => onCreateQuoteForCustomer(c)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200"
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
            <div className="grid grid-cols-2 gap-2">
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
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Telefon</label>
                <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Yetkili Kişi</label>
                <input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">E-posta</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Not</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} />
            </div>
            {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</p>}
            <button type="submit" className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm">
              Kaydet
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
