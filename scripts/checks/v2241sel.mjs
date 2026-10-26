// v22.4.1 role select: male and female pages use the same card grid (same card size/position, portrait size)
// at desktop and 390×844 portrait. argv: url outDir
import { launch } from '../lib.mjs';
const [url, out] = process.argv.slice(2);
const b = await launch();
const res = {};
for (const [w, h, mob] of [
  [1280, 800, false],
  [390, 844, true],
]) {
  const ctx = await b.newContext({
    viewport: { width: w, height: h },
    ...(mob
      ? {
          hasTouch: true,
          isMobile: true,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
        }
      : {}),
  });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
  await p.evaluate(() => window.__newGame());
  const boxes = {};
  for (const g of ['m', 'f']) {
    await p.evaluate(g => window.__selG(g), g);
    await p.waitForTimeout(800);
    boxes[g] = await p.evaluate(() =>
      [...document.querySelectorAll('.ch')].map(c => {
        const r = c.getBoundingClientRect(),
          i = c.querySelector('.pv').getBoundingClientRect();
        return [r.left, r.top, r.width, r.height, i.width, i.height].map(Math.round);
      }),
    );
    await p.evaluate(() => document.getElementById('charsel').scrollIntoView({ block: 'start' }));
    await p.screenshot({ path: `${out}/select-${g}-${w}x${h}.png` });
  }
  const same = boxes.m.every((x, i) => x.every((v, k) => Math.abs(v - boxes.f[i][k]) <= 1));
  const rowH = g => new Set(boxes[g].map(x => x[3])).size === 1 || mob;
  res[`${w}x${h}`] = { same, equalHeights: rowH('m') && rowH('f'), m: boxes.m, f: boxes.f };
  await ctx.close();
}
console.log(JSON.stringify(res));
await b.close();
