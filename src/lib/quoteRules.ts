import { Quote, QuoteStatus } from '../types';
import { localDay } from './dates';

const DAY = 24 * 60 * 60 * 1000;

/** Henüz sonuçlanmamış (müşteriden yanıt bekleyen) teklif durumları */
export const PENDING_STATUSES: QuoteStatus[] = ['gonderildi'];

/**
 * Pasif: beklemedeki teklife "neden bekliyor" seçildi (Rakip daha ucuz, Proje ertelendi…); artık beklenmiyor.
 * Kayıtta durum "gonderildi" kalır; uygulama bekleyenlerde saymaz. "Müşteri düşünüyor" beklemede tutar.
 */
export const ACTIVE_REASONS = ['Müşteri düşünüyor'];
export const isPassive = (q: Pick<Quote, 'status' | 'lostReason'>) => {
  if (q.status !== 'gonderildi' || !q.lostReason) return false;
  const r = q.lostReason.split(' · ')[0];
  return !!r && !ACTIVE_REASONS.includes(r);
};
/** Gerçekten karar bekleyen teklif (pasifler hariç) */
export const isPendingQuote = (q: Pick<Quote, 'status' | 'lostReason'>) => PENDING_STATUSES.includes(q.status) && !isPassive(q);
/** Ekranda gösterilecek durum: pasifse 'pasif' */
export const viewStatus = (q: Pick<Quote, 'status' | 'lostReason'>): QuoteStatus | 'pasif' => (isPassive(q) ? 'pasif' : q.status);

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
  isPendingQuote(q) && (q.followUpAt
    ? q.followUpAt <= localDay()
    : new Date(q.createdAt).getTime() >= FOLLOW_UP_START && quoteAgeInDays(q) >= FOLLOW_UP_AFTER_DAYS);

/** Takip günü bugün ya da geçmiş (bekleyen tekliflerde) */
export const followDue = (q: Quote, today = localDay()) =>
  isPendingQuote(q) && !!q.followUpAt && q.followUpAt <= today;

/** Bugünden n gün sonrası (YYYY-MM-DD) */
export const plusDays = (n: number, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return localDay(d); };

/** İki gün arasındaki fark (b − a, gün) */
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** Geçerlilik: bekleyen teklifin süresinin dolmasına kaç gün var (eksi = doldu); süre yoksa null */
export const daysToExpiry = (q: Quote, today = localDay()): number | null =>
  isPendingQuote(q) && /^\d{4}-\d{2}-\d{2}/.test(q.validUntil || '') ? dayDiff(today, q.validUntil.slice(0, 10)) : null;

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

/** Revizyon eki: "69349-R2" → taban "69349", sıra 2 (eski usulde ayrı kayıt olarak girilen revizyonlar) */
const REV_RE = /\s*[-/ ]\s*R(\d+)$/i;
export const revBase = (no = '') => no.trim().replace(REV_RE, '');
export const revOf = (no = '') => Number(REV_RE.exec(no.trim())?.[1] || 0);

/** Ekranda/PDF'te gösterilen numara: düzenlenen teklif "69349-R1", "69349-R2"… (kayıttaki numara değişmez) */
export const quoteNo = (q: Pick<Quote, 'quoteNumber' | 'rev'>) =>
  q.rev ? `${revBase(q.quoteNumber)}-R${revOf(q.quoteNumber) + q.rev}` : q.quoteNumber;

/**
 * Üstüne yazılan teklifin revizyon sayısı (veritabanındaki quote_rev_bump tetikleyicisiyle aynı kural):
 * eski kayıtta kalem/tutar varken kalemler ya da tutar değiştiyse 1 artar. Ekranda hemen "-R1" görünsün diye.
 */
export const nextRev = (prev: Pick<Quote, 'items' | 'totalAmount' | 'rev'> | undefined, next: Pick<Quote, 'items' | 'totalAmount'>) => {
  const base = prev?.rev || 0;
  if (!prev || (!(prev.items?.length) && !prev.totalAmount)) return base;
  const changed = JSON.stringify(prev.items || []) !== JSON.stringify(next.items || []) || Number(prev.totalAmount || 0) !== Number(next.totalAmount || 0);
  return changed ? base + 1 : base;
};

/**
 * Aynı numaranın daha yeni revizyonu ayrı kayıt olarak girilmişse ("63470" → "63470-R1") eskisi geride kalır:
 * listelerde, bekleyenlerde ve raporlarda sayılmaz. Dönen harita: eski kayıt id → güncel kayıt.
 */
export function supersededMap(quotes: Quote[]): Map<string, Quote> {
  const groups = new Map<string, Quote[]>();
  for (const q of quotes) {
    const base = revBase(q.quoteNumber || '').toLocaleUpperCase('tr');
    if (!base) continue;
    const g = groups.get(base);
    if (g) g.push(q); else groups.set(base, [q]);
  }
  const out = new Map<string, Quote>();
  for (const g of groups.values()) {
    if (g.length < 2 || !g.some(q => revOf(q.quoteNumber) > 0)) continue;
    const live = g.reduce((a, b) => (revOf(b.quoteNumber) > revOf(a.quoteNumber) || (revOf(b.quoteNumber) === revOf(a.quoteNumber) && (b.createdAt || '') > (a.createdAt || '')) ? b : a));
    g.forEach(q => { if (q.id !== live.id) out.set(q.id, live); });
  }
  return out;
}

/** Onaylanmış, henüz "Siparişe aldım" denmemiş teklif (yalnız onay bilgisi kaydedilenler: approvedAt dolu) */
export const isOrderWaiting = (q: Quote) => q.status === 'onaylandi' && !!q.approvedAt && !q.processedAt;
