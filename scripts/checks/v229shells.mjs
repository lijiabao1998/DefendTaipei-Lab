// v22.9 artillery: realistic radii (6 m lethal core, 18 m wounding with falloff), telegraph circles that match
// them, indoor / cover reduction, pooled blast VFX (particles, debris, ring, scorch, light, shake) and the
// whistle + recorded blast. Saves a frame sequence. argv: url [outDir] [quality low|med|high]
import { launch } from '../lib.mjs';
import fs from 'node:fs';
const [url, out = 'shots/v229', q = 'high'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(q => {
  const s = JSON.parse(localStorage.getItem('dt.settings') || '{}');
  localStorage.setItem('dt.settings', JSON.stringify({ ...s, quality: q }));
}, q);
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
await p.mouse.click(640, 360); // unlock audio
await p.waitForTimeout(2500);
const G = () => window.__game;
// find an open outdoor spot with no cover nearby
const spot = await p.evaluate(() => {
  const g = window.__game,
    P = g.player.pos;
  for (let r = 6; r < 120; r += 4)
    for (let a = 0; a < 6.28; a += 0.4) {
      const x = P.x + Math.cos(a) * r,
        z = P.z + Math.sin(a) * r;
      let ok = true;
      for (let dx = -20; dx <= 20 && ok; dx += 2)
        for (let dz = -20; dz <= 20 && ok; dz += 2) if (g.inBld(x + dx, z + dz)) ok = false;
      if (ok) return [x, z];
    }
  return [P.x + 10, P.z];
});
const r = { spot };
r.curve = await p.evaluate(() => [0, 3, 6, 9, 12, 15, 18, 25].map(d => [d, Math.round(window.__game.shellDmg(d))]));
r.SHELL = await p.evaluate(() => window.__game.SHELL);
// one shell 10 m away, frames through the blast
await p.evaluate(([x, z]) => {
  const g = window.__game;
  g.tp(x, z);
  g.player.hp = 100;
  g.player.bleed = false;
  g.shells.push({ t: 2, p: [x + 10, z], w: g.blastFx.warn(x + 10, z, g.SHELL.core, g.SHELL.wound) });
}, spot);
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/0-warning.png` });
await p.waitForFunction(() => !window.__game.shells.length, null, { timeout: 180000, polling: 30 });
const tms = [0, 60, 150, 300, 500, 800, 1300, 2200, 4000, 7000];
let last = 0;
for (const [i, t] of tms.entries()) {
  await p.waitForTimeout(t - last);
  last = t;
  await p.screenshot({ path: `${out}/${i + 1}-t${t}ms.png` });
  if (i === 2)
    r.live = await p.evaluate(() => ({ ...window.__game.blastFx.stats, shake: window.__game.blastFx.shakeA }));
}
r.scorch = await p.evaluate(() => {
  const f = window.__game.blastFx;
  const s = f.scorch
    .filter(s => s.m.visible)
    .map(s => ({ y: s.m.position.y, o: s.m.material.opacity, sc: s.m.scale.x }));
  return { s, py: window.__game.player.pos.y, deb: f.dv.filter(d => d.on).length };
});
r.hit10m = await p.evaluate(() => ({ dmg: window.__game.lastShellHit(), hp: Math.round(window.__game.player.hp) }));
// indoor: shell 3 m from a player standing inside a building
r.indoor = await p.evaluate(async () => {
  const g = window.__game,
    P = g.player.pos;
  let ins = null;
  for (let rr = 4; rr < 200 && !ins; rr += 3)
    for (let a = 0; a < 6.28; a += 0.3) {
      const x = P.x + Math.cos(a) * rr,
        z = P.z + Math.sin(a) * rr;
      if (g.inBld(x, z)) {
        ins = [x, z];
        break;
      }
    }
  if (!ins) return null;
  g.tp(ins[0], ins[1]);
  g.player.hp = 100;
  g.shells.push({ t: 0.05, p: [ins[0] + 3, ins[1]] });
  await new Promise(r => setTimeout(r, 600));
  return { dmg: g.lastShellHit(), expectedOutdoor: Math.round(g.shellDmg(3)) };
});
r.audio = await p.evaluate(() => {
  const s = window.__game.audio();
  return {
    boom: window.__game.audioFx.boomSamples(),
    ...Object.fromEntries(Object.entries(s).filter(([k]) => /^shell/.test(k))),
  };
});
r.errs = errs;
console.log(JSON.stringify(r, null, 1));
const ok =
  r.SHELL.core <= 8 &&
  r.SHELL.wound <= 20 &&
  r.curve.find(c => c[0] === 25)[1] === 0 &&
  r.hit10m.dmg > 5 &&
  r.hit10m.dmg < 35 &&
  r.indoor &&
  r.indoor.dmg < r.indoor.expectedOutdoor * 0.3 &&
  r.live.blasts >= 1 &&
  r.live.peakParticles > 50 &&
  r.scorch.s.length >= 1 &&
  r.audio.shell_whistle >= 1 &&
  r.audio.shell_boom >= 2 &&
  !errs.length;
console.log(ok ? 'PASS' : 'FAIL');
await b.close();
