import { Quote, QuoteStatus } from '../types';

const DAY = 24 * 60 * 60 * 1000;

/** Henüz sonuçlanmamış (müşteriden yanıt / ofisten fiyat bekleyen) teklif durumları */
export const PENDING_STATUSES: QuoteStatus[] = ['yeni_talep', 'hazirlaniyor', 'gonderildi', 'revizyon'];

/** Beklemede kalan teklif bu kadar günden sonra arşive alınır */
export const ARCHIVE_AFTER_DAYS = 7;
/** Beklemede kalan teklif için bu kadar günden sonra "müşteri ile tekrar görüş" uyarısı çıkar */
export const FOLLOW_UP_AFTER_DAYS = 3;

export const quoteAgeInDays = (q: Quote, now = Date.now()) =>
  Math.floor((now - new Date(q.createdAt).getTime()) / DAY);

export const needsFollowUp = (q: Quote) =>
  PENDING_STATUSES.includes(q.status) && quoteAgeInDays(q) >= FOLLOW_UP_AFTER_DAYS;

/** Müşteriye gönderilip 7 günü aşan teklifler (Excel'deki "Beklemede") arşive gider */
export const shouldArchive = (q: Quote) =>
  q.status === 'gonderildi' && quoteAgeInDays(q) > ARCHIVE_AFTER_DAYS;
