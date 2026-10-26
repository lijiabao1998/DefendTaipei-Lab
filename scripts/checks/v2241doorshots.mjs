// v22.4.1 door close-ups: closed home door (frame, sill, ring, [E] 開門 prompt) and the same door swung open.
// argv: url outDir
import { launch, pickRole } from '../lib.mjs';
const [url, out = '/workspace/v2241'] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'f', role: 'office', skipIntro: true });
await p.waitForFunction(() => window.__game?.started?.(), null, { timeout: 900000, polling: 1000 });
await p.waitForFunction(() => !document.getElementById('wake'), null, { timeout: 120000, polling: 500 });
await p.evaluate(() => window.__game.setTime(600));
const st = await p.evaluate(() => window.__game.autoState());
// stand just inside the door: walk the escape path until ~1.2 m from the door
await p.evaluate(() => window.__game.autoWalk());
for (let i = 0; i < 400; i++) {
  await p.waitForTimeout(300);
  const s = await p.evaluate(() => window.__game.autoState());
  if (s.cd || Math.hypot(s.p[0] - st.door[0], s.p[1] - st.door[1]) < 1.3) break;
}
await p.evaluate(() => window.__game.autoStop());
await p.waitForTimeout(800);
const pr1 = await p.evaluate(() => document.getElementById('prompt').textContent);
await p.screenshot({ path: `${out}/door-closed.png` });
await p.keyboard.press('KeyE');
await p.waitForTimeout(1500);
const pr2 = await p.evaluate(() => document.getElementById('prompt').textContent);
await p.screenshot({ path: `${out}/door-open.png` });
console.log(JSON.stringify({ pr1, pr2, errs }));
await b.close();
