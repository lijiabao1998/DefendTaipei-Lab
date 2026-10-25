import { launch, shot, gameUrl, pickRole, devices } from '../lib.mjs';
const url = gameUrl(process.argv[2]);
const errs = [];
const b = await launch();
for (const [tag, dev] of [
  ['desk', { viewport: { width: 1366, height: 820 } }],
  ['phone', devices['iPhone 13']],
]) {
  const ctx = await b.newContext(dev);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => window.__game, null, { timeout: 240000 });
  const ph = tag === 'phone';
  await pickRole(p, { g: 'm' });
  await p.waitForTimeout(3000);
  await p.evaluate(
    `(()=>{const g=window.__game,m=g.map;for(let k=0;k<30;k++){const x=g.player.pos.x+Math.cos(k*.4)*k*4,z=g.player.pos.z+Math.sin(k*.4)*k*4;m.reveal(x,z)};const B=m.d.bounds;m.revealRect(B.minx,B.minz,B.minx+(B.maxx-B.minx)/3,B.minz+(B.maxz-B.minz)/3);m.d.outposts().forEach((c,i)=>i<4&&m.intel('out'+i,c[0],c[1],'out','解放軍哨點'));const P=g.player.pos;m.notes.push({x:P.x+30,z:P.z+10,k:'sup'},{x:P.x-25,z:P.z+40,k:'dng'},{x:P.x+10,z:P.z-35,k:'safe'});m.intel('i1',P.x+50,P.z-20,'intel','線民：巷口有暗哨');g.liberate&&g.liberate(2)})()`,
  );
  if (ph) await p.tap('#mapbtn', { noWaitAfter: true });
  else await p.keyboard.press('KeyM');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: shot(`v15-map-${tag}-a.png`) });
  await p.evaluate(`window.__game.map.zoomAt(2.2,innerWidth/2,innerHeight/2)`);
  await p.waitForTimeout(800);
  await p.screenshot({ path: shot(`v15-map-${tag}-b-zoom.png`) });
  await p.mouse.click(ph ? 120 : 500, ph ? 400 : 450);
  await p.waitForTimeout(600);
  await p.screenshot({ path: shot(`v15-map-${tag}-c-note.png`) });
  await p.evaluate(`window.__game.map.zoomAt(0.3,innerWidth/2,innerHeight/2)`);
  await p.waitForTimeout(800);
  await p.screenshot({ path: shot(`v15-map-${tag}-d-overview.png`) });
  await ctx.close();
}
console.log('errs', errs);
await b.close();
