// Headless smoke test in real Chrome (HTML-in-Canvas needs Chrome 157+).
//
//   npm run smoke                      # uses /usr/bin/google-chrome
//   CHROME_PATH=/path/to/chrome npm run smoke
//
// Checks: every panel's texture uploads, no page errors, a click on a 3D-projected
// Market Watch row selects that symbol, and the BUY button in the 3D order
// ticket sends an order that reaches the blotter. Screenshots go to smoke-out/.

import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const OUT = new URL('../smoke-out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: process.env.HEADFUL ? false : true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1600,900'],
});

const failures = [];
// Headless SwiftShader renders at a few fps, so wait for the camera to settle
// (plus a couple of frames for the hit-test geometry) rather than a fixed delay.
const settle = (page) =>
  page
    .waitForFunction(() => !window.tradingFloor.controls.animating, { timeout: 15000 })
    .then(() => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));

const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures.push(msg);
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // SwiftShader reports GPU stalls when headless Chrome reads pixels back for screenshots.
    if (m.text().includes('GL Driver Message')) return;
    if (m.type() === 'error' || m.type() === 'warn') errors.push(`[console.${m.type()}] ${m.text()}`);
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.tradingFloor, { timeout: 15000 });
  check(await page.evaluate(() => window.tradingFloor.supported), 'HTML-in-Canvas supported');

  // Enter the room without pointer lock (headless): drop the intro.
  await page.evaluate(() => {
    const c = window.tradingFloor.controls;
    c.mode = 'paused';
    c.onChange();
  });

  await page
    .waitForFunction(() => window.tradingFloor.surfaces.surfaces.every((s) => s.hasImage), { timeout: 30000 })
    .catch(() => {});
  const surfaceReport = await page.evaluate(() =>
    window.tradingFloor.surfaces.surfaces.map((s) => ({ id: s.spec.id, uploaded: s.hasImage, uploads: s.uploads, tex: `${s.texWidth}x${s.texHeight}` })),
  );
  console.table(surfaceReport);
  check(surfaceReport.every((s) => s.uploaded), 'every panel uploaded a texture');

  await sleep(2500);
  await page.screenshot({ path: `${OUT}overview.png` });
  const stats = await page.evaluate(() => ({ ...window.tradingFloor.surfaces.stats }));
  console.log('stats', stats);
  check(stats.uploadsPerSec > 0, 'panels keep re-uploading as data ticks');

  // --- Click a Market Watch row through the 3D projection ---------------------
  await page.evaluate(() => window.tradingFloor.focus('market-watch'));
  await settle(page);
  const target = await page.evaluate(() => {
    const feed = window.tradingFloor.feed;
    const sym = [...feed.quotes.keys()].find((s) => s !== feed.selected && document.querySelector(`#panel-market-watch .ag-row[row-id="${s}"]`));
    const cell = document.querySelector(`#panel-market-watch .ag-row[row-id="${sym}"] [col-id="symbol"]`);
    const r = cell.getBoundingClientRect();
    return { sym, x: r.left + r.width / 2, y: r.top + r.height / 2, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[row-id]')?.getAttribute('row-id') };
  });
  console.log('market-watch click target', target);
  await page.mouse.click(target.x, target.y);
  await sleep(400);
  const selected = await page.evaluate(() => window.tradingFloor.feed.selected);
  check(selected === target.sym, `clicking the ${target.sym} row in 3D selects it (selected=${selected})`);
  await page.screenshot({ path: `${OUT}focus-market-watch.png` });

  // --- Type a quantity and press BUY in the 3D order ticket --------------------
  await page.evaluate(() => window.tradingFloor.focus('order-book'));
  await settle(page);
  const center = (sel) =>
    page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);
  const qty = await center('#panel-order-book input[name=qty]');
  await page.mouse.click(qty.x, qty.y);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.type('2500');
  const buy = await center('#panel-order-book button.buy');
  await page.mouse.click(buy.x, buy.y);
  await sleep(1500);
  const mine = await page.evaluate(() => window.tradingFloor.feed.orders.filter((o) => o.trader === 'YOU').map((o) => ({ ...o })));
  check(mine.length === 1 && mine[0].qty === 2500 && mine[0].side === 'BUY', `BUY 2,500 sent from the 3D ticket (${JSON.stringify(mine.map((o) => [o.id, o.side, o.qty, o.status]))})`);
  const inBlotter = await page.evaluate((id) => !!document.querySelector(`#panel-blotter .ag-row[row-id="${id}"]`), mine[0]?.id);
  check(inBlotter, 'the order appears in the blotter grid');
  await page.screenshot({ path: `${OUT}focus-order-book.png` });

  // --- Full ticket: SELL, LMT, 500 lots, limit 2% above mid (so it rests) -----
  await page.evaluate(() => window.tradingFloor.focus('order-ticket'));
  await settle(page);
  const clickSel = async (sel) => {
    const p = await center(sel);
    await page.mouse.click(p.x, p.y);
    await sleep(120);
  };
  await clickSel('#panel-order-ticket .seg-side button[data-value=SELL]');
  await clickSel('#panel-order-ticket .seg button[data-value=LMT]');
  await clickSel('#panel-order-ticket .ot-quick button:nth-child(2)'); // 500
  const limit = await page.evaluate(() => {
    const f = window.tradingFloor.feed;
    const q = f.quotes.get(f.selected);
    return (((q.bid + q.ask) / 2) * 1.02).toFixed(2);
  });
  const priceInput = '#panel-order-ticket input[aria-label=Price]';
  await clickSel(priceInput);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.type(limit);
  await sleep(300);
  await clickSel('#panel-order-ticket .ot-submit');
  await sleep(500);
  const lmt = await page.evaluate(() => window.tradingFloor.feed.orders.filter((o) => o.trader === 'YOU' && o.type === 'LMT').map((o) => ({ ...o })));
  check(lmt.length === 1 && lmt[0].side === 'SELL' && lmt[0].qty === 500 && lmt[0].limit === Number(limit), `SELL 500 LMT ${limit} sent from the full ticket (${JSON.stringify(lmt.map((o) => [o.id, o.side, o.qty, o.type, o.limit, o.status]))})`);
  await page.screenshot({ path: `${OUT}focus-order-ticket.png` });

  // --- Cancel it from My Orders ----------------------------------------------
  await page.evaluate(() => window.tradingFloor.focus('working-orders'));
  await settle(page);
  await sleep(600);
  const cancelSel = `#panel-working-orders .ag-row[row-id="${lmt[0]?.id}"] .row-btn.cancel`;
  if (await page.$(cancelSel)) {
    await clickSel(cancelSel);
    await sleep(500);
    const status = await page.evaluate((id) => window.tradingFloor.feed.orders.find((o) => o.id === id)?.status, lmt[0].id);
    check(status === 'CANCELLED', `Cancel button in My Orders cancels ${lmt[0].id} (status=${status})`);
  } else {
    check(false, `no Cancel button for ${lmt[0]?.id} (order already done?)`);
  }
  await page.screenshot({ path: `${OUT}focus-working-orders.png` });

  // --- Kill switch -----------------------------------------------------------
  await page.evaluate(() => window.tradingFloor.focus('risk-controls'));
  await settle(page);
  await clickSel('#panel-risk-controls .kill-switch');
  await sleep(1500);
  const killed = await page.evaluate(() => {
    const f = window.tradingFloor.feed;
    return { killed: f.risk.killed, active: f.orders.filter((o) => o.status === 'WORKING' || o.status === 'PARTIAL').length };
  });
  check(killed.killed && killed.active === 0, `kill switch halts the desk (${JSON.stringify(killed)})`);
  await page.evaluate(() => window.tradingFloor.unfocus());
  await settle(page);
  await sleep(800);
  await page.screenshot({ path: `${OUT}kill-switch-alarm.png` });
  await page.evaluate(() => window.tradingFloor.focus('risk-controls'));
  await settle(page);
  await clickSel('#panel-risk-controls .kill-switch');
  check(await page.evaluate(() => !window.tradingFloor.feed.risk.killed), 'kill switch resets');

  // --- Views of the room -----------------------------------------------------
  const views = {
    'view-entrance': [[0, 1.7, 9.5], [0, 3.2, -5]],
    'view-south-wall': [[0, 2.2, 1], [0, 4.2, 14]],
    'view-left-pod': [[-3.5, 1.9, 4.5], [-9, 1.3, 2.8]],
    'view-east-wall': [[2, 2.2, -1], [16, 3.4, -2]],
    'view-west-wall': [[-2, 2.2, -1], [-16, 3.4, -2]],
  };
  await page.evaluate(() => window.tradingFloor.unfocus());
  await settle(page);
  for (const [name, [from, to]] of Object.entries(views)) {
    await page.evaluate((f, t) => window.tradingFloor.view(f, t), from, to);
    await sleep(2500);
    await page.screenshot({ path: `${OUT}${name}.png` });
  }

  await page.evaluate(() => window.tradingFloor.focus('blotter'));
  await settle(page);
  await page.screenshot({ path: `${OUT}focus-blotter.png` });

  // Oblique view: free cursor, standing to the side; hit testing still follows the projection.
  await page.evaluate(() => window.tradingFloor.unfocus());
  await settle(page);
  await page.screenshot({ path: `${OUT}overview-after.png` });

  check(errors.length === 0, `no page errors or warnings${errors.length ? `:\n  ${errors.slice(0, 8).join('\n  ')}` : ''}`);
} finally {
  await browser.close();
  await server.close();
}

console.log(`\nScreenshots in ${OUT}`);
if (failures.length) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
