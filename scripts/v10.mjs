import { chromium, devices } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }); const errs = [];
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:4173/DefendTaipei-Lab/'); await p.waitForFunction(() => window.__game, null, { timeout: 180000 });
await p.waitForTimeout(1500); await p.screenshot({ path: '/workspace/defendtaipei-v10-mobile-title.png' });
await p.tap('.ch[data-g="f"]'); await p.waitForTimeout(4000);
console.log('mobile class', await p.evaluate(`document.body.classList.contains('mobile')`), 'dpr cap', await p.evaluate(`document.querySelector('canvas').width/innerWidth`));
await p.screenshot({ path: '/workspace/defendtaipei-v10-mobile-game.png' });
const j = await p.locator('#joy').boundingBox(); const cx = j.x + j.width / 2, cy = j.y + j.height / 2;
const cdp = await ctx.newCDPSession(p);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const pos = () => p.evaluate(`[window.__game.player.pos.x, window.__game.player.pos.z]`);
for (const [n, dx, dy] of [['half', 0, -27], ['full', 0, -60]]) {
  const a = await pos(); await touch('touchStart', cx, cy); await touch('touchMove', cx + dx / 2, cy + dy / 2); await touch('touchMove', cx + dx, cy + dy);
  const t0 = Date.now(); await p.waitForTimeout(3000); if (n === 'full') await p.screenshot({ path: '/workspace/defendtaipei-v10-mobile-joystick.png' });
  const b2 = await pos(); const dt = (Date.now() - t0) / 1000; await touch('touchEnd'); await p.waitForTimeout(800);
  console.log(n, 'moved', Math.hypot(b2[0] - a[0], b2[1] - a[1]).toFixed(2), 'in', dt.toFixed(1), 's', a, b2);
}
await p.evaluate(() => window.__game.setMin(22 * 60)); await p.waitForTimeout(3000); await p.screenshot({ path: '/workspace/defendtaipei-v10-mobile-night.png' });
const ov = await p.evaluate(`[...document.querySelectorAll('#hud > *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.right>innerWidth+1||r.left<-1)}).map(e=>e.id)`); console.log('overflow', ov);
// desktop sanity
const d = await b.newPage({ viewport: { width: 1280, height: 720 } }); await d.goto('http://localhost:4173/DefendTaipei-Lab/'); await d.waitForFunction(() => window.__game, null, { timeout: 180000 });
console.log('desktop mobile?', await d.evaluate(`document.body.classList.contains('mobile')`), 'joy', await d.evaluate(`getComputedStyle(document.getElementById('joy')).display`));
console.log('errors', errs); await b.close();
