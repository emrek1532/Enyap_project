import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, FilePlus2, X, FileUp, Eye, MoreVertical, ChevronRight, MapPin, MapPinCheck, Wallet, ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import { SearchBox, UnderlineTabs, Pager, FilterBar, WideOnly, NarrowOnly } from './ListUI';
import { MikroUpload } from './MikroUpload';
import { estimatedBalance } from '../lib/mikroBalance';
import { Collection, Customer, CustomerStatus, Quote, UserRole } from '../types';
import { ABC_STYLE, AbcClass, CUSTOMER_STATUS, QUIET_DAYS, abcClasses, evaluate, foldName, statusOf } from '../lib/customerInsights';
import { CustomerAccount } from './CustomerAccount';
import { RouteView } from './RouteView';
import { addToRoute, useRoute } from '../lib/route';
import { CityInput } from './TextSuggest';
import { isPendingQuote, needsFollowUp } from '../lib/quoteRules';
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
  /** Sayfa başlığındaki "Yeni Müşteri" her basışta artar */
  newRequest?: number;
  /** Müşteri ekleyip düzenleyebilir (yetki) */
  canEdit?: boolean;
  /** Kayıt silebilir (yetki) */
  canRemove?: boolean;
}

const emptyForm = { name: '', city: 'Isparta' };
const PAGE = 25;
const DEFAULT_SORT: SortState<CustomerSortKey> = { key: 'total', dir: 'desc' };

const trCompare = (a: string, b: string) => compareText(a, b);
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

