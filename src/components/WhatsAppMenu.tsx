import React, { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Quote } from '../types';

/** Türkiye numarasını wa.me biçimine çevirir (0532… → 90532…); numara yoksa boş */
export const waPhone = (p?: string) => {
  let d = (p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d.length >= 11 ? d : '';
};

const tl = (v: number) => `${Math.round(v).toLocaleString('tr-TR')} TL`;
const day = (s: string) => s.slice(0, 10).split('-').reverse().join('.');
const SIGN = '\n\nEnyap Isı Sistemleri';

export interface WaContext { name: string; contact?: string; quote?: Quote; quoteValue?: number; balance?: number | null; balanceDate?: string }

/** Duruma uygun hazır mesajlar */
export function waTemplates(c: WaContext): { key: string; label: string; text: string }[] {
  const hi = `Merhaba${c.contact ? ` ${c.contact}` : ''},`;
  const out: { key: string; label: string; text: string }[] = [];
  if (c.quote) {
    const q = c.quote;
    out.push({ key: 'takip', label: 'Teklif takibi', text: `${hi}\n${day(q.createdAt)} tarihli ${q.quoteNumber} numaralı teklifimizle ilgili değerlendirmeniz oldu mu? Sorunuz veya revize isteğiniz varsa yardımcı olmaktan memnuniyet duyarız.${SIGN}` });
    out.push({ key: 'gonderildi', label: 'Teklif iletildi', text: `${hi}\n${q.quoteNumber} numaralı teklifimizi ilettik${c.quoteValue ? ` (toplam ${tl(c.quoteValue)}, KDV dahil)` : ''}. İncelemenizin ardından dönüşünüzü bekliyoruz.${SIGN}` });
    if (q.status === 'onaylandi') out.push({ key: 'tesekkur', label: 'Sipariş teşekkürü', text: `${hi}\n${q.quoteNumber} numaralı siparişiniz için teşekkür ederiz. Teslimat planını en kısa sürede sizinle paylaşacağız.${SIGN}` });
  }
  if (c.balance != null && c.balance > 0) out.push({ key: 'odeme', label: 'Ödeme hatırlatma', text: `${hi}\n${c.balanceDate ? `${day(c.balanceDate)} itibarıyla ` : ''}cari hesap bakiyeniz ${tl(c.balance)}'dir. Ödeme planınızı paylaşabilirseniz seviniriz. Ekstre isterseniz hemen gönderebiliriz.${SIGN}` });
  out.push({ key: 'yeniden', label: 'Uzun süredir görüşmedik', text: `${hi}\nUzun süredir görüşemedik. Yeni projeleriniz veya ihtiyaçlarınız için güncel fiyat ve ürün bilgisi paylaşmaktan memnuniyet duyarız.${SIGN}` });
  out.push({ key: 'bos', label: 'Boş mesaj', text: `${hi}\n` });
  return out;
}

/** "WhatsApp" düğmesi: hazır mesaj seçilir, WhatsApp'ta yazılı olarak açılır */
export const WhatsAppMenu: React.FC<{ phone?: string; ctx: WaContext; className?: string; label?: string }> = ({ phone, ctx, className, label = 'WhatsApp' }) => {
  const [open, setOpen] = useState(false);
  const num = waPhone(phone);
  const go = (text: string) => {
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(true); }}
        className={className || 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-[#25D366] border-[#25D366] text-white whitespace-nowrap'}>
        <MessageCircle className="w-3.5 h-3.5" /> {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-end sm:items-center justify-center" onClick={e => { e.stopPropagation(); setOpen(false); }}>
          <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-2 max-h-[85vh] overflow-y-auto pb-safe">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 flex items-center gap-2"><MessageCircle className="w-5 h-5 text-[#25D366]" /> Hazır mesaj · {ctx.name}</h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            {!num && <p className="text-[11px] text-slate-500">Kayıtlı telefon yok; WhatsApp açılınca kişiyi siz seçersiniz.</p>}
            {waTemplates(ctx).map(t => (
              <button key={t.key} onClick={() => go(t.text)} className="w-full text-left rounded-xl border border-slate-200 hover:border-[#25D366] hover:bg-emerald-50/40 p-3">
                <div className="text-sm font-bold text-slate-900">{t.label}</div>
                {t.key !== 'bos' && <div className="text-xs text-slate-500 mt-0.5 line-clamp-2 whitespace-pre-line">{t.text.replace(SIGN, '')}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
