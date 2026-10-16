import React, { useMemo, useState } from 'react';
import { FileUp, Loader2, X, AlertCircle } from 'lucide-react';
import { Customer } from '../types';
import { MikroRow, matchMikro, readMikroFile } from '../lib/mikroBalance';
import { foldName } from '../lib/customerInsights';
import { titleTr } from '../lib/pdfQuote';
import { DateInput } from './DateInput';

const pad = (n: number) => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const money = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Mikro cari kodunun ilk iki hanesi plaka kodu (32 → Isparta)
const PLATE: Record<string, string> = { '03': 'Afyonkarahisar', '06': 'Ankara', '07': 'Antalya', '15': 'Burdur', '20': 'Denizli', '32': 'Isparta', '34': 'İstanbul', '35': 'İzmir', '42': 'Konya', '43': 'Kütahya', '48': 'Muğla', '64': 'Uşak' };
const STOP = /^(san|sanayi|tic|ticaret|ltd|şti|a\.?ş|inş|insaat|ve|müh|taah)\.?/i;
const shortName = (title: string) => {
  const words = title.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) { if (out.length >= 2 && STOP.test(w)) break; if (out.length >= 3) break; out.push(w); }
  return titleTr(out.join(' '));
};

type Choice = string; // müşteri id | 'new' | 'skip'

