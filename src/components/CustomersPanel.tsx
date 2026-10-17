import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, MapPin, Pencil, Trash2, FilePlus2, X, Building2, List, Gauge, FileUp, Wallet } from 'lucide-react';
import { MikroUpload } from './MikroUpload';
import { estimatedBalance } from '../lib/mikroBalance';
import { Collection, Customer, CustomerStatus, Quote, UserRole } from '../types';
import { CUSTOMER_STATUS, SEGMENT, Segment, adviseFor, evaluate, statusOf } from '../lib/customerInsights';
import { CustomerAccount, STATUS_LABEL } from './CustomerAccount';
import { CityInput } from './TextSuggest';
import { PENDING_STATUSES, needsFollowUp } from '../lib/quoteRules';
import { quoteTry, useRates } from '../lib/rates';
import { SortHeader, SortState, nextSort, compareText, SortDir, MobileSortSelect } from './SortHeader';

interface CustomersPanelProps {
  customers: Customer[];
  quotes: Quote[];
  onSaveCustomer: (customer: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  onCreateQuoteForCustomer: (customer: Customer) => void;
  collections?: Collection[];
  showCollections?: boolean;
  onOpenQuote?: (q: Quote) => void;
  onSaveCollection?: (c: Collection) => void;
  currentRole?: UserRole;
  /** Ana sayfadaki öneriden açılacak firma adı */
  focusName?: string | null;
  onFocusHandled?: () => void;
  /** Ana sayfadan "Mikro bakiyesi yükle" ile gelindiyse yükleme penceresi açılır */
  openMikro?: boolean;
  onMikroHandled?: () => void;
}

const emptyForm = { name: '', city: 'Isparta' };
const PAGE = 50;

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

const isApproved = (q: Quote) => q.status === 'onaylandi' || q.status === 'siparis';
const tl = (n: number) => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;

type CustomerSortKey = 'name' | 'city' | 'quotes' | 'approved' | 'pending' | 'total' | 'last' | 'balance';

export const CustomersPanel: React.FC<CustomersPanelProps> = ({
  customers,
  quotes,
  onSaveCustomer,
  onDeleteCustomer,
  onCreateQuoteForCustomer,
  collections = [],
  showCollections = false,
  onOpenQuote,
  onSaveCollection,
  currentRole,
  focusName,
  onFocusHandled,
  openMikro,
  onMikroHandled,
}) => {
  const [mikroOpen, setMikroOpen] = useState(false);
  useEffect(() => { if (openMikro) { setMikroOpen(true); onMikroHandled?.(); } }, [openMikro]); // eslint-disable-line react-hooks/exhaustive-deps
  const balanceOf = (c: Customer) => (showCollections ? estimatedBalance(c, collections) : null);
  const lastMikro = useMemo(() => customers.reduce((m, c) => (c.mikroBalanceDate && c.mikroBalanceDate > m ? c.mikroBalanceDate : m), ''), [customers]);
  const rates = useRates(quotes);
  const [mode, setMode] = useState<'list' | 'eval' | 'balance'>('list');
  const [statusFilter, setStatusFilter] = useState<'all' | CustomerStatus>('all');
  const [segFilter, setSegFilter] = useState<'all' | Segment | CustomerStatus>('all');
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [quoteFilter, setQuoteFilter] = useState<'all' | 'approved' | 'pending' | 'followup' | 'none'>('all');
  // Sütun başlığına tıklayarak sıralama (varsayılan: firma adı A → Z)
  const [sort, setSort] = useState<SortState<CustomerSortKey>>({ key: 'name', dir: 'asc' });
  const sortBy = (key: CustomerSortKey, firstDir: SortDir) => { setSort(s => nextSort(s, key, firstDir)); setLimit(PAGE); };
  const [limit, setLimit] = useState(PAGE);
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

  // Müşteri değerlendirmesi (puan, segment) — en yüksek onaylı ciroya göre ölçeklenir
  const evals = useMemo(() => {
    const colMap = new Map<string, Collection[]>();
    collections.forEach(x => { const k = fold(x.customerName.trim()); if (!colMap.has(k)) colMap.set(k, []); colMap.get(k)!.push(x); });
    const wonOf = (list: Quote[]) => list.filter(isApproved).reduce((t, q) => t + quoteTry(q, rates), 0);
    const max = Math.max(0, ...customers.map(c => wonOf(quotesByCustomer.get(fold(c.name.trim())) || [])));
    const map = new Map<string, ReturnType<typeof evaluate>>();
    customers.forEach(c => { const k = fold(c.name.trim()); map.set(c.id, evaluate(quotesByCustomer.get(k) || [], colMap.get(k) || [], rates, max)); });
    return { map, max };
  }, [customers, quotesByCustomer, collections, rates]);

  const setStatus = (c: Customer, status: CustomerStatus, note: string) => {
    const next = { ...c, status, statusNote: status === 'aktif' ? '' : note, updatedAt: new Date().toISOString() };
    onSaveCustomer(next);
    setViewing(v => (v && v.id === c.id ? next : v));
  };

  // Ana sayfadaki öneriden gelinince ilgili firmanın carisini aç
  useEffect(() => {
    if (!focusName) return;
    const c = customers.find(x => fold(x.name.trim()) === fold(focusName.trim()));
    if (c) { setViewing(c); setOnlyApproved(true); }
    onFocusHandled?.();
  }, [focusName]); // eslint-disable-line react-hooks/exhaustive-deps

  const cityCounts = useMemo(() => {
    const map = new Map<string, number>();
    customers.forEach(c => map.set(c.city || '—', (map.get(c.city || '—') || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1] || trCompare(a[0], b[0]));
  }, [customers]);

  // Müşteri başına teklif özeti
  const statsOf = (c: Customer) => {
    const list = quotesOf(c);
    const approved = list.filter(isApproved);
    return {
      total: list.length,
      approved: approved.length,
      pending: list.filter(q => PENDING_STATUSES.includes(q.status)).length,
      followUp: list.some(needsFollowUp),
      approvedTotal: approved.reduce((sum, q) => sum + quoteTry(q, rates), 0),
      lastDate: list[0]?.createdAt || '',
    };
  };

  const filtered = useMemo(() => {
    const q = fold(search.trim());
    return customers
      .filter(c => cityFilter === 'all' || (c.city || '—') === cityFilter)
      .filter(c => statusFilter === 'all' || statusOf(c) === statusFilter)
      .filter(c => !q || fold(c.name).includes(q) || fold(c.city || '').includes(q))
      .map(c => ({ c, st: statsOf(c) }))
      .filter(({ st }) =>
        quoteFilter === 'all' ||
        (quoteFilter === 'approved' && st.approved > 0) ||
        (quoteFilter === 'pending' && st.pending > 0) ||
        (quoteFilter === 'followup' && st.followUp) ||
        (quoteFilter === 'none' && st.total === 0)
      )
      .sort((a, b) => {
        let r = 0;
        switch (sort.key) {
          case 'city': r = compareText(a.c.city || '', b.c.city || ''); break;
          case 'quotes': r = a.st.total - b.st.total; break;
          case 'approved': r = a.st.approved - b.st.approved; break;
          case 'pending': r = a.st.pending - b.st.pending; break;
          case 'total': r = a.st.approvedTotal - b.st.approvedTotal; break;
          case 'last': r = a.st.lastDate.localeCompare(b.st.lastDate); break;
          case 'balance': r = (balanceOf(a.c)?.estimate ?? -Infinity) - (balanceOf(b.c)?.estimate ?? -Infinity); break;
          default: r = compareText(a.c.name, b.c.name);
        }
        return (sort.dir === 'asc' ? r : -r) || trCompare(a.c.name, b.c.name);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, quotesByCustomer, search, cityFilter, quoteFilter, statusFilter, sort, rates, collections]);

  const hasFilters = !!search || cityFilter !== 'all' || quoteFilter !== 'all' || statusFilter !== 'all' || sort.key !== 'name' || sort.dir !== 'asc';
  const resetFilters = () => {
    setSearch(''); setCityFilter('all'); setQuoteFilter('all'); setStatusFilter('all'); setSort({ key: 'name', dir: 'asc' }); setLimit(PAGE);
  };

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

  const evalRows = useMemo(() => customers
    .map(c => ({ c, ev: evals.map.get(c.id)! }))
    .filter(r => r.ev && (r.ev.quoteCount > 0 || statusOf(r.c) !== 'aktif'))
    .sort((a, b) => b.ev.score - a.ev.score || b.ev.wonTotal - a.ev.wonTotal), [customers, evals]);
  const groupOf = (r: { c: Customer; ev: ReturnType<typeof evaluate> }): Segment | CustomerStatus => statusOf(r.c) !== 'aktif' ? statusOf(r.c) : r.ev.segment;
  const segCounts = useMemo(() => {
    const m = new Map<string, number>();
    evalRows.forEach(r => m.set(groupOf(r), (m.get(groupOf(r)) || 0) + 1));
    return m;
  }, [evalRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownEval = evalRows.filter(r => (segFilter === 'all' || groupOf(r) === segFilter) && (!search || fold(r.c.name).includes(fold(search.trim()))));

  return (
    <div className="space-y-4">
      <div className={`grid ${showCollections ? 'grid-cols-3' : 'grid-cols-2'} sm:flex gap-1 p-1 rounded-xl bg-slate-200/70 sm:w-fit`}>
        {([['list', 'Müşteri listesi', 'Liste', List], ['eval', 'Değerlendirme', 'Puanlar', Gauge], ...(showCollections ? [['balance', 'Cari bakiyeler', 'Bakiyeler', Wallet]] as const : [])] as const).map(([k, label, shortLabel, Icon]) => (
          <button key={k} onClick={() => setMode(k)}
            className={`flex items-center justify-center gap-1.5 px-2 sm:px-3.5 py-1.5 rounded-lg text-sm font-extrabold whitespace-nowrap ${mode === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>
            <Icon className="w-4 h-4 shrink-0" /> <span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {mode === 'eval' && (
        <div className="space-y-3">
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="search" placeholder="Firma ara..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
              {([['all', 'Tümü', evalRows.length], ...(['altin', 'iyi', 'gelisen', 'zayif', 'yeni'] as Segment[]).map(k => [k, SEGMENT[k].label, segCounts.get(k) || 0]),
                ...(['pasif', 'kara_liste'] as CustomerStatus[]).map(k => [k, CUSTOMER_STATUS[k].label, segCounts.get(k) || 0])] as [string, string, number][])
                .filter(([k, , n]) => k === 'all' || n > 0)
                .map(([k, label, n]) => (
                  <button key={k} onClick={() => setSegFilter(k as typeof segFilter)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap ${segFilter === k ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                    {label} <span className="opacity-70">{n}</span>
                  </button>
                ))}
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">Puan: onay oranı (40) + onaylı ciro (30) + son teklifin yakınlığı (20) + son 12 aydaki teklif sıklığı (10).</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
            {shownEval.slice(0, limit).map(({ c, ev }) => {
              const g = groupOf({ c, ev });
              const badge = g === 'pasif' || g === 'kara_liste' ? CUSTOMER_STATUS[g] : SEGMENT[g];
              const tip = adviseFor(ev, statusOf(c))[0];
              return (
                <button key={c.id} onClick={() => { setViewing(c); setOnlyApproved(true); }} className="w-full text-left p-3 sm:px-4 hover:bg-slate-50 flex items-center gap-3">
                  <span className="w-10 text-center shrink-0">
                    <span className="block text-lg font-black text-slate-900 tabular-nums leading-none">{ev.score}</span>
                    <span className="block h-1 mt-1 rounded-full bg-slate-100 overflow-hidden"><span className={`block h-full ${SEGMENT[ev.segment].bar}`} style={{ width: `${ev.score}%` }} /></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{c.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${badge.cls}`}>{badge.label}</span>
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      %{Math.round(ev.winRate * 100)} onay · {ev.wonCount}/{ev.quoteCount} teklif · {tl(Math.round(ev.wonTotal))}
                    </span>
                    {tip && <span className="block text-[11px] text-brand-700 font-semibold mt-0.5 truncate">→ {tip.title}</span>}
                  </span>
                </button>
              );
            })}
            {shownEval.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Bu grupta müşteri yok.</p>}
            {shownEval.length > limit && (
              <div className="p-3 text-center"><button onClick={() => setLimit(n => n + PAGE)} className="px-4 py-2 rounded-lg bg-brand-500 text-white text-xs font-bold">{PAGE} müşteri daha göster</button></div>
            )}
          </div>
        </div>
      )}

      {mode === 'balance' && showCollections && (
        <BalanceView customers={customers} balanceOf={balanceOf} lastMikro={lastMikro} search={search} setSearch={setSearch}
          onOpen={c => { setViewing(c); setOnlyApproved(true); }} onMikro={onSaveCollection ? () => setMikroOpen(true) : undefined} />
      )}

      {mode === 'list' && (<>
      {/* Toolbar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              placeholder="Firma adı veya şehir ara..."
              value={search}
              onChange={e => { setSearch(e.target.value); setLimit(PAGE); }}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2 [&>select]:w-full sm:[&>select]:w-auto">
            <select
              value={cityFilter}
              onChange={e => { setCityFilter(e.target.value); setLimit(PAGE); }}
              className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
              aria-label="Şehir"
            >
              <option value="all">Tüm Şehirler</option>
              {cityCounts.map(([city, count]) => (
                <option key={city} value={city}>{city} ({count})</option>
              ))}
            </select>
            <select
              value={quoteFilter}
              onChange={e => { setQuoteFilter(e.target.value as typeof quoteFilter); setLimit(PAGE); }}
              className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
              aria-label="Teklif durumu"
            >
              <option value="all">Tüm Müşteriler</option>
              <option value="approved">Onaylı teklifi olanlar</option>
              <option value="pending">Bekleyen teklifi olanlar</option>
              <option value="followup">Tekrar görüşülecekler</option>
              <option value="none">Hiç teklif verilmeyenler</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as typeof statusFilter); setLimit(PAGE); }}
              className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
              aria-label="Müşteri durumu"
            >
              <option value="all">Tüm durumlar</option>
              <option value="aktif">Aktif</option>
              <option value="pasif">Pasif</option>
              <option value="kara_liste">Kara liste</option>
            </select>
            <MobileSortSelect className="!py-2.5 !rounded-xl !text-sm" sort={sort} onChange={(s) => { setSort(s); setLimit(PAGE); }} options={[
              { key: 'name', dir: 'asc', label: 'Firma: A → Z' },
              { key: 'name', dir: 'desc', label: 'Firma: Z → A' },
              { key: 'total', dir: 'desc', label: 'Onaylı tutar: yüksek' },
              ...(showCollections ? [{ key: 'balance' as const, dir: 'desc' as const, label: 'Bakiye: yüksek' }] : []),
              { key: 'quotes', dir: 'desc', label: 'En çok teklif' },
              { key: 'approved', dir: 'desc', label: 'En çok onay' },
              { key: 'pending', dir: 'desc', label: 'En çok bekleyen' },
              { key: 'last', dir: 'desc', label: 'Son teklif: yeni' },
              { key: 'last', dir: 'asc', label: 'Son teklif: eski' },
              { key: 'city', dir: 'asc', label: 'Şehir: A → Z' },
            ]} />
            {showCollections && onSaveCollection && (
              <button onClick={() => setMikroOpen(true)}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-brand-200 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-sm whitespace-nowrap">
                <FileUp className="w-4 h-4" /> Mikro bakiyesi
              </button>
            )}
            <button
              onClick={openNew}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Müşteri</span>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            <Building2 className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            {filtered.length === customers.length
              ? `${customers.length} kayıtlı müşteri`
              : `${filtered.length} / ${customers.length} müşteri`}
          </span>
          {showCollections && lastMikro && (
            <span className={`ml-auto ${(Date.now() - Date.parse(lastMikro)) / 864e5 > 15 ? 'text-rose-600 font-bold' : ''}`}>
              Mikro bakiyeleri: {lastMikro.split('-').reverse().join('.')}
            </span>
          )}
          {hasFilters && (
            <button onClick={resetFilters} className="font-semibold text-slate-500 hover:text-slate-800">
              Filtreleri temizle
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-sm text-slate-500">
          {customers.length === 0 ? 'Henüz müşteri kaydı yok.' : 'Filtrelere uygun müşteri bulunamadı.'}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Telefon: kart görünümü */}
          <div className="md:hidden divide-y divide-slate-100">
            {filtered.slice(0, limit).map(({ c, st }) => (
              <div key={c.id} className="p-3">
                <button onClick={() => { setViewing(c); setOnlyApproved(true); }} className="w-full text-left flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm leading-snug">{c.name}<StatusBadge c={c} /></div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {c.city || '—'}{st.lastDate ? ` · son teklif ${new Date(st.lastDate).toLocaleDateString('tr-TR')}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {sort.key === 'balance' && balanceOf(c) ? (<>
                      <div className={`font-black text-sm tabular-nums ${balanceOf(c)!.estimate < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{tl(Math.round(balanceOf(c)!.estimate))}</div>
                      <div className="text-[10px] text-slate-400">bakiye</div>
                    </>) : (<>
                      <div className="font-black text-slate-900 text-sm tabular-nums">{st.approvedTotal > 0 ? tl(st.approvedTotal) : '-'}</div>
                      <div className="text-[10px] text-slate-400">onaylı toplam</div>
                    </>)}
                  </div>
                </button>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 flex-wrap text-[10px] font-bold tabular-nums">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{st.total} teklif</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{st.approved} onaylı</span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{st.pending} bekleyen</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => onCreateQuoteForCustomer(c)} title="Teklif Aç"
                      className="p-1.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200"><FilePlus2 className="w-4 h-4" /></button>
                    <button onClick={() => openEdit(c)} title="Düzenle"
                      className="p-1.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm(`"${c.name}" müşterisi silinsin mi?`)) onDeleteCustomer(c.id); }} title="Sil"
                      className="p-1.5 rounded-md bg-slate-50 text-slate-500 border border-slate-200"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <SortHeader label="Firma" active={sort.key === 'name'} dir={sort.dir} onClick={() => sortBy('name', 'asc')} />
                  <SortHeader label="Şehir" active={sort.key === 'city'} dir={sort.dir} onClick={() => sortBy('city', 'asc')} />
                  <SortHeader label="Teklif" align="right" active={sort.key === 'quotes'} dir={sort.dir} onClick={() => sortBy('quotes', 'desc')} />
                  <SortHeader label="Onaylı" align="right" active={sort.key === 'approved'} dir={sort.dir} onClick={() => sortBy('approved', 'desc')} />
                  <SortHeader label="Beklemede" align="right" active={sort.key === 'pending'} dir={sort.dir} onClick={() => sortBy('pending', 'desc')} />
                  <SortHeader label="Onaylı Toplam" align="right" active={sort.key === 'total'} dir={sort.dir} onClick={() => sortBy('total', 'desc')} />
                  {showCollections && <SortHeader label="Bakiye" align="right" active={sort.key === 'balance'} dir={sort.dir} onClick={() => sortBy('balance', 'desc')} />}
                  <SortHeader label="Son Teklif" active={sort.key === 'last'} dir={sort.dir} onClick={() => sortBy('last', 'desc')} />
                  <th className="py-3 px-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice(0, limit).map(({ c, st }) => (
                  <tr
                    key={c.id}
                    onClick={() => { setViewing(c); setOnlyApproved(true); }}
                    className="hover:bg-brand-50/40 cursor-pointer"
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 min-w-[10rem]">{c.name}<StatusBadge c={c} /></div>
                      {st.followUp && (
                        <span className="mt-0.5 inline-block text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          ⏰ Tekrar görüş
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{c.city || '—'}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-800">{st.total || '-'}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-emerald-700">{st.approved || '-'}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-purple-700">{st.pending || '-'}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                      {st.approvedTotal > 0 ? tl(st.approvedTotal) : '-'}
                    </td>
                    {showCollections && (
                      <td className={`py-2.5 px-3 text-right tabular-nums font-bold whitespace-nowrap ${(balanceOf(c)?.estimate ?? 0) < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                        {balanceOf(c) ? tl(Math.round(balanceOf(c)!.estimate)) : '-'}
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                      {st.lastDate ? new Date(st.lastDate).toLocaleDateString('tr-TR') : '-'}
                    </td>
                    <td className="py-2.5 px-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onCreateQuoteForCustomer(c)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-brand-50 hover:bg-brand-100 text-brand-700 text-[11px] font-bold border border-brand-200 whitespace-nowrap"
                        >
                          <FilePlus2 className="w-3.5 h-3.5" /> Teklif Aç
                        </button>
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                          title="Düzenle"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`"${c.name}" müşterisi silinsin mi?`)) onDeleteCustomer(c.id);
                          }}
                          className="p-1.5 rounded-md bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > limit && (
            <div className="p-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>{limit} / {filtered.length} müşteri gösteriliyor</span>
              <button
                onClick={() => setLimit(n => n + PAGE)}
                className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold"
              >
                {PAGE} müşteri daha göster
              </button>
            </div>
          )}
        </div>
      )}

      </>)}

      {/* Cari hesap: firmaya ait her şey */}
      {viewing && (
        <CustomerAccount
          customer={viewing}
          quotes={quotesOf(viewing)}
          collections={collections
            .filter(c => fold(c.customerName.trim()) === fold(viewing.name.trim()))
            .sort((x, y) => (y.date || '').localeCompare(x.date || ''))}
          showCollections={showCollections}
          rates={rates}
          onClose={() => setViewing(null)}
          onOpenQuote={onOpenQuote}
          onNewQuote={() => { const c = viewing; setViewing(null); onCreateQuoteForCustomer(c); }}
          onSaveCollection={onSaveCollection}
          allCollectionRecords={collections}
          customers={customers}
          currentRole={currentRole}
          maxWon={evals.max}
          onSetStatus={(st, note) => setStatus(viewing, st, note)}
          balance={balanceOf(viewing)}
        />
      )}

      {mikroOpen && (
        <MikroUpload customers={customers} onClose={() => setMikroOpen(false)} onSave={list => list.forEach(onSaveCustomer)} />
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
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Şehir</label>
              <CityInput value={form.city} onChange={v => setForm({ ...form, city: v })} className={inputCls} />
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

const StatusBadge: React.FC<{ c: Customer }> = ({ c }) => {
  const st = statusOf(c);
  if (st === 'aktif') return null;
  return <span className={`ml-1.5 align-middle text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${CUSTOMER_STATUS[st].cls}`}>{CUSTOMER_STATUS[st].label}</span>;
};

/** Cari bakiyeler: Mikro bakiyesi − sonradan girilen tahsilatlar (tahmini güncel bakiye) */
const BalanceView: React.FC<{
  customers: Customer[];
  balanceOf: (c: Customer) => ReturnType<typeof estimatedBalance>;
  lastMikro: string;
  search: string;
  setSearch: (v: string) => void;
  onOpen: (c: Customer) => void;
  onMikro?: () => void;
}> = ({ customers, balanceOf, lastMikro, search, setSearch, onOpen, onMikro }) => {
  const [side, setSide] = useState<'alacak' | 'borc' | 'all'>('alacak');
  const rows = useMemo(() => customers.map(c => ({ c, b: balanceOf(c) })).filter(x => x.b && Math.round(x.b.estimate) !== 0) as { c: Customer; b: NonNullable<ReturnType<typeof estimatedBalance>> }[],
    [customers, balanceOf]);
  const alacak = rows.filter(r => r.b.estimate > 0), borc = rows.filter(r => r.b.estimate < 0);
  const sum = (l: typeof rows) => l.reduce((t, r) => t + r.b.estimate, 0);
  const shown = (side === 'alacak' ? alacak : side === 'borc' ? borc : rows)
    .filter(r => !search || fold(r.c.name).includes(fold(search.trim())) || fold(r.c.city || '').includes(fold(search.trim())))
    .sort((a, b) => Math.abs(b.b.estimate) - Math.abs(a.b.estimate));
  const max = Math.max(1, ...shown.map(r => Math.abs(r.b.estimate)));
  const old = lastMikro && (Date.now() - Date.parse(lastMikro)) / 864e5 > 15;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setSide('alacak')} className={`text-left rounded-2xl border p-3 ${side === 'alacak' ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-white'}`}>
          <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Alacağımız</span>
          <span className="block text-lg font-black text-slate-900 tabular-nums">{tl(Math.round(sum(alacak)))}</span>
          <span className="block text-[11px] text-slate-500">{alacak.length} firma</span>
        </button>
        <button onClick={() => setSide('borc')} className={`text-left rounded-2xl border p-3 ${side === 'borc' ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'}`}>
          <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Borcumuz / avans</span>
          <span className="block text-lg font-black text-rose-600 tabular-nums">{tl(Math.round(-sum(borc)))}</span>
          <span className="block text-[11px] text-slate-500">{borc.length} firma</span>
        </button>
      </div>
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="search" placeholder="Firma veya şehir ara..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          {onMikro && (
            <button onClick={onMikro} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-brand-200 bg-brand-50 text-brand-700 font-bold text-sm whitespace-nowrap">
              <FileUp className="w-4 h-4" /> Mikro yükle
            </button>
          )}
        </div>
        <p className={`text-[11px] ${old ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
          {lastMikro ? `Mikro bakiyeleri ${lastMikro.split('-').reverse().join('.')} tarihli.` : 'Henüz Mikro bakiyesi yüklenmedi.'} Tutar = Mikro bakiyesi − o tarihten sonra girilen TL tahsilatlar.
        </p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
        {shown.map(({ c, b }) => (
          <button key={c.id} onClick={() => onOpen(c)} className="w-full text-left p-3 sm:px-4 hover:bg-slate-50 block">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-slate-900 text-sm leading-snug">{c.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                  {c.city || '—'} · Mikro {tl(Math.round(b.balance))}{b.collectedAfter > 0 ? ` − sonradan tahsilat ${tl(Math.round(b.collectedAfter))}` : ''}
                </div>
              </div>
              <div className={`font-black text-sm tabular-nums shrink-0 ${b.estimate < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{tl(Math.round(b.estimate))}</div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
              <div className={`h-full rounded-full ${b.estimate < 0 ? 'bg-rose-400' : 'bg-brand-500'}`} style={{ width: `${Math.max(2, (Math.abs(b.estimate) / max) * 100)}%` }} />
            </div>
          </button>
        ))}
        {shown.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Bakiyesi olan müşteri yok.</p>}
      </div>
    </div>
  );
};
