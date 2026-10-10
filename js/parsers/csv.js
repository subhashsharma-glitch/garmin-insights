// CSV parsing: the sample format (daily.csv / activities.csv) and Garmin Connect's "Activities.csv" list export.
import { dateToDay, isRunType, isIndoorType } from '../model.js';

export function parseCsvText(text) {
  const rows = []; let row = [], field = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return { header: [], records: [] };
  const header = nonEmpty[0].map((h) => h.trim());
  const records = nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { header, records };
}

const num = (v) => {
  if (v === undefined || v === null) return null;
  // Strip thousands separators and the leading apostrophe spreadsheets add to negative numbers ("'-6").
  const s = String(v).replace(/,/g, '').replace(/^'/, '').trim();
  if (s === '' || /^-+(:-+)*$/.test(s) || s.toLowerCase() === 'nan') return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
};
const hms = (v) => { // "01:02:03", "45:10", "45:10.3"
  if (!v || /^[-:]+$/.test(v)) return null;
  const p = String(v).split(':').map(Number); if (p.some((x) => !Number.isFinite(x))) return null;
  return p.reduce((s, x) => s * 60 + x, 0);
};
const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

export function parseCsvFile(text, name, ds) {
  const { header, records } = parseCsvText(text);
  const H = new Set(header.map(norm));
  const has = (...k) => k.some((x) => H.has(x));
  const get = (r, ...keys) => { for (const k of keys) { const h = header.find((x) => norm(x) === k); if (h !== undefined && r[h] !== '') return r[h]; } return undefined; };
  const dayOf = (r) => {
    const d = get(r, 'date', 'calendardate', 'day');
    if (d === undefined) return null;
    if (/^\d+$/.test(d)) { ds.relativeDays = true; return Number(d); }
    ds.datedDays = true; return dateToDay(d);
  };

  // 1) Sample daily format (and any similar dated daily CSV)
  if (has('restinghr', 'hrvlastnightms', 'sleephours', 'bbmax') && has('day', 'date', 'calendardate')) {
    for (const r of records) {
      const d = dayOf(r); if (d === null) continue;
      const map = {
        rhr: num(get(r, 'restinghr', 'restingheartrate')),
        hrv: num(get(r, 'hrvlastnightms', 'hrvms')),
        hrvWeekly: num(get(r, 'hrvweeklyavgms', 'weeklyavgms')),
        hrvLow: num(get(r, 'baselinelowms')), hrvHigh: num(get(r, 'baselinehighms')),
        hrvStatus: get(r, 'hrvstatus')?.toUpperCase(),
        sleepH: num(get(r, 'sleephours')) ?? (num(get(r, 'sleepdurations')) != null ? num(get(r, 'sleepdurations')) / 3600 : null),
        sleepScore: num(get(r, 'sleepscore')),
        sleepMid: num(get(r, 'sleepmidpointminaftermidnight')),
        bbMax: num(get(r, 'bbmax')), bbMin: num(get(r, 'bbmin')),
        bbCharged: num(get(r, 'bbcharged')), bbDrained: num(get(r, 'bbdrained')),
        steps: num(get(r, 'steps')),
        acute: num(get(r, 'acuteload')), chronic: num(get(r, 'chronicload')), ratio: num(get(r, 'loadratio')),
        trainingStatus: get(r, 'trainingstatus')?.toUpperCase(),
        vo2run: num(get(r, 'vo2maxrunning', 'vo2max')), vo2cycle: num(get(r, 'vo2maxcycling')),
        fitnessAge: num(get(r, 'fitnessage')),
      };
      for (const [k, v] of Object.entries(map)) ds.set(d, k, v, name);
    }
    return { kind: 'Daily CSV (sample format)', rows: records.length };
  }

  // 2) Sample activities format
  if (has('durationmin') && has('type', 'activitytype') && has('day', 'date')) {
    let n = 0;
    for (const r of records) {
      const d = dayOf(r); const type = get(r, 'type', 'activitytype') || '';
      const durS = num(get(r, 'durationmin')) * 60;
      ds.addActivity({
        day: d, type, isRun: isRunType(type), indoor: isIndoorType(type), durS,
        distM: num(get(r, 'distancekm')) != null ? num(get(r, 'distancekm')) * 1000 : null,
        avgHr: num(get(r, 'avghr')), maxHr: num(get(r, 'maxhr')), cadence: num(get(r, 'avgcadencespm')),
        gainM: num(get(r, 'elevationgainm')), tempC: num(get(r, 'temperaturec')),
        decoupling: num(get(r, 'decouplingpct')), vo2: num(get(r, 'vo2max')),
      }, name); n++;
    }
    return { kind: 'Activities CSV (sample format)', rows: n };
  }

  // 3) Garmin Connect "Activities.csv" (Export CSV from the activities list).
  // Units follow the account settings and are not labelled, so they are inferred:
  //  - "Avg Pace" (min per unit) with the time gives each row's distance in pace units. A row whose distance is
  //    ~1000x or ~1609x that is in metres (Garmin exports track runs and pool swims in metres).
  //  - steps x stride length (metres) per unit of distance: ~1609 = miles, ~1000 = km.
  //  The user can override with the "Distance units" option.
  if (has('activitytype') && has('date') && has('time', 'movingtime')) {
    const rows = records.map((r) => {
      const type = get(r, 'activitytype') || '';
      const durS = hms(get(r, 'movingtime')) || hms(get(r, 'time'));
      const elapsed = hms(get(r, 'time')) || durS;
      const pace = /:/.test(get(r, 'avgpace') || '') ? hms(get(r, 'avgpace')) : null;
      const dist = num(get(r, 'distance'));
      let ratio = null; if (pace && dist && elapsed) ratio = dist / (elapsed / pace);
      const metresRow = ratio != null && ratio > 300;
      return { r, type, durS, pace, dist, ratio, metresRow };
    });
    const votes = { mi: 0, km: 0 };
    for (const x of rows) {
      if (x.metresRow) { if (Math.abs(x.ratio / 1609.34 - 1) < 0.12) votes.mi += 3; else if (Math.abs(x.ratio / 1000 - 1) < 0.12) votes.km += 3; }
      const steps = num(get(x.r, 'steps')), stride = num(get(x.r, 'avgstridelength'));
      if (!x.metresRow && steps && stride && stride < 2.5 && x.dist > 0.5 && isRunType(x.type)) {
        const m = (steps * stride) / x.dist; if (Math.abs(m / 1609.34 - 1) < 0.15) votes.mi++; else if (Math.abs(m / 1000 - 1) < 0.15) votes.km++;
      }
    }
    const pref = ds.unitPref && ds.unitPref !== 'auto' ? ds.unitPref : null;
    const unit = pref || (votes.mi > votes.km ? 'mi' : 'km');
    const unitM = unit === 'mi' ? 1609.344 : 1000;
    // Stride over ~2.5 means feet, i.e. full imperial settings; then elevation is in feet too.
    const strides = rows.map((x) => num(get(x.r, 'avgstridelength'))).filter((v) => v > 0);
    const elevFeet = unit === 'mi' && strides.length && strides.sort((a, b) => a - b)[Math.floor(strides.length / 2)] > 2.5;
    let n = 0, metresRows = 0;
    for (const x of rows) {
      const { r, type, durS } = x;
      const dateStr = get(r, 'date');
      const start = dateStr ? Date.parse(dateStr.replace(' ', 'T')) : null;
      ds.datedDays = true;
      const swim = /swim/i.test(type);
      let distM = null;
      if (x.dist != null) distM = x.metresRow || swim ? (swim ? null : x.dist) : x.dist * unitM;
      if (x.metresRow) metresRows++;
      const cadRun = num(get(r, 'avgruncadence')); const cadGen = num(get(r, 'avgcadence'));
      const gain = num(get(r, 'totalascent'));
      ds.addActivity({
        day: dateToDay(dateStr), start: Number.isFinite(start) ? start : null, type, isRun: isRunType(type), indoor: isIndoorType(type), durS,
        distM, avgHr: num(get(r, 'avghr')), maxHr: num(get(r, 'maxhr')),
        cadence: cadRun ?? (isRunType(type) ? cadGen : null),
        gainM: gain != null ? (elevFeet ? gain * 0.3048 : gain) : null, tempC: num(get(r, 'avgtemperature', 'mintemp')),
      }, name); n++;
    }
    ds.csvUnits = { unit, auto: !pref, votes, metresRows, elevFeet };
    return { kind: `Garmin Connect activities CSV (distances in ${unit === 'mi' ? 'miles' : 'km'}${pref ? ', set by you' : ', detected'}${metresRows ? `; ${metresRows} track/metre rows` : ''}; swim distances ignored)`, rows: n };
  }
  return { kind: 'CSV', rows: 0, skipped: 'Unrecognised CSV columns' };
}
