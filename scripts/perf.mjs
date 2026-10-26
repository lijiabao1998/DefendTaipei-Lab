import { launch, gameUrl, devices } from './lib.mjs';
const [url, tag] = [gameUrl(process.argv[2]), process.argv[3] || 'x'];
const out = {};
const b = await launch();
for (const [name, dev, thr] of [
  ['desktop', { viewport: { width: 1366, height: 820 } }, null],
  [
    'mobile-throttled',
    devices['iPhone 13'],
    { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 },
  ],
]) {
  for (const warm of [0, 1]) {
    const ctx = await b.newContext(dev);
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    if (thr) {
      await cdp.send('Network.emulateNetworkConditions', { offline: false, ...thr });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    let bytes = 0;
    cdp.on('Network.loadingFinished', e => (bytes += e.encodedDataLength));
    if (warm) {
      await p.goto(url);
      await p.waitForSelector('#btns button, .ch', { timeout: 600000 });
      await p.waitForTimeout(3000);
      bytes = 0;
    }
    const t0 = Date.now();
    await p.goto(url + (warm ? '' : ''));
    const tFirst = await p.evaluate(() =>
      performance.getEntriesByType('paint').map(e => [e.name, Math.round(e.startTime)]),
    );
    await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
    await p.evaluate(() => window.__newGame());
    await p.waitForSelector('.ch', { state: 'visible', timeout: 600000 });
    const tti = Date.now() - t0;
    out[`${name}${warm ? '-repeat' : ''}`] = { tti_ms: tti, kB: Math.round(bytes / 1024), paint: tFirst };
    await ctx.close();
  }
}
console.log(JSON.stringify(out));
await b.close();
