export type UserRole = 'isparta' | 'istanbul';

export type QuoteStatus = 
  | 'yeni_talep'      // Isparta'dan iletildi, ofis teklif hazırlığı bekliyor
  | 'hazirlaniyor'    // Ofis üzerinde çalışıyor (fiyatlandırma/maliyet)
  | 'gonderildi'      // Müşteriye WhatsApp/Mail ile iletildi, karar bekleniyor
  | 'onaylandi'       // Müşteri onayladı! (Siparişe aktarılabilir)
  | 'revizyon'        // Revizyon / İskonto pazarlığı
  | 'iptal'           // İptal / Başka firmadan alındı
  | 'siparis'         // Siparişe dönüştürüldü (teklif listesinden düşer)
  | 'arsiv';          // 7 günden uzun süre beklemede kalan teklif

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
  amountUsd?: number;    // Döviz kırılımı (Excel'den aktarılan teklifler)
  amountEur?: number;
  amountTry?: number;
  totalUsd?: number;
  imported?: boolean;
  paymentTerm?: string;  // Ödeme / vade: PEŞİN, KREDİ KARTI, 60 GÜN, 90 GÜN
}

export type OrderStatus = 
  | 'hazirlaniyor'     // Sipariş onaylandı, malzeme toplanıyor
  | 'depoda_hazir'    // İstanbul depoda paketlendi/hazır
  | 'sevk_edildi'     // Ambar/Kargoya verildi, yolda
  | 'teslim_edildi'   // Isparta'da müşteriye/şantiyeye ulaştı
  | 'gecikmeli';      // Gecikme uyarısı

export interface Order {
  id: string;
  orderNumber: string;
  quoteId?: string;
  quoteNumber?: string;
  customerName: string;
  customerContact?: string;
  customerPhone: string;
  deliveryAddress: string;
  city: string;
  itemsSummary: string;
  totalAmount: number;
  currency: 'TRY' | 'USD' | 'EUR';
  orderDate: string;
  targetShippingDate: string; // Ne zaman sevk olacağı (kritik takip alanı!)
  actualShippingDate?: string;
  carrierCompany: string; // Nakliye firması / Ambar / Yurtiçi Kargo vb.
  trackingNumber?: string; // İrsaliye no veya ambar takip no
  driverContact?: string;
  status: OrderStatus;
  statusNotes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: UserRole;
}

export type EventCategory = 
  | 'saha_ziyaret'   // Isparta şantiye / müşteri ziyareti
  | 'musteri_takip'  // Teklif takip telefon görüşmesi
  | 'sevkiyat'       // İstanbul'dan sevk edilecek malzeme
  | 'odeme'          // Çek / Vade / Avans takibi
  | 'kritik'         // Acil iş
  | 'genel';         // Genel şirket notu

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  category: EventCategory;
  relatedEntity?: {
    type: 'quote' | 'order';
    id: string;
    name: string;
  };
  location?: string;
  assignedUser: 'all' | 'isparta' | 'istanbul';
  completed: boolean;
  notes?: string;
  reminder?: boolean;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
}

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
  orders: Order[];
  events: CalendarEvent[];
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
