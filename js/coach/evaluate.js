// Apply the coaching rules to a Dataset. Every function returns a result object; nothing is guessed:
// when the minimum data is not met the verdict is 'insufficient' and no value is shown.
import { mean, median, pstdev, quantiles, round, pctChange } from '../stats.js';
import { RULES, TEXT, fill } from './rules.js';

const ORDER = { insufficient: -1, good: 0, watch: 1, concern: 2 };
const worst = (...v) => v.filter(Boolean).reduce((a, b) => (ORDER[b] > ORDER[a] ? b : a), 'good');
const inRange = (v, [lo, hi]) => v >= lo && v <= hi;
const res = (key, label, o) => {
  const r = { key, label, verdict: 'insufficient', metrics: [], text: '', next: [], detail: '', files: [], ...o };
  // v0.2: "not available" = the files never provide this field; "insufficient" = field present but too little history.
  if (r.verdict === 'insufficient' && !r.files.length && !r.metrics.length) r.verdict = 'not_available';
  return r;
};
// v0.2 baseline: 30 days before the last 7; if fewer than 25 values, a labelled 21-day "short baseline" (needs 14 values).
function baselineVals(ds, field, end, ok = () => true) {
  const full = ds.values(field, end - 36, end - 7).filter(ok);
  if (full.length >= 25) return { vals: full, short: false };
  const short = ds.values(field, end - 27, end - 7).filter(ok);
  if (short.length >= 14) return { vals: short, short: true };
  return null;
}
export const statusPrefix = (s) => { if (!s) return null; const u = String(s).toUpperCase(); return ['NO_STATUS', 'OVERREACHING', 'UNPRODUCTIVE', 'STRAINED', 'PRODUCTIVE', 'MAINTAINING', 'PEAKING', 'RECOVERY', 'DETRAINING'].find((w) => u.startsWith(w)) || u.split('_')[0]; };

export function vo2Category(table, value, age, sex) {
  if (!table || value == null || age == null || !sex || !table[sex]) return null;
  const i = table.ageBands.findIndex(([lo, hi]) => age >= lo && age <= hi);
  if (i < 0) return null;
  const t = table[sex];
  if (value >= t.superior[i]) return 'Superior';
  if (value >= t.excellent[i]) return 'Excellent';
  if (value >= t.good[i]) return 'Good';
  if (value >= t.fair[i]) return 'Fair';
  return 'Poor';
}

export function evalVo2(ds, end, ctx) {
  const R = RULES.vo2max;
  const files = ds.filesFor(['vo2run', 'vo2cycle']).concat(ds.activities.some((a) => a.vo2) ? ds.filesFor(['activities']) : []);
  // Collect values per day: Garmin MaxMet daily values first, then per-activity estimates.
  const pts = new Map();
  for (const [d, r] of ds.daily) if (r.vo2run != null || r.vo2cycle != null) pts.set(d, r.vo2run ?? r.vo2cycle);
  for (const a of ds.activities) if (a.vo2 && a.day != null && !pts.has(a.day)) pts.set(a.day, a.vo2);
  const sorted = [...pts.entries()].sort((a, b) => a[0] - b[0]);
  const recent = sorted.filter(([d]) => d > end - R.recentDays);
  if (!recent.length) return res('vo2max', 'VO2 max', { files, missing: sorted.length ? `Your latest VO2 max value is older than ${R.recentDays} days.` : TEXT.vo2max.missing });
  const [lastDay, value] = recent[recent.length - 1];
  const earlierCandidates = sorted.filter(([d]) => lastDay - d >= R.trendMinGapDays);
  let drop = null, prior = null;
  if (earlierCandidates.length) {
    prior = earlierCandidates.reduce((b, c) => (Math.abs(lastDay - c[0] - R.trendDays) < Math.abs(lastDay - b[0] - R.trendDays) ? c : b));
    drop = prior[1] - value;
  }
  const category = vo2Category(ctx.vo2Table, value, ctx.age, ctx.sex);
  const metrics = [{ label: 'VO2 max', value: `${round(value, 1)} ml/kg/min` }];
  if (category) metrics.push({ label: 'Category', value: category });
  if (prior) metrics.push({ label: `Change vs ${lastDay - prior[0]} days earlier`, value: `${drop > 0 ? '−' : '+'}${round(Math.abs(drop), 1)}` });
  if (!category) {
    return res('vo2max', 'VO2 max', { verdict: 'insufficient', metrics, files, value,
      text: `Your latest VO2 max estimate is ${round(value, 1)}.`,
      detail: ctx.age == null || !ctx.sex ? 'Add your age and sex (in "Your details") to place it in Garmin\'s category table.' : 'Garmin\'s table covers ages 20–79 only, so no category is shown.' });
  }
  const dropping = drop != null && drop >= R.dropWatch;
  let verdict = 'good';
  if (category === 'Poor') verdict = 'concern';
  else if (category === 'Fair' || dropping) verdict = 'watch';
  const text = fill(TEXT.vo2max[verdict], { category: category.toLowerCase(), value: round(value, 1), dip: dropping ? ', and it has dipped a little lately' : '' });
  return res('vo2max', 'VO2 max', { verdict, metrics, text, next: TEXT.vo2max.next, files, value, category,
    detail: `Category from Garmin's age/sex table (Cooper Institute data). ${prior ? '' : 'Trend needs two values at least 28 days apart.'}` });
}

