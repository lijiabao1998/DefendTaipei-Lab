// v22.3 北都地下鐵 retail: shops / kiosks / vending machines lit + staffed on day 1 (buy with the wallet),
// dark after the power cut (shutters half down, shelves looted) where machines and lockers can be pried open.
// argv: url outDir
import { launch, pickRole } from '../lib.mjs';
const [url, out] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'f', role: 'nurse', skipIntro: true });
await p.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
  timeout: 900000,
  polling: 2000,
});
const G = s => p.evaluate(`(()=>{const g=window.__game;${s}})()`);
const shot = n => p.screenshot({ path: `${out}/${n}.png`, timeout: 120000 });
const gt = await G(`return g.metro()[0].gates[0]`);
await G(`g.setMin(600);g.tp(${gt.ent[0]},${gt.ent[1]});g.metroUse()`);
const [x0, z0] = [gt.inn[0] + 17, gt.inn[1] + 4];
const at = async (dx, dz, w = 1500) => (await G(`g.tp(${x0 + dx},${z0 + dz})`), await p.waitForTimeout(w));
const R = { shops: await G(`return g.metro()[0].shops.map(s=>s.kind)`) };
for (const [n, dx, dz] of [
  ['day1-convenience', -17.5, 0.2],
  ['day1-pharmacy', 17.5, 0.2],
  ['day1-kiosks', 0, 7.2],
  ['day1-vending', 12, -3.4],
])
  (await at(dx, dz), await shot(n));
// buy at the convenience store counter
await at(-20, -0.9, 500);
R.atCvs = await G(`return g.shopAt()?.name`);
R.cash0 = await G(`return g.surv().cash ?? 1200`);
await G(`g.shopUse(g.shopAt())`);
await p.waitForTimeout(300);
await shot('day1-shop-menu');
await p.click('#shop button[data-k="rice"]');
await p.click('#shop button[data-k=""]');
// buy from a vending machine
await at(10.2, -4.2, 500);
R.atVend = await G(`return g.shopAt()?.name`);
await G(`g.shopUse(g.shopAt())`);
await p.click('#shop button[data-k="tea"]');
await p.click('#shop button[data-k=""]');
R.cash1 = await G(`return g.surv().cash`);
R.inv = await G(`return {rice:g.player.inv.rice||0,tea:g.player.inv.tea||0}`);
// power cut
await G('g.UT.power=false');
for (const [n, dx, dz] of [
  ['blackout-convenience', -17.5, 0.2],
  ['blackout-kiosks', 0, 7.2],
  ['blackout-vending', 12, -3.4],
  ['blackout-platform', 6, 24],
])
  (await at(dx, dz, 2000), await shot(n));
await at(12.6, -4.2, 500);
R.pryTarget = await G(`return g.shopAt()?.name`);
const before = await G(`return JSON.stringify(g.player.inv)`);
await G(`g.shopUse(g.shopAt())`);
await p.waitForTimeout(1200);
await shot('blackout-pried');
R.pried = await G(`return g.surv().pried`);
R.invChanged = before !== (await G(`return JSON.stringify(g.player.inv)`));
R.againNull = await G(`return g.shopAt()?.id ?? null`);
await at(-20, 0.3, 500);
R.cvsShelfLootable = await G(`return !!g.shopAt()`); // shops are no longer "shops" after the cut
console.log(JSON.stringify({ R, errs }));
await b.close();
