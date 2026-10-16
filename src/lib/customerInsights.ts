import { Collection, Customer, CustomerStatus, Quote } from '../types';
import { PENDING_STATUSES } from './quoteRules';
import { Rates, quoteTry } from './rates';

/** Firma adı eşleştirme: büyük/küçük harf ve Türkçe karakter farkı gözetmez */
export const foldName = (s: string) =>
  s.trim().toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

export const CUSTOMER_STATUS: Record<CustomerStatus, { label: string; cls: string }> = {
  aktif: { label: 'Aktif', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pasif: { label: 'Pasif', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
  kara_liste: { label: 'Kara liste', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const statusOf = (c?: Customer): CustomerStatus => c?.status || 'aktif';

const isWon = (q: Quote) => q.status === 'onaylandi' || q.status === 'siparis';
const DAY = 864e5;
const daysSince = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
const tl = (v: number) => `${Math.round(v).toLocaleString('tr-TR')} TL`;

export type Segment = 'altin' | 'iyi' | 'gelisen' | 'zayif' | 'yeni';
export const SEGMENT: Record<Segment, { label: string; cls: string; bar: string }> = {
  altin: { label: 'Altın müşteri', cls: 'bg-amber-50 text-amber-800 border-amber-200', bar: 'bg-amber-400' },
  iyi: { label: 'İyi', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500' },
  gelisen: { label: 'Geliştirilebilir', cls: 'bg-brand-50 text-brand-700 border-brand-200', bar: 'bg-brand-500' },
  zayif: { label: 'Zayıf', cls: 'bg-slate-100 text-slate-600 border-slate-300', bar: 'bg-slate-400' },
  yeni: { label: 'Yeni', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200', bar: 'bg-cyan-500' },
};

export interface Evaluation {
  quoteCount: number;
  quoteTotal: number;
  wonCount: number;
  wonTotal: number;
  /** Tutar bazında onay oranı (0-1), sonuçlanmış teklifler üzerinden */
  winRate: number;
  decidedCount: number;
  pendingCount: number;
  pendingTotal: number;
  /** En büyük bekleyen teklif */
  bigPending?: { quote: Quote; value: number; days: number };
  revision: Quote[];
  lastQuoteDays: number | null;
  firstQuoteDays: number | null;
  last12Count: number;
  collected: number;
  score: number;
  segment: Segment;
}

/** Bir firmanın tekliflerine, siparişlerine ve tahsilatlarına göre değerlendirmesi */
export function evaluate(quotes: Quote[], collections: Collection[], rates: Rates, maxWon: number, now = Date.now()): Evaluation {
  const live = quotes.filter(q => q.status !== 'iptal' && q.status !== 'arsiv');
  const won = live.filter(isWon);
  const pending = live.filter(q => PENDING_STATUSES.includes(q.status));
  const v = (q: Quote) => quoteTry(q, rates);
  const quoteTotal = live.reduce((s, q) => s + v(q), 0);
  const wonTotal = won.reduce((s, q) => s + v(q), 0);
  const dates = live.map(q => q.createdAt).filter(Boolean).sort();
  const lastQuoteDays = dates.length ? daysSince(dates[dates.length - 1], now) : null;
  const firstQuoteDays = dates.length ? daysSince(dates[0], now) : null;
  const last12Count = live.filter(q => q.createdAt && daysSince(q.createdAt, now) <= 365).length;
  const big = pending.map(q => ({ quote: q, value: v(q), days: daysSince(q.createdAt, now) })).sort((a, b) => b.value - a.value)[0];
  // Onay oranı yalnızca sonuçlanmış tekliflerden: onaylanan + iptal + 90 günden eski bekleyen
  const decided = [...won, ...quotes.filter(q => q.status === 'iptal'), ...pending.filter(q => daysSince(q.createdAt, now) > 90)];
  const decidedTotal = decided.reduce((s, q) => s + v(q), 0);
  const winRate = decidedTotal ? wonTotal / decidedTotal : 0;

  // Puan (0-100): onay oranı 40, onaylı ciro 30 (en iyi müşteriye göre, logaritmik), güncellik 20, sıklık 10
  const pRate = winRate * 40;
  const pVol = maxWon > 0 && wonTotal > 0 ? (Math.log10(1 + wonTotal) / Math.log10(1 + maxWon)) * 30 : 0;
  const pRecent = lastQuoteDays == null ? 0 : lastQuoteDays <= 30 ? 20 : lastQuoteDays <= 90 ? 15 : lastQuoteDays <= 180 ? 9 : lastQuoteDays <= 365 ? 4 : 0;
  const pFreq = Math.min(10, last12Count * 2);
  const score = Math.round(pRate + pVol + pRecent + pFreq);

  const segment: Segment =
    live.length <= 2 && (firstQuoteDays ?? 999) <= 90 && !won.length ? 'yeni'
      : score >= 70 ? 'altin' : score >= 50 ? 'iyi' : score >= 30 ? 'gelisen' : 'zayif';

  return {
    quoteCount: live.length, quoteTotal, wonCount: won.length, wonTotal, winRate, decidedCount: decided.length,
    pendingCount: pending.length, pendingTotal: pending.reduce((s, q) => s + v(q), 0),
    bigPending: big && big.value > 0 ? big : undefined,
    revision: pending.filter(q => q.status === 'revizyon'),
    lastQuoteDays, firstQuoteDays, last12Count,
    collected: collections.filter(c => (c.currency || 'TRY') === 'TRY').reduce((s, c) => s + (c.amount || 0), 0),
    score, segment,
  };
}

export interface Advice { kind: 'firsat' | 'takip' | 'fiyat' | 'kazan' | 'sadakat' | 'odeme' | 'yeni' | 'risk'; title: string; text: string; quote?: Quote }

/** Kurallara dayalı aksiyon önerileri (en önemliden başlayarak) */
export function adviseFor(ev: Evaluation, status: CustomerStatus, balance?: number | null): Advice[] {
  const out: Advice[] = [];
  if (status === 'kara_liste') {
    out.push({ kind: 'risk', title: 'Kara listede', text: 'Yeni teklif vermeden önce peşin ödeme veya teminat (çek/senet) isteyin; vadeli satış yapmayın.' });
  }
  if (status === 'pasif') {
    out.push({ kind: 'kazan', title: 'Pasif müşteri', text: 'Tekrar çalışmak isterseniz kısa bir arama ile ihtiyaçlarını sorun, ardından durumunu aktife alın.' });
  }
  const pct = Math.round(ev.winRate * 100);
  if (ev.bigPending) {
    const { value, days, quote } = ev.bigPending;
    if (days >= 14) out.push({ kind: 'takip', quote, title: `${tl(value)} teklif ${days} gündür kararda`,
      text: 'Telefonla arayıp karar sürecini sorun. Fiyat engeli varsa ödeme vadesi, alternatif marka ya da kademeli teslimat önerin; teklif geçerlilik tarihini hatırlatın.' });
    else out.push({ kind: 'firsat', quote, title: `Sıcak fırsat: ${tl(value)}`,
      text: `Teklif ${days} gün önce verildi. 2-3 gün içinde dönüş alın; ${ev.wonCount ? `bu firma tutar olarak tekliflerin %${pct}'ini onaylıyor, hızlı ilgi kazandırır.` : 'ilk iş için küçük bir indirim veya ücretsiz keşif/montaj desteği kapıyı açabilir.'}` });
  }
  if (ev.revision.length) out.push({ kind: 'takip', quote: ev.revision[0], title: `${ev.revision.length} teklif revizyon bekliyor`,
    text: 'Revize teklifi aynı gün gönderin; neyin değiştiğini kısa bir notla belirtin.' });
  if (ev.decidedCount >= 5 && ev.winRate < 0.15) out.push({ kind: 'fiyat', title: `Onay oranı düşük (%${pct})`,
    text: 'Bu firma fiyat karşılaştırıyor olabilir. Kaybedilen tekliflerde rakip fiyatı/markayı sorun; ekonomik seçenekli (iki fiyatlı) teklif hazırlayın.' });
  if (ev.wonTotal > 0 && (ev.lastQuoteDays ?? 0) >= 120) out.push({ kind: 'kazan', title: `${Math.floor((ev.lastQuoteDays ?? 0) / 30)} aydır teklif yok`,
    text: `Geçmişte ${tl(ev.wonTotal)} iş yapıldı. Ziyaret veya arama planlayın; sezon öncesi bakım/yenileme kampanyası ya da yeni ürün bilgisi paylaşın.` });
  if (ev.segment === 'altin') out.push({ kind: 'sadakat', title: 'En değerli müşterilerden',
    text: 'Özel fiyat listesi, öncelikli teslimat veya yıllık anlaşma teklif edin; yılda bir yüz yüze ziyaret ilişkiyi güçlendirir.' });
  if (balance != null && balance >= 50000) out.push({ kind: 'odeme', title: `Açık bakiye ${tl(balance)}`,
    text: 'Ödeme planını konuşun; vadesi geçen tutar varsa yeni siparişi ödemeye bağlayın. WhatsApp\'tan hazır ödeme hatırlatması gönderebilirsiniz.' });
  if (balance == null && ev.wonTotal > 0 && ev.collected > 0 && ev.collected < ev.wonTotal * 0.6) out.push({ kind: 'odeme', title: 'Tahsilat onaylı işlerin gerisinde',
    text: `Onaylı ${tl(ev.wonTotal)} işe karşılık ${tl(ev.collected)} tahsilat görünüyor. Cari bakiyeyi kontrol edip ödeme planı konuşun.` });
  if (ev.segment === 'yeni') out.push({ kind: 'yeni', title: 'Yeni müşteri',
    text: 'Teklifin ardından tanışma ziyareti yapın; tamamlanmış işlerinizden referans ve fotoğraf paylaşın.' });
  if (!out.length && ev.quoteCount === 0) out.push({ kind: 'yeni', title: 'Henüz teklif verilmedi', text: 'İhtiyaçlarını öğrenmek için kısa bir arama yapın ve keşif önerin.' });
  return out.slice(0, 4);
}
