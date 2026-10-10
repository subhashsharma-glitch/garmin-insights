// GPX parsing with the browser's DOMParser (no library). Reads lat/lon, time, elevation and
// Garmin TrackPointExtension heart rate / cadence / temperature.
import { summariseTrack } from './track.js';
import { dateToDay, isRunType, isIndoorType } from '../model.js';

export function parseGpx(text, name, ds) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return { kind: 'GPX', skipped: 'Not valid XML' };
  const byLocal = (el, n) => [...el.getElementsByTagName('*')].filter((x) => x.localName === n);
  let count = 0;
  const tracks = byLocal(doc, 'trk');
  for (const trk of tracks) {
    const typeEl = [...trk.children].find((c) => c.localName === 'type');
    const type = typeEl ? typeEl.textContent.trim() : 'running';
    const pts = byLocal(trk, 'trkpt').map((p) => {
      const val = (n) => { const e = byLocal(p, n)[0]; return e ? Number(e.textContent) : undefined; };
      const t = byLocal(p, 'time')[0];
      return { lat: Number(p.getAttribute('lat')), lon: Number(p.getAttribute('lon')), ele: val('ele'), t: t ? Date.parse(t.textContent) : NaN, hr: val('hr'), cad: val('cad'), temp: val('atemp') };
    });
    const s = summariseTrack(pts);
    if (!s) continue;
    ds.datedDays = true;
    ds.addActivity({ ...s, day: dateToDay(s.start), type, isRun: isRunType(type) || type === '9', indoor: isIndoorType(type) }, name);
    count++;
  }
  return count ? { kind: 'GPX track', rows: count } : { kind: 'GPX', skipped: 'No timed track points' };
}
