/**
 * Müşteri talepleri (Talepler): sahadan girilen talep (fotoğraf / Excel / WhatsApp yazısı) bir kişiye atanır,
 * bir kez okunup satırları saklanır, teklife dönüştürülür. Dosyalar Storage 'requests' kovasında.
 * Veri kullanımı: liste uygulama açılışında tek sorguyla (son 60 gün + açıklar, en fazla 200), sonra canlı güncelleme.
 */
import { supabase } from './supabase';
import type { Material } from './materials';
import type { Quote, QuoteItem } from '../types';
import { Match, PrefRule, ReqLine, excelToText, imageToDataUrl, listDiscounts, matchLine, readRequest } from './requestRead';

export type RequestStatus = 'yeni' | 'hazirlaniyor' | 'yuklendi' | 'iptal';
export const REQUEST_STATUS: Record<RequestStatus, { label: string; cls: string }> = {
  yeni: { label: 'Yeni', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  hazirlaniyor: { label: 'Hazırlanıyor', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  yuklendi: { label: 'Teklif yüklendi', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  iptal: { label: 'İptal', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export interface ReqFile { path: string; name: string; type: string; size: number }
/** Okunan satır: talepteki yazı + katalog adayları + seçim (saklanır; ikinci kez okunmaz) */
export type ReqRow = ReqLine & { m: Match; pick: string | null; skip: boolean };

export interface QuoteRequest {
  id: string;
  customerName: string;
  note?: string;
  rawText?: string;
  files: ReqFile[];
  lines?: ReqRow[] | null;
  status: RequestStatus;
  assignedTo?: string | null;
  createdBy?: string | null;
  quoteId?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Silinme zamanı (yumuşak silme; listelerde görünmez) */
  deletedAt?: string | null;
}

type Row = Record<string, any>;
const fromRow = (r: Row): QuoteRequest => ({
  id: r.id, customerName: r.customer_name, note: r.note ?? undefined, rawText: r.raw_text ?? undefined,
  files: r.files || [], lines: r.lines ?? null, status: r.status, assignedTo: r.assigned_to, createdBy: r.created_by,
  quoteId: r.quote_id, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at ?? null,
});

const must = <T,>(res: { data: T; error: any }): T => { if (res.error) throw res.error; return res.data; };

/** Açık talepler + son 60 günün kapananları */
export async function fetchRequests(): Promise<QuoteRequest[]> {
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const data = must(await supabase.from('quote_requests').select('*').is('deleted_at', null)
    .or(`status.in.(yeni,hazirlaniyor),created_at.gte.${since}`)
    .order('created_at', { ascending: false }).limit(200));
  return (data || []).map(fromRow);
}

export async function fetchRequest(id: string): Promise<QuoteRequest | null> {
  const data = must(await supabase.from('quote_requests').select('*').eq('id', id).maybeSingle());
  return data ? fromRow(data) : null;
}

export interface Assignee { id: string; fullName: string }
export async function fetchAssignees(): Promise<Assignee[]> {
  const data = must(await supabase.rpc('request_assignees'));
  return ((data || []) as Row[]).map(r => ({ id: r.id, fullName: r.full_name }));
}

/** Not/görev verilebilecek kişiler (aktif, notları düzenleyebilen) */
export async function fetchNoteAssignees(): Promise<Assignee[]> {
  const data = must(await supabase.rpc('note_assignees'));
  return ((data || []) as Row[]).map(r => ({ id: r.id, fullName: r.full_name }));
}

/** Dosyayı yükler: fotoğraf küçültülür (JPEG), Excel/PDF olduğu gibi */
async function uploadFile(reqId: string, f: File): Promise<ReqFile> {
  let body: Blob = f, type = f.type || 'application/octet-stream', name = f.name || 'dosya';
  if (type.startsWith('image/')) {
    const url = await imageToDataUrl(f, 1600);
    body = await (await fetch(url)).blob();
    type = 'image/jpeg';
    name = name.replace(/\.[^.]+$/, '') + '.jpg';
  }
  const safe = name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-60);
  const path = `${reqId}/${Date.now()}-${safe}`;
  must(await supabase.storage.from('requests').upload(path, body, { contentType: type, upsert: false }));
  return { path, name, type, size: body.size };
}

/** Dosyayı görmek için geçici bağlantı (1 saat) */
export async function fileUrl(path: string): Promise<string> {
  const data = must(await supabase.storage.from('requests').createSignedUrl(path, 3600));
  return data.signedUrl;
}

/** Yeni talep: önce dosyalar yüklenir, sonra kayıt açılır (atanan kişiye bildirim veritabanından gider) */
export async function createRequest(input: { customerName: string; note?: string; rawText?: string; files: File[]; assignedTo?: string | null; status?: RequestStatus }): Promise<QuoteRequest> {
  const id = crypto.randomUUID();
  const files: ReqFile[] = [];
  for (const f of input.files) files.push(await uploadFile(id, f));
  const data = must(await supabase.from('quote_requests').insert({
    id, customer_name: input.customerName.trim(), note: input.note?.trim() || null, raw_text: input.rawText?.trim() || null,
    files, assigned_to: input.assignedTo || null, status: input.status || 'yeni',
  }).select('*').single());
  return fromRow(data);
}

/** Talebi siler (yumuşak): tarih yazılır ve iptal edilir; kayıt ve dosyalar veritabanında kalır */
export async function removeRequest(id: string): Promise<QuoteRequest> {
  const data = must(await supabase.from('quote_requests').update({ deleted_at: new Date().toISOString(), status: 'iptal' }).eq('id', id).select('*').single());
  return fromRow(data);
}

export async function patchRequest(id: string, patch: Partial<Pick<QuoteRequest, 'status' | 'assignedTo' | 'quoteId' | 'lines' | 'note'>>): Promise<QuoteRequest> {
  const row: Row = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.assignedTo !== undefined) row.assigned_to = patch.assignedTo;
  if (patch.quoteId !== undefined) row.quote_id = patch.quoteId;
  if (patch.lines !== undefined) row.lines = patch.lines ? slimRows(patch.lines) : null;
  if (patch.note !== undefined) row.note = patch.note;
  const data = must(await supabase.from('quote_requests').update(row).eq('id', id).select('*').single());
  return fromRow(data);
}

/** Saklanan adaylar küçültülür (satır başına en fazla 8 aday, gereken alanlar) */
const slimRows = (rows: ReqRow[]): ReqRow[] => rows.map(r => ({
  ...r, m: { ...r.m, cands: r.m.cands.slice(0, 8).map(c => ({ code: c.code, name: c.name, price: c.price, currency: c.currency, unit: c.unit, vatRate: c.vatRate }) as Material) },
}));

/** Canlı: başka cihazda talep açılınca / değişince */
export function subscribeRequests(onChange: (id: string) => void): () => void {
  const ch = supabase.channel('enyap-requests')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_requests' }, (p: any) => onChange(p.new?.id || p.old?.id))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/**
 * Talebi okur: yazı/Excel cihazda (yapay zekâsız), fotoğraf yapay zekâyla; her satır kataloğa eşleştirilir.
 * Birden çok kaynak varsa satırlar birleştirilir.
 */
export async function readRequestLines(req: Pick<QuoteRequest, 'rawText' | 'files'>, prefs: PrefRule[], onStep?: (s: string) => void): Promise<{ rows: ReqRow[]; customer: string }> {
  const lines: ReqLine[] = [];
  let customer = '';
  if (req.rawText?.trim()) {
    onStep?.('Yazı okunuyor…');
    const out = await readRequest({ text: req.rawText });
    lines.push(...out.lines);
  }
  for (const f of req.files) {
    const blob = await (await fetch(await fileUrl(f.path))).blob();
    if (f.type.startsWith('image/')) {
      onStep?.('Fotoğraf okunuyor (yapay zekâ)…');
      const url = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(blob); });
      const out = await readRequest({ image: url });
      lines.push(...out.lines);
      customer ||= out.customer;
    } else if (/sheet|excel|\.xlsx$/i.test(f.type + f.name)) {
      onStep?.('Excel okunuyor…');
      const t = await excelToText(new File([blob], f.name));
      if (t) lines.push(...(await readRequest({ text: t })).lines);
    }
  }
  if (!lines.length) throw new Error('Talepte ürün satırı bulunamadı. Yazıyı ya da dosyayı kontrol edin.');
  onStep?.('Katalogda aranıyor…');
  const rows = await Promise.all(lines.map(async l => {
    const m = await matchLine(l, prefs);
    return { ...l, m, pick: m.pick, skip: false } as ReqRow;
  }));
  return { rows, customer };
}

/**
 * Satırlardan teklif taslağı: seçilen ürün, liste iskontosu; o firmaya daha önce aynı ürün için verilen iskonto varsa o.
 * auto=true: seçilmemiş satırlarda ilk aday alınır (otomatik hazırla); bulunamayanlar nota yazılır.
 */
export async function rowsToDraft(rows: ReqRow[], customerName: string, quotes: Quote[], opts: { auto?: boolean; city?: string; note?: string } = {}): Promise<{ draft: Partial<Quote>; missing: string[] }> {
  const missing: string[] = [];
  const use: { r: ReqRow; m: Material }[] = [];
  for (const r of rows) {
    if (r.skip) continue;
    const code = r.pick || (opts.auto ? r.m.cands[0]?.code : null);
    const m = code ? r.m.cands.find(c => c.code === code) : undefined;
    if (m) use.push({ r, m }); else missing.push(r.text);
  }
  const disc = await listDiscounts(use.map(u => u.m.code)).catch(() => new Map<string, number>());
  // Bu firmaya son verilen iskonto (ürün koduna göre)
  const key = customerName.trim().toLocaleUpperCase('tr-TR');
  const last = new Map<string, number>();
  quotes.filter(q => q.customerName.trim().toLocaleUpperCase('tr-TR') === key)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach(q => q.items.forEach(i => { if (i.code) last.set(i.code, i.discount); }));
  const items: QuoteItem[] = use.map(({ r, m }, i) => ({
    id: `it-${Date.now()}-${i}`, code: m.code, productName: m.name, quantity: r.qty,
    unit: (m.unit || r.unit) as QuoteItem['unit'], unitPrice: m.price, currency: m.currency,
    discount: last.get(m.code) ?? disc.get(m.code) ?? 0, vatRate: m.vatRate ?? 20, totalPrice: 0,
    notes: !r.pick && opts.auto ? `Otomatik seçildi, kontrol edin. Talep: ${r.text}` : undefined,
  }));
  const notes = [opts.note, missing.length ? `Katalogda bulunamayan talep satırları: ${missing.join('; ')}` : ''].filter(Boolean).join('\n');
  return { draft: { customerName, ...(opts.city ? { city: opts.city } : {}), items, ...(notes ? { notes } : {}) }, missing };
}
