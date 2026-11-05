// Tekliflere sor deneme sayfası (yalnız geliştirme): npx vite → /preview3/ask.html
const now = Date.now();
const d = (days: number) => new Date(now - days * 864e5).toISOString();
const it = (productName: string, quantity: number, unitPrice: number, discount = 0) => ({ id: productName + quantity, productName, quantity, unit: 'Adet', unitPrice, discount, vatRate: 20, totalPrice: 0, currency: 'TRY' });
const quotes: any[] = [
  { id: 'q1', quoteNumber: 'T-1', customerName: 'Demir İnşaat', createdAt: d(3), currency: 'TRY', status: 'onaylandi', totalAmount: 5000, items: [it('2" Küresel Vana', 10, 500, 10)] },
  { id: 'q2', quoteNumber: 'T-2', customerName: 'Demir İnşaat', createdAt: d(20), currency: 'TRY', status: 'gonderildi', totalAmount: 2750, items: [it('2" Küresel Vana', 5, 550)] },
  { id: 'q3', quoteNumber: 'T-3', customerName: 'Gemfa Enerji', createdAt: d(40), currency: 'TRY', status: 'onaylandi', totalAmount: 8000, items: [it('200 lt Genleşme Tankı', 1, 8000)] },
];
const { createRoot } = await import('react-dom/client');
await import('../src/index.css');
const { AskQuotes } = await import('../src/components/AskQuotes');
const React = await import('react');
createRoot(document.getElementById('root')!).render(React.createElement('div', { className: 'max-w-3xl mx-auto px-4 py-5' },
  React.createElement(AskQuotes, { quotes, customers: ['Demir İnşaat', 'Gemfa Enerji'], onOpenQuote: (q: any) => { (window as any).opened = q.id; } })));
