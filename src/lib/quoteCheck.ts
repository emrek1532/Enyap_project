/**
 * Mikro teklif kontrolü: PDF'teki her kalemi bizim katalog ve fiyat listeleriyle karşılaştırır.
 * Liste iskontosu (fiyat listesine girilen oran) müşteriye verilmesi gereken iskontodur;
 * teklifte bundan fazla ya da eksik iskonto, farklı liste fiyatı ve katalogda olmayan ürün uyarılır.
 */
import { supabase } from './supabase';
import { PdfQuote, catalogCode } from './pdfQuote';
import { QuoteItem } from '../types';

export type CheckLevel = 'ok' | 'warn' | 'error';

export interface CheckIssue { level: Exclude<CheckLevel, 'ok'>; text: string }

export interface CheckRow {
  item: QuoteItem;
  code?: string;
  /** Kalemin bağlı olduğu fiyat listesi */
  list?: { name: string; date: string; price: number; currency: string; discount: number };
  issues: CheckIssue[];
  /** Doğru iskontoyla net tutar farkı (+: müşteriye fazla indirim) */
  loss?: number;
  level: CheckLevel;
}

interface ListHit { list_id: string; price: number; currency: string; our_code: string }

const fmt = (v: number, cur = '') => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? ` ${cur === 'TRY' ? 'TL' : cur}` : '');
const pct = (v: number) => `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

export async function checkQuote(pdf: PdfQuote): Promise<CheckRow[]> {
  const codes = await Promise.all(pdf.items.map(it => (it.code ? Promise.resolve(it.code) : catalogCode(it.productName))));
  const wanted = [...new Set(codes.filter(Boolean) as string[])];

  const hits = new Map<string, ListHit[]>();
  const lists = new Map<string, { name: string; list_date: string; discount: number }>();
  if (wanted.length) {
    const { data, error } = await supabase.from('supplier_items').select('list_id,price,currency,our_code').in('our_code', wanted);
    if (error) throw error;
    for (const r of (data || []) as ListHit[]) {
      const a = hits.get(r.our_code) || [];
      a.push({ ...r, price: Number(r.price) });
      hits.set(r.our_code, a);
    }
    const ids = [...new Set((data || []).map(r => r.list_id as string))];
    if (ids.length) {
      const { data: ls, error: e2 } = await supabase.from('supplier_lists').select('id,name,list_date,discount').in('id', ids);
      if (e2) throw e2;
      for (const l of ls || []) lists.set(l.id, { name: l.name, list_date: l.list_date || '', discount: Number(l.discount || 0) });
    }
  }

  return pdf.items.map((item, i) => {
    const code = codes[i];
    const issues: CheckIssue[] = [];
    const cur = item.currency || 'TRY';
    if (!code) {
      issues.push({ level: 'error', text: 'Ürün katalogda bulunamadı: ad Mikro\'daki ürün kartıyla aynı değil ya da yeni ürün' });
      return { item, issues, level: 'error' as const };
    }
    const cands = (hits.get(code) || []).filter(h => lists.has(h.list_id));
    if (!cands.length) {
      issues.push({ level: 'warn', text: 'Ürün hiçbir fiyat listesine bağlı değil; fiyat ve iskonto kontrol edilemedi' });
      return { item, code, issues, level: 'warn' as const };
    }
    // Aynı ürün birden çok listede olabilir: teklif fiyatıyla tutan liste, yoksa aynı para birimli olan
    const close = (h: ListHit) => h.currency === cur && Math.abs(h.price - item.unitPrice) <= Math.max(0.011, h.price * 0.005);
    const hit = cands.find(close) || cands.find(h => h.currency === cur) || cands[0];
    const l = lists.get(hit.list_id)!;
    const list = { name: l.name, date: l.list_date, price: hit.price, currency: hit.currency, discount: l.discount };

    if (hit.currency !== cur) {
      issues.push({ level: 'warn', text: `Para birimi farklı: listede ${hit.currency === 'TRY' ? 'TL' : hit.currency}, teklifte ${cur === 'TRY' ? 'TL' : cur}` });
    } else if (!close(hit)) {
      issues.push({ level: 'warn', text: `Liste fiyatı ${fmt(hit.price, cur)}, teklifte ${fmt(item.unitPrice, cur)} (${l.name} ${l.list_date})` });
    }

    let loss: number | undefined;
    if (l.discount > 0) {
      const diff = Math.round((item.discount - l.discount) * 100) / 100;
      if (Math.abs(diff) >= 0.05) {
        const base = item.quantity * item.unitPrice;
        loss = Math.round(base * (diff / 100) * 100) / 100;
        issues.push(diff > 0
          ? { level: 'error', text: `Fazla iskonto: ${pct(item.discount)} verilmiş, ${l.name} için ${pct(l.discount)} olmalı · müşteriye ${fmt(loss, cur)} fazla indirim` }
          : { level: 'error', text: `Eksik iskonto: ${pct(item.discount)} verilmiş, ${l.name} için ${pct(l.discount)} olmalı · müşteriye ${fmt(-loss, cur)} pahalı` });
      }
    } else if (item.discount > 0) {
      issues.push({ level: 'warn', text: `${l.name} listesine iskonto girilmemiş; teklifte ${pct(item.discount)} var, kontrol edilemedi` });
    }
    const level: CheckLevel = issues.some(x => x.level === 'error') ? 'error' : issues.length ? 'warn' : 'ok';
    return { item, code, list, issues, loss, level };
  });
}

/**
 * Okunan kalemlerin toplamı PDF'teki genel toplamla tutuyor mu (para birimi bazında, KDV dahil).
 * Tutmuyorsa bir satır okunamamış olabilir: son satır atlanınca sıra numarasında boşluk olmadığı için
 * başka türlü fark edilmez.
 */
export function totalsMismatch(pdf: PdfQuote): string[] {
  if (!pdf.totals) return [];
  const sum: Record<string, number> = { USD: 0, EUR: 0, TRY: 0 };
  for (const it of pdf.items) sum[it.currency || 'TRY'] = (sum[it.currency || 'TRY'] || 0) + it.totalPrice;
  const fmt = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const out: string[] = [];
  for (const k of ['TRY', 'USD', 'EUR'] as const) {
    const want = pdf.totals[k];
    if (Math.abs(sum[k] - want) > Math.max(0.05, want * 0.002)) {
      out.push(`PDF'teki ${k === 'TRY' ? 'TL' : k} genel toplamı ${fmt(want)}, okunan kalemlerin toplamı ${fmt(Math.round(sum[k] * 100) / 100)}: eksik okunan kalem olabilir, PDF ile karşılaştırın`);
    }
  }
  return out;
}
