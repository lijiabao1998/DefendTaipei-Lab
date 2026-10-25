// v21 whole-萬華區 streaming: walk across the district (tile load/unload must stay bounded), then shots of
// several areas (top-down + street-level zoom) and the M overview map. argv: url outPrefix
import { launch, pickRole } from '../lib.mjs';
const [url, pre] = process.argv.slice(2);
const SPOTS = process.env.SPOTS
  ? JSON.parse(process.env.SPOTS)
  : [
      ['nanjichang', 150, 1320],
      ['youthpark', 300, 1990],
      ['jialazai', -1000, 2120],
      ['wanda', -200, 1430],
      ['xiyuan', -600, 1100],
      ['longshan', -316, 440],
      ['redhouse', 380, -95],
    ];
const errs = [];
const b = await launch();
const p = await b.newPage({ viewport: { width: 1366, height: 820 } });
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'm', role: 'office' });
await p.waitForFunction(() => window.__game && !document.getElementById('wake'), null, {
  timeout: 900000,
  polling: 2000,
});
const G = s => p.evaluate(`(()=>{const g=window.__game;${s}})()`);
// snap to the nearest loaded road vertex around (x,z)
const go = async (x, z, wait) => {
  await G(`g.player.pos.set(${x},0,${z})`);
  await p.waitForTimeout(wait);
  await G(
    `let best=null,bd=1e9;for(const k of g.district.tiles.keys())for(const r of g.district.data.get(k).r)if(!/foot|path|steps/.test(r.t))for(const v of r.p){const d=Math.hypot(v[0]-(${x}),v[1]-(${z}));if(d<bd){bd=d;best=v}}if(best)g.player.pos.set(best[0],0,best[1]);`,
  );
};
// walk core → south edge
const walk = [];
for (let i = 0; i <= 24; i++) {
  const x = 0 + i * 12,
    z = 0 + i * 100;
  await G(`g.player.pos.set(${x},0,${z})`);
  await p.waitForTimeout(2500);
  walk.push(
    await G(
      `const d=g.district;return {x:${x},z:${z},loaded:d.tiles.size,loads:d.stats.loads,unloads:d.stats.unloads,sols:g.sols.length,conts:g.conts.length}`,
    ),
  );
}
console.log(JSON.stringify(walk));
const stats = await G(`const d=g.district;return {...d.stats,tilesInIndex:Object.keys(d.ix.tiles).length}`);
await p.mouse.move(683, 410);
for (const [nm, x, z] of SPOTS) {
  await go(x, z, 15000);
  await p.waitForTimeout(6000);
  await p.screenshot({ path: `${pre}-${nm}.png`, timeout: 120000 });
  for (let i = 0; i < 10; i++) await p.mouse.wheel(0, -100);
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${pre}-${nm}-street.png`, timeout: 120000 });
  for (let i = 0; i < 10; i++) await p.mouse.wheel(0, 100);
}
await p.keyboard.press('KeyM');
await p.waitForTimeout(4000);
await G(`const m=g.map;if(m){const b=m.d.bounds;m.revealRect(b.minx,b.minz,b.maxx,b.maxz);m.dirty=true;m.fit();}`);
await p.waitForTimeout(1500);
await p.screenshot({ path: `${pre}-map.png`, timeout: 120000 });
console.log(JSON.stringify({ stats, walk, errs }));
await b.close();
const maxLoaded = Math.max(...walk.map(w => w.loaded));
if (errs.length || maxLoaded > 40) process.exit(1);
