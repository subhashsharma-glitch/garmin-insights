import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.goto(process.argv[2], { waitUntil: 'networkidle0' });
const files = process.argv.slice(3);
if (files.length) await (await p.$('#file')).uploadFile(...files); else await p.click('#demo');
await p.waitForSelector('#report:not([hidden])'); await new Promise(r => setTimeout(r, 300));
console.log(await p.evaluate(() => ['sec-running', 'sec-change', 'sec-summary', 'sec-files'].map((id) => document.querySelector('#' + id).innerText).join('\n-----\n')));
await b.close();
