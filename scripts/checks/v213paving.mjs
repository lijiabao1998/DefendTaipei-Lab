// v21.3 paving: stand on sidewalks next to roads (core + streamed district) and shoot. argv: url outPrefix [spotsJSON]
// Without spotsJSON, spots are picked with __game.roadDist (needs a v21.3+ build) and printed for a before/after rerun.
import { launch, pickRole } from '../lib.mjs';
const [url, pre, given] = process.argv.slice(2);
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
const spots = given
  ? JSON.parse(given)
  : await G(`
  const out=[];let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647;
  for(let i=0;i<20000&&out.length<4;i++){const x=(r()-0.5)*400,z=(r()-0.5)*400,d=g.roadDist(x,z);
    if(d>0.9&&d<1.6&&g.escapeCheck(x,z,10).ok&&!out.some(q=>Math.hypot(q[0]-x,q[1]-z)<60))out.push([x,z]);}
  return out;`);
if (!given) spots.push([-600, 1100], [150, 1320]);
for (const [i, [x, z]] of spots.entries()) {
  await G(`g.tp(${x},${z})`);
  await p.waitForTimeout(i >= 4 ? 15000 : 4000);
  await p.screenshot({ path: `${pre}-${i}.png`, timeout: 120000 });
}
console.log(JSON.stringify({ spots, errs }));
await b.close();
if (errs.length) process.exit(1);
