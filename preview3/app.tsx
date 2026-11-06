// Tüm uygulama kabuğu deneme sayfası (yalnız geliştirme): npx vite → /preview3/app.html?p=home|quotes|customers|materials|collections|expenses|notes|reports (&tool=ask, &modal=new|edit|account)
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
const { PageHeader, SECTION_SUB, SECTION_META } = await import('../src/components/Sections');
const { Sidebar } = await import('../src/components/Sidebar');
const { Header, BandTools } = await import('../src/components/Header');
const { BottomNav } = await import('../src/components/BottomNav');
const { QuickToolsModal, toolList } = await import('../src/components/QuickTools');
const { Plus } = await import('lucide-react');
const { NewQuoteModal } = await import('../src/components/NewQuoteModal');
const { CustomerAccount } = await import('../src/components/CustomerAccount');
const { pageStats } = await import('../src/lib/pageStats');
const { useRates } = await import('../src/lib/rates');
const noop = () => {};
const allow = { quote: true, collection: true, expense: true };
const tools = toolList(true, allow);
const q = new URLSearchParams(location.search);
const TITLE: any = { collections: 'Tahsilat', expenses: 'Harcama' };
const secs = (['quotes', 'materials', 'customers', 'collections', 'expenses', 'notes', 'reports', 'admin'] as const).map(id => ({ id, ...SECTION_META[id], title: TITLE[id] || SECTION_META[id].title }));
const App = () => {
  const [p, setP] = React.useState<any>(q.get('p') || 'home');
  const [tool, setTool] = React.useState<any>(q.get('tool'));
  const [f, setF] = React.useState('all');
  const sync = { isOnline: true, isSyncing: false } as any;
  const rates = useRates(quotes);
  const user = { userName: 'Emre Karakaya', userEmail: 'e@x.com', roleLabel: 'Yönetici' };
  const action = p === 'quotes' ? 'Yeni Teklif Oluştur' : p === 'customers' ? 'Yeni Müşteri' : p === 'materials' ? 'Yeni Malzeme' : p === 'collections' ? 'Yeni Tahsilat' : p === 'expenses' ? 'Yeni Harcama' : '';
  return h('div', { className: 'min-h-screen bg-gradient-to-br from-[#eef4fb] via-[#f4f8fc] to-[#eaf1fa] text-slate-900 flex flex-col pb-24 md:pb-8 md:pl-60' },
    h(Sidebar, { sections: secs, active: p, onOpen: setP, onHome: () => setP('home'), tools: h(BandTools, { syncStatus: sync, onSync: noop, onSignOut: noop, userEmail: 'e@x.com' }), ...user }),
    h('div', { className: 'sticky top-0 z-30 md:hidden' }, h(Header, { syncStatus: sync, onTriggerSync: noop, onHome: () => setP('home'), ...user, onSearch: () => setTool('search') })),
    h('main', { className: 'max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 flex-1 min-w-0' },
      p !== 'home' && h(PageHeader, { title: SECTION_META[p as 'quotes'].title, subtitle: SECTION_SUB[p as 'quotes'], icon: SECTION_META[p as 'quotes'].icon, onBack: () => setP('home'), action: action ? { label: action, icon: Plus, onClick: noop } : undefined, stats: pageStats(p, { quotes, customers, collections, expenses, notes, activities } as any, rates) }),
      p === 'home' && h(SimpleHome, { quotes, customers, collections, expenses, sections: ['quotes', 'customers', 'collections', 'expenses', 'reports'], onOpen: setP, onOpenQuotes: () => setP('quotes'), onOpenQuote: noop,
        canAdd: allow, onNewQuote: noop, onNewCollection: noop, onNewExpense: noop, ...user, tools, onOpenTool: setTool, followCount: 7, syncStatus: sync, onSync: noop, onSignOut: noop }),
      p === 'quotes' && h(QuoteManager, { quotes, currentRole: 'isparta' as any, onOpenNewQuote: noop, onUpdateQuoteStatus: noop, onDeleteQuote: noop, onPrintQuote: noop, onEditQuote: noop, statusFilter: f, onStatusFilterChange: setF }),
      p === 'customers' && h(CustomersPanel, { customers, quotes, collections, showCollections: true, onSaveCollection: noop, onSaveCustomer: noop, onDeleteCustomer: noop, onCreateQuoteForCustomer: noop, currentRole: 'isparta' } as any),
      p === 'materials' && h(MaterialsPanel, { quotes }),
      (p === 'collections' || p === 'expenses') && h(LedgerPanel, { key: p, kind: p, records: p === 'collections' ? collections : expenses, customers, currentRole: 'isparta' as any, onSave: noop, onDelete: noop }),
      p === 'notes' && h(QuickNotesPanel, { notes, activities, currentRole: 'isparta' as any, onSaveNote: noop, onDeleteNote: noop }),
      p === 'reports' && h(ReportsPanel, { quotes, collections, expenses, customers })),
    h(BottomNav, { sections: secs as any, primary: ['quotes', 'customers', 'materials'], active: p, onOpen: setP, onHome: () => setP('home'), onSignOut: noop, userEmail: 'e@x.com' }),
    q.get('modal') === 'new' && h(NewQuoteModal, { currentRole: 'isparta' as any, onSaveQuote: noop, onClose: noop, customers, quotes }),
    q.get('modal') === 'edit' && h(NewQuoteModal, { currentRole: 'isparta' as any, onSaveQuote: noop, onClose: noop, customers, quotes, editQuote: quotes[0] }),
    q.get('modal') === 'account' && h(CustomerAccount, { customer: customers.find((c: any) => c.name === quotes[0].customerName) || customers[0], quotes, collections, rates, showCollections: true, onClose: noop, onNewQuote: noop, onOpenQuote: noop } as any),
    tool && h(QuickToolsModal, { mode: tool, tools, onMode: setTool, onClose: () => setTool(null), quotes, customers, allow, onVoice: noop, onOpenQuote: noop }),
  );
};
createRoot(document.getElementById('root')!).render(h(App));
