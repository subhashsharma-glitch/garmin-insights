// Headless Chrome test: demo data + uploads at 1440 and 390 widths.
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:8765/';
const SHOTDIR = process.argv[3] || '/workspace/shots';
import fs from 'fs'; fs.mkdirSync(SHOTDIR, { recursive: true });
const FX = '/workspace/garmin-insights-site/test/fixtures/';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const scenarios = [
  ['demo', null],
  ['csv', ['/workspace/garmin-insights-site/demo/daily.csv', '/workspace/garmin-insights-site/demo/activities.csv']],
  ['zip', [FX + 'mock-garmin-export.zip']],
  ['fitgpx', [FX + 'test-run.fit', FX + 'test-run.gpx']],
  ['gcsv', [FX + 'Activities.csv']],
  ['empty', [FX + '../make-fixtures.mjs']],
];
let fail = 0;
for (const width of [1440, 390]) for (const [name, files] of scenarios) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  const errors = [], reqs = []; let loaded = false;
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (loaded) reqs.push(r.url()); else if (!r.url().startsWith(BASE)) reqs.push('PRE-LOAD 3rd party: ' + r.url()); });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  loaded = true;
  if (files) { const input = await page.$('#file'); await input.uploadFile(...files); } else await page.click('#demo');
  await page.waitForFunction(() => !document.querySelector('#report').hidden || /could not/i.test(document.querySelector('#status').textContent), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 400));
  const info = await page.evaluate(() => {
    const secs = ['sec-score', 'sec-recovery', 'sec-load', 'sec-running', 'sec-change', 'sec-summary'].map((id) => { const b = document.querySelector(`#${id} .body`); return { id, ok: b && b.textContent.trim().length > 20, missing: (b?.textContent.match(/Not found in your files|Not enough data yet/g) || []).length, pills: [...b.querySelectorAll('.pill')].map((p) => p.closest('.metric')?.querySelector('h3')?.textContent + ':' + p.textContent) }; });
    const overflow = document.documentElement.scrollWidth > window.innerWidth;
    const wide = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 1 && !e.closest('.table-wrap'); }).map((e) => e.tagName + '.' + e.className).slice(0, 5);
    return { secs, overflow, wide, status: document.querySelector('#status').textContent, headline: document.querySelector('.headline')?.textContent, range: document.querySelector('#range').textContent.slice(0, 200) };
  });
  const bad = errors.length || reqs.length || info.overflow || info.wide.length || info.secs.some((s) => !s.ok);
  if (bad) fail++;
  console.log(`\n[${width}] ${name}: ${bad ? 'FAIL' : 'PASS'} | ${info.headline} | ${info.status}`);
  console.log('  range:', info.range);
  for (const s of info.secs) console.log(`  ${s.id}: ok=${s.ok} missing=${s.missing} ${s.pills.join(', ')}`);
  if (errors.length) console.log('  console:', errors);
  if (reqs.length) console.log('  requests after load:', reqs);
  if (info.overflow || info.wide.length) console.log('  overflow:', info.wide);
  if (['demo', 'zip', 'fitgpx'].includes(name)) await page.screenshot({ path: `${SHOTDIR}/${name}-${width}.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
