import { launch, shot, gameUrl, pickRole } from '../lib.mjs';
const b = await launch();
const errs = [];
for (const mode of ['heli', 'boat']) {
  const ctx = await b.newContext();
  const p = await ctx.newPage({ viewport: { width: 1024, height: 576 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(gameUrl());
  await p.waitForFunction(() => window.__game, null, { timeout: 120000 });
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForFunction(() => window.__game, null, { timeout: 120000 });
  await pickRole(p, { g: 'f' });
  await p.waitForTimeout(2000);
  await p.evaluate(m => {
    window.__cineFast = 1;
    window.__game.doEvac(m);
  }, mode);
  const times =
    mode === 'heli'
      ? [
          [3, 'pickup'],
          [8, 'downwash'],
          [13, 'skyline'],
          [19, 'group'],
          [25, 'approach'],
          [30.5, 'landing'],
        ]
      : [
          [3, 'river'],
          [10, 'aerial'],
          [17, 'estuary'],
          [24, 'dawn'],
          [29.5, 'alongside'],
        ];
  for (const [t, n] of times) {
    await p.waitForFunction(tt => (window.__cineT?.() || 0) >= tt, t, { timeout: 300000 });
    await p.screenshot({ path: shot(`v9-carrier-${mode}-${n}.png`) });
    console.log(mode, n, 'ok');
  }
  await p.waitForSelector('#evacend', { timeout: 300000 });
  await p.waitForTimeout(2200);
  await p.screenshot({ path: shot(`v9-carrier-${mode}-endcard.png`) });
  await ctx.close();
}
console.log('errors', errs.length, errs.slice(0, 4));
await b.close();
