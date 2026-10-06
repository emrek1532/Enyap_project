import { Quote, QuoteItem, UrgencyLevel } from '../types';

export interface ParsedWhatsAppResult {
  customerName: string;
  customerPhone: string;
  city: string;
  urgency: UrgencyLevel;
  items: Array<{
    productName: string;
    quantity: number;
    unit: 'Adet' | 'Metre' | 'Takım' | 'Paket' | 'Kg' | 'Set';
  }>;
  notes: string;
}

const COMMON_CITIES = [
  'Isparta', 'Burdur', 'Antalya', 'Afyon', 'Bucak', 'Eğirdir', 'Yalvaç', 'Dinar', 
  'Sandıklı', 'Denizli', 'Konya', 'İstanbul', 'Ankara', 'İzmir'
];

export function parseWhatsAppMessage(text: string): ParsedWhatsAppResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  let customerName = '';
  let customerPhone = '';
  let city = 'Isparta'; // Default to Isparta since engineer is in Isparta
  let urgency: UrgencyLevel = 'normal';
  const items: ParsedWhatsAppResult['items'] = [];
  const notesLines: string[] = [];

  // Check phone pattern (Turkish mobile)
  const phoneMatch = text.match(/(?:\+90|0)?\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}/);
  if (phoneMatch) {
    customerPhone = phoneMatch[0].replace(/\s+/g, ' ');
  }

  // Check urgency keywords
  const lowerText = text.toLowerCase();
  if (lowerText.includes('çok acil') || lowerText.includes('hemen') || lowerText.includes('acil lazım') || lowerText.includes('acil')) {
    urgency = 'acil';
  } else if (lowerText.includes('bugün') || lowerText.includes('pazartesiye') || lowerText.includes('hızlı')) {
    urgency = 'yuksek';
  }

  // Check city keywords
  for (const c of COMMON_CITIES) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(text)) {
      city = c;
      break;
    }
  }

  // Common HVAC keywords
  const hvacKeywords = [
    'kombi', 'yoğuşmalı', 'radyatör', 'petek', 'panel', 'vana', 'termostatik', 
    'pex', 'boru', 'kollektör', 'kaskad', 'kazan', 'boyler', 'genleşme', 'tank', 
    'pompa', 'sirkülasyon', 'eşanjör', 'yerden ısıtma', 'termostat', 'klape', 
    'balans', 'filtre', 'fittings', 'dirsek', 'manometre'
  ];

  // Try to find customer name from greetings
  for (const line of lines) {
    const greetingMatch = line.match(/(?:merhaba|selam|iyi günler|selamlar)\s+([A-ZÇĞİÖŞÜa-zçğıöşü\s]{3,30})(?:bey|hocam|usta|abim)?/i);
    if (greetingMatch && !customerName) {
      const candidate = greetingMatch[1].trim();
      if (candidate.length > 2 && !candidate.toLowerCase().includes('şakir') && !candidate.toLowerCase().includes('enyap')) {
        customerName = candidate;
      }
    }
  }

  // Parse lines for products and quantities
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const hasHvac = hvacKeywords.some(kw => lowerLine.includes(kw));

    // Look for quantity like "32 adet", "1600 mt", "10 takım", "5 tane", "20x"
    const qtyMatch = line.match(/(\d+[\.,]?\d*)\s*(adet|mt|metre|takım|paket|tane|ad|set|top)?/i);

    if (hasHvac) {
      let quantity = 1;
      let unit: 'Adet' | 'Metre' | 'Takım' | 'Paket' | 'Kg' | 'Set' = 'Adet';

      if (qtyMatch) {
        quantity = parseFloat(qtyMatch[1].replace(',', '.'));
        const u = (qtyMatch[2] || '').toLowerCase();
        if (u === 'mt' || u === 'metre') unit = 'Metre';
        else if (u === 'takım' || u === 'set') unit = 'Takım';
        else if (u === 'paket') unit = 'Paket';
      }

      // Clean product name
      let prodName = line
        .replace(/^[-*•\d\.\)]+\s*/, '')
        .replace(/(?:fiyatı lazım|fiyat istiyoruz|teklif rica|ne kadar|kaç para).*$/i, '')
        .trim();

      if (prodName) {
        items.push({
          productName: prodName,
          quantity: quantity > 0 ? quantity : 1,
          unit: unit
        });
      }
    } else {
      // General note line
      if (!line.toLowerCase().startsWith('selam') && !line.toLowerCase().startsWith('merhaba')) {
        notesLines.push(line);
      }
    }
  }

  // If no customer name found, try finding from "proje", "mühendislik" words
  if (!customerName) {
    const projMatch = text.match(/([A-ZÇĞİÖŞÜa-zçğıöşü\s]{3,25}(?:Mühendislik|Tesisat|İnşaat|Yapı|Isı|Market|Projesi))/i);
    if (projMatch) {
      customerName = projMatch[1].trim();
    } else {
      customerName = 'WhatsApp Müşterisi';
    }
  }

  return {
    customerName,
    customerPhone,
    city,
    urgency,
    items,
    notes: notesLines.slice(0, 3).join(' ')
  };
}

