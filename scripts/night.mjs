import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv = spawn('npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:4180/DefendTaipei-Lab/'); await p.waitForFunction(() => window.__game, null, { timeout: 90000 });
await p.click('.ch[data-g="' + (process.env.G || 'f') + '"]'); await p.waitForTimeout(800);
await p.evaluate(() => { const g = window.__game; g.setTime(22 * 60); g.sols.length = 0; });
for (let i = 0; i < 5; i++) await p.mouse.wheel(0, -100);
const sp = await p.evaluate(() => window.__game.alley().spots); console.log(JSON.stringify(sp));
let n = 1; for (const k of ['start', 'fire', 'arch', 'shrine']) { if (k !== 'start') { if (!sp[k]) continue; await p.evaluate(([x, z]) => window.__game.tp(x, z), sp[k]); }
  await p.waitForTimeout(2500); await p.screenshot({ path: `c-night-${k}.png` }); n++; }
console.log('errors', errs.length, errs.slice(0, 3)); await b.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
