/**
 * Mikrofondan ses kaydı: konuşma bitince (sessizlikte) kendiliğinden durur.
 * Kayıt sunucuya 16 kHz tek kanal WAV olarak gönderilir (Whisper için en uygun biçim).
 */

export const canRecord = () =>
  typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' &&
  !!(window.AudioContext || (window as any).webkitAudioContext);

export interface RecordingHandle {
  /** Kaydı bitirir (gönderilecek ses hazırlanır) */
  stop: () => void;
  /** Kaydı iptal eder (hiçbir şey gönderilmez) */
  cancel: () => void;
  /** Kayıt bitince WAV (base64) — iptal edilir ya da hiç konuşulmazsa null */
  result: Promise<string | null>;
}

export function startRecording(opts: {
  /** Konuştuktan sonra bu kadar susunca durur */
  silenceMs?: number;
  /** Hiç konuşulmazsa bu kadar bekler */
  firstWaitMs?: number;
  maxMs?: number;
  /** 0-1 arası ses seviyesi (ekranda göstermek için) */
  onLevel?: (level: number) => void;
  onSpeech?: () => void;
} = {}): Promise<RecordingHandle> {
  const silenceMs = opts.silenceMs ?? 2000;
  const firstWaitMs = opts.firstWaitMs ?? 8000;
  const maxMs = opts.maxMs ?? 60000;

  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  }).then(stream => {
    const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    let cancelled = false;
    let spoke = false;
    let noise = 0.01;          // ortam gürültüsü (ilk anlarda ölçülür, sonra yavaşça güncellenir)
    let lastVoice = Date.now();
    const t0 = Date.now();

    const tick = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();
      // Eşik: ortam gürültüsünün üstü (araç içi uğultuda da çalışsın)
      const threshold = Math.max(0.012, noise * 2.5);
      if (rms > threshold) {
        lastVoice = now;
        if (!spoke && now - t0 > 150) { spoke = true; opts.onSpeech?.(); }
      } else {
        noise = noise * 0.95 + rms * 0.05;
      }
      opts.onLevel?.(Math.min(1, rms / Math.max(threshold * 3, 0.05)));
      if (spoke && now - lastVoice > silenceMs) finish();
      else if (!spoke && now - t0 > firstWaitMs) finish();
      else if (now - t0 > maxMs) finish();
    }, 80);

    const cleanup = () => {
      window.clearInterval(tick);
      stream.getTracks().forEach(t => t.stop());
      ctx.close().catch(() => undefined);
    };

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      try { rec.state !== 'inactive' ? rec.stop() : rec.onstop?.(new Event('stop')); } catch { /* */ }
    }

    const result = new Promise<string | null>(resolve => {
      rec.onstop = async () => {
        cleanup();
        if (cancelled || !spoke || !chunks.length) { resolve(null); return; }
        try {
          resolve(await toWavBase64(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })));
        } catch {
          resolve(null);
        }
      };
    });

    rec.start(250);
    return {
      stop: () => { spoke = spoke || chunks.length > 0; finish(); },
      cancel: () => { cancelled = true; finish(); },
      result,
    };
  });
}

/** Kaydı çözüp 16 kHz tek kanal 16-bit WAV'a çevirir */
async function toWavBase64(blob: Blob): Promise<string> {
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close().catch(() => undefined);

  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const s = off.createBufferSource();
  s.buffer = decoded;
  s.connect(off.destination);
  s.start();
  const pcm = (await off.startRendering()).getChannelData(0);

  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const w = (o: number, str: string) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const v = Math.max(-1, Math.min(1, pcm[i]));
    out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }

  // base64 (büyük dizilerde yığın taşmasın diye parça parça)
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
