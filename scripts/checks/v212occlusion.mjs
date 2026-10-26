// v21.2 occlusion: stand the player right behind tall buildings (relative to the unchanged follow camera), in the
// core and in streamed district tiles, and shoot with the cutaway off / on. argv: url outPrefix
import { launch, pickRole } from '../lib.mjs';
const [url, pre] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'f', role: 'nurse', skipIntro: true });
await p.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
  timeout: 900000,
  polling: 2000,
});
const G = s => p.evaluate(`(()=>{const g=window.__game;${s}})()`);
// behind = beyond the building on the side away from the camera
const spots = await G(`
  const o=g.CAM_OFF, L=Math.hypot(o.x,o.z), dx=-o.x/L, dz=-o.z/L, out=[];
  const tall=g.blds.filter(b=>b.h>14&&Math.hypot(b.c[0],b.c[1])<260).sort((a,b)=>b.h-a.h);
  for(const b of tall){
    let r=2;for(;r<60;r+=0.5){const x=b.c[0]+dx*r,z=b.c[1]+dz*r;if(!b.pts||!(x>b.minx&&x<b.maxx&&z>b.minz&&z<b.maxz))break;}
    const x=b.c[0]+dx*(r+1.2), z=b.c[1]+dz*(r+1.2);
    if(g.escapeCheck(x,z,20).ok){out.push([x,z]);if(out.length>=3)break;}
  }
  return out;`);
spots.push([-600, 1100], [150, 1320]); // district: 西園路, 南機場
for (const [i, [x, z]] of spots.entries()) {
  await G(`g.tp(${x},${z})`);
  await p.waitForTimeout(i >= 3 ? 15000 : 4000);
  for (const on of [0, 1]) {
    await G(`g.OCC.force=${on}`);
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${pre}-${i}-${on ? 'on' : 'off'}.png`, timeout: 120000 });
  }
}
console.log(JSON.stringify({ spots, errs }));
await b.close();
if (errs.length) process.exit(1);
