import { supabase } from './supabase';
import { AppData, Customer, Quote, QuickNote, ActivityLog, Collection, Expense, Visit } from '../types';

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
  status: c.status || 'aktif',
  status_note: orNull(c.statusNote),
  mikro_code: orNull(c.mikroCode),
  mikro_title: orNull(c.mikroTitle),
  mikro_balance: c.mikroBalance ?? null,
  mikro_balance_date: orNull(c.mikroBalanceDate),
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
  status: r.status || 'aktif',
  statusNote: r.status_note ?? '',
  mikroCode: r.mikro_code ?? undefined,
  mikroTitle: r.mikro_title ?? undefined,
  mikroBalance: r.mikro_balance == null ? null : Number(r.mikro_balance),
  mikroBalanceDate: r.mikro_balance_date ?? undefined,
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
  prepared_by: orNull(q.preparedBy),
  lost_reason: orNull(q.lostReason),
  amount_usd: q.amountUsd ?? 0,
  amount_eur: q.amountEur ?? 0,
  amount_try: q.amountTry ?? 0,
  total_usd: q.totalUsd ?? 0,
  imported: !!q.imported,
  payment_term: orNull(q.paymentTerm),
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
  status: r.status === 'arsiv' ? 'gonderildi' : r.status,
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
  preparedBy: r.prepared_by ?? undefined,
  lostReason: r.lost_reason ?? undefined,
  amountUsd: Number(r.amount_usd ?? 0),
  amountEur: Number(r.amount_eur ?? 0),
  amountTry: Number(r.amount_try ?? 0),
  totalUsd: Number(r.total_usd ?? 0),
  imported: !!r.imported,
  paymentTerm: r.payment_term ?? undefined,
});

const noteToRow = (n: QuickNote): Row => ({
  id: n.id,
  content: n.content,
  author: n.author,
  color: n.color,
  pinned: !!n.pinned,
  created_at: n.createdAt,
  updated_at: n.updatedAt || n.createdAt,
  remind_at: n.remindAt || null,
  reminded_at: n.remindedAt || null,
  done: !!n.done,
});

const rowToNote = (r: Row): QuickNote => ({
  id: r.id,
  content: r.content,
  author: r.author,
  color: r.color,
  pinned: r.pinned,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  remindAt: r.remind_at,
  remindedAt: r.reminded_at,
  done: !!r.done,
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
  actor: r.actor ?? null,
});

const collectionToRow = (c: Collection): Row => ({
  id: c.id,
  date: c.date,
  customer_name: c.customerName ?? '',
  amount: c.amount ?? 0,
  currency: c.currency ?? 'TRY',
  method: c.method ?? '',
  city: orNull(c.city),
  bank_name: orNull(c.bankName),
  bank_branch: orNull(c.bankBranch),
  check_no: orNull(c.checkNo),
  due_date: orNull(c.dueDate),
  description: orNull(c.description),
  created_by: c.createdBy,
  created_at: c.createdAt,
  updated_at: c.updatedAt,
});

