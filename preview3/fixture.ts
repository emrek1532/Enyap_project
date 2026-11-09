// Deneme sayfaları için gerçek dağılıma benzeyen sahte veri (yalnız geliştirme; gerçek kayıt içermez)
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const iso = (d: Date) => d.toISOString();
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const CITY_W: [string, number][] = [['Isparta', 169], ['Afyonkarahisar', 93], ['Burdur', 66], ['Antalya', 20], ['Konya', 11], ['Niğde', 8], ['Uşak', 6], ['Eskişehir', 3], ['Kırşehir', 2], ['Denizli', 2], ['Nevşehir', 1], ['Bursa', 1]];
const cityPick = () => { let r = rnd() * 382; for (const [c, w] of CITY_W) { r -= w; if (r <= 0) return c; } return 'Isparta'; };
const NAMES = ['Enorpa Enerji', 'Afyon Mekanik Mühendislik', 'Murat Doğalgaz', 'Özer Tesisat', 'Gemfa Kazan', 'Kozanlar Jeotermal', 'Emin Mekanik', 'Konaklı Es Yapı', 'Duyar Isıtma', 'Yıldız Tesisat', 'Akdeniz Isı', 'Ege Mekanik', 'Burdur Termo', 'Göller Yapı', 'Toros Enerji', 'Anadolu Isı', 'Sultan Mekanik', 'Eğirdir Tesisat', 'Uşak Termik', 'Niğde Doğalgaz'];
const firms = NAMES.map(n => ({ name: n, city: cityPick() }));
// Ay: [ay farkı, adet, TL toplam, onay oranı]
const MONTHS: [number, number, number, number][] = [[-8, 58, 6.0e6, .76], [-7, 77, 23e6, .57], [-6, 62, 9.9e6, .72], [-5, 94, 39e6, .69], [-4, 64, 9.5e6, .9], [-3, 75, 14.9e6, .81], [-2, 98, 7.9e6, .96], [-1, 134, 23.3e6, .64], [0, 23, 5.6e6, .74]];
export const quotes: any[] = [];
let no = 69000;
for (const [off, n, sum, ok] of MONTHS) {
  const y = now.getFullYear(), m = now.getMonth() + off;
  const days = off === 0 ? now.getDate() : new Date(y, m + 1, 0).getDate();
  const ws = Array.from({ length: n }, () => Math.pow(rnd(), 3) + 0.02);
  const tw = ws.reduce((a, b) => a + b, 0);
  ws.forEach((w, i) => {
    const f = pick(firms);
    const d = new Date(y, m, 1 + Math.floor(rnd() * days), 9 + Math.floor(rnd() * 8));
    const status = rnd() < ok ? 'onaylandi' : rnd() < 0.03 ? 'iptal' : 'gonderildi';
    quotes.push({ id: 'q' + no, quoteNumber: String(no++), customerName: f.name, city: f.city, createdAt: iso(d), updatedAt: iso(d), ...(rnd() < 0.05 ? { currency: 'USD', totalAmount: Math.round((sum * w) / tw / 42) } : { currency: 'TRY', totalAmount: Math.round((sum * w) / tw) }), status, items: [], requestChannel: 'whatsapp', urgency: 'normal', validUntil: '', createdBy: 'isparta', assignedTo: 'isparta' });
  });
}
quotes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const customers: any[] = firms.map((f, i) => ({ id: 'c' + i, name: f.name, city: f.city, status: 'aktif', ...(i % 3 === 0 ? { lastVisit: '2026-11-0' + (1 + (i % 8)) } : {}), mikroBalance: Math.round((rnd() - 0.2) * 900000), createdAt: iso(now), updatedAt: iso(now) }));
export const collections: any[] = Array.from({ length: 371 }, (_, i) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Math.floor(rnd() * 240));
  const method = i < 351 ? 'Çek' : pick(['Nakit', 'Senet', 'Havale/EFT', 'Kredi Kartı']);
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 30 + Math.floor(rnd() * 200));
  return { id: 'col' + i, date: ymdOf(d), customerName: pick(firms).name, amount: Math.round(20000 + Math.pow(rnd(), 2) * 380000), currency: 'TRY', method, bankName: method === 'Çek' ? pick(['Ziraat', 'Halkbank', 'Vakıfbank', 'İş Bankası']) : '', checkNo: method === 'Çek' ? String(100000 + i) : '', dueDate: method === 'Çek' || method === 'Senet' ? ymdOf(due) : undefined, createdBy: 'isparta', createdAt: iso(d), updatedAt: iso(d) };
});
export const expenses: any[] = Array.from({ length: 140 }, (_, i) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Math.floor(rnd() * 240));
  return { id: 'e' + i, date: ymdOf(d), category: pick(['Yakıt', 'Yemek', 'Konaklama', 'Otoyol', 'Diğer']), amount: Math.round(300 + rnd() * 4500), currency: 'TRY', method: pick(['UTTS', 'Kredi Kartı', 'Şahsi']), region: pick(['ISPARTA', 'KONYA BÖLGE', 'AFYON']), createdBy: 'isparta', createdAt: iso(d), updatedAt: iso(d) };
});
export const notes: any[] = ['Gemfa fiyat dönüşü bekleniyor', 'Afyon şantiye ziyareti salı', 'Wilo yeni katalog geldi', 'Çek takibi: Enorpa', 'Pazartesi toplantı', 'Numune gönder'].map((content, i) => ({ id: 'n' + i, content, author: 'isparta', color: ['amber', 'sky', 'emerald', 'rose', 'purple', 'amber'][i], pinned: i === 0, createdAt: iso(now), updatedAt: iso(now) }));
export const activities: any[] = [];
