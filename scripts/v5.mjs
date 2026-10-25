import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv = spawn('npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:4180/DefendTaipei-Lab/');
await p.waitForFunction(() => window.__game, null, { timeout: 90000 });
await p.click('.ch[data-g="' + (process.env.G || 'f') + '"]');
await p.waitForTimeout(800);
await p.evaluate(() => {
  const g = window.__game;
  g.sols.length = 0;
  g.setTime(10 * 60);
});
for (let i = 0; i < 7; i++) await p.mouse.wheel(0, -100);
const info = await p.evaluate(() => {
  const g = window.__game;
  const s = g.start();
  const f = k => {
    const b = g.blds
      .filter(b => b.detailed === k)
      .sort((a, b) => Math.hypot(a.c[0] - s[0], a.c[1] - s[1]) - Math.hypot(b.c[0] - s[0], b.c[1] - s[1]))[0];
    return b && b.door ? [b.c[0] * 0.6 + b.door.p[0] * 0.4, b.c[1] * 0.6 + b.door.p[1] * 0.4] : null;
  };
  return {
    home: [g.player.pos.x, g.player.pos.z],
    grocery: f('grocery'),
    hardware: f('hardware'),
    market: f('market'),
    street: g.alley().spots.fire,
  };
});
console.log(JSON.stringify(info));
const shot = async (n, w = 2500) => {
  await p.waitForTimeout(w);
  await p.screenshot({ path: `c-v5-${n}.png` });
};
await p.evaluate(([x, z]) => window.__game.tp(x + 3, z + 3), info.street);
await shot('street-day');
await p.evaluate(([x, z]) => window.__game.tp(x, z), info.home);
await shot('home');
for (const k of ['grocery', 'hardware', 'market'])
  if (info[k]) {
    await p.evaluate(([x, z]) => window.__game.tp(x, z), info[k]);
    await shot(k);
  }
await p.evaluate(([x, z]) => {
  const g = window.__game;
  g.tp(x + 3, z + 3);
  g.setTime(21 * 60);
}, info.street);
await shot('night-power', 15000);
await p.evaluate(() => window.__game.setTime(2 * 1440 + 22 * 60));
await shot('night-blackout', 15000);
console.log(await p.evaluate(() => JSON.stringify(window.__game.UT)));
await p.evaluate(() => window.__game.setTime(4 * 1440 + 8 * 60));
await shot('water-off', 6000);
console.log('errors', errs.length, errs.slice(0, 3));
await b.close();
srv.kill();
process.exit(errs.length ? 1 : 0);
