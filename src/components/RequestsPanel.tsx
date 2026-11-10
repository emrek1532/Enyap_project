import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, ExternalLink, FileSpreadsheet, FileText, Image as ImageIcon, Inbox, Loader2, Paperclip, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import type { Customer, Quote } from '../types';
import { listCard, SearchBox, UnderlineTabs } from './ListUI';
import { RequestLines, openCount } from './RequestLines';
import { useSetting } from '../lib/settings';
import { PREF_KEY, PrefRule } from '../lib/requestRead';
import { foldTr } from '../lib/materials';
import { findCustomer } from '../lib/customers';
import { SuggestInput } from './SuggestInput';
import {
  Assignee, QuoteRequest, REQUEST_STATUS, ReqRow, RequestStatus, createRequest, fileUrl, patchRequest, removeRequest, readRequestLines, rowsToDraft,
} from '../lib/requests';

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.round(h / 24);
  return d === 1 ? 'dün' : `${d} gün önce`;
};

export const RequestPill: React.FC<{ status: RequestStatus }> = ({ status }) => (
  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${REQUEST_STATUS[status].cls}`}>{REQUEST_STATUS[status].label}</span>
);

/** Paylaş menüsünden (WhatsApp) gelen yazı / dosya: Talep gir formu dolu açılır */
export interface SharedRequestInput { text?: string; file?: File }

type Tab = 'open' | 'mine' | 'done' | 'cancel';

export const RequestsPanel: React.FC<{
  requests: QuoteRequest[];
  customers: Customer[];
  quotes: Quote[];
  meId: string;
  assignees: Assignee[];
  canEdit: boolean;
  /** Talep okuma / otomatik teklif (yapay zekâ) yetkisi; kapalıysa yalnız talep + not görünür, teklif elle yüklenir */
  canAi: boolean;
  /** Okunmakta olan talepler (id) */
  reading: Set<string>;
  onSaved: (r: QuoteRequest, opts?: { created?: boolean; auto?: boolean }) => void;
  onRead: (r: QuoteRequest) => void;
  onDraft: (draft: Partial<Quote>, req: QuoteRequest) => void;
  onOpenQuote: (quoteId: string) => void;
  /** Bildirimden açılacak talep */
  openId?: string | null;
  onOpenedId?: () => void;
  /** Sayfa başlığındaki "Talep gir" düğmesi sayacı */
  newRequest?: number;
  shared?: SharedRequestInput | null;
  onSharedUsed?: () => void;
}> = ({ requests, customers, quotes, meId, assignees, canEdit, canAi, reading, onSaved, onRead, onDraft, onOpenQuote, openId, onOpenedId, newRequest, shared, onSharedUsed }) => {
  const [tab, setTab] = useState<Tab>('open');
  const [q, setQ] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const names = useMemo(() => new Map(assignees.map(a => [a.id, a.fullName])), [assignees]);

  useEffect(() => { if (newRequest) setFormOpen(true); }, [newRequest]);
  useEffect(() => { if (shared) setFormOpen(true); }, [shared]);
  useEffect(() => {
    if (!openId) return;
    if (requests.some(r => r.id === openId)) { setDetailId(openId); onOpenedId?.(); }
  }, [openId, requests]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOpen = (r: QuoteRequest) => r.status === 'yeni' || r.status === 'hazirlaniyor';
  const counts = {
    open: requests.filter(isOpen).length,
    mine: requests.filter(r => isOpen(r) && r.assignedTo === meId).length,
    done: requests.filter(r => r.status === 'yuklendi').length,
    cancel: requests.filter(r => r.status === 'iptal').length,
  };
  const list = requests.filter(r => (tab === 'open' ? isOpen(r) : tab === 'mine' ? isOpen(r) && r.assignedTo === meId : tab === 'done' ? r.status === 'yuklendi' : r.status === 'iptal'))
    .filter(r => !q.trim() || foldTr(`${r.customerName} ${r.note || ''} ${r.rawText || ''}`).includes(foldTr(q)));
  const detail = detailId ? requests.find(r => r.id === detailId) || null : null;

  return (
    <div className={`${listCard} p-3 sm:p-5 space-y-3`}>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <SearchBox value={q} onChange={setQ} placeholder="Firma ya da talepte ara…" className="flex-1" />
      </div>
      <UnderlineTabs<Tab> value={tab} onChange={setTab} items={[
        { key: 'open', label: `Açık (${counts.open})` },
        { key: 'mine', label: `Bana atanan (${counts.mine})` },
        { key: 'done', label: `Teklifi yüklenen (${counts.done})` },
        { key: 'cancel', label: `İptal (${counts.cancel})` },
      ]} />
      {!list.length && (
        <div className="py-10 text-center text-sm text-slate-500">
          <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          {tab === 'open' ? 'Açık talep yok.' : 'Bu bölümde talep yok.'}
          {canEdit && tab === 'open' && <div className="mt-3"><button onClick={() => setFormOpen(true)} className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold">Talep gir</button></div>}
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {list.map(r => {
          const ready = r.lines?.length ? r.lines.filter(x => !x.skip && x.pick).length : 0;
          return (
            <button key={r.id} onClick={() => setDetailId(r.id)} className="w-full text-left py-3 px-1 sm:px-2 flex items-start gap-3 hover:bg-brand-50/40 rounded-xl">
              <span className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
                {r.files.some(f => f.type.startsWith('image/')) ? <ImageIcon className="w-5 h-5" /> : r.files.length ? <FileSpreadsheet className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-slate-900 truncate">{r.customerName}</span>
                  <RequestPill status={r.status} />
                </span>
                {(r.note || r.rawText) && <span className="block text-xs text-slate-600 line-clamp-1">{r.note || r.rawText}</span>}
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  {ago(r.createdAt)} · {names.get(r.createdBy || '') || 'Ekip'}{r.assignedTo ? ` → ${names.get(r.assignedTo) || '—'}` : ''}
                  {r.files.length ? ` · ${r.files.length} dosya` : ''}
                  {reading.has(r.id) ? ' · okunuyor…' : r.lines?.length ? ` · ${r.lines.length} satır (${ready} hazır)` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {formOpen && (
        <RequestForm customers={customers} assignees={assignees} meId={meId} canAi={canAi} shared={shared || null}
          onClose={() => { setFormOpen(false); onSharedUsed?.(); }}
          onSaved={(r, auto) => { setFormOpen(false); onSharedUsed?.(); onSaved(r, { created: true, auto }); setDetailId(r.id); }} />
      )}
      {detail && (
        <RequestDetail req={detail} customers={customers} quotes={quotes} assignees={assignees} names={names} canEdit={canEdit} canAi={canAi}
          reading={reading.has(detail.id)} onRead={() => onRead(detail)}
          onSaved={r => onSaved(r)} onDraft={d => { setDetailId(null); onDraft(d, detail); }} onOpenQuote={onOpenQuote}
          onClose={() => setDetailId(null)} />
      )}
    </div>
  );
};

/** Pencere kabuğu (koyu lacivert başlık bandı) */
const Modal: React.FC<{ title: string; sub?: string; onClose: () => void; children: React.ReactNode }> = ({ title, sub, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center" onClick={onClose}>
    <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-gradient-to-br from-[#0b2a4c] to-[#15457a] text-white px-4 sm:px-5 py-3.5 pt-safe-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-lg truncate">{title}</h3>
          {sub && <p className="text-xs text-sky-200/80 truncate">{sub}</p>}
        </div>
        <button onClick={onClose} aria-label="Kapat" className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white shrink-0"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4 sm:p-5 space-y-4 text-sm pb-safe">{children}</div>
    </div>
  </div>
);

const label = 'block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5';
const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200';

/** Talep gir: müşteri, WhatsApp yazısı / fotoğraf / Excel, kime */
const RequestForm: React.FC<{
  customers: Customer[]; assignees: Assignee[]; meId: string; shared: SharedRequestInput | null;
  onClose: () => void; onSaved: (r: QuoteRequest, auto: boolean) => void; canAi: boolean;
}> = ({ customers, assignees, meId, canAi, shared, onClose, onSaved }) => {
  const others = assignees.filter(a => a.id !== meId);
  const [customer, setCustomer] = useState('');
  const [text, setText] = useState(shared?.text || '');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>(shared?.file ? [shared.file] : []);
  const [to, setTo] = useState<string>(others[0]?.id || meId);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const match = findCustomer(customers, customer);
  // Teklif formundaki gibi: yazdıkça carilerden öneri (kelimelerin hepsi geçen, baştan eşleşen önce), Enter / Tab ile seçilir
  const suggestions = useMemo(() => {
    const q = foldTr(customer.trim());
    if (!q || customers.some(c => foldTr(c.name) === q)) return [];
    const toks = q.split(/\s+/);
    return customers
      .map(c => ({ c, f: foldTr(c.name) }))
      .filter(x => toks.every(t => x.f.includes(t)))
      .sort((a, b) => Number(b.f.startsWith(q)) - Number(a.f.startsWith(q)) || a.f.localeCompare(b.f, 'tr'))
      .slice(0, 8)
      .map(x => x.c);
  }, [customers, customer]);
  // Seçilen dosyalar hemen diziye alınır (input sıfırlanınca liste boşalmasın)
  const add = (l: FileList | null) => { const picked = l ? Array.from(l) : []; if (picked.length) setFiles(f => [...f, ...picked].slice(0, 6)); };

  const save = async (auto: boolean) => {
    if (!customer.trim()) { setErr('Müşteriyi seçin.'); return; }
    if (!text.trim() && !files.length) { setErr('Talep yazısı ya da dosya ekleyin.'); return; }
    setErr(''); setBusy(files.length ? 'Dosyalar yükleniyor…' : 'Kaydediliyor…');
    try {
      const r = await createRequest({ customerName: match?.name || customer, note, rawText: text, files, assignedTo: auto ? meId : to, status: auto ? 'hazirlaniyor' : 'yeni' });
      onSaved(r, auto);
    } catch (e) {
      setErr((e as Error)?.message || 'Kaydedilemedi'); setBusy('');
    }
  };

  return (
    <Modal title="Talep gir" sub="Müşterinin talebini yükleyin; atanan kişiye bildirim gider." onClose={onClose}>
      <div>
        <label className={label}>Müşteri</label>
        <SuggestInput<Customer>
          value={customer}
          placeholder="Yazın, Enter / Tab ile seçin"
          onChange={setCustomer}
          onPick={c => setCustomer(c.name)}
          suggestions={suggestions}
          getKey={c => c.id}
          inputClassName={input}
          autoFocus
          dataAttrs={{ 'data-req-customer': '1' }}
          renderItem={c => (
            <span className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-800 truncate">{c.name}</span>
              <span className="text-xs text-slate-500 shrink-0">{c.city}</span>
            </span>
          )}
        />
        {match && match.status && match.status !== 'aktif' && (
          <p className={`mt-1 text-[11px] font-bold rounded-md px-2 py-1 ${match.status === 'kara_liste' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
            {match.status === 'kara_liste' ? '⚠ Bu firma kara listede' : 'Bu firma pasif'}{match.statusNote ? `: ${match.statusNote}` : ''}
          </p>
        )}
        {customer.trim() && !match && !suggestions.length && <p className="text-[11px] text-amber-700 mt-1">Carilerde bu ad yok; doğru yazıldığından emin olun.</p>}
      </div>
      <div>
        <label className={label}>Talep (WhatsApp yazısı)</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder={'Müşterinin mesajını yapıştırın (her satıra bir ürün)\nÖr. 10 adet 2" küresel vana\n2 adet 500 lt genleşme tankı'} className={`${input} resize-y`} />
      </div>
      <div>
        <label className={label}>Dosyalar</label>
        <div className="flex flex-wrap gap-2">
          <label className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-slate-50">
            <Camera className="w-4 h-4" /> Fotoğraf çek / seç
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => { add(e.target.files); e.target.value = ''; }} />
          </label>
          <label className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-slate-50">
            <Paperclip className="w-4 h-4" /> Excel / PDF
            <input type="file" accept=".xlsx,.xls,.pdf,application/pdf" multiple className="hidden" onChange={e => { add(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                {f.type.startsWith('image/') ? <ImageIcon className="w-3.5 h-3.5 text-sky-600" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
                <span className="flex-1 min-w-0 truncate">{f.name}</span>
                <span className="text-slate-500 tabular-nums">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                <button onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label="Kaldır" className="p-0.5 text-slate-500 hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <label className={label}>Not (isteğe bağlı)</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ör. acil, proje fiyatı, peşin" className={input} />
      </div>
      <div>
        <label className={label}>Kim hazırlasın?</label>
        <div className="flex flex-wrap gap-2">
          {others.map(a => (
            <button key={a.id} type="button" onClick={() => setTo(a.id)}
              className={`px-3 py-2 rounded-xl border text-sm font-bold ${to === a.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-200'}`}>{a.fullName}</button>
          ))}
          <button type="button" onClick={() => setTo(meId)}
            className={`px-3 py-2 rounded-xl border text-sm font-bold ${to === meId ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-200'}`}>Ben hazırlayacağım</button>
        </div>
      </div>
      {err && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{err}</div>}
      <div className={`grid gap-2 ${canAi ? 'sm:grid-cols-2' : ''}`}>
        <button onClick={() => save(false)} disabled={!!busy} className="py-2.5 rounded-xl bg-brand-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {busy || (to === meId ? 'Kaydet' : 'Kaydet ve gönder')}
        </button>
        {canAi && <button onClick={() => save(true)} disabled={!!busy} className="py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          <Wand2 className="w-4 h-4" /> Kaydet ve otomatik hazırla
        </button>}
      </div>
      {canAi && <p className="text-[11px] text-slate-500">Otomatik hazırla: talep okunur, ürünler kataloğa eşleştirilir ve teklif formu dolu açılır. Müşteriye siz göndermeden gitmez.</p>}
    </Modal>
  );
};

/** Talep detayı: dosyalar, okunan satırlar, teklife dönüştür / otomatik hazırla */
const RequestDetail: React.FC<{
  req: QuoteRequest; customers: Customer[]; quotes: Quote[]; assignees: Assignee[]; names: Map<string, string>; canEdit: boolean;
  reading: boolean; onRead: () => void; onSaved: (r: QuoteRequest) => void; onDraft: (d: Partial<Quote>) => void;
  onOpenQuote: (id: string) => void; onClose: () => void; canAi: boolean;
}> = ({ req, customers, quotes, assignees, names, canEdit, canAi, reading, onRead, onSaved, onDraft, onOpenQuote, onClose }) => {
  const [rows, setRows] = useState<ReqRow[] | null>(req.lines || null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const dirty = useRef(false);
  // Okuma bitince (başka cihazda ya da arka planda) satırlar gelir
  useEffect(() => { if (!dirty.current) setRows(req.lines || null); }, [req.lines]);
  // Dosya bağlantıları yalnız detay açılınca alınır
  useEffect(() => {
    let off = false;
    Promise.all(req.files.map(async f => [f.path, await fileUrl(f.path).catch(() => '')] as const))
      .then(list => { if (!off) setUrls(Object.fromEntries(list)); });
    return () => { off = true; };
  }, [req.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<void>, msg: string) => {
    setErr(''); setBusy(msg);
    try { await fn(); } catch (e) { setErr((e as Error)?.message || 'Olmadı'); } finally { setBusy(''); }
  };
  const patch = (p: Parameters<typeof patchRequest>[1], msg = 'Kaydediliyor…') => run(async () => onSaved(await patchRequest(req.id, p)), msg);
  const city = customers.find(c => c.name === req.customerName)?.city;
  const toDraft = (auto: boolean) => run(async () => {
    const use = rows || [];
    const { draft } = await rowsToDraft(use, req.customerName, quotes, { auto, city, note: req.note ? `Talep notu: ${req.note}` : undefined });
    onDraft(draft);
    // Seçimler ve "Hazırlanıyor" durumu arka planda kaydedilir (bağlantı yoksa teklif formu yine açılır)
    const p: Parameters<typeof patchRequest>[1] = {};
    if (dirty.current) p.lines = use;
    if (req.status === 'yeni') p.status = 'hazirlaniyor';
    if (Object.keys(p).length) patchRequest(req.id, p).then(r => onSaved(r), () => undefined);
  }, auto ? 'Otomatik hazırlanıyor…' : 'Teklif hazırlanıyor…');
  // Yapay zekâsız: müşteri + not dolu boş teklif formu (kaydedince talebe bağlanır)
  const manualQuote = () => {
    onDraft({ customerName: req.customerName, ...(city ? { city } : {}), ...(req.note ? { notes: `Talep notu: ${req.note}` } : {}) });
    if (req.status === 'yeni') patchRequest(req.id, { status: 'hazirlaniyor' }).then(r => onSaved(r), () => undefined);
  };
  const left = openCount(rows);
  const closed = req.status === 'yuklendi' || req.status === 'iptal';

  return (
    <Modal title={req.customerName} sub={`${names.get(req.createdBy || '') || 'Ekip'} · ${new Date(req.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`} onClose={onClose}>
      <div className="flex items-center gap-2 flex-wrap">
        <RequestPill status={req.status} />
        {req.quoteId && <button onClick={() => onOpenQuote(req.quoteId!)} className="text-xs font-bold text-brand-700 inline-flex items-center gap-1 hover:underline">Teklifi aç <ExternalLink className="w-3 h-3" /></button>}
        <span className="flex-1" />
        {canEdit && !closed && (
          <select value={req.assignedTo || ''} onChange={e => patch({ assignedTo: e.target.value || null })} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white" aria-label="Kim hazırlasın">
            <option value="">— atanmadı —</option>
            {assignees.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}
          </select>
        )}
      </div>
      {req.note && <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900"><b>Not:</b> {req.note}</div>}
      {req.rawText && (
        <div>
          <div className={label}>Talep yazısı</div>
          <pre className="whitespace-pre-wrap font-sans text-sm bg-slate-50 rounded-xl px-3 py-2 max-h-48 overflow-y-auto">{req.rawText}</pre>
        </div>
      )}
      {req.files.length > 0 && (
        <div>
          <div className={label}>Dosyalar</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {req.files.map(f => (
              <a key={f.path} href={urls[f.path] || undefined} target="_blank" rel="noopener noreferrer"
                className="block rounded-xl border border-slate-200 overflow-hidden hover:border-brand-300">
                {f.type.startsWith('image/')
                  ? (urls[f.path] ? <img src={urls[f.path]} alt={f.name} className="w-full h-32 object-cover" /> : <div className="h-32 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>)
                  : <div className="h-32 flex flex-col items-center justify-center gap-1 text-slate-600"><FileSpreadsheet className="w-7 h-7 text-emerald-600" /><span className="text-[11px] px-2 truncate max-w-full">{f.name}</span></div>}
              </a>
            ))}
          </div>
        </div>
      )}

      {canAi && <div className="rounded-2xl border border-slate-200 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span className="font-bold text-slate-900 flex-1">Okunan ürünler</span>
          {rows && <span className="text-[11px] text-slate-500">{rows.filter(r => !r.skip && r.pick).length}/{rows.filter(r => !r.skip).length} hazır</span>}
        </div>
        {reading && <div className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Talep okunuyor…</div>}
        {!reading && !rows && (
          <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
            Talep henüz okunmadı.
            {canEdit && <button onClick={onRead} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold">Talebi oku</button>}
          </div>
        )}
        {rows && <RequestLines rows={rows} readOnly={!canEdit || closed} onChange={r => { dirty.current = true; setRows(r); }} />}
        {rows && canEdit && !closed && <button onClick={onRead} disabled={reading} className="text-[11px] text-slate-500 underline">Yeniden oku</button>}
      </div>}

      {err && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{err}</div>}
      {canEdit && !closed && (
        <div className="space-y-2">
          {canAi ? <div className="grid sm:grid-cols-2 gap-2">
            <button onClick={() => toDraft(false)} disabled={!!busy || !rows || left > 0}
              className="py-2.5 rounded-xl bg-brand-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {busy || (left > 0 ? `${left} satırda ürün seçin` : 'Teklife dönüştür')}
            </button>
            <button onClick={() => toDraft(true)} disabled={!!busy || !rows}
              className="py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold flex items-center justify-center gap-2 disabled:opacity-40">
              <Wand2 className="w-4 h-4" /> Otomatik hazırla
            </button>
          </div> : (
            <button onClick={manualQuote} disabled={!!busy}
              className="w-full py-2.5 rounded-xl bg-brand-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {busy || 'Teklif yükle'}
            </button>
          )}
          <div className="flex gap-2 text-xs">
            {req.status === 'yeni' && <button onClick={() => patch({ status: 'hazirlaniyor' })} disabled={!!busy} className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold">Hazırlıyorum</button>}
            <button onClick={() => { if (confirm('Talep iptal edilsin mi?')) patch({ status: 'iptal' }); }} disabled={!!busy} className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 font-bold">Talebi iptal et</button>
          </div>
          {canAi ? <p className="text-[11px] text-slate-500">Otomatik hazırla: seçilmemiş satırlarda en uygun aday alınır, bulunamayanlar teklif notuna yazılır. Teklif formunu kontrol edip kaydedin.</p>
            : <p className="text-[11px] text-slate-500">Teklif yükle: müşteri ve talep notu dolu, boş teklif formu açılır. Kaydedince talep "Teklif yüklendi" olur.</p>}
        </div>
      )}
      {canEdit && (
        <div className="flex items-center justify-between gap-2">
          {req.status === 'iptal' ? <button onClick={() => patch({ status: 'yeni' })} className="text-xs font-bold text-brand-700">Talebi yeniden aç</button> : <span />}
          <button onClick={() => { if (confirm(`"${req.customerName}" talebi silinsin mi?`)) run(async () => { onSaved(await removeRequest(req.id)); onClose(); }, 'Siliniyor…'); }}
            disabled={!!busy} className="text-xs font-bold text-rose-700 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Talebi sil</button>
        </div>
      )}
    </Modal>
  );
};

/** Bu talepteki satırları okur ve kaydeder (arka planda; sayfa kapansa da talep okunmamış kalır, sonra "Talebi oku") */
export async function readAndStore(r: QuoteRequest, prefs: PrefRule[]): Promise<QuoteRequest> {
  const { rows } = await readRequestLines(r, prefs);
  return patchRequest(r.id, { lines: rows });
}

export const usePrefs = () => useSetting<PrefRule[]>(PREF_KEY, [])[0];
