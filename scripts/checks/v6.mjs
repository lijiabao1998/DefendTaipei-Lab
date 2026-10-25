import { launch, shot as shotPath, pickRole, preview } from '../lib.mjs';
const srv = await preview(4181);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => {
  if (m.text().startsWith('facade')) console.log(m.text());
});
const t0 = Date.now();
await p.goto(srv.url);
await p.waitForFunction(() => window.__game, null, { timeout: 90000 });
await pickRole(p, { g: 'f' });
await p.waitForTimeout(800);
console.log('load ms', Date.now() - t0);
await p.evaluate(() => {
  const g = window.__game;
  g.sols.length = 0;
  g.setTime(10 * 60);
});
const sp = await p.evaluate(() => window.__game.facade().spots);
console.log(JSON.stringify(sp), await p.evaluate(() => document.getElementById('objective').textContent));
const shot = async (n, w = 3000) => {
  await p.waitForTimeout(w);
  await p.screenshot({ path: shotPath(`v6-${n}.png`) });
};
const tp = async xz => p.evaluate(([x, z]) => window.__game.tp(x, z), xz);
for (let i = 0; i < 4; i++) await p.mouse.wheel(0, -100);
if (sp.green) {
  await tp(sp.green);
  await shot('green-lane');
}
if (sp.sw) {
  await tp(sp.sw);
  await shot('sidewalk');
}
if (sp.red) {
  await tp(sp.red);
  await shot('redline');
}
const s = await p.evaluate(() => window.__game.start());
await tp(s);
await shot('street');
for (let i = 0; i < 10; i++) await p.mouse.wheel(0, 100);
await shot('rooftops');
for (let i = 0; i < 16; i++) await p.mouse.wheel(0, -100);
await tp(s);
await shot('windows');
await p.evaluate(() => window.__game.setTime(21 * 60));
await shot('windows-night', 15000);
console.log('errors', errs.length, errs.slice(0, 3));
await b.close();
srv.stop();
process.exit(errs.length ? 1 : 0);