export function evalRhr(ds, end) {
  const R = RULES.resting_hr;
  const files = ds.filesFor(['rhr']);
  const all = ds.series('rhr', end - 36, end);
  const excluded = all.filter((p) => p.v != null && !inRange(p.v, R.valid)).length;
  const ok = (p) => p.v != null && inRange(p.v, R.valid);
  const last7 = all.filter((p) => p.day > end - 7 && ok(p));
  const bl = baselineVals(ds, 'rhr', end, (v) => inRange(v, R.valid));
  const totalDays = ds.values('rhr', end - 89, end).filter((v) => inRange(v, R.valid)).length;
  if (totalDays < R.minDays || last7.length < 3) return res('resting_hr', 'Resting heart rate', { files, missing: totalDays ? `Need at least ${R.minDays} days of resting heart rate; found ${totalDays}.` : null });
  const mean7 = mean(last7.map((p) => p.v));
  const baseline = bl ? median(bl.vals) : null;
  const metrics = [{ label: '7-day average', value: `${round(mean7, 1)} bpm` }];
  let verdict, consec = 0, maxConsec = 0, isolated = false;
  if (baseline != null) {
    for (const p of last7) { const up = p.v - baseline >= R.concernDelta; consec = up ? consec + 1 : 0; maxConsec = Math.max(maxConsec, consec); if (up) isolated = true; }
    const diff = mean7 - baseline;
    metrics.push({ label: bl.short ? `Short baseline (${bl.vals.length} days)` : '30-day baseline', value: `${round(baseline, 1)} bpm` }, { label: 'Difference', value: `${diff >= 0 ? '+' : '−'}${round(Math.abs(diff), 1)} bpm` });
    // concern -> watch -> good, first match wins
    if (maxConsec >= R.concernConsecutive || mean7 > R.high) verdict = 'concern';
    else if (diff >= R.watchDelta || isolated) verdict = 'watch';
    else if (mean7 >= R.normalLow && mean7 <= R.high && diff < R.watchDelta) verdict = 'good';
    else verdict = 'watch';
  } else {
    verdict = mean7 > R.high ? 'concern' : 'good';
  }
  return res('resting_hr', 'Resting heart rate', {
    verdict, metrics, files, mean7, baseline, maxConsec,
    text: fill(TEXT.resting_hr[verdict], { value: Math.round(mean7) }), next: TEXT.resting_hr.next,
    detail: `${baseline != null ? `Days ≥ +5 bpm in a row this week: ${maxConsec}. ${bl.short ? 'Uses a shorter-than-usual (21-day) baseline. ' : ''}` : 'Baseline needs at least 3 weeks, so only the absolute level was checked. '}${excluded ? `${excluded} reading(s) outside 25–150 bpm ignored.` : ''}`,
  });
}

