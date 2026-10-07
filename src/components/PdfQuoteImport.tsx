import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from 'lucide-react';
import { Customer, Quote, UserRole } from '../types';
import { PdfQuote, catalogCode, matchCustomer, readQuotePdf, titleTr } from '../lib/pdfQuote';
import { foldTr } from '../lib/materials';
import { nextQuoteNumber } from '../lib/quoteRules';
import { CURRENCY_LABEL } from '../lib/money';

type Action = 'new' | 'fill' | 'replace';
interface Plan {
  pdf: PdfQuote;
  existing: Quote | null;
  customerName: string;
  city: string;
  action: Action;
  include: boolean;
  codes: 'pending' | 'done';
}

const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const PdfQuoteImport: React.FC<{
  quotes: Quote[];
  customers: Customer[];
  currentRole: UserRole;
  onCreate: (q: Quote) => void;
  onUpdate: (q: Quote) => void;
  onClose: () => void;
}> = ({ quotes, customers, currentRole, onCreate, onUpdate, onClose }) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [reading, setReading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const knownNames = () => {
    const set = new Set<string>();
    customers.forEach(c => c.name && set.add(c.name));
    quotes.forEach(q => q.customerName && set.add(q.customerName));
    return [...set];
  };
  const knownPeople = () => [...new Set(quotes.map(q => q.preparedBy).filter(Boolean) as string[])];

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files].filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!list.length) return;
    setReading(true); setSaved(null);
    const errs: string[] = [];
    const next: Plan[] = [];
    const names = knownNames();
    const people = knownPeople();
    for (const f of list) {
      try {
        const pdf = await readQuotePdf(f);
        if (!pdf.items.length && !pdf.quoteNumber) { errs.push(`${f.name}: teklif bilgisi okunamadı (taranmış/resim PDF olabilir).`); continue; }
        // Teklifi veren: sistemdeki yazılışı kullan ("BAYRAM ŞENOĞLU" → "Bayram Şenoğlu")
        if (pdf.preparedBy) {
          const first = foldTr(pdf.preparedBy).split(' ')[0];
          pdf.preparedBy = people.find(p => foldTr(p).split(' ')[0] === first) || pdf.preparedBy;
        }
        const existing = pdf.quoteNumber ? quotes.find(q => (q.quoteNumber || '').trim() === pdf.quoteNumber) || null : null;
        const customerName = existing?.customerName
          || (pdf.customerName && matchCustomer(pdf.customerName, names))
          || (pdf.customerName ? titleTr(pdf.customerName.split(/\s+/).slice(0, 3).join(' ')) : '');
        const cust = customers.find(c => c.name === customerName);
        const city = existing?.city || pdf.city || cust?.city || quotes.find(q => q.customerName === customerName)?.city || 'Isparta';
        const action: Action = !existing ? 'new' : (existing.items?.length ? 'replace' : 'fill');
        next.push({ pdf, existing, customerName, city, action, include: action !== 'replace', codes: 'pending' });
      } catch {
        errs.push(`${f.name}: PDF açılamadı.`);
      }
    }
    setErrors(errs);
    setPlans(prev => [...prev, ...next]);
    setReading(false);

    // Malzeme kodlarını katalogdan bul (arka planda)
    for (const p of next) {
      const items = p.pdf.items;
      let i = 0;
      const worker = async () => {
        while (i < items.length) {
          const it = items[i++];
          const code = await catalogCode(it.productName);
          if (code) it.code = code;
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      setPlans(prev => prev.map(x => (x.pdf === p.pdf ? { ...x, codes: 'done' } : x)));
    }
  };

  const save = () => {
    let n = 0;
    const pool = [...quotes];
    for (const p of plans) {
      if (!p.include) continue;
      const { pdf } = p;
      const t = pdf.totals || pdf.items.reduce((a, it) => {
        a[it.currency || 'TRY'] += it.totalPrice; return a;
      }, { TRY: 0, USD: 0, EUR: 0 } as Record<'TRY' | 'USD' | 'EUR', number>);
      const currency = t.TRY > 0 ? 'TRY' : t.USD > 0 ? 'USD' : t.EUR > 0 ? 'EUR' : 'TRY';
      const amounts = { amountTry: t.TRY, amountUsd: t.USD, amountEur: t.EUR, totalAmount: t[currency], currency } as const;
      const now = new Date().toISOString();
      const items = pdf.items.map((it, i) => ({ ...it, id: `it-${pdf.quoteNumber || 'pdf'}-${String(i + 1).padStart(2, '0')}-${Date.now() % 100000}` }));
      if (p.existing) {
        onUpdate({
          ...p.existing,
          items,
          ...amounts,
          paymentTerm: pdf.paymentTerm || p.existing.paymentTerm,
          preparedBy: p.existing.preparedBy || pdf.preparedBy || undefined,
          imported: false,
          updatedAt: now,
        });
      } else {
        const created = pdf.date ? new Date(`${pdf.date}T09:00:00+03:00`) : new Date();
        const q: Quote = {
          id: `qt-pdf-${Date.now()}-${n}`,
          quoteNumber: pdf.quoteNumber || nextQuoteNumber(pool),
          customerName: p.customerName.trim(),
          customerPhone: '',
          city: p.city,
          requestChannel: 'telefon',
          urgency: 'normal',
          status: 'gonderildi',
          items,
          ...amounts,
          validUntil: new Date(created.getTime() + 5 * 864e5).toISOString().slice(0, 10),
          createdAt: created.toISOString(),
          updatedAt: now,
          createdBy: currentRole,
          assignedTo: 'istanbul',
          preparedBy: pdf.preparedBy || undefined,
          paymentTerm: pdf.paymentTerm || undefined,
          isEncrypted: false,
        };
        pool.push(q);
        onCreate(q);
      }
      n++;
    }
    setSaved(n);
    setPlans([]);
  };

  const update = (i: number, patch: Partial<Plan>) => setPlans(prev => prev.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const selected = plans.filter(p => p.include).length;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="font-black text-slate-900">PDF'ten Teklif Yükle</h3>
            <p className="text-xs text-slate-500">Muhasebe programından alınan "Fiyat Teklifi" PDF'leri: firma, teklif no ve tüm kalemler otomatik okunur.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            className="w-full border-2 border-dashed border-slate-300 hover:border-brand-400 rounded-xl py-6 flex flex-col items-center gap-1.5 text-slate-600"
          >
            {reading ? <Loader2 className="w-7 h-7 animate-spin text-brand-600" /> : <FileUp className="w-7 h-7 text-brand-600" />}
            <span className="text-sm font-bold">{reading ? 'PDF okunuyor…' : 'PDF seçin (birden fazla olabilir)'}</span>
            <span className="text-[11px] text-slate-400">ya da buraya sürükleyin</span>
          </button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />

          {saved !== null && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4" /> {saved} teklif kaydedildi.
            </div>
          )}
          {errors.map(e => (
            <div key={e} className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 rounded-xl px-3 py-2"><AlertTriangle className="w-4 h-4 shrink-0" />{e}</div>
          ))}

          {plans.map((p, i) => {
            const t = p.pdf.totals;
            return (
              <div key={i} className={`border rounded-xl p-3 space-y-2 ${p.include ? 'border-brand-200 bg-brand-50/30' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <label className="flex items-start gap-2 min-w-0">
                    <input type="checkbox" className="mt-1" checked={p.include} onChange={e => update(i, { include: e.target.checked })} />
                    <span className="min-w-0">
                      <span className="block font-bold text-sm text-slate-900">
                        {p.pdf.quoteNumber || 'Numarasız'} · {p.customerName || 'Firma bulunamadı'}
                      </span>
                      <span className="block text-[11px] text-slate-500 truncate">{p.pdf.customerName} · {p.pdf.fileName}</span>
                    </span>
                  </label>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    p.action === 'new' ? 'bg-emerald-100 text-emerald-700' : p.action === 'fill' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'}`}>
                    {p.action === 'new' ? 'Yeni teklif' : p.action === 'fill' ? 'Kalemleri eklenecek' : 'Kalemli — üzerine yazılır'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-slate-400 block">Tarih</span>{p.pdf.date ? p.pdf.date.split('-').reverse().join('.') : '—'}</div>
                  <div><span className="text-slate-400 block">Kalem</span>{p.pdf.items.length}{p.codes === 'pending' && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-slate-400" />}</div>
                  <div><span className="text-slate-400 block">Veren / Vade</span>{p.pdf.preparedBy || '—'} · {p.pdf.paymentTerm || '—'}</div>
                  <div><span className="text-slate-400 block">Genel toplam (KDV dahil)</span>
                    {t ? (['TRY', 'USD', 'EUR'] as const).filter(c => t[c] > 0).map(c => `${fmt(t[c])} ${CURRENCY_LABEL[c]}`).join(' + ') || '0' : '—'}
                  </div>
                </div>
                {!p.existing && (
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p.customerName} onChange={e => update(i, { customerName: e.target.value })} className="p-1.5 border border-slate-300 rounded text-xs" placeholder="Firma" />
                    <input value={p.city} onChange={e => update(i, { city: e.target.value })} className="p-1.5 border border-slate-300 rounded text-xs" placeholder="Şehir" />
                  </div>
                )}
                {p.pdf.warnings.length > 0 && (
                  <div className="text-[11px] text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{p.pdf.warnings.join(' · ')}</div>
                )}
                <details className="text-[11px] text-slate-600">
                  <summary className="cursor-pointer text-slate-500">Kalemleri göster</summary>
                  <div className="mt-1 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {p.pdf.items.map(it => (
                      <div key={it.id} className="py-1 flex justify-between gap-2">
                        <span className="min-w-0">{it.code && <b className="font-mono mr-1">{it.code}</b>}{it.productName}</span>
                        <span className="whitespace-nowrap tabular-nums">{it.quantity} {it.unit} × {fmt(it.unitPrice)} {CURRENCY_LABEL[it.currency || 'TRY']} −%{it.discount}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            );
          })}
        </div>

        {plans.length > 0 && (
          <div className="p-3 border-t border-slate-100 flex justify-end gap-2">
            <button onClick={() => setPlans([])} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold">Temizle</button>
            <button
              onClick={save}
              disabled={!selected || plans.some(p => p.include && p.codes === 'pending')}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-50"
            >
              {plans.some(p => p.include && p.codes === 'pending') ? 'Malzeme kodları aranıyor…' : `${selected} Teklifi Kaydet`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
