// v22.1 北都地下鐵 polish: every exit of every station goes down (interior built lazily) and back up;
// screenshots of an entrance, the concourse, the gate line, the platform and the train.
// argv: url outDir
import { launch, pickRole } from '../lib.mjs';
const [url, out] = process.argv.slice(2);
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
const sts = await G(`return g.metro().map(s=>({name:s.name,gates:s.gates,loot:s.loot.length}))`);
const res = [];
for (const [i, st] of sts.entries()) {
  const r = { name: st.name, loot: st.loot, exits: [] };
  for (const gt of st.gates) {
    await G(`g.tp(${gt.ent[0]},${gt.ent[1]})`);
    if (i === 0 && gt.no === 1) {
      await p.waitForTimeout(9000);
      await p.screenshot({ path: `${out}/entrance.png`, timeout: 120000 });
    } else await p.waitForTimeout(800);
    const down = await G(`g.metroUse();const P=g.player.pos;return [P.x,P.z]`);
    const built = await G(`return g.metro()[${i}].built`);
    if (i === 0 && gt.no === 1) {
      const [x, z] = gt.inn;
      for (const [n, dx, dz] of [
        ['concourse', -10, 1],
        ['gates', 0, 6.5],
        ['platform', 6, 24],
        ['train', 6, 30.1],
      ]) {
        await G(`g.tp(${x - -17 + dx},${z + 4 + dz})`);
        await p.waitForTimeout(1500);
        await p.screenshot({ path: `${out}/${n}.png`, timeout: 120000 });
      }
    }
    await G(`g.tp(${gt.exit[0]},${gt.exit[1]})`);
    const up = await G(`g.metroUse();const P=g.player.pos;return [P.x,P.z]`);
    r.exits.push({
      no: gt.no,
      built,
      downOk: Math.hypot(down[0] - gt.inn[0], down[1] - gt.inn[1]) < 1,
      upOk: Math.hypot(up[0] - gt.ent[0], up[1] - gt.ent[1]) < 5,
    });
  }
  res.push(r);
}
const fps = await p.evaluate(
  () =>
    new Promise(r => {
      let n = 0;
      const t0 = performance.now();
      const f = () =>
        ++n < 60 ? requestAnimationFrame(f) : r(Math.round((60000 / (performance.now() - t0)) * 10) / 10);
      requestAnimationFrame(f);
    }),
);
console.log(JSON.stringify({ res, fps, errs }));
await b.close();
