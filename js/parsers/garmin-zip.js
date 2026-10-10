// Garmin Connect account export (ZIP requested from Garmin's "Export Your Data" page).
// Layout (as documented by the community, e.g. garmin-export-parser, garmin-grafana):
//   DI_CONNECT/DI-Connect-Fitness/<user>_summarizedActivities.json   activities (duration ms, distance cm, elevation cm)
//   DI_CONNECT/DI-Connect-Fitness/<user>_personalRecord.json         personal records
//   DI_CONNECT/DI-Connect-Wellness/<range>_<id>_sleepData.json        sleep stages + sleep scores
//   DI_CONNECT/DI-Connect-Wellness/<range>_healthStatusData.json      HRV / resting HR with baseline ranges
//   DI_CONNECT/DI-Connect-Wellness/<id>_fitnessAgeData.json           fitness age
//   DI_CONNECT/DI-Connect-Aggregator/UDSFile_<range>.json             daily summary: resting HR, steps, Body Battery
//   DI_CONNECT/DI-Connect-Metrics/MetricsMaxMetData_<range>.json      VO2 max (running/cycling)
//   DI_CONNECT/DI-Connect-Metrics/*TrainingHistory*, *AcuteTrainingLoad*  training status / acute & chronic load
//   DI_CONNECT/DI-Connect-User/user_profile.json                      birth date, gender
//   DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_*.zip          original FIT files (nested ZIPs)
// Field names vary between export versions, so every JSON file is also scanned for known keys.
import { dateToDay, isRunType, isIndoorType } from '../model.js';
import { parseFit } from './fit.js';
import { parseGpx } from './gpx.js';
import { parseCsvFile } from './csv.js';

export const MAX_FIT_FROM_ZIP = 400;

