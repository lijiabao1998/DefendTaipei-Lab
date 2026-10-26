// v22.6 procedural audio: footsteps, gunshot, death, rummage, ambience counters all fire; no page errors.
// argv: url
import { launch, pickRole } from '../lib.mjs';
const [url] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 560, height: 360 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'm', role: 'office', skipIntro: true });
await p.waitForFunction(() => window.__game?.started?.(), null, { timeout: 900000, polling: 1000 });
await p.waitForFunction(() => !document.getElementById('wake'), null, { timeout: 120000, polling: 500 });
await p.mouse.click(280, 180); // a user gesture resumes the contexts
await p.keyboard.press('KeyQ');
// walk out (footsteps on wood/tile then asphalt)
await p.evaluate(() => window.__game.autoWalk());
await p.keyboard.down('ShiftLeft');
for (let i = 0; i < 60; i++) {
  await p.waitForTimeout(500);
  const s = await p.evaluate(() => window.__game.autoState());
  if (s.cd && /開門/.test(s.prompt)) await p.keyboard.press('KeyE');
  if (s.i >= s.n) break;
}
await p.keyboard.up('ShiftLeft');
await p.evaluate(() => {
  const g = window.__game;
  g.addItem('t93', 1);
  g.addItem('a762n', 3);
  g.useItem('t93');
  g.scopeOn(0, 0);
  g.scopeFire();
  g.scopeOff();
  g.simRain(2);
});
await p.waitForTimeout(25000); // ambience events every ~6–18 s
const st = await p.evaluate(() => window.__game.audio());
const R = {
  st,
  steps: Object.keys(st).some(k => k.startsWith('step_')),
  gun: (st.gun_sniper || 0) > 0,
  amb: Object.keys(st).some(k => k.startsWith('amb_')),
  errs,
};
R.pass = R.steps && R.gun && R.amb && !errs.length;
console.log(JSON.stringify(R));
await b.close();
