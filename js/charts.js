// Thin wrappers around the vendored Chart.js (window.Chart). Colours come from the active theme.
const registry = new Map();
const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const PALETTE = ['#ff6b4a', '#7c5cff', '#13b5a6', '#2f8cff', '#f5a524', '#ec4899', '#22c55e', '#94a3b8'];
export const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

export function destroyAll(prefix = '') {
  for (const [k, c] of registry) if (k.startsWith(prefix)) { c.destroy(); registry.delete(k); }
}

export function makeChart(id, config) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return null;
  if (registry.has(id)) registry.get(id).destroy();
  const ink = css('--muted') || '#5d687c', grid = css('--line') || '#e2e7f1';
  const base = {
    responsive: true, maintainAspectRatio: false, animation: reduce() ? false : { duration: 600 },
    interaction: { mode: 'nearest', intersect: false },
    plugins: { legend: { labels: { color: ink, boxWidth: 12, usePointStyle: true } }, tooltip: { backgroundColor: 'rgba(15,20,40,.92)', padding: 10, cornerRadius: 10, titleFont: { weight: '700' } } },
    scales: {},
  };
  const opts = deepMerge(base, config.options || {});
  for (const s of Object.values(opts.scales || {})) {
    s.ticks = { color: ink, maxRotation: 0, autoSkipPadding: 12, ...(s.ticks || {}) };
    s.grid = { color: grid, drawTicks: false, ...(s.grid || {}) };
    s.border = { display: false, ...(s.border || {}) };
    if (s.title) s.title = { color: ink, display: true, ...s.title };
  }
  const chart = new window.Chart(el, { ...config, options: opts });
  registry.set(id, chart);
  return chart;
}

export function sparkline(id, values, color = '#ffffff') {
  return makeChart(id, {
    type: 'line',
    data: { labels: values.map((_, i) => i), datasets: [{ data: values, borderColor: color, backgroundColor: alpha('#ffffff', 0.18), fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2, spanGaps: true }] },
    options: { plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } }, events: [] },
  });
}

function deepMerge(a, b) {
  const out = Array.isArray(a) ? [...a] : { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? deepMerge(a[k], v) : v;
  return out;
}
