// Uygulama güncellemesi: yayındaki sürüm /version.json'dan okunur (Cloudflare'in statik dosyası;
// Supabase'e istek gitmez). Yeni sürüm varsa ekranda "Yeni sürüm var · Güncelle" şeridi çıkar;
// sürüm numarasına tıklanınca elle de kontrol edilir.

type State = { latest: string | null; message: string | null; busy: boolean };
let state: State = { latest: null, message: null, busy: false };
const subs = new Set<(s: State) => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach(f => f(state)); };

export const getUpdateState = () => state;
export function subscribeUpdate(f: (s: State) => void) { subs.add(f); return () => { subs.delete(f); }; }

/** Yayındaki sürüm (okunamazsa null) */
async function fetchLatest(): Promise<string | null> {
  try {
    const res = await fetch('/version.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    const v = (await res.json())?.version;
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}

/** Arka plan kontrolü: yeni sürüm varsa şeridi gösterir */
export async function checkForUpdate(): Promise<string | null> {
  if (!navigator.onLine) return null;
  const v = await fetchLatest();
  if (v && v !== __APP_VERSION__) { if (state.latest !== v) set({ latest: v }); return v; }
  return null;
}

/** Yeni sürümü yükler: önbellekteki uygulama kabuğu yenilenir, sayfa baştan açılır */
export async function applyUpdate() {
  set({ busy: true, message: 'Yeni sürüm yükleniyor…' });
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch { /* yine de yenile */ }
  window.location.reload();
}

/** Sürüm numarasına tıklanınca: yeni sürüm varsa yükle, yoksa "Güncelsiniz" */
export async function checkNow() {
  if (state.busy) return;
  set({ busy: true, message: 'Kontrol ediliyor…' });
  const v = await fetchLatest();
  if (v && v !== __APP_VERSION__) { set({ latest: v }); await applyUpdate(); return; }
  set({ busy: false, message: v ? `Güncelsiniz · v${__APP_VERSION__}` : 'Sürüm kontrol edilemedi (bağlantı yok?)' });
  setTimeout(() => { if (!state.busy) set({ message: null }); }, 3000);
}

export const dismissUpdateMessage = () => set({ message: null });

/** Arka planda ara ara bakar (uygulama öne gelince, 5 dakikada bir) */
export function startUpdateWatch() {
  if (!import.meta.env.PROD) return;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
  window.addEventListener('focus', () => { checkForUpdate(); });
  setInterval(checkForUpdate, 5 * 60 * 1000);
  setTimeout(checkForUpdate, 5000);
}