const isApproved = (q: Quote) => q.status === 'onaylandi';
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const visitTxt = (d: string) => d.split('-').reverse().join('.');
type VisitFilter = 'all' | 'visited' | 'not' | 'stale' | 'quiet';
/** 3 ay önceki gün (YYYY-MM-DD): bundan eski ya da hiç uğranmamış = "3 aydır uğranmadı" */
const staleSince = () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const isStale = (c: Customer, since: string) => !c.lastVisit || c.lastVisit < since;
const tl = (n: number) => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;
/** Müşteriler sayfası ENYAP görünümü: beyaz kart + #E2EAF3 kenar, filtre kutuları */
const ccard = 'bg-white rounded-2xl border border-[#E2EAF3] shadow-[0_10px_28px_-24px_rgba(11,35,67,0.45)]';
const cctrl = 'h-10 px-3 rounded-xl border border-[#E2EAF3] bg-white text-sm text-[#173F73] font-semibold focus:outline-none focus:ring-2 focus:ring-[#006DBB]/20 focus:border-[#006DBB]';
const CUR: Record<string, string> = { TRY: 'TL', USD: '$', EUR: '€' };
const amt = (n: number, cur = 'TRY') => `${Math.round(n).toLocaleString('tr-TR')} ${CUR[cur] || cur}`;
const daysSince = (d: string) => Math.floor((Date.parse(todayIso()) - Date.parse(d)) / 864e5);
/** Ziyaret durumu (customers.last_visit): bugün / yakın zamanda (≤30 gün) / uzun süredir (>90 gün ya da hiç) */
export const visitState = (d?: string) => {
  if (!d) return { k: 'none' as const, label: 'Hiç uğranmadı', cls: 'text-[#7186A3]' };
  const n = daysSince(d);
  if (n <= 0) return { k: 'today' as const, label: 'Bugün uğrandı', cls: 'text-[#00897A]' };
  if (n <= 30) return { k: 'recent' as const, label: `Uğrandı ${visitTxt(d)}`, cls: 'text-[#006DBB]' };
  if (n > 90) return { k: 'old' as const, label: `Uzun süredir uğranmadı · ${visitTxt(d)}`, cls: 'text-[#7186A3]' };
  return { k: 'mid' as const, label: `Son ziyaret ${visitTxt(d)}`, cls: 'text-[#173F73]' };
};

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
  newRequest,
  canEdit = true,
  canRemove = true,
}) => {
  const [mikroOpen, setMikroOpen] = useState(false);
  useEffect(() => { if (openMikro) { setMikroOpen(true); onMikroHandled?.(); } }, [openMikro]); // eslint-disable-line react-hooks/exhaustive-deps
  const balanceOf = (c: Customer) => (showCollections ? estimatedBalance(c, collections) : null);
  const lastMikro = useMemo(() => customers.reduce((m, c) => (c.mikroBalanceDate && c.mikroBalanceDate > m ? c.mikroBalanceDate : m), ''), [customers]);
  const rates = useRates(quotes);
  const [mode, setMode] = useState<'list' | 'balance' | 'route'>('list');
  const [routeIds] = useRoute();
  const [statusFilter, setStatusFilter] = useState<'all' | CustomerStatus>('all');
  const [abcFilter, setAbcFilter] = useState<'all' | AbcClass | 'none'>('all');
  // Müşteri sınıfı (A/B/C): son 12 ay onaylanan tutara göre, cihazdaki veriden
  const abc = useMemo(() => abcClasses(quotes, rates), [quotes, rates]);
  const abcOf = (c: Customer) => abc.get(foldName(c.name));
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [visitFilter, setVisitFilter] = useState<VisitFilter>('all');
  const [quoteFilter, setQuoteFilter] = useState<'all' | 'approved' | 'pending' | 'followup' | 'none'>('all');
  // Sütun başlığına tıklayarak sıralama (varsayılan: onaylı toplamı en yüksek en üstte)
  const [sort, setSort] = useState<SortState<CustomerSortKey>>(DEFAULT_SORT);
  const sortBy = (key: CustomerSortKey, firstDir: SortDir) => { setSort(s => nextSort(s, key, firstDir)); setPage(0); };
  const [page, setPage] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Sayfa başlığındaki "Yeni Müşteri" düğmesi
  useEffect(() => { if (newRequest) openNew(); }, [newRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = useState<Customer | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);

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

  // Firma başına son tahsilat (Cari Bakiyeler; cihazdaki veriden, bir kez)
  const lastCol = useMemo(() => {
    const m = new Map<string, Collection>();
    collections.forEach(x => { const k = fold(x.customerName.trim()); const p = m.get(k); if (!p || (x.date || '') > (p.date || '')) m.set(k, x); });
    return m;
  }, [collections]);
  const lastCollectionOf = (c: Customer) => lastCol.get(fold(c.name.trim()));

  // "Uğradım": bugünün tarihi yazılır; işaretliyse sorup kaldırır
  const toggleVisit = (c: Customer) => {
    if (c.lastVisit && !confirm(`"${c.name}" ziyaret işareti (${visitTxt(c.lastVisit)}) kaldırılsın mı?`)) return;
    onSaveCustomer({ ...c, lastVisit: c.lastVisit ? undefined : todayIso(), updatedAt: new Date().toISOString() });
  };

  const setStatus = (c: Customer, status: CustomerStatus, note: string) => {
    const next = { ...c, status, statusNote: status === 'aktif' ? '' : note, updatedAt: new Date().toISOString() };
    onSaveCustomer(next);
    setViewing(v => (v && v.id === c.id ? next : v));
  };

  // Ana sayfadaki öneriden gelinince ilgili firmanın carisini aç
  useEffect(() => {
    if (!focusName) return;
    const c = customers.find(x => fold(x.name.trim()) === fold(focusName.trim()));
    if (c) { setViewing(c); }
    onFocusHandled?.();
  }, [focusName]); // eslint-disable-line react-hooks/exhaustive-deps

  const cityCounts = useMemo(() => {
    const map = new Map<string, number>();
    customers.forEach(c => map.set(c.city || '—', (map.get(c.city || '—') || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1] || trCompare(a[0], b[0]));
  }, [customers]);

  // Müşteri başına teklif özeti (bir kez hesaplanır; arama/sıralama değişince yeniden değil)
  const statsCache = useMemo(() => new Map<string, ReturnType<typeof calcStats>>(), [quotesByCustomer, rates]); // eslint-disable-line react-hooks/exhaustive-deps
  const statsOf = (c: Customer) => {
    let st = statsCache.get(c.id);
    if (!st) { st = calcStats(c); statsCache.set(c.id, st); }
    return st;
  };
  const calcStats = (c: Customer) => {
    const list = quotesOf(c);
    const approved = list.filter(isApproved);
    return {
      total: list.length,
      approved: approved.length,
      pending: list.filter(q => isPendingQuote(q)).length,
      followUp: list.some(needsFollowUp),
      approvedTotal: approved.reduce((sum, q) => sum + quoteTry(q, rates), 0),
      lastDate: list[0]?.createdAt || '',
    };
  };

  const deferredSearch = useDeferredValue(search);
  const base = useMemo(() => {
    const q = fold(deferredSearch.trim());
    return customers
      .filter(c => cityFilter === 'all' || (c.city || '—') === cityFilter)
      .filter(c => statusFilter === 'all' || statusOf(c) === statusFilter)
      .filter(c => abcFilter === 'all' || (abcFilter === 'none' ? !abcOf(c) : abcOf(c) === abcFilter))
      .filter(c => !q || fold(c.name).includes(q) || fold(c.city || '').includes(q) || (!!c.mikroCode && fold(c.mikroCode).includes(q)) || (!!c.mikroTitle && fold(c.mikroTitle).includes(q)))
      .map(c => ({ c, st: statsOf(c) }))
      .filter(({ st }) =>
        quoteFilter === 'all' ||
        (quoteFilter === 'approved' && st.approved > 0) ||
        (quoteFilter === 'pending' && st.pending > 0) ||
        (quoteFilter === 'followup' && st.followUp) ||
        (quoteFilter === 'none' && st.total === 0)
      )
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, statsCache, deferredSearch, cityFilter, quoteFilter, statusFilter, abcFilter, abc]);
  // Ziyaret sekmelerinde yalnız aktif firmalar (pasif / kara liste uğrama planına girmez; durum filtresinden açıkça seçilirse görünür)
  const inPlan = (c: Customer) => statusFilter !== 'all' || statusOf(c) === 'aktif';
  // Sessizleşen: A/B sınıfı ama QUIET_DAYS gündür teklif istemedi (sahada uğranacaklar)
  const quietSince = new Date(Date.now() - QUIET_DAYS * 864e5).toISOString();
  const isQuiet = (c: Customer, last: string) => { const k = abcOf(c); return (k === 'A' || k === 'B') && (!last || last < quietSince); };
  const visitCounts = useMemo(() => {
    const plan = base.filter(({ c }) => inPlan(c));
    const visited = plan.filter(({ c }) => !!c.lastVisit).length;
    const since = staleSince();
    return { all: base.length, visited, not: plan.length - visited, stale: plan.filter(({ c }) => isStale(c, since)).length, quiet: plan.filter(({ c, st }) => isQuiet(c, st.lastDate)).length };
  }, [base, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => {
    const since = staleSince();
    return base
      .filter(({ c, st }) => visitFilter === 'all' || (inPlan(c) && (visitFilter === 'visited' ? !!c.lastVisit : visitFilter === 'stale' ? isStale(c, since) : visitFilter === 'quiet' ? isQuiet(c, st.lastDate) : !c.lastVisit)))
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
  }, [base, visitFilter, statusFilter, sort, rates, collections]);

  const hasFilters = !!search || cityFilter !== 'all' || quoteFilter !== 'all' || statusFilter !== 'all' || abcFilter !== 'all' || visitFilter !== 'all' || sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir;
  const resetFilters = () => {
    setSearch(''); setCityFilter('all'); setQuoteFilter('all'); setStatusFilter('all'); setAbcFilter('all'); setVisitFilter('all'); setSort(DEFAULT_SORT); setPage(0);
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

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-[#E2EAF3] text-sm text-[#0B2343] focus:outline-none focus:ring-2 focus:ring-[#006DBB]/25 focus:border-[#006DBB]';


  const pageRows = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const custMenu = (c: Customer) => menuFor === c.id && (
    <>
      <div className="fixed inset-0 z-30" onClick={e => { e.stopPropagation(); setMenuFor(null); }} />
      <div className="absolute right-0 top-10 z-40 w-48 rounded-xl border border-[#E2EAF3] bg-white shadow-lg py-1 text-left text-sm" onClick={e => e.stopPropagation()}>
        <button onClick={() => { setMenuFor(null); onCreateQuoteForCustomer(c); }} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#EAF5FC] text-[#006DBB] font-semibold"><FilePlus2 className="w-4 h-4" /> Teklif aç</button>
        <button onClick={() => { setMenuFor(null); addToRoute(c.id); }} disabled={routeIds.includes(c.id)} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#F1F6FC] text-[#173F73] disabled:text-[#7186A3]"><MapPin className="w-4 h-4" /> {routeIds.includes(c.id) ? 'Rotada' : 'Bugünün rotasına ekle'}</button>
        {canEdit && <button onClick={() => { setMenuFor(null); openEdit(c); }} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#F1F6FC] text-[#173F73]"><Pencil className="w-4 h-4" /> Düzenle</button>}
        {canEdit && canRemove && <button onClick={() => { setMenuFor(null); if (confirm(`"${c.name}" müşterisi silinsin mi?`)) onDeleteCustomer(c.id); }} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-rose-50 text-rose-600"><Trash2 className="w-4 h-4" /> Sil</button>}
      </div>
    </>
  );
  // Ziyaret kaydı: "Uğradım" (bugünü yazar; işaretliyse sorup kaldırır)
  const visitBtn = (c: Customer) => canEdit && (
    <button type="button" onClick={e => { e.stopPropagation(); toggleVisit(c); }}
      title={c.lastVisit ? `Uğrandı: ${visitTxt(c.lastVisit)} (kaldırmak için dokun)` : 'Ziyaret kaydı: uğradım olarak işaretle'}
      className={`h-10 lg:h-8 px-2.5 lg:px-2 inline-flex items-center gap-1 rounded-lg text-[11px] font-bold whitespace-nowrap border transition-colors ${c.lastVisit ? 'bg-[#E6F7F4] border-[#00B49A]/30 text-[#00897A] hover:bg-[#d5f1ec]' : 'bg-white border-[#E2EAF3] text-[#173F73] hover:bg-[#EAF5FC] hover:text-[#006DBB]'}`}>
      {c.lastVisit ? <MapPinCheck className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
      <span className="max-xl:max-lg:inline max-xl:hidden">{c.lastVisit ? visitTxt(c.lastVisit).slice(0, 5) : 'Uğradım'}</span>
    </button>
  );
  const act = 'w-10 h-10 lg:w-8 lg:h-8 inline-flex items-center justify-center rounded-lg bg-[#EAF5FC] text-[#006DBB] hover:bg-[#d6ebf8] transition-colors';
  const rowActions = (c: Customer) => (
    <div className="relative flex items-center justify-center gap-1">
      {visitBtn(c)}
      <button type="button" title="Müşteriyi görüntüle" aria-label="Müşteriyi görüntüle" onClick={e => { e.stopPropagation(); setViewing(c); }} className={act}><Eye className="w-4 h-4" /></button>
      {canEdit && <button type="button" title="Müşteriyi düzenle" aria-label="Müşteriyi düzenle" onClick={e => { e.stopPropagation(); openEdit(c); }} className={`${act} max-lg:hidden`}><Pencil className="w-4 h-4" /></button>}
      <button type="button" title="Diğer işlemler" aria-label="Diğer işlemler" onClick={e => { e.stopPropagation(); setMenuFor(c.id); }} className={act}><MoreVertical className="w-4 h-4" /></button>
      {custMenu(c)}
    </div>
  );
  const sel = (on: boolean) => `${cctrl} ${on ? 'border-[#006DBB] bg-[#EAF5FC] text-[#006DBB]' : ''}`;
  const money = (n: number) => tl(Math.round(n));

  return (
    <div className="space-y-4">
      <UnderlineTabs<typeof mode> enyap value={mode} onChange={setMode} items={[
        { key: 'list' as const, label: 'Müşteri Listesi' },
        ...(showCollections ? [{ key: 'balance' as const, label: 'Cari Bakiyeler' }] : []),
        { key: 'route' as const, label: <>Bugünün Rotası{routeIds.length ? <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#EAF5FC] text-[#006DBB] text-[11px] tabular-nums">{routeIds.length}</span> : null}</> },
      ]} />

      {mode === 'route' && (
        <RouteView customers={customers} quotes={quotes} canEdit={canEdit} onSaveCustomer={onSaveCustomer} onOpen={c => setViewing(c)} />
      )}

      {mode === 'balance' && showCollections && (
        <BalanceView customers={customers} balanceOf={balanceOf} lastMikro={lastMikro} search={search} setSearch={setSearch}
          lastCollectionOf={lastCollectionOf} lastQuoteOf={c => statsOf(c).lastDate}
          onOpen={c => { setViewing(c); }} onMikro={onSaveCollection && canEdit ? () => setMikroOpen(true) : undefined} />
      )}

      {mode === 'list' && (<>
      <div className={ccard}>
        <div className="p-3 sm:p-4 space-y-2.5">
          <FilterBar className="flex flex-col 2xl:flex-row gap-2" active={(cityFilter !== 'all' ? 1 : 0) + (quoteFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (abcFilter !== 'all' ? 1 : 0)}
            search={<SearchBox value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Firma, şehir veya cari kod ara..." className="flex-1" />}>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap 2xl:flex-nowrap gap-2 items-center">
              <select value={cityFilter} onChange={e => { setCityFilter(e.target.value); setPage(0); }} className={sel(cityFilter !== 'all')} aria-label="Şehir">
                <option value="all">Tüm Şehirler</option>
                {cityCounts.map(([city, count]) => <option key={city} value={city}>{city} ({count})</option>)}
              </select>
              <select value={quoteFilter} onChange={e => { setQuoteFilter(e.target.value as typeof quoteFilter); setPage(0); }} className={sel(quoteFilter !== 'all')} aria-label="Teklif durumu">
                <option value="all">Tüm Müşteriler</option>
                <option value="approved">Onaylı teklifi olanlar</option>
                <option value="pending">Bekleyen teklifi olanlar</option>
                <option value="followup">Tekrar görüşülecekler</option>
                <option value="none">Hiç teklif verilmeyenler</option>
              </select>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as typeof statusFilter); setPage(0); }} className={sel(statusFilter !== 'all')} aria-label="Müşteri durumu">
                <option value="all">Tüm Durumlar</option>
                <option value="aktif">Aktif</option>
                <option value="pasif">Pasif</option>
                <option value="kara_liste">Kara liste</option>
              </select>
              <select value={abcFilter} onChange={e => { setAbcFilter(e.target.value as typeof abcFilter); setPage(0); }} className={sel(abcFilter !== 'all')} aria-label="Müşteri sınıfı" title="Son 12 ayda onaylanan tutara göre">
                <option value="all">Tüm Sınıflar</option>
                <option value="A">A · cironun %80'i</option>
                <option value="B">B · sonraki %15</option>
                <option value="C">C · küçük alımlar</option>
                <option value="none">Son 12 ayda alım yok</option>
              </select>
              <MobileSortSelect always className={`${cctrl} md:hidden`} sort={sort} onChange={(s) => { setSort(s); setPage(0); }} options={[
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
              {showCollections && onSaveCollection && canEdit && (
                <button onClick={() => setMikroOpen(true)}
                  className="h-10 flex items-center justify-center gap-1.5 px-4 rounded-xl bg-[#006DBB] hover:bg-[#173F73] text-white font-bold text-sm whitespace-nowrap transition-colors">
                  <Plus className="w-4 h-4" /> Mikro bakiyesi
                </button>
              )}
            </div>
          </FilterBar>
          {hasFilters && (
            <div className="flex items-center justify-between gap-2 text-xs text-[#7186A3]">
              <span>Liste filtreleniyor</span>
              <button type="button" onClick={clearFilters} className="font-bold text-[#006DBB] hover:text-[#173F73] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006DBB]">Filtreleri temizle</button>
            </div>
          )}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" aria-label="Ziyaret durumu">
            {([['all', 'Tümü'], ['quiet', `Sessizleşen A-B (${QUIET_DAYS}+ gün)`], ['visited', 'Uğradıklarım'], ['not', 'Uğramadıklarım'], ['stale', 'Son 3 ayda uğramadıklarım']] as [VisitFilter, string][]).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={visitFilter === k} onClick={() => { setVisitFilter(k); setPage(0); }}
                className={`shrink-0 h-8 px-3 rounded-full text-xs font-bold border whitespace-nowrap transition-colors ${visitFilter === k
                  ? (k === 'visited' ? 'bg-[#00B49A] border-[#00B49A] text-white' : k === 'all' ? 'bg-[#006DBB] border-[#006DBB] text-white' : 'bg-[#173F73] border-[#173F73] text-white')
                  : 'bg-white border-[#E2EAF3] text-[#173F73] hover:bg-[#EAF5FC] hover:border-[#006DBB]/40'}`}>
                {label} <span className="tabular-nums opacity-75">{visitCounts[k]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-[#7186A3]">
            <span>
              {filtered.length === customers.length ? `${customers.length} kayıtlı müşteri` : `${filtered.length} / ${customers.length} müşteri`}
            </span>
            {showCollections && lastMikro && (
              <span className={`ml-auto ${(Date.now() - Date.parse(lastMikro)) / 864e5 > 15 ? 'text-rose-600 font-bold' : ''}`}>
                Mikro bakiyeleri: {lastMikro.split('-').reverse().join('.')}
              </span>
            )}
            {hasFilters && <button onClick={resetFilters} className="font-bold text-[#006DBB] hover:underline">Filtreleri temizle</button>}
          </div>
        </div>
      </div>

      <div className={`${ccard} overflow-hidden`}>

        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#7186A3]">
            {customers.length === 0 ? 'Henüz müşteri kaydı yok.' : 'Filtrelere uygun müşteri bulunamadı.'}
          </p>
        ) : (<>
          {/* Telefon / dik tablet: kompakt kartlar (firma, bakiye, teklif sayısı, son ziyaret öncelikli) */}
          <NarrowOnly from="lg"><div className="lg:hidden divide-y divide-[#E2EAF3]">
            {pageRows.map(({ c, st }) => {
              const b = balanceOf(c);
              return (
              <div key={c.id} className="p-3">
                <button onClick={() => setViewing(c)} className="w-full text-left flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-[#0B2343] text-sm leading-snug break-words">{c.name}<AbcBadge k={abcOf(c)} /><StatusBadge c={c} /></div>
                    <div className="text-[11px] text-[#7186A3] mt-0.5">{c.city || '—'}{st.lastDate ? ` · son teklif ${new Date(st.lastDate).toLocaleDateString('tr-TR')}` : ''}</div>
                    <VisitLine d={c.lastVisit} />
                  </div>
                  <div className="text-right shrink-0">
                    {b ? (<>
                      <div className={`font-black text-sm tabular-nums ${b.estimate < 0 ? 'text-rose-600' : 'text-[#0B2343]'}`}>{money(b.estimate)}</div>
                      <div className="text-[10px] text-[#7186A3]">bakiye</div>
                    </>) : (<>
                      <div className="font-black text-[#0B2343] text-sm tabular-nums">{st.approvedTotal > 0 ? tl(st.approvedTotal) : '-'}</div>
                      <div className="text-[10px] text-[#7186A3]">onaylı toplam</div>
                    </>)}
                  </div>
                </button>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 flex-wrap text-[10px] font-bold tabular-nums">
                    <span className="px-2 py-0.5 rounded-full bg-[#F1F6FC] text-[#173F73]">{st.total} teklif</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#E6F7F4] text-[#00897A]">{st.approved} onaylı</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#EAF5FC] text-[#006DBB]">{st.pending} bekleyen</span>
                    {st.followUp && <FollowPill />}
                  </div>
                  {rowActions(c)}
                </div>
              </div>
            ); })}
          </div></NarrowOnly>
          <WideOnly from="lg"><div className="overflow-x-auto hidden lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F1F6FC] border-b border-[#E2EAF3] [&_th]:text-[#173F73]">
                <tr className="[&>th]:text-[12px] [&>th]:font-bold">
                  <SortHeader className="pl-5" label="Firma" active={sort.key === 'name'} dir={sort.dir} onClick={() => sortBy('name', 'asc')} />
                  <SortHeader className="hidden xl:table-cell" label="Şehir" active={sort.key === 'city'} dir={sort.dir} onClick={() => sortBy('city', 'asc')} />
                  <SortHeader label="Teklif" align="center" active={sort.key === 'quotes'} dir={sort.dir} onClick={() => sortBy('quotes', 'desc')} />
                  <SortHeader label="Onaylı" align="center" active={sort.key === 'approved'} dir={sort.dir} onClick={() => sortBy('approved', 'desc')} />
                  <SortHeader label="Beklemede" align="center" active={sort.key === 'pending'} dir={sort.dir} onClick={() => sortBy('pending', 'desc')} />
                  <SortHeader label="Onaylı Toplam" align="right" active={sort.key === 'total'} dir={sort.dir} onClick={() => sortBy('total', 'desc')} />
                  {showCollections && <SortHeader className="hidden xl:table-cell" label="Bakiye" align="right" active={sort.key === 'balance'} dir={sort.dir} onClick={() => sortBy('balance', 'desc')} />}
                  <SortHeader className="hidden xl:table-cell" label="Son Teklif" active={sort.key === 'last'} dir={sort.dir} onClick={() => sortBy('last', 'desc')} />
                  <th className="py-3 px-3 text-center">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2EAF3]">
                {pageRows.map(({ c, st }) => {
                  const b = balanceOf(c);
                  return (
                  <tr key={c.id} onClick={() => setViewing(c)} className="cursor-pointer bg-white hover:bg-[#EAF5FC]/60 transition-colors">
                    <td className="py-2.5 px-3 pl-5">
                      <div className="font-extrabold text-[#0B2343] min-w-[13rem] leading-snug">{c.name}<AbcBadge k={abcOf(c)} /><StatusBadge c={c} /></div>
                      <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap [&>span]:mt-0">
                        <span className="xl:hidden text-xs text-[#7186A3] whitespace-nowrap">{c.city || '—'}{st.lastDate ? ` · ${new Date(st.lastDate).toLocaleDateString('tr-TR')}` : ''}</span>
                        <VisitLine d={c.lastVisit} compact />
                        {st.followUp && <FollowPill />}
                      </div>
                    </td>
                    <td className="hidden xl:table-cell py-2.5 px-3 text-[13px] text-[#7186A3] whitespace-nowrap">{c.city || '—'}</td>
                    <td className="py-2.5 px-3 text-center tabular-nums font-semibold text-[#173F73]">{st.total || '-'}</td>
                    <td className="py-2.5 px-3 text-center tabular-nums font-bold text-[#00A08A]">{st.approved || '-'}</td>
                    <td className="py-2.5 px-3 text-center tabular-nums font-bold text-[#006DBB]">{st.pending || '-'}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-extrabold text-[#0B2343] whitespace-nowrap">{st.approvedTotal > 0 ? tl(st.approvedTotal) : '-'}</td>
                    {showCollections && (
                      <td className="hidden xl:table-cell py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                        {b ? <span className={`font-bold ${b.estimate < 0 ? 'inline-block px-2 py-0.5 rounded-md bg-rose-50 text-rose-700' : 'text-[#0B2343]'}`}>{money(b.estimate)}</span> : <span className="text-[#7186A3]">-</span>}
                      </td>
                    )}
                    <td className="hidden xl:table-cell py-2.5 px-3 text-[13px] text-[#7186A3] whitespace-nowrap">
                      {st.lastDate ? <>{new Date(st.lastDate).toLocaleDateString('tr-TR')} <ChevronRight className="w-3.5 h-3.5 inline -mt-0.5" /></> : '-'}
                    </td>
                    <td className="py-2.5 px-3" onClick={e => e.stopPropagation()}>{rowActions(c)}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div></WideOnly>
        </>)}
        <Pager page={page} total={filtered.length} size={PAGE} onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          label={<>Toplam {filtered.length.toLocaleString('tr-TR')} müşteri</>} />
      </div>
      </>)}

      {/* Cari hesap: firmaya ait her şey */}
      {viewing && (
        <CustomerAccount
          customer={viewing}
          abc={abcOf(viewing)}
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
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 pt-0 sm:pt-0 space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 z-10 -mx-4 sm:-mx-5 mb-1 px-4 sm:px-6 py-4 pt-safe-4 sm:pt-4 bg-gradient-to-br from-[#0B2343] to-[#173F73] text-white flex items-center justify-between">
              <h3 className="font-black text-lg tracking-tight">{editing ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'}</h3>
              <button type="button" onClick={() => setIsFormOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white shrink-0" aria-label="Kapat">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#173F73] mb-1">Firma Adı *</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#173F73] mb-1">Şehir</label>
              <CityInput value={form.city} onChange={v => setForm({ ...form, city: v })} className={inputCls} />
            </div>
            {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</p>}
            <button type="submit" className="w-full py-3 rounded-xl bg-[#006DBB] hover:bg-[#173F73] text-white font-bold text-sm transition-colors">
              Kaydet
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

const FollowPill: React.FC = () => (
  <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-[#E6F7F4] text-[#00897A] border border-[#00B49A]/30">⏱ Tekrar görüş</span>
);

/** Ziyaret durumu satırı: konum simgesi + bugün / yakın / uzun süredir */
const VisitLine: React.FC<{ d?: string; compact?: boolean }> = ({ d, compact }) => {
  const v = visitState(d);
  if (compact && v.k === 'none') return null;
  const I = v.k === 'today' || v.k === 'recent' ? MapPinCheck : MapPin;
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${compact ? '' : 'mt-0.5'} ${v.cls}`}><I className="w-3.5 h-3.5 shrink-0" />{v.label}</span>;
};

const AbcBadge: React.FC<{ k?: AbcClass }> = ({ k }) => (k
  ? <span title={ABC_STYLE[k].hint} className={`ml-1.5 align-middle text-[10px] px-1.5 py-0.5 rounded-md font-black border ${ABC_STYLE[k].cls}`}>{k}</span>
  : null);

const StatusBadge: React.FC<{ c: Customer }> = ({ c }) => {
  const st = statusOf(c);
  if (st === 'aktif') return null;
  return <span className={`ml-1.5 align-middle text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${CUSTOMER_STATUS[st].cls}`}>{CUSTOMER_STATUS[st].label}</span>;
};

/** Cari bakiyeler: Mikro bakiyesi − sonradan girilen tahsilatlar (tahmini güncel bakiye) */
const AMOUNT_FILTERS: [string, string][] = [
  ['all', 'Tüm tutarlar'],
  ['lt:10000', '10.000 TL altı'],
  ['lt:50000', '50.000 TL altı'],
  ['lt:100000', '100.000 TL altı'],
  ['gte:100000', '100.000 TL ve üstü'],
];

const BalanceView: React.FC<{
  customers: Customer[];
  balanceOf: (c: Customer) => ReturnType<typeof estimatedBalance>;
  lastMikro: string;
  search: string;
  setSearch: (v: string) => void;
  onOpen: (c: Customer) => void;
  onMikro?: () => void;
  /** Firmanın son tahsilatı ve son teklif tarihi (son işlem = ikisinin yenisi) */
  lastCollectionOf: (c: Customer) => Collection | undefined;
  lastQuoteOf: (c: Customer) => string;
}> = ({ customers, balanceOf, lastMikro, search, setSearch, onOpen, onMikro, lastCollectionOf, lastQuoteOf }) => {
  const [side, setSide] = useState<'alacak' | 'borc' | 'all'>('alacak');
  // Tutar süzgeci (bakiyenin mutlak değeri; kutulardaki toplamları da süzer): "lt:10000" = 10.000 TL altı, "gte:100000" = 100.000 TL ve üstü
  const [amount, setAmount] = useState('all');
  // Arama kutuları da süzer: şehir adı birebir yazılırsa yalnız o şehrin firmaları (Isparta → Isparta'dakiler), yoksa ad/şehir içinde arar
  const q = fold(search.trim());
  const cityHit = useMemo(() => !!q && customers.some(c => fold(c.city || '') === q), [customers, q]);
  const rows = useMemo(() => customers
    .filter(c => !q || (cityHit ? fold(c.city || '') === q : fold(c.name).includes(q) || fold(c.city || '').includes(q) || (!!c.mikroCode && fold(c.mikroCode).includes(q))))
    .map(c => ({ c, b: balanceOf(c) })).filter(x => x.b && Math.round(x.b.estimate) !== 0)
    .filter(x => {
      if (amount === 'all') return true;
      const [op, lim] = amount.split(':'); const v = Math.abs(x.b!.estimate);
      return op === 'lt' ? v < Number(lim) : v >= Number(lim);
    }) as { c: Customer; b: NonNullable<ReturnType<typeof estimatedBalance>> }[],
    [customers, balanceOf, q, cityHit, amount]);
  const alacak = rows.filter(r => r.b.estimate > 0), borc = rows.filter(r => r.b.estimate < 0);
  const sum = (l: typeof rows) => l.reduce((t, r) => t + r.b.estimate, 0);
  const net = sum(rows);
  const shown = (side === 'alacak' ? alacak : side === 'borc' ? borc : rows)
    .sort((a, b) => Math.abs(b.b.estimate) - Math.abs(a.b.estimate));
  const old = lastMikro && (Date.now() - Date.parse(lastMikro)) / 864e5 > 15;
  const day = (d?: string) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '-');
  const lastTx = (c: Customer) => { const a = lastCollectionOf(c)?.date || '', b = (lastQuoteOf(c) || '').slice(0, 10); return a > b ? a : b; };
  const sumCard = ({ k, label, value, sub, icon: I, neg, className = '' }: { k: typeof side; label: string; value: number; sub: string; icon: React.ElementType; neg?: boolean; className?: string }) => {
    const on = side === k;
    return (
      <button key={k} type="button" onClick={() => setSide(k)} aria-pressed={on}
        className={`${className} relative text-left flex items-center gap-3 rounded-2xl border px-3 py-3 sm:px-4 min-w-0 transition-colors bg-gradient-to-br from-white ${on ? 'to-[#EAF5FC] border-[#006DBB] ring-1 ring-[#006DBB]/30' : 'to-[#F1F6FC] border-[#E2EAF3] hover:border-[#006DBB]/40'}`}>
        <span className={`hidden sm:flex w-10 h-10 rounded-xl items-center justify-center shrink-0 ${neg ? 'bg-rose-50 text-rose-600' : k === 'all' ? 'bg-[#E6F7F4] text-[#00B49A]' : 'bg-[#EAF5FC] text-[#006DBB]'}`}><I className="w-5 h-5" /></span>
        <span className="min-w-0">
          <span className="block text-[11px] sm:text-xs font-bold text-[#7186A3]">{label}</span>
          <span className={`block text-base sm:text-xl font-black tabular-nums leading-tight break-words ${value < 0 ? 'text-rose-600' : 'text-[#0B2343]'}`}>{tl(Math.round(value))}</span>
          <span className="block text-[11px] text-[#7186A3]">{sub}</span>
        </span>
      </button>
    );
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        {sumCard({ k: 'alacak', label: 'Toplam Alacak', value: sum(alacak), sub: `${alacak.length} firma`, icon: ArrowDownLeft })}
        {sumCard({ k: 'borc', label: 'Toplam Borç / avans', value: -sum(borc), sub: `${borc.length} firma`, icon: ArrowUpRight, neg: true })}
        {sumCard({ k: 'all', label: 'Net Bakiye', value: net, sub: `${rows.length} firma · alacak − borç`, icon: Scale, className: 'col-span-2 lg:col-span-1' })}
      </div>
      <div className={`${ccard} p-3 space-y-2`}>
        <div className="flex gap-2">
          <SearchBox value={search} onChange={setSearch} placeholder="Firma, şehir veya cari kod ara..." className="flex-1" />
          {onMikro && (
            <button onClick={onMikro} className="h-10 flex items-center gap-1.5 px-3 rounded-xl border border-[#006DBB]/25 bg-[#EAF5FC] text-[#006DBB] font-bold text-sm whitespace-nowrap hover:bg-[#d6ebf8]">
              <FileUp className="w-4 h-4" /> <span className="hidden sm:inline">Mikro yükle</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" aria-label="Tutar">
          {AMOUNT_FILTERS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={amount === k} onClick={() => setAmount(k)}
              className={`shrink-0 h-8 px-3 rounded-full text-xs font-bold border whitespace-nowrap transition-colors ${amount === k ? 'bg-[#006DBB] border-[#006DBB] text-white' : 'bg-white border-[#E2EAF3] text-[#173F73] hover:bg-[#EAF5FC]'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className={`text-[11px] ${old ? 'text-rose-600 font-bold' : 'text-[#7186A3]'}`}>
          {lastMikro ? `Mikro bakiyeleri ${lastMikro.split('-').reverse().join('.')} tarihli.` : 'Henüz Mikro bakiyesi yüklenmedi.'} Tutar = Mikro bakiyesi − o tarihten sonra girilen TL tahsilatlar.
        </p>
      </div>
      <div className={`${ccard} overflow-hidden`}>
        {shown.length === 0 && <p className="p-6 text-center text-sm text-[#7186A3]">{amount !== 'all' || q ? 'Bu süzgece uyan bakiyeli müşteri yok.' : 'Bakiyesi olan müşteri yok.'}</p>}
        {shown.length > 0 && (<>
          <NarrowOnly from="lg"><div className="divide-y divide-[#E2EAF3]">
            {shown.map(({ c, b }) => {
              const lc = lastCollectionOf(c);
              return (
                <button key={c.id} onClick={() => onOpen(c)} className="w-full text-left p-3 sm:px-4 hover:bg-[#EAF5FC]/60 block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-[#0B2343] text-sm leading-snug break-words">{c.name}</div>
                      <div className="text-[11px] text-[#7186A3] mt-0.5 tabular-nums">
                        {c.city || '—'} · Mikro {tl(Math.round(b.balance))}{b.collectedAfter > 0 ? ` − sonradan ${tl(Math.round(b.collectedAfter))}` : ''}
                      </div>
                      <div className="text-[11px] text-[#173F73] mt-0.5 tabular-nums">
                        <Wallet className="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-[#00B49A]" />{lc ? `Son tahsilat ${amt(lc.amount, lc.currency)} · ${day(lc.date)}` : 'Tahsilat kaydı yok'}
                      </div>
                    </div>
                    <div className={`font-black text-sm tabular-nums shrink-0 ${b.estimate < 0 ? 'text-rose-600' : 'text-[#0B2343]'}`}>{tl(Math.round(b.estimate))}</div>
                  </div>
                </button>
              );
            })}
          </div></NarrowOnly>
          <WideOnly from="lg"><table className="w-full text-left text-sm">
            <thead className="bg-[#F1F6FC] border-b border-[#E2EAF3]">
              <tr className="[&>th]:py-3 [&>th]:px-3 [&>th]:text-[12px] [&>th]:font-bold [&>th]:text-[#173F73]">
                <th className="pl-5">Firma</th>
                <th>Şehir</th>
                <th className="text-right">Cari Bakiye</th>
                <th className="text-right">Son Tahsilat</th>
                <th className="pr-5">Son İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2EAF3]">
              {shown.map(({ c, b }) => {
                const lc = lastCollectionOf(c);
                return (
                  <tr key={c.id} onClick={() => onOpen(c)} className="cursor-pointer hover:bg-[#EAF5FC]/60 transition-colors">
                    <td className="py-2.5 px-3 pl-5">
                      <div className="font-extrabold text-[#0B2343] leading-snug">{c.name}</div>
                      <div className="text-[11px] text-[#7186A3] tabular-nums">Mikro {tl(Math.round(b.balance))} · {day(b.date)}{b.collectedAfter > 0 ? ` − sonradan ${tl(Math.round(b.collectedAfter))}` : ''}</div>
                    </td>
                    <td className="py-2.5 px-3 text-[13px] text-[#7186A3] whitespace-nowrap">{c.city || '—'}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      <span className={`font-black ${b.estimate < 0 ? 'inline-block px-2 py-0.5 rounded-md bg-rose-50 text-rose-700' : 'text-[#0B2343]'}`}>{tl(Math.round(b.estimate))}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      {lc ? <><div className="font-bold text-[#00897A]">{amt(lc.amount, lc.currency)}</div><div className="text-[11px] text-[#7186A3]">{day(lc.date)}</div></> : <span className="text-[#7186A3]">-</span>}
                    </td>
                    <td className="py-2.5 px-3 pr-5 text-[13px] text-[#173F73] tabular-nums whitespace-nowrap">{day(lastTx(c))}<ChevronRight className="w-3.5 h-3.5 inline -mt-0.5 ml-1 text-[#7186A3]" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table></WideOnly>
        </>)}
      </div>
    </div>
  );
};
