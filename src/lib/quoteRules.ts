import { Quote, QuoteStatus } from '../types';
import { localDay } from './dates';

const DAY = 24 * 60 * 60 * 1000;

/** Henüz sonuçlanmamış (müşteriden yanıt bekleyen) teklif durumları */
export const PENDING_STATUSES: QuoteStatus[] = ['gonderildi'];

/** Beklemede kalan teklif için bu kadar günden sonra "müşteri ile tekrar görüş" uyarısı çıkar */
export const FOLLOW_UP_AFTER_DAYS = 3;

export const quoteAgeInDays = (q: Quote, now = Date.now()) =>
  Math.floor((now - new Date(q.createdAt).getTime()) / DAY);

/**
 * Bu tarihten önce girilen bekleyen tekliflerle işimiz kalmadı: yalnızca Beklemede görünürler,
 * "tekrar görüş" uyarısı sadece bu tarihten sonra girilen teklifler için çıkar.
 */
export const FOLLOW_UP_START = new Date('2026-10-06T22:05:00Z').getTime();

/** Takip tarihi verilmişse o gün (ve sonrası) "tekrar görüş"; verilmemişse 3 gün kuralı */
export const needsFollowUp = (q: Quote) =>
  PENDING_STATUSES.includes(q.status) && (q.followUpAt
    ? q.followUpAt <= localDay()
    : new Date(q.createdAt).getTime() >= FOLLOW_UP_START && quoteAgeInDays(q) >= FOLLOW_UP_AFTER_DAYS);

/** Takip günü bugün ya da geçmiş (bekleyen tekliflerde) */
export const followDue = (q: Quote, today = localDay()) =>
  PENDING_STATUSES.includes(q.status) && !!q.followUpAt && q.followUpAt <= today;

/** Bugünden n gün sonrası (YYYY-MM-DD) */
export const plusDays = (n: number, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return localDay(d); };

/** İki gün arasındaki fark (b − a, gün) */
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** Geçerlilik: bekleyen teklifin süresinin dolmasına kaç gün var (eksi = doldu); süre yoksa null */
export const daysToExpiry = (q: Quote, today = localDay()): number | null =>
  PENDING_STATUSES.includes(q.status) && /^\d{4}-\d{2}-\d{2}/.test(q.validUntil || '') ? dayDiff(today, q.validUntil.slice(0, 10)) : null;

/** Süresi 3 gün içinde dolacak ya da son 30 günde dolmuş bekleyen teklif */
export const EXPIRY_WARN_DAYS = 3;
export const isExpiring = (q: Quote, today = localDay()) => {
  const d = daysToExpiry(q, today);
  return d !== null && d <= EXPIRY_WARN_DAYS && d >= -30;
};

/** Kart/satır için kısa etiket: "3 gün kaldı", "Bugün doluyor", "Süresi doldu" */
export const expiryLabel = (d: number) => (d > 0 ? `Süre ${d} gün` : d === 0 ? 'Süre bugün doluyor' : 'Süresi doldu');

/** Takip tarihi etiketi: "Bugün ara", "Yarın ara", "12.11 ara", gecikmişse "Arama gecikti" */
export const followLabel = (day: string, today = localDay()) => {
  const d = dayDiff(today, day);
  return d < 0 ? 'Arama gecikti' : d === 0 ? 'Bugün ara' : d === 1 ? 'Yarın ara' : `${day.slice(8, 10)}.${day.slice(5, 7)} ara`;
};


/** Otomatik teklif numarası: EK-<yıl>-<4 haneli sıra>, o yılın en büyük numarasının bir fazlası */
export function nextQuoteNumber(quotes: { quoteNumber?: string }[], date = new Date(), floor = 0): string {
  const year = date.getFullYear();
  const re = new RegExp(`^EK-${year}-(\\d+)$`, 'i');
  const max = quotes.reduce((m, q) => {
    const hit = re.exec((q.quoteNumber || '').trim());
    return hit ? Math.max(m, parseInt(hit[1], 10)) : m;
  }, floor);
  return `EK-${year}-${String(max + 1).padStart(4, '0')}`;
}

/** Bekleyen teklif neden bekliyor (iptal = sipariş olup sonradan iptal; ona neden sorulmaz) */
export const PENDING_REASONS = ['Fiyat yüksek', 'Rakip daha ucuz', 'Müşteri düşünüyor', 'Proje ertelendi', 'Teslim süresi', 'Diğer'] as const;

/** Neden ve not tek alanda tutulur: "Rakip daha ucuz · ABC Isı 45.000 TL" */
export const splitReason = (r?: string) => {
  const [reason, ...rest] = (r || '').split(' · ');
  return { reason: reason || '', note: rest.join(' · ') };
};
