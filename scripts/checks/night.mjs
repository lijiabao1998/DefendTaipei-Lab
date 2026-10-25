import { launch, shot, pickRole, preview } from '../lib.mjs';
const srv = await preview(4180);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(srv.url);
await p.waitForFunction(() => window.__game, null, { timeout: 90000 });
await pickRole(p, { g: process.env.G || 'f' });
await p.waitForTimeout(800);
await p.evaluate(() => {
  const g = window.__game;
  g.setTime(22 * 60);
  g.sols.length = 0;
});
for (let i = 0; i < 5; i++) await p.mouse.wheel(0, -100);
const sp = await p.evaluate(() => window.__game.alley().spots);
console.log(JSON.stringify(sp));
let n = 1;
for (const k of ['start', 'fire', 'arch', 'shrine']) {
  if (k !== 'start') {
    if (!sp[k]) continue;
    await p.evaluate(([x, z]) => window.__game.tp(x, z), sp[k]);
  }
  await p.waitForTimeout(2500);
  await p.screenshot({ path: shot(`c-night-${k}.png`) });
  n++;
}
console.log('errors', errs.length, errs.slice(0, 3));
await b.close();
srv.stop();
process.exit(errs.length ? 1 : 0);
