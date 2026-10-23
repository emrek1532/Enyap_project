export type UserRole = 'isparta' | 'istanbul';

export type QuoteStatus =
  | 'gonderildi'      // Müşteriye iletildi, karar bekleniyor
  | 'onaylandi'       // Müşteri onayladı
  | 'iptal';          // Sipariş olup sonradan iptal edildi

export type UrgencyLevel = 'acil' | 'yuksek' | 'normal' | 'dusuk';

export type RequestChannel = 'whatsapp' | 'telefon' | 'ziyaret' | 'email';

export interface QuoteItem {
  id: string;
  /** Fiyat kataloğundaki malzeme kodu (varsa) */
  code?: string;
  productName: string;
  quantity: number;
  unit: 'Adet' | 'Metre' | 'Takım' | 'Paket' | 'Kg' | 'Set';
  unitPrice: number;
  discount: number; // percentage, e.g. 10
  vatRate: number;  // 20
  totalPrice: number;
  notes?: string;
  currency?: 'TRY' | 'USD' | 'EUR'; // kalemin para birimi (yoksa teklifinki)
}

export interface Quote {
  id: string;
  quoteNumber: string;
  customerName: string;
  customerContact?: string;
  customerPhone: string;
  city: string;
  projectLocation?: string;
  requestChannel: RequestChannel;
  urgency: UrgencyLevel;
  status: QuoteStatus;
  rawWhatsAppText?: string;
  items: QuoteItem[];
  totalAmount: number;
  currency: 'TRY' | 'USD' | 'EUR';
  validUntil: string;
  createdAt: string;
  updatedAt: string;
  createdBy: UserRole;
  assignedTo: UserRole;
  notes?: string;
  isEncrypted?: boolean;
  tags?: string[];
  preparedBy?: string;   // Teklifi veren kişi
  /** İptal edilen teklifin kaybedilme nedeni */
  lostReason?: string;
  amountUsd?: number;    // Döviz kırılımı (Excel'den aktarılan teklifler)
  amountEur?: number;
  amountTry?: number;
  totalUsd?: number;
  imported?: boolean;
  paymentTerm?: string;  // Ödeme / vade: PEŞİN, KREDİ KARTI, 60 GÜN, 90 GÜN
}

export interface QuickNote {
  id: string;
  content: string;
  author: UserRole;
  color: 'amber' | 'sky' | 'emerald' | 'rose' | 'purple';
  pinned: boolean;
  createdAt: string;
  updatedAt?: string;
  /** Hatırlatma zamanı (ISO); bu saatte telefona bildirim gider */
  remindAt?: string | null;
  /** Bildirim gönderildi mi (zaman değişince sıfırlanır) */
  remindedAt?: string | null;
  done?: boolean;
}

export interface ActivityLog {
  id: string;
  action: string;
  description: string;
  author: UserRole | string;
  timestamp: string;
  badgeColor?: string;
  actor?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  city: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  notes?: string;
  /** aktif (varsayılan), pasif veya kara_liste */
  status?: CustomerStatus;
  statusNote?: string;
  /** Mikro cari kodu ve son yüklenen bakiye (+ borçlu / − alacaklı) */
  mikroCode?: string;
  mikroTitle?: string;
  mikroBalance?: number | null;
  mikroBalanceDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type CustomerStatus = 'aktif' | 'pasif' | 'kara_liste';

/** Yapılan tahsilat (müşteriden alınan ödeme) */
export interface Collection {
  id: string;
  date: string;          // YYYY-MM-DD
  customerName: string;
  amount: number;
  currency: 'TRY' | 'USD' | 'EUR';
  method: string;        // Nakit, Havale/EFT, Kredi Kartı, Çek, Senet
  city?: string;
  bankName?: string;     // Çek / senet bilgileri
  bankBranch?: string;
  checkNo?: string;
  dueDate?: string;      // Vade (YYYY-MM-DD)
  description?: string;
  createdBy: UserRole;
  createdAt: string;
  updatedAt: string;
}

/** Yapılan harcama (gider) */
export interface Expense {
  id: string;
  date: string;          // YYYY-MM-DD
  category: string;      // Yakıt, Yemek, Konaklama, ...
  amount: number;
  currency: 'TRY' | 'USD' | 'EUR';
  method: string;        // UTTS, Kredi Kartı, Şahsi, Şirket...
  region?: string;       // Bölge / gezi (ör. KONYA BÖLGE)
  description?: string;
  createdBy: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  customers?: Customer[];
  collections?: Collection[];
  expenses?: Expense[];
  quotes: Quote[];
  notes: QuickNote[];
  activities: ActivityLog[];
  lastUpdated: string;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  pendingSync: boolean;
  error?: string | null;
}
