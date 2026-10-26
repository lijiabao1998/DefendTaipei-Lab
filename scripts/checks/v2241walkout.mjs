// v22.4.1 every role × gender × skip-opening: from the real spawn beside the bed, walk out to the street through the
// home's door with the normal movement + collision (autopilot steers the input; no teleport, no unstuck nudges).
// argv: url outDir [parallel]
import { launch, pickRole } from '../lib.mjs';
const [url, out, par = '3'] = process.argv.slice(2);
const b = await launch();
const combos = [];
const only = process.env.ONLY;
for (const role of ['office', 'student', 'courier', 'nurse', 'tech'])
  for (const g of ['m', 'f']) for (const skip of [true, false]) combos.push({ role, g, skip });
const res = {};
async function run({ role, g, skip }) {
  const p = await b.newPage({ viewport: { width: 560, height: 360 } }); // small = faster headless frames
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url);
  await pickRole(p, { g, role, skipIntro: skip });
  await p.waitForFunction(() => window.__game?.started?.(), null, { timeout: 900000, polling: 1000 });
  if (skip) await p.waitForFunction(() => !document.getElementById('wake'), null, { timeout: 120000, polling: 500 });
  else await p.waitForTimeout(4000); // the morning prologue keeps running while we walk out
  await p.waitForTimeout(1500);
  const n = `${role}-${g}-${skip ? 'skip' : 'intro'}`;
  await p.screenshot({ path: `${out}/spawn-${n}.png` });
  const s0 = await p.evaluate(() => window.__game.autoState());
  const len = await p.evaluate(() => window.__game.autoWalk());
  let st,
    minDoor = 1e9,
    last = null,
    still = 0,
    opened = 0;
  await p.keyboard.down('ShiftLeft'); // run (headless frame rate makes walking slow in wall time)
  let lastI = 0,
    noProg = 0;
  for (let t = 0; t < 1200; t++) {
    await p.waitForTimeout(500);
    st = await p.evaluate(() => window.__game.autoState());
    if (st.door) minDoor = Math.min(minDoor, Math.hypot(st.p[0] - st.door[0], st.p[1] - st.door[1]));
    if (st.i >= st.n) break;
    // a closed door on the way: the prompt says [E] 開門, so press the interact key like a player would
    if (st.cd && /開門/.test(st.prompt)) {
      opened++;
      await p.keyboard.press('KeyE');
      continue;
    }
    if (st.i > lastI) ((lastI = st.i), (noProg = 0));
    else if (++noProg > 40) break; // 20 s without reaching the next waypoint = stuck
    last = st.p;
    still;
  }
  await p.screenshot({ path: `${out}/out-${n}.png` });
  res[n] = {
    path: len,
    out: st.i >= st.n && !st.inBld && st.road < 2.6,
    startOutside: !s0.inBld, // the courier wakes beside the scooter at the kerb
    viaDoor: minDoor < 1.2,
    doorsOpened: opened,
    minDoor: +minDoor.toFixed(2),
    nudges: st.nudges,
    stuckAt: st.i < st.n ? st.p.map(v => +v.toFixed(1)) : null,
    start: s0.p.map(v => +v.toFixed(1)),
    errs,
  };
  console.error(n, JSON.stringify(res[n]));
  await p.close();
}
const q = combos.filter(c => !only || `${c.role}-${c.g}` === only);
await Promise.all(
  Array.from({ length: +par }, async () => {
    while (q.length) await run(q.shift());
  }),
);
const all = Object.values(res);
console.log(
  JSON.stringify({
    pass: all.every(r => r.out && (r.viaDoor || r.startOutside) && r.nudges === 0 && !r.errs.length),
    n: all.length,
    res,
  }),
);
await b.close();
