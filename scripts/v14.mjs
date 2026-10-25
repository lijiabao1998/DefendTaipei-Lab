import { chromium, devices } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => {
  if (m.type() === 'error') errs.push(m.text());
});
await p.goto('http://localhost:4173/DefendTaipei-Lab/');
await p.waitForFunction(() => window.__game, null, { timeout: 180000 });
await p.click('.ch[data-g="f"]', { noWaitAfter: true, timeout: 120000 });
await p.waitForTimeout(3000);
const st = `(()=>{const f=window.__game.fpv();return {act:f.active,y:+f.pos.y.toFixed(2),v:+f.vel.length().toFixed(1),vz:+f.vel.z.toFixed(1),V:+f.volt.toFixed(2),A:+f.amps.toFixed(1),mah:Math.round(f.mah),soc:+f.soc.toFixed(3),sig:+f.sig.toFixed(2),rssi:Math.round(f.rssi),wash:+f.wash.toFixed(2),ghost:+f.ghost.toFixed(4),warn:f.warn}})()`;
await p.evaluate(`(()=>{const g=window.__game,q=g.roadPt();g.tp(q[0],q[1]);g.launchFPV();window.__why='';})()`);
const RL = `(()=>{const g=window.__game;{const q=g.roadPt();g.tp(q[0],q[1]);g.launchFPV()}const f=g.fpv();const oe=f.onEnd;f.onEnd=w=>{window.__why=w;oe(w)}})()`;
// hover check: hold hover throttle, physics-only steps
await p.evaluate(RL);
console.log(
  'hover',
  await p.evaluate('window.__why'),
  await p.evaluate(
    `(()=>{const g=window.__game,f=g.fpv();f.thr=0.47;for(let i=0;i<60;i++)f.update(0.05);return ${st}})()`,
  ),
);
await p.evaluate(RL);
console.log(
  'punch',
  await p.evaluate('window.__why'),
  await p.evaluate(
    `(()=>{const f=window.__game.fpv();f.keys.KeyW=true;for(let i=0;i<20;i++)f.update(0.05);f.keys.KeyW=false;return ${st}})()`,
  ),
);
await p.waitForTimeout(800);
await p.screenshot({ path: '/workspace/defendtaipei-v14-fpv-punch.png' });
await p.evaluate(RL);
console.log(
  'forward',
  await p.evaluate('window.__why'),
  await p.evaluate(
    `(()=>{const f=window.__game.fpv();f.thr=0.6;for(let i=0;i<14;i++){f.md[1]=-6;f.update(0.05)}for(let i=0;i<20;i++)f.update(0.05);return ${st}})()`,
  ),
);
await p.waitForTimeout(800);
await p.screenshot({ path: '/workspace/defendtaipei-v14-fpv-forward.png' });
// descent into prop wash
await p.evaluate(RL);
console.log(
  'propwash',
  await p.evaluate('window.__why'),
  await p.evaluate(
    `(()=>{const f=window.__game.fpv();f.pos.y=40;f.vel.set(0,-7,0);f.w.set(0,0,0);f.q.setFromEuler(new f.cam.rotation.constructor(0,1,0,'YXZ'));f.thr=0.12;for(let i=0;i<6;i++)f.update(0.05);f.thr=0.6;f.update(0.05);return ${st}})()`,
  ),
);
await p.waitForTimeout(600);
await p.screenshot({ path: '/workspace/defendtaipei-v14-fpv-propwash.png' });
// weak signal / breakup / roll / BW
await p.evaluate(RL);
console.log(
  'weak',
  await p.evaluate('window.__why'),
  await p.evaluate(
    `(()=>{const g=window.__game,f=g.fpv(),P=g.player.pos;f.pos.set(P.x+260,12,P.z+160);f.vel.set(0,0,0);f.w.set(0,0,0);f.thr=0.468;for(let i=0;i<20;i++)f.update(0.05);return ${st}})()`,
  ),
);
await p.waitForTimeout(500);
await p.screenshot({ path: '/workspace/defendtaipei-v14-fpv-weak.png' });
// low battery
await p.evaluate(RL);
console.log(
  'lowbatt',
  await p.evaluate('window.__why'),
  await p.evaluate(
    `(()=>{const g=window.__game,f=g.fpv(),P=g.player.pos;f.pos.set(P.x,30,P.z);f.soc=0.18;f.thr=0.7;f.update(0.05);return ${st}})()`,
  ),
);
await p.waitForTimeout(500);
await p.screenshot({ path: '/workspace/defendtaipei-v14-fpv-lowbatt.png' });
// gentle bump on a roof, then kill armour from above
console.log(
  'bump',
  await p.evaluate(
    `(()=>{const g=window.__game,f=g.fpv();f.soc=0.8;const b=g.blds.find(b=>b.h>8);const c=b.c||b.center||[0,0];return JSON.stringify(Object.keys(b).slice(0,8))})()`,
  ),
);
console.log(
  'dive',
  await p.evaluate(
    `(()=>{const g=window.__game,f=g.fpv(),a=g.armor().list.find(a=>!a.dead);f.pos.set(a.g.position.x+0.5,12,a.g.position.z+0.5);f.vel.set(0,-14,0);f.w.set(0,0,0);for(let i=0;i<30&&f.active;i++)f.update(0.05);return [f.active,a.dead,JSON.stringify(g.lastBlast())]})()`,
  ),
);
// mobile
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const m = await ctx.newPage();
m.on('pageerror', e => errs.push(String(e)));
await m.goto('http://localhost:4173/DefendTaipei-Lab/');
await m.waitForFunction(() => window.__game, null, { timeout: 180000 });
await m.tap('.ch[data-g="f"]', { noWaitAfter: true, timeout: 120000 });
await m.waitForTimeout(3000);
await m.evaluate(
  `(()=>{const g=window.__game,q=g.roadPt();g.tp(q[0],q[1]);g.launchFPV();const f=g.fpv();f.ls.y=0.0;f.rs.y=-0.4})()`,
);
await m.waitForTimeout(2500);
console.log('mobile', await m.evaluate(st));
await m.screenshot({ path: '/workspace/defendtaipei-v14-fpv-mobile.png' });
console.log('errors', errs);
await b.close();
