/** Telefona/bilgisayara bildirim (Web Push): teklif hatırlatmaları sunucudan gönderilir */
import { supabase } from './supabase';

const VAPID_PUBLIC = 'BEmS4BsSaaJHThsS_esF8NRHVZvEmgjWuH4geyvbdqkwHhHrcAl8FT7WpnBWfQsIAscz6tztRkc5bw2BtP3TUSM';

const toBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
};

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Bu cihazda bildirim açık mı */
export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  return !!(await reg.pushManager.getSubscription());
}

/** Bildirimi aç: izin ister, aboneliği oluşturup sunucuya kaydeder */
export async function enablePush(email?: string): Promise<void> {
  if (!pushSupported()) throw new Error('Bu tarayıcı bildirim desteklemiyor. Uygulamayı ana ekrana ekleyip oradan açın.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Bildirim izni verilmedi. Tarayıcı ayarlarından izin verin.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC) as BufferSource });
  const j = sub.toJSON() as any;
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_email: email || null,
  });
  if (error) throw error;
}

/** Bu cihazda bildirimi kapat */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
