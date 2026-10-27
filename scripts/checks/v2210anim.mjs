// v22.10 animation frames + foot-clip metric from the dev harness (scripts/anim). Needs `npx vite --port 5180`.
// argv: outDir [harnessUrl]
import { launch } from '../lib.mjs';
import fs from 'node:fs';
const [out = 'shots/anim', url = 'http://localhost:5180/scripts/anim/index.html'] =
  process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await launch();
const p = await b.newPage({ viewport: { width: 1200, height: 600 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await p.waitForFunction(() => window.H, null, { timeout: 120000 });
const res = { clip: {} };
for (const [st, sp] of [
  ['walk', 1.4],
  ['run', 4.5],
  ['run', 6.5],
  ['run', 8],
]) {
  await p.evaluate(([st, sp]) => window.H.run(st, sp, 90), [st, sp]);
  res.clip[`${st}${sp}`] = await p.evaluate(([st, sp]) => window.H.run(st, sp, 180), [st, sp]);
  for (let f = 0; f < 6; f++) {
    await p.evaluate(([st, sp]) => (window.H.run(st, sp, 4), window.H.render()), [st, sp]);
    await p.screenshot({ path: `${out}/${st}${sp}-${f}.png` });
  }
}
// melee: knife, 3 swings back to back (variants alternate), standing + while running
for (const [tag, st, sp] of [
  ['stand', 'idle', 0],
  ['run', 'run', 5],
]) {
  await p.evaluate(() => window.H.weapon('knife'));
  await p.evaluate(([st, sp]) => window.H.run(st, sp, 60), [st, sp]);
  for (let s = 0; s < 3; s++) {
    await p.evaluate(() => window.H.melee(0.42));
    for (let f = 0; f < 7; f++) {
      await p.evaluate(([st, sp]) => (window.H.run(st, sp, 4), window.H.render()), [st, sp]);
      await p.screenshot({ path: `${out}/melee-${tag}-s${s}-${f}.png` });
    }
    await p.evaluate(([st, sp]) => window.H.run(st, sp, 6), [st, sp]);
  }
}
// gun recoil
await p.evaluate(() => window.H.weapon('rifle'));
await p.evaluate(() => window.H.run('aim', 0, 40));
await p.evaluate(() => window.H.shoot());
for (let f = 0; f < 5; f++) {
  await p.evaluate(() => (window.H.run('aim', 0, 2), window.H.render()));
  await p.screenshot({ path: `${out}/recoil-${f}.png` });
}
res.errs = errs;
console.log(JSON.stringify(res));
await b.close();