/** Mikro cari bakiye listesini yükleme: oku → eşleştir → kaydet */
export const MikroUpload: React.FC<{
  customers: Customer[];
  onSave: (list: Customer[]) => void;
  onClose: () => void;
}> = ({ customers, onSave, onClose }) => {
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<MikroRow[] | null>(null);
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fileName, setFileName] = useState('');
  const [zeroMissing, setZeroMissing] = useState(true);

  const sorted = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name, 'tr')), [customers]);
  const byId = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  const read = async (f: File) => {
    setBusy(true); setErr(''); setFileName(f.name);
    try {
      const r = await readMikroFile(f);
      if (!r.length) throw new Error('Dosyada cari kodu, ünvan ve bakiye sütunları bulunamadı.');
      const ch: Record<string, Choice> = {};
      r.forEach(x => { const m = matchMikro(x, customers); ch[x.code] = m ? m.id : 'new'; });
      setRows(r); setChoice(ch);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Dosya okunamadı.');
    } finally { setBusy(false); }
  };

  // Listede olmayan, aynı bölge kodlu (ilk 2 hane) daha önce eşleşmiş firmalar: bakiyesi sıfır kabul edilir
  const missing = useMemo(() => {
    if (!rows) return [];
    const codes = new Set(rows.map(r => r.code));
    const prefixes = new Set(rows.map(r => r.code.slice(0, 2)));
    const chosen = new Set(Object.values(choice));
    return customers.filter(c => c.mikroCode && !codes.has(c.mikroCode) && prefixes.has(c.mikroCode.slice(0, 2)) && !chosen.has(c.id) && (c.mikroBalance ?? 0) !== 0);
  }, [rows, choice, customers]);

  // Eşleşme şüpheli mi: firmanın ilk kelimesi ünvanın ilk kelimesiyle tutmuyorsa
  const doubtful = (r: MikroRow, c?: Customer) => {
    if (!c || c.mikroCode === r.code) return false;
    const a = foldName(c.name).split(/\s+/)[0].slice(0, 4), b = foldName(r.title).split(/\s+/)[0].slice(0, 4);
    return a !== b;
  };

  const save = () => {
    if (!rows) return;
    const now = new Date().toISOString();
    const out = new Map<string, Customer>();
    for (const r of rows) {
      const ch = choice[r.code];
      if (ch === 'skip') continue;
      const patch = { mikroCode: r.code, mikroTitle: r.title, mikroBalance: r.balance, mikroBalanceDate: date, updatedAt: now };
      if (ch === 'new') {
        out.set('new-' + r.code, { id: 'cus-' + Date.now() + '-' + r.code, name: shortName(r.title), city: PLATE[r.code.slice(0, 2)] || '', createdAt: now, ...patch });
      } else {
        const c = out.get(ch) || byId.get(ch);
        if (c) out.set(ch, { ...c, ...patch, mikroBalance: (out.has(ch) ? (out.get(ch)!.mikroBalance || 0) : 0) + r.balance });
      }
    }
    if (zeroMissing) missing.forEach(c => out.set(c.id, { ...c, mikroBalance: 0, mikroBalanceDate: date, updatedAt: now }));
    onSave([...out.values()]);
    onClose();
  };

  const total = rows?.reduce((s, r) => s + (choice[r.code] === 'skip' ? 0 : r.balance), 0) ?? 0;
  const newCount = rows ? rows.filter(r => choice[r.code] === 'new').length : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-3xl sm:rounded-2xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-4 py-3.5 bg-brand-600 text-white flex items-center gap-3 pt-safe">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-brand-100 font-bold uppercase tracking-wide">Mikro</div>
            <h3 className="font-black">Cari bakiye listesi yükle</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brand-700" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[12rem] cursor-pointer rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/50 hover:bg-brand-50 px-4 py-3 flex items-center gap-2 text-sm font-bold text-brand-700">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
              <span className="truncate">{fileName || 'PDF veya Excel seçin'}</span>
              <input type="file" accept=".pdf,.xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
            </label>
            <div>
              <div className="text-[11px] font-bold text-slate-500 mb-1">Bakiye tarihi</div>
              <DateInput value={date} onChange={v => setDate(v || todayIso())} className="w-36 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
          </div>
          {err && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">{err}</p>}
          {!rows && !err && (
            <p className="text-xs text-slate-500 leading-relaxed">
              Mikro'dan alınan <b>cari bakiye listesini</b> (cari kodu, ünvan, bakiye) seçin. Firmalar sistemdeki müşterilerle otomatik eşleştirilir;
              eşleşmeyenleri aşağıda siz seçersiniz. Bir kez eşleşen firma Mikro cari koduyla hatırlanır.
            </p>
          )}

          {rows && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold text-slate-700">{rows.length} cari</span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 font-bold text-emerald-700">{rows.length - newCount} eşleşti</span>
                {newCount > 0 && <span className="px-2.5 py-1 rounded-full bg-brand-50 font-bold text-brand-700">{newCount} yeni müşteri olarak eklenecek</span>}
                <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold text-slate-700 tabular-nums">Toplam {money(total)} TL</span>
              </div>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {rows.map(r => {
                  const ch = choice[r.code];
                  const c = byId.get(ch);
                  const warn = doubtful(r, c);
                  return (
                    <div key={r.code} className={`p-2.5 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 ${warn ? 'bg-rose-50/60' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-slate-400 font-mono">{r.code}</div>
                        <div className="text-xs font-semibold text-slate-800 leading-snug">{r.title}</div>
                      </div>
                      <div className={`sm:w-28 text-sm font-black tabular-nums sm:text-right ${r.balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{money(r.balance)}</div>
                      <div className="sm:w-56">
                        <select value={ch} onChange={e => setChoice(s => ({ ...s, [r.code]: e.target.value }))}
                          className={`w-full px-2 py-1.5 rounded-lg border text-xs bg-white ${warn ? 'border-rose-300' : 'border-slate-200'}`}>
                          <option value="new">+ Yeni müşteri: {shortName(r.title)}</option>
                          <option value="skip">— Atla</option>
                          {sorted.map(x => <option key={x.id} value={x.id}>{x.name}{x.city ? ` (${x.city})` : ''}</option>)}
                        </select>
                        {warn && <div className="text-[10px] text-rose-600 font-bold mt-0.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Eşleşmeyi kontrol edin</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {missing.length > 0 && (
                <label className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 rounded-xl p-3">
                  <input type="checkbox" checked={zeroMissing} onChange={e => setZeroMissing(e.target.checked)} className="mt-0.5" />
                  <span>Bu listede olmayan aynı bölgedeki <b>{missing.length} firmanın</b> bakiyesi 0 kabul edilsin ({missing.slice(0, 4).map(c => c.name).join(', ')}{missing.length > 4 ? '…' : ''})</span>
                </label>
              )}
              <p className="text-[11px] text-slate-500">+ bakiye: firma borçlu (alacağımız) · − bakiye: firma alacaklı (fazla ödeme/avans)</p>
            </>
          )}
        </div>

        {rows && (
          <div className="p-3 border-t border-slate-200 flex justify-end gap-2 pb-safe">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">Vazgeç</button>
            <button onClick={save} className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold">Bakiyeleri kaydet</button>
          </div>
        )}
      </div>
    </div>
  );
};
