// Hızlı sayı biçimlendirme: Intl.NumberFormat bir kez kurulur ve saklanır
// (v.toLocaleString('tr-TR') her çağrıda baştan kurar; uzun listelerde yavaşlatır)
const cache = new Map<string, Intl.NumberFormat>();
export const trNum = (v: number, opts: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {}) => {
  const key = `${opts.minimumFractionDigits ?? ''}|${opts.maximumFractionDigits ?? ''}`;
  let f = cache.get(key);
  if (!f) { f = new Intl.NumberFormat('tr-TR', opts); cache.set(key, f); }
  return f.format(v);
};

/** Para: her zaman virgülden sonra iki hane (439.345,15) */
export const trMoney = (v: number) => trNum(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