const dateKeys = ['calendarDate', 'calendarDateStr', 'summaryDate', 'asOfDateGmt', 'asOfDate', 'date', 'timestampLocal', 'updateTimestamp'];
const findDate = (o) => {
  for (const k of dateKeys) if (o[k] != null) { const d = dateToDay(o[k]); if (d !== null) return d; }
  if (o.metaData?.calendarDate) return dateToDay(o.metaData.calendarDate);
  return null;
};
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const ts = (v) => (typeof v === 'number' ? v : v ? Date.parse(String(v).replace(' ', 'T')) : NaN);
// Local timestamps have no zone; read them as "wall clock" values.
const wallMinutes = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') { const d = new Date(v); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
  const m = String(v).match(/T?(\d{2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null;
};
const STATUS_WORDS = ['OVERREACHING', 'UNPRODUCTIVE', 'STRAINED', 'PRODUCTIVE', 'MAINTAINING', 'PEAKING', 'RECOVERY', 'DETRAINING', 'NO_STATUS'];
const statusFromPhrase = (s) => { if (typeof s !== 'string') return null; const u = s.toUpperCase(); return STATUS_WORDS.find((w) => u.includes(w)) || null; };
const isWrapperObj = (j) => j && typeof j === 'object' && !Array.isArray(j) && findDate(j) === null;
const flatRecords = (json) => {
  // Return arrays of plain objects from common wrappers.
  // Unwrap containers like [{summarizedActivitiesExport:[...]}] but keep dated records like {calendarDate, metrics:[...]}.
  const isWrapper = (x) => x && typeof x === 'object' && !Array.isArray(x) && findDate(x) === null && Object.keys(x).length <= 2 && Object.values(x).some((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
  if (Array.isArray(json)) return json.flatMap((x) => (isWrapper(x) ? Object.values(x).filter(Array.isArray).flat() : [x]));
  if (isWrapperObj(json)) { const arrs = Object.values(json).filter(Array.isArray); return arrs.length ? arrs.flat() : [json]; }
  return [];
};

function handleSleep(recs, name, ds) {
  let c = 0;
  for (const r of recs) {
    const day = findDate(r); if (day === null) continue;
    const secs = ['deepSleepSeconds', 'lightSleepSeconds', 'remSleepSeconds'].map((k) => n(r[k]));
    if (secs.every((v) => v === null)) continue;
    ds.set(day, 'sleepH', secs.reduce((s, v) => s + (v || 0), 0) / 3600, name);
    const score = n(r.sleepScores?.overallScore) ?? n(r.sleepScores?.overall?.value) ?? n(r.overallSleepScore?.value) ?? n(r.sleepScore);
    ds.set(day, 'sleepScore', score, name);
    const sMin = wallMinutes(r.sleepStartTimestampLocal ?? r.sleepStartTimestampGMT);
    const st = ts(r.sleepStartTimestampLocal ?? r.sleepStartTimestampGMT), en = ts(r.sleepEndTimestampLocal ?? r.sleepEndTimestampGMT);
    if (sMin !== null && Number.isFinite(st) && Number.isFinite(en) && en > st) {
      let mid = sMin + (en - st) / 60000 / 2; mid %= 1440; if (mid >= 720) mid -= 1440; // minutes after midnight, evening = negative
      ds.set(day, 'sleepMid', mid, name);
      if (r.sleepStartTimestampLocal == null) ds.sleepMidIsGmt = true;
    }
    c++;
  }
  return c;
}

function handleActivities(recs, name, ds) {
  let c = 0;
  for (const r of recs) {
    if (r.activityId == null && r.activityType == null) continue;
    const type = typeof r.activityType === 'object' ? r.activityType?.typeKey : r.activityType;
    const start = n(r.startTimeGmt) ?? n(r.beginTimestamp);
    const local = n(r.startTimeLocal);
    // Export units: duration ms, distance cm, elevationGain cm, avgSpeed in 0.1 m/s units varies, so speed is derived.
    const durS = n(r.movingDuration) ?? n(r.duration); const distCm = n(r.distance); const gainCm = n(r.elevationGain);
    const scaleMs = durS && durS > 20000 ? 1000 : 1; // ms in exports; seconds in API JSON
    const run = isRunType(type);
    const cad = n(r.avgRunCadence) ?? (run && n(r.avgDoubleCadence) != null ? n(r.avgDoubleCadence) : null);
    ds.addActivity({
      title: typeof r.name === 'string' ? r.name : '', start, day: dateToDay(local ?? start), type: type || 'unknown', isRun: run, indoor: isIndoorType(type),
      durS: durS != null ? durS / scaleMs : null, distM: distCm != null ? (scaleMs === 1000 ? distCm / 100 : distCm) : null,
      avgHr: n(r.avgHr), maxHr: n(r.maxHr), cadence: run ? (cad != null && cad < 120 ? cad * 2 : cad) : null,
      gainM: gainCm != null ? (scaleMs === 1000 ? gainCm / 100 : gainCm) : null,
      tempC: n(r.avgTemperature) ?? n(r.minTemperature), vo2: n(r.vO2MaxValue),
    }, name);
    c++;
  }
  return c;
}

const PR_TYPES = { 1: '1 km', 2: '1 mile', 3: '5 km', 4: '10 km', 7: 'Longest run' };
function handlePRs(recs, name, ds) {
  let c = 0;
  for (const r of recs) {
    const label = PR_TYPES[r.typeId]; if (!label || r.current === false) continue;
    const v = n(r.value); if (v === null) continue;
    ds.prs.push(label === 'Longest run' ? { label, meters: v, day: dateToDay(n(r.prStartTimeGmt) ?? r.actStartDateTimeInGMTFormatted) } : { label, seconds: v, day: dateToDay(n(r.prStartTimeGmt) ?? r.actStartDateTimeInGMTFormatted) });
    ds.note('prs', name); c++;
  }
  return c;
}

// Generic key-based extraction used for every JSON file.
function scanGeneric(recs, name, ds) {
  let c = 0;
  for (const r of recs) {
    if (!r || typeof r !== 'object') continue;
    const day = findDate(r); if (day === null) continue;
    let hit = false;
    const set = (f, v) => { if (v !== null && v !== undefined) { ds.set(day, f, v, name); hit = true; } };
    set('rhr', n(r.restingHeartRate) ?? n(r.restingHeartRateValue));
    set('steps', n(r.totalSteps));
    // Body Battery (UDS file)
    const bb = r.bodyBattery || r.bodyBatteryData;
    if (bb && typeof bb === 'object') {
      for (const s of bb.bodyBatteryStatList || []) {
        if (s.bodyBatteryStatType === 'HIGHEST') set('bbMax', n(s.statsValue));
        if (s.bodyBatteryStatType === 'LOWEST') set('bbMin', n(s.statsValue));
      }
      set('bbCharged', n(bb.chargedValue)); set('bbDrained', n(bb.drainedValue));
    }
    set('bbMax', n(r.bodyBatteryHighestValue)); set('bbMin', n(r.bodyBatteryLowestValue));
    set('bbCharged', n(r.bodyBatteryChargedValue)); set('bbDrained', n(r.bodyBatteryDrainedValue));
    // VO2 max (MaxMet data)
    const vo2 = n(r.vo2MaxPreciseValue) ?? n(r.vo2MaxValue) ?? n(r.vo2Max);
    if (vo2 !== null && vo2 > 10 && vo2 < 95) set(/cycl/i.test(String(r.sport || r.subSport || '')) ? 'vo2cycle' : 'vo2run', vo2);
    // Fitness age
    set('fitnessAge', n(r.fitnessAge) ?? n(r.currentBioAge) ?? n(r.biologicalAge));
    set('chronoAge', n(r.chronologicalAge));
    // Training load / status
    set('acute', n(r.dailyTrainingLoadAcute) ?? n(r.acuteTrainingLoad) ?? n(r.acwrAcuteLoad) ?? n(r.acuteLoad));
    set('chronic', n(r.dailyTrainingLoadChronic) ?? n(r.chronicTrainingLoad) ?? n(r.chronicLoad));
    set('ratio', n(r.dailyAcuteChronicWorkloadRatio) ?? n(r.acwrRatio));
    const st = statusFromPhrase(r.trainingStatusFeedbackPhrase ?? r.trainingStatus2FeedbackPhrase ?? (typeof r.trainingStatus === 'string' ? r.trainingStatus : null));
    set('trainingStatus', st);
    const focus = r.trainingBalanceFeedbackPhrase ?? r.loadFocusFeedbackPhrase;
    if (typeof focus === 'string') set('loadFocusShortage', /SHORTAGE/i.test(focus) ? 1 : 0);
    // HRV: healthStatusData style {metrics:[{type:'HRV', value, baselineLowerLimit, baselineUpperLimit, status}]}
    for (const m of Array.isArray(r.metrics) ? r.metrics : []) {
      if (String(m.type).toUpperCase() === 'HRV') {
        set('hrv', n(m.value)); set('hrvLow', n(m.baselineLowerLimit)); set('hrvHigh', n(m.baselineUpperLimit));
      }
      if (String(m.type).toUpperCase() === 'HR') set('rhr', n(m.value));
    }
    // HRV summary style
    const h = r.hrvSummary || (r.weeklyAvg !== undefined && r.lastNightAvg !== undefined ? r : null);
    if (h) {
      set('hrv', n(h.lastNightAvg)); set('hrvWeekly', n(h.weeklyAvg));
      set('hrvLow', n(h.baseline?.balancedLow)); set('hrvHigh', n(h.baseline?.balancedUpper));
      if (typeof h.status === 'string') set('hrvStatus', h.status.toUpperCase());
    }
    if (hit) c++;
  }
  return c;
}

function handleProfile(json, name, ds) {
  const o = Array.isArray(json) ? json[0] : json; if (!o || typeof o !== 'object') return 0;
  const birth = o.birthDate || o.userInfo?.birthDate;
  const g = String(o.gender || o.userInfo?.gender || '').toUpperCase();
  if (birth && ds.profile.age == null) {
    const b = new Date(birth); if (!isNaN(b)) { const now = new Date(); let age = now.getFullYear() - b.getFullYear(); if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--; ds.profile.ageFromFile = age; ds.note('profile', name); }
  }
  if (g === 'MALE' || g === 'FEMALE') { ds.profile.sexFromFile = g.toLowerCase(); ds.note('profile', name); }
  const mhr = n(o.maxHeartRate) ?? n(o.userInfo?.maxHeartRate); if (mhr) { ds.profile.maxHrFromFile = mhr; ds.note('profile', name); }
  return birth || g ? 1 : 0;
}

export async function parseGarminZip(buf, name, ds, log, depth = 0, budget = { fit: MAX_FIT_FROM_ZIP }) {
  const zip = await window.JSZip.loadAsync(buf);
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  let used = 0; const skippedFit = { n: 0 };
  for (const f of entries) {
    const path = f.name; const base = path.split('/').pop(); const lower = base.toLowerCase();
    if (base.startsWith('._')) continue;
    const label = `${name} › ${path}`;
    try {
      if (lower.endsWith('.json')) {
        const text = await f.async('string');
        let json; try { json = JSON.parse(text); } catch { continue; }
        const recs = flatRecords(json);
        let c = 0;
        if (/sleepdata/i.test(base)) c += handleSleep(recs, label, ds);
        if (/summarizedactivities/i.test(base)) c += handleActivities(recs, label, ds);
        if (/personalrecord/i.test(base)) c += handlePRs(recs, label, ds);
        if (/user_?profile|userprofile|userbiometric/i.test(base)) c += handleProfile(json, label, ds);
        if (/(irregular|ecg|afib)/i.test(base) && recs.length) { ds.irregularFile = label; c++; }
        if (!/summarizedactivities|sleepdata/i.test(base)) c += scanGeneric(recs, label, ds);
        if (c) { used++; ds.files.push({ name: label, kind: 'Garmin export JSON', rows: c }); }
      } else if (lower.endsWith('.fit')) {
        if (budget.fit <= 0) { skippedFit.n++; continue; }
        budget.fit--;
        const r = await parseFit(await f.async('arraybuffer'), label, ds);
        if (!r.skipped) { used++; }
      } else if (lower.endsWith('.gpx')) {
        const r = parseGpx(await f.async('string'), label, ds); if (!r.skipped) used++;
      } else if (lower.endsWith('.csv')) {
        const r = parseCsvFile(await f.async('string'), label, ds); if (!r.skipped) { used++; ds.files.push({ name: label, ...r }); }
      } else if (lower.endsWith('.zip') && depth < 2) {
        log?.(`Opening nested archive ${base}…`);
        const r = await parseGarminZip(await f.async('arraybuffer'), label, ds, log, depth + 1, budget);
        used += r.used;
      }
    } catch (e) {
      ds.warnings.push(`Could not read ${label}: ${e.message}`);
    }
  }
  if (skippedFit.n) ds.warnings.push(`${skippedFit.n} FIT files inside ${name} were not opened (limit ${MAX_FIT_FROM_ZIP} per upload, to keep your browser responsive). Activity summaries still come from summarizedActivities.json.`);
  return { used, entries: entries.length };
}
