// v22.2 北都地下鐵: live fare gates, proper tracks, tunnel portals with flood gates, day-1 train service
// (deterministic timetable, door chime, boarding + riding between the 4 stations) and the power-out state.
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
const shot = n => p.screenshot({ path: `${out}/${n}.png`, timeout: 120000 });
const sts = await G(`return g.metro().map(s=>({name:s.name,gates:s.gates}))`);
const R = { exits: [], power0: await G('return g.UT.power') };
// every exit down and up (day 1, power on)
for (const [i, st] of sts.entries())
  for (const gt of st.gates) {
    await G(`g.tp(${gt.ent[0]},${gt.ent[1]})`);
    await p.waitForTimeout(300);
    const d = await G(`g.metroUse();const P=g.player.pos;return [P.x,P.z]`);
    await G(`g.tp(${gt.exit[0]},${gt.exit[1]})`);
    const u = await G(`g.metroUse();const P=g.player.pos;return [P.x,P.z]`);
    R.exits.push(
      `${st.name}${gt.no}:` +
        (Math.hypot(d[0] - gt.inn[0], d[1] - gt.inn[1]) < 1 && Math.hypot(u[0] - gt.ent[0], u[1] - gt.ent[1]) < 5),
    );
  }
const [x0, z0] = [sts[0].gates[0].inn[0] + 17, sts[0].gates[0].inn[1] + 4]; // station 0 local origin
const at = async (dx, dz, m, wait = 1500) => {
  if (m != null) await G(`g.setMin(${m})`);
  await G(`g.tp(${x0 + dx},${z0 + dz})`);
  await p.waitForTimeout(wait);
};
const base = 12 * 50; // a cycle boundary on day 1 (deterministic: phase = (gameMin + i*3) mod 12)
// gates (powered, a lane opening for the player)
await at(-1.6 + 0.8, 3.2, base + 9, 2500);
await shot('gates');
R.paddleOpen = await G(`return g.metroStats.power`);
// tracks / empty track between trains
await at(6, 24, base + 9.5);
await shot('tracks');
// train arriving
await at(-20, 25, base + 1.2, 400);
R.arriving = await G(`return g.svc(0, ${base + 1.2})`);
await shot('day1-train-arriving');
// doors open (chime) + board
const ch0 = await G('return g.metroStats.chimes');
await at(0, 26.5, base + 1.9, 300);
await G(`g.setMin(${base + 3})`);
await p.waitForTimeout(1500);
R.chimes = (await G('return g.metroStats.chimes')) - ch0;
await shot('day1-doors-open');
R.board = await G('return g.metroBoard()');
await G('g.openRide(0)');
await p.waitForTimeout(400);
await shot('ride-menu');
R.rideBtns = await p.$$eval('#ride button', a => a.map(x => x.textContent));
await p.click('#ride button[data-j="2"]');
await p.waitForTimeout(800);
await shot('ride-interior');
await p.waitForTimeout(3500);
R.afterRide = await G(`const P=g.player.pos;return {x:P.x,z:P.z,built:g.metro()[2].built}`);
const o2 = await G(`return [g.metro()[2].gates[0].inn[0]+17, g.metro()[2].gates[0].inn[1]+4]`);
R.rideOk = Math.hypot(R.afterRide.x - o2[0], R.afterRide.z - (o2[1] + 26.6)) < 2;
// tunnel mouth (powered: flood gate sunk, signals green)
await at(30, 25, base + 10);
await shot('tunnel-mouth-day1');
// power out: service stops, train parked, gates dead, flood gate down, maintenance gate open
await G('g.UT.power=false');
await at(30, 25, null, 2000);
await shot('tunnel-mouth-blackout');
R.parked = await G(`return g.metroBoard()`);
await at(40, 30, null, 1500);
await shot('tunnel-floodgate');
await at(0, 3.2, null, 1500);
await shot('gates-dead');
await at(6, 26, null, 1500);
await shot('train-parked');
console.log(JSON.stringify({ R, errs }));
await b.close();
