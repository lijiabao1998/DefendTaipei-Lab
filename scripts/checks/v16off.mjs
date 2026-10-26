import { launch, shot, gameUrl } from '../lib.mjs';
const url = gameUrl(process.argv[2]);
const b = await launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
p.on('requestfailed', r => console.log('RF', r.url(), r.failure()?.errorText));
p.on('request', r => r.serviceWorker || 0);
await p.goto(url);
await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
await p.evaluate(() => window.__newGame());
await p.waitForSelector('.ch', { state: 'visible', timeout: 300000 });
await p
  .waitForFunction('navigator.serviceWorker.controller', null, { timeout: 60000 })
  .catch(() => console.log('no controller'));
console.log(
  'caches',
  await p.evaluate('caches.keys().then(async k=>[k, (await (await caches.open(k[0])).keys()).length])'),
);
await ctx.setOffline(true);
await p.reload({ timeout: 60000 }).catch(e => console.log('reload err', String(e).slice(0, 150)));
const ok = await p
  .waitForSelector('.ch', { state: 'visible', timeout: 90000 })
  .then(() => 'offline OK')
  .catch(e => 'FAIL ' + String(e).slice(0, 100));
await p.screenshot({ path: shot('v16-offline.png') });
console.log(ok);
await b.close();
