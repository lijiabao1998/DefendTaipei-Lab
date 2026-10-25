import { launch, shot, gameUrl, pickRole } from '../lib.mjs';
const b = await launch();
const errs = [];
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => errs.push(String(e)));
await p.goto(gameUrl());
await p.waitForFunction(() => window.__game, null, { timeout: 180000 });
await pickRole(p, { g: 'f' });
await p.waitForTimeout(3000);
const info = await p.evaluate(
  `window.__game.armor().list.map(a=>[a.kind,a.g.position.x.toFixed(0),a.g.position.z.toFixed(0)]).concat([['wrecks',window.__game.armor().wrecks.length]])`,
);
console.log(JSON.stringify(info));
for (let i = 0; i < 4; i++) {
  await p.evaluate(
    `(()=>{const g=window.__game,a=g.armor().list[${i}];if(!a)return;a.stop=999;g.tp(a.g.position.x+9,a.g.position.z+9)})()`,
  );
  await p.waitForTimeout(3500);
  await p.screenshot({ path: shot(`v11-armor-${i}.png`) });
}
const hp0 = await p.evaluate(`window.__game.player.hp`);
await p.waitForTimeout(3000);
console.log('hp under fire', hp0, await p.evaluate(`window.__game.player.hp`));
await p.screenshot({ path: shot('v11-armor-firing.png') });
await p.evaluate(
  `(()=>{const g=window.__game,A=g.armor(),a=A.list[0];console.log(A.hit(a.g.position.x,a.g.position.z,50,false));A.hit(a.g.position.x,a.g.position.z,200,true);g.player.hp=100;g.tp(a.g.position.x+10,a.g.position.z+10)})()`,
);
await p.waitForTimeout(3500);
await p.screenshot({ path: shot('v11-armor-destroyed.png') });
await p.evaluate(`(()=>{const g=window.__game,w=g.armor().wrecks[0];g.tp(w.position.x+8,w.position.z+8)})()`);
await p.waitForTimeout(3500);
await p.screenshot({ path: shot('v11-armor-wreck.png') });
console.log('dead', await p.evaluate(`window.__game.armor().list[0].dead`), 'errors', errs);
await b.close();
