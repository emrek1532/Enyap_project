import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { applyUpdate, checkNow, dismissUpdateMessage, getUpdateState, subscribeUpdate } from '../lib/appUpdate';

function useUpdate() {
  const [s, setS] = useState(getUpdateState());
  useEffect(() => subscribeUpdate(setS), []);
  return s;
}

/** Sürüm numarası: tıklayınca yeni sürüm var mı bakar */
export function VersionButton({ className = '' }: { className?: string }) {
  const { latest } = useUpdate();
  return (
    <button type="button" onClick={e => { e.stopPropagation(); checkNow(); }}
      className={`tabular-nums hover:text-brand-600 relative ${className}`}
      title={latest ? `Yeni sürüm var: v${latest} · yüklemek için dokunun` : `Sürüm ${__APP_VERSION__} · ${__APP_BUILD__} · güncelleme için dokunun`}>
      v{__APP_VERSION__}
      {latest && <span className="absolute -top-0.5 -right-1.5 w-1.5 h-1.5 rounded-full bg-rose-500" />}
    </button>
  );
}

/** Yeni sürüm bildirimi ve "Güncelsiniz" mesajı (ekranın altında) */
export function UpdateBanner() {
  const { latest, message, busy } = useUpdate();
  const [hidden, setHidden] = useState<string | null>(null);
  const showNew = latest && hidden !== latest && !message;
  if (!showNew && !message) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[100] w-[calc(100%-32px)] max-w-sm pb-safe" role="status">
      <div className="flex items-center gap-3 rounded-2xl bg-slate-900 text-white shadow-lg px-4 py-3 text-sm">
        {showNew ? (
          <>
            <Download className="w-4 h-4 shrink-0 text-emerald-300" />
            <span className="flex-1 min-w-0">Yeni sürüm var <b className="tabular-nums">v{latest}</b></span>
            <button onClick={() => applyUpdate()} disabled={busy}
              className="shrink-0 rounded-full bg-emerald-500 hover:bg-emerald-400 px-3 py-1 text-xs font-bold disabled:opacity-60">Güncelle</button>
            <button onClick={() => setHidden(latest)} className="shrink-0 text-white/60 hover:text-white" aria-label="Kapat"><X className="w-4 h-4" /></button>
          </>
        ) : (
          <>
            <span className="flex-1 min-w-0">{message}</span>
            {!busy && <button onClick={dismissUpdateMessage} className="shrink-0 text-white/60 hover:text-white" aria-label="Kapat"><X className="w-4 h-4" /></button>}
          </>
        )}
      </div>
    </div>
  );
}
