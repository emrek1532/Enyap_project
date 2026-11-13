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
const { PageHeader, SECTION_SUB, SECTION_META, HERO_IMG } = await import('../src/components/Sections');
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
// Talepler denemesi (&p=requests, &req=form|1|2): örnek talepler
const { RequestsPanel } = await import('../src/components/RequestsPanel');
const ME = 'x', SILA = 's';
const mt = (code: string, name: string, price: number, currency = 'TRY') => ({ code, name, price, currency, unit: 'Adet', vatRate: 20 });
const ago = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
const reqs: any[] = [
  { id: 'r1', customerName: 'AFYON MEKANİK', note: 'Acil, proje fiyatı', rawText: '10 adet 2" küresel vana\n2 ad 500 lt genleşme tankı\n15 mt 1" PPRC boru', files: [], status: 'yeni', assignedTo: SILA, createdBy: ME, createdAt: ago(0.4), updatedAt: ago(0.4),
    lines: [
      { text: '10 adet 2" küresel vana', item: '2" küresel vana', qty: 10, unit: 'Adet', unsure: false, m: { cands: [mt('KV-200', 'KÜRESEL VANA 2" PN25', 1240)], pick: 'KV-200', via: 'unique' }, pick: 'KV-200', skip: false },
      { text: '2 ad 500 lt genleşme tankı', item: '500 lt genleşme tankı', qty: 2, unit: 'Adet', unsure: false, m: { cands: [mt('VTSKGD500', '500 LT DİK KAPALI GENL. DEPOSU', 9850), mt('APAGD500', 'APA 500 LT GENL. DEPOSU', 10400)], pick: null, via: 'choose' }, pick: null, skip: false },
      { text: '15 mt 1" PPRC boru', item: '1" PPRC boru', qty: 15, unit: 'Metre', unsure: false, m: { cands: [], pick: null, via: 'none' }, pick: null, skip: false },
    ] },
  { id: 'r2', customerName: 'Gemfa Kazan', note: 'Fotoğraf: el yazısı liste', files: [{ path: 'r2/a.jpg', name: 'talep.jpg', type: 'image/jpeg', size: 220000 }], status: 'hazirlaniyor', assignedTo: SILA, createdBy: ME, createdAt: ago(3), updatedAt: ago(1), lines: null },
  { id: 'r3', customerName: 'Burdur Termo', rawText: '3 adet sirkülasyon pompası', files: [{ path: 'r3/b.xlsx', name: 'malzeme-listesi.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 18000 }], status: 'yeni', assignedTo: ME, createdBy: SILA, createdAt: ago(26), updatedAt: ago(26), lines: null },
  { id: 'r4', customerName: 'Ege Mekanik', rawText: '1 adet boyler 300 lt', files: [], status: 'yuklendi', assignedTo: SILA, createdBy: ME, createdAt: ago(50), updatedAt: ago(30), quoteId: 'q1', lines: [] },
];
const people = [{ id: ME, fullName: 'Emre KARAKAYA' }, { id: SILA, fullName: 'Sıla Nur Alçı' }];
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
// Kontrol bekliyor denemesi: ekibin yüklediği 2 teklif (&open=review detayı açar)
const rv: any[] = [pend[3], pend[4]].filter(Boolean); rv.forEach((x: any) => { x.reviewPending = true; });
if (rv[0]) rv[0].customerName = 'AFYON MEKANİK';
const { supersededMap } = await import('../src/lib/quoteRules');
const sup = supersededMap(quotes);
const olderVersions = new Map<string, any[]>();
quotes.forEach((x: any) => { const l = sup.get(x.id); if (l) olderVersions.set(l.id, [...(olderVersions.get(l.id) || []), x]); });
const liveQ = quotes.filter((x: any) => !sup.has(x.id));
if (q.get('view')) localStorage.setItem('enyap-quote-view', JSON.stringify(q.get('view')));
const TITLE: any = { collections: 'Tahsilat', expenses: 'Harcama' };
const secs = (['quotes', 'requests', 'materials', 'customers', 'collections', 'expenses', 'notes', 'reports', 'admin'] as const).map(id => ({ id, ...SECTION_META[id], title: TITLE[id] || SECTION_META[id].title, badge: id === 'requests' ? 2 : id === 'quotes' ? 1 : 0 }));
const App = () => {
  const [qs, setQs] = React.useState<any[]>(liveQ);
  const patch = (id: string, p: any) => setQs(l => l.map(x => (x.id === id ? { ...x, ...p, updatedAt: new Date().toISOString() } : x)));
  const [p, setP] = React.useState<any>(q.get('p') || 'home');
  const [tool, setTool] = React.useState<any>(q.get('tool'));
  const [rd, setRd] = React.useState<any>(null);
  const [f, setF] = React.useState('all');
  const [qv, setQv] = React.useState<any>(null);
  const [lv, setLv] = React.useState<any>(null);
  const sync = { isOnline: true, isSyncing: false } as any;
  const rates = useRates(quotes);
  const user = { userName: 'Emre Karakaya', userEmail: 'e@x.com', roleLabel: 'Yönetici' };
  const action = p === 'quotes' ? 'Yeni Teklif Oluştur' : p === 'customers' ? 'Yeni Müşteri' : p === 'materials' ? 'Yeni Malzeme' : p === 'collections' ? 'Yeni Tahsilat' : p === 'expenses' ? 'Yeni Harcama' : p === 'admin' ? 'Kişi Ekle' : p === 'requests' ? 'Talep gir' : '';
  return h('div', { className: 'min-h-screen bg-gradient-to-br from-[#eef4fb] via-[#F1F6FC] to-[#eaf1fa] text-slate-900 flex flex-col pb-24 md:pb-8 md:pl-60' },
    h(Sidebar, { sections: secs, active: p, onOpen: setP, onHome: () => setP('home'), tools: h(BandTools, { syncStatus: sync, onSync: noop, onSignOut: noop, userEmail: 'e@x.com' }), ...user }),
    h('div', { className: 'sticky top-0 z-30 md:hidden' }, h(Header, { syncStatus: sync, onTriggerSync: noop, onHome: () => setP('home'), ...user, onSearch: () => setTool('search') })),
    h('main', { className: 'max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 flex-1 min-w-0' },
      p !== 'home' && p !== 'materials' && h(PageHeader, { title: SECTION_META[p as 'quotes'].title, subtitle: SECTION_SUB[p as 'quotes'], icon: SECTION_META[p as 'quotes'].icon, onBack: () => setP('home'), action: action ? { label: action, icon: Plus, onClick: noop } : undefined, hero: HERO_IMG[p as 'quotes'], statsLine: true, statsRow: p === 'collections' || p === 'expenses' || p === 'quotes', stats: pageStats(p, { quotes, customers, collections, expenses, notes, activities } as any, rates, undefined, p === 'quotes' ? qv : null, lv) }),
      p === 'home' && h(SimpleHome, { showBalances: true, quotes: qs, customers, collections, expenses, sections: ['quotes', 'materials', 'customers', 'collections', 'expenses', 'reports'], onOpen: setP, onOpenQuotes: () => setP('quotes'), onOpenQuote: noop,
        canAdd: allow, onNewQuote: noop, onNewCollection: noop, onNewExpense: noop, ...user, tools, onOpenTool: setTool, reviewQuotes: qs.filter((x: any) => x.reviewPending), myRequests: q.get('me') === 'sila' ? reqs.filter(r => r.assignedTo === SILA && r.status !== 'yuklendi') : [], followCount: 7, onSetStatus: (id: string, status: any) => patch(id, { status }), onPatchQuote: patch, syncStatus: sync, onSync: noop, onSignOut: noop }),
      p === 'requests' && h(RequestsPanel, { requests: reqs, customers, quotes, meId: q.get('me') === 'sila' ? SILA : ME, assignees: people, canEdit: true, reading: new Set(q.get('reading') ? ['r2'] : []), onSaved: noop, onRead: noop, onDraft: (d: any) => { (window as any).__draft = d; setRd(d); }, onOpenQuote: noop, openId: q.get('req') && q.get('req') !== 'form' ? 'r' + q.get('req') : null, newRequest: q.get('req') === 'form' ? 1 : 0, shared: q.get('shared') ? { text: 'Merhaba\n5 adet 1" pislik tutucu\n2 adet 24 kw kombi' } : null } as any),
      p === 'quotes' && h(QuoteManager, { quotes: qs, onMarkReviewed: (x: any) => patch(x.id, { reviewPending: false }), focusQuote: q.get('open') ? { id: q.get('open') === 'review' ? rv[0]?.id : q.get('open') === '2' ? base?.id + '-r1' : demo?.id, n: 1 } : null, onPatchQuote: patch, olderVersions, currentRole: 'isparta' as any, onOpenNewQuote: noop, onUpdateQuoteStatus: (id: string, status: any) => patch(id, { status }), onDeleteQuote: noop, onPrintQuote: noop, onEditQuote: noop, statusFilter: f, onStatusFilterChange: setF, onViewChange: setQv }),
      p === 'customers' && h(CustomersPanel, { customers, quotes, collections, showCollections: true, onSaveCollection: noop, onSaveCustomer: noop, onDeleteCustomer: noop, onCreateQuoteForCustomer: noop, currentRole: 'isparta' } as any),
      p === 'materials' && h(MaterialsPanel, { quotes, canAdd: true, onBack: () => setP('home') }),
      (p === 'collections' || p === 'expenses') && h(LedgerPanel, { key: p, kind: p, records: p === 'collections' ? collections : expenses, customers, currentRole: 'isparta' as any, onSave: noop, onDelete: noop, onViewChange: setLv }),
      p === 'notes' && h(QuickNotesPanel, { notes, activities, currentRole: 'isparta' as any, onSaveNote: noop, onDeleteNote: noop }),
      p === 'reports' && h(ReportsPanel, { quotes, collections, expenses, customers }),
      p === 'admin' && h(AdminPanel, { meId: 'x', activities, newRequest: q.get('modal') === 'adduser' ? 1 : 0, demoUsers: [
        { ...admin, createdAt: '2026-01-02T09:00:00Z', lastSeen: '2026-11-07T07:00:00Z' },
        { id: 'y', email: 'ali@enyap.com', fullName: 'Ali Yılmaz', isAdmin: false, status: 'active', perms: { quotes: 'edit', materials: 'view', notes: 'edit' }, lastSeen: '2026-11-06T15:20:00Z', createdAt: '2026-03-01T09:00:00Z' },
        { id: 'z', email: 'ayse@enyap.com', fullName: 'Ayşe Demir', isAdmin: false, status: 'pending', perms: {}, lastSeen: null, createdAt: '2026-11-06T10:00:00Z' },
      ] } as any)),
    h(BottomNav, { sections: secs as any, primary: ['quotes', 'requests', 'customers'], active: p, onOpen: setP, onHome: () => setP('home'), onSignOut: noop, userEmail: 'e@x.com' }),
    rd && h(NewQuoteModal, { currentRole: 'isparta' as any, onSaveQuote: noop, onClose: () => setRd(null), customers, quotes, draft: rd }),
    q.get('modal') === 'new' && h(NewQuoteModal, { currentRole: 'isparta' as any, onSaveQuote: noop, onClose: noop, customers, quotes }),
    q.get('modal') === 'edit' && h(NewQuoteModal, { currentRole: 'isparta' as any, onSaveQuote: noop, onClose: noop, customers, quotes, editQuote: quotes[0] }),
    q.get('modal') === 'account' && (() => { const nm = demo?.customerName || quotes[0].customerName; const cu = customers.find((c: any) => c.name === nm) || customers[0]; return h(CustomerAccount, { customer: cu, quotes: qs.filter((x: any) => x.customerName === nm), collections: collections.filter((c: any) => c.customerName === nm), rates, showCollections: true, onClose: noop, onNewQuote: noop, onOpenQuote: noop } as any); })(),
    tool && h(QuickToolsModal, { mode: tool, tools, onMode: setTool, onClose: () => setTool(null), quotes, customers, allow, onVoice: noop, onOpenQuote: noop }),
  );
};
createRoot(document.getElementById('root')!).render(h(AccessContext.Provider, { value: admin }, h(App)));
