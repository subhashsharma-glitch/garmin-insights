// Builds small SYNTHETIC test files: a FIT run, a GPX run, a Garmin Connect Activities.csv and a mock Garmin account-export ZIP.
import fs from 'fs';
import { Encoder, Profile } from '@garmin/fitsdk';
import JSZip from 'jszip';
const out = process.argv[2] || 'fixtures'; fs.mkdirSync(out, { recursive: true });
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const semi = (deg) => Math.round(deg * (2 ** 31 / 180));

function makeFit(start, minutes, { hr0 = 140, drift = 6 } = {}) {
  const enc = new Encoder();
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: start, type: 'activity', serialNumber: 1 });
  let dist = 0, lat = 51.5, lon = -0.12, n = 0; const N = minutes * 12; let hrSum = 0;
  for (let i = 0; i <= N; i++) {
    const t = new Date(start.getTime() + i * 5000);
    const speed = 2.9 + 0.1 * Math.sin(i / 40); dist += speed * 5; lat += (speed * 5) / 111320;
    const hr = Math.round(hr0 + (drift * i) / N + rnd() * 2); hrSum += hr; n++;
    enc.onMesg(Profile.MesgNum.RECORD, { timestamp: t, positionLat: semi(lat), positionLong: semi(lon), distance: dist, speed, heartRate: hr, cadence: 84, altitude: 30 + 3 * Math.sin(i / 60), temperature: 15 });
  }
  const end = new Date(start.getTime() + N * 5000);
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: end, startTime: start, totalElapsedTime: N * 5, totalTimerTime: N * 5, totalDistance: dist });
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: end, startTime: start, sport: 'running', subSport: 'generic', totalElapsedTime: N * 5, totalTimerTime: N * 5, totalDistance: dist, avgHeartRate: Math.round(hrSum / n), maxHeartRate: hr0 + drift + 2, avgCadence: 84, totalAscent: 12, avgTemperature: 15 });
  enc.onMesg(Profile.MesgNum.ACTIVITY, { timestamp: end, numSessions: 1, type: 'manual', totalTimerTime: N * 5 });
  return enc.close();
}
fs.writeFileSync(`${out}/test-run.fit`, makeFit(new Date('2026-10-04T08:00:00Z'), 55));

