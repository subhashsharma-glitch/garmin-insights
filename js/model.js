// The in-memory dataset every parser writes into. Nothing here is persisted.
// Days are integers: real dates are days since 1970-01-01 (UTC); the sample CSV uses relative day numbers.
export const DAILY_FIELDS = [
  'rhr', 'hrv', 'hrvWeekly', 'hrvLow', 'hrvHigh', 'hrvStatus',
  'sleepH', 'sleepScore', 'sleepMid', 'bbMax', 'bbMin', 'bbCharged', 'bbDrained', 'steps',
  'acute', 'chronic', 'ratio', 'trainingStatus', 'loadFocusShortage', 'vo2run', 'vo2cycle', 'fitnessAge', 'chronoAge', 'irregularRhythm',
];

export function dateToDay(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') { // epoch ms
    const d = new Date(input); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  }
  const m = String(input).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5);
  const d = new Date(input);
  return isNaN(d) ? null : Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
}

export class Dataset {
  constructor() {
    this.daily = new Map();       // day -> {field: value}
    this.activities = [];         // normalised activities
    this.profile = {};            // {age, sex, maxHr, athlete}
    this.prs = [];                // Garmin personal records {label, seconds|meters, day}
    this.fieldFiles = new Map();  // field -> Set(file name)
    this.files = [];              // {name, kind, status, note}
    this.relativeDays = false;    // true when data uses "day 1..n" (sample format)
    this.datedDays = false;
    this.warnings = [];
  }
  note(field, file) {
    if (!this.fieldFiles.has(field)) this.fieldFiles.set(field, new Set());
    this.fieldFiles.get(field).add(file);
  }
  set(day, field, value, file, { overwrite = true } = {}) {
    if (day === null || day === undefined || value === null || value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value))) return;
    if (!this.daily.has(day)) this.daily.set(day, {});
    const row = this.daily.get(day);
    if (!overwrite && row[field] !== undefined) return;
    row[field] = value;
    this.note(field, file);
  }
  addActivity(a, file) {
    if (!a || !(a.durS > 0)) return;
    // De-duplicate the same workout arriving from several files (start within 2 min and similar duration).
    const dup = a.start && this.activities.find((b) => b.start && Math.abs(b.start - a.start) < 120000 && Math.abs(b.durS - a.durS) < 300);
    if (dup) {
      for (const [k, v] of Object.entries(a)) if (dup[k] == null && v != null) dup[k] = v;
      dup.sources.add(file);
      return;
    }
    a.sources = new Set([file]);
    this.activities.push(a);
    this.note('activities', file);
  }
  filesFor(fields) {
    const s = new Set();
    for (const f of fields) for (const n of this.fieldFiles.get(f) || []) s.add(n);
    return [...s];
  }
  get days() { return [...this.daily.keys()].sort((a, b) => a - b); }
  get endDay() {
    const d = this.days; const a = this.activities.map((x) => x.day).filter((x) => x != null);
    const all = d.concat(a); return all.length ? Math.max(...all) : null;
  }
  // Values of a field for days in [from, to] (inclusive), in day order.
  values(field, from, to) {
    const out = [];
    for (let d = from; d <= to; d++) { const r = this.daily.get(d); if (r && r[field] !== undefined && r[field] !== null) out.push(r[field]); }
    return out;
  }
  series(field, from, to) {
    const out = [];
    for (let d = from; d <= to; d++) { const r = this.daily.get(d); out.push({ day: d, v: r ? r[field] ?? null : null }); }
    return out;
  }
  latest(field, from = -Infinity, to = Infinity) {
    let best = null;
    for (const [d, r] of this.daily) if (r[field] != null && d >= from && d <= to && (!best || d > best.day)) best = { day: d, v: r[field] };
    return best;
  }
  // Runs with a plausible pace (2:00–20:00 per km) when distance and time are known; others are left out of analysis.
  runs() { return this.activities.filter((a) => a.isRun && !(a.distM > 0 && a.durS > 0 && (a.durS / (a.distM / 1000) < 120 || a.durS / (a.distM / 1000) > 1200))); }
  get implausibleRuns() { return this.activities.filter((a) => a.isRun).length - this.runs().length; }
}

export const isRunType = (t) => /run/i.test(t || '') && !/(cycl|bike|ride)/i.test(t || '');
export const isIndoorType = (t) => /(treadmill|indoor)/i.test(t || '');
