import { supabase } from './supabase';
import { AppData, Customer, Quote, Order, CalendarEvent, QuickNote, ActivityLog } from '../types';

/**
 * Supabase veri katmanı: uygulamadaki camelCase modeller ile
 * veritabanındaki snake_case tablolar arasında dönüşüm ve CRUD işlemleri.
 */

type Row = Record<string, any>;

const orNull = (v: any) => (v === '' || v === undefined ? null : v);

// ---------- Mappers ----------
const customerToRow = (c: Customer): Row => ({
  id: c.id,
  name: c.name,
  city: c.city ?? '',
  contact_person: orNull(c.contactPerson),
  phone: orNull(c.phone),
  email: orNull(c.email),
  notes: orNull(c.notes),
  created_at: c.createdAt,
  updated_at: c.updatedAt,
});

const rowToCustomer = (r: Row): Customer => ({
  id: r.id,
  name: r.name,
  city: r.city ?? '',
  contactPerson: r.contact_person ?? '',
  phone: r.phone ?? '',
  email: r.email ?? '',
  notes: r.notes ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const quoteToRow = (q: Quote): Row => ({
  id: q.id,
  quote_number: q.quoteNumber,
  customer_name: q.customerName,
  customer_contact: q.customerContact ?? null,
  customer_phone: q.customerPhone ?? '',
  city: q.city ?? '',
  project_location: q.projectLocation ?? null,
  request_channel: q.requestChannel,
  urgency: q.urgency,
  status: q.status,
  raw_whatsapp_text: q.rawWhatsAppText ?? null,
  items: q.items ?? [],
  total_amount: q.totalAmount ?? 0,
  currency: q.currency ?? 'TRY',
  valid_until: orNull(q.validUntil),
  created_by: q.createdBy,
  assigned_to: q.assignedTo,
  notes: q.notes ?? null,
  is_encrypted: !!q.isEncrypted,
  tags: q.tags ?? [],
  created_at: q.createdAt,
  updated_at: q.updatedAt,
});

const rowToQuote = (r: Row): Quote => ({
  id: r.id,
  quoteNumber: r.quote_number,
  customerName: r.customer_name,
  customerContact: r.customer_contact ?? undefined,
  customerPhone: r.customer_phone ?? '',
  city: r.city ?? '',
  projectLocation: r.project_location ?? undefined,
  requestChannel: r.request_channel,
  urgency: r.urgency,
  status: r.status,
  rawWhatsAppText: r.raw_whatsapp_text ?? '',
  items: r.items ?? [],
  totalAmount: Number(r.total_amount ?? 0),
  currency: r.currency,
  validUntil: r.valid_until ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  createdBy: r.created_by,
  assignedTo: r.assigned_to,
  notes: r.notes ?? undefined,
  isEncrypted: r.is_encrypted,
  tags: r.tags ?? [],
});

const orderToRow = (o: Order): Row => ({
  id: o.id,
  order_number: o.orderNumber,
  quote_id: orNull(o.quoteId),
  quote_number: o.quoteNumber ?? null,
  customer_name: o.customerName,
  customer_contact: o.customerContact ?? null,
  customer_phone: o.customerPhone ?? '',
  delivery_address: o.deliveryAddress ?? '',
  city: o.city ?? '',
  items_summary: o.itemsSummary ?? '',
  total_amount: o.totalAmount ?? 0,
  currency: o.currency ?? 'TRY',
  order_date: orNull(o.orderDate),
  target_shipping_date: orNull(o.targetShippingDate),
  actual_shipping_date: orNull(o.actualShippingDate),
  carrier_company: o.carrierCompany ?? '',
  tracking_number: o.trackingNumber ?? null,
  driver_contact: o.driverContact ?? null,
  status: o.status,
  status_notes: o.statusNotes ?? null,
  created_by: o.createdBy,
  created_at: o.createdAt,
  updated_at: o.updatedAt,
});

const rowToOrder = (r: Row): Order => ({
  id: r.id,
  orderNumber: r.order_number,
  quoteId: r.quote_id ?? '',
  quoteNumber: r.quote_number ?? '',
  customerName: r.customer_name,
  customerContact: r.customer_contact ?? undefined,
  customerPhone: r.customer_phone ?? '',
  deliveryAddress: r.delivery_address ?? '',
  city: r.city ?? '',
  itemsSummary: r.items_summary ?? '',
  totalAmount: Number(r.total_amount ?? 0),
  currency: r.currency,
  orderDate: r.order_date ?? '',
  targetShippingDate: r.target_shipping_date ?? '',
  actualShippingDate: r.actual_shipping_date ?? '',
  carrierCompany: r.carrier_company ?? '',
  trackingNumber: r.tracking_number ?? '',
  driverContact: r.driver_contact ?? '',
  status: r.status,
  statusNotes: r.status_notes ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  createdBy: r.created_by,
});

const eventToRow = (e: CalendarEvent): Row => ({
  id: e.id,
  title: e.title,
  date: e.date,
  time: e.time ?? null,
  category: e.category,
  related_entity: e.relatedEntity ?? null,
  location: e.location ?? null,
  assigned_user: e.assignedUser,
  completed: !!e.completed,
  notes: e.notes ?? null,
  reminder: !!e.reminder,
  created_at: e.createdAt,
  updated_at: e.updatedAt,
});

const rowToEvent = (r: Row): CalendarEvent => ({
  id: r.id,
  title: r.title,
  date: r.date,
  time: r.time ?? undefined,
  category: r.category,
  relatedEntity: r.related_entity ?? undefined,
  location: r.location ?? undefined,
  assignedUser: r.assigned_user,
  completed: r.completed,
  notes: r.notes ?? undefined,
  reminder: r.reminder,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const noteToRow = (n: QuickNote): Row => ({
  id: n.id,
  content: n.content,
  author: n.author,
  color: n.color,
  pinned: !!n.pinned,
  created_at: n.createdAt,
  updated_at: n.updatedAt || n.createdAt,
});

const rowToNote = (r: Row): QuickNote => ({
  id: r.id,
  content: r.content,
  author: r.author,
  color: r.color,
  pinned: r.pinned,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const activityToRow = (a: ActivityLog): Row => ({
  id: a.id,
  action: a.action,
  description: a.description ?? '',
  author: a.author ?? '',
  timestamp: a.timestamp,
  badge_color: a.badgeColor ?? null,
});

const rowToActivity = (r: Row): ActivityLog => ({
  id: r.id,
  action: r.action,
  description: r.description,
  author: r.author,
  timestamp: r.timestamp,
  badgeColor: r.badge_color ?? undefined,
});

// ---------- Generic helpers ----------
class DbError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function check<T>(res: { data: T; error: any }): T {
  if (res.error) throw new DbError(res.error.message || 'Veritabanı hatası', res.error.code);
  return res.data;
}

async function upsert(table: string, rows: Row[]) {
  if (rows.length === 0) return;
  check(await supabase.from(table).upsert(rows, { onConflict: 'id' }));
}

async function remove(table: string, id: string) {
  check(await supabase.from(table).delete().eq('id', id));
}

// ---------- Public API ----------
export async function fetchAllData(): Promise<AppData> {
  const [customers, quotes, orders, events, notes, activities] = await Promise.all([
    supabase.from('customers').select('*').order('name', { ascending: true }).limit(5000),
    supabase.from('quotes').select('*').order('created_at', { ascending: false }),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('events').select('*').order('date', { ascending: true }),
    supabase.from('notes').select('*').order('created_at', { ascending: false }),
    supabase.from('activities').select('*').order('timestamp', { ascending: false }).limit(50),
  ]);

  return {
    customers: (check(customers) || []).map(rowToCustomer),
    quotes: (check(quotes) || []).map(rowToQuote),
    orders: (check(orders) || []).map(rowToOrder),
    events: (check(events) || []).map(rowToEvent),
    notes: (check(notes) || []).map(rowToNote),
    activities: (check(activities) || []).map(rowToActivity),
    lastUpdated: new Date().toISOString(),
  };
}

export type Entity = 'customers' | 'quotes' | 'orders' | 'events' | 'notes' | 'activities';

/** Sunucuya yazılacak tek bir değişiklik (çevrimdışıyken kuyrukta bekler). */
export type PendingOp =
  | { kind: 'upsert'; entity: 'customers'; record: Customer }
  | { kind: 'upsert'; entity: 'quotes'; record: Quote }
  | { kind: 'upsert'; entity: 'orders'; record: Order }
  | { kind: 'upsert'; entity: 'events'; record: CalendarEvent }
  | { kind: 'upsert'; entity: 'notes'; record: QuickNote }
  | { kind: 'upsert'; entity: 'activities'; record: ActivityLog }
  | { kind: 'delete'; entity: Entity; id: string };

export const toRow: Record<Entity, (x: any) => Row> = {
  customers: customerToRow,
  quotes: quoteToRow,
  orders: orderToRow,
  events: eventToRow,
  notes: noteToRow,
  activities: activityToRow,
};

export async function applyOp(op: PendingOp): Promise<void> {
  if (op.kind === 'delete') {
    await remove(op.entity, op.id);
    return;
  }
  try {
    await upsert(op.entity, [toRow[op.entity](op.record)]);
  } catch (err: any) {
    // Bağlı teklif silinmişse siparişi teklif bağlantısı olmadan kaydet
    if (op.entity === 'orders' && err?.code === '23503') {
      await upsert('orders', [orderToRow({ ...(op.record as Order), quoteId: '' })]);
      return;
    }
    throw err;
  }
}

/**
 * Kalıcı veritabanı hatası mı (ör. kısıt ihlali)? Bu tür işlemler tekrar
 * denense de başarılı olamayacağı için kuyruktan çıkarılır.
 * Ağ / oturum hataları ise kuyrukta kalır.
 */
export function isPermanentError(err: any): boolean {
  const code: string | undefined = err?.code;
  return !!code && /^[0-9A-Z]{5}$/.test(code) && !code.startsWith('08');
}

/** Tüm tabloları temizleyip verilen veri setini yazar (yedek geri yükleme / demo). */
export async function replaceAllData(data: AppData): Promise<AppData> {
  for (const table of ['orders', 'events', 'notes', 'activities', 'quotes']) {
    check(await supabase.from(table).delete().neq('id', ''));
  }
  await upsert('quotes', (data.quotes || []).map(quoteToRow));
  await upsert('orders', (data.orders || []).map(orderToRow));
  await upsert('events', (data.events || []).map(eventToRow));
  await upsert('notes', (data.notes || []).map(noteToRow));
  await upsert('activities', (data.activities || []).map(activityToRow));
  return fetchAllData();
}

/** Diğer cihazlardan gelen değişiklikleri canlı dinler. */
export function subscribeToChanges(onChange: () => void): () => void {
  const channel = supabase.channel('enyap-db-changes');
  for (const table of ['customers', 'quotes', 'orders', 'events', 'notes', 'activities']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  }
  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