// GPX
let g = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="synthetic-test" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n<trk><name>Synthetic test run</name><type>running</type><trkseg>\n`;
{ let lat = 51.5, t0 = Date.parse('2026-10-06T07:30:00Z'); for (let i = 0; i <= 50 * 12; i++) { lat += (2.8 * 5) / 111320; g += `<trkpt lat="${lat.toFixed(6)}" lon="-0.120000"><ele>${(25 + 2 * Math.sin(i / 50)).toFixed(1)}</ele><time>${new Date(t0 + i * 5000).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:atemp>14</gpxtpx:atemp><gpxtpx:hr>${Math.round(138 + (8 * i) / 600)}</gpxtpx:hr><gpxtpx:cad>83</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>\n`; } }
g += '</trkseg></trk></gpx>\n'; fs.writeFileSync(`${out}/test-run.gpx`, g);

// Garmin Connect Activities.csv (list export)
let csv = 'Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Aerobic TE,Avg Run Cadence,Max Run Cadence,Avg Pace,Best Pace,Total Ascent,Total Descent,Avg Stride Length,Moving Time\n';
for (let i = 0; i < 24; i++) { const d = new Date(Date.parse('2026-08-08T07:00:00Z') + i * 2.5 * 864e5); const km = (5 + (i % 4) * 1.7).toFixed(2); const sec = Math.round(km * (340 - i)); const hh = (s) => new Date(s * 1000).toISOString().slice(11, 19); csv += `Running,${d.toISOString().slice(0, 19).replace('T', ' ')},false,"Morning Run, synthetic",${km},400,${hh(sec)},${141 + (i % 3)},165,3.1,${166 + (i % 4)},180,5:40,4:50,${30 + i},${30 + i},1.05,${hh(sec)}\n`; }
fs.writeFileSync(`${out}/Activities.csv`, csv);

// Mock account export ZIP (structure mirrors DI_CONNECT; all values synthetic)
const zip = new JSZip(); const D = 'DI_CONNECT/';
const day0 = Date.parse('2026-07-27T00:00:00Z'); const NDAYS = 75;
const iso = (i) => new Date(day0 + i * 864e5).toISOString().slice(0, 10);
const uds = [], sleep = [], health = [], maxmet = [], load = [], hist = [];
for (let i = 0; i < NDAYS; i++) {
  const late = i >= NDAYS - 7;
  uds.push({ userProfilePK: 1, calendarDate: iso(i), totalSteps: 8000 + Math.round(rnd() * 5000), restingHeartRate: Math.round(50 + rnd() * 3 + (late ? 1 : 0)),
    bodyBattery: { chargedValue: 60, drainedValue: 55 + Math.round(rnd() * 10), bodyBatteryStatList: [{ bodyBatteryStatType: 'HIGHEST', statsValue: Math.round(80 + rnd() * 10) }, { bodyBatteryStatType: 'LOWEST', statsValue: 20 }] } });
  const st = Date.parse(iso(i) + 'T00:00:00Z') - 90 * 60000 + Math.round(rnd() * 40) * 60000; const len = (7.2 + rnd() * 0.8) * 3600000;
  sleep.push({ calendarDate: iso(i), sleepStartTimestampGMT: new Date(st).toISOString().slice(0, 21), sleepEndTimestampGMT: new Date(st + len).toISOString().slice(0, 21), deepSleepSeconds: Math.round(len / 1000 * 0.2), lightSleepSeconds: Math.round(len / 1000 * 0.55), remSleepSeconds: Math.round(len / 1000 * 0.2), awakeSleepSeconds: 600, sleepScores: { overallScore: 82 + Math.round(rnd() * 8) } });
  health.push({ calendarDate: iso(i), metrics: [{ type: 'HRV', value: 58 + Math.round(rnd() * 6), baselineLowerLimit: 52, baselineUpperLimit: 66, status: 'IN_RANGE' }, { type: 'HR', value: uds[i].restingHeartRate }] });
  if (i % 9 === 0) maxmet.push({ calendarDate: iso(i), sport: 'RUNNING', vo2MaxValue: 47 + (i > 40 ? 1 : 0), vo2MaxPreciseValue: 47.2 + i * 0.02, maxMet: 13.4 });
  if (i >= 28) load.push({ calendarDate: iso(i), dailyTrainingLoadAcute: 420 + Math.round(rnd() * 40), dailyTrainingLoadChronic: 400, dailyAcuteChronicWorkloadRatio: 1.05 + rnd() * 0.1 });
  if (i >= 28) hist.push({ calendarDate: iso(i), trainingStatus: 7, trainingStatus2FeedbackPhrase: 'PRODUCTIVE_6' });
}
const acts = [];
for (let i = 0; i < NDAYS; i += 2) { const start = day0 + i * 864e5 + 7 * 3600000; const durMs = (40 + (i % 6) * 5) * 60000; const sp = 2.85 + i * 0.002; acts.push({ activityId: 1000 + i, name: 'Run', activityType: 'running', sportType: 'RUNNING', startTimeGmt: start, startTimeLocal: start + 3600000, duration: durMs, movingDuration: durMs, distance: Math.round(sp * durMs / 1000 * 100), elevationGain: 4000, avgHr: 141 + (i % 3), maxHr: 160, avgRunCadence: 84, vO2MaxValue: 47 }); }
zip.file(`${D}DI-Connect-Aggregator/UDSFile_2026-07-27_2026-10-09.json`, JSON.stringify(uds));
zip.file(`${D}DI-Connect-Wellness/2026-07-27_2026-10-09_1_sleepData.json`, JSON.stringify(sleep));
zip.file(`${D}DI-Connect-Wellness/2026-07-27_2026-10-09_healthStatusData.json`, JSON.stringify(health));
zip.file(`${D}DI-Connect-Wellness/1_fitnessAgeData.json`, JSON.stringify([{ asOfDateGmt: iso(NDAYS - 3) + 'T00:00:00.0', chronologicalAge: 41, currentBioAge: 36.5 }]));
zip.file(`${D}DI-Connect-Metrics/MetricsMaxMetData_20260727_20261009_1.json`, JSON.stringify(maxmet));
zip.file(`${D}DI-Connect-Metrics/MetricsAcuteTrainingLoad_20260727_20261009_1.json`, JSON.stringify(load));
zip.file(`${D}DI-Connect-Metrics/TrainingHistory_20260727_20261009_1.json`, JSON.stringify(hist));
zip.file(`${D}DI-Connect-Fitness/user@example.com_0_summarizedActivities.json`, JSON.stringify([{ summarizedActivitiesExport: acts }]));
zip.file(`${D}DI-Connect-Fitness/user@example.com_personalRecord.json`, JSON.stringify([{ personalRecords: [{ typeId: 3, value: 1394.2, current: true, prStartTimeGmt: day0 + 20 * 864e5 }, { typeId: 4, value: 2950.5, current: true, prStartTimeGmt: day0 + 44 * 864e5 }, { typeId: 7, value: 18500.4, current: true, prStartTimeGmt: day0 + 50 * 864e5 }] }]));
zip.file(`${D}DI-Connect-User/user_profile.json`, JSON.stringify({ userName: 'synthetic', birthDate: '1985-03-02', gender: 'MALE' }));
const inner = new JSZip(); inner.file('synthetic_ACTIVITY.fit', makeFit(new Date('2026-10-08T07:00:00Z'), 50, { drift: 14 }));
zip.file(`${D}DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip`, await inner.generateAsync({ type: 'uint8array' }));
fs.writeFileSync(`${out}/mock-garmin-export.zip`, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
console.log('ok', fs.readdirSync(out));
