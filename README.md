# Garmin Fitness Insights

A private, in-browser report for your Garmin data: **https://subhashsharma-glitch.github.io/garmin-insights/**

Drop in a Garmin Connect account-export ZIP, or individual FIT, GPX or CSV files, and get:

1. **Score card**: VO2 max (with Garmin's age/sex category), resting heart rate, fitness age
2. **Recovery check**: sleep, HRV, Body Battery
3. **Training load balance**: acute:chronic ratio and Garmin training status
4. **Running breakdown**: pace at heart rate (efficiency and decoupling), cadence, personal bests
5. **What changed this month**: last 30 days compared with the 30 before
6. **Coaching summary** with red flags

Every section shows a "Not found in your files" state when its data is missing. Values are never invented or filled in.

## Privacy
Static site with no backend. Files are read with the browser's File API and analysed in the tab. There's no upload, no storage, no cookies, no analytics and no third-party requests. A Content-Security-Policy (`default-src 'none'; connect-src 'self'`) blocks any request to another site. The only fetches are same-origin files at page load (the VO2 max table and the demo CSVs).

## Structure
```
index.html, css/styles.css
js/app.js               page wiring and section rendering
js/render.js            HTML helpers
js/model.js             in-memory Dataset (daily rows + activities)
js/stats.js             mean / median / pstdev / quantiles
js/parsers/             csv.js, gpx.js (DOMParser), fit.js, garmin-zip.js, track.js, index.js
js/coach/rules.js       thresholds + wording from coaching-rules.md
js/coach/evaluate.js    metric evaluators, red flags, month change, summary
js/vendor/              JSZip 3.10.2 (MIT), fit-file-parser 6.2.1 browser bundle (MIT), with licences
data/vo2max-table.json  Garmin's VO2 max category table (Cooper Institute data), used as a lookup
demo/                   SYNTHETIC sample data (seed 42) + expected-output reference
test/                   fixture generator, engine test, headless-Chrome test
```

## Garmin account export files read
| File (inside `DI_CONNECT/`) | Used for |
|---|---|
| `DI-Connect-Aggregator/UDSFile_*.json` | resting HR, steps, Body Battery (high/low/charged/drained) |
| `DI-Connect-Wellness/*_sleepData.json` | sleep duration (deep+light+REM), sleep score, sleep midpoint |
| `DI-Connect-Wellness/*healthStatusData*.json` | overnight HRV + baseline range, resting HR |
| `DI-Connect-Wellness/*fitnessAge*.json` | fitness age |
| `DI-Connect-Metrics/MetricsMaxMetData_*.json` | VO2 max (running/cycling) |
| `DI-Connect-Metrics/*AcuteTrainingLoad*`, `*TrainingHistory*` | acute/chronic load, ratio, training status |
| `DI-Connect-Fitness/*_summarizedActivities.json` | activities (ms / cm units converted) |
| `DI-Connect-Fitness/*_personalRecord.json` | personal records (1 km, 1 mile, 5 km, 10 km, longest run) |
| `DI-Connect-User/user_profile.json` | birth date and gender (for the VO2 max category) |
| `DI-Connect-Uploaded-Files/*.zip` | nested original FIT files (up to 400 per upload) |

Field names vary between export versions, so every JSON file is also scanned for known keys.

## Tests
```
cd test && npm i && node make-fixtures.mjs fixtures   # synthetic FIT, GPX, Activities.csv, mock export ZIP
node engine-test.mjs                                   # rules on the sample CSV (run from repo root)
python3 -m http.server 8765 & node browser-test.mjs    # 1440 px and 390 px; console errors, overflow, network
```

Not medical advice. Not affiliated with Garmin.
