// Liste sayfaları deneme sayfası (yalnız geliştirme): npx vite → /preview3/lists.html?p=quotes|customers|materials
const now = Date.now();
const d = (days: number) => new Date(now - days * 864e5).toISOString();
const ymd = (days: number) => d(days).slice(0, 10);
const firms = [['Duyar Isıtma', 'Isparta'], ['Wilo Pompa', 'Burdur'], ['Belimo', 'Antalya'], ['Enorpa Enerji', 'Isparta'], ['Gemfa Kazan', 'Burdur'], ['Kozanlar Jeotermal', 'Afyonkarahisar']];
const st = ['onaylandi', 'gonderildi', 'onaylandi', 'iptal', 'onaylandi', 'gonderildi'];
const quotes: any[] = Array.from({ length: 90 }, (_, i) => ({
  id: 'q' + i, quoteNumber: String(69000 + i), customerName: firms[i % 6][0], city: firms[i % 6][1], createdAt: d(i * 2 + 1), currency: 'TRY',
  status: st[i % 6], totalAmount: 50000 + ((i * 37) % 11) * 42000, items: [],
}));
const customers: any[] = firms.map(([name, city], i) => ({ id: String(i), name, city }));
const collections: any[] = Array.from({ length: 30 }, (_, i) => ({ id: 'c' + i, date: ymd(i * 5), customerName: firms[i % 6][0], amount: 60000 + i * 3000, currency: 'TRY', method: i % 3 ? 'Havale/EFT' : 'Çek', dueDate: i % 3 ? undefined : ymd(-(i + 3)), bankName: 'Ziraat' }));
const expenses: any[] = Array.from({ length: 20 }, (_, i) => ({ id: 'e' + i, date: ymd(i * 8), category: 'Yakıt', amount: 2000 + i * 150, currency: 'TRY', method: 'UTTS' }));
const { createRoot } = await import('react-dom/client');
await import('../src/index.css');
const React = await import('react');
const h = React.createElement;
const { QuoteManager } = await import('../src/components/QuoteManager');
const { CustomersPanel } = await import('../src/components/CustomersPanel');
const { MaterialsPanel } = await import('../src/components/MaterialsPanel');
const { PageHeader, SECTION_SUB, HERO_IMG } = await import('../src/components/Sections');
const { Sidebar } = await import('../src/components/Sidebar');
const { Header } = await import('../src/components/Header');
const { BottomNav } = await import('../src/components/BottomNav');
const { SECTION_META } = await import('../src/components/Sections');
const noop = () => {};
const allow = { quote: true, collection: true, expense: true };
const p = (new URLSearchParams(location.search).get('p') || 'quotes') as 'quotes' | 'customers' | 'materials';
const secs = (['quotes', 'materials', 'customers', 'collections', 'expenses', 'notes', 'reports', 'admin'] as const).map(id => ({ id, ...SECTION_META[id] }));
const App = () => {
  const [f, setF] = React.useState('all');
  return h('div', { className: 'min-h-screen bg-gradient-to-br from-[#eef4fb] via-[#F1F6FC] to-[#eaf1fa] text-slate-900 flex flex-col pb-24 md:pb-8 md:pl-60' },
    h(Sidebar, { sections: secs, active: p, onOpen: noop, onHome: noop, userName: 'Emre Karakaya', userEmail: 'e@x.com', roleLabel: 'Yönetici' }),
    h('div', { className: 'sticky top-0 z-30' }, h(Header, { syncStatus: { isOnline: true, isSyncing: false } as any, onTriggerSync: noop, onHome: noop, userName: 'Emre Karakaya', userEmail: 'e@x.com', roleLabel: 'Yönetici', onSearch: noop })),
    h('main', { className: 'max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 flex-1 min-w-0' },
      p !== 'materials' && h(PageHeader, { title: SECTION_META[p].title, subtitle: SECTION_SUB[p], icon: SECTION_META[p].icon, onBack: noop, hero: HERO_IMG[p as 'quotes'] }),
      p === 'quotes' && h(QuoteManager, { quotes, currentRole: 'admin' as any, onOpenNewQuote: noop, canNew: true, onUpdateQuoteStatus: noop, onDeleteQuote: noop, onPrintQuote: noop, onEditQuote: noop, statusFilter: f, onStatusFilterChange: setF }),
      p === 'customers' && h(CustomersPanel, { customers, quotes, collections, showCollections: true, onSaveCollection: noop, onSaveCustomer: noop, onDeleteCustomer: noop, onCreateQuoteForCustomer: noop }),
      p === 'materials' && h(MaterialsPanel, { quotes, canAdd: true })),
    h(BottomNav, { sections: secs as any, primary: ['quotes', 'customers', 'materials'], active: p, onOpen: noop, onHome: noop, onSignOut: noop, userEmail: 'e@x.com' }),
  );
};
createRoot(document.getElementById('root')!).render(h(App));
