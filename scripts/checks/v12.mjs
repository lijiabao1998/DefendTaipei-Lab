import { launch, shot, gameUrl, pickRole, devices } from '../lib.mjs';
const b = await launch();
const errs = [];
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => errs.push(String(e)));
await p.goto(gameUrl());
await p.waitForFunction(() => window.__game, null, { timeout: 180000 });
await pickRole(p, { g: 'f' });
await p.waitForTimeout(3000);
// recon drone overhead
await p.evaluate(`(()=>{const g=window.__game,r=g.recon().list[0];g.tp(r.g.position.x+6,r.g.position.z+6)})()`);
await p.evaluate(
  `(()=>{const g=window.__game,q=g.roadPt(),d=g.recon().list[0];d.r=10;for(let i=0;i<70;i++){g.player.pos.set(q[0],0,q[1]);d.c=[q[0],q[1]];g.recon().update(0.05,i*0.05)}console.log('spot',d.cd,g.shells.length)})()`,
);
console.log('spotted?', await p.evaluate(`[window.__game.recon().list[0].cd, window.__game.shells.length]`));
await p.waitForTimeout(1500);
await p.screenshot({ path: shot('v12-drone-recon.png') });
await p.evaluate(
  `(()=>{const g=window.__game,P=g.player.pos.clone();for(let i=0;i<200;i++){g.recon().update(0.05,i*0.05);g.player.pos.copy(P);g.sim(1)}})()`,
);
await p.waitForTimeout(800);
console.log(
  'after recon exposure hp',
  await p.evaluate(
    `[window.__game.player.hp, JSON.stringify(window.__game.recon().list.map(d=>[d.spot,d.cd,d.g.position.toArray().map(Math.round)])), window.__game.player.pos.toArray().map(Math.round), window.__game.shells.length, document.querySelector('#log').innerText.slice(0,200)]`,
  ),
);
await p.screenshot({ path: shot('v12-drone-artillery.png') });
// crafting
await p.evaluate(
  `(()=>{const g=window.__game;g.player.hp=100;for(const [k,n] of [['frame',1],['dmotor',4],['lipo',1],['vtx',1],['grenade',1]])g.addItem(k,n);g.toggleInv()})()`,
);
await p.waitForTimeout(800);
await p.screenshot({ path: shot('v12-drone-craft.png') });
await p.keyboard.press('Tab');
// launch near an armour vehicle and fly
await p.evaluate(
  `(()=>{const g=window.__game,a=g.armor().list[1];a.stop=999;g.tp(a.g.position.x+25,a.g.position.z+25);g.launchFPV()})()`,
);
await p.keyboard.down('KeyW');
await p.waitForTimeout(1500);
await p.keyboard.up('KeyW');
await p.waitForTimeout(800);
await p.screenshot({ path: shot('v12-drone-fpv.png') });
console.log(
  'fpv',
  await p.evaluate(
    `(()=>{const f=window.__game.fpv();return [f.active,f.pos.y.toFixed(1),f.sig.toFixed(2),f.batt.toFixed(0)]})()`,
  ),
);
// weak signal look
await p.evaluate(
  `(()=>{const f=window.__game.fpv();const P=window.__game.player.pos;f.pos.set(P.x+330,40,P.z+10);f.vel.set(0,0,0)})()`,
);
await p.waitForTimeout(1500);
await p.screenshot({ path: shot('v12-drone-static.png') });
// dive onto armour roof
await p.evaluate(
  `(()=>{const g=window.__game,f=g.fpv(),a=g.armor().list[1];f.pos.set(a.g.position.x+1,14,a.g.position.z+1);f.vel.set(-0.6,-15,-0.6);f.q.setFromEuler(new f.cam.rotation.constructor(-1.1,Math.PI*0.75,0,'YXZ'));g.sim(8)})()`,
);
await p.waitForTimeout(600);
await p.screenshot({ path: shot('v12-drone-dive.png') });
await p.evaluate(`window.__game.sim(40)`);
console.log(
  'after dive',
  await p.evaluate(
    `[JSON.stringify(window.__game.lastBlast()), window.__game.armor().list[1].g.position.toArray(),window.__game.fpv().active, window.__game.armor().list[1].dead]`,
  ),
);
await p.evaluate(`(()=>{const g=window.__game,a=g.armor().list[1];g.tp(a.g.position.x+9,a.g.position.z+9)})()`);
await p.waitForTimeout(3000);
await p.screenshot({ path: shot('v12-drone-kill.png') });
// mobile dual sticks
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const m = await ctx.newPage();
m.on('pageerror', e => errs.push(String(e)));
await m.goto(gameUrl());
await m.waitForFunction(() => window.__game, null, { timeout: 180000 });
await pickRole(m, { g: 'f' });
await m.waitForTimeout(3000);
await m.evaluate(`(()=>{const g=window.__game,q=g.roadPt();g.tp(q[0],q[1]);g.launchFPV()})()`);
await m.waitForTimeout(2500);
await m.screenshot({ path: shot('v12-drone-mobile.png') });
console.log('mobile log', await m.evaluate(`document.querySelector('#log')?.innerText.slice(0,300)`));
console.log(
  'mobile fpv',
  await m.evaluate(`[window.__game.fpv().active, document.querySelectorAll('.fstick').length]`),
);
console.log('errors', errs);
await b.close();
