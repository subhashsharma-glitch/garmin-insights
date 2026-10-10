// Page wiring: file input, demo data, profile inputs and report rendering.
import { parseFiles } from './parsers/index.js';
import * as E from './coach/evaluate.js';
import { TEXT } from './coach/rules.js';
import { esc, pill, metricCard, infoCard, missingBox, changeTable } from './render.js';
import { round } from './stats.js';

const $ = (s) => document.querySelector(s);
const state = { ds: null, vo2Table: null, demo: null, files: null, isDemo: false };

const LOOKED = {
  vo2max: 'VO2 max in DI-Connect-Metrics/MetricsMaxMetData_*.json, vO2MaxValue in *_summarizedActivities.json, or a vo2_max column in a CSV',
  resting_hr: 'restingHeartRate in DI-Connect-Aggregator/UDSFile_*.json or *healthStatusData.json, or a resting_hr column',
  hrv: 'HRV in DI-Connect-Wellness/*healthStatusData.json or HRV summary JSON, or an hrv_last_night_ms column',
  sleep: 'DI-Connect-Wellness/*_sleepData.json, or sleep_hours / sleep_score columns',
  body_battery: 'bodyBattery in DI-Connect-Aggregator/UDSFile_*.json, or bb_max / bb_charged / bb_drained columns',
  training_load: 'acute / chronic training load or training status in DI-Connect-Metrics JSON, or acute_load / load_ratio columns',
  aerobic: 'runs with distance, time and heart rate in *_summarizedActivities.json, FIT or GPX files, or an activities CSV',
  cadence: 'run cadence in *_summarizedActivities.json, FIT or GPX files, or an avg_cadence_spm column',
  fitness: 'fitness age in DI-Connect-Wellness/*fitnessAgeData*.json, or a fitness_age column',
};

const status = (msg, err) => { $('#status').innerHTML = err ? `<span class="err">${esc(msg)}</span>` : esc(msg); };