export function evalHrv(ds, end) {
  const R = RULES.hrv;
  const files = ds.filesFor(['hrv', 'hrvStatus', 'hrvWeekly', 'hrvLow', 'hrvHigh']);
  const latestStatus = ds.latest('hrvStatus', end - 3, end);
  const nights = ds.values('hrv', end - 89, end).filter((v) => inRange(v, R.valid));
  if (latestStatus && latestStatus.v !== 'NONE' && latestStatus.v !== 'NO_STATUS') {
    // Garmin supplied a status: prefer it.
    const s = latestStatus.v;
    const week = ds.values('hrvStatus', end - 6, end);
    let verdict = s.startsWith('BALANCED') ? 'good' : s.startsWith('UNBALANCED') ? 'watch' : /LOW|POOR/.test(s) ? (week.length >= R.lowConcernDays && week.every((x) => /LOW|POOR/.test(x)) ? 'concern' : 'watch') : 'insufficient';
    const w = ds.latest('hrvWeekly', end - 3, end), lo = ds.latest('hrvLow', end - 3, end), hi = ds.latest('hrvHigh', end - 3, end);
    const metrics = [{ label: 'Garmin HRV status', value: s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') }];
    if (w) metrics.push({ label: '7-day average', value: `${round(w.v, 0)} ms` });
    if (lo && hi) metrics.push({ label: 'Your baseline', value: `${round(lo.v, 0)}–${round(hi.v, 0)} ms` });
    return res('hrv', 'HRV', { verdict, metrics, files, text: TEXT.hrv[verdict] || '', next: TEXT.hrv.next, detail: 'Using the status Garmin calculated.' });
  }
  if (nights.length < R.baselineNights) return res('hrv', 'HRV', { files, missing: nights.length ? `Still learning your baseline: ${nights.length} of ${R.baselineNights} nights so far.` : null });
  const last7 = ds.values('hrv', end - 6, end).filter((v) => inRange(v, R.valid));
  // Garmin baseline if present, otherwise 10th–90th percentile of the 21 nights before this week.
  const glo = ds.latest('hrvLow', end - 3, end), ghi = ds.latest('hrvHigh', end - 3, end);
  let lo, hi, bandSource;
  if (glo && ghi) { lo = glo.v; hi = ghi.v; bandSource = 'Garmin baseline range'; }
  else {
    const baseVals = ds.values('hrv', end - 27, end - 7).filter((v) => inRange(v, R.valid));
    if (baseVals.length < 14) return res('hrv', 'HRV', { files, missing: 'Still learning your baseline: need about 3 weeks of nights before the last 7.' });
    const q = quantiles(baseVals, 10); lo = q[0]; hi = q[8]; bandSource = `10th–90th percentile of your ${baseVals.length} nights before this week (no Garmin baseline in the files)`;
  }
  if (last7.length < 4) return res('hrv', 'HRV', { files, missing: 'Fewer than 4 nights of HRV in the last week.' });
  const m7 = mean(last7);
  // Garmin's status works on the rolling 7-day average, so "Low for 7 days" = rolling average below the band on each of the last 7 days.
  let lowDays = 0;
  for (let d = end - 6; d <= end; d++) { const w = ds.values('hrv', d - 6, d).filter((v) => inRange(v, R.valid)); if (w.length >= 4 && mean(w) < lo) lowDays++; }
  const allBelow = lowDays >= R.lowConcernDays;
  const verdict = m7 >= lo && m7 <= hi ? 'good' : m7 < lo && allBelow ? 'concern' : 'watch';
  return res('hrv', 'HRV', {
    verdict, files, mean7: m7, lo, hi, text: TEXT.hrv[verdict], next: TEXT.hrv.next,
    metrics: [{ label: '7-day average', value: `${round(m7, 1)} ms` }, { label: 'Your usual range', value: `${Math.round(lo)}–${Math.round(hi)} ms` }, { label: 'Nights below range this week', value: `${last7.filter((v) => v < lo).length} of ${last7.length}` }, { label: 'Days the rolling 7-day average was below range', value: `${lowDays} of 7` }],
    detail: `Band: ${bandSource}.${allBelow ? ' Rolling 7-day average below the band on all of the last 7 days, treated as Garmin "Low" for 7 days.' : ''}`,
  });
}

export function evalSleep(ds, end) {
  const R = RULES.sleep;
  const files = ds.filesFor(['sleepH', 'sleepScore', 'sleepMid']);
  const from = end - R.window + 1;
  const hours = ds.values('sleepH', from, end).filter((v) => inRange(v, R.valid));
  const excluded = ds.values('sleepH', from, end).length - hours.length;
  const scores = ds.values('sleepScore', from, end);
  const mids = ds.values('sleepMid', from, end);
  if (hours.length < R.minNights) return res('sleep', 'Sleep', { files, missing: hours.length ? `Need ${R.minNights} nights of sleep in the last two weeks; found ${hours.length}.` : null });
  const mh = median(hours), ms = scores.length >= R.minNights ? median(scores) : null, sd = mids.length >= R.consistencyNights ? pstdev(mids) : null;
  const shortNights = hours.filter((h) => h < 6).length;
  const lowConf = []; for (let d = from; d <= end; d++) { const v = ds.daily.get(d)?.sleepH; if (v != null && v < 4 && v >= R.valid[0]) lowConf.push(d); }
  // concern -> watch -> good; missing sub-measures are skipped
  let verdict;
  if (mh < R.watchH || (sd != null && sd > R.sdWatch)) verdict = 'concern';
  else if (mh < R.goodH || (ms != null && ms < R.goodScore) || (sd != null && sd > R.sdGood) || shortNights >= 3) verdict = 'watch';
  else verdict = 'good';
  const vDur = mh >= R.goodH ? 'good' : 'watch', vScore = ms == null ? null : ms >= R.goodScore ? 'good' : 'watch', vSd = sd == null ? null : sd <= R.sdGood ? 'good' : 'watch';
  const how = vDur !== 'good' && vSd && vSd !== 'good' ? 'short and irregular' : vDur !== 'good' ? 'short' : vSd && vSd !== 'good' ? 'irregular' : 'short';
  const metrics = [{ label: `Median sleep (${hours.length} nights)`, value: `${round(mh, 2)} h` }];
  if (ms != null) metrics.push({ label: 'Median sleep score', value: `${Math.round(ms)}` });
  metrics.push({ label: 'Bedtime regularity (SD of midpoint)', value: sd != null ? `${Math.round(sd)} min` : 'not available' });
  metrics.push({ label: 'Nights under 6 h (last 14)', value: `${shortNights}` });
  return res('sleep', 'Sleep', {
    verdict, metrics, files, mh, ms, sd,
    text: (verdict === 'good' ? fill(TEXT.sleep.good, { hours: round(mh, 1) }) : verdict === 'watch' && vScore === 'watch' && vDur === 'good' && vSd !== 'watch' ? 'Your sleep score has been in the fair range lately. Even 20–30 extra minutes or a steadier bedtime tends to help.' : fill(TEXT.sleep[verdict], { how })) + (verdict === 'watch' && shortNights >= 3 ? ` ${shortNights} of the last ${hours.length} nights were under 6 hours.` : ''),
    next: TEXT.sleep.next,
    detail: `${lowConf.length ? `${lowConf.length} night(s) under 4 h may be partly missed by the watch (low confidence). ` : ''}${sd == null ? (mids.length ? 'Regularity needs 14 nights with sleep times. ' : 'Regularity not available: no sleep start/end times in your files. ') : ''}${ms == null ? 'No sleep scores found. ' : ''}${excluded ? `${excluded} night(s) under 2 h or over 14 h ignored. ` : ''}${ds.sleepMidIsGmt ? 'Sleep times were in GMT, so regularity is still valid but clock times are not local.' : ''}`,
  });
}

export function evalBodyBattery(ds, end) {
  const R = RULES.body_battery;
  const files = ds.filesFor(['bbMax', 'bbMin']); // v0.2: charged/drained totals are not used
  // The last 7 readings in the last 10 days (today's high is often still blank).
  const last = ds.values('bbMax', end - 9, end).slice(-7);
  if (last.length < 4 || ds.values('bbMax', end - 36, end).length < R.minDays) return res('body_battery', 'Body Battery', { files, missing: last.length ? 'Need at least 7 days of Body Battery.' : null });
  const m7 = median(last); const bl = baselineVals(ds, 'bbMax', end); const b30 = bl ? median(bl.vals) : null; const neg = null;
  const drop = b30 != null ? b30 - m7 : null;
  const verdict = m7 <= R.concern ? 'concern' : (m7 < R.good || (drop != null && drop >= R.dropWatch)) ? 'watch' : 'good';
  const metrics = [{ label: '7-day median morning high', value: `${round(m7, 1)}` }];
  if (b30 != null) metrics.push({ label: bl.short ? `Short baseline (${bl.vals.length} days)` : '30-day baseline', value: `${round(b30, 1)}` }, { label: 'Change', value: `${drop > 0 ? '−' : '+'}${round(Math.abs(drop), 1)}` });
  return res('body_battery', 'Body Battery', { verdict, metrics, files, m7, b30, neg, text: fill(TEXT.body_battery[verdict], { value: Math.round(m7) }), next: TEXT.body_battery.next,
    detail: `Garmin's bands: 76–100 high, 51–75 medium, 26–50 low, 5–25 very low reserve energy.${b30 == null ? ' Trend not computed: needs at least 3 weeks before the last 7 days.' : ''}` });
}

export function evalLoad(ds, end) {
  const R = RULES.training_load;
  const files = ds.filesFor(['acute', 'chronic', 'ratio', 'trainingStatus', 'loadFocusShortage']);
  // v0.2: ratio = acute ÷ chronic, computed here; a supplied ratio column is only a fallback (acwr_percent is never read).
  const ratioOn = (d) => { const r = ds.daily.get(d); if (!r) return null; if (r.acute != null && r.chronic) return r.acute / r.chronic; if (r.ratio != null && r.ratio < 5) return r.ratio; return null; };
  let lastDay = null; for (let d = end; d > end - 7; d--) if (ratioOn(d) != null) { lastDay = d; break; }
  const status = statusPrefix(ds.latest('trainingStatus', end - 7, end)?.v);
  const over14 = ds.values('trainingStatus', end - 13, end).filter((v) => statusPrefix(v) === 'OVERREACHING').length;
  const chNow = ds.latest('chronic', end - 7, end);
  let chThen = null; for (const off of [0, 1, -1, 2, -2, 3, -3]) { const r = ds.daily.get(end - 28 + off); if (r?.chronic != null) { chThen = { day: end - 28 + off, v: r.chronic }; break; } }
  const chChange = chNow && chThen && chThen.v > 0 ? ((chNow.v - chThen.v) / chThen.v) * 100 : null;
  const loadDays = ds.values('acute', end - 89, end).length;
  if (lastDay === null && !status) return res('training_load', 'Training load', { files, missing: loadDays ? `Need about 28 days of training load for the acute:chronic ratio; found ${loadDays}.` : null });
  const ratio = lastDay !== null ? ratioOn(lastDay) : null;
  let lowRun = 0; for (let d = end; d > end - R.lowDays; d--) { const v = ratioOn(d); if (v != null && v < R.low) lowRun++; else break; }
  const shortage = ds.latest('loadFocusShortage', end - 7, end)?.v === 1;
  let verdict = 'good';
  if ((ratio != null && ratio > R.danger) || R.concernStatus.includes(status)) verdict = 'concern';
  else if ((ratio != null && ratio > R.high) || lowRun >= R.lowDays || R.watchStatus.includes(status) || shortage || over14 >= 3 || (chChange != null && chChange > 50)) verdict = 'watch';
  else if (ratio != null && ratio >= R.low && ratio <= R.high && (!status || R.goodStatus.includes(status))) verdict = 'good';
  else if (ratio == null && R.goodStatus.includes(status)) verdict = 'good';
  else verdict = 'watch';
  const metrics = [];
  if (ratio != null) metrics.push({ label: 'Acute : chronic load ratio', value: round(ratio, 2).toFixed(2) });
  const ac = ds.latest('acute', end - 7, end), ch = ds.latest('chronic', end - 7, end);
  if (ac) metrics.push({ label: 'Acute load (7-day)', value: `${Math.round(ac.v)}` });
  if (ch) metrics.push({ label: 'Chronic load', value: `${Math.round(ch.v)}` });
  if (status) metrics.push({ label: 'Garmin training status', value: status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ') });
  if (status || over14) metrics.push({ label: 'Overreaching days (last 14)', value: `${over14}` });
  if (chChange != null) metrics.push({ label: 'Chronic load change (28 days)', value: `${chChange >= 0 ? '+' : '−'}${Math.round(Math.abs(chChange))}%` });
  return res('training_load', 'Training load', { verdict, metrics, files, ratio, status,
    text: fill(TEXT.training_load[verdict], { dir: ratio != null && ratio < R.low && !(chChange > 50) ? 'lighter' : 'a step up' }).replace("usual. That's", `usual.${verdict === 'watch' && chChange > 50 ? (chChange >= 100 ? ' Your long-term load has more than doubled in a month.' : ` Your long-term load is up ${Math.round(chChange)}% in a month.`) : ''} That's`), next: TEXT.training_load.next,
    detail: `Sweet spot 0.8–1.3, above 1.5 is a big jump (Gabbett 2016; the ratio is debated in research, so treat it as a guide).${status ? '' : ' No Garmin training status in your files.'}${lowRun >= R.lowDays ? ' Ratio has been under 0.8 for 14+ days.' : ''}` });
}

export function evalAerobic(ds, end, ctx) {
  const R = RULES.aerobic;
  const runs = ds.runs().filter((a) => a.day != null && a.durS > 0 && a.distM > 0 && a.avgHr > 0);
  const files = [...new Set(runs.flatMap((a) => [...a.sources]))];
  if (!ds.runs().length) return res('aerobic', 'Pace at heart rate', { files, missing: null });
  const maxHr = ctx.maxHr;
  const easy = runs.filter((a) => !a.indoor && (a.tempC == null || a.tempC <= R.maxTempC) && (a.gainM == null || a.gainM / (a.distM / 1000) < R.maxGainPerKm) && (!maxHr || a.avgHr < R.easyHrFrac * maxHr));
  const ef = (a) => (a.distM / (a.durS / 60)) / a.avgHr;
  const w1 = easy.filter((a) => a.day > end - R.windowDays), w0 = easy.filter((a) => a.day <= end - R.windowDays && a.day > end - 2 * R.windowDays);
  let efChange = null;
  if (w1.length >= R.minRuns && w0.length >= R.minRuns) efChange = pctChange(mean(w1.map(ef)), mean(w0.map(ef)));
  // v0.2: a steady run counts only if >=70% of its time is in HR zones 1-2. For decoupling we compute from FIT/GPX
  // samples, zones 1-2 = under 70% of max HR (Garmin's default % max HR zones), so max HR is required.
  // Decoupling supplied in a CSV is taken as already filtered by its source.
  const z12ok = (a) => !a.decouplingFromTrack || (maxHr && a.hrList && a.hrList.filter((h) => h < 0.7 * maxHr).length / a.hrList.length >= 0.7);
  const trackNoMax = runs.some((a) => a.decouplingFromTrack) && !maxHr;
  const steady = runs.filter((a) => a.durS >= R.steadyMin * 60 && a.decoupling != null && (a.tempC == null || a.tempC <= R.maxTempC) && z12ok(a)).sort((a, b) => a.day - b.day);
  const lastDec = steady.length ? steady[steady.length - 1] : null;
  // "Pace at a given heart rate": median pace and HR of easy runs in the last 28 days.
  const recentEasy = w1.length ? w1 : easy.filter((a) => a.day > end - R.windowDays);
  const paceStat = recentEasy.length ? { pace: median(recentEasy.map((a) => a.durS / (a.distM / 1000))), hr: median(recentEasy.map((a) => a.avgHr)), n: recentEasy.length } : null;
  const metrics = [];
  if (paceStat) metrics.push({ label: `Easy-run pace at ~${Math.round(paceStat.hr)} bpm (${paceStat.n} runs, 28 days)`, value: `${fmtPace(paceStat.pace)} /km` });
  if (efChange != null) metrics.push({ label: 'Efficiency change, last 4 wk vs previous 4 wk', value: `${efChange >= 0 ? '+' : '−'}${round(Math.abs(efChange), 1)}%` });
  if (lastDec) metrics.push({ label: `Decoupling on last steady run ≥45 min`, value: `${round(lastDec.decoupling, 1)}%` });
  if (efChange == null && !lastDec) return res('aerobic', 'Pace at heart rate', { files, metrics, paceStat, missing: `Need ${R.minRuns}+ easy outdoor runs with heart rate in each of the last two 4-week windows (found ${w1.length} and ${w0.length}), or one steady 45+ minute run at an easy effort (70%+ of the time in HR zones 1–2).${trackNoMax ? ' Add your max heart rate in "Your details" so FIT/GPX runs can be checked for zones.' : ''}` });
  const dec = lastDec?.decoupling ?? null;
  let verdict = 'good';
  if ((dec != null && dec > R.decConcern) || (efChange != null && efChange < R.efConcern)) verdict = 'concern';
  else if ((dec != null && dec >= R.decGood) || (efChange != null && efChange < R.efWatch)) verdict = 'watch';
  return res('aerobic', 'Pace at heart rate', { verdict, metrics, files, efChange, dec, paceStat,
    text: fill(TEXT.aerobic[verdict], { how: efChange != null && efChange >= R.efImprove ? 'running faster at the same heart rate' : 'holding pace without your heart rate drifting' }), next: TEXT.aerobic.next,
    detail: `Efficiency = speed (m/min) ÷ average heart rate on easy, flat-ish outdoor runs (≤25 °C, <10 m climb per km${maxHr ? `, average HR under 80% of ${maxHr} bpm` : '; add your max HR in "Your details" to also filter by effort'}).` });
}

export function evalCadence(ds, end) {
  const R = RULES.cadence;
  const runs = ds.runs().filter((a) => a.day > end - R.days && a.cadence > 0);
  const anyCad = ds.runs().filter((a) => a.cadence > 0);
  const files = [...new Set(anyCad.flatMap((a) => [...a.sources]))];
  const lastCad = anyCad.length ? Math.max(...anyCad.map((a) => a.day)) : null;
  if (runs.length < R.minRuns) return res('cadence', 'Cadence', { files, missing: !files.length ? null : ds.runs().length ? `Need ${R.minRuns} runs with cadence in the last 30 days; found ${runs.length}.${lastCad != null && lastCad <= end - R.days ? ` Your files have cadence on ${anyCad.length} older runs, the latest ${end - lastCad > 730 ? `about ${Math.round((end - lastCad) / 365)} years` : `${end - lastCad} days`} before your last activity.` : ''}` : null });
  const m = median(runs.map((a) => a.cadence));
  const verdict = m >= R.good ? 'good' : 'watch';
  return res('cadence', 'Cadence', { verdict, files, median: m, metrics: [{ label: `Median cadence (${runs.length} runs, 30 days)`, value: `${Math.round(m)} spm` }],
    text: fill(TEXT.cadence[verdict], { value: Math.round(m) }), next: TEXT.cadence.next, detail: 'There is no single ideal cadence; it rises with speed and varies with height. Never rated as a concern.' });
}

export function yearlyRunning(ds) {
  const by = new Map();
  for (const a of ds.runs()) {
    if (a.day == null || ds.relativeDays) continue;
    const y = new Date(a.day * 864e5).getUTCFullYear();
    if (!by.has(y)) by.set(y, []); by.get(y).push(a);
  }
  const end = ds.endDay;
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([year, rs]) => {
    const wd = rs.filter((a) => a.distM > 0 && a.durS > 0);
    const km = wd.reduce((s, a) => s + a.distM, 0) / 1000;
    return { year, runs: rs.length, km, pace: km ? wd.reduce((s, a) => s + a.durS, 0) / km : null, hr: median(rs.map((a) => a.avgHr).filter(Boolean)), longest: wd.length ? Math.max(...wd.map((a) => a.distM)) / 1000 : 0, partial: end != null && new Date(end * 864e5).getUTCFullYear() === year };
  });
}
export function fmtPace(sPerKm) { if (!sPerKm) return '–'; const m = Math.floor(sPerKm / 60), s = Math.round(sPerKm % 60); return `${s === 60 ? m + 1 : m}:${String(s === 60 ? 0 : s).padStart(2, '0')}`; }
export function fmtDur(s) { if (s == null) return '–'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; }

// Personal bests: Garmin's own records if present; otherwise the fastest whole runs near standard distances.
export function personalBests(ds) {
  if (ds.prs.length) return { source: 'garmin', files: ds.filesFor(['prs']), items: ds.prs.map((p) => ({ label: p.label, value: p.seconds != null ? fmtDur(p.seconds) : `${round(p.meters / 1000, 2)} km`, day: p.day })) };
  const runs = ds.runs().filter((a) => a.distM > 0 && a.durS > 0);
  if (!runs.length) return null;
  const bands = [['5 km', 4900, 5300], ['10 km', 9800, 10500], ['Half marathon', 21000, 21600], ['Marathon', 42000, 43000]];
  const items = [];
  for (const [label, lo, hi] of bands) {
    const c = runs.filter((a) => a.distM >= lo && a.distM <= hi).sort((a, b) => a.durS / a.distM - b.durS / b.distM)[0];
    if (c) items.push({ label: `Fastest ~${label} run`, value: fmtDur(c.durS), note: `${round(c.distM / 1000, 2)} km, ${fmtPace(c.durS / (c.distM / 1000))} /km`, day: c.day });
  }
  const longest = runs.reduce((a, b) => (b.distM > a.distM ? b : a));
  items.push({ label: 'Longest run', value: `${round(longest.distM / 1000, 2)} km`, note: fmtDur(longest.durS), day: longest.day });
  const fastest = runs.filter((a) => a.distM >= 3000).sort((a, b) => a.durS / a.distM - b.durS / b.distM)[0];
  if (fastest) items.push({ label: 'Fastest average pace (3 km+)', value: `${fmtPace(fastest.durS / (fastest.distM / 1000))} /km`, note: `${round(fastest.distM / 1000, 2)} km`, day: fastest.day });
  return { source: 'activities', files: [...new Set(runs.flatMap((a) => [...a.sources]))], items };
}

export function redFlags(ds, end, ctx, rhr) {
  const R = RULES.red_flags; const flags = []; const checks = [];
  const vals = ds.series('rhr', end - 29, end);
  let max3 = null;
  for (let i = 2; i < vals.length; i++) { const w = vals.slice(i - 2, i + 1).map((p) => p.v); if (w.every((v) => v != null)) { const m = mean(w); max3 = max3 == null ? m : Math.max(max3, m); } }
  if (max3 != null) { checks.push(`Highest 3-day resting HR average (30 days): ${round(max3, 1)} bpm`); if (max3 > R.rhrHigh3) flags.push('Your resting heart rate has averaged over 100 bpm for at least 3 days.'); }
  if (rhr?.mean7 != null && rhr.mean7 < R.rhrLow && !ctx.athlete) flags.push('Your resting heart rate is under 40 bpm and you have not told us you are a trained athlete. If you ever feel dizzy or faint, get checked.');
  if (rhr?.baseline != null) {
    let run = 0, maxRun = 0;
    for (const p of ds.series('rhr', end - 29, end)) { run = p.v != null && p.v - rhr.baseline >= R.rhrAboveBaseline ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
    checks.push(`Longest run of days ≥10 bpm above baseline: ${maxRun}`);
    if (maxRun >= R.rhrAboveDays) flags.push('Your resting heart rate has been 10+ bpm above your normal for a week or more.');
  }
  const sl = ds.values('sleepH', end - R.sleepLowDays + 1, end);
  if (sl.length >= R.sleepLowDays) { checks.push(`14-night median sleep: ${round(median(sl), 2)} h`); if (median(sl) < R.sleepLowH) flags.push('You have averaged under 5 hours of sleep for two weeks.'); }
  if (ds.irregularFile || ds.values('irregularRhythm', end - 89, end).some(Boolean)) flags.push('Your files include Garmin irregular-rhythm or ECG alert records.');
  return { flags, checks };
}

// "What changed this month": last 30 days vs the 30 before.
export function monthChange(ds, end) {
  const A = [end - 29, end], B = [end - 59, end - 30];
  const rows = [];
  const daily = [
    ['Resting HR', 'rhr', 'bpm', 1, 'lower'], ['Overnight HRV', 'hrv', 'ms', 1, 'higher'], ['Sleep', 'sleepH', 'h', 2, 'higher'],
    ['Sleep score', 'sleepScore', '', 0, 'higher'], ['Body Battery high', 'bbMax', '', 0, 'higher'], ['Steps per day', 'steps', '', 0, 'higher'],
    ['Acute training load', 'acute', '', 0, null], ['VO2 max', 'vo2run', 'ml/kg/min', 1, 'higher'],
  ];
  for (const [label, f, unit, dp, better] of daily) {
    const a = ds.values(f, ...A), b = ds.values(f, ...B);
    const min = f === 'vo2run' ? 1 : 10;
    if (a.length >= min && b.length >= min) rows.push({ label, now: mean(a), before: mean(b), unit, dp, better, files: ds.filesFor([f]) });
  }
  const runsIn = ([lo, hi]) => ds.runs().filter((r) => r.day >= lo && r.day <= hi);
  const ra = runsIn(A), rb = runsIn(B);
  const anyRunsBefore = ds.runs().some((r) => r.day <= B[1]);
  if (ds.runs().length && anyRunsBefore) {
    rows.push({ label: 'Runs', now: ra.length, before: rb.length, unit: '', dp: 0, better: null });
    rows.push({ label: 'Running distance', now: ra.reduce((s, r) => s + (r.distM || 0), 0) / 1000, before: rb.reduce((s, r) => s + (r.distM || 0), 0) / 1000, unit: 'km', dp: 1, better: null });
    const ca = ra.map((r) => r.cadence).filter(Boolean), cb = rb.map((r) => r.cadence).filter(Boolean);
    if (ca.length && cb.length) rows.push({ label: 'Cadence', now: median(ca), before: median(cb), unit: 'spm', dp: 0, better: null });
    const pa = ra.filter((r) => r.distM && r.durS), pb = rb.filter((r) => r.distM && r.durS);
    if (pa.length && pb.length) rows.push({ label: 'Average run pace', now: median(pa.map((r) => r.durS / (r.distM / 1000))), before: median(pb.map((r) => r.durS / (r.distM / 1000))), unit: '/km', pace: true, better: 'lower' });
  }
  return { rows, A, B };
}

const lc = (l) => (l === 'Body Battery' ? l : /^[A-Z0-9 ]+$/.test(l.split(' ')[0]) ? l.split(' ')[0] + l.slice(l.split(' ')[0].length).toLowerCase() : l.toLowerCase());
const RECOVERY = ['sleep', 'resting_hr', 'hrv', 'body_battery'];
const ORDERED = ['sleep', 'resting_hr', 'hrv', 'body_battery', 'training_load', 'vo2max', 'aerobic', 'cadence'];
export function summarise(results, flags, rhr) {
  const R = RULES.summary;
  const rated = results.filter((r) => r.verdict !== 'insufficient' && r.verdict !== 'not_available');
  const by = Object.fromEntries(results.map((r) => [r.key, r]));
  const concerns = rated.filter((r) => r.verdict === 'concern');
  const recConcerns = concerns.filter((r) => RECOVERY.includes(r.key) || r.key === 'training_load');
  let headline;
  if (!rated.length) headline = 'Not enough data for a summary yet';
  else if (recConcerns.length >= R.recoveryConcerns) headline = 'Time to prioritise recovery';
  else if (rated.filter((r) => r.verdict === 'good').length / rated.length >= R.lookingGoodShare && !concerns.length) headline = 'Looking good';
  else headline = 'A few things to watch';
  const strengths = ORDERED.map((k) => by[k]).filter((r) => r && r.verdict === 'good').slice(0, 3);
  const focus = ORDERED.map((k) => by[k]).filter((r) => r && r.verdict === 'concern').concat(ORDERED.map((k) => by[k]).filter((r) => r && r.verdict === 'watch')).slice(0, 3);
  let next;
  if (headline === 'Time to prioritise recovery') next = `Take 2–3 easy or rest days, aim for an earlier, consistent bedtime${rhr?.baseline != null ? `, and check whether resting HR returns to around ${Math.round(rhr.baseline)} bpm` : ''}. If it stays 10+ bpm above normal for a week with no obvious reason, mention it to a GP.`;
  else if (focus.length) next = focus[0].next[0];
  else if (rated.length) next = 'Keep doing what you\'re doing, and re-check in about 4 weeks.';
  let why = '';
  if (headline === 'Time to prioritise recovery') why = `${recConcerns.map((r) => lc(r.label)).join(' and ')} have shifted together recently. ${rated.filter((r) => r.verdict === 'watch' && RECOVERY.includes(r.key)).map((r) => r.label).join(' and ') || ''}${rated.some((r) => r.verdict === 'watch' && RECOVERY.includes(r.key)) ? ' point the same way.' : ''}`.replace(/^./, (c) => c.toUpperCase());
  if (headline === 'A few things to watch') why = `Mostly on track. Keep an eye on ${focus.map((r) => lc(r.label)).join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;
  if (headline === 'Looking good') why = 'Most of your numbers sit in a healthy range for you.';
  if (by.training_load?.verdict === 'good' && headline === 'Time to prioritise recovery') why += ' Your training itself looks well judged, so this is probably life stress, a short run of poor nights, or something coming on.';
  return { headline, why: why.trim(), strengths, focus, next, flags, counts: { rated: rated.length, concerns: concerns.length } };
}
