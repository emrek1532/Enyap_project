import React, { useEffect } from 'react';
import { Bot, MessageCircleQuestion, Mic, Search, X } from 'lucide-react';
import { Customer, Quote } from '../types';
import { QuickPrice } from './QuickPrice';
import { AskQuotes } from './AskQuotes';
import { QuoteBuilder } from './QuoteBuilder';
import { VoiceCommand, VoiceResult } from './VoiceCommand';

export type ToolMode = 'search' | 'ask' | 'draft' | 'voice';
export type ToolAllow = { quote: boolean; collection: boolean; expense: boolean };

export type ToolInfo = { key: ToolMode; label: string; short: string; desc: string; icon: React.ElementType; tone: string };

/** Hızlı kısayollar: Ara, Tekliflere sor, Teklif hazırla, Sesle kayıt (yetkiye göre) */
export function toolList(canQuotes: boolean, allow: ToolAllow): ToolInfo[] {
  return [
    { key: 'search' as ToolMode, label: 'Ara', short: 'Ara', desc: 'Ürün, firma, fiyat', icon: Search, tone: 'from-brand-500 to-brand-700' },
    canQuotes && { key: 'ask' as ToolMode, label: 'Tekliflere sor', short: 'Sor', desc: 'Soru sor, cevap al', icon: MessageCircleQuestion, tone: 'from-violet-500 to-indigo-600' },
    allow.quote && { key: 'draft' as ToolMode, label: 'Teklif hazırla', short: 'Hazırla', desc: 'Talepten taslak', icon: Bot, tone: 'from-emerald-500 to-teal-600' },
    (allow.quote || allow.collection || allow.expense) && { key: 'voice' as ToolMode, label: 'Sesle kayıt', short: 'Sesle', desc: 'Konuş, kaydedeyim', icon: Mic, tone: 'from-orange-400 to-rose-500' },
  ].filter(Boolean) as ToolInfo[];
}

/**
 * Kısayol penceresi: telefonda alttan açılan sayfa, bilgisayarda ortada pencere.
 * Üstteki sekmelerle araçlar arasında geçilir; seçim cihazda hatırlanır.
 */
export const QuickToolsModal: React.FC<{
  mode: ToolMode;
  tools: ToolInfo[];
  onMode: (m: ToolMode) => void;
  onClose: () => void;
  quotes: Quote[];
  customers: Customer[];
  allow: ToolAllow;
  onVoice: (r: VoiceResult) => void;
  onOpenQuote: (q: Quote) => void;
  onOpenCustomer?: (name: string) => void;
}> = ({ mode, tools, onMode, onClose, quotes, customers, allow, onVoice, onOpenQuote, onOpenCustomer }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const active = tools.some(t => t.key === mode) ? mode : tools[0]?.key;
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-[2px] flex items-end sm:items-start sm:justify-center sm:pt-[6vh]" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[86vh] flex flex-col bg-slate-50 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 bg-white border-b border-slate-100">
          <div className="flex-1 flex gap-1 p-1 rounded-xl bg-slate-100 overflow-x-auto">
            {tools.map(t => (
              <button key={t.key} onClick={() => onMode(t.key)}
                className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition ${active === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                <t.icon className="w-3.5 h-3.5 shrink-0" /> <span className="sm:hidden">{t.short}</span><span className="hidden sm:inline truncate">{t.label}</span>
              </button>
            ))}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Kapat"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          {active === 'search' && <QuickPrice quotes={quotes} customers={customers} onOpenQuote={q => { onClose(); onOpenQuote(q); }} onOpenCustomer={onOpenCustomer && (n => { onClose(); onOpenCustomer(n); })} />}
          {active === 'ask' && <AskQuotes quotes={quotes} customers={customers.map(c => c.name)} onOpenQuote={q => { onClose(); onOpenQuote(q); }} />}
          {active === 'draft' && <QuoteBuilder quotes={quotes} customers={customers} onDraft={draft => { onClose(); onVoice({ kind: 'quote', draft }); }} />}
          {active === 'voice' && <VoiceCommand customers={customers.map(c => c.name)} allow={allow} onResult={r => { onClose(); onVoice(r); }} />}
        </div>
      </div>
    </div>
  );
};

/** Ana sayfadaki kısayol düğmeleri */
export const QuickToolButtons: React.FC<{ tools: ToolInfo[]; onOpen: (m: ToolMode) => void }> = ({ tools, onOpen }) => (
  <div className={`grid grid-cols-2 gap-2 sm:gap-3 ${tools.length >= 4 ? 'lg:grid-cols-4' : tools.length === 3 ? 'lg:grid-cols-3' : ''}`}>
    {tools.map(t => (
      <button key={t.key} onClick={() => onOpen(t.key)}
        className="group flex items-center gap-3 p-2.5 sm:p-3 rounded-2xl bg-white/90 backdrop-blur border border-white shadow-[0_4px_18px_-8px_rgba(15,60,120,0.25)] text-left hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-10px_rgba(15,60,120,0.35)] active:scale-[0.98] transition">
        <span className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br ${t.tone} text-white flex items-center justify-center shrink-0 shadow-sm`}>
          <t.icon className="w-5 h-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black text-slate-900 truncate">{t.label}</span>
          <span className="block text-[11px] text-slate-500 truncate">{t.desc}</span>
        </span>
      </button>
    ))}
  </div>
);
