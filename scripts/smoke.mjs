import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const local = !process.env.URL;
const srv = local ? spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort'], { stdio: 'ignore' }) : null;
if (local) await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('console', m => {
  if (m.type() === 'error') errs.push(m.text());
});
p.on('pageerror', e => errs.push(String(e)));
await p.goto(process.env.URL || 'http://localhost:4179/DefendTaipei-Lab/');
try {
  await p.waitForFunction(() => window.__game, null, { timeout: 60000 });
} catch (e) {
  console.log('ERRS', errs);
  await p.screenshot({ path: 'shot-fail.png' });
  process.exit(1);
}
await p.screenshot({ path: 'shot-title.png' });
await p.click('.ch[data-g="f"]');
await p.waitForTimeout(1500);
await p.screenshot({ path: 'shot-spawn.png' });
await p.keyboard.down('KeyW');
await p.keyboard.down('ShiftLeft');
await p.waitForTimeout(700);
await p.screenshot({ path: 'shot-run.png' });
await p.keyboard.up('ShiftLeft');
await p.keyboard.up('KeyW');
await p.keyboard.down('KeyW');
await p.waitForTimeout(1200);
await p.keyboard.up('KeyW');
await p.keyboard.press('Tab');
await p.waitForTimeout(400);
await p.screenshot({ path: 'shot-inv.png' });
await p.keyboard.press('Escape');
// visit a detailed store
const st = await p.evaluate(() => {
  const g = window.__game;
  const b = g.blds.find(b => b.detailed === 'store');
  if (!b) return null;
  const d = b.door.p;
  g.tp(d[0] + (b.c[0] - d[0]) * 0.3, d[1] + (b.c[1] - d[1]) * 0.3);
  return b.detailed;
});
await p.waitForTimeout(800);
await p.screenshot({ path: 'shot-store.png' });
await p.keyboard.press('KeyE');
await p.waitForTimeout(400);
await p.screenshot({ path: 'shot-loot.png' });
await p.keyboard.press('Escape');
await p.evaluate(() => window.__game.setTime(22 * 60));
await p.waitForTimeout(1500);
await p.screenshot({ path: 'shot-night.png' });
const info = await p.evaluate(() => {
  const g = window.__game;
  const det = {};
  g.blds.forEach(b => {
    if (b.detailed) det[b.detailed] = (det[b.detailed] || 0) + 1;
  });
  const s = g.sols.find(s => s.state !== 'dead');
  let ok = 0,
    tot = 0;
  for (const t of g.sols.filter(t => t.state !== 'dead' && t.pos.distanceTo(g.player.pos) < 120).slice(0, 10)) {
    tot++;
    const pth = g.nav.find([t.pos.x, t.pos.z], [g.player.pos.x, g.player.pos.z]);
    if (pth) {
      const e = pth[pth.length - 1];
      if (Math.hypot(e[0] - g.player.pos.x, e[1] - g.player.pos.z) < 1.5) ok++;
    }
  }
  const path = [ok, tot];
  const d = g.decay();
  const al = g.alley();
  return {
    alley: al && al.stats,
    poles: d && d.poles,
    acs: d && d.acs,
    cps: d && d.checkpoints.length,
    started: g.started(),
    sols: g.sols.length,
    conts: g.conts.length,
    det,
    vehicles: g.vehicles.list.length,
    paths: path,
    store: !!0,
  };
});
console.log(JSON.stringify(info), st);
console.log('errors:', errs.length, errs.slice(0, 5));
await b.close();
srv?.kill();
process.exit(errs.length ? 1 : 0);