/**
 * Creates formatted WhatsApp text ready to send from Isparta remote engineer to Istanbul office colleague
 */
export function formatQuoteForOffice(quote: Quote): string {
  const itemsText = quote.items && quote.items.length > 0
    ? quote.items.map((it, idx) => `  ${idx + 1}) ${it.quantity} ${it.unit} ${it.productName}`).join('\n')
    : '  (Ürün listesi serbest metin olarak ekte)';

  return `🔥 *ENYAP ISI - YENİ TEKLİF TALEBİ* 🔥
📌 *Teklif No:* ${quote.quoteNumber}
🏢 *Müşteri / Firma:* ${quote.customerName} ${quote.customerContact ? `(${quote.customerContact})` : ''}
📍 *Şehir / Konum:* ${quote.city} ${quote.projectLocation ? ` - ${quote.projectLocation}` : ''}
📞 *Telefon:* ${quote.customerPhone || 'Girilmedi'}
⚡ *Aciliyet:* ${quote.urgency.toUpperCase()}
👤 *Talep Açan:* Şakir Emre (Isparta Saha)

📦 *Talep Edilen Malzemeler:*
${itemsText}

📝 *Saha Notu:* ${quote.notes || 'Yok'}

🔗 *Portal Bağlantısı:* Teklifi hazırlayıp onayladığında portaldan görebilirim. Kolay gelsin!`;
}

/**
 * Creates formatted WhatsApp text ready to send from engineer to customer
 */
export function formatQuoteForCustomer(quote: Quote): string {
  const itemsText = quote.items && quote.items.length > 0
    ? quote.items.map((it, idx) => `• ${it.productName} - ${it.quantity} ${it.unit} : ${it.totalPrice?.toLocaleString('tr-TR')} TL`).join('\n')
    : '';

  return `Sayın ${quote.customerContact || quote.customerName},

Enyap Isı Sistemleri olarak ilettiğiniz malzeme listesi için hazırladığımız teklif özeti aşağıdadır:

📄 *Teklif No:* ${quote.quoteNumber}
💰 *Toplam Teklif Tutarı:* ${quote.totalAmount?.toLocaleString('tr-TR')} ${quote.currency} (KDV Dahil)
⏳ *Teklif Geçerlilik Tarihi:* ${quote.validUntil || '5 Gün'}

📋 *Malzeme Kalemleri:*
${itemsText}

Detaylı teknik föy ve resmi antetli teklif mektubumuz tarafınıza iletilmiştir.
İyi çalışmalar dileriz.

*Enyap Isı Sistemleri A.Ş.*
Şakir Emre - Satış Pazarlama Mühendisi
Isparta Bölge Temsilciliği`;
}
