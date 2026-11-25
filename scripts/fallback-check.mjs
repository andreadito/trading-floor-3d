// Checks the device gate on the production build (run `npm run build` first; `npm run check:fallback` does both):
//   desktop Chrome          -> the 3D app boots
//   iPhone (touch only)     -> fallback page, app chunk never downloaded
//   no HTML-in-Canvas API   -> fallback page (Safari / Firefox / old Chrome), app chunk never downloaded

import puppeteer, { KnownDevices } from 'puppeteer-core';
import { preview } from 'vite';

const server = await preview({ preview: { port: 5194 }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const failures = [];

async function visit(setup) {
  const page = await browser.newPage();
  const requested = [];
  const errors = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  page.on('pageerror', (e) => errors.push(String(e)));
  await setup(page);
  await page.goto(base, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  const state = await page.evaluate(() => ({ fallback: !!document.querySelector('.fb'), app: !!window.tradingFloor, title: document.querySelector('.fb h1')?.textContent ?? null, body: document.querySelector('.fb .lede')?.textContent ?? '' }));
  state.appChunk = requested.some((p) => /\/assets\/app-[^/]*\.js$/.test(p));
  state.errors = errors;
  await page.close();
  return state;
}
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures.push(msg);
};

try {
  const desktop = await visit((p) => p.setViewport({ width: 1280, height: 800 }));
  check(desktop.app && !desktop.fallback && !desktop.errors.length, `desktop Chrome boots the 3D app ${JSON.stringify(desktop)}`);

  const phone = await visit((p) => p.emulate(KnownDevices['iPhone 15 Pro']));
  check(phone.fallback && !phone.app && !phone.appChunk && !phone.errors.length, `iPhone gets the fallback without downloading the app ${JSON.stringify(phone)}`);

  const noApi = await visit(async (p) => {
    await p.setViewport({ width: 1280, height: 800 });
    await p.evaluateOnNewDocument(() => delete WebGL2RenderingContext.prototype.texElementSubImage2D);
  });
  check(noApi.fallback && noApi.body.includes('Chrome 157') && !noApi.appChunk && !noApi.errors.length, `browser without the API gets the fallback ${JSON.stringify(noApi)}`);
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
if (failures.length) process.exit(1);
