import { launch, shot, gameUrl, pickRole, devices } from '../lib.mjs';
const url = gameUrl(process.argv[2]);
const errs = [];
const b = await launch();
const ctx = await b.newContext(devices['iPhone 13']);
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await p.waitForTimeout(1500);
await p.screenshot({ path: shot('v16-loading.png') });
await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
await p.evaluate(() => window.__newGame());
await p.waitForSelector('.ch', { state: 'visible', timeout: 600000 });
await p.screenshot({ path: shot('v16-ready.png') });
const r0 = await p.evaluate('window.__roofLeft()');
await pickRole(p, { g: 'm' });
await p.waitForTimeout(15000);
const r1 = await p.evaluate('window.__roofLeft()');
const sw = await p.evaluate(
  'navigator.serviceWorker.getRegistration().then(r=>!!(r&&(r.active||r.installing||r.waiting)))',
);
const cache = await p.evaluate('caches.keys()');
await p.screenshot({ path: shot('v16-ingame.png') });
await p.tap('#mapbtn', { noWaitAfter: true });
await p.waitForTimeout(1500);
await p.screenshot({ path: shot('v16-map.png') });
await p.evaluate(`window.__game.player.inv.fpv=1`);
// offline reload
await ctx.setOffline(true);
await p.reload();
await p
  .waitForSelector('.ch', { state: 'visible', timeout: 600000 })
  .then(() => console.log('offline OK'))
  .catch(e => console.log('offline FAIL', String(e).slice(0, 100)));
await p.screenshot({ path: shot('v16-offline.png') });
console.log(JSON.stringify({ r0, r1, sw, cache, errs }));
await b.close();
