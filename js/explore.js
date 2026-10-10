// Interactive "Explore" view: range/type/unit controls, KPI tiles, charts, heatmap, activity table and health trends.
import { makeChart, sparkline, destroyAll, css, PALETTE, alpha } from './charts.js';
import { esc } from './render.js';
import { mean, median } from './stats.js';

const GROUPS = { run: 'Running', ride: 'Cycling', swim: 'Swimming', walk: 'Walking & hiking', gym: 'Strength & yoga', other: 'Other' };
const GROUP_COLOR = { run: '#ff6b4a', ride: '#2f8cff', swim: '#13b5a6', walk: '#f5a524', gym: '#a855f7', other: '#94a3b8' };
export function typeGroup(a) {
  const t = String(a.type || '').toLowerCase();
  if (a.isRun) return 'run';
  if (/cycl|bik|ride|spin/.test(t)) return 'ride';
  if (/swim/.test(t)) return 'swim';
  if (/walk|hik/.test(t)) return 'walk';
  if (/yoga|strength|cardio|pilates|gym|weight|hiit/.test(t)) return 'gym';
  return 'other';
}
const I = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const KM_PER_MI = 1.609344;
const fmtClock = (s) => { if (s == null || !isFinite(s)) return '–'; s = Math.round(s); const m = Math.floor(s / 60), x = s % 60; return `${m}:${String(x).padStart(2, '0')}`; };
const fmtHMS = (s) => { if (s == null) return '–'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const fmtHours = (s) => { const h = s / 3600; return h >= 100 ? `${Math.round(h).toLocaleString('en-GB')}` : h.toFixed(1); };

export function createExplore(ds, ctx) {
  const end = ds.endDay;
  const allDays = ds.days.concat(ds.activities.map((a) => a.day).filter((d) => d != null));
  const first = allDays.length ? Math.min(...allDays) : end;
  const dated = !(ds.relativeDays && !ds.datedDays);
  const span = end - first + 1;
  const ui = { preset: span > 400 ? '365' : 'all', from: first, to: end, type: 'all', units: 'km', q: '', sort: { k: 'day', dir: -1 }, page: 0, hl: null };
  const dayLabel = (d) => (dated ? new Date(d * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : `day ${d}`);
  const tickLabel = (d, long) => (dated ? new Date(d * 864e5).toLocaleDateString('en-GB', long === 'year' ? { year: 'numeric', timeZone: 'UTC' } : long ? { month: 'short', year: '2-digit', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' }) : `d${Math.round(d)}`);
  const spanKind = (lo, hi) => (hi - lo > 1100 ? 'year' : hi - lo > 200);
  const qrange = (vals, pad = 0.08) => { const v = vals.filter(Number.isFinite).sort((a, b) => a - b); if (v.length < 5) return {}; const a = v[Math.floor(0.02 * (v.length - 1))], b = v[Math.ceil(0.98 * (v.length - 1))]; const p = (b - a) * pad || 5; return { min: Math.floor(a - p), max: Math.ceil(b + p) }; };
  const iso = (d) => new Date(d * 864e5).toISOString().slice(0, 10);
  const uDist = (m) => (ui.units === 'mi' ? m / 1000 / KM_PER_MI : m / 1000);
  const uPace = (sPerKm) => (ui.units === 'mi' ? sPerKm * KM_PER_MI : sPerKm);
  const uLbl = () => (ui.units === 'mi' ? 'mi' : 'km');

  function range() {
    if (ui.preset === 'all') return [first, end];
    if (ui.preset === 'custom') return [Math.max(first, Math.min(ui.from, ui.to)), Math.min(end, Math.max(ui.from, ui.to))];
    return [Math.max(first, end - Number(ui.preset) + 1), end];
  }
  const inRange = (a, [lo, hi]) => a.day != null && a.day >= lo && a.day <= hi;
  const typeOk = (a) => ui.type === 'all' || typeGroup(a) === ui.type;
  const valid = (a) => !(a.isRun && a.distM > 0 && a.durS > 0 && (a.durS / (a.distM / 1000) < 120 || a.durS / (a.distM / 1000) > 1200));
  const acts = () => ds.activities.filter((a) => valid(a) && typeOk(a));

  // ---------- controls ----------
  function controlsHtml() {
    const groups = [...new Set(ds.activities.map(typeGroup))];
    const seg = (name, opts, cur) => `<div class="seg" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button type="button" data-${name}="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
    return `<div class="controls">
      <div class="ctl"><span>Date range</span>${seg('preset', [['30', '30d'], ['90', '90d'], ['365', '1y'], ['all', 'All'], ['custom', 'Custom']], ui.preset)}</div>
      ${ui.preset === 'custom' ? `<div class="ctl dates"><label>From<input type="date" id="x-from" value="${dated ? iso(range()[0]) : ''}" ${dated ? '' : 'disabled'}></label><label>To<input type="date" id="x-to" value="${dated ? iso(range()[1]) : ''}" ${dated ? '' : 'disabled'}></label></div>` : ''}
      <label class="ctl">Activity type<select id="x-type"><option value="all">All types</option>${groups.map((g) => `<option value="${g}" ${ui.type === g ? 'selected' : ''}>${GROUPS[g]}</option>`).join('')}</select></label>
      <div class="ctl"><span>Units</span>${seg('units', [['km', 'km'], ['mi', 'miles']], ui.units)}</div>
    </div>`;
  }

  // ---------- KPI tiles ----------
  function bucketize(list, [lo, hi], val) {
    const len = hi - lo + 1; const size = Math.max(7, Math.ceil(len / 24)); const n = Math.ceil(len / size);
    const out = new Array(n).fill(0);
    for (const a of list) { const i = Math.floor((a.day - lo) / size); if (i >= 0 && i < n) out[i] += val(a) || 0; }
    return out;
  }
  function kpis() {
    const r = range(); const len = r[1] - r[0] + 1; const prev = [r[0] - len, r[0] - 1];
    const cur = acts().filter((a) => inRange(a, r)), before = acts().filter((a) => inRange(a, prev));
    const sum = (l, f) => l.reduce((s, a) => s + (f(a) || 0), 0);
    const runs = (l) => l.filter((a) => a.isRun && a.distM > 0 && a.durS > 0);
    const pace = (l) => { const rr = runs(l); const d = sum(rr, (a) => a.distM); return d ? sum(rr, (a) => a.durS) / (d / 1000) : null; };
    const hr = (l) => mean(l.map((a) => a.avgHr).filter(Boolean));
    const longest = (l) => (l.length ? Math.max(0, ...l.map((a) => a.distM || 0)) : 0);
    const tr = (now, then, lowerBetter = false) => {
      if (now == null || then == null || !then || !before.length) return '<span class="trend">no earlier period to compare</span>';
      const p = ((now - then) / then) * 100; const up = p > 0;
      const good = lowerBetter ? !up : up;
      return `<span class="trend">${Math.abs(p) < 1 ? '→ steady' : `${up ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%`} vs previous ${len} days${Math.abs(p) >= 1 ? (good ? '' : '') : ''}</span>`;
    };
    const tiles = [
      ['t1', 'run', 'Distance', uDist(sum(cur, (a) => a.distM)).toLocaleString('en-GB', { maximumFractionDigits: 0 }), uLbl(), tr(sum(cur, (a) => a.distM), sum(before, (a) => a.distM)), bucketize(cur, r, (a) => uDist(a.distM || 0))],
      ['t2', 'calendar', 'Activities', cur.length.toLocaleString('en-GB'), '', tr(cur.length, before.length), bucketize(cur, r, () => 1)],
      ['t3', 'bolt', 'Moving time', fmtHours(sum(cur, (a) => a.durS)), 'h', tr(sum(cur, (a) => a.durS), sum(before, (a) => a.durS)), bucketize(cur, r, (a) => (a.durS || 0) / 3600)],
      ['t4', 'gauge', 'Run pace', pace(cur) ? fmtClock(uPace(pace(cur))) : '–', pace(cur) ? `/${uLbl()}` : '', tr(pace(cur), pace(before), true), null],
      ['t5', 'heart', 'Avg heart rate', hr(cur) ? Math.round(hr(cur)) : '–', hr(cur) ? 'bpm' : '', tr(hr(cur), hr(before), true), null],
      ['t6', 'trophy', 'Longest', longest(cur) ? uDist(longest(cur)).toFixed(1) : '–', longest(cur) ? uLbl() : '', `<span class="trend">${cur.length ? 'single activity in range' : 'no activities in range'}</span>`, null],
    ];
    // pace / HR sparklines from rolling buckets
    const rb = (f) => { const len2 = r[1] - r[0] + 1; const size = Math.max(7, Math.ceil(len2 / 24)); const out = []; for (let s = r[0]; s <= r[1]; s += size) { const l = cur.filter((a) => a.day >= s && a.day < s + size); const v = f(l); out.push(v == null ? null : v); } return out; };
    tiles[3][6] = rb((l) => { const p = pace(l); return p ? -uPace(p) : null; });
    tiles[4][6] = rb(hr);
    tiles[5][6] = rb((l) => (l.length ? uDist(longest(l)) : null));
    return tiles;
  }

  // ---------- render ----------
  function render() {
    destroyAll('x-');
    const r = range();
    const body = document.getElementById('b-sec-explore');
    const tiles = kpis();
    const runsIn = acts().filter((a) => a.isRun && inRange(a, r) && a.distM > 0 && a.durS > 0);
    body.innerHTML = `${controlsHtml()}
      <p class="scope">Showing <strong>${esc(dayLabel(r[0]))} – ${esc(dayLabel(r[1]))}</strong>${ui.type !== 'all' ? `, ${esc(GROUPS[ui.type].toLowerCase())} only` : ''}. These charts follow your selection; the coaching verdicts below always use the latest 7–30 days of your data.</p>
      <div class="kpis" role="list">${tiles.map(([c, ic, lab, val, unit, trend], i) => `<div class="tile ${c}" role="listitem"><span class="lab">${I(ic)}${lab}</span><span class="val" data-count="${esc(val)}">${esc(val)}${unit ? `<small>${esc(unit)}</small>` : ''}</span>${trend}<canvas id="x-spark-${i}" aria-hidden="true"></canvas></div>`).join('')}</div>
      <div class="charts">
        ${box('x-heat', 'Activity calendar', 'calendar', '', 'wide', heatmapHtml(r))}
        ${box('x-month', ui.preset === 'all' || r[1] - r[0] > 730 ? 'Distance per month (last 24 months of range)' : 'Distance per month', 'chart', 'tall', 'wide')}
        ${box('x-year', 'Volume by year (all time)', 'chart')}
        ${box('x-donut', 'Activity mix', 'spark')}
        ${box('x-pace', 'Run pace over time', 'gauge', 'tall', 'wide', runsIn.length < 2 ? empty('Needs at least 2 runs with distance and time in this range.') : '')}
        ${box('x-scatter', 'Pace vs heart rate', 'heart', 'tall', '', runsIn.filter((a) => a.avgHr).length < 3 ? empty('Needs at least 3 runs with heart rate in this range.') : '')}
        ${box('x-effort', ctx().maxHr ? 'Time by effort zone (% of max HR)' : 'Time by average heart rate', 'pulse', 'tall')}
        ${box('x-pb', 'Personal-best progression (all time)', 'trophy', 'tall', 'wide')}
      </div>`;
    // tiles
    tiles.forEach((t, i) => { if (t[6] && t[6].some((v) => v)) sparkline(`x-spark-${i}`, t[6]); });
    animateCounts(body);
    chartMonth(r); chartYear(); chartDonut(r); if (runsIn.length >= 2) chartPace(runsIn); if (runsIn.filter((a) => a.avgHr).length >= 3) chartScatter(runsIn); chartEffort(r); chartPB();
    wireControls(body);
    renderTable();
  }
  const empty = (msg) => `<div class="empty">${esc(msg)}</div>`;
  function box(id, title, icon, size = '', cls = '', inner = null) {
    return `<figure class="chart ${cls}" aria-labelledby="${id}-t"><h3 id="${id}-t">${I(icon)}<span>${esc(title)}</span></h3><div class="cv ${size}">${inner || `<canvas id="${id}" role="img" aria-label="${esc(title)} chart"></canvas>`}</div></figure>`;
  }

  function heatmapHtml([lo, hi]) {
    const startDay = Math.max(lo, hi - 7 * 53 + 1);
    const dist = new Map(), cnt = new Map();
    for (const a of acts()) if (a.day >= startDay && a.day <= hi) { dist.set(a.day, (dist.get(a.day) || 0) + (a.distM || 0) / 1000 + (a.distM ? 0 : (a.durS || 0) / 600)); cnt.set(a.day, (cnt.get(a.day) || 0) + 1); }
    const vals = [...dist.values()].sort((a, b) => a - b);
    const q = (p) => vals[Math.floor(p * (vals.length - 1))] || 0;
    const th = [q(0.25), q(0.5), q(0.8)];
    // align columns to weeks starting Monday (dated) or to day 1
    const dow = (d) => (dated ? (new Date(d * 864e5).getUTCDay() + 6) % 7 : (d - startDay) % 7);
    let cells = '';
    for (let i = 0; i < dow(startDay); i++) cells += '<i class="x"></i>';
    let active = 0;
    for (let d = startDay; d <= hi; d++) {
      const v = dist.get(d) || 0; const c = cnt.get(d) || 0; if (c) active++;
      const l = !c ? 0 : v <= th[0] ? 1 : v <= th[1] ? 2 : v <= th[2] ? 3 : 4;
      cells += `<i class="${l ? 'l' + l : ''}" title="${esc(dayLabel(d))}: ${c ? `${c} activit${c > 1 ? 'ies' : 'y'}` : 'rest'}"></i>`;
    }
    const weeks = Math.ceil((hi - startDay + 1) / 7);
    return `<div class="heat-wrap" tabindex="0" aria-label="Activity calendar: ${active} active days out of ${hi - startDay + 1}"><div class="heat${weeks <= 30 ? ' big' : ''}">${cells}</div></div>
      <div class="legend"><span>Less</span><i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>More</span><span class="sr-only">.</span></div>
      <p class="note">${active} active days in the last ${weeks} weeks shown (colour = distance that day). Hover a square for details.</p>`;
  }

  function monthBuckets([lo, hi]) {
    if (dated) {
      const d1 = new Date(hi * 864e5); const keys = [];
      const months = Math.min(24, Math.max(1, Math.round((hi - lo) / 30.44) + 1));
      for (let i = months - 1; i >= 0; i--) { const d = new Date(Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth() - i, 1)); keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`); }
      const keyOf = (day) => iso(day).slice(0, 7);
      const label = (k) => new Date(k + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
      return { keys, keyOf, label };
    }
    const keys = []; for (let s = lo; s <= hi; s += 28) keys.push(s);
    return { keys, keyOf: (day) => keys.filter((k) => k <= day).pop(), label: (k) => `d${k}–${Math.min(k + 27, hi)}` };
  }
  function chartMonth(r) {
    const { keys, keyOf, label } = monthBuckets(r);
    const groups = ui.type === 'all' ? [...new Set(acts().map(typeGroup))] : [ui.type];
    const sets = groups.map((g) => {
      const m = new Map(keys.map((k) => [k, 0]));
      for (const a of acts()) if (typeGroup(a) === g && a.day <= r[1] && a.distM) { const k = keyOf(a.day); if (m.has(k)) m.set(k, m.get(k) + uDist(a.distM)); }
      return { label: GROUPS[g], data: keys.map((k) => +m.get(k).toFixed(1)), backgroundColor: GROUP_COLOR[g], borderRadius: 6, maxBarThickness: 28 };
    }).filter((s) => s.data.some((v) => v > 0));
    makeChart('x-month', { type: 'bar', data: { labels: keys.map(label), datasets: sets }, options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, title: { text: uLbl() } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)} ${uLbl()}` } } } } });
  }
  function chartYear() {
    const m = new Map();
    if (!dated) { const el = document.getElementById('x-year'); if (el) el.parentElement.innerHTML = empty('Needs calendar dates (the demo data uses day numbers).'); return; }
    for (const a of acts()) if (a.distM && a.day != null) { const y = new Date(a.day * 864e5).getUTCFullYear(); const o = m.get(y) || { d: 0, n: 0 }; o.d += uDist(a.distM); o.n++; m.set(y, o); }
    const ys = [...m.keys()].sort();
    if (!ys.length) { document.getElementById('x-year').parentElement.innerHTML = empty('No activities with distance.'); return; }
    const max = Math.max(...ys.map((y) => m.get(y).d));
    makeChart('x-year', { type: 'bar', data: { labels: ys, datasets: [{ label: `Distance (${uLbl()})`, data: ys.map((y) => +m.get(y).d.toFixed(0)), backgroundColor: ys.map((y) => (m.get(y).d === max ? '#ff6b4a' : alpha('#7c5cff', 0.75))), borderRadius: 8 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y.toLocaleString('en-GB')} ${uLbl()} · ${m.get(+c.label).n} activities` } } }, scales: { x: { grid: { display: false } }, y: { title: { text: uLbl() } } } } });
  }
  function chartDonut(r) {
    const m = new Map(); for (const a of ds.activities) if (inRange(a, r) && valid(a)) { const g = typeGroup(a); m.set(g, (m.get(g) || 0) + 1); }
    const gs = [...m.keys()];
    if (!gs.length) { document.getElementById('x-donut').parentElement.innerHTML = empty('No activities in this range.'); return; }
    makeChart('x-donut', { type: 'doughnut', data: { labels: gs.map((g) => GROUPS[g]), datasets: [{ data: gs.map((g) => m.get(g)), backgroundColor: gs.map((g) => GROUP_COLOR[g]), borderColor: css('--card'), borderWidth: 3, hoverOffset: 8 }] },
      options: { cutout: '62%', plugins: { legend: { position: 'right' } }, onClick: (e, els) => { if (els.length) { ui.type = gs[els[0].index]; render(); } } } });
  }
  function chartPace(runs) {
    const pts = runs.map((a) => ({ x: a.day, y: uPace(a.durS / (a.distM / 1000)) })).sort((a, b) => a.x - b.x);
    const w = Math.max(5, Math.min(20, Math.round(pts.length / 12)));
    const roll = pts.map((p, i) => ({ x: p.x, y: mean(pts.slice(Math.max(0, i - w + 1), i + 1).map((q) => q.y)) }));
    const long = pts.length ? spanKind(pts[0].x, pts[pts.length - 1].x) : false; const yr = qrange(pts.map((p) => p.y));
    makeChart('x-pace', { type: 'scatter', data: { datasets: [
      { label: 'Each run', data: pts, backgroundColor: alpha('#ff6b4a', 0.45), pointRadius: pts.length > 600 ? 2 : 3.5, pointHoverRadius: 6 },
      { label: `Rolling average (${w} runs)`, type: 'line', data: roll, borderColor: '#7c5cff', borderWidth: 3, pointRadius: 0, tension: 0.3 } ] },
      options: { animation: pts.length > 1500 ? false : undefined, scales: { x: { type: 'linear', ticks: { callback: (v) => tickLabel(v, long) } }, y: { reverse: true, ...yr, title: { text: `pace (min/${uLbl()})` }, ticks: { callback: (v) => fmtClock(v) } } },
        plugins: { tooltip: { callbacks: { title: (c) => dayLabel(c[0].parsed.x), label: (c) => `${c.dataset.label}: ${fmtClock(c.parsed.y)} /${uLbl()}` } } } } });
  }
  function chartScatter(runs) {
    const rs = runs.filter((a) => a.avgHr);
    const lo = Math.min(...rs.map((a) => a.day)), hi = Math.max(...rs.map((a) => a.day));
    const col = (d) => { const f = hi > lo ? (d - lo) / (hi - lo) : 1; return alpha(f > 0.66 ? '#ff6b4a' : f > 0.33 ? '#7c5cff' : '#13b5a6', 0.35 + 0.5 * f); };
    const data = rs.map((a) => ({ x: a.avgHr, y: uPace(a.durS / (a.distM / 1000)), d: a.day, km: uDist(a.distM) }));
    makeChart('x-scatter', { type: 'scatter', data: { datasets: [{ label: 'Runs (older = teal, newer = coral)', data, pointBackgroundColor: data.map((p) => col(p.d)), pointBorderColor: 'transparent', pointRadius: data.length > 600 ? 2.5 : 4, pointHoverRadius: 7 }] },
      options: { scales: { x: { ...qrange(data.map((p) => p.x), 0.05), title: { text: 'average heart rate (bpm)' } }, y: { reverse: true, ...qrange(data.map((p) => p.y)), title: { text: `pace (min/${uLbl()})` }, ticks: { callback: (v) => fmtClock(v) } } },
        plugins: { tooltip: { callbacks: { title: (c) => dayLabel(c[0].raw.d), label: (c) => `${fmtClock(c.parsed.y)} /${uLbl()} at ${c.parsed.x} bpm · ${c.raw.km.toFixed(1)} ${uLbl()}` } } } } });
  }
  function chartEffort(r) {
    const maxHr = ctx().maxHr; const list = acts().filter((a) => inRange(a, r) && a.avgHr && a.durS);
    if (!list.length) { document.getElementById('x-effort').parentElement.innerHTML = empty('No activities with heart rate in this range.'); return; }
    const bands = maxHr ? [['Zone 1 (<60%)', 0, 0.6], ['Zone 2 (60–70%)', 0.6, 0.7], ['Zone 3 (70–80%)', 0.7, 0.8], ['Zone 4 (80–90%)', 0.8, 0.9], ['Zone 5 (90%+)', 0.9, 9]].map(([l, a, b]) => [l, a * maxHr, b * maxHr])
      : [['under 120', 0, 120], ['120–134', 120, 135], ['135–149', 135, 150], ['150–164', 150, 165], ['165+', 165, 999]];
    const mins = bands.map(([, a, b]) => list.filter((x) => x.avgHr >= a && x.avgHr < b).reduce((s, x) => s + x.durS / 60, 0));
    makeChart('x-effort', { type: 'bar', data: { labels: bands.map((b) => b[0]), datasets: [{ label: 'hours', data: mins.map((m) => +(m / 60).toFixed(1)), backgroundColor: ['#13b5a6', '#2f8cff', '#7c5cff', '#f5a524', '#ff4f7b'], borderRadius: 8 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.x} h of activities` } } }, scales: { x: { title: { text: 'hours' } }, y: { grid: { display: false } } } } });
    const fig = document.getElementById('x-effort').closest('figure');
    fig.insertAdjacentHTML('beforeend', `<p class="note">Each activity is placed by its <em>average</em> heart rate${maxHr ? ` (max HR ${maxHr} bpm)` : '; add your max HR under "Your details" to see Garmin-style zones'}.</p>`);
  }
  function pbSeries() {
    const bands = [['5 km', 4900, 5300, '#ff6b4a'], ['10 km', 9800, 10500, '#7c5cff'], ['Half marathon', 21000, 21600, '#13b5a6'], ['Marathon', 42000, 43000, '#f5a524']];
    const runs = ds.activities.filter((a) => a.isRun && valid(a) && a.distM > 0 && a.durS > 0 && a.day != null).sort((a, b) => a.day - b.day);
    return bands.map(([label, lo, hi, color]) => {
      let best = Infinity; const pts = [];
      for (const a of runs) if (a.distM >= lo && a.distM <= hi && a.durS < best) { best = a.durS; pts.push({ x: a.day, y: a.durS / 60, a }); }
      return { label, color, pts };
    }).filter((s) => s.pts.length);
  }
  function chartPB() {
    const s = pbSeries();
    if (!s.length) { document.getElementById('x-pb').parentElement.innerHTML = empty('No runs close to 5 km, 10 km, half or full marathon distance.'); return; }
    const lo = Math.min(...s.flatMap((x) => x.pts.map((p) => p.x))); const long = spanKind(lo, end);
    for (const x of s) { const lp = x.pts[x.pts.length - 1]; x.pts.push({ x: end, y: lp.y, a: lp.a, ext: true }); }
    makeChart('x-pb', { type: 'line', data: { datasets: s.map((x) => ({ label: x.label, data: x.pts, borderColor: x.color, backgroundColor: x.color, stepped: 'before', pointRadius: x.pts.map((p) => (p.ext ? 0 : 5)), pointHoverRadius: 8, borderWidth: 2 })) },
      options: { interaction: { mode: 'nearest', intersect: true }, scales: { x: { type: 'linear', ticks: { callback: (v) => tickLabel(v, long) } }, y: { type: 'logarithmic', title: { text: 'finish time' }, ticks: { callback: (v) => (Number.isInteger(Math.log10(v)) || [20, 30, 45, 60, 90, 120, 180, 240].includes(v) ? fmtHMS(v * 60) : '') } } },
        plugins: { tooltip: { filter: (c) => !c.raw.ext, callbacks: { title: (c) => dayLabel(c[0].parsed.x), label: (c) => `New ${c.dataset.label} best: ${fmtHMS(c.parsed.y * 60)}` } } },
        onClick: (e, els, chart) => { if (els.length) { const p = chart.data.datasets[els[0].datasetIndex].data[els[0].index]; focusActivity(p.a); } } } });
    document.getElementById('x-pb').closest('figure').insertAdjacentHTML('beforeend', '<p class="note">Each step is a new fastest whole run near that distance. Click a point to find the run in the activity table.</p>');
  }

  function wireControls(body) {
    body.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { ui.preset = b.dataset.preset; if (ui.preset === 'custom') { const [lo, hi] = range(); ui.from = Math.max(first, hi - 89); ui.to = hi; } ui.page = 0; render(); }));
    body.querySelectorAll('[data-units]').forEach((b) => b.addEventListener('click', () => { ui.units = b.dataset.units; render(); }));
    body.querySelector('#x-type').addEventListener('change', (e) => { ui.type = e.target.value; ui.page = 0; render(); });
    const f = body.querySelector('#x-from'), t = body.querySelector('#x-to');
    const set = () => { const a = Date.parse(f.value), b = Date.parse(t.value); if (isFinite(a) && isFinite(b)) { ui.from = Math.floor(a / 864e5); ui.to = Math.floor(b / 864e5); render(); } };
    f?.addEventListener('change', set); t?.addEventListener('change', set);
  }
  function animateCounts(root) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.querySelectorAll('.tile .val').forEach((el) => {
      const raw = el.dataset.count; const n = Number(String(raw).replace(/,/g, ''));
      if (!isFinite(n) || /:/.test(raw) || n === 0) return;
      const small = el.querySelector('small')?.outerHTML || ''; const dp = (String(raw).split('.')[1] || '').length; const t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 700); const v = n * (1 - Math.pow(1 - k, 3)); el.innerHTML = `${v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}${small}`; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  // ---------- activity table ----------
  const COLS = [['day', 'Date'], ['type', 'Type'], ['title', 'Title'], ['dist', 'Distance', 1], ['durS', 'Time', 1], ['pace', 'Pace', 1], ['avgHr', 'Avg HR', 1], ['gainM', 'Ascent', 1]];
  function rows() {
    const r = range(); const q = ui.q.trim().toLowerCase();
    let list = acts().filter((a) => inRange(a, r) || (ui.hl && a === ui.hl));
    if (q) list = list.filter((a) => `${a.type} ${a.title || ''} ${dayLabel(a.day)} ${iso(a.day)}`.toLowerCase().includes(q));
    const key = (a) => { const k = ui.sort.k; if (k === 'dist') return a.distM ?? -1; if (k === 'pace') return a.isRun && a.distM ? a.durS / a.distM : Infinity; if (k === 'type' || k === 'title') return String(a[k] || '').toLowerCase(); return a[k] ?? -1; };
    return list.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * ui.sort.dir; });
  }
  function renderTable() {
    const el = document.getElementById('b-sec-activities'); if (!el) return;
    const list = rows(); const per = 25; const pages = Math.max(1, Math.ceil(list.length / per));
    if (ui.hl) { const i = list.indexOf(ui.hl); if (i >= 0) ui.page = Math.floor(i / per); }
    ui.page = Math.min(ui.page, pages - 1);
    const slice = list.slice(ui.page * per, ui.page * per + per);
    const keep = document.activeElement && document.activeElement.id === 'x-q';
    el.innerHTML = `<div class="tbl-tools"><input type="search" id="x-q" placeholder="Search type, title or date…" aria-label="Search activities" value="${esc(ui.q)}"><span class="note">${list.length.toLocaleString('en-GB')} activities in the selected range${ui.type !== 'all' ? ` (${esc(GROUPS[ui.type].toLowerCase())})` : ''}</span></div>
      <div class="table-wrap"><table><caption class="sr-only">Activities, sortable</caption><thead><tr>${COLS.map(([k, l, n]) => `<th class="${n ? 'num' : ''}" aria-sort="${ui.sort.k === k ? (ui.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}">${l}</button></th>`).join('')}</tr></thead>
      <tbody>${slice.map((a) => { const g = typeGroup(a); return `<tr class="${a === ui.hl ? 'hl' : ''}"><td>${esc(dayLabel(a.day))}</td><td><span class="type-dot ${g}"></span>${esc(prettyType(a.type))}</td><td>${esc(a.title || '')}</td><td class="num">${a.distM ? `${uDist(a.distM).toFixed(2)} ${uLbl()}` : '–'}</td><td class="num">${fmtHMS(a.durS)}</td><td class="num">${a.isRun && a.distM ? `${fmtClock(uPace(a.durS / (a.distM / 1000)))}/${uLbl()}` : '–'}</td><td class="num">${a.avgHr ? Math.round(a.avgHr) : '–'}</td><td class="num">${a.gainM != null ? `${Math.round(a.gainM)} m` : '–'}</td></tr>`; }).join('') || `<tr><td colspan="8">No activities match.</td></tr>`}</tbody></table></div>
      <div class="pager"><button type="button" data-pg="-1" ${ui.page ? '' : 'disabled'}>‹ Newer</button><span>Page ${ui.page + 1} of ${pages}</span><button type="button" data-pg="1" ${ui.page < pages - 1 ? '' : 'disabled'}>Older ›</button></div>`;
    el.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.sort; ui.sort = { k, dir: ui.sort.k === k ? -ui.sort.dir : (k === 'type' || k === 'title' || k === 'pace' ? 1 : -1) }; ui.page = 0; ui.hl = null; renderTable(); }));
    el.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => { ui.page += Number(b.dataset.pg); ui.hl = null; renderTable(); }));
    const q = el.querySelector('#x-q');
    q.addEventListener('input', () => { ui.q = q.value; ui.page = 0; ui.hl = null; renderTable(); });
    if (keep) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  const prettyType = (t) => String(t || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  function focusActivity(a) {
    ui.hl = a; ui.q = ''; ui.sort = { k: 'day', dir: -1 }; renderTable();
    document.getElementById('sec-activities').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const row = document.querySelector('#sec-activities tr.hl'); row?.setAttribute('tabindex', '-1'); row?.focus({ preventScroll: true });
  }
  function focusDay(day) { const a = ds.activities.filter((x) => x.day === day && x.isRun).sort((x, y) => (y.distM || 0) - (x.distM || 0))[0] || ds.activities.find((x) => x.day === day); if (a) focusActivity(a); }

  // ---------- health trends (recovery + load sections) ----------
  function healthCharts(results) {
    destroyAll('h-');
    const [lo, hi] = range();
    const series = (f) => ds.series(f, lo, hi).filter((p) => p.v != null).map((p) => ({ x: p.day, y: p.v }));
    const roll = (pts, w) => pts.map((p, i) => ({ x: p.x, y: mean(pts.filter((q) => q.x > p.x - w && q.x <= p.x).map((q) => q.y)) }));
    const long = spanKind(lo, hi);
    const xs = { type: 'linear', min: lo, max: hi, ticks: { callback: (v) => tickLabel(v, long) } };
    const tt = (unit) => ({ callbacks: { title: (c) => dayLabel(c[0].parsed.x), label: (c) => `${c.dataset.label}: ${typeof c.parsed.y === 'number' ? (Math.round(c.parsed.y * 10) / 10) : c.parsed.y}${unit}` } });
    const band = (lo2, hi2, label, color) => [{ label: `${label} (low)`, data: [{ x: lo, y: lo2 }, { x: hi, y: lo2 }], borderWidth: 0, pointRadius: 0, fill: false, borderColor: 'transparent' }, { label, data: [{ x: lo, y: hi2 }, { x: hi, y: hi2 }], borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: alpha(color, 0.14), borderColor: 'transparent' }];
    const hideLow = { legend: { labels: { filter: (i) => !/\(low\)/.test(i.text) } } };
    const out = { recovery: [], load: [] };
    const rhr = series('rhr');
    if (rhr.length >= 5) out.recovery.push(['h-rhr', 'Resting heart rate', 'heart', () => { const r = results.resting_hr; makeChart('h-rhr', { type: 'line', data: { datasets: [...(r?.baseline != null ? band(r.baseline - 3, r.baseline + 3, `Usual range (baseline ${Math.round(r.baseline)} ±3)`, '#13b5a6') : []), { label: 'Daily', data: rhr, borderColor: alpha('#ff4f7b', 0.5), pointRadius: rhr.length > 120 ? 0 : 2, borderWidth: 1.5 }, { label: '7-day average', data: roll(rhr, 7), borderColor: '#ff4f7b', borderWidth: 3, pointRadius: 0, tension: 0.3 }] }, options: { scales: { x: xs, y: { title: { text: 'bpm' } } }, plugins: { ...hideLow, tooltip: tt(' bpm') } } }); }]);
    const hrv = series('hrv');
    if (hrv.length >= 5) out.recovery.push(['h-hrv', 'Overnight HRV', 'pulse', () => { const r = results.hrv; makeChart('h-hrv', { type: 'line', data: { datasets: [...(r?.lo != null ? band(r.lo, r.hi, `Usual range ${Math.round(r.lo)}–${Math.round(r.hi)} ms`, '#7c5cff') : []), { label: 'Nightly', data: hrv, borderColor: alpha('#7c5cff', 0.45), pointRadius: hrv.length > 120 ? 0 : 2, borderWidth: 1.5 }, { label: '7-day average', data: roll(hrv, 7), borderColor: '#7c5cff', borderWidth: 3, pointRadius: 0, tension: 0.3 }] }, options: { scales: { x: xs, y: { title: { text: 'ms' } } }, plugins: { ...hideLow, tooltip: tt(' ms') } } }); }]);
    const sl = series('sleepH'), sc = series('sleepScore');
    if (sl.length >= 5) out.recovery.push(['h-sleep', 'Sleep', 'moon', () => makeChart('h-sleep', { data: { datasets: [{ type: 'bar', label: 'Hours asleep', data: sl, backgroundColor: sl.map((p) => (p.y >= 7 ? alpha('#2f8cff', 0.8) : p.y >= 6 ? alpha('#f5a524', 0.85) : alpha('#ff4f7b', 0.85))), borderRadius: 4, yAxisID: 'y' }, { type: 'line', label: '7-hour target', data: [{ x: lo, y: 7 }, { x: hi, y: 7 }], borderColor: '#13b5a6', borderDash: [6, 5], pointRadius: 0, borderWidth: 2, yAxisID: 'y' }, ...(sc.length ? [{ type: 'line', label: 'Sleep score', data: sc, borderColor: '#7c5cff', pointRadius: 0, borderWidth: 2, tension: 0.3, yAxisID: 'y2' }] : [])] }, options: { scales: { x: { ...xs, offset: true }, y: { min: 0, title: { text: 'hours' } }, ...(sc.length ? { y2: { position: 'right', min: 0, max: 100, grid: { display: false }, title: { text: 'score' } } } : {}) }, plugins: { tooltip: tt('') } } })]);
    const bb = series('bbMax'), bbn = series('bbMin');
    if (bb.length >= 5) out.recovery.push(['h-bb', 'Body Battery', 'battery', () => makeChart('h-bb', { type: 'line', data: { datasets: [{ label: 'Daily low', data: bbn, borderColor: alpha('#f5a524', 0.6), pointRadius: 0, borderWidth: 1.5 }, { label: 'Daily high', data: bb, borderColor: '#13b5a6', backgroundColor: alpha('#13b5a6', 0.15), fill: bbn.length ? '-1' : false, pointRadius: bb.length > 120 ? 0 : 2, borderWidth: 2.5, tension: 0.3 }, { label: 'High reserve (76+)', data: [{ x: lo, y: 76 }, { x: hi, y: 76 }], borderColor: '#16a34a', borderDash: [6, 5], pointRadius: 0, borderWidth: 2 }] }, options: { scales: { x: xs, y: { min: 0, max: 100 } }, plugins: { tooltip: tt('') } } })]);
    const ac = series('acute'), ch = series('chronic');
    const ratio = ds.series('acute', lo, hi).map((p) => { const r = ds.daily.get(p.day); return r && r.acute != null && r.chronic ? { x: p.day, y: r.acute / r.chronic } : null; }).filter(Boolean);
    if (ac.length >= 5) out.load.push(['h-load', 'Acute vs chronic load', 'gauge', () => makeChart('h-load', { type: 'line', data: { datasets: [{ label: 'Acute (7-day)', data: ac, borderColor: '#ff6b4a', backgroundColor: alpha('#ff6b4a', 0.12), fill: true, pointRadius: 0, borderWidth: 2.5, tension: 0.3 }, { label: 'Chronic', data: ch, borderColor: '#2f8cff', pointRadius: 0, borderWidth: 2.5, tension: 0.3 }] }, options: { scales: { x: xs, y: { title: { text: 'load' } } }, plugins: { tooltip: tt('') } } })]);
    if (ratio.length >= 5) out.load.push(['h-ratio', 'Acute : chronic ratio', 'chart', () => makeChart('h-ratio', { type: 'line', data: { datasets: [...band(0.8, 1.3, 'Sweet spot 0.8–1.3', '#16a34a'), { label: 'Danger zone (>1.5)', data: [{ x: lo, y: 1.5 }, { x: hi, y: 1.5 }], borderColor: '#dc2626', borderDash: [6, 5], pointRadius: 0, borderWidth: 2 }, { label: 'Ratio', data: ratio, borderColor: '#7c5cff', pointRadius: 0, borderWidth: 2.5, tension: 0.3 }] }, options: { scales: { x: xs, y: { min: 0, suggestedMax: 1.8 } }, plugins: { ...hideLow, tooltip: tt('') } } })]);
    return out;
  }
  function placeHealth(results) {
    const groups = healthCharts(results);
    for (const [sec, list] of Object.entries(groups)) {
      const host = document.getElementById(`hc-${sec}`); if (!host) continue;
      if (!list.length) { host.innerHTML = ''; continue; }
      const [lo, hi] = range();
      host.innerHTML = `<p class="scope">Trends for ${esc(dayLabel(lo))} – ${esc(dayLabel(hi))} (change the range in Explore).</p><div class="charts">${list.map(([id, t, ic]) => box(id, t, ic, '', list.length === 1 ? 'wide' : '')).join('')}</div>`;
      list.forEach(([, , , fn]) => fn());
    }
  }

  let lastResults = {};
  const api = {
    render: (results) => { if (results) lastResults = results; render(); },
    focusDay, focusActivity, range, ui,
  };
  // range/type/unit changes must also refresh the health charts
  const origRender = render;
  render = function () { origRender(); placeHealth(lastResults); }; // eslint-disable-line no-func-assign
  return api;
}
