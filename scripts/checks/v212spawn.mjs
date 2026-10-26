// v21.2 spawn reachability: every role × gender, prologue (bed wake) and skip path. From the spawn point a 0.5 m
// grid BFS that honours walls/props must reach a street within 70 m. Reports fallback nudges. argv: url
import { launch, pickRole } from '../lib.mjs';
const [url] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'm', role: 'courier', skipIntro: true });
await p.waitForFunction(() => window.__game && window.__game.started && window.__game.started(), null, {
  timeout: 900000,
  polling: 2000,
});
const res = await p.evaluate(() => {
  const g = window.__game,
    out = [];
  for (const r of ['courier', 'nurse', 'student', 'office', 'tech'])
    for (const gd of ['m', 'f'])
      for (const skip of [false, true]) {
        const e = g.spawnTest(r, gd, skip);
        out.push({ r, gd, skip, ok: e.ok, dist: e.dist, nudges: e.nudges });
      }
  return out;
});
for (const r of res)
  console.log(r.ok ? 'ok  ' : 'FAIL', r.r, r.gd, r.skip ? 'skip' : 'prologue', 'road at', r.dist, 'm');
console.log('fallback nudges:', res[res.length - 1].nudges, 'errors:', errs.length, errs.slice(0, 3));
await b.close();
if (errs.length || res.some(r => !r.ok)) process.exit(1);
