import { Quote, QuoteStatus } from '../types';

const DAY = 24 * 60 * 60 * 1000;

/** Henüz sonuçlanmamış (müşteriden yanıt / ofisten fiyat bekleyen) teklif durumları */
export const PENDING_STATUSES: QuoteStatus[] = ['yeni_talep', 'hazirlaniyor', 'gonderildi', 'revizyon'];

/** Beklemede kalan teklif için bu kadar günden sonra "müşteri ile tekrar görüş" uyarısı çıkar */
export const FOLLOW_UP_AFTER_DAYS = 3;

export const quoteAgeInDays = (q: Quote, now = Date.now()) =>
  Math.floor((now - new Date(q.createdAt).getTime()) / DAY);

/**
 * Bu tarihten önce girilen bekleyen tekliflerle işimiz kalmadı: yalnızca Beklemede görünürler,
 * "tekrar görüş" uyarısı sadece bu tarihten sonra girilen teklifler için çıkar.
 */
export const FOLLOW_UP_START = new Date('2026-10-06T22:05:00Z').getTime();

export const needsFollowUp = (q: Quote) =>
  PENDING_STATUSES.includes(q.status) &&
  new Date(q.createdAt).getTime() >= FOLLOW_UP_START &&
  quoteAgeInDays(q) >= FOLLOW_UP_AFTER_DAYS;


/** Otomatik teklif numarası: EK-<yıl>-<4 haneli sıra>, o yılın en büyük numarasının bir fazlası */
export function nextQuoteNumber(quotes: { quoteNumber?: string }[], date = new Date()): string {
  const year = date.getFullYear();
  const re = new RegExp(`^EK-${year}-(\\d+)$`, 'i');
  const max = quotes.reduce((m, q) => {
    const hit = re.exec((q.quoteNumber || '').trim());
    return hit ? Math.max(m, parseInt(hit[1], 10)) : m;
  }, 0);
  return `EK-${year}-${String(max + 1).padStart(4, '0')}`;
}
