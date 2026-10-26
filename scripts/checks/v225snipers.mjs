// v22.5 snipers: deterministic posts, laser lock + HUD warning by day, none at night, scoped kill with drop,
// rooftop climb, the moral moment. argv: url outDir
import { launch, pickRole } from '../lib.mjs';
const [url, out = '/workspace/v225'] = process.argv.slice(2);
const b = await launch();
const R = {};
const errs = [];
async function open(w = 1100, h = 700) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url);
  await pickRole(p, { g: 'm', role: 'office', skipIntro: true });
  await p.waitForFunction(() => window.__game?.started?.(), null, { timeout: 900000, polling: 1000 });
  await p.waitForFunction(() => !document.getElementById('wake'), null, { timeout: 120000, polling: 500 });
  return p;
}
const heal = p => p.evaluate(() => window.__game.player && (window.__game.player.hp = 100));
const p = await open();
const posts = await p.evaluate(() => window.__game.snp());
R.posts = posts.map(s => [s.id, s.name, s.p.map(v => +v.toFixed(1)), s.y]);
// lock by day at the first junction
await p.evaluate(() => window.__game.setTime(1440 + 600));
const s0 = posts[0];
await p.evaluate(([x, z]) => window.__game.tp(x, z), s0.j);
let lock = false;
for (let i = 0; i < 20 && !lock; i++) {
  await p.waitForTimeout(250);
  lock = await p.evaluate(() => window.__game.snpLock());
}
R.dayLock = lock;
R.warnShown = await p.evaluate(() => getComputedStyle(document.getElementById('snpwarn')).display !== 'none');
await p.screenshot({ path: `${out}/targeted.png` });
await heal(p);
// night: no lock
await p.evaluate(() => window.__game.setTime(1440 + 23 * 60));
await p.waitForTimeout(2500);
R.nightLock = await p.evaluate(() => window.__game.snpLock());
await p.screenshot({ path: `${out}/night.png` });
// scoped shot with drop compensation (set back to day; the sniper sees you, be quick)
await p.evaluate(() => {
  const g = window.__game;
  g.addItem('t93', 1);
  g.addItem('a762n', 10);
  g.useItem('t93');
  g.setTime(1440 + 600);
});
await p.evaluate(s => {
  // back off to ~30 m from the post along the street (try a few bearings for open ground)
  const g = window.__game;
  for (let a = 0; a < 6.28; a += 0.3) {
    const x = s.p[0] + Math.sin(a) * 30,
      z = s.p[1] + Math.cos(a) * 30;
    g.tp(x, z);
    if (!g.inBld(x, z) && g.snpLos(0, x, z)) break;
  }
}, s0);
const aim = await p.evaluate(s => {
  const g = window.__game;
  const P = g.player.pos;
  const dx = s.p[0] - P.x,
    dz = s.p[1] - P.z,
    d = Math.hypot(dx, dz);
  const dy = s.y + 1.62 - 1.55;
  const t = d / 300;
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy + 0.5 * 9.8 * t * t, d), d };
}, s0);
await p.evaluate(a => window.__game.scopeOn(a.yaw, a.pitch), aim);
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/scope.png` });
await p.evaluate(() => window.__game.scopeFire());
await p.waitForTimeout(500);
R.scopeDist = +aim.d.toFixed(1);
R.killedByScope = (await p.evaluate(() => window.__game.snp()))[0].dead;
await p.evaluate(() => window.__game.scopeOff());
await p.screenshot({ path: `${out}/cleared.png` });
await heal(p);
// rooftop climb at the next post
const s1 = posts.find(s => s.door && s.id !== s0.id);
if (s1) {
  await p.evaluate(([x, z]) => window.__game.tp(x, z), s1.door);
  await p.waitForTimeout(600);
  R.roofPrompt = await p.evaluate(() => document.getElementById('prompt').textContent);
  await p.evaluate(() => window.__game.roofGo());
  await p.waitForTimeout(1200);
  R.roofH = await p.evaluate(() => window.__game.roof());
  await p.screenshot({ path: `${out}/rooftop.png` });
  await p.evaluate(() => window.__game.roofGo());
}
// moral moment: hold the scope a while by day 2
await heal(p);
await p.evaluate(() => {
  const g = window.__game;
  delete g.surv().moral; // the moment may already have fired right after the first kill (zone cleared)
  const h = g.surv().home;
  out: for (let r = 4; r < 60; r += 2)
    for (let a = 0; a < 6.28; a += 0.4) {
      const x = h[0] + Math.sin(a) * r,
        z = h[1] + Math.cos(a) * r;
      if (!g.inBld(x, z) && !g.inZone(x, z)) {
        g.tp(x, z);
        break out;
      }
    }
  g.setTime(1440 + 13 * 60);
});
await p.evaluate(() => window.__game.scopeOn());
for (let i = 0; i < 16; i++) {
  await p.waitForTimeout(500);
  if (await p.evaluate(() => window.__game.moral())) break;
}
R.moralPending = await p.evaluate(() => window.__game.moral());
R.scopeWasOn = await p.evaluate(() => getComputedStyle(document.getElementById('scope')).display);
await p.waitForTimeout(100);
await p.screenshot({ path: `${out}/moral.png` });
await p.evaluate(() => window.__game.scopeOff());
R.moral = await p.evaluate(() => window.__game.moral());
// determinism: a second load finds the same posts
const p2 = await open(560, 360);
R.samePosts =
  JSON.stringify((await p2.evaluate(() => window.__game.snp())).map(s => s.p)) === JSON.stringify(posts.map(s => s.p));
R.errs = errs;
R.pass =
  posts.length >= 2 &&
  R.dayLock &&
  R.warnShown &&
  !R.nightLock &&
  R.killedByScope &&
  R.roofH > 0 &&
  R.moral === 'spared' &&
  R.samePosts &&
  !errs.length;
console.log(JSON.stringify(R));
await b.close();
