// v22.9.1 rooftops: screenshots of the same spots (core blocks + streamed district tiles) and counts of dressed
// roofs. argv: url outDir
import { launch } from '../lib.mjs';
import fs from 'node:fs';
const [url, out = 'shots/roofs'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
await p.evaluate(() => window.__newGame());
await p.waitForSelector('.ch', { state: 'visible', timeout: 600000 });
await p.evaluate(() => {
  const box = document.getElementById('skipintro');
  box.checked = true;
  box.dispatchEvent(new Event('change'));
  document.querySelector('.ch[data-r="nurse"]').click();
});
await p.evaluate(() => document.getElementById('startgo')?.click());
await p.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
  timeout: 900000,
  polling: 2000,
});
const P0 = await p.evaluate(() => [window.__game.player.pos.x, window.__game.player.pos.z]);
const spots = [
  [0, 0],
  [60, -40],
  [-160, 120],
  [260, 0],
  [0, -300],
  [-320, -200],
];
for (const [i, [dx, dz]] of spots.entries()) {
  await p.evaluate(([x, z]) => window.__game.tp(x, z), [P0[0] + dx, P0[1] + dz]);
  await p.waitForTimeout(9000);
  await p.screenshot({ path: `${out}/spot${i}.png` });
}
console.log(JSON.stringify({ errs, stats: await p.evaluate(() => window.__game.roofStats) }));
await b.close();
