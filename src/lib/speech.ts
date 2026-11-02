// Telefonun/tarayıcının kendi konuşma tanıması (Chrome'da Google'ın Türkçe tanıyıcısı).
// Ses sunucuya gönderilmez, Whisper kotası harcanmaz ve sonuç hemen gelir.
// Desteklenmeyen tarayıcılarda çağıran taraf eski yönteme (kayıt + /api/ai/voice) döner.

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const canSpeech = (): boolean => getCtor() !== null;

const ERRORS: Record<string, string> = {
  'not-allowed': 'Mikrofon izni verilmedi. Tarayıcı ayarlarından bu siteye mikrofon izni verin.',
  'service-not-allowed': 'Mikrofon izni verilmedi. Tarayıcı ayarlarından bu siteye mikrofon izni verin.',
  'no-speech': 'Ses algılanamadı, tekrar deneyin.',
  'audio-capture': 'Mikrofon bulunamadı.',
  network: 'Konuşma tanıma için internet bağlantısı gerekiyor.',
};

export interface SpeechSession {
  /** Dinlemeyi bitirir; o ana kadar söylenenler sonuç olarak döner */
  stop: () => void;
  /** Söylenen yazı (konuşma bitince); hiçbir şey anlaşılmadıysa boş */
  result: Promise<string>;
}

/**
 * Dinlemeye başlar. continuous: uzun dikte (not) için; susunca kendiliğinden bitmez, stop ile biter.
 * onInterim: konuşurken anlık yazı (ekranda göstermek için).
 */
export function listen(opts: { continuous?: boolean; onInterim?: (text: string) => void } = {}): SpeechSession {
  const Ctor = getCtor();
  if (!Ctor) return { stop: () => {}, result: Promise.reject(new Error('Bu tarayıcı konuşma tanımayı desteklemiyor.')) };

  const rec = new Ctor();
  rec.lang = 'tr-TR';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.continuous = !!opts.continuous;

  let finalText = '';
  let interim = '';
  let error: string | null = null;

  const result = new Promise<string>((resolve, reject) => {
    rec.onresult = (e: any) => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript ?? '';
        if (e.results[i].isFinal) finalText = `${finalText} ${t}`.trim();
        else interim += t;
      }
      opts.onInterim?.(`${finalText} ${interim}`.trim());
    };
    rec.onerror = (e: any) => {
      if (e.error === 'aborted') return;
      error = ERRORS[e.error] || 'Ses tanınamadı, tekrar deneyin.';
    };
    rec.onend = () => {
      // Dokunarak durdurulduğunda son parça henüz "kesin" olmayabilir; onu da al
      const text = `${finalText} ${interim}`.trim();
      if (text) resolve(text);
      else if (error && error !== ERRORS['no-speech']) reject(new Error(error));
      else resolve('');
    };
  });

  rec.start();
  return { stop: () => rec.stop(), result };
}
