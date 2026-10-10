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
  const s = String(v).replace(/,/g, '').trim();
  if (s === '' || s === '--' || s.toLowerCase() === 'nan') return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
};
const hms = (v) => { // "01:02:03", "45:10", "45:10.3"
  if (!v || v === '--') return null;
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

  // 3) Garmin Connect "Activities.csv" (Export CSV from the activities list). Assumes metric units.
  if (has('activitytype') && has('date') && has('time', 'movingtime')) {
    let n = 0;
    for (const r of records) {
      const type = get(r, 'activitytype') || '';
      const dateStr = get(r, 'date');
      const start = dateStr ? Date.parse(dateStr.replace(' ', 'T')) : null;
      ds.datedDays = true;
      const durS = hms(get(r, 'movingtime')) || hms(get(r, 'time'));
      const cadRun = num(get(r, 'avgruncadence')); const cadGen = num(get(r, 'avgcadence'));
      ds.addActivity({
        day: dateToDay(dateStr), start: Number.isFinite(start) ? start : null, type, isRun: isRunType(type), indoor: isIndoorType(type), durS,
        distM: num(get(r, 'distance')) != null ? num(get(r, 'distance')) * 1000 : null,
        avgHr: num(get(r, 'avghr')), maxHr: num(get(r, 'maxhr')),
        cadence: cadRun ?? (isRunType(type) ? cadGen : null),
        gainM: num(get(r, 'totalascent')), tempC: num(get(r, 'avgtemperature', 'mintemp')),
      }, name); n++;
    }
    return { kind: 'Garmin Connect activities CSV (metric units assumed)', rows: n };
  }
  return { kind: 'CSV', rows: 0, skipped: 'Unrecognised CSV columns' };
}
