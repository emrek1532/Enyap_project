/**
 * Yerel (Türkiye saatiyle) gün: "yyyy-aa-gg". Kayıtlardaki zamanlar UTC tutulur;
 * `iso.slice(0, 10)` gece 00:00–03:00 arasındaki kayıtları bir önceki güne yazar, bu yüzden her yerde bu kullanılır.
 */
export function localDay(d?: string | Date | number): string {
  const x = d == null ? new Date() : d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return typeof d === 'string' ? d.slice(0, 10) : '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Saatli kayıt (ISO) için yerel gün; sadece tarih olan "yyyy-aa-gg" değerleri olduğu gibi kalır */
export const dayOf = (s?: string) => (!s ? '' : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : localDay(s));
