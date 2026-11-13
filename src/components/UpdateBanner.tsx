import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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

/** Yeni sürüm bildirimi ve "Güncelsiniz" mesajı (ekranın üstünde koyu şerit) */
export function UpdateBanner() {
  const { latest, message, busy } = useUpdate();
  const showNew = !!latest && !message;
  if (!showNew && !message) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100] px-3 sm:px-4 pt-safe" role="status">
      <div className="mt-2 mx-auto max-w-xl flex items-center gap-3 rounded-[22px] bg-[#111827] text-white shadow-xl pl-5 pr-2 py-2 min-h-[56px]">
        {showNew ? (
          <>
            <span className="flex-1 min-w-0 text-[15px]">Yeni sürüm hazır: <b className="tabular-nums">v{latest}</b></span>
            <button onClick={() => applyUpdate()} disabled={busy}
              className="shrink-0 rounded-full bg-sky-500 hover:bg-sky-400 px-5 py-2 text-[15px] font-semibold disabled:opacity-60">Güncelle</button>
          </>
        ) : (
          <>
            <span className="flex-1 min-w-0 text-[15px] py-1.5">{message}</span>
            {!busy && <button onClick={dismissUpdateMessage} className="shrink-0 p-2 text-white/60 hover:text-white" aria-label="Kapat"><X className="w-4 h-4" /></button>}
          </>
        )}
      </div>
    </div>
  );
}
