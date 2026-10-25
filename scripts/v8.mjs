import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
const log = (...a) => console.log(...a);
async function run() {
  const p = await b.newPage({ viewport: { width: 1024, height: 640 } });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:4173/DefendTaipei-Lab/');
  await p.waitForFunction(() => window.__game, null, { timeout: 120000 });
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForFunction(() => window.__game, null, { timeout: 120000 });
  await p.click('.ch[data-g="f"]');
  await p.waitForTimeout(2500);
  return p;
}
const tp = (p, x, z) => p.evaluate(`window.__game.player.pos.set(${x},0,${z})`);
async function cine(p, pre, shots) {
  await p.evaluate('window.__cineFast=1');
  for (const [t, n] of shots) {
    await p.waitForFunction(tt => (window.__cineT?.() || 0) >= tt, t, { timeout: 180000 });
    await p.screenshot({ path: `/workspace/defendtaipei-v8-${pre}-${n}.png` });
  }
  await p.waitForSelector('#evacend', { timeout: 180000 });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `/workspace/defendtaipei-v8-${pre}-endcard.png` });
}
// A: helicopter
let p = await run();
const ev = await p.evaluate('window.__game.evac()');
log('evac', ev);
await p.evaluate(
  `(()=>{const g=window.__game; g.setMin(6*1440+9*60); g.sols.forEach(s=>{s.state='dead';s.mesh.visible=false;s.cone.visible=false});})()`,
);
await tp(p, ev[0] + 10, ev[1] + 5);
await p.waitForTimeout(6000);
log(
  'open',
  await p.evaluate('window.__game.evacOpen()'),
  await p.evaluate(`document.getElementById('objective').textContent`),
);
await p.screenshot({ path: '/workspace/defendtaipei-v8-evac-zone.png' });
await tp(p, ev[0], ev[1]);
await cine(p, 'heli', [
  [1.5, 'pickup'],
  [7, 'strait'],
  [11, 'carrier'],
  [13.6, 'landing'],
]);
await p.click('#evcont');
await p.waitForTimeout(1500);
log(
  'continue started',
  await p.evaluate('window.__game.started()'),
  'evacOpen',
  await p.evaluate('window.__game.evacOpen()'),
);
await p.close();
// B: real informant -> boat
p = await run();
await p.evaluate('window.__game.INF().fake=false');
let ip = await p.evaluate('window.__game.infPos()');
await tp(p, ip[0] + 1.2, ip[1]);
await p.waitForTimeout(2500);
await p.screenshot({ path: '/workspace/defendtaipei-v8-informant.png' });
await p.evaluate('window.__game.npcInteract()');
await p.waitForTimeout(800);
await p.screenshot({ path: '/workspace/defendtaipei-v8-informant-dialog.png' });
log('dlg', await p.evaluate(`document.getElementById('dlg')?.innerText`));
await p.evaluate(`document.getElementById('dlg')?.remove()`);
let rv = await p.evaluate(
  '(()=>{const g=window.__game; const r=g.RV()[g.INF().spot].p; g.setMin(g.INF().rvT+5); g.sols.forEach(s=>{s.state="dead";s.mesh.visible=false;s.cone.visible=false}); return r})()',
);
await tp(p, rv[0], rv[1]);
await cine(p, 'boat', [
  [3, 'river'],
  [9.5, 'estuary'],
  [13, 'carrier'],
]);
await p.close();
// C: fake informant -> trap
p = await run();
await p.evaluate('window.__game.INF().fake=true');
ip = await p.evaluate('window.__game.infPos()');
await tp(p, ip[0] + 1.2, ip[1]);
await p.waitForTimeout(1500);
await p.evaluate('window.__game.npcInteract()');
await p.waitForTimeout(600);
log('fake dlg', await p.evaluate(`document.getElementById('dlg')?.innerText`));
await p.screenshot({ path: '/workspace/defendtaipei-v8-informant-fake.png' });
await p.evaluate(`document.getElementById('dlg')?.remove()`);
const ep = await p.evaluate('window.__game.elderPos()');
await tp(p, ep[0] + 1, ep[1]);
await p.waitForTimeout(800);
await p.evaluate('window.__game.npcInteract()');
log('elder', await p.evaluate(`document.getElementById('dlg')?.innerText`));
await p.evaluate(`document.getElementById('dlg')?.remove()`);
rv = await p.evaluate(
  '(()=>{const g=window.__game; const r=g.RV()[g.INF().spot].p; g.setMin(g.INF().rvT+5); return r})()',
);
await tp(p, rv[0], rv[1]);
await p.waitForTimeout(4000);
await p.screenshot({ path: '/workspace/defendtaipei-v8-trap.png' });
log('trap', JSON.stringify(await p.evaluate('window.__game.INF()')));
await tp(p, rv[0] + 60, rv[1]);
await p.waitForTimeout(3000);
log('after escape', JSON.stringify(await p.evaluate('window.__game.INF()')));
const hp = await p.evaluate('window.__game.infPos()');
await tp(p, hp[0] + 1, hp[1]);
await p.waitForTimeout(1000);
await p.evaluate('window.__game.npcInteract()');
log('caught', await p.evaluate(`document.getElementById('dlg')?.innerText`));
log('errors', errs.length, errs.slice(0, 3));
await b.close();
