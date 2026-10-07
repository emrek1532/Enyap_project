import { Quote, QuoteItem } from '../types';

export type Currency = Quote['currency'];

export const CURRENCY_LABEL: Record<Currency, string> = { TRY: 'TL', USD: 'USD', EUR: 'EUR' };

export const itemCurrency = (it: QuoteItem, q?: Quote): Currency => it.currency || q?.currency || 'TRY';

const fmt = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** Teklif tutarını döviz kırılımıyla parçalar: ["12.000 TL", "500 USD"] */
export const quoteAmountParts = (q: Quote): string[] => {
  if (!q.imported && ((q.amountUsd || 0) > 0 || (q.amountEur || 0) > 0)) {
    const parts: string[] = [];
    if ((q.amountTry || 0) > 0) parts.push(`${fmt(q.amountTry!)} TL`);
    if ((q.amountUsd || 0) > 0) parts.push(`${fmt(q.amountUsd!)} USD`);
    if ((q.amountEur || 0) > 0) parts.push(`${fmt(q.amountEur!)} EUR`);
    return parts;
  }
  return [`${fmt(q.totalAmount || 0)} ${q.imported ? 'TL' : CURRENCY_LABEL[q.currency || 'TRY']}`];
};

/** Teklif tutarını tek satırda yazar: "12.000 TL + 500 USD" */
export const formatQuoteAmount = (q: Quote): string => quoteAmountParts(q).join(' + ');

export const hasAmount = (q: Quote) =>
  (q.totalAmount || 0) > 0 || (q.amountUsd || 0) > 0 || (q.amountEur || 0) > 0;
