import { build } from 'esbuild';
import assert from 'node:assert/strict';
async function load(file) {
  const out = await build({ entryPoints: [file], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}
const data = new Map();
globalThis.localStorage = {
  getItem: k => data.get(k) || null,
  setItem: (k, v) => data.set(k, v),
  removeItem: k => data.delete(k),
};
const s = await load('src/systems/save.ts');
const keys = [s.GAME_SAVE_KEY, s.DISTRICT_TILES_KEY, s.ROAD_TILES_KEY, s.MAP_SAVE_KEY];
keys.forEach(k => data.set(k, 'sentinel'));
s.setMultiplayerSession(true);
s.clearSave();
s.clearRoadTiles();
s.writeSave({});
s.writeDistrictTiles({});
s.writeRoadTiles({});
s.writeMapSave({ n: [], f: '' });
assert.ok(keys.every(k => data.get(k) === 'sentinel'));
s.setMultiplayerSession(false);
s.clearSave();
assert.equal(data.has(s.GAME_SAVE_KEY), false);
const core = await load('src/core/sim/core.ts');
const state = core.newState(1);
assert.equal(core.addPlayer(state, 'a', 'A', 'courier', 'm', Infinity, 0), 'invalid position');
core.addPlayer(state, 'a', 'A', 'courier', 'm', 0, 0);
assert.equal(core.applyCmd(state, 'a', { t: 'move', seq: Infinity, x: 0, z: 0 }), 'stale');
assert.equal(core.applyCmd(state, 'a', { t: 'loot', seq: 1, id: 'loot', x: NaN, z: 0 }), 'nan');
assert.deepEqual(state.looted, {});
console.log('PASS: multiplayer save isolation, solo writes restored, invalid position/sequence/loot rejected');
// Client delta baseline regression: later deltas may refer to an older acknowledged tick.
globalThis.sessionStorage = localStorage;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ token: 'test' }) });
class Socket {
  readyState = 1;
  sent = [];
  constructor() {
    Socket.last = this;
  }
  send(s) {
    this.sent.push(JSON.parse(s));
  }
  close() {
    this.readyState = 3;
  }
}
globalThis.WebSocket = Socket;
const { Net } = await load('src/net/net.ts');
const net = new Net('http://example.test');
await net.join('ABCDE', { name: 'A', role: 'courier', g: 'm', x: 0, z: 0 });
const ws = Socket.last;
const first = core.newState(1, 0, 0, 0);
core.addPlayer(first, 'a', 'A', 'courier', 'm', 0, 0);
ws.onmessage({ data: JSON.stringify({ k: 'snap', tick: 0, you: 'a', s: first }) });
ws.onmessage({ data: JSON.stringify({ k: 'delta', base: 0, tick: 1, p: { a: { x: 1 } } }) });
ws.onmessage({ data: JSON.stringify({ k: 'delta', base: 0, tick: 2, p: { a: { z: 2 } } }) });
assert.equal(net.s.players.a.x, 0);
assert.equal(net.s.players.a.z, 2);
ws.onmessage({ data: JSON.stringify({ k: 'delta', base: 900, tick: 901 }) });
assert.equal(net.s.tick, 2);
assert.equal(ws.sent.at(-1).tick, -1);
net.leave();
assert.equal(net.s, null);
assert.equal(net.states.size, 0);
console.log('PASS: exact acknowledged delta baseline, resync on missing baseline, leave cleanup');

const items = await load('src/systems/items.ts');
assert.equal(items.ITEMS.hammer.kind, 'melee');
assert.ok(items.ITEMS.hammer.dmg > 0);
assert.equal(core.applyCmd(state, 'a', { t: 'equip', seq: 2, weapon: 'hammer' }), '');
assert.equal(state.players.a.weapon, 'hammer');
assert.equal(core.applyCmd(state, 'a', { t: 'equip', seq: 3, weapon: 'water' }), 'invalid weapon');
assert.equal(state.players.a.weapon, 'hammer');
console.log('PASS: hammer is equippable and non-weapons cannot be replicated as equipment');
const waiting = core.newState(7, 0, 0, 1);
core.addPlayer(waiting, 'host', 'Host', 'courier', 'm', 0, 0);
Object.assign(waiting.enemies[0], { x: 0, z: 0, hx: 0, hz: 0 });
for (let i = 0; i < 400; i++) core.step(waiting, core.roomReady(waiting));
assert.equal(waiting.players.host.hp, 100);
assert.equal(waiting.tick, 400);
core.addPlayer(waiting, 'guest', 'Guest', 'courier', 'm', 1, 0);
for (let i = 0; i < 30; i++) core.step(waiting, core.roomReady(waiting));
assert.ok(waiting.players.host.hp < 100);
waiting.players.guest.on = false;
const frozenHp = waiting.players.host.hp;
for (let i = 0; i < 30; i++) core.step(waiting, core.roomReady(waiting));
assert.equal(waiting.players.host.hp, frozenHp);
console.log('PASS: waiting for two loaded players freezes combat, join resumes, disconnect pauses');
