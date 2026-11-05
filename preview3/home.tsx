// Yeni ana sayfa düzeni deneme sayfası (yalnız geliştirme): npx vite → /preview3/home.html (?tool=search açık kısayol)
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
const { SimpleHome } = await import('../src/components/SimpleHome');
const { Sidebar } = await import('../src/components/Sidebar');
const { Header } = await import('../src/components/Header');
const { BottomNav } = await import('../src/components/BottomNav');
const { SECTION_META } = await import('../src/components/Sections');
const { QuickToolsModal, toolList } = await import('../src/components/QuickTools');
const noop = () => {};
const allow = { quote: true, collection: true, expense: true };
const tools = toolList(true, allow);
const secs = (['quotes', 'materials', 'customers', 'collections', 'expenses', 'notes', 'reports', 'admin'] as const).map(id => ({ id, ...SECTION_META[id] }));
const App = () => {
  const [tool, setTool] = React.useState<any>(new URLSearchParams(location.search).get('tool'));
  return h('div', { className: 'min-h-screen bg-gradient-to-br from-[#eef4fb] via-[#f4f8fc] to-[#eaf1fa] text-slate-900 flex flex-col pb-24 md:pb-8 md:pl-60' },
    h(Sidebar, { sections: secs, active: 'home', onOpen: noop, onHome: noop, onSignOut: noop, userName: 'Emre Karakaya', userEmail: 'e@x.com', roleLabel: 'Yönetici' }),
    h('div', { className: 'sticky top-0 z-30' }, h(Header, { syncStatus: { isOnline: true, isSyncing: false } as any, onTriggerSync: noop, onHome: noop, userName: 'Emre Karakaya', userEmail: 'e@x.com', roleLabel: 'Yönetici', onSearch: () => setTool('search') })),
    h('main', { className: 'max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 flex-1 min-w-0' },
      h(SimpleHome, { quotes, customers, collections, expenses, sections: ['quotes', 'customers', 'collections', 'expenses'], onOpen: noop, onOpenQuote: noop,
        canAdd: allow, onNewQuote: noop, onNewCollection: noop, onNewExpense: noop, userName: 'Emre Karakaya', tools, onOpenTool: setTool })),
    h(BottomNav, { sections: secs as any, primary: ['quotes', 'customers', 'materials'], active: 'home', onOpen: noop, onHome: noop, onSignOut: noop, userEmail: 'e@x.com' }),
    tool && h(QuickToolsModal, { mode: tool, tools, onMode: setTool, onClose: () => setTool(null), quotes, customers, allow, onVoice: noop, onOpenQuote: noop }),
  );
};
createRoot(document.getElementById('root')!).render(h(App));
