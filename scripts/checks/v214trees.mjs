// v21.4 screenshots: park trees, street trees, and the player in cover firing at a soldier. argv: url outDir
import { launch, pickRole } from '../lib.mjs';
const [url, out] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'm', role: 'office', skipIntro: true });
await p.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
  timeout: 900000,
  polling: 2000,
});
const G = s => p.evaluate(`(()=>{const g=window.__game;${s}})()`);
const park = await G(`const c=g.parks()?.clusters||[];return c[0]||null`);
const shots = [];
if (park) shots.push(['park-core', park]);
shots.push(['park-district', [150, 1320]], ['street-1', [126.7, -103.2]], ['street-2', [108.6, 178.3]]);
for (const [n, [x, z]] of shots) {
  await G(`g.tp(${x},${z})`);
  await p.waitForTimeout(n.includes('district') ? 15000 : 5000);
  await p.screenshot({ path: `${out}/${n}.png`, timeout: 120000 });
}
// cover: put a sandbag line next to the player, a soldier 10 m out, take cover and fire
const r = await G(`
  const P=g.player.pos, x=P.x, z=P.z;
  g.addSeg({a:[x+0.6,z-1.2],b:[x+0.6,z+1.2],h:1.0}, true);
  g.toggleCover();
  const s=g.sols.find(s=>s.state!=='dead'); if(s){s.pos.set(x+10,0,z);s.state='combat';s.alert=1;}
  g.addItem && g.addItem('rifle',1);
  return {cover:!!g.player.cover, low:g.player.cover?.low};`);
await p.waitForTimeout(4000);
await p.screenshot({ path: `${out}/cover.png`, timeout: 120000 });
console.log(JSON.stringify({ r, stats: await G('return g.coverStats'), errs }));
await b.close();
