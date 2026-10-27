// determinism + validation + delta round-trip test for src/core/sim/core.ts (run: node --experimental-strip-types)
import { newState, addPlayer, applyCmd, step, hash, diff, patch, clone } from '../src/core/sim/core.ts';
const run = () => {
  const s = newState(1234, 0, 0, 10);
  addPlayer(s, 'a', 'A', 'courier', 'm', 0, 0);
  addPlayer(s, 'b', 'B', 'nurse', 'f', 3, 0);
  let seq = 0;
  for (let t = 0; t < 600; t++) {
    applyCmd(s, 'a', { t: 'move', seq: ++seq, x: s.players.a.x + 0.25, z: s.players.a.z });
    applyCmd(s, 'b', { t: 'move', seq, x: s.players.b.x, z: s.players.b.z + 0.2 });
    step(s);
  }
  return s;
};
const h1 = hash(run()),
  h2 = hash(run());
console.log('determinism', h1, h2, h1 === h2);
const s = newState(1, 0, 0, 2);
addPlayer(s, 'a', 'A', 'x', 'm', 0, 0);
console.log('speedhack', applyCmd(s, 'a', { t: 'move', seq: 1, x: 50, z: 0 }), s.players.a.x);
console.log('stale', applyCmd(s, 'a', { t: 'move', seq: 1, x: 0, z: 0 }));
console.log('far attack', applyCmd(s, 'a', { t: 'attack', seq: 2, target: 0 }));
console.log(
  'loot far',
  applyCmd(s, 'a', { t: 'loot', seq: 3, id: 'c1', x: 40, z: 0 }),
  'loot ok',
  applyCmd(s, 'a', { t: 'loot', seq: 4, id: 'c1', x: 0.5, z: 0 }),
  'loot again',
  applyCmd(s, 'a', { t: 'loot', seq: 5, id: 'c1', x: 0.5, z: 0 }),
);
for (const n of 'bcd') addPlayer(s, n, n, 'x', 'm', 0, 0);
console.log('5th', addPlayer(s, 'e', 'e', 'x', 'm', 0, 0));
const base = clone(s);
for (let i = 0; i < 40; i++) step(s);
const d = diff(base, s);
const c = clone(base);
patch(c, d);
console.log(
  'delta roundtrip',
  hash(c) === hash(s),
  'delta bytes',
  JSON.stringify(d).length,
  'snap bytes',
  JSON.stringify(s).length,
);
