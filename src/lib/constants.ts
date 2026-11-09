// Küçük ortak sabitler: büyük ekran dosyaları (Tahsilat/Harcama, teklif formu, cari kart) yalnız
// açılınca yüklensin diye sabitler burada; başka dosyalar bunları buradan alır.
import type { QuoteStatus } from '../types';

export const EXPENSE_METHODS = ['Kredi Kartı **9973', 'UTTS', 'Şahsi', 'Şirket', 'Nakit', 'Havale/EFT'];
// Harcama türleri (Google Sheet "Harcamalar" ile aynı); ayrıntı (şehir, gece, otopark…) açıklamaya yazılır
export const EXPENSE_CATEGORIES = ['Yemek', 'Yakıt', 'İkramlık', 'Konaklama', 'Adblue', 'Diğer'];
/** Çek bankaları (öneri listesi; kayıtlardaki yazımlarla uyumlu) */
export const BANKS = [
  'Halkbank', 'Ziraat Bankası', 'Vakıfbank', 'Garanti Bankası', 'İş Bankası', 'Yapı Kredi', 'Akbank',
  'QNB Bank', 'Denizbank', 'TEB Bankası', 'Kuveyttürk', 'Vakıf Katılım', 'Ziraat Katılım', 'Emlak Katılım',
  'Türkiye Finans', 'Albaraka Bankası', 'Şekerbank', 'ING Bank', 'HSBC', 'Fibabanka', 'Odeabank',
  'Anadolubank', 'Alternatif Bank', 'Burgan Bank', 'ICBC Turkey', 'Enpara',
];

/** Teklif vade seçenekleri */
export const PAYMENT_TERMS = ['PEŞİN', 'KREDİ KARTI', '60 GÜN', '90 GÜN'];

export const STATUS_LABEL: Record<QuoteStatus | 'pasif', { label: string; cls: string }> = {
  gonderildi: { label: 'Beklemede', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  onaylandi: { label: 'Onaylandı', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  iptal: { label: 'İptal', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pasif: { label: 'Pasif', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
};