const rowToCollection = (r: Row): Collection => ({
  id: r.id,
  date: r.date,
  customerName: r.customer_name ?? '',
  amount: Number(r.amount ?? 0),
  currency: r.currency,
  method: r.method ?? '',
  city: r.city ?? undefined,
  bankName: r.bank_name ?? undefined,
  bankBranch: r.bank_branch ?? undefined,
  checkNo: r.check_no ?? undefined,
  dueDate: r.due_date ?? undefined,
  description: r.description ?? undefined,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const visitToRow = (v: Visit): Row => ({
  id: v.id,
  customer_name: v.customerName,
  date: v.date,
  note: orNull(v.note),
  city: orNull(v.city),
  created_by: v.createdBy,
  created_at: v.createdAt,
  updated_at: v.updatedAt,
});

const rowToVisit = (r: Row): Visit => ({
  id: r.id,
  customerName: r.customer_name ?? '',
  date: r.date,
  note: r.note ?? undefined,
  city: r.city ?? undefined,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const expenseToRow = (e: Expense): Row => ({
  id: e.id,
  date: e.date,
  category: e.category ?? '',
  amount: e.amount ?? 0,
  currency: e.currency ?? 'TRY',
  method: e.method ?? '',
  region: orNull(e.region),
  description: orNull(e.description),
  created_by: e.createdBy,
  created_at: e.createdAt,
  updated_at: e.updatedAt,
});

const rowToExpense = (r: Row): Expense => ({
  id: r.id,
  date: r.date,
  category: r.category ?? '',
  amount: Number(r.amount ?? 0),
  currency: r.currency,
  method: r.method ?? '',
  region: r.region ?? undefined,
  description: r.description ?? undefined,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
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
/**
 * Supabase tek istekte en fazla 1000 satır döndürür; büyük tabloları
 * sayfa sayfa çekip birleştirir.
 */
async function fetchAllRows(table: string, orderBy: string, ascending: boolean, since?: string): Promise<{ data: Row[]; error: any }> {
  const PAGE = 1000;
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*');
    if (since) q = q.gt('synced_at', since);
    const { data, error } = await q
      .order(orderBy, { ascending })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { data: all, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: all, error: null };
}

export async function fetchAllData(): Promise<AppData> {
  // Siparişler ve takvim tabloları veritabanında arşiv olarak duruyor; uygulama kullanmıyor
  const [customers, quotes, notes, activities, collections, expenses, visits] = await Promise.all([
    fetchAllRows('customers', 'name', true),
    fetchAllRows('quotes', 'created_at', false),
    fetchAllRows('notes', 'created_at', false),
    supabase.from('activities').select('*').not('id', 'like', 'diag-%').order('timestamp', { ascending: false }).limit(50),
    fetchAllRows('collections', 'date', false),
    fetchAllRows('expenses', 'date', false),
    fetchAllRows('visits', 'date', false),
  ]);

  return {
    customers: (check(customers) || []).map(rowToCustomer),
    quotes: (check(quotes) || []).map(rowToQuote),
    notes: (check(notes) || []).map(rowToNote),
    activities: (check(activities) || []).map(rowToActivity),
    collections: (check(collections) || []).map(rowToCollection),
    expenses: (check(expenses) || []).map(rowToExpense),
    visits: (visits.error ? [] : visits.data || []).map(rowToVisit),
    lastUpdated: new Date().toISOString(),
    syncCursor: maxSynced([customers, quotes, notes, collections, expenses, visits]),
  };
}

/** Sunucu saatine göre en son değişiklik zamanı (sonraki artımlı eşitlemenin başlangıcı) */
function maxSynced(results: { data: Row[] | null }[], fallback = ''): string {
  let m = fallback;
  for (const r of results) for (const row of r.data || []) if (row.synced_at && row.synced_at > m) m = row.synced_at;
  return m;
}

/** Son eşitlemeden sonra değişen kayıtlar (eski veriler tekrar indirilmez) */
export interface DataChanges {
  customers: Customer[]; quotes: Quote[]; notes: QuickNote[]; activities: ActivityLog[];
  collections: Collection[]; expenses: Expense[]; visits: Visit[]; cursor: string;
}

export async function fetchChanges(cursor: string): Promise<DataChanges> {
  // Aynı anda yazılan kayıtlar kaçmasın diye 2 dakika geriden başlanır (tekrar gelenler id ile birleşir)
  const since = new Date(Date.parse(cursor) - 120000).toISOString();
  const [customers, quotes, notes, activities, collections, expenses, visits] = await Promise.all([
    fetchAllRows('customers', 'name', true, since),
    fetchAllRows('quotes', 'created_at', false, since),
    fetchAllRows('notes', 'created_at', false, since),
    supabase.from('activities').select('*').not('id', 'like', 'diag-%').gt('timestamp', since).order('timestamp', { ascending: false }).limit(50),
    fetchAllRows('collections', 'date', false, since),
    fetchAllRows('expenses', 'date', false, since),
    fetchAllRows('visits', 'date', false, since),
  ]);
  return {
    customers: (check(customers) || []).map(rowToCustomer),
    quotes: (check(quotes) || []).map(rowToQuote),
    notes: (check(notes) || []).map(rowToNote),
    activities: (check(activities) || []).map(rowToActivity),
    collections: (check(collections) || []).map(rowToCollection),
    expenses: (check(expenses) || []).map(rowToExpense),
    visits: (visits.error ? [] : visits.data || []).map(rowToVisit),
    cursor: maxSynced([customers, quotes, notes, collections, expenses, visits], cursor),
  };
}

/** Değişen kayıtları eldeki veriye id ile işler (yeni gelenler eklenir, değişenler güncellenir) */
export function mergeChanges(d: AppData, ch: DataChanges): AppData {
  const merge = <T extends { id: string }>(list: T[] | undefined, upd: T[], sort: (a: T, b: T) => number): T[] => {
    if (!upd.length) return list || [];
    const m = new Map((list || []).map(x => [x.id, x] as [string, T]));
    upd.forEach(x => m.set(x.id, x));
    return [...m.values()].sort(sort);
  };
  const desc = (k: (x: any) => string) => (a: any, b: any) => (k(b) || '').localeCompare(k(a) || '');
  return {
    ...d,
    customers: merge(d.customers, ch.customers, (a, b) => a.name.localeCompare(b.name)),
    quotes: merge(d.quotes, ch.quotes, desc(x => x.createdAt)),
    notes: merge(d.notes, ch.notes, desc(x => x.createdAt)),
    activities: merge(d.activities, ch.activities, desc(x => x.timestamp)).slice(0, 50),
    collections: merge(d.collections, ch.collections, desc(x => x.date)),
    expenses: merge(d.expenses, ch.expenses, desc(x => x.date)),
    visits: merge(d.visits, ch.visits, desc(x => x.date)),
    lastUpdated: new Date().toISOString(),
    syncCursor: ch.cursor,
  };
}

/** Başka cihazda silinen kaydı eldeki veriden çıkarır */
export function removeRecord(d: AppData, table: string, id: string): AppData {
  const key = table as keyof AppData;
  const list = d[key];
  if (!Array.isArray(list)) return d;
  return { ...d, [key]: (list as { id: string }[]).filter(x => x.id !== id) };
}

export type Entity = 'customers' | 'quotes' | 'notes' | 'activities' | 'collections' | 'expenses' | 'visits';

/** Sunucuya yazılacak tek bir değişiklik (çevrimdışıyken kuyrukta bekler). */
export type PendingOp =
  | { kind: 'upsert'; entity: 'customers'; record: Customer }
  | { kind: 'upsert'; entity: 'quotes'; record: Quote }
  | { kind: 'upsert'; entity: 'notes'; record: QuickNote }
  | { kind: 'upsert'; entity: 'activities'; record: ActivityLog }
  | { kind: 'upsert'; entity: 'collections'; record: Collection }
  | { kind: 'upsert'; entity: 'expenses'; record: Expense }
  | { kind: 'upsert'; entity: 'visits'; record: Visit }
  | { kind: 'delete'; entity: Entity; id: string };

export const toRow: Record<Entity, (x: any) => Row> = {
  customers: customerToRow,
  quotes: quoteToRow,
  notes: noteToRow,
  activities: activityToRow,
  collections: collectionToRow,
  expenses: expenseToRow,
  visits: visitToRow,
};

export async function applyOp(op: PendingOp): Promise<void> {
  if (op.kind === 'delete') {
    await remove(op.entity, op.id);
    return;
  }
  const map = toRow[op.entity];
  if (!map) return; // eski sürümden kalan (sipariş/takvim) kayıtları atla
  await upsert(op.entity, [map(op.record)]);
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

/** Diğer cihazlardan gelen değişiklikleri canlı dinler (silinenlerde tablo ve id bildirilir). */
export function subscribeToChanges(onChange: (e: { table: string; type: string; id?: string }) => void): () => void {
  const channel = supabase.channel('enyap-db-changes');
  for (const table of ['customers', 'quotes', 'notes', 'activities', 'collections', 'expenses', 'visits']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (p: any) =>
      onChange({ table, type: p.eventType, id: p.old?.id }));
  }
  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
