// v22.8 recorded gunshots: the 12 CC0 samples load + decode on the SFX context after the first touch, every gun
// class plays a recording (close / distant / indoor), anti-armour stays procedural, and when the files are blocked
// the procedural fallback still plays. argv: url
import { launch } from '../lib.mjs';
const [url] = process.argv.slice(2);
const b = await launch();
const res = {};
for (const block of [false, true]) {
  const ctx = await b.newContext({
    viewport: { width: 412, height: 915 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  if (block) await p.route('**/sfx/gun/**', r => r.abort());
  await p.goto(url);
  await p.waitForFunction(() => window.__game?.audioFx, null, { timeout: 600000, polling: 500 });
  await p.touchscreen.tap(200, 880); // first touch unlocks audio + starts loading
  await p
    .waitForFunction(() => /ok|fail/.test(window.__game.audioFx.gunSamples().state), null, { timeout: 30000 })
    .catch(() => {});
  const r = await p.evaluate(async () => {
    const A = window.__game.audioFx;
    for (const k of ['pistol', 'rifle', 'sniper', 'mg', 'shotgun', 'at']) {
      A.gunshot(k, 0, false);
      A.gunshot(k, 120, false);
      A.gunshot(k, 3, true);
    }
    await new Promise(r => setTimeout(r, 500));
    const s = window.__game.audio();
    return {
      samples: A.gunSamples(),
      ctx: s.sfx,
      stats: Object.fromEntries(Object.entries(s).filter(([k]) => /^gun/.test(k))),
    };
  });
  r.errs = errs;
  res[block ? 'blocked' : 'normal'] = r;
  await ctx.close();
}
const n = res.normal,
  bl = res.blocked;
const ok =
  n.samples.state === 'ok' &&
  n.samples.n === 12 &&
  ['pistol', 'rifle', 'sniper', 'mg', 'shotgun'].every(k => n.stats['gunrec_' + k] >= 2) &&
  !n.stats.gunrec_at &&
  bl.samples.state === 'fail' &&
  !Object.keys(bl.stats).some(k => k.startsWith('gunrec_')) &&
  bl.stats.gun_rifle === 3 &&
  !n.errs.length &&
  !bl.errs.length;
console.log(JSON.stringify(res, null, 1));
console.log(ok ? 'PASS' : 'FAIL');
await b.close();
