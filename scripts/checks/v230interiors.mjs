// v23.0 lived-in interiors: plans for every enterable building, lazy meshes, searchable furniture, screenshots
import { launch } from '../lib.mjs';
import fs from 'node:fs';
const [url = 'http://localhost:4173/DefendTaipei-Lab/', out = 'shots/v230'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await p.waitForFunction(() => window.__newGame, null, { timeout: 180000 });
await p.evaluate(() => window.__newGame());
await p.waitForSelector('.ch', { state: 'visible', timeout: 180000 });
await p.evaluate(() => {
  const s = document.getElementById('skipintro');
  if (s) s.checked = true;
});
await p.click('.ch[data-r="nurse"]');
await p.evaluate(() => document.getElementById('startgo')?.click());
await p.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
  timeout: 180000,
});
const R = {};
await p.evaluate(() => window.__game.endPrologue?.());
await p.waitForTimeout(1500);
await p.waitForTimeout(1500);
const all = await p.evaluate(() => window.__game.clutter());
R.stats = all.stats;
R.uses = all.plans.reduce((m, q) => ((m[q[1]] = (m[q[1]] || 0) + 1), m), {});
const home = await p.evaluate(() => window.__game.autoState().home);
const pick = {};
for (const q of all.plans.sort(
  (a, b) => Math.hypot(a[3][0] - home[0], a[3][1] - home[1]) - Math.hypot(b[3][0] - home[0], b[3][1] - home[1]),
))
  if (!pick[q[1]]) pick[q[1]] = q;
const tall = all.plans.find(q => q[4] > 6 && q[1] === 'home');
R.shots = [];
for (const [k, q] of [...Object.entries(pick), ['stair', tall]]) {
  if (!q) continue;
  const [id, use, c, dp] = q;
  // step 2.2 m in from the door toward the centre
  const dx = c[0] - dp[0],
    dz = c[1] - dp[1],
    L = Math.hypot(dx, dz) || 1;
  await p.evaluate(([x, z]) => window.__game.tp(x, z), [dp[0] + (dx / L) * 2.2, dp[1] + (dz / L) * 2.2]);
  await p.waitForFunction(id => window.__game.clutter().live.some(l => l[0] === id), id, { timeout: 120000 });
  await p.waitForTimeout(2500);
  const conts = await p.evaluate(id => window.__game.clutter().conts.filter(c => c[0].startsWith('f' + id + '_')), id);
  await p.screenshot({ path: `${out}/${k}.png` });
  R.shots.push({ k, id, use, conts });
}
R.after = await p.evaluate(() => window.__game.clutter().stats);
R.errs = errs;
console.log(JSON.stringify(R, null, 1));
await b.close();