async function init() {
  // Everything the page needs is fetched now, from this same site. After this, no network requests are made.
  try {
    const [t, d, a] = await Promise.all(['data/vo2max-table.json', 'demo/daily.csv', 'demo/activities.csv'].map((u) => fetch(u, { cache: 'force-cache' }).then((r) => (r.ok ? (u.endsWith('.json') ? r.json() : r.text()) : Promise.reject(new Error(u))))));
    state.vo2Table = t; state.demo = [{ name: 'demo/daily.csv', text: d }, { name: 'demo/activities.csv', text: a }];
  } catch (e) { status('Could not load the VO2 max table or demo data that ship with this page.', true); }
  const input = $('#file'), drop = $('#drop');
  input.addEventListener('change', () => input.files.length && run([...input.files]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => e.dataTransfer.files.length && run([...e.dataTransfer.files]));
  $('#demo').addEventListener('click', () => state.demo && run(state.demo, true));
  $('#clear').addEventListener('click', () => { state.ds = null; $('#report').hidden = true; $('#clear').hidden = true; input.value = ''; status('Cleared. Nothing was saved.'); });
  $('#units').addEventListener('change', () => state.files && run(state.files, state.isDemo));
  ['#age', '#sex', '#maxhr', '#athlete'].forEach((s) => $(s).addEventListener('change', () => state.ds && render()));
}

async function run(files, demo = false) {
  status('Reading files in your browser…');
  try {
    const t0 = performance.now();
    state.files = files; state.isDemo = demo;
    state.ds = await parseFiles(files, (m) => status(m), { units: $('#units').value });
    state.ds.parseMs = performance.now() - t0;
    state.ds.isDemo = demo;
    const p = state.ds.profile;
    if (p.ageFromFile != null && !$('#age').value) $('#age').value = p.ageFromFile;
    if (p.sexFromFile && !$('#sex').value) $('#sex').value = p.sexFromFile;
    if (p.maxHrFromFile && !$('#maxhr').value) $('#maxhr').value = p.maxHrFromFile;
    render();
    const used = state.ds.files.filter((f) => !f.skipped && !f.name.includes(' › ')).length;
    status(`${demo ? 'Demo data loaded (synthetic). ' : ''}Read ${files.length} file(s); ${used} contained usable data. Nothing left your device.`);
    $('#clear').hidden = false;
    $('#report').hidden = false;
    $('#range').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    console.warn(e);
    status(`Sorry, those files could not be read (${e.message}).`, true);
  }
}

function ctx() {
  const n = (s) => { const v = parseFloat($(s).value); return Number.isFinite(v) ? v : null; };
  return { vo2Table: state.vo2Table, age: n('#age'), sex: $('#sex').value || null, maxHr: n('#maxhr'), athlete: $('#athlete').checked };
}

function render() {
  const ds = state.ds; const c = ctx();
  const end = ds.endDay;
  const fmtDay = (d) => (ds.relativeDays && !ds.datedDays ? `day ${d}` : new Date(d * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }));
  const sec = (id, html) => { $(`#${id} .body`).innerHTML = html; };

  // Data range
  const days = ds.days; const runs = ds.runs();
  $('#range').innerHTML = end == null
    ? `<strong>No usable data found.</strong> Each section below shows what it looked for.`
    : `${ds.isDemo ? '<strong>Demo data (synthetic, 90 days).</strong> ' : ''}Data range: <strong>${esc(fmtDay(Math.min(...days.concat(ds.activities.map((a) => a.day).filter((x) => x != null)))))} – ${esc(fmtDay(end))}</strong> · ${days.length} day(s) of daily data · ${ds.activities.length} activit${ds.activities.length === 1 ? 'y' : 'ies'} (${runs.length} run${runs.length === 1 ? '' : 's'}). "This week" means the 7 days ending ${esc(fmtDay(end))}.`
      + (ds.datedDays && (Date.now() / 864e5 - end) > 14 ? `<p class="warn">Your data ends on ${esc(fmtDay(end))}, so "this week" and "this month" refer to the weeks before that date, not to today.</p>` : '')
      + (ds.csvUnits ? `<p>Activities CSV distances read as <strong>${ds.csvUnits.unit === 'mi' ? 'miles' : 'kilometres'}</strong> (${ds.csvUnits.auto ? 'detected from pace and stride data; change it under "Your details" if wrong' : 'your choice'}). Results are shown in km.</p>` : '')
      + (ds.implausibleRuns ? `<p class="warn">${ds.implausibleRuns} run(s) with an impossible pace (faster than 2:00 or slower than 20:00 per km) were left out.</p>` : '')
      + ds.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('');

  if (end == null) {
    for (const [id, keys] of [['sec-score', ['vo2max', 'resting_hr', 'fitness']], ['sec-recovery', ['sleep', 'hrv', 'body_battery']], ['sec-load', ['training_load']], ['sec-running', ['aerobic', 'cadence']]])
      sec(id, keys.map((k) => missingBox(k, LOOKED[k])).join(''));
    sec('sec-change', missingBox('', 'at least 60 days of daily data or runs'));
    sec('sec-summary', `<p>Not enough data for a summary.</p><p class="note">${esc(TEXT.disclaimer)}</p>`);
    renderFiles(ds); return;
  }

  const vo2 = E.evalVo2(ds, end, c), rhr = E.evalRhr(ds, end), hrv = E.evalHrv(ds, end), sleep = E.evalSleep(ds, end), bb = E.evalBodyBattery(ds, end);
  const load = E.evalLoad(ds, end), aero = E.evalAerobic(ds, end, c), cad = E.evalCadence(ds, end);

  // 1. Score card
  const fa = ds.latest('fitnessAge');
  const chrono = c.age ?? ds.latest('chronoAge')?.v ?? null;
  const faHtml = fa
    ? infoCard('Fitness age', `<div class="big">${round(fa.v, 1)} <small>years</small></div>${chrono != null ? `<p class="say">${fa.v < chrono ? `About ${round(chrono - fa.v, 1)} years younger than your age (${round(chrono, 0)}).` : fa.v > chrono ? `About ${round(fa.v - chrono, 1)} years above your age (${round(chrono, 0)}). Regular activity, a healthy resting heart rate and body composition move this number.` : 'The same as your age.'}</p>` : ''}<p class="note">Garmin's estimate, as of ${esc(fmtDay(fa.day))}. Shown as Garmin reports it; there is no separate coaching rule for it.</p>`, ds.filesFor(['fitnessAge']))
    : `<article class="metric"><div class="metric-head"><h3>Fitness age</h3>${pill('missing')}</div>${missingBox('Fitness age', LOOKED.fitness)}</article>`;
  sec('sec-score', `<div class="grid three">${metricCard(vo2, LOOKED.vo2max)}${metricCard(rhr, LOOKED.resting_hr)}${faHtml}</div>`);

  // 2. Recovery
  sec('sec-recovery', `<div class="grid three">${metricCard(sleep, LOOKED.sleep)}${metricCard(hrv, LOOKED.hrv)}${metricCard(bb, LOOKED.body_battery)}</div>`);

  // 3. Load
  sec('sec-load', `<div class="grid one">${metricCard(load, LOOKED.training_load)}</div>`);

  // 4. Running
  const pb = E.personalBests(ds);
  const pbHtml = pb
    ? infoCard(pb.source === 'garmin' ? 'Personal bests (Garmin records)' : 'Personal bests', `<dl class="kv">${pb.items.map((i) => `<dt>${esc(i.label)}${i.day != null ? ` <span class="note">· ${esc(fmtDay(i.day))}</span>` : ''}${i.note ? `<br><span class="note">${esc(i.note)}</span>` : ''}</dt><dd>${esc(i.value)}</dd>`).join('')}</dl>${pb.source === 'activities' ? '<p class="note">Worked out from whole runs in your files (not best splits inside longer runs). Distances with no matching run are left out.</p>' : ''}`, pb.files)
    : `<article class="metric"><div class="metric-head"><h3>Personal bests</h3>${pill('missing')}</div>${missingBox('', '*_personalRecord.json or runs in your activity files')}</article>`;
  const yr = E.yearlyRunning(ds);
  const yrHtml = yr.length >= 2 ? `<h3 class="mt">Running by year</h3><div class="table-wrap"><table><thead><tr><th>Year</th><th class="num">Runs</th><th class="num">Distance</th><th class="num">Avg pace</th><th class="num">Median HR</th><th class="num">Longest</th></tr></thead><tbody>${yr.map((y) => `<tr><td>${y.year}${y.partial ? ' <span class="note">(to date)</span>' : ''}</td><td class="num">${y.runs}</td><td class="num">${Math.round(y.km).toLocaleString('en-GB')} km</td><td class="num">${y.pace ? E.fmtPace(y.pace) + ' /km' : '–'}</td><td class="num">${y.hr ? Math.round(y.hr) : '–'}</td><td class="num">${round(y.longest, 1)} km</td></tr>`).join('')}</tbody></table></div><p class="note">Average pace = total time ÷ total distance for runs with both.</p>` : '';
  sec('sec-running', `<div class="grid three">${metricCard(aero, LOOKED.aerobic)}${metricCard(cad, LOOKED.cadence)}${pbHtml}</div>${yrHtml}`);

  // 5. Month change
  const mc = E.monthChange(ds, end);
  const tbl = changeTable(mc, fmtDay);
  sec('sec-change', tbl || missingBox('', 'at least 10 days of a daily measure (or some runs) in both the last 30 days and the 30 days before', 'There isn\'t enough data covering two back-to-back 30-day periods.'));

  // 6. Summary
  const results = [vo2, rhr, hrv, sleep, bb, load, aero, cad];
  const flags = E.redFlags(ds, end, c, rhr);
  const s = E.summarise(results, flags, rhr);
  const li = (arr) => (arr.length ? `<ul>${arr.map((r) => `<li><strong>${esc(r.label)}</strong> ${pill(r.verdict)}<br><span class="note">${esc(r.text)}</span></li>`).join('')}</ul>` : '<p class="note">None right now.</p>');
  const notRated = results.filter((r) => r.verdict === 'insufficient' || r.verdict === 'not_available').map((r) => r.label);
  sec('sec-summary', `${flags.flags.length ? `<div class="flag"><strong>Worth a check-up.</strong> ${flags.flags.map(esc).join(' ')} ${esc(TEXT.redFlag)}</div>` : ''}
    <p class="headline">${esc(s.headline)}</p>${s.why ? `<p>${esc(s.why)}</p>` : ''}${!s.counts.rated && ds.activities.length && !ds.days.length ? '<p>Your files contain workouts only. For resting heart rate, sleep, HRV, Body Battery and training load, add the full Garmin account-export ZIP. The running history above is still worked out from your workouts.</p>' : ''}
    <div class="cols"><div><h3>Going well</h3>${li(s.strengths)}</div><div><h3>Focus on</h3>${li(s.focus)}</div></div>
    ${s.next ? `<h3 class="mt">Next step</h3><p>${esc(s.next)}</p>` : ''}
    <p class="note">Red-flag check: ${flags.flags.length ? `${flags.flags.length} raised.` : 'nothing fired.'} ${flags.checks.map(esc).join(' · ')}</p>
    ${notRated.length ? `<p class="note">Not rated (not available or not enough data): ${esc(notRated.join(', '))}.</p>` : ''}
    <p class="note"><strong>If you have chest pain, fainting, palpitations or breathlessness at rest, please seek medical help now (NHS 111 / 999 in the UK, or your local emergency number).</strong></p>
    <p class="note">${esc(TEXT.disclaimer)}</p>`);
  renderFiles(ds);
}

function renderFiles(ds) {
  const list = ds.files.filter((f) => !/ › /.test(f.name) || !f.skipped);
  $('#sec-files .body').innerHTML = `<ul>${list.map((f) => `<li class="${f.skipped ? 'skip' : ''}">${esc(f.name)} — ${esc(f.kind)}${f.rows != null && !f.skipped ? ` (${f.rows} record${f.rows === 1 ? '' : 's'}${f.note ? `; ${esc(f.note)}` : ''})` : ''}${f.skipped ? `: skipped (${esc(f.skipped)})` : ''}</li>`).join('')}</ul><p class="note">All parsing happened in this tab. Nothing was uploaded or saved.</p>`;
}

init();
