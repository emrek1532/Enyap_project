/**
 * Bekleyen tekliflerdeki kalem fiyatlarını güncel malzeme kataloğuyla karşılaştırır.
 * Yeni fiyat listesi yüklenince fiyatı değişen ürünleri içeren teklifler işaretlenir.
 */
import { useEffect, useState } from 'react';
import { Quote } from '../types';
import { supabase } from './supabase';
import { PENDING_STATUSES } from './quoteRules';

export interface PriceChange { code: string; name: string; old: number; now: number; currency: string; pct: number }

const DAY = 864e5;
let cache: { key: string; map: Map<string, { price: number; currency: string; updatedAt: string }> } | null = null;

async function catalogPrices(codes: string[]) {
  const key = codes.slice().sort().join('|');
  if (cache?.key === key) return cache.map;
  const map = new Map<string, { price: number; currency: string; updatedAt: string }>();
  for (let i = 0; i < codes.length; i += 200) {
    const { data, error } = await supabase.from('materials').select('code,price,currency,updated_at').in('code', codes.slice(i, i + 200));
    if (error) throw error;
    (data || []).forEach((r: any) => map.set(r.code, { price: Number(r.price || 0), currency: r.currency || 'TRY', updatedAt: r.updated_at || '' }));
  }
  cache = { key, map };
  return map;
}

/** Son 120 günün bekleyen tekliflerinde, teklif sonrası katalog fiyatı %1–35 değişen kalemler (teklif id → değişiklikler) */
export function usePriceChanges(quotes: Quote[], enabled = true): Map<string, PriceChange[]> {
  const [res, setRes] = useState<Map<string, PriceChange[]>>(new Map());
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const pending = quotes.filter(q => PENDING_STATUSES.includes(q.status) && q.items?.length && now - Date.parse(q.createdAt) <= 120 * DAY);
    const codes = [...new Set(pending.flatMap(q => q.items.map(i => i.code).filter((c): c is string => !!c)))];
    if (!codes.length) { setRes(new Map()); return; }
    let off = false;
    catalogPrices(codes).then(cat => {
      if (off) return;
      const out = new Map<string, PriceChange[]>();
      for (const q of pending) {
        const ch: PriceChange[] = [];
        for (const it of q.items) {
          const c = it.code && cat.get(it.code);
          const cur = it.currency || q.currency || 'TRY';
          // Katalog teklif hazırlandıktan sonra güncellenmiş olmalı
          if (!c || c.price <= 0 || it.unitPrice <= 0 || c.currency !== cur || c.updatedAt <= q.createdAt) continue;
          const pct = (c.price - it.unitPrice) / it.unitPrice;
          // %35'ten büyük fark genelde özel fiyattır, zam sayılmaz
          if (Math.abs(pct) >= 0.01 && Math.abs(pct) <= 0.35) ch.push({ code: it.code!, name: it.productName, old: it.unitPrice, now: c.price, currency: cur, pct });
        }
        if (ch.length) out.set(q.id, ch);
      }
      setRes(out);
    }, () => undefined);
    return () => { off = true; };
  }, [quotes, enabled]);
  return res;
}
