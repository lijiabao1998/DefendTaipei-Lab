// v21.6 北都地下鐵: every station has a surface entrance, going down lands in the concourse,
// coming back up returns to the street; screenshots of entrance / concourse / platform / train.
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
const sts = await G(`return g.metro().map(s=>({name:s.name,ent:s.ent,inn:s.inn,exit:s.exit,loot:s.loot.length}))`);
const res = [];
for (const [i, st] of sts.entries()) {
  await G(`g.tp(${st.ent[0]},${st.ent[1]})`);
  await p.waitForTimeout(i === 0 ? 8000 : 4000);
  if (i < 2) await p.screenshot({ path: `${out}/entrance-${i}.png`, timeout: 120000 });
  const down = await G(`g.metroUse();const P=g.player.pos;return [P.x,P.z]`);
  await p.waitForTimeout(1500);
  if (i === 0) {
    await p.screenshot({ path: `${out}/concourse.png`, timeout: 120000 });
    await G(`g.tp(${st.inn[0]},${st.inn[1] + 19})`);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/platform.png`, timeout: 120000 });
    await G(`g.tp(${st.inn[0] + 6},${st.inn[1] + 28.8})`);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/train.png`, timeout: 120000 });
  }
  await G(`g.tp(${st.exit[0]},${st.exit[1]})`);
  const up = await G(`g.metroUse();const P=g.player.pos;return [P.x,P.z]`);
  res.push({
    name: st.name,
    loot: st.loot,
    downOk: Math.hypot(down[0] - st.inn[0], down[1] - st.inn[1]) < 1,
    upOk: Math.hypot(up[0] - st.ent[0], up[1] - st.ent[1]) < 5,
  });
}
console.log(JSON.stringify({ res, errs }));
await b.close();
