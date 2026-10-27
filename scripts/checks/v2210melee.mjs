// v22.10 in-game melee: knife swing next to a soldier → delayed contact hit, hit-stop, knockback, trail.
// argv: url outDir
import { launch } from '../lib.mjs';
import fs from 'node:fs';
const [url = 'http://localhost:4173/DefendTaipei-Lab/', out = 'shots/v2210'] = process.argv.slice(2);
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
const r0 = await p.evaluate(() => {
  const G = window.__game,
    M = G.melee(),
    pl = G.player;
  const s = M.sols.find(s => s.state !== 'dead');
  pl.inv.knife = 1;
  pl.equip = 'knife';
  s.pos.set(pl.pos.x + 0.9, 0, pl.pos.z);
  s.state = 'patrol';
  s.alert = 0;
  window.__s = s;
  return { hp: s.hp, x: s.pos.x };
});
// aim at the soldier: synthetic mouse over him is camera-dependent, so call attack after pointing aimPt via mouse centre-right
await p.mouse.move(700, 360);
await p.evaluate(() => {
  window.__game.player.cd = 0;
  window.__game.melee().attack();
});
const frames = [];
for (let i = 0; i < 6; i++) {
  await p.waitForTimeout(60);
  await p.screenshot({ path: `${out}/swing-${i}.png` });
  frames.push(
    await p.evaluate(() => ({
      hp: window.__s.hp,
      x: window.__s.pos.x,
      trail: window.__game.melee().trail.mesh.visible,
    })),
  );
}
await p.waitForTimeout(1500);
const r1 = await p.evaluate(() => ({ hp: window.__s.hp, x: window.__s.pos.x }));
console.log(JSON.stringify({ r0, frames, r1, errs }));
await b.close();
