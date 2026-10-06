import { AppData } from '../types';

// Demo veri seti: 'Demo Verisini Yükle' ile Supabase'e yazılır.
export function getDemoData(): AppData {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const in3DaysStr = in3Days.toISOString().split('T')[0];

  const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const in5DaysStr = in5Days.toISOString().split('T')[0];

  return {
    quotes: [
      {
        id: 'qt-101',
        quoteNumber: 'EY-2026-0101',
        customerName: 'Gül Mühendislik & Tesisat',
        customerContact: 'Ahmet Gül',
        customerPhone: '0532 555 12 34',
        city: 'Isparta',
        projectLocation: 'Modern Evler Mah. 32 Konutluk Site Projesi',
        requestChannel: 'whatsapp',
        urgency: 'acil',
        status: 'yeni_talep',
        rawWhatsAppText: 'Selam Şakir Bey, Isparta Modern Evler projemiz için acil 32 adet 24 kW yoğuşmalı kombi ve 1600 mt 16x2 pex boru fiyatı lazım. Ofisteki arkadaşa geçebilirsen sevinirim.',
        items: [
          { id: 'item-1', productName: '24 kW Tam Yoğuşmalı Kombi (Enyap EcoHeat)', quantity: 32, unit: 'Adet', unitPrice: 22500, discount: 10, vatRate: 20, totalPrice: 648000, notes: 'Proje iskontolu' },
          { id: 'item-2', productName: '16x2 Oksijen Bariyerli Pex-A Boru', quantity: 1600, unit: 'Metre', unitPrice: 38, discount: 5, vatRate: 20, totalPrice: 57760, notes: 'Yerden ısıtma için' }
        ],
        totalAmount: 705760,
        currency: 'TRY',
        validUntil: in5DaysStr,
        createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
        createdBy: 'isparta',
        assignedTo: 'istanbul',
        notes: 'Müşteri pazartesiye kadar kesin fiyat bekliyor. Müteahhit onaylayacak.',
        isEncrypted: false,
        tags: ['Kombi', 'Pex Boru', 'Site Projesi']
      },
      {
        id: 'qt-102',
        quoteNumber: 'EY-2026-0102',
        customerName: 'Toros Isı & İklimlendirme',
        customerContact: 'Mehmet Toros',
        customerPhone: '0544 333 45 67',
        city: 'Burdur / Bucak',
        projectLocation: 'Sanayi Sitesi Atölye Isıtma',
        requestChannel: 'whatsapp',
        urgency: 'yuksek',
        status: 'hazirlaniyor',
        rawWhatsAppText: 'Şakir Hocam merhaba, Bucak mermer fabrikası atölyesi için 2 adet 150 kW kaskad kazan sistemi ve genleşme tankları teklifi istiyoruz.',
        items: [
          { id: 'item-3', productName: '150 kW Duvar Tipi Yoğuşmalı Kaskad Kazan', quantity: 2, unit: 'Adet', unitPrice: 115000, discount: 8, vatRate: 20, totalPrice: 211600, notes: 'Hidrolik ayırıcı dahil' },
          { id: 'item-4', productName: '200 Lt Kapalı Genleşme Deposu 10 Bar', quantity: 2, unit: 'Adet', unitPrice: 14500, discount: 5, vatRate: 20, totalPrice: 27550, notes: 'Emniyet ventilli' }
        ],
        totalAmount: 239150,
        currency: 'TRY',
        validUntil: in5DaysStr,
        createdAt: new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        createdBy: 'isparta',
        assignedTo: 'istanbul',
        notes: 'İstanbul ofiste Serkan Bey teklifi hazırlıyor, iskonto oranını fabrika satış müdürüne sordu.',
        isEncrypted: false,
        tags: ['Kaskad', 'Kazan', 'Fabrika']
      },
      {
        id: 'qt-103',
        quoteNumber: 'EY-2026-0103',
        customerName: 'Akdeniz Tesisat Market',
        customerContact: 'Hasan Bey',
        customerPhone: '0533 888 99 00',
        city: 'Antalya / Manavgat',
        projectLocation: 'Otel Renovasyon İşi',
        requestChannel: 'telefon',
        urgency: 'normal',
        status: 'gonderildi',
        rawWhatsAppText: '',
        items: [
          { id: 'item-5', productName: 'DN50 Statik Balans Vanası', quantity: 18, unit: 'Adet', unitPrice: 4200, discount: 15, vatRate: 20, totalPrice: 64260, notes: 'Flanşlı tip' },
          { id: 'item-6', productName: 'Termostatik Radyatör Vanası 1/2"', quantity: 120, unit: 'Adet', unitPrice: 480, discount: 12, vatRate: 20, totalPrice: 50688, notes: 'Sıvı sensörlü' }
        ],
        totalAmount: 114948,
        currency: 'TRY',
        validUntil: in3DaysStr,
        createdAt: new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
        createdBy: 'isparta',
        assignedTo: 'isparta',
        notes: 'Teklif PDF olarak WhatsApp üzerinden müşteriye iletildi. Cuma günü karar verecekler.',
        isEncrypted: false,
        tags: ['Vana', 'Balans', 'Otel']
      },
      {
        id: 'qt-104',
        quoteNumber: 'EY-2026-0104',
        customerName: 'Davraz Doğalgaz Mühendislik',
        customerContact: 'Kemal Bey',
        customerPhone: '0505 444 33 22',
        city: 'Isparta / Merkez',
        projectLocation: 'Çünür Yeni Yerleşim Bölgesi',
        requestChannel: 'ziyaret',
        urgency: 'acil',
        status: 'onaylandi',
        rawWhatsAppText: '',
        items: [
          { id: 'item-7', productName: '600x1000 Panel Radyatör PKKP Tip 22', quantity: 45, unit: 'Adet', unitPrice: 1950, discount: 12, vatRate: 20, totalPrice: 77220, notes: 'Konsol ve pürjör dahil' },
          { id: 'item-8', productName: 'Yerden Isıtma Kollektör Seti 8 Ağızlı', quantity: 6, unit: 'Takım', unitPrice: 6200, discount: 10, vatRate: 20, totalPrice: 33480, notes: 'Debimetreli paslanmaz' }
        ],
        totalAmount: 110700,
        currency: 'TRY',
        validUntil: todayStr,
        createdAt: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
        createdBy: 'isparta',
        assignedTo: 'istanbul',
        notes: 'Müşteri avansı havale etti! Siparişe dönüştürüldü, hemen sevk planlaması gerekiyor.',
        isEncrypted: false,
        tags: ['Radyatör', 'Kollektör']
      }
    ],
    orders: [
      {
        id: 'ord-201',
        orderNumber: 'SP-2026-0042',
        quoteId: 'qt-104',
        quoteNumber: 'EY-2026-0104',
        customerName: 'Davraz Doğalgaz Mühendislik',
        customerContact: 'Kemal Bey',
        customerPhone: '0505 444 33 22',
        deliveryAddress: 'Çünür Mah. 102. Cad. No:14 Isparta Merkez',
        city: 'Isparta',
        itemsSummary: '45 Adet 600x1000 Radyatör, 6 Takım 8 Ağızlı Debimetreli Kollektör Seti',
        totalAmount: 110700,
        currency: 'TRY',
        orderDate: todayStr,
        targetShippingDate: tomorrowStr,
        actualShippingDate: '',
        carrierCompany: 'Isparta Öz Ambar Nakliyat (İstanbul Dudullu Depo)',
        trackingNumber: 'AMB-78921',
        driverContact: 'Kamyon Şoförü Mustafa Usta - 0532 999 11 22',
        status: 'depoda_hazir',
        statusNotes: 'Ürünler İstanbul depoda paletlendi ve ambar fişi kesildi. Yarın sabah erkenden araca yüklenecek.',
        createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
        createdBy: 'istanbul'
      },
      {
        id: 'ord-202',
        orderNumber: 'SP-2026-0039',
        quoteId: '',
        quoteNumber: 'EY-2026-0088',
        customerName: 'Eğirdir Meyve Entegre Tesisleri',
        customerContact: 'Süleyman Bey',
        customerPhone: '0536 777 44 11',
        deliveryAddress: 'Eğirdir Yolu 12. km Soğuk Hava Deposu / Isparta',
        city: 'Isparta',
        itemsSummary: '2 Adet 200 kW Plakalı Eşanjör, 4 Adet Sirkülasyon Pompası',
        totalAmount: 185000,
        currency: 'TRY',
        orderDate: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString().split('T')[0],
        targetShippingDate: todayStr,
        actualShippingDate: todayStr,
        carrierCompany: 'Yurtiçi Kargo Ağır Yük / Palet',
        trackingNumber: 'YK-948210488',
        driverContact: '',
        status: 'sevk_edildi',
        statusNotes: 'İstanbul Tuzla depodan kamyona teslim edildi, tahmini teslimat yarın öğlen 14:00.',
        createdAt: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
        createdBy: 'istanbul'
      }
    ],
    events: [
      {
        id: 'ev-301',
        title: 'Modern Evler Şantiye Ziyareti & Keşif',
        date: todayStr,
        time: '14:30',
        category: 'saha_ziyaret',
        relatedEntity: { type: 'quote', id: 'qt-101', name: 'Gül Mühendislik' },
        location: 'Isparta Modern Evler Şantiyesi',
        assignedUser: 'isparta',
        completed: false,
        notes: 'Şantiye şefiyle borulama güzergahı ve kombi baca yerleri kontrol edilecek.',
        reminder: true,
        createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ev-302',
        title: 'Davraz Doğalgaz Sevkiyatı Karşılama',
        date: tomorrowStr,
        time: '10:00',
        category: 'sevkiyat',
        relatedEntity: { type: 'order', id: 'ord-201', name: 'Davraz Doğalgaz' },
        location: 'Isparta Ambarlar Sitesi',
        assignedUser: 'all',
        completed: false,
        notes: 'İstanbul ambarından gelecek radyatör ve kollektör paletleri teslim alınıp müşteriye teslim edilecek.',
        reminder: true,
        createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ev-303',
        title: 'Akdeniz Tesisat Karar Arama Takibi',
        date: in3DaysStr,
        time: '11:00',
        category: 'musteri_takip',
        relatedEntity: { type: 'quote', id: 'qt-103', name: 'Akdeniz Tesisat' },
        location: 'Telefon Görüşmesi',
        assignedUser: 'isparta',
        completed: false,
        notes: 'Hasan Bey ile teklif neticelendirme görüşmesi. Fiyatta küçük bir esneme isteyebilir.',
        reminder: true,
        createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ev-304',
        title: 'İstanbul Ofis - Haftalık Sevkiyat & Sipariş Koordinasyonu',
        date: in5DaysStr,
        time: '09:30',
        category: 'genel',
        relatedEntity: undefined,
        location: 'Online Toplantı (Google Meet / Telefon)',
        assignedUser: 'all',
        completed: false,
        notes: 'Önümüzdeki hafta sevk edilecek malzeme listesi ve hammadde terminleri konuşulacak.',
        reminder: true,
        createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString()
      }
    ],
    notes: [
      {
        id: 'nt-401',
        content: 'Burdur OSB mermer fabrikası kaskad sistemi için Serkan Bey ile mutabık kalındı. 150 kW kaskad kazanların stokta olduğu teyit edildi.',
        author: 'isparta',
        color: 'amber',
        pinned: true,
        createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'nt-402',
        content: 'Isparta ambarı bu hafta perşembe ve cumartesi günü sevkiyat yapacak. Acil yükleri çarşamba akşamından depodan çıkartalım.',
        author: 'istanbul',
        color: 'sky',
        pinned: true,
        createdAt: new Date(now.getTime() - 16 * 60 * 60 * 1000).toISOString()
      }
    ],
    activities: [
      {
        id: 'act-501',
        action: 'Yeni Teklif Talebi',
        description: 'Şakir Emre (Isparta), Gül Mühendislik için 32 kombi teklifi açtı.',
        author: 'isparta',
        timestamp: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
        badgeColor: 'sky'
      },
      {
        id: 'act-502',
        action: 'Sipariş Hazırlandı',
        description: 'İstanbul ofis, Davraz Doğalgaz siparişini depoda hazırladı.',
        author: 'istanbul',
        timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
        badgeColor: 'emerald'
      }
    ],
    lastUpdated: new Date().toISOString()
  };
}
