/**
 * Not metninden hatırlatma zamanı çıkarır: "pazartesi saat 9'da", "yarın 14:30", "2 saat sonra",
 * "cuma öğleden sonra 3", "12 ekim sabah". Bulamazsa null döner.
 */
const DAYS = ['pazar', 'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi'];
const MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/’/g, "'");

export function parseReminder(text: string, now = new Date()): Date | null {
  const t = ` ${fold(text)} `;
  let m: RegExpMatchArray | null;

  // Göreli: "2 saat sonra", "yarım saat sonra", "30 dakika sonra", "3 gün sonra"
  if ((m = t.match(/(\d+|yarim|bir|iki|uc)\s*(saat|dakika|dk|gun|hafta)\s*sonra/))) {
    const word: Record<string, number> = { yarim: 0.5, bir: 1, iki: 2, uc: 3 };
    const n = word[m[1]] ?? Number(m[1]);
    const ms = { saat: 3600e3, dakika: 60e3, dk: 60e3, gun: 86400e3, hafta: 7 * 86400e3 }[m[2] as 'saat'];
    const d = new Date(now.getTime() + n * ms);
    if (m[2] === 'gun' || m[2] === 'hafta') { const h = timeOf(t); d.setHours(h?.[0] ?? 9, h?.[1] ?? 0, 0, 0); }
    return d;
  }

  // Gün
  let day: Date | null = null;
  if (/\bbugun\b|\bbu aksam\b/.test(t)) day = new Date(now);
  else if (/yarindan sonra|obur gun|ertesi gun/.test(t)) day = addDays(now, 2);
  else if (/\byarin\b/.test(t)) day = addDays(now, 1);
  else if ((m = t.match(/\b(\d{1,2})\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)/))) {
    day = new Date(now.getFullYear(), MONTHS.indexOf(m[2]), Number(m[1]));
    if (day.getTime() < startOfDay(now).getTime()) day.setFullYear(day.getFullYear() + 1);
  } else if ((m = t.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/)) && !/\d[.:]\d{2}\s*(?:'|da|de|ta|te|$)/.test(m[0])) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
    if (Number(m[2]) >= 1 && Number(m[2]) <= 12) day = new Date(y, Number(m[2]) - 1, Number(m[1]));
  } else {
    // Hafta günleri: en uzun ad önce ("pazartesi" "pazar"ı içerir)
    const order = DAYS.map((d, i) => [d, i] as const).sort((a, b) => b[0].length - a[0].length);
    for (const [name, idx] of order) {
      if (new RegExp(`\\b${name}`).test(t)) {
        let diff = (idx - now.getDay() + 7) % 7;
        const h = timeOf(t);
        if (diff === 0 && (h ? h[0] * 60 + h[1] : 9 * 60) <= now.getHours() * 60 + now.getMinutes()) diff = 7;
        if (/haftaya|gelecek hafta|onumuzdeki hafta/.test(t) && diff < 7) diff += diff === 0 ? 7 : 0;
        day = addDays(now, diff);
        break;
      }
    }
  }

  const h = timeOf(t);
  if (!day && !h) return null;
  const d = new Date(day || now);
  d.setHours(h ? h[0] : 9, h ? h[1] : 0, 0, 0);
  // Sadece saat söylendiyse ve geçtiyse yarın
  if (!day && d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/** Saat: "14:30", "9.30", "saat 9", "9'da", "sabah", "öğlen", "akşam 7", "öğleden sonra 3" */
function timeOf(t: string): [number, number] | null {
  let m: RegExpMatchArray | null;
  let h: number | null = null, min = 0;
  if ((m = t.match(/\b(\d{1,2})[:.](\d{2})\b/)) && Number(m[1]) < 24 && Number(m[2]) < 60) { h = Number(m[1]); min = Number(m[2]); }
  else if ((m = t.match(/saat\s*(\d{1,2})(?:\s*bucuk)?/)) || (m = t.match(/\b(\d{1,2})\s*'?\s*(?:da|de|ta|te)\b/))) {
    h = Number(m[1]); if (/bucuk/.test(m[0])) min = 30;
  }
  const pm = /ogleden sonra|aksam|gece/.test(t);
  if (h === null) {
    if (/\bsabah/.test(t)) h = 9;
    else if (/\boglen|\bogle\b/.test(t)) h = 12;
    else if (/ogleden sonra/.test(t)) h = 14;
    else if (/aksam/.test(t)) h = 19;
    else return null;
  } else if (pm && h < 12) h += 12;
  if (h > 23) return null;
  return [h, min];
}

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** "Pzt 09:00", "Bugün 14:30", "Yarın 09:00" */
export function formatReminder(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400e3);
  if (diff === 0) return `Bugün ${time}`;
  if (diff === 1) return `Yarın ${time}`;
  if (diff > 1 && diff < 7) return `${d.toLocaleDateString('tr-TR', { weekday: 'long' })} ${time}`;
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${time}`;
}

/** datetime-local alanı için yerel saat metni */
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
