import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';

/** Kısa kullanım kılavuzu: [başlık, maddeler] */
const GUIDE: [string, string[]][] = [
  ['Ana Sayfa', [
    'Üstteki düğmelerle hızlıca Yeni Teklif, Tahsilat veya Harcama eklenir.',
    '"Bu ay nasıl gidiyor?" kartı ayın 1\'inden bugüne verilen teklif, onaylanan, tahsilat ve harcamayı gösterir.',
    'Kutulardaki yüzdeler geçen ayın aynı günlerine göre değişimdir (ör. 1–17 Ekim ile 1–17 Eylül).',
    'Onaylanan kutusundaki % satış oranıdır: onaylanan tutar ÷ verilen teklif tutarı.',
    '"Ayın detayını göster": ay sonu tahmini, teklif durumları, en çok teklif verilen firmalar, haftalık dağılım, ödeme şekli ve harcama kategorileri.',
  ]],
  ['Teklifler', [
    'Yeni Teklif ile müşteri seçilir, malzemeler katalogdan aranarak eklenir; iskonto ve para birimi kalem bazında girilebilir.',
    'Listede arama (müşteri, teklif no, şehir, ürün), durum ve şehir filtresi vardır.',
    'Bugün / Bu hafta / Bu ay / Geçen ay / Bu yıl düğmeleri tarih aralığını tek dokunuşla seçer; tekrar basınca kaldırır.',
    'Bir teklife dokununca ayrıntısı açılır: PDF önizleme, WhatsApp/e-posta ile gönderme, düzenleme, onaylama veya iptal (neden seçilerek).',
    '"Tekrar görüşülecek" filtresi uzun süredir cevap bekleyen teklifleri gösterir.',
  ]],
  ['Müşteriler', [
    'Liste sekmesi: firmalar, teklif/onay/bekleyen sayıları ve onaylı toplam tutar. Firmaya dokununca cari kartı açılır.',
    'Bakiyeler sekmesi: Mikro\'dan yüklenen cari bakiyeler; alacağımız ve borcumuz ayrı toplanır.',
    'Güncel bakiye = Mikro bakiyesi − o tarihten sonra girilen TL tahsilatlar.',
    'Mikro yükle: Mikro\'dan alınan cari bakiye listesini yükleyin (15 günden eskiyse tarih kırmızı görünür).',
    'Firma pasife veya kara listeye alınabilir; bu firmalar önerilerde çıkmaz.',
  ]],
  ['Malzemeler ve Firma Listeleri', [
    'Malzemeler: kendi katalogumuz; kod veya adla aranır, fiyat ve para birimi buradan güncellenir.',
    'Firma listeleri: tedarikçi fiyat listeleri (PDF/Excel) yüklenir; satırlar katalogdaki ürünlerle eşleştirilir.',
    'Eşleşen ürünlerde liste fiyatı ile katalog fiyatı karşılaştırılır; fiyat değişince bekleyen tekliflerde uyarı çıkar.',
  ]],
  ['Tahsilat ve Harcama', [
    'Tahsilat Ekle: müşteri, tutar, ödeme şekli; çek/senet için banka, çek no ve vade girilir.',
    'Harcama Ekle: kategori, tutar, ödeme şekli ve bölge.',
    'Filtreler ve Bu hafta / Bu ay gibi hızlı tarih düğmeleri vardır.',
    '"PDF Gönder": listelenen kayıtların PDF\'i önce ekranda gösterilir, sonra Gönder (WhatsApp vb.) veya İndir seçilir.',
  ]],
  ['Rapor', [
    'Dönem seçilir (Bu ay, Son 3 ay, Bu yıl, Tarih seç); tarihler elle de yazılabilir.',
    'Özet kutuları, aylık grafikler, teklif durumu, ödeme şekli ve en çok onay alan firmalar görünür.',
    '"Raporu Gör ve Gönder": grafikli PDF önce önizlenir, sonra gönderilir veya indirilir.',
  ]],
  ['Notlar ve Bildirimler', [
    'Notlar bölümünden saha/ofis notu eklenir; hatırlatma tarihi verilirse günü gelince ana sayfada çıkar.',
    'Diğer menüsünden bildirimler açılırsa teklif hatırlatmaları telefona gelir.',
  ]],
  ['İpuçları', [
    'İnternet yokken de kayıt girilebilir; bağlantı gelince otomatik gönderilir (üstteki yeşil nokta = senkron).',
    'Sunucunun kabul etmediği bir kayıt olursa sayfanın üstünde kırmızı uyarı çıkar.',
    'Yetkiniz olmayan bölümler ve düğmeler görünmez; yetki için yöneticiye başvurun (Yönetim bölümü).',
  ]],
];

/** Kılavuzu açan düğme (simge ya da Diğer menüsündeki geniş düğme) + kılavuz penceresi */
export const HelpGuide: React.FC<{ variant: 'icon' | 'wide'; className?: string; onOpen?: () => void }> = ({ variant, className = '', onOpen }) => {
  const [open, setOpen] = useState(false);
  const show = () => { onOpen?.(); setOpen(true); };
  return (
    <>
      {variant === 'icon' ? (
        <button onClick={show} title="Kullanım kılavuzu" aria-label="Kullanım kılavuzu"
          className={`p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 ${className}`}>
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={show} className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 ${className}`}>
          <HelpCircle className="w-4 h-4 text-brand-600" /> Kullanım kılavuzu
        </button>
      )}
      {open && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col h-full sm:h-auto sm:max-h-[90vh] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 pt-safe">
              <HelpCircle className="w-5 h-5 text-brand-600" />
              <h3 className="flex-1 font-black text-slate-900">Kullanım Kılavuzu</h3>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Kapat"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-safe">
              {GUIDE.map(([title, items]) => (
                <section key={title}>
                  <h4 className="font-extrabold text-brand-700 text-sm mb-1.5">{title}</h4>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 leading-snug">
                    {items.map(t => <li key={t}>{t}</li>)}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
