// Tüm uygulama kabuğu deneme sayfası (yalnız geliştirme): npx vite → /preview3/app.html?p=home|quotes|customers|materials|collections|expenses|notes|reports |admin (&tool=ask, &modal=new|edit|account|adduser)
import { quotes, customers, collections, expenses, notes, activities } from './fixture';
const { createRoot } = await import('react-dom/client');
await import('../src/index.css');
const React = await import('react');
const h = React.createElement;
const { SimpleHome } = await import('../src/components/SimpleHome');
const { QuoteManager } = await import('../src/components/QuoteManager');
const { CustomersPanel } = await import('../src/components/CustomersPanel');
const { MaterialsPanel } = await import('../src/components/MaterialsPanel');
const { LedgerPanel } = await import('../src/components/LedgerPanel');
const { QuickNotesPanel } = await import('../src/components/QuickNotesPanel');
const { ReportsPanel } = await import('../src/components/ReportsPanel');
const { AdminPanel } = await import('../src/components/AdminPanel');
const { PageHeader, SECTION_SUB, SECTION_META } = await import('../src/components/Sections');
const { Sidebar } = await import('../src/components/Sidebar');
const { Header, BandTools } = await import('../src/components/Header');
const { BottomNav } = await import('../src/components/BottomNav');
const { QuickToolsModal, toolList } = await import('../src/components/QuickTools');
const { Plus } = await import('lucide-react');
const { AccessContext } = await import('../src/lib/access');
const admin = { id: 'x', email: 'e@x.com', fullName: 'Emre KARAKAYA', isAdmin: true, status: 'active', perms: {}, lastSeen: null, createdAt: '' } as any;
const { NewQuoteModal } = await import('../src/components/NewQuoteModal');
const { CustomerAccount } = await import('../src/components/CustomerAccount');
const { pageStats } = await import('../src/lib/pageStats');
const { useRates } = await import('../src/lib/rates');
const noop = () => {};
// Takip / geçerlilik / revizyon denemesi: bekleyen tekliflerin bir kısmına örnek tarihler ve kalemler
const { localDay } = await import('../src/lib/dates');
const dd = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localDay(d); };
const pend = quotes.filter((x: any) => x.status === 'gonderildi');
[[-1, 2], [0, 10], [0, -2], [2, 20], [5, 1], [9, 30]].forEach(([fu, vu], i) => {
  const x: any = pend[i]; if (!x) return;
  x.followUpAt = dd(fu); x.validUntil = dd(vu); x.customerPhone = '0532 000 00 0' + i;
});
[[undefined, 0], [undefined, -5], [undefined, 3]].forEach(([, vu], i) => { const x: any = pend[6 + i]; if (x) x.validUntil = dd(vu as number); });
const demo: any = pend[0];
if (demo) {
  const it = (id: string, productName: string, quantity: number, unitPrice: number) => ({ id, productName, quantity, unit: 'Adet', unitPrice, discount: 0, vatRate: 20, totalPrice: quantity * unitPrice });
  demo.items = [it('a', 'Yoğuşmalı kazan 150 kW', 2, 342000), it('b', 'Sirkülasyon pompası', 4, 53000), it('c', 'Kollektör ve vana grubu', 1, 139400), { ...it('d', 'AVASOFT-V301 OTO. SİNGLE YUMUŞATMA CİHAZI SİSTEMİ', 1, 2940), currency: 'USD' }, { ...it('e', 'HF22 WF TMG 10-41 PLAKALI EŞANJÖR DN100 SESİNOKS', 1, 1620), currency: 'EUR' }];
  demo.totalAmount = demo.items.reduce((t: number, x: any) => t + x.totalPrice, 0); demo.currency = 'TRY';
  (globalThis as any).__enyapDemoRevisions = { [demo.id]: [
    { rev: 1, items: [it('a', 'Yoğuşmalı kazan 150 kW', 2, 368000), it('b', 'Sirkülasyon pompası', 4, 51000)], totalAmount: 940000, currency: 'TRY', at: dd(-19) },
    { rev: 2, items: [it('a', 'Yoğuşmalı kazan 150 kW', 2, 356000), it('b', 'Sirkülasyon pompası', 4, 53000), { ...it('d', 'AVASOFT-V301 OTO. SİNGLE YUMUŞATMA CİHAZI SİSTEMİ', 1, 2800), currency: 'USD' }], totalAmount: 924000, currency: 'TRY', at: dd(-12) },
  ] };
}
const allow = { quote: true, collection: true, expense: true };
const tools = toolList(true, allow);
const q = new URLSearchParams(location.search);
// Kayıp nedeni ve rota denemesi
const RS = ['Fiyat yüksek', 'Fiyat yüksek', 'Rakip daha ucuz · ABC Isı %8 altında', 'Müşteri düşünüyor', 'Fiyat yüksek', 'Proje ertelendi', 'Teslim süresi'];
pend.forEach((x: any, i: number) => { if (i % 2 === 0) x.lostReason = RS[i % RS.length]; });
if (q.get('route')) { const c0 = customers.find((c: any) => c.name === (demo?.customerName)) || customers[0]; const same = customers.filter((c: any) => c.city === c0.city && c.id !== c0.id).slice(0, 3); localStorage.setItem('enyap-route', JSON.stringify({ day: localDay(), ids: [c0.id, ...same.map((c: any) => c.id)] })); c0.phone = '0532 000 00 00'; }
// Revizyon numarası denemesi: demo teklif 2 kez düzenlenmiş (R2); başka bir teklifin eski usul ayrı kaydı (-R1)
if (demo) demo.rev = 2;
const base: any = pend[1];
if (base) quotes.unshift({ ...base, id: base.id + '-r1', quoteNumber: base.quoteNumber + '-R1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rev: 0 });
const { supersededMap } = await import('../src/lib/quoteRules');
const sup = supersededMap(quotes);
const olderVersions = new Map<string, any[]>();
quotes.forEach((x: any) => { const l = sup.get(x.id); if (l) olderVersions.set(l.id, [...(olderVersions.get(l.id) || []), x]); });
const liveQ = quotes.filter((x: any) => !sup.has(x.id));
if (q.get('view')) localStorage.setItem('enyap-quote-view', JSON.stringify(q.get('view')));
const TITLE: any = { collections: 'Tahsilat', expenses: 'Harcama' };
const secs = (['quotes', 'materials', 'customers', 'collections', 'expenses', 'notes', 'reports', 'admin'] as const).map(id => ({ id, ...SECTION_META[id], title: TITLE[id] || SECTION_META[id].title }));
const App = () => {
  const [qs, setQs] = React.useState<any[]>(liveQ);
  const patch = (id: string, p: any) => setQs(l => l.map(x => (x.id === id ? { ...x, ...p, updatedAt: new Date().toISOString() } : x)));
  const [p, setP] = React.useState<any>(q.get('p') || 'home');
  const [tool, setTool] = React.useState<any>(q.get('tool'));
  const [f, setF] = React.useState('all');
  const [qv, setQv] = React.useState<any>(null);
  const [lv, setLv] = React.useState<any>(null);
  const sync = { isOnline: true, isSyncing: false } as any;
  const rates = useRates(quotes);
  const user = { userName: 'Emre Karakaya', userEmail: 'e@x.com', roleLabel: 'Yönetici' };
  const action = p === 'quotes' ? 'Yeni Teklif Oluştur' : p === 'customers' ? 'Yeni Müşteri' : p === 'materials' ? 'Yeni Malzeme' : p === 'collections' ? 'Yeni Tahsilat' : p === 'expenses' ? 'Yeni Harcama' : p === 'admin' ? 'Kişi Ekle' : '';
  return h('div', { className: 'min-h-screen bg-gradient-to-br from-[#eef4fb] via-[#f4f8fc] to-[#eaf1fa] text-slate-900 flex flex-col pb-24 md:pb-8 md:pl-60' },
    h(Sidebar, { sections: secs, active: p, onOpen: setP, onHome: () => setP('home'), tools: h(BandTools, { syncStatus: sync, onSync: noop, onSignOut: noop, userEmail: 'e@x.com' }), ...user }),
    h('div', { className: 'sticky top-0 z-30 md:hidden' }, h(Header, { syncStatus: sync, onTriggerSync: noop, onHome: () => setP('home'), ...user, onSearch: () => setTool('search') })),
    h('main', { className: 'max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 flex-1 min-w-0' },
      p !== 'home' && h(PageHeader, { title: SECTION_META[p as 'quotes'].title, subtitle: SECTION_SUB[p as 'quotes'], icon: SECTION_META[p as 'quotes'].icon, onBack: () => setP('home'), action: action ? { label: action, icon: Plus, onClick: noop } : undefined, stats: pageStats(p, { quotes, customers, collections, expenses, notes, activities } as any, rates, undefined, p === 'quotes' ? qv : null, lv) }),
      p === 'home' && h(SimpleHome, { showBalances: true, quotes: qs, customers, collections, expenses, sections: ['quotes', 'customers', 'collections', 'expenses', 'reports'], onOpen: setP, onOpenQuotes: () => setP('quotes'), onOpenQuote: noop,
        canAdd: allow, onNewQuote: noop, onNewCollection: noop, onNewExpense: noop, ...user, tools, onOpenTool: setTool, followCount: 7, syncStatus: sync, onSync: noop, onSignOut: noop }),
      p === 'quotes' && h(QuoteManager, { quotes: qs, focusQuote: q.get('open') ? { id: q.get('open') === '2' ? base?.id + '-r1' : demo?.id, n: 1 } : null, onPatchQuote: patch, olderVersions, currentRole: 'isparta' as any, onOpenNewQuote: noop, onUpdateQuoteStatus: (id: string, status: any) => patch(id, { status }), onDeleteQuote: noop, onPrintQuote: noop, onEditQuote: noop, statusFilter: f, onStatusFilterChange: setF, onViewChange: setQv }),
      p === 'customers' && h(CustomersPanel, { customers, quotes, collections, showCollections: true, onSaveCollection: noop, onSaveCustomer: noop, onDeleteCustomer: noop, onCreateQuoteForCustomer: noop, currentRole: 'isparta' } as any),
      p === 'materials' && h(MaterialsPanel, { quotes }),
      (p === 'collections' || p === 'expenses') && h(LedgerPanel, { key: p, kind: p, records: p === 'collections' ? collections : expenses, customers, currentRole: 'isparta' as any, onSave: noop, onDelete: noop, onViewChange: setLv }),
      p === 'notes' && h(QuickNotesPanel, { notes, activities, currentRole: 'isparta' as any, onSaveNote: noop, onDeleteNote: noop }),
      p === 'reports' && h(ReportsPanel, { quotes, collections, expenses, customers }),
      p === 'admin' && h(AdminPanel, { meId: 'x', activities, newRequest: q.get('modal') === 'adduser' ? 1 : 0, demoUsers: [
        { ...admin, createdAt: '2026-01-02T09:00:00Z', lastSeen: '2026-11-07T07:00:00Z' },
        { id: 'y', email: 'ali@enyap.com', fullName: 'Ali Yılmaz', isAdmin: false, status: 'active', perms: { quotes: 'edit', materials: 'view', notes: 'edit' }, lastSeen: '2026-11-06T15:20:00Z', createdAt: '2026-03-01T09:00:00Z' },
        { id: 'z', email: 'ayse@enyap.com', fullName: 'Ayşe Demir', isAdmin: false, status: 'pending', perms: {}, lastSeen: null, createdAt: '2026-11-06T10:00:00Z' },
      ] } as any)),
    h(BottomNav, { sections: secs as any, primary: ['quotes', 'customers', 'materials'], active: p, onOpen: setP, onHome: () => setP('home'), onSignOut: noop, userEmail: 'e@x.com' }),
    q.get('modal') === 'new' && h(NewQuoteModal, { currentRole: 'isparta' as any, onSaveQuote: noop, onClose: noop, customers, quotes }),
    q.get('modal') === 'edit' && h(NewQuoteModal, { currentRole: 'isparta' as any, onSaveQuote: noop, onClose: noop, customers, quotes, editQuote: quotes[0] }),
    q.get('modal') === 'account' && (() => { const nm = demo?.customerName || quotes[0].customerName; const cu = customers.find((c: any) => c.name === nm) || customers[0]; return h(CustomerAccount, { customer: cu, quotes: qs.filter((x: any) => x.customerName === nm), collections: collections.filter((c: any) => c.customerName === nm), rates, showCollections: true, onClose: noop, onNewQuote: noop, onOpenQuote: noop } as any); })(),
    tool && h(QuickToolsModal, { mode: tool, tools, onMode: setTool, onClose: () => setTool(null), quotes, customers, allow, onVoice: noop, onOpenQuote: noop }),
  );
};
createRoot(document.getElementById('root')!).render(h(AccessContext.Provider, { value: admin }, h(App)));
