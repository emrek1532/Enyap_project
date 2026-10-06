import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial seed data representing real Enyap Isı Sistemleri workflow
const getInitialData = () => {
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
};

// Load or initialize DB
const loadDB = () => {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(content);
      if (data && data.quotes) {
        return data;
      }
    }
  } catch (err) {
    console.error('Error loading DB file, fallback to initial data:', err);
  }
  const initial = getInitialData();
  saveDB(initial);
  return initial;
};

const saveDB = (data: any) => {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving DB file:', err);
  }
};

// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API ROUTES
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Enyap Isı Takip Portalı API', time: new Date().toISOString() });
});

app.get('/api/data', (req: Request, res: Response) => {
  const db = loadDB();
  res.json(db);
});

// Full Sync endpoint: Merges client state with server state
app.post('/api/sync', (req: Request, res: Response) => {
  const incoming = req.body;
  const current = loadDB();

  // Helper merge function by ID and latest updatedAt
  const mergeLists = (serverList: any[] = [], clientList: any[] = []) => {
    const map = new Map<string, any>();
    
    serverList.forEach((item) => {
      map.set(item.id, item);
    });

    clientList.forEach((cItem) => {
      if (!cItem || !cItem.id) return;
      const sItem = map.get(cItem.id);
      if (!sItem) {
        map.set(cItem.id, cItem);
      } else {
        const clientDate = new Date(cItem.updatedAt || cItem.createdAt || 0).getTime();
        const serverDate = new Date(sItem.updatedAt || sItem.createdAt || 0).getTime();
        if (clientDate >= serverDate) {
          map.set(cItem.id, cItem);
        }
      }
    });

    return Array.from(map.values());
  };

  const mergedQuotes = mergeLists(current.quotes, incoming.quotes);
  const mergedOrders = mergeLists(current.orders, incoming.orders);
  const mergedEvents = mergeLists(current.events, incoming.events);
  const mergedNotes = mergeLists(current.notes, incoming.notes);

  // Combine activities and sort by timestamp desc, keep latest 50
  const actMap = new Map<string, any>();
  [...(current.activities || []), ...(incoming.activities || [])].forEach((act) => {
    if (act && act.id) actMap.set(act.id, act);
  });
  const mergedActivities = Array.from(actMap.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50);

  const updatedDB = {
    quotes: mergedQuotes,
    orders: mergedOrders,
    events: mergedEvents,
    notes: mergedNotes,
    activities: mergedActivities,
    lastUpdated: new Date().toISOString()
  };

  saveDB(updatedDB);
  res.json({ success: true, data: updatedDB });
});

// Quotes endpoints
app.post('/api/quotes', (req: Request, res: Response) => {
  const quote = req.body;
  const db = loadDB();
  const now = new Date().toISOString();

  if (!quote.id) {
    quote.id = 'qt-' + Date.now();
  }
  if (!quote.quoteNumber) {
    const count = (db.quotes?.length || 0) + 1;
    quote.quoteNumber = `EY-2026-${String(count).padStart(4, '0')}`;
  }
  quote.createdAt = quote.createdAt || now;
  quote.updatedAt = now;

  db.quotes = [quote, ...(db.quotes || [])];
  
  // Add activity
  db.activities = [
    {
      id: 'act-' + Date.now(),
      action: 'Yeni Teklif',
      description: `${quote.customerName} için teklif oluşturuldu (${quote.totalAmount?.toLocaleString('tr-TR')} TL)`,
      author: quote.createdBy || 'isparta',
      timestamp: now,
      badgeColor: 'sky'
    },
    ...(db.activities || [])
  ].slice(0, 50);

  saveDB(db);
  res.json({ success: true, quote });
});

app.put('/api/quotes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  const db = loadDB();
  const now = new Date().toISOString();

  let found = false;
  db.quotes = (db.quotes || []).map((q: any) => {
    if (q.id === id) {
      found = true;
      return { ...q, ...updates, updatedAt: now };
    }
    return q;
  });

  if (!found) {
    return res.status(404).json({ error: 'Quote not found' });
  }

  // Log status change if status changed
  if (updates.status) {
    db.activities = [
      {
        id: 'act-' + Date.now(),
        action: 'Teklif Durumu Güncellendi',
        description: `Teklif durumu "${updates.status}" olarak güncellendi.`,
        author: updates.updatedBy || 'ofis',
        timestamp: now,
        badgeColor: 'indigo'
      },
      ...(db.activities || [])
    ].slice(0, 50);
  }

  saveDB(db);
  res.json({ success: true });
});

