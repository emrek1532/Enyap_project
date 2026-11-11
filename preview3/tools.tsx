// Ana sayfa araç sekmeleri deneme sayfası (yalnız geliştirme): npx vite → /preview3/tools.html?t=search|draft|voice (Ara · Sor birleşik)
const now = Date.now();
const d = (days: number) => new Date(now - days * 864e5).toISOString();
const it = (productName: string, quantity: number, unitPrice: number, discount = 0) => ({ id: productName + quantity, productName, quantity, unit: 'Adet', unitPrice, discount, vatRate: 20, totalPrice: 0, currency: 'TRY' });
const quotes: any[] = [
  { id: 'q1', quoteNumber: 'T-1', customerName: 'Demir İnşaat', createdAt: d(3), currency: 'TRY', status: 'onaylandi', totalAmount: 5000, items: [it('2" Küresel Vana', 10, 500, 10)] },
  { id: 'q2', quoteNumber: 'T-2', customerName: 'Demir İnşaat', createdAt: d(20), currency: 'TRY', status: 'gonderildi', totalAmount: 2750, items: [it('2" Küresel Vana', 5, 550)] },
  { id: 'q3', quoteNumber: 'T-3', customerName: 'Gemfa Enerji', createdAt: d(40), currency: 'TRY', status: 'onaylandi', totalAmount: 8000, items: [it('200 lt Genleşme Tankı', 1, 8000)] },
  { id: 'q4', quoteNumber: 'T-4', customerName: 'Gemfa Enerji', createdAt: d(10), currency: 'TRY', status: 'gonderildi', totalAmount: 450, items: [it('M-8 TUĞLA DÜBELİ SARI (roket 500 ad)', 500, 0.9)] },
];
const customers: any[] = [{ id: '1', name: 'Demir İnşaat', city: 'Isparta' }, { id: '2', name: 'Gemfa Enerji', city: 'Antalya' }, { id: '3', name: 'Sarı-Tez Doğalgaz', city: 'Afyon' }];
(window as any).SpeechRecognition = function () { return { start() {}, stop() {}, abort() {} }; };
try { localStorage.setItem('search-history', JSON.stringify([{ q: 'küresel vana', at: now - 3600e3 }])); localStorage.setItem('voice-history', JSON.stringify([{ q: "Opet'e 2.400 lira yakıt", at: now - 864e5, tag: 'Harcama' }])); localStorage.setItem('draft-history', JSON.stringify([{ q: "Gemfa'ya 10 adet 2\" küresel vana", at: now - 7200e3 }])); } catch { /* */ }
const t = new URLSearchParams(location.search).get('t') || 'search';
const { createRoot } = await import('react-dom/client');
await import('../src/index.css');
const React = await import('react');
const noop = () => {};
const el = t === 'draft' ? React.createElement((await import('../src/components/QuoteBuilder')).QuoteBuilder, { quotes, customers, onDraft: noop })
  : t === 'voice' ? React.createElement((await import('../src/components/VoiceCommand')).VoiceCommand, { customers: customers.map(c => c.name), allow: { quote: true, collection: true, expense: true }, onResult: noop })
  : React.createElement((await import('../src/components/QuickPrice')).QuickPrice, { quotes, customers, ai: false, onOpenQuote: noop });
createRoot(document.getElementById('root')!).render(React.createElement('div', { className: 'max-w-3xl mx-auto px-4 py-5' }, el));
