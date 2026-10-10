// DOM rendering. All user-derived strings go through esc().
import { round } from './stats.js';
import { fmtPace } from './coach/evaluate.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABEL = { good: 'Good', watch: 'Watch', concern: 'Concern', insufficient: 'Not enough data', missing: 'Not found', info: 'Info' };
export const pill = (v) => `<span class="pill ${v}">${LABEL[v] || esc(v)}</span>`;
const short = (n) => String(n).split(' › ').pop().split('/').pop();
const filesLine = (files) => { const f = [...new Set((files || []).map(short))]; return f.length ? `<div class="files-used">From: ${f.slice(0, 5).map(esc).join(', ')}${f.length > 5 ? ` and ${f.length - 5} more` : ''}</div>` : ''; };

export function missingBox(what, lookedFor, extra) {
  return `<div class="missing"><strong>Not found in your files.</strong> ${esc(extra || '')} <br>Looked for: ${esc(lookedFor)}.</div>`;
}

// A metric card for a coaching result.
export function metricCard(r, lookedFor) {
  if (r.verdict === 'insufficient' && !r.metrics.length) {
    const found = r.files.length > 0;
    return `<article class="metric"><div class="metric-head"><h3>${esc(r.label)}</h3>${pill(found ? 'insufficient' : 'missing')}</div>
      ${found ? `<div class="missing"><strong>Not enough data yet.</strong> ${esc(r.missing || '')}</div>${filesLine(r.files)}` : missingBox(r.label, lookedFor, r.missing && r.key === 'vo2max' ? r.missing : '')}</article>`;
  }
  const kv = r.metrics.map((m) => `<dt>${esc(m.label)}</dt><dd>${esc(m.value)}</dd>`).join('');
  return `<article class="metric"><div class="metric-head"><h3>${esc(r.label)}</h3>${pill(r.verdict)}</div>
    <dl class="kv">${kv}</dl>
    ${r.text ? `<p class="say">${esc(r.text)}</p>` : ''}
    ${r.missing ? `<p class="note">${esc(r.missing)}</p>` : ''}
    ${r.next && r.next.length && r.verdict !== 'good' ? `<ul class="next">${r.next.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${r.detail ? `<p class="note">${esc(r.detail)}</p>` : ''}
    ${filesLine(r.files)}</article>`;
}

export function infoCard(title, bodyHtml, files, verdict = 'info') {
  return `<article class="metric"><div class="metric-head"><h3>${esc(title)}</h3>${verdict ? pill(verdict) : ''}</div>${bodyHtml}${filesLine(files)}</article>`;
}

export function changeTable(mc, fmtDay) {
  if (!mc.rows.length) return null;
  const fmt = (r, v) => (r.pace ? `${fmtPace(v)}` : round(v, r.dp).toLocaleString('en-GB', { maximumFractionDigits: r.dp, minimumFractionDigits: r.dp }));
  const rows = mc.rows.map((r) => {
    const d = r.now - r.before;
    const pct = r.before ? (d / r.before) * 100 : null;
    const tiny = Math.abs(pct ?? 0) < 2;
    let cls = 'flat';
    if (!tiny && r.better) cls = (r.better === 'higher') === d > 0 ? 'up' : 'down';
    const arrow = tiny ? '→' : d > 0 ? '↑' : '↓';
    const dTxt = r.pace ? `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d))} s` : `${d >= 0 ? '+' : '−'}${fmt(r, Math.abs(d))}`;
    return `<tr><td>${esc(r.label)}${r.unit ? ` <span class="note">(${esc(r.unit)})</span>` : ''}</td><td class="num">${fmt(r, r.before)}</td><td class="num">${fmt(r, r.now)}</td><td class="num delta ${cls}">${arrow} ${dTxt}</td></tr>`;
  }).join('');
  return `<p class="note">Averages for ${esc(fmtDay(mc.A[0]))} – ${esc(fmtDay(mc.A[1]))} compared with ${esc(fmtDay(mc.B[0]))} – ${esc(fmtDay(mc.B[1]))}. Green and red mark the direction that is usually better or worse; grey means little change (under 2%) or no clear "better".</p>
  <div class="table-wrap"><table><thead><tr><th>Measure</th><th class="num">Previous 30 d</th><th class="num">Last 30 d</th><th class="num">Change</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