app.delete('/api/quotes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDB();
  db.quotes = (db.quotes || []).filter((q: any) => q.id !== id);
  saveDB(db);
  res.json({ success: true });
});

// Orders endpoints
app.post('/api/orders', (req: Request, res: Response) => {
  const order = req.body;
  const db = loadDB();
  const now = new Date().toISOString();

  if (!order.id) {
    order.id = 'ord-' + Date.now();
  }
  if (!order.orderNumber) {
    const count = (db.orders?.length || 0) + 1;
    order.orderNumber = `SP-2026-${String(count).padStart(4, '0')}`;
  }
  order.createdAt = order.createdAt || now;
  order.updatedAt = now;

  db.orders = [order, ...(db.orders || [])];

  // Also auto-add calendar reminder for targetShippingDate if present
  if (order.targetShippingDate) {
    const shippingEvent = {
      id: 'ev-ship-' + order.id,
      title: `Sevkiyat: ${order.customerName}`,
      date: order.targetShippingDate,
      time: '09:00',
      category: 'sevkiyat',
      relatedEntity: { type: 'order', id: order.id, name: order.customerName },
      location: order.deliveryAddress || order.city || 'Isparta',
      assignedUser: 'all',
      completed: false,
      notes: `${order.orderNumber} nolu sipariş sevk günü. Kargo/Ambar: ${order.carrierCompany || 'Belirtilmedi'}`,
      reminder: true,
      createdAt: now,
      updatedAt: now
    };
    db.events = [shippingEvent, ...(db.events || [])];
  }

  db.activities = [
    {
      id: 'act-' + Date.now(),
      action: 'Yeni Sipariş Kaydı',
      description: `${order.customerName} için ${order.orderNumber} nolu sipariş açıldı. Sevk Hedefi: ${order.targetShippingDate}`,
      author: order.createdBy || 'istanbul',
      timestamp: now,
      badgeColor: 'emerald'
    },
    ...(db.activities || [])
  ].slice(0, 50);

  saveDB(db);
  res.json({ success: true, order });
});

app.put('/api/orders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  const db = loadDB();
  const now = new Date().toISOString();

  let found = false;
  db.orders = (db.orders || []).map((o: any) => {
    if (o.id === id) {
      found = true;
      return { ...o, ...updates, updatedAt: now };
    }
    return o;
  });

  if (!found) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (updates.status) {
    db.activities = [
      {
        id: 'act-' + Date.now(),
        action: 'Sipariş / Sevkiyat Güncellendi',
        description: `Sipariş durumu: "${updates.status}". ${updates.trackingNumber ? `Takip No: ${updates.trackingNumber}` : ''}`,
        author: updates.updatedBy || 'istanbul',
        timestamp: now,
        badgeColor: updates.status === 'sevk_edildi' ? 'amber' : 'emerald'
      },
      ...(db.activities || [])
    ].slice(0, 50);
  }

  saveDB(db);
  res.json({ success: true });
});

// Calendar events endpoints
app.post('/api/events', (req: Request, res: Response) => {
  const event = req.body;
  const db = loadDB();
  const now = new Date().toISOString();

  if (!event.id) {
    event.id = 'ev-' + Date.now();
  }
  event.createdAt = event.createdAt || now;
  event.updatedAt = now;

  db.events = [event, ...(db.events || [])];
  saveDB(db);
  res.json({ success: true, event });
});

app.put('/api/events/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  const db = loadDB();
  const now = new Date().toISOString();

  db.events = (db.events || []).map((e: any) => {
    if (e.id === id) {
      return { ...e, ...updates, updatedAt: now };
    }
    return e;
  });

  saveDB(db);
  res.json({ success: true });
});

app.delete('/api/events/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDB();
  db.events = (db.events || []).filter((e: any) => e.id !== id);
  saveDB(db);
  res.json({ success: true });
});

// Notes endpoints
app.post('/api/notes', (req: Request, res: Response) => {
  const note = req.body;
  const db = loadDB();
  if (!note.id) note.id = 'nt-' + Date.now();
  note.createdAt = note.createdAt || new Date().toISOString();
  db.notes = [note, ...(db.notes || [])];
  saveDB(db);
  res.json({ success: true, note });
});

app.delete('/api/notes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDB();
  db.notes = (db.notes || []).filter((n: any) => n.id !== id);
  saveDB(db);
  res.json({ success: true });
});

// Demo Data Reset
app.post('/api/reset-demo', (req: Request, res: Response) => {
  const fresh = getInitialData();
  saveDB(fresh);
  res.json({ success: true, data: fresh });
});

// Start Server: Vite middleware in Dev, Static files in Prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Enyap Isı Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
