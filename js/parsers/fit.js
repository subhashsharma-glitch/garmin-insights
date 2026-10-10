// FIT activity files via the vendored fit-file-parser bundle (window.FitParser).
import { summariseTrack } from './track.js';
import { dateToDay, isRunType, isIndoorType } from '../model.js';

const parseAsync = (buf) => new Promise((resolve, reject) => {
  const parser = new window.FitParser({ force: true, speedUnit: 'm/s', lengthUnit: 'm', temperatureUnit: 'celsius', elapsedRecordField: true, mode: 'list' });
  parser.parse(buf, (err, data) => (err ? reject(err) : resolve(data)));
});
const t = (v) => (v instanceof Date ? v.getTime() : v ? Date.parse(v) : NaN);

export async function parseFit(buf, name, ds) {
  let data;
  try { data = await parseAsync(buf); } catch (e) { return { kind: 'FIT', skipped: 'Could not decode FIT file' }; }
  const fileType = data.file_id?.type ?? data.file_ids?.[0]?.type;
  const session = (data.sessions || [])[0];
  if (!session && !(data.records || []).length) return { kind: 'FIT', skipped: `Not an activity file${fileType ? ` (type: ${fileType})` : ''}` };
  const sport = String(session?.sport ?? data.sports?.[0]?.sport ?? 'unknown');
  const subSport = String(session?.sub_sport ?? '');
  const type = subSport && subSport !== 'generic' ? `${sport} (${subSport})` : sport;
  const run = isRunType(sport);
  const pts = (data.records || []).map((r) => ({
    t: t(r.timestamp), lat: r.position_lat, lon: r.position_long, ele: r.enhanced_altitude ?? r.altitude,
    hr: r.heart_rate, cad: r.cadence != null ? r.cadence + (r.fractional_cadence || 0) : undefined,
    dist: r.distance, temp: r.temperature,
  }));
  const s = summariseTrack(pts, { perFootCadence: run }) || {};
  let cadence = s.cadence ?? null;
  if (session?.avg_cadence != null) cadence = (session.avg_cadence + (session.avg_fractional_cadence || 0)) * (run ? 2 : 1);
  if (session?.avg_running_cadence != null) cadence = session.avg_running_cadence * 2;
  const start = t(session?.start_time) || s.start;
  const a = {
    start, day: dateToDay(start), type, isRun: run, indoor: isIndoorType(subSport) || isIndoorType(type),
    durS: session?.total_timer_time ?? s.durS, distM: session?.total_distance ?? s.distM,
    avgHr: session?.avg_heart_rate ?? s.avgHr, maxHr: session?.max_heart_rate ?? s.maxHr,
    cadence: run ? cadence : null, gainM: session?.total_ascent ?? s.gainM,
    tempC: session?.avg_temperature ?? s.tempC, decoupling: s.decoupling ?? null, decouplingFromTrack: s.decoupling != null, hrList: s.hrList,
  };
  ds.datedDays = true;
  ds.addActivity(a, name);
  return { kind: `FIT activity (${type})`, rows: 1 };
}
