import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// PWA: mobilde "Ana Ekrana Ekle" ile uygulama gibi kurulabilir ve çevrimdışı açılır
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW registration failed:', err));
  });
}

// Otomatik güncelleme: yeni sürüm yayınlandıysa sayfa kendini yeniler
// (telefonda elle "zorla yenile" yapmaya gerek kalmasın).
if (import.meta.env.PROD) {
  const scriptOf = (html: string) => html.match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null;
  const current = scriptOf(document.documentElement.outerHTML);
  let reloading = false;

  const checkForUpdate = async () => {
    if (reloading || !current || !navigator.onLine) return;
    try {
      const res = await fetch('/?v=' + Date.now(), { cache: 'no-store' });
      const latest = scriptOf(await res.text());
      if (latest && latest !== current) {
        reloading = true;
        window.location.reload();
      }
    } catch {
      // ağ yoksa bir sonraki denemede bakılır
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  window.addEventListener('focus', checkForUpdate);
  setInterval(checkForUpdate, 2 * 60 * 1000);
  setTimeout(checkForUpdate, 5000);
}
