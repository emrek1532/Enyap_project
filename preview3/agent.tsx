const fold = (s: string) => s.replace(/[İIı]/g,'i').replace(/[Şş]/g,'s').replace(/[Ğğ]/g,'g').replace(/[Üü]/g,'u').replace(/[Öö]/g,'o').replace(/[Çç]/g,'c').toLowerCase();
const CAT = [['AK2030','20-30 C TİPİ 14 MM AYARLI KELEPÇE',0,'TRY'],['AK2236','22-36 C TİPİ 14 MM AYARLI KELEPÇE TORK',0,'TRY']];
const of = window.fetch.bind(window);
(window as any).calls = [];
window.fetch = async (input: any, init?: any) => {
  const url = String(input?.url || input); (window as any).calls.push(url.replace(/^https?:\/\/[^/]+/, '').slice(0, 60));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/api/ai/agent')) return json({ error: 'quota' }, 429);
  if (url.includes('/rpc/search_materials')) { const b = JSON.parse(init.body); const toks = fold(b.q).split(/\s+/).filter(Boolean);
    return json(CAT.filter(([c, n]) => toks.every(k => fold(`${c} ${n}`).includes(k))).map(([code, name, price, currency]) => ({ code, name, price, currency, unit: 'Adet', vat_rate: 20, total: 1 }))); }
  if (url.includes('supabase.co')) return json([]);
  return of(input, init);
};
const it = (code: string, productName: string, unitPrice: number, discount: number) => ({ id: code, code, productName, quantity: 1, unit: 'Adet', unitPrice, discount, vatRate: 20, totalPrice: 0, currency: 'TRY' });
const quotes: any[] = [
  { id: 'q1', quoteNumber: '1', customerName: 'Gemfa Kazan', createdAt: '2026-10-23T09:00:00Z', currency: 'TRY', status: 'onaylandi', items: [it('AK2030', '20-30 C TİPİ 14 MM AYARLI KELEPÇE', 14, 0)] },
  { id: 'q2', quoteNumber: '2', customerName: 'Gemfa Kazan', createdAt: '2026-10-01T09:00:00Z', currency: 'TRY', status: 'onaylandi', items: [it('AK2236', '22-36 C TİPİ 14 MM AYARLI KELEPÇE TORK', 33.96, 55)] },
];
const { createRoot } = await import('react-dom/client');
await import('../src/index.css');
const { QuoteAgent } = await import('../src/components/QuoteAgent');
const React = await import('react');
createRoot(document.getElementById('root')!).render(React.createElement('div', { className: 'max-w-3xl mx-auto px-4 py-5' },
  React.createElement(QuoteAgent, { quotes, customers: [{ id: '1', name: 'Gemfa Kazan', city: 'Isparta' }] as any, onDraft: (d: any) => { (window as any).draft = d; } })));
