// Small statistics helpers. All functions ignore null/undefined/NaN.
export const clean = (a) => a.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
export const mean = (a) => { a = clean(a); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
export const median = (a) => {
  a = clean(a).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
// Population standard deviation (matches Python statistics.pstdev).
export const pstdev = (a) => {
  a = clean(a); if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};
// Python statistics.quantiles(data, n, method='exclusive'); returns n-1 cut points.
export const quantiles = (a, n = 10) => {
  a = clean(a).sort((x, y) => x - y);
  const N = a.length; if (N < 2) return null;
  const out = [];
  for (let i = 1; i < n; i++) {
    let j = Math.floor((i * (N + 1)) / n);
    const delta = i * (N + 1) - j * n;
    j = Math.min(Math.max(j, 1), N - 1);
    out.push((a[j - 1] * (n - delta) + a[j] * delta) / n);
  }
  return out;
};
export const round = (v, d = 1) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
export const pctChange = (now, before) => (now == null || !before ? null : ((now - before) / before) * 100);
