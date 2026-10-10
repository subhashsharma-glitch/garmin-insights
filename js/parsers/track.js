// Turn a list of track points into activity summary numbers (used by GPX and FIT).
// Point: {t: ms, lat, lon, ele, hr, cad, dist (optional cumulative m), temp}
const R = 6371008.8;
const toRad = (x) => (x * Math.PI) / 180;
export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function summariseTrack(pts, { perFootCadence = true } = {}) {
  pts = pts.filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  // cumulative distance
  let cum = 0;
  const hasDist = pts.every((p) => Number.isFinite(p.dist));
  for (let i = 0; i < pts.length; i++) {
    if (hasDist) { pts[i].cd = pts[i].dist; continue; }
    if (i > 0 && Number.isFinite(pts[i].lat) && Number.isFinite(pts[i - 1].lat)) cum += haversine(pts[i - 1], pts[i]);
    pts[i].cd = cum;
  }
  // moving time: skip gaps > 30 s where almost no distance was covered (auto-pause style)
  let moving = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].t - pts[i - 1].t) / 1000, dd = pts[i].cd - pts[i - 1].cd;
    if (dt <= 0) continue;
    if (dt > 30 && dd / dt < 0.5) continue;
    moving += dt;
    pts[i].mv = moving;
  }
  pts[0].mv = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].mv === undefined) pts[i].mv = pts[i - 1].mv;
  const distM = pts[pts.length - 1].cd - pts[0].cd;
  // elevation gain with a 3 m hysteresis to ignore GPS noise
  let gain = 0, ref = null, hasEle = false;
  for (const p of pts) {
    if (!Number.isFinite(p.ele)) continue;
    hasEle = true;
    if (ref === null) { ref = p.ele; continue; }
    if (p.ele - ref >= 3) { gain += p.ele - ref; ref = p.ele; } else if (p.ele < ref) ref = p.ele;
  }
  const hrs = pts.map((p) => p.hr).filter((v) => v > 30 && v < 240);
  const cads = pts.map((p) => p.cad).filter((v) => v > 0);
  const temps = pts.map((p) => p.temp).filter(Number.isFinite);
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  let cad = avg(cads);
  if (cad && perFootCadence && cad < 120) cad *= 2; // Garmin GPX/FIT store strides per minute for running
  // aerobic decoupling: EF first half vs second half of moving time
  let decoupling = null;
  const hrCoverage = hrs.length / pts.length;
  if (moving >= 45 * 60 && hrCoverage >= 0.9) {
    const half = moving / 2;
    const first = pts.filter((p) => p.mv <= half), second = pts.filter((p) => p.mv > half);
    const ef = (seg) => {
      if (seg.length < 2) return null;
      const d = seg[seg.length - 1].cd - seg[0].cd, t = seg[seg.length - 1].mv - seg[0].mv;
      const h = avg(seg.map((p) => p.hr).filter((v) => v > 30 && v < 240));
      return t > 0 && h ? (d / (t / 60)) / h : null;
    };
    const e1 = ef(first), e2 = ef(second);
    if (e1 && e2) decoupling = ((e1 - e2) / e1) * 100;
  }
  return {
    start: pts[0].t, durS: moving, distM, gainM: hasEle ? gain : null,
    avgHr: avg(hrs), maxHr: hrs.length ? Math.max(...hrs) : null,
    cadence: cad, tempC: avg(temps), decoupling, hrCoverage,
    lat: pts.find((p) => Number.isFinite(p.lat)) ? true : false,
  };
}
